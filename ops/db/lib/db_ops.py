#!/usr/bin/env python3
"""Fixed dispatcher runtime for a self-contained project-owned database operations package."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile
from typing import Any

from contracts import (
    CONFORMANCE_SCOPE,
    LOCAL_ROOT,
    PROFILE_IDENTITY,
    TARGETS_FILE,
    TARGETS_TEMPLATE_FILE,
    LEGACY_TARGETS_FILE,
    LOCAL_PATHS,
    configuration_arguments,
    select_configuration,
    ContractViolation,
    secret_scalars,
    sensitive_property,
    target_projection,
    targets_template_document,
    parse_targets_yaml,
    validate_input_schema,
    validate_material,
    validate_operation_input,
    validate_runner_source,
    validate_targets,
    operation_files,
    validate_complete_operations,
    validate_operation_metadata,
    is_backup_operation,
    validate_profile,
    validate_report,
    validate_diagnosis,
    validate_dataset_metrics,
    DIAGNOSIS_PATHS,
)


class DbOpsError(ValueError):
    """A public, secret-free contract failure."""

    exit_code = 2


class DbOpsDrift(DbOpsError):
    exit_code = 1


class DbOpsUpdateRefused(DbOpsError):
    exit_code = 3


class DbOpsManualRequired(DbOpsError):
    exit_code = 4


class DbOpsResultUnknown(DbOpsManualRequired):
    """An executed stage returned no verifiable structured result."""


class DbOpsPreflightBlocked(DbOpsError):
    exit_code = 5


class DbOpsConfigurationError(DbOpsError):
    exit_code = 6


SCHEMA_MANIFEST = "wf-prod.database_operations_manifest"
SCHEMA_PLAN = "wf-prod.database_operations_plan"
SCHEMA_AUTHORIZATION = "wf-prod.database_operations_authorization"
SCHEMA_EVIDENCE = "wf-prod.database_operations_evidence"
TARGETS_MAX_BYTES = 262144
# database.yaml carries the password: it is opened once without following
# symlinks and group/other must have no permission on it (0600 and 0400 pass).
# db-ops never changes its mode.
TARGETS_OPEN_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
# Untracked local state next to the package: transient runtime, the filled
# connection file and its optional TLS CA text. None of them is part of the
# package file closure or of any published closure.
# A failing named operation may name only a driver error code and one of the
# PEP 249 exception classes; anything else on its stdout is dropped whole.
DRIVER_EXCEPTIONS = frozenset(
    {
        "DataError",
        "DatabaseError",
        "Error",
        "IntegrityError",
        "InterfaceError",
        "InternalError",
        "NotSupportedError",
        "OperationalError",
        "ProgrammingError",
    }
)
FAILURE_OUTPUT_MAX_BYTES = 1024
def canonical_bytes(value: Any) -> bytes:
    return (
        json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n"
    ).encode("utf-8")


def digest_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def duplicate_safe_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DbOpsError(f"JSON含重复字段：{key}")
        result[key] = value
    return result


def load_json(path: Path, label: str, *, canonical: bool = False) -> Any:
    try:
        raw = path.read_bytes()
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=duplicate_safe_object)
    except DbOpsError:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise DbOpsError(f"{label}不可读或不是JSON") from error
    if canonical and raw != canonical_bytes(value):
        raise DbOpsError(f"{label}不是canonical JSON")
    return value


def safe_relative(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or value.startswith(("/", "\\")):
        raise DbOpsError(f"{label}不是安全相对路径")
    path = PurePosixPath(value)
    if path.as_posix() != value or any(part in {"", ".", ".."} for part in path.parts):
        raise DbOpsError(f"{label}不是规范化相对路径")
    return value


def regular_under(root: Path, relative: str, label: str) -> Path:
    safe_relative(relative, label)
    current = root
    for part in PurePosixPath(relative).parts:
        current = current / part
        if current.is_symlink():
            raise DbOpsError(f"{label}不得穿越symlink")
    if not current.is_file():
        raise DbOpsError(f"{label}不是regular file")
    try:
        current.resolve().relative_to(root.resolve())
    except ValueError as error:
        raise DbOpsError(f"{label}越出操作包") from error
    return current


def exact_object(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise DbOpsError(f"{label}字段不闭合")
    return value


def identifier(value: Any, label: str, *, hyphen: bool = False) -> str:
    if not isinstance(value, str) or not value or len(value) > 64:
        raise DbOpsError(f"{label}无效")
    allowed = "abcdefghijklmnopqrstuvwxyz0123456789_-" if hyphen else "abcdefghijklmnopqrstuvwxyz0123456789_"
    if value[0] not in "abcdefghijklmnopqrstuvwxyz" or any(char not in allowed for char in value):
        raise DbOpsError(f"{label}无效")
    return value


def profile_identifier(value: Any, label: str) -> str:
    if not isinstance(value, str) or PROFILE_IDENTITY.fullmatch(value) is None:
        raise DbOpsError(f"{label}无效")
    return value


def walk_public_keys(value: Any, label: str) -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            if not isinstance(key, str):
                raise DbOpsError(f"{label}含非字符串key")
            if sensitive_property(key):
                raise DbOpsError(f"{label}含禁止字段：{key}")
            walk_public_keys(nested, label)
    elif isinstance(value, list):
        for nested in value:
            walk_public_keys(nested, label)


def manifest(root: Path) -> tuple[dict[str, Any], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    value = exact_object(
        load_json(root / "manifest.json", "manifest", canonical=True),
        {"schema", "schema_version", "dispatcher", "profile", "operations", "entities"},
        "manifest",
    )
    if value["schema"] != SCHEMA_MANIFEST or value["schema_version"] != 1 or value["dispatcher"] != "db-ops":
        raise DbOpsError("manifest schema/version/dispatcher不兼容")
    profile_identifier(value["profile"], "manifest.profile")
    if not isinstance(value["operations"], list) or not value["operations"]:
        raise DbOpsError("manifest operations必须非空")
    operations: dict[str, dict[str, Any]] = {}
    for item in value["operations"]:
        try:
            operation = validate_operation_metadata(item)
        except ContractViolation as error:
            raise DbOpsError(str(error)) from error
        name = identifier(operation["name"], "operation.name", hyphen=True)
        if operation["mode"] not in {"read", "write"} or name in operations:
            raise DbOpsError("operation identity/mode不唯一")
        runner = regular_under(root, operation["runner"], f"operation {name} 操作脚本")
        if (
            not operation["runner"].startswith("operations/")
            or not operation["runner"].endswith(".py")
            or stat.S_IMODE(runner.stat().st_mode) & 0o111 == 0
        ):
            raise DbOpsError(f"operation {name} 操作脚本路径/mode无效")
        schema_path = regular_under(
            root,
            operation["input_schema"],
            f"operation {name} input schema",
        )
        if (
            not operation["input_schema"].startswith("operations/")
            or not operation["input_schema"].endswith(".input.schema.json")
        ):
            raise DbOpsError(f"operation {name} input schema path无效")
        try:
            validate_input_schema(
                load_json(
                    schema_path,
                    f"operation {name} input schema",
                    canonical=True,
                ),
                f"operation {name} input schema",
            )
            validate_runner_source(runner, f"operation {name} 操作脚本")
            if "example_input" in operation:
                validate_operation_input(
                    load_json(regular_under(root, operation["example_input"], "example input"), "example input", canonical=True),
                    load_json(schema_path, "input schema", canonical=True),
                    "example input",
                )
        except ContractViolation as error:
            raise DbOpsError(str(error)) from error
        operations[name] = operation
    if list(operations) != sorted(operations):
        raise DbOpsError("manifest operations必须按name排序")
    if not isinstance(value["entities"], list) or not value["entities"]:
        raise DbOpsError("manifest entities必须非空")
    entities: dict[str, dict[str, Any]] = {}
    for item in value["entities"]:
        entity = exact_object(item, {"entity_id", "evidence", "operations"}, "entity")
        entity_id = identifier(entity["entity_id"], "entity.entity_id")
        if entity_id in entities:
            raise DbOpsError("manifest entity重复")
        if not isinstance(entity["operations"], list) or not entity["operations"]:
            raise DbOpsError(f"entity {entity_id} operations必须非空")
        if entity["operations"] != sorted(set(entity["operations"])):
            raise DbOpsError(f"entity {entity_id} operations必须排序且唯一")
        if any(name not in operations for name in entity["operations"]):
            raise DbOpsError(f"entity {entity_id}引用未知operation")
        entities[entity_id] = entity
    if list(entities) != sorted(entities):
        raise DbOpsError("manifest entities必须按entity_id排序")
    return value, operations, entities


def profile(root: Path, profile_id: str) -> dict[str, Any]:
    profile_identifier(profile_id, "profile")
    value = load_json(root / "profiles" / f"{profile_id}.json", f"profile {profile_id}", canonical=True)
    try:
        validate_profile(value, f"profile {profile_id}")
    except ContractViolation as error:
        raise DbOpsError(str(error)) from error
    if value["profile_id"] != profile_id:
        raise DbOpsError(f"profile {profile_id}不兼容")
    return value


def package_profile(root: Path) -> tuple[str, dict[str, Any]]:
    """The package's single declared profile: a generation-time declaration only.

    It lists protocol families/versions the scripts must support and the shared
    compatibility flags; it is never compared against the connected server's
    version and never gates a connection.
    """

    value, _, _ = manifest(root)
    return value["profile"], profile(root, value["profile"])


def git_tracked(root: Path, relatives: list[str]) -> list[str]:
    """Paths among ``relatives`` (relative to the package root) that Git tracks.

    Outside any Git repository nothing can be tracked; any other Git failure is
    a configuration error because the untracked guarantee cannot be proven.
    Git runs untranslated (LC_ALL=C) so that the not-a-repository message
    matched below is the same in every caller locale.
    """

    if not relatives:
        return []
    try:
        completed = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z", "--", *relatives],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={**os.environ, "LC_ALL": "C"},
            check=False,
        )
    except OSError as error:
        raise DbOpsConfigurationError(f"无法运行git判断{TARGETS_FILE}的跟踪状态") from error
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", "replace")
        if completed.returncode == 128 and "not a git repository" in detail:
            return []
        raise DbOpsConfigurationError(f"无法判断{TARGETS_FILE}的Git跟踪状态")
    return sorted({item for item in completed.stdout.decode("utf-8").split("\0") if item})


def targets_location(root: Path, config: str | None) -> tuple[Path, str]:
    """The connection targets file and the name used for it in messages.

    Without --config it is database.yaml next to db-ops. --config names another
    file of the same format, relative to the caller's working directory; its
    tls_ca_file is resolved against that file's own directory.
    """

    if config is None:
        return root / TARGETS_FILE, TARGETS_FILE
    path = Path(config).absolute()
    return path, str(path)


def read_owner_only_targets(path: Path, label: str, chmod_hint: str) -> bytes:
    """Read the targets file through the one descriptor on which its mode was checked.

    The mode is checked with fstat on the descriptor that is then read, so the
    checked file is the read file. A mode that gives group/other any
    permission fails closed before any byte is read; db-ops never changes it.
    """

    try:
        descriptor = os.open(path, TARGETS_OPEN_FLAGS)
    except OSError as error:
        raise DbOpsConfigurationError(f"{label}不可读或不是普通文件") from error
    try:
        status = os.fstat(descriptor)
        if not stat.S_ISREG(status.st_mode):
            raise DbOpsConfigurationError(f"{label}必须是普通文件且不能是symlink")
        mode = stat.S_IMODE(status.st_mode)
        if mode & 0o077:
            raise DbOpsConfigurationError(
                f"{label}权限{mode:04o}过宽：只允许owner有权限，group/other不得有任何权限；"
                f"{chmod_hint} 后重试"
            )
        if status.st_size > TARGETS_MAX_BYTES:
            raise DbOpsConfigurationError(f"{label}过大")
        chunks: list[bytes] = []
        size = 0
        while size <= TARGETS_MAX_BYTES:
            chunk = os.read(descriptor, min(65536, TARGETS_MAX_BYTES + 1 - size))
            if not chunk:
                break
            chunks.append(chunk)
            size += len(chunk)
        if size > TARGETS_MAX_BYTES:
            raise DbOpsConfigurationError(f"{label}过大")
        return b"".join(chunks)
    except OSError as error:
        raise DbOpsConfigurationError(f"{label}不可读") from error
    finally:
        os.close(descriptor)


def load_targets(root: Path, config: str | None = None) -> dict[str, dict[str, Any]]:
    """Read the untracked, owner-only targets file and refuse tracked copies."""

    path, label = targets_location(root, config)
    if config is None:
        missing = f"{label}缺失；按同目录{TARGETS_TEMPLATE_FILE}填写后重试，该文件不入Git"
        chmod_hint = f"在操作包目录执行 chmod 600 {label}"
    else:
        missing = f"{label}缺失；按操作包内{TARGETS_TEMPLATE_FILE}的格式填写后重试，该文件不入Git"
        chmod_hint = f"执行 chmod 600 {label}"
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError as error:
        raise DbOpsConfigurationError(missing) from error
    except OSError as error:
        raise DbOpsConfigurationError(f"{label}不可读") from error
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
        raise DbOpsConfigurationError(f"{label}必须是普通文件且不能是symlink")
    raw = read_owner_only_targets(path, label, chmod_hint)
    try:
        value = parse_targets_yaml(raw, label)
        targets = validate_targets(value)
    except ContractViolation as error:
        raise DbOpsConfigurationError(str(error) + f"；请按操作包内 {TARGETS_TEMPLATE_FILE}检查配置") from error
    watched = [path.name] + sorted(
        {item["tls_ca_file"] for item in targets.values() if item["tls_ca_file"] is not None}
    )
    tracked = git_tracked(path.parent, watched)
    if tracked:
        if config is not None:
            tracked = [str(path.parent / item) for item in tracked]
        raise DbOpsConfigurationError(
            "连接配置被Git跟踪，实际配置不得入库：" + ", ".join(tracked)
        )
    return targets


def select_target(root: Path, entity_id: str, config: str | None = None) -> dict[str, Any]:
    targets = load_targets(root, config)
    target = targets.get(entity_id)
    if target is None:
        raise DbOpsConfigurationError(
            f"{targets_location(root, config)[1]}缺少entity {entity_id}的连接目标；按{TARGETS_TEMPLATE_FILE}补齐"
        )
    return target


def material_for(root: Path, target: dict[str, Any], config: str | None = None) -> dict[str, Any]:
    """Assemble the runner material in memory from one target and its CA file."""

    material: dict[str, Any] = {
        "host": target["host"],
        "port": target["port"],
        "database": target["database"],
        "username": target["username"],
        "password": target["password"],
    }
    ca_file = target.get("tls_ca_file")
    if ca_file is not None:
        try:
            ca_path = regular_under(
                targets_location(root, config)[0].parent, ca_file, "tls_ca_file"
            )
            ca = ca_path.read_text(encoding="utf-8")
        except DbOpsError as error:
            raise DbOpsConfigurationError(str(error)) from error
        except (OSError, UnicodeDecodeError) as error:
            raise DbOpsConfigurationError("tls_ca_file不可读或不是UTF-8文本") from error
        if not ca or len(ca) > 16384:
            raise DbOpsConfigurationError("tls_ca_file内容无效")
        material["tls"] = {"ca": ca, "check_hostname": True}
    try:
        return validate_material(material)
    except ContractViolation as error:
        raise DbOpsConfigurationError(str(error)) from error


def contains_material(value: Any, scalar: str) -> bool:
    if isinstance(value, dict):
        return any(
            contains_material(key, scalar) or contains_material(item, scalar)
            for key, item in value.items()
        )
    if isinstance(value, list):
        return any(contains_material(item, scalar) for item in value)
    if isinstance(value, str):
        encoded = json.dumps(scalar, ensure_ascii=False)
        ascii_encoded = json.dumps(scalar, ensure_ascii=True)
        representations = {
            scalar,
            encoded,
            encoded[1:-1],
            ascii_encoded,
            ascii_encoded[1:-1],
        }
        return any(item and item in value for item in representations)
    return False


def validate_secret_free(value: Any, material: dict[str, Any], label: str) -> None:
    if any(contains_material(value, scalar) for scalar in secret_scalars(material)):
        raise DbOpsError(f"{label}包含runtime material")


def validate_public(value: Any, material: dict[str, Any], label: str) -> None:
    walk_public_keys(value, label)
    validate_secret_free(value, material, label)


def validate_action_result(action: str, value: dict[str, Any], guide: Any = None) -> dict[str, Any]:
    if action in {"preflight", "check"}:
        expected = {"database_identity", "observed_state"}
        if 'dataset_metrics' in value:
            expected.add('dataset_metrics')
            try:
                validate_dataset_metrics(value['dataset_metrics'])
            except ContractViolation as error:
                raise DbOpsError(str(error)) from error
        if action == "check":
            expected.add("status")
        if "diagnosis" in value:
            expected.add("diagnosis")
            try:
                validate_diagnosis(value["diagnosis"])
            except ContractViolation as error:
                raise DbOpsError(str(error)) from error
        if "report" in value:
            expected.add("report")
            try:
                validate_report(value["report"], guide)
            except ContractViolation as error:
                raise DbOpsError(str(error)) from error
        result = exact_object(value, expected, f"{action} result")
        identity = result["database_identity"]
        if not isinstance(identity, str) or not identity:
            raise DbOpsError(f"{action} database_identity无效")
        if not isinstance(result["observed_state"], dict):
            raise DbOpsError(f"{action} observed_state必须是object")
        if action == "check":
            if result["status"] not in {"passed", "drift"}:
                raise DbOpsError("check result状态无效")
            if result["status"] == "drift" and ("report" not in result or not result["report"]["changes"]):
                raise DbOpsError("check drift 缺少具体差异")
            if result["status"] == "passed" and result.get("report", {}).get("changes"):
                raise DbOpsError("check passed 与差异报告矛盾")
        return result
    if action == "apply":
        result = exact_object(value, {"status"}, "apply result")
        if result["status"] != "applied":
            raise DbOpsError("apply result未成功")
        return result
    if action == "verify":
        result = exact_object(value, {"status", "matches"}, "verify result")
        if result != {"status": "passed", "matches": True}:
            raise DbOpsError("verify result未通过")
        return result
    if action == "readback":
        result = exact_object(value, {"status", "state"}, "readback result")
        if result["status"] != "passed" or not isinstance(result["state"], dict):
            raise DbOpsError("readback result未通过")
        return result
    raise DbOpsError(f"未知named operation action：{action}")


def project_action_result(action: str, value: dict[str, Any]) -> dict[str, Any]:
    if action in {"preflight", "check"}:
        projected = {
            "database_identity": digest_bytes(
                canonical_bytes(value["database_identity"])
            ),
            "observed_state": {
                "digest": digest_bytes(canonical_bytes(value["observed_state"]))
            },
        }
        if action == "check":
            projected["status"] = value["status"]
        if "diagnosis" in value:
            projected["diagnosis"] = value["diagnosis"]
        if "report" in value:
            projected["report"] = value["report"]
        if 'dataset_metrics' in value:
            projected['dataset_metrics'] = value['dataset_metrics']
        return projected
    if action == "readback":
        return {
            "status": value["status"],
            "state": {"digest": digest_bytes(canonical_bytes(value["state"]))},
        }
    return value


def operation_failure_reason(stdout: bytes, material: dict[str, Any]) -> str:
    """The closed failure reason a failing named operation reported, or "".

    Only {"failure":{"code":<int>,"exception":<PEP 249 name>}} passes; any
    other stdout leaves the failure message as if no reason was reported.
    """

    if not stdout or len(stdout) > FAILURE_OUTPUT_MAX_BYTES:
        return ""
    try:
        value = json.loads(stdout.decode("utf-8"), object_pairs_hook=duplicate_safe_object)
        validate_secret_free(value, material, "named operation失败原因")
    except (ValueError, RecursionError):
        return ""
    if not isinstance(value, dict) or set(value) != {"failure"}:
        return ""
    failure = value["failure"]
    if not isinstance(failure, dict) or set(failure) != {"code", "exception"}:
        return ""
    code = failure["code"]
    exception = failure["exception"]
    if type(code) is not int or not 1 <= code <= 65535:
        return ""
    if not isinstance(exception, str) or exception not in DRIVER_EXCEPTIONS:
        return ""
    return f"数据库驱动错误 {code}（{exception}）"


def invoke(
    root: Path,
    operation: dict[str, Any],
    action: str,
    entity_id: str,
    profile_value: dict[str, Any],
    operation_input: Any,
    material: dict[str, Any],
) -> dict[str, Any]:
    runner = regular_under(root, operation["runner"], "operation 操作脚本")
    request = {
        "action": action,
        "entity_id": entity_id,
        "profile": profile_value,
        "operation_input": operation_input,
        "material": material,
    }
    environment_vars = {
        "PATH": os.environ.get("PATH", ""),
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "LC_ALL": os.environ.get("LC_ALL", "C.UTF-8"),
    }
    # Load the helper from the already checked package, before project code.
    # The bootstrap excludes the operations directory from module lookup;
    # PYTHONPATH is absent from the controlled environment. Installed driver
    # locations remain available, including the interpreter's normal user site.
    # The operation retains its normal __main__, __file__ and stdin contract.
    bootstrap = """import importlib.util, runpy, sys, types
library, script = sys.argv[1:]
package = types.ModuleType("lib")
package.__path__ = [library]
sys.modules["lib"] = package
spec = importlib.util.spec_from_file_location("lib.contracts", library + "/contracts.py")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
sys.argv = [script]
runpy.run_path(script, run_name="__main__")
"""
    try:
        completed = subprocess.run(
            [sys.executable, "-B", "-c", bootstrap, str(root / "lib"), str(runner)],
            cwd=root,
            env=environment_vars,
            input=canonical_bytes(request),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=300,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        failure = (
            DbOpsManualRequired
            if action in {"apply", "verify", "readback"}
            else DbOpsConfigurationError
        )
        raise failure(
            f"named operation {operation['name']} action {action}超时"
        ) from error
    if completed.returncode != 0:
        failure = (
            DbOpsManualRequired
            if action in {"apply", "verify", "readback"}
            else DbOpsConfigurationError
        )
        message = f"named operation {operation['name']} action {action}失败"
        reason = operation_failure_reason(completed.stdout, material)
        raise failure(f"{message}；原因：{reason}" if reason else message)
    try:
        result = json.loads(completed.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        if action in {"apply", "verify", "readback"}:
            raise DbOpsResultUnknown(f"operation {operation['name']} stage {action} 结果未知：输出无法解析；先只读 verify，不重复 apply") from error
        raise DbOpsError("named operation输出不是JSON object") from error
    if not isinstance(result, dict):
        if action in {"apply", "verify", "readback"}:
            raise DbOpsResultUnknown(f"operation {operation['name']} stage {action} 结果未知：输出结构无效；先只读 verify，不重复 apply")
        raise DbOpsError("named operation输出不是JSON object")
    try:
        result = validate_action_result(action, result, operation.get("guide"))
        if operation["name"] == "diagnose" and action == "check" and "diagnosis" not in result:
            raise DbOpsError("diagnose 缺少实际版本与路径判定")
        if (operation["name"] in {"initialize", "update", "repair", "table-check"} or is_backup_operation(operation)) and action in {"preflight", "check"} and "report" not in result:
            raise DbOpsError(f"operation {operation['name']} 缺少实际变更或结构差异报告")
    except DbOpsError as error:
        if action in {"apply", "verify", "readback"}:
            raise DbOpsResultUnknown(f"operation {operation['name']} stage {action} 结果未知：输出结构无效；先只读 verify，不重复 apply") from error
        raise
    try:
        validate_public(result, material, "named operation输出")
    except DbOpsError as error:
        if action in {"apply", "verify", "readback"}:
            raise DbOpsResultUnknown(f"operation {operation['name']} stage {action} 结果未知：输出未通过公开合同校验；先只读 verify，不重复 apply") from error
        raise
    return project_action_result(action, result)


def operation_for(
    root: Path, entity_id: str, name: str
) -> tuple[dict[str, Any], dict[str, Any], str, dict[str, Any]]:
    value, operations, entities = manifest(root)
    if entity_id not in entities:
        raise DbOpsError(f"未知entity：{entity_id}")
    if name not in entities[entity_id]["operations"]:
        raise DbOpsError(f"entity {entity_id}未声明operation {name}")
    return operations[name], entities[entity_id], value["profile"], profile(root, value["profile"])


def operation_input_schema(root: Path, operation: dict[str, Any]) -> dict[str, Any]:
    return load_json(
        regular_under(root, operation["input_schema"], "operation input schema"),
        "operation input schema",
        canonical=True,
    )


def input_value(root: Path, operation: dict[str, Any], path: str | None) -> Any:
    value = {} if path is None else load_json(Path(path), "operation input")
    try:
        validate_operation_input(
            value,
            operation_input_schema(root, operation),
            "operation input",
        )
    except ContractViolation as error:
        raise DbOpsError(str(error)) from error
    return value


def make_plan(
    root: Path,
    entity_id: str,
    operation_name: str,
    operation_input: Any,
    target: dict[str, Any],
    material: dict[str, Any],
) -> dict[str, Any]:
    operation, _, profile_id, profile_value = operation_for(root, entity_id, operation_name)
    if operation["mode"] != "write":
        raise DbOpsError("plan只接受write named operation")
    diagnosis = None
    if operation_name in {"initialize", "update", "repair"}:
        diagnostic, _, _, _ = operation_for(root, entity_id, "diagnose")
        diagnosis = invoke(root, diagnostic, "check", entity_id, profile_value, {}, material)
        if operation_name not in DIAGNOSIS_PATHS[diagnosis["diagnosis"]["state"]] and diagnosis["diagnosis"]["state"] != "current":
            raise DbOpsPreflightBlocked("诊断不允许该执行路径；请按 runbook 由人工核对或准备专项修复")
    preflight = invoke(root, operation, "preflight", entity_id, profile_value, operation_input, material)
    if diagnosis is not None and diagnosis["database_identity"] != preflight["database_identity"]:
        raise DbOpsUpdateRefused("诊断与计划的目标数据库身份不一致")
    if diagnosis is not None and diagnosis["diagnosis"]["state"] == "current" and preflight.get("report", {}).get("changes"):
        raise DbOpsPreflightBlocked("已符合目标版本，不允许重复初始化或更新")
    if not isinstance(preflight["database_identity"], str) or not preflight["database_identity"]:
        raise DbOpsError("preflight database_identity无效")
    public = {
        "schema": SCHEMA_PLAN,
        "schema_version": 1,
        "entity_id": entity_id,
        "profile": profile_id,
        "operation": operation_name,
        "operation_mode": "write",
        "operation_digest": file_digest(root / operation["runner"]),
        "profile_digest": file_digest(root / "profiles" / f"{profile_id}.json"),
        "database_identity": preflight["database_identity"],
        "observed_state": preflight["observed_state"],
        "operation_input": operation_input,
        "input_schema_digest": file_digest(root / operation["input_schema"]),
        "contract_digest": file_digest(root / "lib/contracts.py"),
        "operation_metadata_digest": digest_bytes(canonical_bytes(operation)),
    }
    if diagnosis is not None:
        public["diagnosis"] = diagnosis["diagnosis"]
        public["diagnostic_digest"] = file_digest(root / diagnostic["runner"])
        public["runbook_digest"] = file_digest(root / "runbook.md")
    if "guide" in operation:
        public["guide"] = operation["guide"]
    if "report" in preflight:
        public["report"] = preflight["report"]
    validate_public(public, material, "plan")
    # The target's non-secret projection is bound on purpose; its keys are the
    # only place where host/username may appear in a plan.
    base = {**public, "target": target_projection(target)}
    validate_secret_free(base, material, "plan")
    return {**base, "plan_digest": digest_bytes(canonical_bytes(base))}


PLAN_KEYS = {
    "schema",
    "schema_version",
    "entity_id",
    "profile",
    "operation",
    "operation_mode",
    "operation_digest",
    "profile_digest",
    "target",
    "database_identity",
    "observed_state",
    "operation_input",
    "plan_digest",
}


def load_plan(path: Path) -> dict[str, Any]:
    try:
        plan = load_json(path, "plan", canonical=True)
        if not isinstance(plan, dict) or not PLAN_KEYS <= set(plan) or set(plan) - PLAN_KEYS - {"guide", "report", "input_schema_digest", "diagnosis", "diagnostic_digest", "runbook_digest", "contract_digest", "operation_metadata_digest"}:
            raise DbOpsError("plan字段不闭合")
    except DbOpsError as error:
        raise DbOpsUpdateRefused(str(error)) from error
    if plan["schema"] != SCHEMA_PLAN or plan["schema_version"] != 1 or plan["operation_mode"] != "write":
        raise DbOpsUpdateRefused("plan schema/version/mode不兼容")
    base = {key: plan[key] for key in plan if key != "plan_digest"}
    if plan["plan_digest"] != digest_bytes(canonical_bytes(base)):
        raise DbOpsUpdateRefused("plan digest不匹配")
    return plan


def current_binding(
    root: Path, plan: dict[str, Any], config: str | None = None
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Re-bind a plan to the current package and the current targets-file target.

    The plan binds the target projection, never the targets file path, so any
    file naming the same host, port, database and username rebinds.
    """

    operation, _, profile_id, profile_value = operation_for(root, plan["entity_id"], plan["operation"])
    if (
        operation["mode"] != "write"
        or profile_id != plan["profile"]
        or file_digest(root / operation["runner"]) != plan["operation_digest"]
        or file_digest(root / "profiles" / f"{profile_id}.json") != plan["profile_digest"]
        or ("input_schema_digest" in plan and file_digest(root / operation["input_schema"]) != plan["input_schema_digest"])
        or ("contract_digest" in plan and file_digest(root / "lib/contracts.py") != plan["contract_digest"])
        or ("operation_metadata_digest" in plan and digest_bytes(canonical_bytes(operation)) != plan["operation_metadata_digest"])
        or (operation.get("purpose") == "backup" and operation["name"] != "backup" and "operation_metadata_digest" not in plan)
        or operation.get("guide") != plan.get("guide")
    ):
        raise DbOpsError("plan绑定的operation/profile已漂移")
    try:
        validate_operation_input(
            plan["operation_input"],
            operation_input_schema(root, operation),
            "plan operation_input",
        )
    except ContractViolation as error:
        raise DbOpsError(str(error)) from error
    if plan["operation"] in {"initialize", "update", "repair"}:
        diagnostic, _, _, _ = operation_for(root, plan["entity_id"], "diagnose")
        if (file_digest(root / diagnostic["runner"]) != plan.get("diagnostic_digest")
            or file_digest(root / "runbook.md") != plan.get("runbook_digest")):
            raise DbOpsError("诊断脚本或 runbook 与计划漂移")
    target = select_target(root, plan["entity_id"], config)
    if target_projection(target) != plan["target"]:
        raise DbOpsError(f"{targets_location(root, config)[1]}的连接目标与plan漂移")
    return operation, profile_value, target


DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def open_or_create_directory_at(parent_fd: int, name: str, label: str) -> int:
    try:
        return os.open(name, DIRECTORY_FLAGS, dir_fd=parent_fd)
    except FileNotFoundError:
        try:
            os.mkdir(name, 0o700, dir_fd=parent_fd)
            value = os.open(name, DIRECTORY_FLAGS, dir_fd=parent_fd)
            os.fchmod(value, 0o700)
            return value
        except OSError as error:
            raise DbOpsPreflightBlocked(f"canonical lock {label}无法安全创建") from error
    except OSError as error:
        raise DbOpsPreflightBlocked(f"canonical lock {label}不是无symlink directory") from error


def validate_lock_identity(root: Path, descriptors: tuple[int, int, int]) -> None:
    for path, descriptor, label in (
        (root, descriptors[0], "package root"),
        (root / ".runtime", descriptors[1], "runtime root"),
        (root / ".runtime/locks", descriptors[2], "locks root"),
    ):
        try:
            visible = os.stat(path, follow_symlinks=False)
            held = os.fstat(descriptor)
        except OSError as error:
            raise DbOpsPreflightBlocked(f"canonical lock {label} physical identity不可读") from error
        if (
            not stat.S_ISDIR(visible.st_mode)
            or visible.st_dev != held.st_dev
            or visible.st_ino != held.st_ino
        ):
            raise DbOpsPreflightBlocked(f"canonical lock {label} physical identity发生变化")


def validate_lock_file_identity(
    locks_fd: int,
    name: str,
    lock_fd: int,
) -> None:
    try:
        visible = os.stat(name, dir_fd=locks_fd, follow_symlinks=False)
        held = os.fstat(lock_fd)
    except OSError as error:
        raise DbOpsPreflightBlocked("canonical lock file physical identity不可读") from error
    if (
        not stat.S_ISREG(visible.st_mode)
        or not stat.S_ISREG(held.st_mode)
        or visible.st_dev != held.st_dev
        or visible.st_ino != held.st_ino
        or held.st_nlink != 1
    ):
        raise DbOpsPreflightBlocked("canonical lock file physical identity发生变化")


@contextmanager
def process_lock(root: Path, entity_id: str):
    """Per-entity process lock: one write at a time against one entity's target."""

    directories: list[int] = []
    handle = None
    guard_fd = None
    try:
        guard_identity = canonical_bytes(
            {
                "root": os.path.abspath(root),
                "entity_id": entity_id,
            }
        )
        guard_offset = int.from_bytes(
            hashlib.sha256(guard_identity).digest()[:8],
            "big",
        ) & ((1 << 63) - 1)
        try:
            guard_fd = os.open(
                "/dev/null",
                os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC,
            )
            if not stat.S_ISCHR(os.fstat(guard_fd).st_mode):
                raise DbOpsPreflightBlocked("database operation stable lock anchor不是device")
            fcntl.lockf(
                guard_fd,
                fcntl.LOCK_EX | fcntl.LOCK_NB,
                1,
                guard_offset,
                os.SEEK_SET,
            )
        except BlockingIOError as error:
            raise DbOpsPreflightBlocked("database operation stable identity已被占用") from error
        except DbOpsPreflightBlocked:
            raise
        except OSError as error:
            raise DbOpsPreflightBlocked("database operation stable lock anchor不可用") from error
        try:
            root_fd = os.open(root, DIRECTORY_FLAGS)
        except OSError as error:
            raise DbOpsPreflightBlocked("canonical lock package root无法安全打开") from error
        directories.append(root_fd)
        runtime_fd = open_or_create_directory_at(root_fd, ".runtime", "runtime root")
        directories.append(runtime_fd)
        locks_fd = open_or_create_directory_at(runtime_fd, "locks", "locks root")
        directories.append(locks_fd)
        identity = (root_fd, runtime_fd, locks_fd)
        validate_lock_identity(root, identity)
        lock_name = f"{entity_id}.lock"
        flags = (
            os.O_RDWR
            | os.O_CREAT
            | os.O_NOFOLLOW
            | os.O_CLOEXEC
            | os.O_NONBLOCK
        )
        try:
            lock_fd = os.open(
                lock_name,
                flags,
                0o600,
                dir_fd=locks_fd,
            )
        except OSError as error:
            raise DbOpsPreflightBlocked("canonical lock file无法安全打开") from error
        if not stat.S_ISREG(os.fstat(lock_fd).st_mode):
            os.close(lock_fd)
            raise DbOpsPreflightBlocked("canonical lock file不是regular file")
        os.fchmod(lock_fd, 0o600)
        validate_lock_file_identity(locks_fd, lock_name, lock_fd)
        handle = os.fdopen(lock_fd, "a+b")
        validate_lock_identity(root, identity)
        yield handle
        validate_lock_file_identity(locks_fd, lock_name, handle.fileno())
        validate_lock_identity(root, identity)
    finally:
        if handle is not None:
            handle.close()
        for descriptor in reversed(directories):
            os.close(descriptor)
        if guard_fd is not None:
            os.close(guard_fd)


def evidence(plan: dict[str, Any], action: str, result: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": SCHEMA_EVIDENCE,
        "schema_version": 1,
        "action": action,
        "entity_id": plan["entity_id"],
        "operation": plan["operation"],
        "plan_digest": plan["plan_digest"],
        "operation_digest": plan["operation_digest"],
        "profile_digest": plan["profile_digest"],
        "database_identity": plan["database_identity"],
        "target": plan["target"],
        "result": result,
    }


def command_describe(root: Path) -> dict[str, Any]:
    value, _, _ = manifest(root)
    profile(root, value["profile"])
    return value


def fixed_file_contract(root: Path) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Read the package's record of the wf-prod original fixed files.

    ``fixed-files.json`` is written once at generation and lists the original
    path, mode and digest of every template file. Those files belong to the
    project afterwards (implementation/owner-spec.md §3.1): the record only
    tells which ones the project has changed, and such differences never
    refuse the package. Missing files still fail because the closure is broken.
    """

    value = exact_object(
        load_json(root / "fixed-files.json", "fixed files contract"),
        {"schema", "schema_version", "files"},
        "fixed files contract",
    )
    if (
        value["schema"] != "wf-prod.database_operations_fixed_files"
        or value["schema_version"] != 1
        or not isinstance(value["files"], list)
    ):
        raise DbOpsError("fixed files contract schema/version无效")
    files: dict[str, dict[str, Any]] = {}
    differences: list[str] = []
    for raw in value["files"]:
        item = exact_object(raw, {"path", "mode", "sha256"}, "fixed file")
        relative = safe_relative(item["path"], "fixed file path")
        if relative in files:
            raise DbOpsError("fixed file path重复")
        if (
            isinstance(item["mode"], bool)
            or not isinstance(item["mode"], int)
            or not 0 <= item["mode"] <= 0o777
            or not isinstance(item["sha256"], str)
            or re.fullmatch(r"sha256:[0-9a-f]{64}", item["sha256"]) is None
        ):
            raise DbOpsError(f"fixed file合同无效：{relative}")
        path = regular_under(root, relative, f"fixed file {relative}")
        if (
            file_digest(path) != item["sha256"]
            or stat.S_IMODE(path.stat().st_mode) != item["mode"]
        ):
            differences.append(relative)
        files[relative] = item
    if not files:
        raise DbOpsError("fixed files contract为空")
    return files, sorted(differences)


def package_files(root: Path) -> set[str]:
    """Regular files of the package closure; local untracked state is not part of it."""

    files: set[str] = set()
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if relative in LOCAL_PATHS or any(relative.startswith(item + "/") for item in LOCAL_PATHS):
            if path.is_symlink():
                raise DbOpsError(f"package本地状态含symlink：{relative}")
            if relative in {".runtime", LOCAL_ROOT} and not path.is_dir():
                raise DbOpsError(f"package本地目录无效：{relative}")
            continue
        if path.is_symlink():
            raise DbOpsError(f"database operations package含symlink：{relative}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise DbOpsError(f"database operations package含special object：{relative}")
        files.add(relative)
    return files


def check_targets_template(root: Path, entities: dict[str, dict[str, Any]]) -> None:
    """The tracked skeleton must list exactly the manifest entities with empty fields."""

    try:
        document = parse_targets_yaml(
            regular_under(root, TARGETS_TEMPLATE_FILE, TARGETS_TEMPLATE_FILE).read_bytes(),
            TARGETS_TEMPLATE_FILE,
        )
        listed = validate_targets(document, template=True)
    except ContractViolation as error:
        raise DbOpsError(str(error)) from error
    if document != targets_template_document(sorted(entities)) or sorted(listed) != sorted(entities):
        raise DbOpsError(
            f"{TARGETS_TEMPLATE_FILE}与manifest entities不一致；missing="
            + ",".join(sorted(set(entities) - set(listed)))
            + "；extra="
            + ",".join(sorted(set(listed) - set(entities)))
        )


def source_project_root(root: Path) -> Path:
    """Locate the source repository for either supported physical package path."""
    if root.name == "dbops":
        project = root.parent
    elif root.name == "db" and root.parent.name == "ops":
        project = root.parent.parent
    else:
        raise DbOpsError("主仓操作包必须位于 ops/db/ 或已有 dbops/；独立版本操作包使用 --artifact")
    if (project / "ops/db").exists() and (project / "dbops").exists():
        raise DbOpsError("同一数据库操作包不得同时位于 ops/db/ 与 dbops/")
    return project


def command_config_check(root: Path, *, artifact: bool = False) -> dict[str, Any]:
    fixed, template_differences = fixed_file_contract(root)
    value, operations, entities = manifest(root)
    try:
        validate_complete_operations(operations, entities.values())
    except ContractViolation as error:
        raise DbOpsError(str(error)) from error
    profile_id = value["profile"]
    profile(root, profile_id)
    project_root = None if artifact else source_project_root(root)
    for entity_id, entity in entities.items():
        evidence_paths: list[str] = []
        if not isinstance(entity["evidence"], list) or not entity["evidence"]:
            raise DbOpsError(f"entity {entity_id} evidence必须非空")
        for raw in entity["evidence"]:
            item = exact_object(raw, {"path", "sha256"}, "entity evidence")
            relative = safe_relative(item["path"], "entity evidence.path")
            if artifact:
                if (
                    not isinstance(item["sha256"], str)
                    or re.fullmatch(r"sha256:[0-9a-f]{64}", item["sha256"])
                    is None
                ):
                    raise DbOpsError(f"entity {entity_id} evidence digest无效")
            else:
                assert project_root is not None
                source = regular_under(project_root, relative, "entity evidence")
                if item["sha256"] != file_digest(source):
                    raise DbOpsError(f"entity {entity_id} evidence digest漂移")
            evidence_paths.append(relative)
        if evidence_paths != sorted(set(evidence_paths)):
            raise DbOpsError(f"entity {entity_id} evidence必须排序且唯一")
    actual_profiles = {
        path.stem for path in (root / "profiles").glob("*.json") if path.is_file()
    }
    if actual_profiles != {profile_id}:
        raise DbOpsError("profiles/必须只含manifest声明的唯一profile")
    check_targets_template(root, entities)
    expected = set(fixed) | {"fixed-files.json", "manifest.json", TARGETS_TEMPLATE_FILE}
    expected.add(f"profiles/{profile_id}.json")
    for item in operations.values():
        if item["name"] == "diagnose":
            try:
                validate_operation_input({}, operation_input_schema(root, item), "diagnose input")
            except ContractViolation as error:
                raise DbOpsError("diagnose 必须使用空输入，路径判断不能依赖人工提供状态") from error
        expected.update(operation_files(item))
    actual = package_files(root)
    if actual != expected:
        raise DbOpsError(
            "database operations文件闭包不一致；extra="
            + ",".join(sorted(actual - expected))
            + "；missing="
            + ",".join(sorted(expected - actual))
        )
    return {
        "schema": "wf-prod.database_operations_conformance",
        "schema_version": 1,
        "scope": CONFORMANCE_SCOPE,
        "status": "passed",
        "dispatcher": value["dispatcher"],
        "profile": profile_id,
        "entities": sorted(entities),
        "operations": sorted(operations),
        "targets_template": TARGETS_TEMPLATE_FILE,
        "files": sorted(actual),
        "template_differences": template_differences,
    }


def command_check(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    operation, _, _, profile_value = operation_for(root, args.entity, args.operation)
    if operation["mode"] != "read":
        raise DbOpsError("check只接受read named operation")
    config = getattr(args, "config", None)
    target = select_target(root, args.entity, config)
    material = material_for(root, target, config)
    operation_input = input_value(root, operation, getattr(args, "input", None))
    result = invoke(
        root,
        operation,
        "check",
        args.entity,
        profile_value,
        operation_input,
        material,
    )
    return {
        "schema": SCHEMA_EVIDENCE,
        "schema_version": 1,
        "action": "check",
        "entity_id": args.entity,
        "operation": args.operation,
        "operation_digest": file_digest(root / operation["runner"]),
        "target": target_projection(target),
        "result": result,
    }


def command_plan(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    operation, _, _, _ = operation_for(root, args.entity, args.operation)
    config = getattr(args, "config", None)
    target = select_target(root, args.entity, config)
    material = material_for(root, target, config)
    plan = make_plan(
        root,
        args.entity,
        args.operation,
        input_value(root, operation, args.input),
        target,
        material,
    )
    output = Path(args.output)
    if output.exists() or output.is_symlink():
        raise DbOpsPreflightBlocked("plan output已存在")
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(canonical_bytes(plan))
    return plan


def authorization(path: Path, plan: dict[str, Any]) -> dict[str, Any]:
    value = load_json(path, "authorization", canonical=True)
    expected = {"schema": SCHEMA_AUTHORIZATION, "schema_version": 1,
                "action": "update", "plan_digest": plan["plan_digest"]}
    if not isinstance(value, dict) or {k: v for k, v in value.items() if k != "backup"} != expected:
        raise DbOpsUpdateRefused("authorization 未绑定 exact update plan")
    if plan["operation"] in {"initialize", "update", "repair"} and plan.get("report", {}).get("changes"):
        choice = value.get("backup")
        if choice == {"decision": "skip", "confirmed": True}:
            return value
        if not isinstance(choice, dict) or set(choice) != {"decision", "plan", "evidence"} or choice["decision"] != "backup" or not all(isinstance(choice[key], str) and choice[key] for key in ("plan", "evidence")):
            raise DbOpsUpdateRefused("缺少已确认的备份路径或跳过备份决定")
    return value


def validate_backup(root: Path, plan: dict[str, Any], authorization_value: dict[str, Any], config: str | None = None) -> None:
    choice = authorization_value.get("backup", {})
    if choice.get("decision") != "backup":
        return
    saved = load_json(Path(choice["evidence"]), "backup evidence", canonical=True)
    if not isinstance(saved, dict) or not isinstance(saved.get("result"), dict) or not isinstance(saved["result"].get("readback"), dict):
        raise DbOpsUpdateRefused("备份结果格式无效；需要人工重新决定")
    backup_plan = load_plan(Path(choice["plan"]))
    operation, profile_value, target = current_binding(root, backup_plan, config)
    if (saved.get("schema") != SCHEMA_EVIDENCE or saved.get("action") != "update"
        or saved.get("operation") != backup_plan["operation"] or saved.get("entity_id") != plan["entity_id"]
        or not is_backup_operation(operation) or backup_plan["entity_id"] != plan["entity_id"]
        or backup_plan["target"] != plan["target"] or backup_plan["database_identity"] != plan["database_identity"]
        or saved.get("plan_digest") != backup_plan["plan_digest"]
        or saved.get("operation_digest") != file_digest(root / operation["runner"])
        or saved.get("profile_digest") != plan["profile_digest"]
        or saved.get("target") != plan["target"] or saved.get("database_identity") != plan["database_identity"]
        or saved.get("result", {}).get("verify") != {"status": "passed", "matches": True}
        or saved.get("result", {}).get("readback", {}).get("status") != "passed"):
        raise DbOpsUpdateRefused("备份结果不属于本次目标，或备份核验未通过")
    covered = {item["object"] for item in backup_plan.get("report", {}).get("changes", [])}
    affected = {item["object"] for item in plan.get("report", {}).get("changes", [])}
    if not affected or any(not any(item == scope or item.startswith(scope + ".") for scope in covered) for item in affected):
        raise DbOpsUpdateRefused("备份范围未覆盖本次变更对象；需要人工补齐或改选")
    material = material_for(root, target, config)
    try:
        fresh = invoke(root, operation, "preflight", plan["entity_id"], profile_value, backup_plan["operation_input"], material)
        if fresh["database_identity"] != backup_plan["database_identity"]:
            raise DbOpsUpdateRefused("备份目标数据库身份漂移")
        verify = invoke(root, operation, "verify", plan["entity_id"], profile_value, backup_plan["operation_input"], material)
    except DbOpsManualRequired as error:
        raise DbOpsUpdateRefused("备份产物验证未通过；需要人工重新决定") from error
    if verify != {"status": "passed", "matches": True}:
        raise DbOpsUpdateRefused("备份产物验证未通过；需要人工重新决定")
    readback = invoke(root, operation, "readback", plan["entity_id"], profile_value, backup_plan["operation_input"], material)
    if readback != saved["result"]["readback"]:
        raise DbOpsUpdateRefused("备份产物验证未通过或结果已漂移；需要人工重新决定")


def command_update(root: Path, args: argparse.Namespace, *, expected_plan: dict[str, Any] | None = None) -> dict[str, Any]:
    plan = load_plan(Path(args.plan))
    if expected_plan is not None and plan != expected_plan:
        raise DbOpsUpdateRefused("人工已确认的计划文件发生变化")
    authorization_value = authorization(Path(args.authorization), plan)
    validate_backup(root, plan, authorization_value, getattr(args, "config", None))
    config = getattr(args, "config", None)
    try:
        operation, profile_value, target = current_binding(root, plan, config)
    except DbOpsConfigurationError:
        raise
    except DbOpsError as error:
        raise DbOpsUpdateRefused(str(error)) from error
    material = material_for(root, target, config)
    with process_lock(root, plan["entity_id"]) as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise DbOpsPreflightBlocked("database operation进程锁已被占用") from error
        if "diagnosis" in plan:
            diagnostic, _, _, _ = operation_for(root, plan["entity_id"], "diagnose")
            observed = invoke(root, diagnostic, "check", plan["entity_id"], profile_value, {}, material)
            if observed["diagnosis"] != plan["diagnosis"] or observed["database_identity"] != plan["database_identity"]:
                raise DbOpsUpdateRefused("诊断状态变化，旧计划和人工决定失效")
        preflight = invoke(
                root,
                operation,
                "preflight",
                plan["entity_id"],
                profile_value,
                plan["operation_input"],
                material,
        )
        if (
            preflight["database_identity"] != plan["database_identity"]
            or preflight["observed_state"] != plan["observed_state"]
            or preflight.get("report") != plan.get("report")
        ):
            raise DbOpsUpdateRefused("database identity或observed state漂移，旧plan失效")
        def execute_stage(action):
            try:
                return invoke(root, operation, action, plan["entity_id"], profile_value,
                              plan["operation_input"], material)
            except DbOpsResultUnknown as error:
                # Only disclose existing plan identity, never driver output.
                plan_path = str(Path(args.plan).resolve())
                raise DbOpsManualRequired(
                    f"operation {plan['operation']} stage {action} 结果未知；原计划 {plan_path}；"
                    f"先执行 db-ops verify --plan {json.dumps(plan_path, ensure_ascii=False)}，不重复 apply"
                ) from error

        applied = {"status": "unchanged"} if "report" in plan and not plan["report"]["changes"] else execute_stage("apply")
        verified = execute_stage("verify")
        readback = execute_stage("readback")
        result = {"apply": applied, "verify": verified, "readback": readback}
        validate_public(result, material, "update evidence")
        return evidence(plan, "update", result)


def command_verify(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    plan = load_plan(Path(args.plan))
    config = getattr(args, "config", None)
    try:
        operation, profile_value, target = current_binding(root, plan, config)
    except DbOpsConfigurationError:
        raise
    except DbOpsError as error:
        raise DbOpsDrift(str(error)) from error
    material = material_for(root, target, config)
    preflight = invoke(
        root,
        operation,
        "preflight",
        plan["entity_id"],
        profile_value,
        plan["operation_input"],
        material,
    )
    if preflight["database_identity"] != plan["database_identity"]:
        raise DbOpsDrift("database identity漂移，旧plan不可用于verify")
    verified = invoke(
        root,
        operation,
        "verify",
        plan["entity_id"],
        profile_value,
        plan["operation_input"],
        material,
    )
    readback = invoke(
        root,
        operation,
        "readback",
        plan["entity_id"],
        profile_value,
        plan["operation_input"],
        material,
    )
    result = {"preflight": preflight, "verify": verified, "readback": readback}
    validate_public(result, material, "verify evidence")
    return evidence(plan, "verify", result)


def human_result(value: dict[str, Any]) -> str:
    """Render the same validated report used by automation."""

    lines = [f"实体：{value.get('entity_id', '')}；操作：{value.get('operation', '')}"]
    if "target" in value:
        target = value["target"]
        lines.append(f"目标：{target['host']}:{target['port']} / {target['database']}；账号：{target['username']}")
    diagnosis = value.get("diagnosis", value.get("result", {}).get("diagnosis"))
    if diagnosis:
        lines.append(f"诊断：{diagnosis['state']}；当前版本：{diagnosis['current_version']}；目标版本：{diagnosis['target_version']}")
    guide = value.get("guide")
    if guide:
        for key, label in (("summary", "操作"), ("prerequisites", "前置条件"), ("impact", "影响"), ("repeat", "重复执行"), ("recovery", "恢复")):
            lines.append(f"{label}：{guide[key]}")
    report = value.get("report", value.get("result", {}).get("report"))
    reasons = {"missing": "缺失", "unexpected": "多余", "type": "类型不一致", "nullability": "空值规则不一致", "default": "默认值不一致", "primary-key": "主键不一致", "definition": "定义不一致", "pending": "待执行"}
    actions = {"create": "创建", "alter": "修改结构", "drop": "删除对象", "insert": "新增数据", "update": "更新数据", "delete": "删除数据", "check": "校验"}
    if report is not None:
        lines.append("具体变更或差异：" if report["changes"] else "检查结果：无需变更，未发现差异。")
        for change in report["changes"]:
            lines.append(f"- {change['kind']} {change['object']}：{reasons[change['reason']]}；{actions[change['action']]}")
    if value.get("action") == "check":
        lines.append("校验通过。" if value["result"]["status"] == "passed" else "校验失败：存在上述结构差异，未修改数据库。")
    if value.get("action") == "update":
        unchanged = value["result"]["apply"]["status"] == "unchanged"
        lines.append("无需更新，已完成 verify/readback。" if unchanged else "执行完成，verify/readback 已通过。")
    return "\n".join(lines)


def write_run_result(run_root: Path, value: dict[str, Any]) -> None:
    """Publish complete evidence once; interruption never exposes partial JSON."""
    with tempfile.NamedTemporaryFile(mode="wb", prefix=".result-", dir=run_root) as handle:
        handle.write(canonical_bytes(value))
        handle.flush()
        os.fsync(handle.fileno())
        os.link(handle.name, run_root / "result.json")


def command_run(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    command_config_check(root, artifact=args.artifact)
    operation, _, _, _ = operation_for(root, args.entity, args.operation)
    if operation["mode"] != "write" or "guide" not in operation:
        raise DbOpsError("run只接受具备项目使用说明的write operation；只读校验请用check")
    if getattr(args, "resume", None):
        run_root = Path(args.resume).absolute()
        if run_root.is_symlink() or run_root.parent != root / ".runtime" or not run_root.is_dir() or (root / ".runtime").is_symlink():
            raise DbOpsUpdateRefused("续接目录必须是本操作包 .runtime 下的原始执行目录")
        if (run_root / "result.json").exists():
            raise DbOpsUpdateRefused("原执行已有最终结果；先核对副作用，不自动重试")
        if (run_root / "authorization.json").exists() or (run_root / "backup-authorization.json").exists():
            raise DbOpsUpdateRefused("原执行已进入写入尝试但没有最终结果；先核对副作用，不自动重试")
    else:
        # Create a new private run directory; never reuse or overwrite an old plan.
        package_fd = os.open(root, DIRECTORY_FLAGS)
        runtime_fd = None
        try:
            runtime_fd = open_or_create_directory_at(package_fd, ".runtime", "runtime root")
            visible = os.stat(root / ".runtime", follow_symlinks=False)
            held = os.fstat(runtime_fd)
            if (visible.st_dev, visible.st_ino) != (held.st_dev, held.st_ino):
                raise DbOpsPreflightBlocked("runtime root physical identity漂移")
            run_root = Path(tempfile.mkdtemp(prefix="manual-", dir=root / ".runtime"))
        finally:
            if runtime_fd is not None:
                os.close(runtime_fd)
            os.close(package_fd)
    try:
        return perform_run(root, args, run_root)
    except KeyboardInterrupt:
        evidence = {"schema": SCHEMA_EVIDENCE, "schema_version": 1, "action": "run", "entity_id": args.entity, "operation": args.operation, "status": "unknown", "exit_code": 130}
        try:
            saved_plan = load_plan(run_root / "plan.json")
        except DbOpsError:
            pass
        else:
            evidence["plan_digest"] = saved_plan["plan_digest"]
        if not (run_root / "result.json").exists():
            write_run_result(run_root, evidence)
        raise
    except Exception:
        # A backup or main apply may have committed before reporting an error.
        # Every write attempt gets a final unknown record, including resume.
        if not (run_root / "result.json").exists() and any((run_root / name).exists() for name in ("authorization.json", "backup-authorization.json")):
            saved_plan = load_plan(run_root / "plan.json")
            write_run_result(run_root, {"schema": SCHEMA_EVIDENCE, "schema_version": 1, "action": "run", "entity_id": args.entity, "operation": args.operation, "status": "unknown", "plan_digest": saved_plan["plan_digest"]})
        raise


def perform_run(root: Path, args: argparse.Namespace, run_root: Path) -> dict[str, Any]:
    """Execute one attempt; command_run retains interruption facts for every phase."""
    def finish(value: dict[str, Any]) -> dict[str, Any]:
        write_run_result(run_root, value)
        return value

    plan_path = run_root / "plan.json"
    resumed = bool(getattr(args, "resume", None))
    try:
        if resumed:
            plan = load_plan(plan_path)
            choice = load_json(run_root / "backup-choice.json", "backup choice", canonical=True)
            if choice != {"decision": "manual", "plan_digest": plan["plan_digest"]} or plan["entity_id"] != args.entity or plan["operation"] != args.operation:
                raise DbOpsUpdateRefused("续接对象或原人工备份授权不一致")
            if args.input is not None:
                raise DbOpsUpdateRefused("续接沿用原输入；输入变化须重新展示计划")
            current_binding(root, plan, args.config)
        else:
            plan = command_plan(root, argparse.Namespace(entity=args.entity, operation=args.operation, input=args.input, output=str(plan_path), config=args.config))
    except DbOpsError as error:
        if not resumed:
            write_run_result(run_root, {"schema": SCHEMA_EVIDENCE, "schema_version": 1, "action": "run", "entity_id": args.entity, "operation": args.operation, "status": "failed", "exit_code": error.exit_code})
        raise
    if args.format == "human":
        print(human_result(plan), file=sys.stderr)
        print(f"计划保存：{plan_path}；确认后会重新核对目标与数据库状态。", file=sys.stderr)
    else:
        print(canonical_bytes(plan).decode("utf-8"), file=sys.stderr, end="")
    if args.dry_run:
        return plan
    backup_choice = None
    if plan["operation"] in {"initialize", "update", "repair"} and plan.get("report", {}).get("changes"):
        prepared_backup = None
        if not resumed:
            try:
                backup_name = getattr(args, "backup_operation", "backup")
                backup_operation, _, _, _ = operation_for(root, args.entity, backup_name)
                if not is_backup_operation(backup_operation):
                    raise DbOpsPreflightBlocked("所选操作未声明 backup purpose")
                backup_input = getattr(args, "backup_input", None)
                if backup_input is None:
                    example = regular_under(root, backup_operation["example_input"], "backup input example")
                    backup_input = str(run_root / "backup-input.json")
                    write_private(Path(backup_input), input_value(root, backup_operation, str(example)))
                prepared_backup = command_plan(root, argparse.Namespace(entity=args.entity, operation=backup_name, input=backup_input, output=str(run_root / "backup-plan.json"), config=args.config))
                print("建议备份（范围、一致性和恢复方式以本项目说明为准）：\n" + human_result(prepared_backup), file=sys.stderr)
            except DbOpsError:
                print("当前备份准备材料不足；选择 Agent 备份前须补齐，或明确选择人工备份／不备份。", file=sys.stderr)
            print("无本次备份时，恢复能力受限，不能保证恢复备份时点之后的写入。", file=sys.stderr)
            print("选择并授权以上计划：[a=Agent备份并执行 / h=人工备份后继续 / n=不备份并立即执行]（其它输入取消）：", file=sys.stderr, flush=True)
            answer = sys.stdin.readline().strip().lower()
        else:
            answer = "h"
        if answer == "a":
            if prepared_backup is None:
                raise DbOpsPreflightBlocked("备份计划未就绪；未执行数据库变更")
            backup_authorization = run_root / "backup-authorization.json"
            write_private(backup_authorization, {"schema": SCHEMA_AUTHORIZATION, "schema_version": 1, "action": "update", "plan_digest": prepared_backup["plan_digest"]})
            backup_result = command_update(root, argparse.Namespace(plan=str(run_root / "backup-plan.json"), authorization=str(backup_authorization), config=args.config), expected_plan=prepared_backup)
            write_private(run_root / "backup-result.json", backup_result)
            backup_choice = {"decision": "backup", "plan": str(run_root / "backup-plan.json"), "evidence": str(run_root / "backup-result.json")}
            validate_backup(root, plan, {"backup": backup_choice}, args.config)
        elif answer in {"h", "b"}:
            if not resumed:
                write_private(run_root / "backup-choice.json", {"decision": "manual", "plan_digest": plan["plan_digest"]})
            if not args.backup_evidence or not args.backup_plan:
                pending = {"schema": SCHEMA_EVIDENCE, "schema_version": 1, "action": "run", "entity_id": args.entity, "operation": args.operation, "status": "waiting-for-backup", "plan_digest": plan["plan_digest"], "resume": str(run_root)}
                if not (run_root / "waiting.json").exists():
                    write_private(run_root / "waiting.json", pending)
                print("人工按已展示范围完成备份后，以 --resume 和 --backup-plan／--backup-evidence 续接同一计划。", file=sys.stderr)
                return pending
            try:
                backup_choice = {"decision": "backup", "plan": args.backup_plan, "evidence": args.backup_evidence}
                validate_backup(root, plan, {"backup": backup_choice}, getattr(args, "config", None))
            except DbOpsError as error:
                raise
        elif answer == "n":
            backup_choice = {"decision": "skip", "confirmed": True}
        else:
            return finish({"schema": SCHEMA_EVIDENCE, "schema_version": 1, "action": "cancel", "entity_id": args.entity, "operation": args.operation, "status": "cancelled", "plan_digest": plan["plan_digest"]})
    if backup_choice is None:
        print("确认以上计划并执行？[y/N]（默认取消）：", file=sys.stderr, flush=True)
        if sys.stdin.readline() not in ("y\n", "Y\n"):
            return finish({"schema": SCHEMA_EVIDENCE, "schema_version": 1, "action": "cancel", "entity_id": args.entity, "operation": args.operation, "status": "cancelled", "plan_digest": plan["plan_digest"]})
    authorization_path = run_root / "authorization.json"
    descriptor = os.open(authorization_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        value = {"schema": SCHEMA_AUTHORIZATION, "schema_version": 1, "action": "update", "plan_digest": plan["plan_digest"]}
        if backup_choice is not None:
            value["backup"] = backup_choice
        handle.write(canonical_bytes(value))
    try:
        result = command_update(root, argparse.Namespace(plan=str(plan_path), authorization=str(authorization_path), config=args.config), expected_plan=plan)
    except DbOpsError as error:
        # A failed apply/verify can leave committed DDL. Keep the failed attempt
        # as unknown instead of implying rollback or authorizing a blind retry.
        write_run_result(run_root, {"schema": SCHEMA_EVIDENCE, "schema_version": 1, "action": "run", "entity_id": args.entity, "operation": args.operation, "status": "unknown", "exit_code": error.exit_code, "plan_digest": plan["plan_digest"]})
        raise
    write_run_result(run_root, result)
    return result


def write_private(path: Path, value: Any) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(canonical_bytes(value))


HELP_ENTITY = "数据库entity，可选值见describe输出或runbook"
HELP_INPUT = "操作输入JSON文件，按该操作的input schema校验；不写时输入为{}"
HELP_ARTIFACT = (
    "包不在主仓dbops/下时使用（deploy 仓外的 Publish 解包）："
    "只核对evidence格式，不查找主仓源码"
)


def parser() -> argparse.ArgumentParser:
    """Every subcommand and option carries the help that runbook.md repeats."""

    value = argparse.ArgumentParser(prog="db-ops", description="项目数据库操作：先用config-check校验包，check只读校验，run展示计划并经确认后初始化或更新。详细环境、权限和恢复步骤见同目录runbook.md。")
    commands = value.add_subparsers(dest="command", required=True)

    def command(name: str, text: str) -> argparse.ArgumentParser:
        return commands.add_parser(name, help=text, description=text)

    command("describe", "输出manifest：entity、可用操作及其说明；不读连接配置、不连接数据库")
    config_check = command("config-check", "校验操作包本身：manifest、profile、文件闭包与fixed-files.json；不读连接配置、不连接数据库")
    config_check.add_argument("--artifact", action="store_true", help=HELP_ARTIFACT)
    check = command("check", "执行只读操作（默认连通性检查），不修改数据库；有结构差异时返回码为1")
    check.add_argument("--entity", required=True, help=HELP_ENTITY)
    check.add_argument("--operation", default="check", help="只读操作名，默认check（连通性检查）；表校验用table-check")
    check.add_argument("--input", help=HELP_INPUT)
    configuration_arguments(check)
    check.add_argument("--format", choices=("json", "human"), default="json", help="输出格式，默认json；人工查看用human")
    plan = command("plan", "只生成写计划并保存，不写库；供Skill或分步执行，人工用run")
    plan.add_argument("--entity", required=True, help=HELP_ENTITY)
    plan.add_argument("--operation", required=True, help="写操作名，例如initialize、update")
    plan.add_argument("--input", help=HELP_INPUT)
    configuration_arguments(plan)
    plan.add_argument("--output", required=True, help="计划保存路径，文件必须不存在")
    update = command("update", "按已授权的计划写入并完成verify/readback；供Skill或分步执行，人工用run")
    update.add_argument("--plan", required=True, help="plan生成的计划文件")
    update.add_argument("--authorization", required=True, help="绑定该计划plan_digest的授权文件")
    configuration_arguments(update)
    verify = command("verify", "只读复核一份写计划：确认目标库未变，再运行verify与readback")
    verify.add_argument("--plan", required=True, help="计划文件；run生成的计划在.runtime/manual-*/plan.json")
    configuration_arguments(verify)
    run = command("run", "人工执行写操作：展示计划、风险和备份范围后选路并执行，默认取消")
    run.add_argument("--entity", required=True, help=HELP_ENTITY)
    run.add_argument("--backup-evidence", help="同一目标经 backup operation 验证的 result.json；选择备份时使用")
    run.add_argument("--backup-plan", help="上述备份结果绑定的 plan.json；选择备份时使用")
    run.add_argument("--operation", required=True, help="带使用说明的写操作名，例如initialize、update")
    run.add_argument("--input", help=HELP_INPUT)
    configuration_arguments(run)
    run.add_argument("--artifact", action="store_true", help=HELP_ARTIFACT)
    run.add_argument("--dry-run", action="store_true", help="只生成并显示计划，不请求确认、不写库")
    run.add_argument("--backup-operation", default="backup", help="建议备份操作；须声明 backup purpose，默认 backup")
    run.add_argument("--backup-input", help="建议备份的操作输入；省略时展示项目声明的备份示例输入")
    run.add_argument("--resume", help="人工备份完成后续接本操作包 .runtime 下的原执行目录")
    run.add_argument("--format", choices=("json", "human"), default="human", help="输出格式，默认human")
    return value


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[1]
    args = parser().parse_args(argv)
    try:
        if args.command in {"check", "plan", "update", "verify", "run"}:
            try:
                selected = select_configuration(root, args)
            except ContractViolation as error:
                raise DbOpsConfigurationError(str(error)) from error
            args.config = selected["path"]
            print("连接选择：环境=" + (selected["environment"] or "未指定（显式路径）")
                  + "；路径=" + selected["path"] + "；来源=" + selected["source"], file=sys.stderr)
        if args.command == "describe":
            result = command_describe(root)
        elif args.command == "config-check":
            result = command_config_check(root, artifact=args.artifact)
        elif args.command == "check":
            result = command_check(root, args)
        elif args.command == "plan":
            result = command_plan(root, args)
        elif args.command == "update":
            result = command_update(root, args)
        elif args.command == "verify":
            result = command_verify(root, args)
        elif args.command == "run":
            result = command_run(root, args)
        else:
            raise DbOpsError("未知命令")
        if getattr(args, "format", "json") == "human":
            if result.get("action") == "cancel":
                print("已取消，未执行数据库写入。")
            elif result.get("status") == "waiting-for-backup":
                print(f"等待人工备份；原计划保存在 {result['resume']}，尚未执行数据库变更。")
            else:
                print(human_result(result))
        else:
            sys.stdout.buffer.write(canonical_bytes(result))
        # A valid diagnostic is a decision input even when it finds an empty,
        # old or damaged schema. Keep its envelope available to the coordinator.
        if args.command == "check" and args.operation != "diagnose" and result["result"]["status"] == "drift":
            return 1
        return 5 if result.get("status") == "waiting-for-backup" else 0
    except KeyboardInterrupt:
        print("db-ops: interrupted", file=sys.stderr)
        return 130
    except DbOpsError as error:
        print(f"db-ops: {error}", file=sys.stderr)
        return error.exit_code
    except Exception:
        print("db-ops: 未分类内部错误，需要人工处理", file=sys.stderr)
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
