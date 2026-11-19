#!/usr/bin/env python3
"""清理当前工作区 Preview 环境；保留源码、锁文件与下载缓存。"""
from __future__ import annotations

from pathlib import Path
import sys

# start.py 是同一 tracked bundle；导入不得物化 __pycache__。
sys.dont_write_bytecode = True
import start as preview


def clean() -> int:
    if len(sys.argv) != 1:
        print("用法：python3 frontend/preview/clean.py", file=sys.stderr)
        return preview.EXIT_CONFIG
    try:
        script = Path(__file__).resolve()
        facts = preview.git_facts(script.parent)
        repo = Path(facts["repo_root"])
        bindings = preview.load_bindings(repo)
        preview.bind_preview_location(repo, script.with_name("start.py"), bindings)
        preview.require_preview_bundle(repo)
        preview.require_local_ignores(repo)
        selected = preview.select_bindings(bindings, None)
        for entity_id, binding in selected:
            preview.validate_binding(repo, (script.parent / "start.py").relative_to(repo).as_posix(), entity_id, binding)
        compose_file = script.parent / "compose.yaml"
        preview.validate_static_compose(compose_file, selected)
        with preview.workspace_lease(repo):
            previous = preview.existing_local_run(repo)
            if previous:
                raise preview.PreviewError(f"Preview 进程仍在运行（pid={previous['pid']}）；请先停止进程，再执行 clean.py", preview.EXIT_RUNTIME)
            runtime = repo / preview.PREVIEW_ROOT / "runtime"
            entries = [path for path in runtime.iterdir() if path.name != "preview.lock"]
            for path in entries:
                preview.require_project_object(repo, path.relative_to(repo).as_posix(), False, "Preview runtime record")
                if preview.git_output(repo, ["ls-files", "--", path.relative_to(repo).as_posix()]):
                    raise preview.PreviewError(f"拒绝删除 tracked runtime 文件：{path}")
            last_run = runtime / "last-run.json"
            if last_run.exists() and preview.strict_json(last_run, "runtime result").get("runtime") == "docker":
                raise preview.PreviewError("当前清理入口仅支持 local；保留此前 Docker 记录供原环境清理", preview.EXIT_ENVIRONMENT)
            for path in entries:
                preview.require_project_object(repo, path.relative_to(repo).as_posix(), False, "Preview runtime record")
                path.unlink()
        print("frontend-preview: local 运行记录已清理；现有 Bun 依赖和下载缓存已保留")
        return preview.EXIT_OK
    except (preview.PreviewError, OSError, ValueError) as error:
        print(f"frontend-preview: 清理失败：{error}", file=sys.stderr)
        return error.code if isinstance(error, preview.PreviewError) else preview.EXIT_ENVIRONMENT


if __name__ == "__main__":
    raise SystemExit(clean())
