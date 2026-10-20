#!/usr/bin/env python3
"""项目唯一 Experience Preview 入口（Docker Compose 编排）。

入口按命令行 ``--entity`` 选择一个 Project Facts UI entity，只调用 tracked
``compose.yaml`` 中已由 ``coding.preview.prepare`` 静态声明的对应 service，完成
loopback 健康回读，并将本次结果写入 ignored 的
``experience/preview/runtime/last-run.json``。可选 sync 由 ``--sync`` 开启，作为
宿主子进程运行 tracked ``sync.sh``，只把当前 checkout fast-forward 到 exact origin
branch；它复用运行环境已有的 git 授权，入口不读取、生成或注入任何凭证。

本入口不建立 entity-local Preview、HTTP mock 或第二 runtime，不挂载 Docker
socket，不读取本机配置文件，不把凭证放入 tracked 文件、容器环境或运行结果。
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import http.client
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time
from typing import Any, Iterator
import urllib.parse


MINIMUM_PYTHON = (3, 10)
ENTITY_ID = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
SCENARIO_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
PLACEHOLDER = re.compile(r"\{([^{}]+)\}")
BRANCH_NAME = re.compile(r"^[A-Za-z0-9._][A-Za-z0-9._/-]{0,254}$")
URL_PREFIX = re.compile(r"^(?:[^/\s:@]*:)?/*")
AUTHORITY_END = re.compile(r"[/?#]")
UNPRINTABLE = re.compile(r"[^\x21-\x7e]")
UNSAFE_PROJECT_CHARS = re.compile(r"[^a-z0-9_-]+")
LOOPBACK_HOST = "127.0.0.1"
CONTAINER_HOST = "0.0.0.0"
CONTAINER_PORT = 5173
RUNTIMES = ("docker", "local")
DEFAULT_RUNTIME = "docker"
COMPOSE_PORT_PUBLISHER = f"{LOOPBACK_HOST}:${{PREVIEW_PORT:-}}:{CONTAINER_PORT}"
PORT_MINIMUM = 1024
PORT_MAXIMUM = 65535
MINIMUM_NODE = (20, 19)
LOCAL_LOG_MAX_CHARS = 8000
LOCAL_STOP_TIMEOUT_SECONDS = 5
LOCAL_INSTALL_TIMEOUT_SECONDS = 1800
PACKAGE_MANAGER_LOCKFILES = {
    "pnpm": ("pnpm-lock.yaml",),
    "npm": ("package-lock.json", "npm-shrinkwrap.json"),
    "yarn": ("yarn.lock",),
}
PACKAGE_MANAGER_INSTALL = {
    "pnpm": ["install", "--frozen-lockfile"],
    "npm": ["ci"],
    "yarn": ["install", "--immutable"],
}
SERVICE_LOG_TAIL_LINES = 80
SERVICE_LOG_MAX_CHARS = 8000
PREVIEW_CONTAINER_SUPERVISOR = r"""if (($# == 0)); then
  printf '%s\n' 'experience-preview-supervisor: 缺少 Preview command' >&2
  exit 64
fi
command_name=${1##*/}
command_name=${command_name,,}
enable_corepack_command() {
  local manager=$1
  local preview_bin=${COREPACK_HOME:-/var/cache/preview/corepack}/bin
  mkdir -p "$preview_bin" || {
    status=$?
    printf 'experience-preview-supervisor: %s shim目录准备失败：exit=%s\n' "$manager" "$status" >&2
    exit "$status"
  }
  corepack enable --install-directory "$preview_bin" "$manager" || {
    status=$?
    printf 'experience-preview-supervisor: %s shim准备失败：exit=%s\n' "$manager" "$status" >&2
    exit "$status"
  }
  PATH="$preview_bin:$PATH"
  export PATH
}
case "$command_name" in
  pnpm|pnpm.bat|pnpm.cmd|pnpm.exe)
    if [[ ! -f pnpm-lock.yaml ]]; then
      printf '%s\n' 'experience-preview-supervisor: pnpm Preview command 缺少 working directory 内的 pnpm lockfile' >&2
      exit 64
    fi
    corepack pnpm install --frozen-lockfile || {
      status=$?
      printf 'experience-preview-supervisor: pnpm 依赖安装失败：exit=%s\n' "$status" >&2
      exit "$status"
    }
    enable_corepack_command pnpm
    ;;
  npm|npm.bat|npm.cmd|npm.exe)
    if [[ ! -f package-lock.json && ! -f npm-shrinkwrap.json ]]; then
      printf '%s\n' 'experience-preview-supervisor: npm Preview command 缺少 working directory 内的 npm lockfile' >&2
      exit 64
    fi
    npm ci || {
      status=$?
      printf 'experience-preview-supervisor: npm 依赖安装失败：exit=%s\n' "$status" >&2
      exit "$status"
    }
    ;;
  yarn|yarn.bat|yarn.cmd|yarn.exe)
    if [[ ! -f yarn.lock ]]; then
      printf '%s\n' 'experience-preview-supervisor: yarn Preview command 缺少 working directory 内的 yarn lockfile' >&2
      exit 64
    fi
    corepack yarn install --immutable || {
      status=$?
      printf 'experience-preview-supervisor: yarn 依赖安装失败：exit=%s\n' "$status" >&2
      exit "$status"
    }
    enable_corepack_command yarn
    ;;
esac
if ! command -v -- "$1" >/dev/null 2>&1; then
  printf 'experience-preview-supervisor: Preview command 不存在：%s\n' "$1" >&2
  exit 127
fi
exec "$@"
"""
COMPOSE_REPO_ROOT = (
    "${PREVIEW_REPO_ROOT:?experience/preview/start.py 必须注入 PREVIEW_REPO_ROOT}"
)
COMPOSE_SCENARIO = (
    "${PREVIEW_SCENARIO:?experience/preview/start.py 必须注入 PREVIEW_SCENARIO}"
)
LOOPBACK_PUBLISHERS = {"127.0.0.1", "::1", "[::1]", "localhost"}
HIDDEN_VALUE = "<已隐藏：取值含空白、控制字符或非 ASCII 字符，无法安全定位凭证>"
PROJECT_FILES = {"compose.yaml", "start.py", "sync.sh"}
LOCAL_OBJECTS = {"runtime"}
RETIRED_LOCAL_OBJECTS = {".env", ".env.example", ".netrc"}
EXACT_IGNORES = {"/experience/preview/runtime/"}
SYNC_LOG_MAX_CHARS = 4000
SYNC_PREFLIGHT_TIMEOUT_SECONDS = 60
SYNC_STOP_TIMEOUT_SECONDS = 5
EXPECTED_FIELDS = {
    "owner_code_unit_id",
    "port_path",
    "scenario_provider_path",
    "production_entrypoint",
    "scenario_entrypoint",
    "preview_entrypoint",
    "working_directory",
    "preview_command",
    "healthcheck_path",
    "toolchain_requirements",
}
CREDENTIAL_ARGUMENT = re.compile(
    r"(?:^|[-_])(?:token|password|passwd|secret|credential|api[-_]?key)"
    r"(?:$|[=_-])",
    re.IGNORECASE,
)
SAFE_HOST_ENV = {
    "COMSPEC",
    "DOCKER_CONTEXT",
    "DOCKER_HOST",
    "HOME",
    "LANG",
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "XDG_RUNTIME_DIR",
}
SHELL_WRAPPERS = {"bash", "cmd", "cmd.exe", "powershell", "pwsh", "sh", "zsh"}
DENIED_INSTALLERS = {"apt", "apt-get", "brew", "choco", "dnf", "pip", "pip3", "sudo", "yum"}
EXIT_OK = 0
EXIT_CONFIG = 2
EXIT_ENVIRONMENT = 3
EXIT_RUNTIME = 4
SOURCE_DIGEST_IDENTITY = b"wf-prod.experience-preview-source/v1\0"
RUNTIME_DECISION_DIGEST_IDENTITY = b"wf-prod.experience-preview-decisions/v1\0"
SOURCE_FIXED_PATHS = {
    ".gitignore",
    "experience/preview/compose.yaml",
    "experience/preview/start.py",
    "experience/preview/sync.sh",
}
RUNTIME_DECISION_ROOTS = (
    ".gitignore",
    "experience/preview",
    "facts/entities",
)
SOURCE_BINDING_PATH_FIELDS = (
    "port_path",
    "scenario_provider_path",
    "production_entrypoint",
    "scenario_entrypoint",
    "preview_entrypoint",
    "working_directory",
)


class PreviewError(RuntimeError):
    def __init__(
        self,
        message: str,
        code: int = EXIT_CONFIG,
        *,
        preserve_runtime_result: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        # 另一个存活的 Preview 拥有 last-run.json 时，本次失败不得覆盖它的结果。
        self.preserve_runtime_result = preserve_runtime_result


class PreviewInterrupted(RuntimeError):
    """入口安装的 stop handler 已观察到信号。"""


class PreviewUsageError(RuntimeError):
    """命令行参数缺失或非法；调用方打印完整用法后以配置错误退出。"""


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def reject_duplicate_json_keys(
    pairs: list[tuple[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"重复 JSON key：{key}")
        result[key] = value
    return result


def reject_json_constant(value: str) -> Any:
    raise ValueError(f"JSON 不允许非有限数字：{value}")


def git_bytes(repo: Path, arguments: list[str]) -> bytes:
    try:
        outcome = subprocess.run(
            ["git", "-C", str(repo), *arguments],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except OSError as error:
        raise PreviewError(f"无法执行 git：{error}", EXIT_ENVIRONMENT) from error
    if outcome.returncode != 0:
        detail = outcome.stderr.decode("utf-8", errors="replace").strip()
        raise PreviewError(
            f"git {' '.join(arguments)} 失败：{detail}",
            EXIT_ENVIRONMENT,
        )
    return outcome.stdout


def git_output(repo: Path, arguments: list[str]) -> str:
    return git_bytes(repo, arguments).decode("utf-8", errors="surrogateescape").strip()


def optional_git_output(repo: Path, arguments: list[str]) -> str:
    try:
        return git_output(repo, arguments)
    except PreviewError:
        return ""


def registered_worktrees(inventory: str) -> list[str]:
    """``git worktree list --porcelain -z`` 中全部非 bare 登记的路径，按原始顺序。"""

    paths: list[str] = []
    path: str | None = None
    bare = False
    # 每条登记以空字段结束；末尾补一个空字段，使最后一条也按同一规则收尾。
    for field in [*inventory.split("\0"), ""]:
        if field == "bare":
            bare = True
        elif not field or field.startswith("worktree "):
            if path is not None and not bare:
                paths.append(path)
            path = field[len("worktree ") :] if field else None
            bare = False
    return paths


def is_physical_match(registered: str, root: Path) -> bool:
    if not os.path.isabs(registered):
        return False
    try:
        return Path(registered).resolve() == root
    except (OSError, RuntimeError):
        return False


def git_facts(start: Path) -> dict[str, str]:
    root = Path(git_output(start, ["rev-parse", "--show-toplevel"])).resolve()
    inventory = git_bytes(root, ["worktree", "list", "--porcelain", "-z"]).decode(
        "utf-8", errors="surrogateescape"
    )
    # session workspace 可以是 main 或 linked worktree，判断只依据 Git 原生登记：
    # physical top-level 必须恰好对应 inventory 中一个非 bare 登记。
    registered = registered_worktrees(inventory)
    if sum(is_physical_match(path, root) for path in registered) != 1:
        raise PreviewError(
            "Preview 只能在 session workspace 运行：当前目录不是已登记 worktree 的 "
            "top-level（须恰好对应 git worktree list 中一个非 bare 登记）；"
            f"current={root} registered={registered}；请从已登记 worktree 的根目录启动",
            EXIT_ENVIRONMENT,
        )
    # remote get-url 已在本地应用 url.<base>.insteadOf；普通 Preview 不调用远端命令。
    effective = optional_git_output(root, ["remote", "get-url", "origin"])
    return {
        "repo_root": str(root),
        "source_sha": git_output(root, ["rev-parse", "HEAD"]),
        "branch": optional_git_output(
            root, ["symbolic-ref", "--quiet", "--short", "HEAD"]
        ),
        "origin_url": effective,
    }


def source_roots(
    selected: list[tuple[str, dict[str, Any]]],
) -> list[str]:
    roots = set(SOURCE_FIXED_PATHS)
    for entity_id, binding in selected:
        roots.add(f"facts/entities/{entity_id}.yaml")
        for field in SOURCE_BINDING_PATH_FIELDS:
            roots.add(safe_path(binding[field], f"{entity_id}.{field}"))
    return sorted(roots)


def git_source_paths(repo: Path, arguments: list[str], roots: list[str]) -> set[str]:
    raw = git_bytes(
        repo,
        ["--literal-pathspecs", "ls-files", *arguments, "-z", "--", *roots],
    )
    return {
        os.fsdecode(relative)
        for relative in raw.split(b"\0")
        if relative
    }


def source_status(repo: Path, roots: list[str]) -> bytes:
    return git_bytes(
        repo,
        [
            "--literal-pathspecs",
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--",
            *roots,
        ],
    )


def source_stat_identity(value: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


@contextmanager
def source_parent(repo: Path, relative: str) -> Iterator[tuple[int, str]]:
    """Open an input parent without following any project-internal ancestor symlink."""

    pure = PurePosixPath(relative)
    if (
        pure.is_absolute()
        or not pure.parts
        or any(part in {"", ".", ".."} for part in pure.parts)
    ):
        raise PreviewError(f"Preview source input 路径不安全：{relative!r}")
    flags = (
        os.O_RDONLY
        | getattr(os, "O_DIRECTORY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_CLOEXEC", 0)
    )
    descriptors: list[int] = []
    try:
        try:
            descriptor = os.open(repo, flags)
        except OSError as error:
            raise PreviewError(f"无法打开 Preview source root：{error}") from error
        descriptors.append(descriptor)
        for part in pure.parts[:-1]:
            try:
                child = os.open(part, flags, dir_fd=descriptor)
            except FileNotFoundError:
                raise
            except OSError as error:
                raise PreviewError(
                    f"Preview source input ancestor 不是安全普通目录：{relative}"
                ) from error
            descriptors.append(child)
            descriptor = child
        yield descriptor, pure.parts[-1]
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


def source_current_identity(
    repo: Path,
    relative: str,
) -> tuple[int, int, int, int, int, int] | None:
    try:
        with source_parent(repo, relative) as (parent, name):
            value = os.stat(name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return None
    except PreviewError:
        raise
    except OSError as error:
        raise PreviewError(f"无法复核 Preview source input {relative}：{error}") from error
    return source_stat_identity(value)


def source_object(
    repo: Path,
    relative: str,
    tracked: bool,
) -> tuple[bytes, bytes, bytes, tuple[int, int, int, int, int, int] | None]:
    try:
        with source_parent(repo, relative) as (parent, name):
            try:
                before = os.stat(name, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError:
                if tracked:
                    return b"missing-tracked", b"000000", b"", None
                raise PreviewError(
                    f"Preview source input 在 evidence 采集期间消失：{relative}"
                )
            except OSError as error:
                raise PreviewError(
                    f"无法读取 Preview source input {relative}：{error}"
                ) from error

            mode = before.st_mode
            before_identity = source_stat_identity(before)
            if stat.S_ISREG(mode):
                kind = b"file"
                normalized_mode = b"100755" if mode & 0o111 else b"100644"
                flags = (
                    os.O_RDONLY
                    | getattr(os, "O_NOFOLLOW", 0)
                    | getattr(os, "O_CLOEXEC", 0)
                    | getattr(os, "O_NONBLOCK", 0)
                )
                try:
                    descriptor = os.open(name, flags, dir_fd=parent)
                    with os.fdopen(descriptor, "rb") as handle:
                        opened = os.fstat(handle.fileno())
                        if (
                            not stat.S_ISREG(opened.st_mode)
                            or source_stat_identity(opened) != before_identity
                        ):
                            raise PreviewError(
                                "Preview source input 在 evidence 采集期间变化："
                                f"{relative}"
                            )
                        payload = handle.read()
                        after = os.fstat(handle.fileno())
                except PreviewError:
                    raise
                except OSError as error:
                    raise PreviewError(
                        f"无法读取 Preview source input {relative}：{error}"
                    ) from error
            elif stat.S_ISLNK(mode):
                kind = b"symlink"
                normalized_mode = b"120000"
                try:
                    payload = os.fsencode(os.readlink(name, dir_fd=parent))
                    after = os.stat(name, dir_fd=parent, follow_symlinks=False)
                except OSError as error:
                    raise PreviewError(
                        f"无法读取 Preview symlink {relative}：{error}"
                    ) from error
            else:
                raise PreviewError(
                    f"Preview source input 不是普通文件或符号链接：{relative}"
                )
    except FileNotFoundError:
        if tracked:
            return b"missing-tracked", b"000000", b"", None
        raise PreviewError(f"Preview source input 在 evidence 采集期间消失：{relative}")
    after_identity = source_stat_identity(after)
    if after_identity != before_identity:
        raise PreviewError(f"Preview source input 在 evidence 采集期间变化：{relative}")
    return kind, normalized_mode, payload, after_identity


def update_digest(digest: Any, value: bytes) -> None:
    digest.update(len(value).to_bytes(8, "big"))
    digest.update(value)


def source_input_digest(repo: Path, roots: list[str], digest_identity: bytes) -> str:
    tracked = git_source_paths(repo, [], roots)
    untracked = git_source_paths(repo, ["--others", "--exclude-standard"], roots)
    paths = tracked | untracked
    digest = hashlib.sha256()
    digest.update(digest_identity)
    observed: dict[str, tuple[int, int, int, int, int, int] | None] = {}
    for relative in sorted(paths, key=os.fsencode):
        kind, mode, payload, identity = source_object(
            repo, relative, relative in tracked
        )
        observed[relative] = identity
        update_digest(digest, os.fsencode(relative))
        update_digest(digest, kind)
        update_digest(digest, mode)
        update_digest(digest, payload)

    if git_source_paths(repo, [], roots) != tracked or git_source_paths(
        repo, ["--others", "--exclude-standard"], roots
    ) != untracked:
        raise PreviewError("Preview source input 集合在 evidence 采集期间变化")
    for relative, identity in observed.items():
        current = source_current_identity(repo, relative)
        if current != identity:
            raise PreviewError(f"Preview source input 在 evidence 采集期间变化：{relative}")
    return digest.hexdigest()


def runtime_decision_digest(repo: Path) -> str:
    return source_input_digest(
        repo,
        list(RUNTIME_DECISION_ROOTS),
        RUNTIME_DECISION_DIGEST_IDENTITY,
    )


def source_evidence(
    repo: Path,
    selected: list[tuple[str, dict[str, Any]]],
) -> dict[str, str]:
    roots = source_roots(selected)
    source_sha = git_output(repo, ["rev-parse", "HEAD"])
    status = source_status(repo, roots)
    source_digest = source_input_digest(repo, roots, SOURCE_DIGEST_IDENTITY)
    if git_output(repo, ["rev-parse", "HEAD"]) != source_sha:
        raise PreviewError("Preview source HEAD 在 evidence 采集期间变化")
    if source_status(repo, roots) != status:
        raise PreviewError("Preview source 状态在 evidence 采集期间变化")
    return {
        "source_sha": source_sha,
        "source_state": "dirty" if status else "clean",
        "source_digest": source_digest,
    }


def ensure_sync_clean(repo: Path) -> None:
    dirty = git_bytes(
        repo,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )
    if dirty:
        raise PreviewError(
            "--sync 要求完整 worktree clean；请提交或移除未提交变化后重试"
        )


def safe_path(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or value.startswith("/")
        or value.endswith("/")
        or "\\" in value
        or "\0" in value
        or "//" in value
    ):
        raise PreviewError(f"{label} 不是规范项目相对路径")
    parts = PurePosixPath(value).parts
    if any(part in {"", ".", ".."} or part.endswith((" ", ".")) for part in parts):
        raise PreviewError(f"{label} 不是规范项目相对路径")
    return value


def require_project_object(repo: Path, relative: str, directory: bool, label: str) -> Path:
    current = repo
    parts = PurePosixPath(relative).parts
    for index, part in enumerate(parts):
        current /= part
        try:
            mode = current.lstat().st_mode
        except OSError as error:
            raise PreviewError(f"{label} 不存在：{relative}：{error}") from error
        if stat.S_ISLNK(mode):
            raise PreviewError(f"{label} 经过符号链接：{relative}")
        if index < len(parts) - 1 and not stat.S_ISDIR(mode):
            raise PreviewError(f"{label} ancestor 不是目录：{relative}")
    valid = stat.S_ISDIR(mode) if directory else stat.S_ISREG(mode)
    if not valid:
        raise PreviewError(f"{label} 类型错误：{relative}")
    try:
        current.resolve(strict=True).relative_to(repo.resolve(strict=True))
    except (OSError, ValueError) as error:
        raise PreviewError(f"{label} 越出当前项目：{relative}") from error
    return current


def strict_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_bytes())
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise PreviewError(f"无法读取 {label}：{error}") from error
    if not isinstance(value, dict):
        raise PreviewError(f"{label} 顶层必须是 object")
    return value


def load_bindings(repo: Path) -> dict[str, dict[str, Any]]:
    root = require_project_object(
        repo,
        "facts/entities",
        True,
        "facts/entities Experience binding",
    )
    bindings: dict[str, dict[str, Any]] = {}
    for path in sorted(root.glob("*.yaml")):
        if path.is_symlink() or not path.is_file():
            raise PreviewError(f"entity shard 不是普通文件：{path}")
        shard = strict_json(path, path.relative_to(repo).as_posix())
        entity_id = shard.get("entity_id")
        if not isinstance(entity_id, str) or not ENTITY_ID.fullmatch(entity_id):
            raise PreviewError(f"entity shard identity 无效：{path}")
        if path.stem != entity_id:
            raise PreviewError(f"entity shard 文件名与 identity 不一致：{path}")
        binding = shard.get("experience")
        if binding is None:
            continue
        if shard.get("kind") not in {"web", "mobile"}:
            raise PreviewError(f"{entity_id} 不是 UI entity")
        if not isinstance(binding, dict) or set(binding) != EXPECTED_FIELDS:
            raise PreviewError(f"{entity_id}.experience 字段不闭合")
        bindings[entity_id] = binding
    return bindings


def select_bindings(
    bindings: dict[str, dict[str, Any]],
    requested: list[str] | None,
) -> list[tuple[str, dict[str, Any]]]:
    if requested is None:
        selected = sorted(bindings)
    else:
        repeated = sorted({item for item in requested if requested.count(item) > 1})
        if repeated:
            raise PreviewError(f"重复选择 Experience entity：{repeated}")
        unknown = sorted(set(requested) - set(bindings))
        if unknown:
            raise PreviewError(f"未知或未绑定的 Experience entity：{unknown}")
        selected = sorted(requested)
    if not selected:
        raise PreviewError(
            "项目没有 Experience UI entity；Preview 不适用且不应物化空 experience/ root"
        )
    return [(entity_id, bindings[entity_id]) for entity_id in selected]


def validate_binding(
    repo: Path,
    script_relative: str,
    entity_id: str,
    binding: dict[str, Any],
) -> None:
    for field in (
        "port_path",
        "scenario_provider_path",
        "production_entrypoint",
        "scenario_entrypoint",
        "preview_entrypoint",
        "working_directory",
    ):
        relative = safe_path(binding[field], f"{entity_id}.{field}")
        expected_directory = field in {
            "port_path",
            "scenario_provider_path",
            "working_directory",
        }
        require_project_object(
            repo,
            relative,
            expected_directory,
            f"{entity_id}.{field}",
        )
    if binding["preview_entrypoint"] != script_relative:
        raise PreviewError(
            f"{entity_id}.preview_entrypoint 未绑定当前唯一入口 {script_relative}"
        )
    command = binding["preview_command"]
    if (
        not isinstance(command, list)
        or not command
        or any(not isinstance(item, str) or not item for item in command)
    ):
        raise PreviewError(f"{entity_id}.preview_command 必须是非空字符串数组")
    joined = "\n".join(command)
    executable = re.split(r"[\\/]", command[0])[-1].casefold()
    executable = re.sub(r"\.(?:bat|cmd|exe)$", "", executable)
    lowered = {re.split(r"[\\/]", item)[-1].casefold() for item in command}
    if executable in SHELL_WRAPPERS or lowered & DENIED_INSTALLERS:
        raise PreviewError(f"{entity_id}.preview_command 不得调用shell或system/global installer")
    if any(
        item in {"-g", "--global"}
        or item.startswith(("--global=", "--location=global"))
        for item in command
    ):
        raise PreviewError(f"{entity_id}.preview_command 不得请求global install")
    if executable == "pnpm" and "--" in command:
        raise PreviewError(
            f"{entity_id}.preview_command 的 pnpm argv 不得包含多余参数 separator --"
        )
    if any(
        any(ord(character) < 32 or ord(character) == 127 for character in item)
        or CREDENTIAL_ARGUMENT.search(item)
        for item in command
    ):
        raise PreviewError(f"{entity_id}.preview_command 不得包含控制字符或凭据参数")
    unknown = sorted(set(PLACEHOLDER.findall(joined)) - {"host", "port", "scenario"})
    stripped = PLACEHOLDER.sub("", joined)
    if (
        unknown
        or "{" in stripped
        or "}" in stripped
        or "://" in joined
        or "{host}" not in joined
        or "{port}" not in joined
    ):
        raise PreviewError(
            f"{entity_id}.preview_command 必须使用 host/port，占位符闭合且不得含 URL"
        )
    health = binding["healthcheck_path"]
    if (
        not isinstance(health, str)
        or not health.startswith("/")
        or health.startswith("//")
        or any(
            character.isspace()
            or ord(character) < 32
            or ord(character) == 127
            or character in "#\\"
            for character in health
        )
    ):
        raise PreviewError(f"{entity_id}.healthcheck_path 不安全")
    requirements = binding["toolchain_requirements"]
    if (
        not isinstance(requirements, list)
        or any(not isinstance(item, str) or not item for item in requirements)
        or requirements != sorted(set(requirements))
        or "node" not in requirements
    ):
        raise PreviewError(f"{entity_id}.toolchain_requirements 无效")


def prepare_dependency_mountpoints(
    repo: Path,
    selected: list[tuple[str, dict[str, Any]]],
) -> list[Path]:
    try:
        repo_root = repo.resolve(strict=True)
    except OSError as error:
        raise PreviewError(f"无法解析 Preview repo root {repo}：{error}") from error
    prepared: list[Path] = []
    for entity_id, binding in selected:
        raw_working = binding.get("working_directory")
        try:
            working = safe_path(raw_working, f"{entity_id}.working_directory")
        except PreviewError as error:
            shown = (
                os.path.abspath(repo_root / raw_working / "node_modules")
                if isinstance(raw_working, str)
                else repr(raw_working)
            )
            raise PreviewError(
                f"Preview dependency mountpoint 路径无效：{shown}：{error}"
            ) from error
        relative = PurePosixPath(working) / "node_modules"
        target = repo_root.joinpath(*relative.parts)
        current = repo_root
        for index, part in enumerate(relative.parts):
            current /= part
            try:
                mode = current.lstat().st_mode
            except FileNotFoundError:
                if index != len(relative.parts) - 1:
                    raise PreviewError(
                        "Preview dependency mountpoint ancestor 不存在："
                        f"{target}（missing={current}）"
                    ) from None
                try:
                    current.mkdir()
                except FileExistsError:
                    pass
                except OSError as error:
                    raise PreviewError(
                        f"无法创建 Preview dependency mountpoint：{target}：{error}"
                    ) from error
                try:
                    mode = current.lstat().st_mode
                except OSError as error:
                    raise PreviewError(
                        f"无法回读 Preview dependency mountpoint：{target}：{error}"
                    ) from error
            except OSError as error:
                raise PreviewError(
                    f"无法检查 Preview dependency mountpoint：{target}：{error}"
                ) from error
            if stat.S_ISLNK(mode):
                kind = "目标" if current == target else "ancestor"
                raise PreviewError(
                    f"Preview dependency mountpoint {kind} 不能是符号链接："
                    f"{target}（symlink={current}）"
                )
            if not stat.S_ISDIR(mode):
                kind = "目标" if current == target else "ancestor"
                raise PreviewError(
                    f"Preview dependency mountpoint {kind} 不是目录："
                    f"{target}（object={current}）"
                )
        try:
            resolved = target.resolve(strict=True)
            resolved.relative_to(repo_root)
        except (OSError, ValueError) as error:
            raise PreviewError(
                f"Preview dependency mountpoint 越出当前项目：{target}"
            ) from error
        if target.is_symlink() or not target.is_dir():
            raise PreviewError(
                f"Preview dependency mountpoint 最终回读不是普通目录：{target}"
            )
        prepared.append(target)
    return prepared


def require_preview_bundle(repo: Path) -> Path:
    preview = require_project_object(repo, "experience/preview", True, "Preview bundle")
    for name in sorted(PROJECT_FILES):
        require_project_object(
            repo,
            f"experience/preview/{name}",
            False,
            f"Preview bundle {name}",
        )
    unknown = sorted(
        child.name
        for child in preview.iterdir()
        if child.name not in PROJECT_FILES | LOCAL_OBJECTS
    )
    retired = sorted(set(unknown) & RETIRED_LOCAL_OBJECTS)
    if retired:
        paths = [f"experience/preview/{name}" for name in retired]
        unsafe = []
        for name in retired:
            path = preview / name
            try:
                mode = path.lstat().st_mode
            except OSError as error:
                raise PreviewError(
                    f"Preview 遗留对象检查时已变化：experience/preview/{name}：{error}"
                ) from error
            if not stat.S_ISREG(mode):
                kind = "符号链接" if stat.S_ISLNK(mode) else "非普通文件"
                unsafe.append(f"experience/preview/{name}（{kind}）")
        has_local = bool(set(retired) & {".env", ".netrc"})
        detail = (
            f"；对象类型不安全，不能作为本机普通文件清理：{unsafe}"
            if unsafe
            else ""
        )
        local_guidance = (
            "；其中 .env/.netrc 可能含本机配置或凭证，删除会永久丢失其内容；"
            "只有确认是 ignored 的未跟踪普通文件并取得所列具体路径的当前授权后，"
            "Agent 才能不读取内容地清理、回读并在同一会话继续"
            if has_local
            else ""
        )
        tracked_guidance = (
            "；experience/preview/.env.example 须先核实是 tracked 普通文件，"
            "才能由 Preview prepare 结构性升级处理"
            if ".env.example" in retired
            else ""
        )
        raise PreviewError(
            f"Preview bundle 含已退役文件：{paths}{detail}；"
            "entity、sync 与间隔现在只由命令行参数决定，git 授权复用运行环境，"
            "本次未删除文件，保留则继续阻断启动"
            f"{local_guidance}{tracked_guidance}"
        )
    if unknown:
        raise PreviewError(f"Preview bundle 含未知项目级资产：{unknown}")
    return preview


def require_local_ignores(repo: Path) -> None:
    ignore = require_project_object(repo, ".gitignore", False, "项目 .gitignore")
    try:
        lines = set(ignore.read_text(encoding="utf-8").splitlines())
    except (OSError, UnicodeError) as error:
        raise PreviewError(f"无法读取项目 .gitignore：{error}") from error
    missing = sorted(EXACT_IGNORES - lines)
    if missing:
        raise PreviewError(f"项目 .gitignore 缺少 Preview exact ignore：{missing}")


def redact(url: str) -> str:
    body = url.strip(" \t\r\n")
    if UNPRINTABLE.search(body) or any(character in body for character in '"\\'):
        return HIDDEN_VALUE
    sensitive_at = min(
        (position for marker in "?#" if (position := body.find(marker)) >= 0),
        default=-1,
    )
    visible = body if sensitive_at < 0 else body[:sensitive_at]
    hidden_suffix = "" if sensitive_at < 0 else f"{body[sensitive_at]}***"
    prefix = URL_PREFIX.match(visible).group(0)
    rest = visible[len(prefix) :]
    boundary = AUTHORITY_END.search(rest)
    authority = rest[: boundary.start()] if boundary else rest
    remainder = rest[boundary.start() :] if boundary else ""
    if "@" not in authority:
        return f"{visible}{hidden_suffix}"
    return (
        f"{prefix}***@{authority.rpartition('@')[2]}{remainder}{hidden_suffix}"
    )


def validate_repository(value: str) -> None:
    shown = redact(value)
    if UNPRINTABLE.search(value) or any(character in value for character in '"\\'):
        raise PreviewError(f"当前仓库 origin 含不安全字符：{shown!r}")
    try:
        parsed = urllib.parse.urlsplit(value)
        _ = parsed.port
    except ValueError as error:
        raise PreviewError(f"当前仓库 origin 不是合法仓库地址：{shown!r}") from error
    if parsed.scheme.casefold() not in {"http", "https"}:
        raise PreviewError(
            f"当前仓库 origin 只接受无凭证 HTTP(S) 地址：{shown!r}；"
            "SSH origin 可用 git 的 url.<https-base>.insteadOf 改写为 HTTPS"
        )
    if parsed.username is not None or parsed.password is not None:
        raise PreviewError(
            f"当前仓库 origin 不得在 URL 里携带凭证：{shown!r}；"
            "改用运行环境的 git 凭证助手或 netrc"
        )
    if (
        not parsed.hostname
        or parsed.query
        or parsed.fragment
        or not parsed.path.startswith("/")
        or parsed.path == "/"
    ):
        raise PreviewError(f"当前仓库 origin 不是合法仓库地址：{shown!r}")


def compose_project_name(repo_root: Path) -> str:
    slug = UNSAFE_PROJECT_CHARS.sub("-", repo_root.name.casefold()).strip("-_")
    digest = hashlib.sha256(str(repo_root).encode("utf-8")).hexdigest()[:8]
    return f"{slug or 'preview'}-{digest}"


def resolve_settings(
    facts: dict[str, str],
    *,
    sync_enabled: bool,
    sync_interval_seconds: int,
) -> dict[str, Any]:
    """把 fresh Git facts 与命令行选择收敛成本次运行的确定性设置。"""

    repo_root = Path(facts["repo_root"]).resolve()
    repository = facts.get("origin_url", "")
    branch = facts.get("branch", "")
    if not 1 <= sync_interval_seconds <= 3600:
        raise PreviewError("--sync-interval-seconds 必须是 1..3600 的整数")
    if not repository:
        raise PreviewError("当前仓库缺少 origin；请配置无凭证 HTTP(S) origin 后启动")
    validate_repository(repository)
    if not branch:
        raise PreviewError(
            "Preview 需要当前 checkout 处于 attached branch；"
            "当前为 detached HEAD，先 checkout 分支再启动"
        )
    if not BRANCH_NAME.fullmatch(branch):
        raise PreviewError(f"当前 checkout 分支名无法安全注入 sync：{branch!r}")
    return {
        "repo_root": str(repo_root),
        "source_sha": facts["source_sha"],
        "branch_in_checkout": branch,
        "origin_url": repository,
        "repository": repository,
        "sync_enabled": sync_enabled,
        "sync_branch": branch,
        "sync_interval_seconds": sync_interval_seconds,
        "compose_project": compose_project_name(repo_root),
    }


def compose_environment(
    settings: dict[str, Any],
    scenario: str,
    port: int | None = None,
) -> dict[str, str]:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key in SAFE_HOST_ENV or key.startswith("LC_")
    }
    environment.update(
        {
            "PREVIEW_REPO_ROOT": settings["repo_root"],
            "PREVIEW_SCENARIO": scenario,
            # 空值经 Compose 插值后仍是 127.0.0.1::5173，由 Docker 动态分配宿主端口。
            "PREVIEW_PORT": str(port) if port else "",
        }
    )
    return environment


def render_command(
    command: list[str],
    scenario: str,
    host: str = CONTAINER_HOST,
    port: int = CONTAINER_PORT,
) -> list[str]:
    values = {
        "host": host,
        "port": str(port),
        "scenario": scenario,
    }
    return [
        PLACEHOLDER.sub(lambda match: values[match.group(1)], item)
        for item in command
    ]


def render_static_command(command: list[str]) -> list[str]:
    values = {
        "host": CONTAINER_HOST,
        "port": str(CONTAINER_PORT),
        "scenario": COMPOSE_SCENARIO,
    }
    rendered: list[str] = []
    for item in command:
        escaped = item.replace("$", "$$")
        rendered.append(
            PLACEHOLDER.sub(lambda match: values[match.group(1)], escaped)
        )
    return rendered


def preview_service_model(
    entity_id: str,
    binding: dict[str, Any],
) -> dict[str, Any]:
    service_name = f"preview_{entity_id}"
    volume_name = f"{service_name}_node_modules"
    cache_volume_name = f"{service_name}_pm_cache"
    working = binding["working_directory"]
    command = render_static_command(binding["preview_command"])
    return {
        "image": "node:24-bookworm",
        "init": True,
        "working_dir": f"/workspace/{working}",
        "command": [
            "bash",
            "-euo",
            "pipefail",
            "-c",
            PREVIEW_CONTAINER_SUPERVISOR.replace("$", "$$"),
            "experience-preview-supervisor",
            *command,
        ],
        "environment": {
            "CHOKIDAR_USEPOLLING": "true",
            "COREPACK_HOME": "/var/cache/preview/corepack",
            "EXPERIENCE_HEALTHCHECK_PATH": binding["healthcheck_path"],
            "EXPERIENCE_PREVIEW": "1",
            "EXPERIENCE_SCENARIO": COMPOSE_SCENARIO,
            "HOME": "/tmp/preview-home",
            "HOST": CONTAINER_HOST,
            "NO_PROXY": "*",
            "NPM_CONFIG_CACHE": "/var/cache/preview/npm-cache",
            "PNPM_CONFIG_STORE_DIR": "/var/cache/preview/pnpm-store",
            "PORT": str(CONTAINER_PORT),
            "VITE_EXPERIENCE_SCENARIO": COMPOSE_SCENARIO,
            "WATCHPACK_POLLING": "true",
        },
        "labels": {
            "wf-prod.preview.entity": entity_id,
            "wf-prod.preview.health-path": binding["healthcheck_path"],
        },
        "read_only": True,
        "tmpfs": ["/tmp:rw,nosuid,size=512m"],
        "volumes": [
            {
                "type": "bind",
                "source": COMPOSE_REPO_ROOT,
                "target": "/workspace",
                "read_only": True,
            },
            {
                "type": "volume",
                "source": volume_name,
                "target": f"/workspace/{working}/node_modules",
            },
            {
                "type": "volume",
                "source": cache_volume_name,
                "target": "/var/cache/preview",
            },
        ],
        "ports": [COMPOSE_PORT_PUBLISHER],
    }


def compose_model(
    bindings: list[tuple[str, dict[str, Any]]],
) -> dict[str, Any]:
    services: dict[str, Any] = {}
    volumes: dict[str, Any] = {}
    for entity_id, binding in bindings:
        service_name = f"preview_{entity_id}"
        volume_name = f"{service_name}_node_modules"
        services[service_name] = preview_service_model(entity_id, binding)
        volumes[volume_name] = {}
        volumes[f"{service_name}_pm_cache"] = {}
    return {
        "x-wf-prod": {
            "schema": "wf-prod.experience_preview_compose",
            "schema_version": 1,
        },
        "services": services,
        "volumes": volumes,
    }


def validate_static_compose(
    compose_file: Path,
    bindings: list[tuple[str, dict[str, Any]]],
) -> dict[str, Any]:
    try:
        actual = json.loads(
            compose_file.read_bytes(),
            object_pairs_hook=reject_duplicate_json_keys,
            parse_constant=reject_json_constant,
        )
    except (OSError, UnicodeError, ValueError) as error:
        raise PreviewError(
            f"tracked compose.yaml 必须是可确定性校验的 JSON Compose：{error}"
        ) from error
    expected = compose_model(bindings)
    if canonical_bytes(actual) != canonical_bytes(expected):
        actual_services = (
            sorted(actual["services"])
            if isinstance(actual, dict)
            and isinstance(actual.get("services"), dict)
            else []
        )
        expected_services = sorted(expected["services"])
        if actual_services != expected_services:
            raise PreviewError(
                "tracked Compose 服务全集与 fresh Project Facts 不一致："
                f"actual={actual_services} expected={expected_services}"
            )
        drifted = sorted(
            service
            for service in expected_services
            if canonical_bytes(actual["services"].get(service))
            != canonical_bytes(expected["services"][service])
        )
        raise PreviewError(
            "tracked Compose service 定义未由 fresh binding 确定性生成："
            f"{drifted or ['top-level-or-volumes']}"
        )
    return actual


def compose_base(settings: dict[str, Any], compose_file: Path) -> list[str]:
    return [
        "docker",
        "compose",
        "--project-name",
        settings["compose_project"],
        "--file",
        str(compose_file),
    ]


def run_command(
    argv: list[str], environment: dict[str, str]
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            argv,
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            text=True,
        )
    except OSError as error:
        raise PreviewError(f"无法执行 {argv[0]}：{error}", EXIT_ENVIRONMENT) from error


def require_docker(environment: dict[str, str]) -> str:
    result = run_command(["docker", "compose", "version", "--short"], environment)
    if result.returncode != 0:
        raise PreviewError(
            f"Docker Compose v2 不可用：{result.stderr.strip()[:300]}",
            EXIT_ENVIRONMENT,
        )
    return result.stdout.strip()


def parse_json_documents(text: str) -> list[dict[str, Any]]:
    body = text.strip()
    if not body:
        return []
    try:
        value = json.loads(body)
    except json.JSONDecodeError:
        rows: list[dict[str, Any]] = []
        for line in body.splitlines():
            try:
                parsed = json.loads(line.strip())
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                rows.append(parsed)
        if not rows:
            raise PreviewError(
                f"无法解析 Compose 输出：{body.splitlines()[0][:200]}", EXIT_RUNTIME
            ) from None
        return rows
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    return [value] if isinstance(value, dict) else []


def service_rows(base: list[str], environment: dict[str, str]) -> list[dict[str, Any]]:
    result = run_command([*base, "ps", "--format", "json", "--all"], environment)
    if result.returncode != 0:
        raise PreviewError(f"读取 Compose 服务状态失败：{result.stderr.strip()}", EXIT_RUNTIME)
    return parse_json_documents(result.stdout)


def emit_service_log_tail(
    base: list[str],
    environment: dict[str, str],
    services: list[str],
    *,
    application_started: bool = False,
) -> None:
    selected = sorted(set(services))
    if not selected:
        return
    result = run_command(
        [
            *base,
            "logs",
            "--no-color",
            "--tail",
            str(SERVICE_LOG_TAIL_LINES),
            *selected,
        ],
        environment,
    )
    body = (result.stdout + result.stderr).strip()
    if len(body) > SERVICE_LOG_MAX_CHARS:
        body = body[-SERVICE_LOG_MAX_CHARS:]
    if result.returncode != 0:
        heading = (
            "experience-preview: 无法读取失败 Compose service 输出尾部"
            f"（services={selected}, exit={result.returncode}）"
        )
    elif application_started:
        heading = (
            "experience-preview: 应用日志尾部"
            f"（已通过健康回读证明应用进程曾启动，services={selected}, "
            f"lines<={SERVICE_LOG_TAIL_LINES}, chars<={SERVICE_LOG_MAX_CHARS}）"
        )
    else:
        heading = (
            "experience-preview: 容器 service 输出尾部"
            f"（未证明应用进程已启动，仅作补充 evidence，services={selected}, "
            f"lines<={SERVICE_LOG_TAIL_LINES}, "
            f"chars<={SERVICE_LOG_MAX_CHARS}）"
        )
    print(heading, file=sys.stderr, flush=True)
    print(body or "<无日志输出>", file=sys.stderr, flush=True)


def emit_runtime_failure_log_tails(
    base: list[str],
    environment: dict[str, str],
    failed: list[str],
    application_services: set[str],
) -> None:
    applications = sorted(set(failed) & application_services)
    supporting = sorted(set(failed) - set(applications))
    if applications:
        emit_service_log_tail(
            base,
            environment,
            applications,
            application_started=True,
        )
    if supporting:
        emit_service_log_tail(base, environment, supporting)


def compose_services(base: list[str], environment: dict[str, str]) -> list[str]:
    result = run_command([*base, "config", "--services"], environment)
    if result.returncode != 0:
        raise PreviewError(f"渲染 Compose 配置失败：{result.stderr.strip()}", EXIT_CONFIG)
    services = sorted({line.strip() for line in result.stdout.splitlines() if line.strip()})
    if not services:
        raise PreviewError("Compose 服务清单为空")
    return services


def image_rows(
    service_rows_value: list[dict[str, Any]],
    environment: dict[str, str],
) -> list[dict[str, Any]]:
    containers = sorted(
        {
            str(row.get("Name", ""))
            for row in service_rows_value
            if row.get("Name")
        }
    )
    if not containers:
        raise PreviewError("Compose services 缺少实际 container identity", EXIT_RUNTIME)
    result = run_command(
        ["docker", "inspect", "--type=container", *containers],
        environment,
    )
    if result.returncode != 0:
        raise PreviewError(
            f"回读 Compose container image 失败：{result.stderr.strip()}",
            EXIT_RUNTIME,
        )
    return parse_json_documents(result.stdout)


def publishers(rows: list[dict[str, Any]]) -> list[tuple[str, str, int]]:
    result: list[tuple[str, str, int]] = []
    for row in rows:
        service = str(row.get("Service", ""))
        for publisher in row.get("Publishers") or []:
            published = publisher.get("PublishedPort")
            if not published:
                continue
            result.append((service, str(publisher.get("URL") or ""), int(published)))
    return result


def published_urls(rows: list[dict[str, Any]]) -> dict[str, list[str]]:
    urls: dict[str, list[str]] = {}
    for service, host, port in publishers(rows):
        location = host or LOOPBACK_HOST
        if ":" in location and not location.startswith("["):
            location = f"[{location}]"
        urls.setdefault(service, []).append(f"http://{location}:{port}")
    return {service: sorted(set(values)) for service, values in urls.items()}


def non_loopback_publishers(rows: list[dict[str, Any]]) -> list[str]:
    return sorted(
        f"{service} -> {host}:{port}"
        for service, host, port in publishers(rows)
        if not host or host.casefold() not in LOOPBACK_PUBLISHERS
    )


def http_ready(url: str, path: str) -> bool:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "http" or parsed.hostname != LOOPBACK_HOST or parsed.port is None:
        return False
    connection = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=0.5)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        response.read(1)
        return 200 <= response.status < 400
    except (OSError, http.client.HTTPException):
        return False
    finally:
        connection.close()


def sync_status(repo: Path) -> dict[str, Any]:
    path = repo / "experience/preview/runtime/sync.json"
    if path.is_symlink() or not path.is_file():
        return {"status": "unknown", "reason": "no-status-file"}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return {"status": "unknown", "reason": f"unreadable-status-file: {error}"}
    return value if isinstance(value, dict) else {"status": "unknown", "reason": "invalid-status"}


def sync_revision(repo: Path) -> tuple[int, int, int] | None:
    path = repo / "experience/preview/runtime/sync.json"
    try:
        value = path.stat()
    except OSError:
        return None
    if path.is_symlink() or not path.is_file():
        return None
    return (value.st_ino, value.st_size, value.st_mtime_ns)


def sync_environment(
    settings: dict[str, Any],
    status_file: Path,
    heartbeat: Path,
) -> dict[str, str]:
    """宿主 sync 子进程的环境：继承运行环境，只叠加 PREVIEW_* 运行值。

    git 授权完全来自运行环境已有的凭证助手或 netrc；入口不新增、不读取、
    不移除任何凭证。
    """

    environment = dict(os.environ)
    environment.update(
        {
            "PREVIEW_WORKSPACE": settings["repo_root"],
            "PREVIEW_REPOSITORY": settings["repository"],
            "PREVIEW_BRANCH": settings["sync_branch"],
            "PREVIEW_SYNC_INTERVAL_SECONDS": str(settings["sync_interval_seconds"]),
            "PREVIEW_SYNC_STATUS_FILE": str(status_file),
            "PREVIEW_SYNC_HEARTBEAT": str(heartbeat),
            "PREVIEW_PARENT_PID": str(os.getpid()),
            "GIT_TERMINAL_PROMPT": "0",
        }
    )
    return environment


def sync_injected_keys() -> set[str]:
    return {
        "PREVIEW_WORKSPACE",
        "PREVIEW_REPOSITORY",
        "PREVIEW_BRANCH",
        "PREVIEW_SYNC_INTERVAL_SECONDS",
        "PREVIEW_SYNC_STATUS_FILE",
        "PREVIEW_SYNC_HEARTBEAT",
        "PREVIEW_PARENT_PID",
        "GIT_TERMINAL_PROMPT",
    }


def safe_git_detail(text: str, limit: int = 300) -> str:
    """取 git stderr 的最后一行作为人可读 evidence：去控制字符、遮蔽 URL userinfo、截断。"""

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return "<git 未返回错误详情>"
    line = "".join(
        character
        for character in lines[-1]
        if ord(character) >= 32 and ord(character) != 127
    )
    line = re.sub(r"://[^/\s@]+@", "://***@", line)
    return line[:limit]


def sync_preflight(
    repo: Path,
    settings: dict[str, Any],
    environment: dict[str, str],
) -> None:
    """在任何 Docker mutation 前证明宿主能以现有 git 授权访问 exact origin branch。"""

    if shutil.which("bash", path=environment.get("PATH")) is None:
        raise PreviewError(
            "--sync 需要宿主 PATH 中存在 bash 以运行 experience/preview/sync.sh；"
            "安装 bash 或去掉 --sync 后重新运行",
            EXIT_ENVIRONMENT,
        )
    if shutil.which("git", path=environment.get("PATH")) is None:
        raise PreviewError("--sync 需要宿主 PATH 中存在 git", EXIT_ENVIRONMENT)
    branch = settings["sync_branch"]
    host = urllib.parse.urlsplit(settings["repository"]).hostname or "<origin>"
    argv = [
        "git",
        "-C",
        str(repo),
        "ls-remote",
        "--exit-code",
        "--heads",
        "origin",
        branch,
    ]
    try:
        result = subprocess.run(
            argv,
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            text=True,
            timeout=SYNC_PREFLIGHT_TIMEOUT_SECONDS,
        )
    except OSError as error:
        raise PreviewError(f"无法执行 git ls-remote：{error}", EXIT_ENVIRONMENT) from error
    except subprocess.TimeoutExpired as error:
        raise PreviewError(
            f"git ls-remote 访问 {host} 超时（{SYNC_PREFLIGHT_TIMEOUT_SECONDS}s）；"
            "确认网络与 origin 可达后重新运行",
            EXIT_ENVIRONMENT,
        ) from error
    if result.returncode == 0:
        return
    detail = safe_git_detail(result.stderr)
    if result.returncode == 2:
        raise PreviewError(
            f"origin {host} 上不存在分支 {branch!r}；sync 只跟随当前 attached branch 的 "
            "exact 远端分支，先推送该分支或切换到已存在的分支",
            EXIT_ENVIRONMENT,
        )
    lowered = result.stderr.casefold()
    if any(
        marker in lowered
        for marker in (
            "authentication failed",
            "could not read username",
            "could not read password",
            "http basic: access denied",
            "invalid username or password",
            "terminal prompts disabled",
            "401",
            "403",
        )
    ):
        raise PreviewError(
            f"宿主 git 没有访问 {host} 的授权；sync 复用运行环境已有的 git 凭证，入口不"
            "注入 token。恢复方式：在宿主配置 git 凭证助手（如 `glab auth setup-git`）"
            "或 netrc；imoctl 容器内以已授权用户重新创建容器。"
            f"git 输出：{detail}",
            EXIT_ENVIRONMENT,
        )
    raise PreviewError(
        f"git ls-remote 无法访问 origin {host}（exit={result.returncode}）：{detail}",
        EXIT_ENVIRONMENT,
    )


class HostSync:
    """以宿主子进程运行 tracked sync.sh，并回读其 runtime 状态。"""

    def __init__(
        self,
        repo: Path,
        settings: dict[str, Any],
        private_directory: Path,
    ) -> None:
        self.repo = repo
        self.settings = settings
        self.status_file = repo / "experience/preview/runtime/sync.json"
        self.heartbeat = private_directory / "preview-sync-ready"
        self.log_path = private_directory / "sync.log"
        self.environment = sync_environment(settings, self.status_file, self.heartbeat)
        self.initial_revision = sync_revision(repo)
        self.process: subprocess.Popen[bytes] | None = None
        self._log_handle = None

    def preflight(self) -> None:
        sync_preflight(self.repo, self.settings, self.environment)

    def start(self) -> None:
        script = self.repo / "experience/preview/sync.sh"
        try:
            self._log_handle = open(self.log_path, "wb")
            self.process = subprocess.Popen(
                ["bash", str(script)],
                cwd=str(self.repo),
                env=self.environment,
                stdin=subprocess.DEVNULL,
                stdout=self._log_handle,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        except OSError as error:
            raise PreviewError(f"无法启动宿主 sync：{error}", EXIT_ENVIRONMENT) from error

    def alive(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def exit_code(self) -> int | None:
        return None if self.process is None else self.process.poll()

    def revision_changed(self) -> bool:
        return sync_revision(self.repo) != self.initial_revision

    def status(self) -> dict[str, Any]:
        return sync_status(self.repo)

    def ready(self) -> bool:
        return self.revision_changed() and self.status().get("status") in {
            "current",
            "synced",
        }

    def blocked_reason(self) -> str | None:
        if not self.revision_changed():
            return None
        status = self.status()
        if status.get("status") == "blocked":
            return str(status.get("reason", "unknown"))
        return None

    def emit_log_tail(self) -> None:
        try:
            body = self.log_path.read_bytes().decode("utf-8", errors="replace").strip()
        except OSError:
            body = ""
        if len(body) > SYNC_LOG_MAX_CHARS:
            body = body[-SYNC_LOG_MAX_CHARS:]
        print(
            "experience-preview: 宿主 sync 输出尾部"
            f"（chars<={SYNC_LOG_MAX_CHARS}, exit={self.exit_code()}）",
            file=sys.stderr,
            flush=True,
        )
        print(body or "<无输出>", file=sys.stderr, flush=True)

    def stop(self) -> dict[str, Any]:
        outcome: dict[str, Any] = {"ok": True, "exit": self.exit_code()}
        process = self.process
        if process is not None and process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=SYNC_STOP_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                process.kill()
                try:
                    process.wait(timeout=SYNC_STOP_TIMEOUT_SECONDS)
                except subprocess.TimeoutExpired:
                    outcome["ok"] = False
            except OSError:
                outcome["ok"] = False
            outcome["exit"] = process.poll()
        if self._log_handle is not None:
            try:
                self._log_handle.close()
            except OSError:
                pass
            self._log_handle = None
        return outcome


def wait_services_ready(
    base: list[str],
    environment: dict[str, str],
    expected: dict[str, dict[str, Any]],
    timeout_seconds: int,
    stop_state: dict[str, int | None],
    sync: HostSync | None,
) -> list[dict[str, Any]]:
    deadline = time.monotonic() + timeout_seconds
    required = set(expected)
    latest: list[dict[str, Any]] = []
    while time.monotonic() < deadline:
        if stop_state["signum"] is not None:
            raise PreviewInterrupted("Preview 启动被信号中止")
        latest = service_rows(base, environment)
        observed = [str(row.get("Service", "")) for row in latest]
        unexpected = sorted(set(observed) - required)
        if "" in observed or len(observed) != len(set(observed)) or unexpected:
            raise PreviewError(
                "Compose 回读出现本次未选择、空或重复的 service identity："
                f"observed={observed} selected={sorted(required)}",
                EXIT_RUNTIME,
            )
        by_service = {service: row for service, row in zip(observed, latest)}
        if sync is not None:
            blocked = sync.blocked_reason()
            if blocked is not None:
                sync.emit_log_tail()
                raise PreviewError(f"sync 失败关闭：{blocked}", EXIT_RUNTIME)
            if not sync.alive():
                sync.emit_log_tail()
                reason = sync.status().get("reason", "unknown") if sync.revision_changed() else "unknown"
                raise PreviewError(
                    f"宿主 sync 提前退出（exit={sync.exit_code()}）：{reason}",
                    EXIT_RUNTIME,
                )
        failed = sorted(
            service
            for service in required
            if str(by_service.get(service, {}).get("State", "")).casefold()
            in {"dead", "exited", "removing", "restarting"}
        )
        if failed:
            emit_service_log_tail(base, environment, failed)
            raise PreviewError(f"required Compose service 已退出：{failed}", EXIT_RUNTIME)
        running = {
            service
            for service, row in by_service.items()
            if str(row.get("State", "")).casefold() == "running"
        }
        if required <= running:
            exposed = non_loopback_publishers(latest)
            if exposed:
                raise PreviewError(
                    "宿主端口必须只发布到 loopback，实际发布：" + "；".join(exposed),
                    EXIT_RUNTIME,
                )
            urls = published_urls(latest)
            preview_ready = all(
                urls.get(service)
                and any(
                    http_ready(url, expected[service]["healthcheck_path"])
                    for url in urls[service]
                )
                for service in expected
            )
            sync_ready = sync is None or sync.ready()
            if preview_ready and sync_ready:
                if stop_state["signum"] is not None:
                    raise PreviewInterrupted("Preview 启动被信号中止")
                return latest
        time.sleep(0.2)
    emit_service_log_tail(base, environment, sorted(required))
    if sync is not None:
        sync.emit_log_tail()
    raise PreviewError(
        f"等待 Compose services 健康超时：{sorted(required)}"
        + ("（含宿主 sync 首轮状态）" if sync is not None else ""),
        EXIT_RUNTIME,
    )


def stop_services(base: list[str], environment: dict[str, str]) -> dict[str, Any]:
    result = run_command([*base, "down", "--remove-orphans"], environment)
    return {
        "ok": result.returncode == 0,
        "detail": (result.stderr or result.stdout).strip()[-2000:],
    }


def launch_and_wait(
    base: list[str],
    environment: dict[str, str],
    selected_services: list[str],
    expected: dict[str, dict[str, Any]],
    timeout_seconds: int,
    stop_state: dict[str, int | None],
    sync: HostSync | None,
) -> list[dict[str, Any]]:
    started = False
    try:
        if stop_state["signum"] is not None:
            raise PreviewInterrupted("Preview 启动被信号中止")
        if sync is not None:
            sync.start()
        outcome = run_command(
            [*base, "up", "--detach", *selected_services],
            environment,
        )
        started = True
        if outcome.returncode != 0:
            detail = (outcome.stderr or outcome.stdout).strip()[-4000:]
            raise PreviewError(
                "Docker Compose 在 daemon/runtime/container-init 阶段启动失败；"
                "失败 service 的应用进程尚未启动。主 evidence："
                f"{detail or '<Docker daemon/runtime 未返回错误详情>'}",
                EXIT_RUNTIME,
            )
        if stop_state["signum"] is not None:
            raise PreviewInterrupted("Preview 启动被信号中止")
        return wait_services_ready(
            base,
            environment,
            expected,
            timeout_seconds,
            stop_state,
            sync,
        )
    except BaseException:
        if sync is not None:
            sync.stop()
        if started:
            stop_services(base, environment)
        raise


def image_identities(
    image_rows: list[dict[str, Any]],
    service_rows_value: list[dict[str, Any]],
) -> dict[str, dict[str, str]]:
    container_services: dict[str, str] = {}
    for row in service_rows_value:
        name = str(row.get("Name", ""))
        service = str(row.get("Service", ""))
        if name and service:
            container_services[name] = service
            container_services[name.lstrip("/")] = service
    images: dict[str, dict[str, str]] = {}
    for row in image_rows:
        name = str(row.get("Name", ""))
        service = container_services.get(name, "") or container_services.get(
            name.lstrip("/"), ""
        )
        if not service:
            continue
        config = row.get("Config")
        reference = str(config.get("Image", "")) if isinstance(config, dict) else ""
        images[service] = {
            "reference": reference,
            "id": str(row.get("Image", "")),
        }
    return images


def safe_sync_result(repo: Path, enabled: bool) -> dict[str, Any]:
    if not enabled:
        return {"status": "disabled"}
    value = sync_status(repo)
    return {
        key: value[key]
        for key in ("status", "reason", "branch", "before", "after")
        if key in value
    }


def base_result(
    repo: Path,
    evidence: dict[str, str],
    selected: list[tuple[str, dict[str, Any]]],
    scenario: str,
    runtime: str,
    port_source: str,
) -> dict[str, Any]:
    return {
        "schema": "wf-prod.experience_preview_result",
        "schema_version": 2,
        "status": "ready",
        "ready": True,
        "runtime": runtime,
        "port_source": port_source,
        **evidence,
        "repo_root": str(repo),
        "preview_entrypoint": "experience/preview/start.py",
        "scenario": scenario,
        "selected_entities": [entity_id for entity_id, _ in selected],
    }


def build_result(
    repo: Path,
    evidence: dict[str, str],
    selected: list[tuple[str, dict[str, Any]]],
    scenario: str,
    settings: dict[str, Any],
    rows: list[dict[str, Any]],
    images: list[dict[str, Any]],
    port_source: str = "dynamic",
) -> dict[str, Any]:
    urls = published_urls(rows)
    image_map = image_identities(images, rows)
    service_facts: list[dict[str, Any]] = []
    for row in sorted(rows, key=lambda item: str(item.get("Service", ""))):
        service = str(row.get("Service", ""))
        identity = image_map.get(service)
        if not service or identity is None or not identity["id"]:
            raise PreviewError(
                f"{service or '<unknown>'} 缺少实际 container image identity",
                EXIT_RUNTIME,
            )
        service_facts.append(
            {
                "name": service,
                "container": str(row.get("Name", "")),
                "state": str(row.get("State", "")),
                "image": identity,
            }
        )
    entities = []
    for entity_id, binding in selected:
        service = f"preview_{entity_id}"
        candidates = urls.get(service, [])
        if not candidates:
            raise PreviewError(f"{service} 缺少实际 loopback URL", EXIT_RUNTIME)
        entities.append(
            {
                "entity_id": entity_id,
                "service": service,
                "argv": render_command(binding["preview_command"], scenario),
                "working_directory": binding["working_directory"],
                "url": candidates[0],
                "healthcheck": {
                    "path": binding["healthcheck_path"],
                    "status": "pass",
                },
                "image": image_map[service],
            }
        )
    result = base_result(repo, evidence, selected, scenario, "docker", port_source)
    result.update(
        {
            "compose_project": settings["compose_project"],
            "services": service_facts,
            "entities": entities,
            "sync": safe_sync_result(repo, settings["sync_enabled"]),
        }
    )
    return result


def write_result(repo: Path, result: dict[str, Any]) -> Path:
    preview = require_project_object(repo, "experience/preview", True, "Preview runtime parent")
    runtime = preview / "runtime"
    try:
        mode = runtime.lstat().st_mode
    except FileNotFoundError:
        try:
            runtime.mkdir(mode=0o700)
            mode = runtime.lstat().st_mode
        except OSError as error:
            raise PreviewError(f"无法建立 Preview runtime：{error}") from error
    except OSError as error:
        raise PreviewError(f"无法检查 Preview runtime：{error}") from error
    if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
        raise PreviewError("Preview runtime 必须是项目内普通目录")
    try:
        runtime.resolve(strict=True).relative_to(repo.resolve(strict=True))
    except (OSError, ValueError) as error:
        raise PreviewError("Preview runtime 越出当前项目") from error
    target = runtime / "last-run.json"
    if target.exists() or target.is_symlink():
        target_mode = target.lstat().st_mode
        if stat.S_ISLNK(target_mode) or not stat.S_ISREG(target_mode):
            raise PreviewError("Preview runtime result 必须是普通文件")
    descriptor, temporary_name = tempfile.mkstemp(
        dir=runtime, prefix=".last-run.", suffix=".tmp"
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(canonical_bytes(result) + b"\n")
        temporary.replace(target)
    except OSError as error:
        raise PreviewError(f"无法写入 Preview runtime result：{error}") from error
    finally:
        temporary.unlink(missing_ok=True)
    return target


def install_stop_handlers(
    stop_state: dict[str, int | None],
) -> dict[int, Any]:
    previous: dict[int, Any] = {}

    def request_stop(signum: int, _frame: Any) -> None:
        stop_state["signum"] = signum

    for name in ("SIGINT", "SIGTERM", "SIGHUP"):
        if hasattr(signal, name):
            signum = getattr(signal, name)
            previous[signum] = signal.getsignal(signum)
            signal.signal(signum, request_stop)
    return previous


def restore_stop_handlers(previous: dict[int, Any]) -> None:
    for signum, handler in previous.items():
        signal.signal(signum, handler)

def validate_port_value(port: int | None) -> None:
    if port is None:
        return
    if not PORT_MINIMUM <= port <= PORT_MAXIMUM:
        raise PreviewUsageError(f"--port 必须是 {PORT_MINIMUM}..{PORT_MAXIMUM}")


def port_problem(port: int) -> str | None:
    """在 loopback 上试绑定 exact 端口；被占用或不可绑定时返回人可读原因。"""

    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind((LOOPBACK_HOST, port))
    except OSError as error:
        return f"端口 {port} 无法在 {LOOPBACK_HOST} 绑定（{error.strerror or error}）"
    finally:
        probe.close()
    return None


def allocate_port() -> int:
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind((LOOPBACK_HOST, 0))
        return int(probe.getsockname()[1])
    finally:
        probe.close()


def sync_guard(sync: HostSync | None) -> None:
    """启动等待与运行监视共用：sync blocked 或子进程退出即失败关闭。"""

    if sync is None:
        return
    blocked = sync.blocked_reason()
    if blocked is not None:
        sync.emit_log_tail()
        raise PreviewError(f"sync 失败关闭：{blocked}", EXIT_RUNTIME)
    if not sync.alive():
        sync.emit_log_tail()
        reason = (
            sync.status().get("reason", "unknown") if sync.revision_changed() else "unknown"
        )
        raise PreviewError(
            f"宿主 sync 提前退出（exit={sync.exit_code()}）：{reason}", EXIT_RUNTIME
        )


def command_executable(command: list[str]) -> str:
    executable = re.split(r"[\\/]", command[0])[-1].casefold()
    return re.sub(r"\.(?:bat|cmd|exe)$", "", executable)


def version_output(argv: list[str], environment: dict[str, str]) -> str | None:
    try:
        result = subprocess.run(
            argv,
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            text=True,
            timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip().splitlines()[0].strip() if result.stdout.strip() else ""


def parse_node_version(text: str) -> tuple[int, int] | None:
    match = re.match(r"v?(\d+)\.(\d+)", text)
    if match is None:
        return None
    return int(match.group(1)), int(match.group(2))


class DockerRuntime:
    """Docker Compose 运行时：容器只提供 Preview 页面环境。"""

    kind = "docker"

    def __init__(
        self,
        repo: Path,
        settings: dict[str, Any],
        compose_file: Path,
        scenario: str,
        port: int | None,
    ) -> None:
        self.repo = repo
        self.settings = settings
        self.scenario = scenario
        self.port = port
        self.environment = compose_environment(settings, scenario, port)
        self.base = compose_base(settings, compose_file)
        self.compose_version = ""
        self.rows: list[dict[str, Any]] = []
        self.started = False

    def preflight(self, canonical_bindings: list[tuple[str, dict[str, Any]]]) -> None:
        problems: list[str] = []
        if self.port is not None:
            problem = port_problem(self.port)
            if problem:
                problems.append(problem)
        if problems:
            raise PreviewError("；".join(problems), EXIT_ENVIRONMENT)
        self.compose_version = require_docker(self.environment)
        services = compose_services(self.base, self.environment)
        canonical_services = {f"preview_{entity_id}" for entity_id, _ in canonical_bindings}
        if set(services) != canonical_services:
            raise PreviewError(
                "Docker Compose 渲染的静态服务全集与 fresh Project Facts 不一致："
                f"actual={services} expected={sorted(canonical_services)}"
            )

    def check_payload(self) -> dict[str, Any]:
        return {"compose_version": self.compose_version}

    def down(self) -> dict[str, Any]:
        return stop_services(self.base, self.environment)

    def ensure_no_existing(self) -> None:
        if service_rows(self.base, self.environment):
            raise PreviewError(
                "当前项目已有 Compose Preview 资源；先用唯一入口 --down 收尾",
                EXIT_RUNTIME,
                preserve_runtime_result=True,
            )

    def launch(
        self,
        selected: list[tuple[str, dict[str, Any]]],
        expected: dict[str, dict[str, Any]],
        timeout_seconds: int,
        stop_state: dict[str, int | None],
        sync: HostSync | None,
    ) -> None:
        prepare_dependency_mountpoints(self.repo, selected)
        self.rows = launch_and_wait(
            self.base,
            self.environment,
            sorted(expected),
            expected,
            timeout_seconds,
            stop_state,
            sync,
        )
        self.started = True

    def observe(self, expected: dict[str, dict[str, Any]]) -> None:
        current = service_rows(self.base, self.environment)
        states = {
            str(row.get("Service", "")): str(row.get("State", "")).casefold()
            for row in current
        }
        failed = sorted(service for service in expected if states.get(service) != "running")
        if failed:
            emit_runtime_failure_log_tails(self.base, self.environment, failed, set(expected))
            raise PreviewError(f"Preview 运行中 Compose service 退出：{failed}", EXIT_RUNTIME)

    def result(
        self,
        evidence: dict[str, str],
        selected: list[tuple[str, dict[str, Any]]],
    ) -> dict[str, Any]:
        return build_result(
            self.repo,
            evidence,
            selected,
            self.scenario,
            self.settings,
            self.rows,
            image_rows(self.rows, self.environment),
            "requested" if self.port else "dynamic",
        )

    def stop(self) -> dict[str, Any]:
        if not self.started:
            return {"ok": True, "detail": "not-started"}
        self.started = False
        return stop_services(self.base, self.environment)


class LocalRuntime:
    """宿主 node 工具链运行时：不依赖 Docker，依赖写入 entity working_directory。"""

    kind = "local"

    def __init__(
        self,
        repo: Path,
        settings: dict[str, Any],
        scenario: str,
        port: int | None,
        private_directory: Path,
    ) -> None:
        self.repo = repo
        self.settings = settings
        self.scenario = scenario
        self.requested_port = port
        self.port: int | None = port
        self.private_directory = private_directory
        self.log_path = private_directory / "preview.log"
        self.environment = dict(os.environ)
        self.process: subprocess.Popen[bytes] | None = None
        self._log_handle = None
        self.toolchain: dict[str, Any] = {}
        self.url = ""
        self.entity_id = ""
        self.binding: dict[str, Any] = {}
        self.argv: list[str] = []
        self.launcher: list[str] = []
        self.healthy = False

    # ---- preflight

    def preflight_problems(self, binding: dict[str, Any]) -> list[str]:
        problems: list[str] = []
        path = self.environment.get("PATH")
        if shutil.which("git", path=path) is None:
            problems.append("宿主 PATH 中缺少 git")
        node = shutil.which("node", path=path)
        if node is None:
            problems.append(
                f"宿主 PATH 中缺少 node（需要 >= {MINIMUM_NODE[0]}.{MINIMUM_NODE[1]}）"
            )
        else:
            version = version_output(["node", "--version"], self.environment)
            parsed = parse_node_version(version or "")
            if parsed is None:
                problems.append("无法读取 node 版本（node --version 失败）")
            elif parsed < MINIMUM_NODE:
                problems.append(
                    f"node 版本过低：{version}，需要 >= {MINIMUM_NODE[0]}.{MINIMUM_NODE[1]}"
                )
            else:
                self.toolchain["node"] = version
        manager = command_executable(binding["preview_command"])
        working = self.repo / binding["working_directory"]
        launcher: list[str] = []
        if manager in PACKAGE_MANAGER_LOCKFILES:
            if shutil.which(manager, path=path) is not None:
                launcher = [manager]
            elif shutil.which("corepack", path=path) is not None:
                launcher = ["corepack", manager]
            else:
                problems.append(
                    f"宿主 PATH 中缺少 {manager}，也没有 corepack 可以提供它"
                )
            if launcher:
                version = version_output([*launcher, "--version"], self.environment)
                if version is None:
                    problems.append(f"无法执行 {' '.join(launcher)} --version")
                else:
                    self.toolchain["package_manager"] = {
                        "name": manager,
                        "via": "corepack" if launcher[0] == "corepack" else "path",
                        "version": version,
                    }
            lockfiles = PACKAGE_MANAGER_LOCKFILES[manager]
            if not any((working / name).is_file() for name in lockfiles):
                problems.append(
                    f"{binding['working_directory']} 缺少 {manager} lockfile（{' 或 '.join(lockfiles)}）"
                )
        else:
            if shutil.which(binding["preview_command"][0], path=path) is None:
                problems.append(f"宿主 PATH 中缺少 Preview command {binding['preview_command'][0]!r}")
            else:
                launcher = [binding["preview_command"][0]]
        if self.requested_port is not None:
            problem = port_problem(self.requested_port)
            if problem:
                problems.append(problem)
        self.launcher = launcher
        return problems

    def preflight(self, selected: list[tuple[str, dict[str, Any]]]) -> None:
        (entity_id, binding), = selected
        self.entity_id = entity_id
        self.binding = binding
        problems = self.preflight_problems(binding)
        if problems:
            raise PreviewError(
                "local 运行时环境不完整，缺项一次列全：\n  - " + "\n  - ".join(problems),
                EXIT_ENVIRONMENT,
            )

    def check_payload(self) -> dict[str, Any]:
        return {"toolchain": self.toolchain}

    # ---- lifecycle

    def ensure_no_existing(self) -> None:
        previous = existing_local_run(self.repo)
        if previous is not None:
            raise PreviewError(
                f"当前项目已有 local Preview 进程（pid={previous['pid']}，entity="
                f"{previous.get('entity', '?')}）；先用唯一入口 --runtime local --down 收尾",
                EXIT_RUNTIME,
                preserve_runtime_result=True,
            )

    def process_environment(self, health_path: str) -> dict[str, str]:
        environment = dict(self.environment)
        environment.update(
            {
                "EXPERIENCE_HEALTHCHECK_PATH": health_path,
                "EXPERIENCE_PREVIEW": "1",
                "EXPERIENCE_SCENARIO": self.scenario,
                "HOST": LOOPBACK_HOST,
                "PORT": str(self.port),
                "VITE_EXPERIENCE_SCENARIO": self.scenario,
            }
        )
        return environment

    def install_dependencies(self, working: Path) -> None:
        manager = command_executable(self.binding["preview_command"])
        if manager not in PACKAGE_MANAGER_INSTALL:
            return
        argv = [*self.launcher, *PACKAGE_MANAGER_INSTALL[manager]]
        try:
            with open(self.log_path, "ab") as handle:
                handle.write(f"$ {' '.join(argv)}\n".encode("utf-8"))
                result = subprocess.run(
                    argv,
                    cwd=str(working),
                    env=self.environment,
                    stdin=subprocess.DEVNULL,
                    stdout=handle,
                    stderr=subprocess.STDOUT,
                    check=False,
                    timeout=LOCAL_INSTALL_TIMEOUT_SECONDS,
                )
        except OSError as error:
            raise PreviewError(f"无法执行依赖安装 {argv[0]}：{error}", EXIT_ENVIRONMENT) from error
        except subprocess.TimeoutExpired as error:
            raise PreviewError(
                f"依赖安装超时（{LOCAL_INSTALL_TIMEOUT_SECONDS}s）：{' '.join(argv)}", EXIT_RUNTIME
            ) from error
        if result.returncode != 0:
            self.emit_log_tail(application_started=False)
            raise PreviewError(
                f"{manager} 依赖安装失败：exit={result.returncode}；应用进程尚未启动",
                EXIT_RUNTIME,
            )

    def launch(
        self,
        selected: list[tuple[str, dict[str, Any]]],
        expected: dict[str, dict[str, Any]],
        timeout_seconds: int,
        stop_state: dict[str, int | None],
        sync: HostSync | None,
    ) -> None:
        (entity_id, binding), = selected
        working = self.repo / binding["working_directory"]
        health_path = binding["healthcheck_path"]
        if stop_state["signum"] is not None:
            raise PreviewInterrupted("Preview 启动被信号中止")
        try:
            if sync is not None:
                sync.start()
            self.install_dependencies(working)
            if stop_state["signum"] is not None:
                raise PreviewInterrupted("Preview 启动被信号中止")
            if self.port is None:
                self.port = allocate_port()
            self.argv = render_command(
                binding["preview_command"], self.scenario, LOOPBACK_HOST, self.port
            )
            argv = [*self.launcher, *self.argv[1:]] if self.launcher else list(self.argv)
            self.url = f"http://{LOOPBACK_HOST}:{self.port}"
            try:
                self._log_handle = open(self.log_path, "ab")
                self._log_handle.write(f"$ {' '.join(argv)}\n".encode("utf-8"))
                self._log_handle.flush()
                self.process = subprocess.Popen(
                    argv,
                    cwd=str(working),
                    env=self.process_environment(health_path),
                    stdin=subprocess.DEVNULL,
                    stdout=self._log_handle,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )
            except OSError as error:
                raise PreviewError(
                    f"无法启动 Preview command {argv[0]!r}：{error}", EXIT_ENVIRONMENT
                ) from error
            deadline = time.monotonic() + timeout_seconds
            while time.monotonic() < deadline:
                if stop_state["signum"] is not None:
                    raise PreviewInterrupted("Preview 启动被信号中止")
                sync_guard(sync)
                if self.process.poll() is not None:
                    self.emit_log_tail(application_started=False)
                    raise PreviewError(
                        f"Preview command 在健康回读前退出（exit={self.process.returncode}）；"
                        "应用进程未证明已运行",
                        EXIT_RUNTIME,
                    )
                if http_ready(self.url, health_path) and (sync is None or sync.ready()):
                    self.healthy = True
                    return
                time.sleep(0.2)
            self.emit_log_tail(application_started=False)
            raise PreviewError(
                f"等待 local Preview 健康超时：{self.url}{health_path}", EXIT_RUNTIME
            )
        except BaseException:
            if sync is not None:
                sync.stop()
            self.stop()
            raise

    def alive(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def observe(self, expected: dict[str, dict[str, Any]]) -> None:
        if not self.alive():
            self.emit_log_tail(application_started=True)
            code = None if self.process is None else self.process.returncode
            raise PreviewError(f"Preview 运行中 local 进程退出（exit={code}）", EXIT_RUNTIME)

    def emit_log_tail(self, *, application_started: bool) -> None:
        try:
            body = self.log_path.read_bytes().decode("utf-8", errors="replace").strip()
        except OSError:
            body = ""
        if len(body) > LOCAL_LOG_MAX_CHARS:
            body = body[-LOCAL_LOG_MAX_CHARS:]
        if application_started:
            heading = (
                "experience-preview: 应用日志尾部"
                f"（已通过健康回读证明应用进程曾启动，runtime=local, chars<={LOCAL_LOG_MAX_CHARS}）"
            )
        else:
            heading = (
                "experience-preview: local 进程输出尾部"
                f"（未证明应用进程已启动，仅作补充 evidence，chars<={LOCAL_LOG_MAX_CHARS}）"
            )
        print(heading, file=sys.stderr, flush=True)
        print(body or "<无输出>", file=sys.stderr, flush=True)

    def result(
        self,
        evidence: dict[str, str],
        selected: list[tuple[str, dict[str, Any]]],
    ) -> dict[str, Any]:
        (entity_id, binding), = selected
        service = f"preview_{entity_id}"
        pid = self.process.pid if self.process is not None else None
        result = base_result(
            self.repo,
            evidence,
            selected,
            self.scenario,
            "local",
            "requested" if self.requested_port else "dynamic",
        )
        result.update(
            {
                "entity": entity_id,
                "toolchain": self.toolchain,
                "services": [
                    {"name": service, "state": "running", "pid": pid, "runtime": "local"}
                ],
                "entities": [
                    {
                        "entity_id": entity_id,
                        "service": service,
                        "argv": list(self.argv),
                        "working_directory": binding["working_directory"],
                        "url": self.url,
                        "healthcheck": {"path": binding["healthcheck_path"], "status": "pass"},
                        "process": {"pid": pid},
                    }
                ],
                "sync": safe_sync_result(self.repo, self.settings["sync_enabled"]),
            }
        )
        return result

    def stop(self) -> dict[str, Any]:
        outcome: dict[str, Any] = {"ok": True, "exit": None}
        process = self.process
        if process is not None:
            outcome["exit"] = process.poll()
            if process.poll() is None:
                outcome = terminate_process_group(process.pid, process)
        if self._log_handle is not None:
            try:
                self._log_handle.close()
            except OSError:
                pass
            self._log_handle = None
        return outcome

    def down(self) -> dict[str, Any]:
        previous = existing_local_run(self.repo)
        if previous is None:
            return {"ok": True, "detail": "no-running-local-preview"}
        outcome = terminate_process_group(previous["pid"], None)
        if not outcome["ok"]:
            # 进程仍存活时保留 ready 记录，下一次 --down 继续按同一 pid 回收。
            return outcome
        try:
            recorded = strict_json(
                self.repo / "experience/preview/runtime/last-run.json", "runtime result"
            )
            recorded["status"] = "stopped"
            recorded["ready"] = False
            recorded["cleanup"] = outcome
            write_result(self.repo, recorded)
        except PreviewError:
            pass
        return outcome


def process_alive(pid: int) -> bool:
    """进程存在且不是 zombie；孤儿 zombie 在无 init 回收的容器里会长期残留。"""

    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    status = Path(f"/proc/{pid}/status")
    try:
        for line in status.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("State:"):
                return not line.split(":", 1)[1].strip().startswith("Z")
    except OSError:
        pass
    return True


def existing_local_run(repo: Path) -> dict[str, Any] | None:
    """读取上次 local 结果；status=ready 且记录的进程仍存活时返回其 pid 与 entity。"""

    path = repo / "experience/preview/runtime/last-run.json"
    if path.is_symlink() or not path.is_file():
        return None
    try:
        recorded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None
    if not isinstance(recorded, dict) or recorded.get("runtime") != "local":
        return None
    if recorded.get("status") != "ready":
        return None
    pid = None
    for service in recorded.get("services") or []:
        if isinstance(service, dict) and isinstance(service.get("pid"), int):
            pid = service["pid"]
    if pid is None or not process_alive(pid):
        return None
    return {"pid": pid, "entity": recorded.get("entity")}


def terminate_process_group(
    pid: int,
    process: subprocess.Popen[bytes] | None,
) -> dict[str, Any]:
    outcome: dict[str, Any] = {"ok": True, "exit": None, "pid": pid}

    def signal_group(signum: int) -> None:
        if hasattr(os, "killpg"):
            os.killpg(pid, signum)
        else:  # pragma: no cover - Windows 无进程组信号
            os.kill(pid, signum)

    def wait_exit() -> bool:
        if process is not None:
            try:
                process.wait(timeout=LOCAL_STOP_TIMEOUT_SECONDS)
                return True
            except subprocess.TimeoutExpired:
                return False
        deadline = time.monotonic() + LOCAL_STOP_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            if not process_alive(pid):
                return True
            time.sleep(0.1)
        return False

    try:
        signal_group(signal.SIGTERM)
        if not wait_exit():
            signal_group(getattr(signal, "SIGKILL", signal.SIGTERM))
            if not wait_exit():
                outcome["ok"] = False
    except ProcessLookupError:
        pass
    except OSError:
        outcome["ok"] = False
    if process is not None:
        outcome["exit"] = process.poll()
    return outcome


class PreviewArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:  # type: ignore[override]
        raise PreviewUsageError(message)


USAGE_EXAMPLES = """示例：
  python3 experience/preview/start.py --entity web_admin
  python3 experience/preview/start.py --entity web_admin --scenario empty
  python3 experience/preview/start.py --entity web_admin --runtime local --port 5173
  python3 experience/preview/start.py --entity web_admin --sync --sync-interval-seconds 30
  python3 experience/preview/start.py --entity web_admin --runtime local --check
  python3 experience/preview/start.py --down
  python3 experience/preview/start.py --runtime local --down

说明：
  entity 只能从 facts/entities/*.yaml 中已有 Experience binding 的 UI entity 选择，一次
  启动一个。仓库地址与分支取当前 checkout 的 origin 与 attached branch，不需要配置。
  --runtime docker（默认）用 Docker Compose 提供 Preview 容器；--runtime local 不依赖
  Docker，先检查宿主 git / node / package manager / lockfile / 端口，缺项一次列全后退出，
  环境完整才用宿主工具链安装依赖并启动。两种运行时不互相自动降级。
  --sync 在宿主以子进程运行 experience/preview/sync.sh，只做 fast-forward，git 授权
  复用运行环境已有的凭证助手或 netrc；入口不读取、生成或注入任何凭证。
"""


def build_parser() -> PreviewArgumentParser:
    parser = PreviewArgumentParser(
        prog="experience/preview/start.py",
        description=(
            "项目唯一 Experience Preview 入口：按 --entity 启动一个 UI entity 的 Scenario "
            "composition，完成 loopback 健康回读并写入 experience/preview/runtime/last-run.json。"
        ),
        epilog=USAGE_EXAMPLES,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--entity",
        metavar="ENTITY_ID",
        help="本次启动的 UI entity identity（必选；--down 时忽略）",
    )
    parser.add_argument(
        "--scenario",
        default="default",
        metavar="SCENARIO",
        help="传给 Scenario Provider 的场景 identity，默认 default",
    )
    parser.add_argument(
        "--runtime",
        choices=RUNTIMES,
        default=DEFAULT_RUNTIME,
        help="运行时：docker（默认，Docker Compose）或 local（宿主 node 工具链），不自动降级",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        metavar="PORT",
        help=f"宿主 loopback 端口，{PORT_MINIMUM}..{PORT_MAXIMUM}；不指定时动态分配",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="启用宿主 sync：把当前 checkout fast-forward 到 exact origin branch，默认关闭",
    )
    parser.add_argument(
        "--sync-interval-seconds",
        type=int,
        default=30,
        metavar="N",
        help="sync 轮询间隔秒数，1..3600，默认 30",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=300,
        metavar="N",
        help="等待 service 健康的超时秒数，1..3600，默认 300",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="只验证静态发现、binding、Compose 与所选运行时的前置条件，不启动 service",
    )
    parser.add_argument(
        "--down",
        action="store_true",
        help="只清理所选运行时留下的 Preview 资源（docker：Compose project；local：记录的进程）",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="就绪后额外以 JSON 输出本次 runtime result",
    )
    return parser


def parse_arguments(parser: PreviewArgumentParser, actual: list[str]) -> argparse.Namespace:
    arguments = parser.parse_args(actual)
    if arguments.down:
        return arguments
    if not arguments.entity:
        raise PreviewUsageError("缺少 --entity <ENTITY_ID>")
    if not ENTITY_ID.fullmatch(arguments.entity):
        raise PreviewUsageError(
            "--entity 必须是小写字母开头、只含小写字母/数字/下划线的 entity identity"
        )
    if not SCENARIO_ID.fullmatch(arguments.scenario):
        raise PreviewUsageError("--scenario 必须是 1..64 位安全 identity")
    if not 1 <= arguments.timeout_seconds <= 3600:
        raise PreviewUsageError("--timeout-seconds 必须是 1..3600")
    if not 1 <= arguments.sync_interval_seconds <= 3600:
        raise PreviewUsageError("--sync-interval-seconds 必须是 1..3600")
    validate_port_value(arguments.port)
    return arguments


def build_runtime(
    kind: str,
    repo: Path,
    settings: dict[str, Any],
    compose_file: Path,
    scenario: str,
    port: int | None,
    private_directory: Path,
) -> DockerRuntime | LocalRuntime:
    if kind == "local":
        return LocalRuntime(repo, settings, scenario, port, private_directory)
    return DockerRuntime(repo, settings, compose_file, scenario, port)


def run(argv: list[str] | None = None) -> int:
    actual = list(sys.argv[1:] if argv is None else argv)
    if sys.version_info < MINIMUM_PYTHON:
        print("Experience Preview 需要 Python 3.10+", file=sys.stderr)
        return EXIT_ENVIRONMENT
    parser = build_parser()
    try:
        arguments = parse_arguments(parser, actual)
    except PreviewUsageError as error:
        print(parser.format_help(), file=sys.stderr)
        print(f"experience-preview: 参数错误：{error}", file=sys.stderr)
        return EXIT_CONFIG
    stop_state: dict[str, int | None] = {"signum": None}
    previous_handlers: dict[int, Any] = {}
    started = False
    result: dict[str, Any] | None = None
    initial_decision_digest = ""
    initial_source_evidence: dict[str, str] | None = None
    stable_source_evidence: dict[str, str] | None = None
    repo: Path | None = None
    selected: list[tuple[str, dict[str, Any]]] = []
    canonical_bindings: list[tuple[str, dict[str, Any]]] = []
    sync: HostSync | None = None
    runtime: DockerRuntime | LocalRuntime | None = None
    private_directory = tempfile.TemporaryDirectory(prefix="experience-preview-")
    try:
        script = Path(__file__).resolve()
        facts = git_facts(script.parent)
        repo = Path(facts["repo_root"])
        try:
            script_relative = script.relative_to(repo).as_posix()
        except ValueError as error:
            raise PreviewError("Preview 入口不在当前 Git 项目内") from error
        if script_relative != "experience/preview/start.py":
            raise PreviewError(
                "Preview 人工入口必须位于 experience/preview/start.py"
            )
        preview = require_preview_bundle(repo)
        require_local_ignores(repo)
        bindings = load_bindings(repo)
        canonical_bindings = select_bindings(bindings, None)
        for entity_id, binding in canonical_bindings:
            validate_binding(repo, script_relative, entity_id, binding)
        settings = resolve_settings(
            facts,
            sync_enabled=bool(arguments.sync) and not arguments.down,
            sync_interval_seconds=arguments.sync_interval_seconds,
        )
        if not arguments.down:
            selected = select_bindings(bindings, [arguments.entity])
        compose_file = preview / "compose.yaml"
        validate_static_compose(compose_file, canonical_bindings)
        runtime = build_runtime(
            arguments.runtime,
            repo,
            settings,
            compose_file,
            arguments.scenario,
            arguments.port,
            Path(private_directory.name),
        )
        if arguments.down:
            stopped = runtime.down()
            print(f"experience-preview: 已停止（runtime={runtime.kind}, ok={stopped['ok']}）")
            return EXIT_OK if stopped["ok"] else EXIT_RUNTIME
        if not arguments.check:
            previous_handlers = install_stop_handlers(stop_state)
        if isinstance(runtime, DockerRuntime):
            runtime.preflight(canonical_bindings)
        else:
            runtime.preflight(selected)
        expected = {
            f"preview_{entity_id}": {
                "entity_id": entity_id,
                "healthcheck_path": binding["healthcheck_path"],
            }
            for entity_id, binding in selected
        }
        if settings["sync_enabled"]:
            sync = HostSync(repo, settings, Path(private_directory.name))
            sync.preflight()
        if arguments.check:
            print(
                canonical_bytes(
                    {
                        "schema": "wf-prod.experience_preview_check",
                        "schema_version": 1,
                        "status": "pass",
                        "runtime": runtime.kind,
                        **runtime.check_payload(),
                        "entities": [entity_id for entity_id, _ in selected],
                        "port": arguments.port,
                        "sync": "enabled" if settings["sync_enabled"] else "disabled",
                    }
                ).decode("utf-8")
            )
            return EXIT_OK
        if settings["sync_enabled"]:
            ensure_sync_clean(repo)
        initial_decision_digest = runtime_decision_digest(repo)
        if not settings["sync_enabled"]:
            initial_source_evidence = source_evidence(repo, selected)
        runtime.ensure_no_existing()
        runtime.launch(selected, expected, arguments.timeout_seconds, stop_state, sync)
        started = True
        if stop_state["signum"] is not None:
            raise PreviewInterrupted("Preview 启动被信号中止")
        if settings["sync_enabled"]:
            ensure_sync_clean(repo)
        if runtime_decision_digest(repo) != initial_decision_digest:
            raise PreviewError(
                "Preview runtime decision inputs 在启动窗口发生变化；"
                "本次已停止，请从当前稳定输入重新运行唯一入口",
                EXIT_RUNTIME,
            )
        stable_source_evidence = source_evidence(repo, selected)
        if (
            initial_source_evidence is not None
            and stable_source_evidence != initial_source_evidence
        ):
            raise PreviewError(
                "Preview source evidence 在启动窗口发生变化；"
                "本次已停止，请从当前稳定输入重新运行唯一入口",
                EXIT_RUNTIME,
            )
        result = runtime.result(stable_source_evidence, selected)
        if settings["sync_enabled"]:
            ensure_sync_clean(repo)
        if runtime_decision_digest(repo) != initial_decision_digest:
            raise PreviewError(
                "Preview runtime decision inputs 在 result 写入窗口发生变化；"
                "本次已停止，请从当前稳定输入重新运行唯一入口",
                EXIT_RUNTIME,
            )
        confirmed_source_evidence = source_evidence(repo, selected)
        if confirmed_source_evidence != stable_source_evidence:
            raise PreviewError(
                "Preview source evidence 在 result 写入窗口发生变化；"
                "本次已停止，请从当前稳定输入重新运行唯一入口",
                EXIT_RUNTIME,
            )
        if stop_state["signum"] is not None:
            raise PreviewInterrupted("Preview 启动被信号中止")
        path = write_result(repo, result)
        if stop_state["signum"] is not None:
            path.unlink(missing_ok=True)
            raise PreviewInterrupted("Preview 启动被信号中止")
        for entity in result["entities"]:
            print(f"experience-preview: {entity['entity_id']} {entity['url']}", flush=True)
        print(
            f"experience-preview: 就绪（runtime={runtime.kind}），结果见 {path}；Ctrl-C 停止",
            flush=True,
        )
        if arguments.json:
            print(canonical_bytes(result).decode("utf-8"), flush=True)
        while stop_state["signum"] is None:
            runtime.observe(expected)
            sync_guard(sync)
            time.sleep(0.5)
        cleanup: dict[str, Any] = {}
        if sync is not None:
            cleanup["sync"] = sync.stop()
        stopped = runtime.stop()
        cleanup.update(stopped)
        started = False
        result["status"] = "stopped"
        result["ready"] = False
        result["sync"] = safe_sync_result(repo, settings["sync_enabled"])
        result["cleanup"] = cleanup
        write_result(repo, result)
        print(f"experience-preview: 已停止（ok={stopped['ok']}）")
        return EXIT_OK if stopped["ok"] else EXIT_RUNTIME
    except PreviewInterrupted:
        if sync is not None:
            sync.stop()
        if started and runtime is not None:
            runtime.stop()
        return EXIT_OK
    except PreviewError as error:
        cleanup: dict[str, Any] | None = None
        if sync is not None:
            sync.stop()
        if started and runtime is not None:
            cleanup = runtime.stop()
        if (
            not arguments.check
            and not arguments.down
            and repo is not None
            and selected
            and not error.preserve_runtime_result
        ):
            failure_evidence = stable_source_evidence or initial_source_evidence
            try:
                failure_evidence = source_evidence(repo, selected)
            except PreviewError:
                pass
            failure = {
                "schema": "wf-prod.experience_preview_result",
                "schema_version": 2,
                "status": "failed",
                "ready": False,
                "runtime": arguments.runtime,
                "repo_root": str(repo),
                "preview_entrypoint": "experience/preview/start.py",
                "selected_entities": [entity_id for entity_id, _ in selected],
                "failure": str(error),
            }
            if failure_evidence is not None:
                failure.update(failure_evidence)
            else:
                failure["source_sha"] = optional_git_output(
                    repo, ["rev-parse", "HEAD"]
                )
            if cleanup is not None:
                failure["cleanup"] = cleanup
            try:
                write_result(repo, failure)
            except PreviewError:
                pass
        print(f"experience-preview: {error}", file=sys.stderr)
        return error.code
    except KeyboardInterrupt:
        if sync is not None:
            sync.stop()
        if started and runtime is not None:
            runtime.stop()
        return 130
    finally:
        if previous_handlers:
            restore_stop_handlers(previous_handlers)
        private_directory.cleanup()


def main() -> int:
    return run()


if __name__ == "__main__":
    raise SystemExit(main())
