#!/usr/bin/env python3
"""Shared closed contracts for generation, conformance and runtime dispatch."""

from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import Any


class ContractViolation(ValueError):
    """One closed database operation contract violation."""


def validate_dataset_metrics(value: Any) -> dict[str, Any]:
    """Public aggregate counts only; never project arbitrary observed_state."""
    fields = {'dataset', 'config_digest', 'counts', 'distributions', 'relations'}
    if not isinstance(value, dict) or set(value) != fields:
        raise ContractViolation('dataset_metrics 字段不闭合')
    identifier = re.compile(r'[A-Za-z][A-Za-z0-9_-]{0,79}')
    if not isinstance(value['dataset'], str) or not identifier.fullmatch(value['dataset']):
        raise ContractViolation('dataset_metrics dataset 无效')
    if not isinstance(value['config_digest'], str) or not re.fullmatch(r'[0-9a-f]{64}', value['config_digest']):
        raise ContractViolation('dataset_metrics 配置身份无效')
    for field in ('counts', 'distributions', 'relations'):
        items = value[field]
        if not isinstance(items, dict) or len(items) > 128 or field == 'counts' and not items:
            raise ContractViolation('dataset_metrics 集合无效')
        for key, item in items.items():
            if not isinstance(key, str) or not identifier.fullmatch(key) or sensitive_property(key):
                raise ContractViolation('dataset_metrics 对象无效')
            if field == 'relations':
                if type(item) is not bool:
                    raise ContractViolation('dataset_metrics 关系必须为布尔值')
            elif type(item) is not int or not 0 <= item <= 10**12:
                raise ContractViolation('dataset_metrics 计数无效')
    return value


PROPERTY_NAME = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
ENTITY_IDENTITY = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
CONFORMANCE_SCOPE = "versioned-operations"
# The package's own untracked connection file, its tracked skeleton and the
# untracked directory that holds optional TLS CA text. Every consumer (db-ops,
# the generator and the orchestrator) reads the same shape from the package
# directory; environment selection never changes the protocol profile.
TARGETS_SCHEMA = "wf-prod.database_operations_targets"
TARGETS_FILE = "database.yaml"
TARGETS_TEMPLATE_FILE = "database.template.yaml"
ENVIRONMENTS = ("dev", "test", "prod")
ENVIRONMENT_TARGETS_FILES = tuple(f"database.{name}.yaml" for name in ENVIRONMENTS)
LOCAL_PATHS = (".runtime", ".local", TARGETS_FILE, "database.json", *ENVIRONMENT_TARGETS_FILES)
# Retired credentials remain secret local state; no reader falls back to them.
LEGACY_TARGETS_FILE = "database.json"
LOCAL_ROOT = ".local"
TARGET_FIELDS = {
    "entity_id",
    "host",
    "port",
    "database",
    "username",
    "password",
    "tls_ca_file",
}
TARGET_REQUIRED_FIELDS = TARGET_FIELDS - {"tls_ca_file"}
TLS_CA_PATH = re.compile(r"^\.local/[^/]+(?:/[^/]+)*$")
TARGET_PROJECTION_FIELDS = ("host", "port", "database", "username")


def configuration_arguments(parser: Any) -> None:
    """One selection interface shared by the dispatcher and read-only adapter."""
    parser.add_argument("--environment", choices=ENVIRONMENTS, help="本次环境：dev、test 或 prod；不从文件名推断")
    parser.add_argument("--config", help="本次显式连接配置路径；相对调用者目录，优先于环境路径，不推断环境")
    parser.add_argument("--config-path", action="append", default=[], metavar="ENV=PATH",
                        help="会话内某环境的路径覆盖，可分别重复指定 dev、test、prod；不写回工程")
    parser.add_argument("--project-config", action="append", default=[], metavar="ENV=PATH",
                        help="从工程已有约定取得的路径；ENV 为 dev/test/prod，单文件约定用 shared；不写回工程")
    parser.add_argument("--default-environment", choices=ENVIRONMENTS,
                        help="工程已明确约定的默认环境；没有约定时不得代填")


def configuration_paths(values: list[str], *, shared: bool = False) -> dict[str, str]:
    paths: dict[str, str] = {}
    for value in values:
        name, separator, path = value.partition("=")
        if not separator or name not in ENVIRONMENTS + (("shared",) if shared else ()) or not path.strip() or name in paths:
            raise ContractViolation("连接路径须为不重复的 ENV=PATH；环境为 dev/test/prod，工程单文件约定可用 shared")
        paths[name] = path
    return paths


def select_configuration(root: Path | None, args: Any) -> dict[str, Any]:
    """Select exactly one file without reading credentials or persisting choices.

    The caller supplies observed project conventions; arbitrary project formats
    are not parsed here. A pre-existing database.yaml retains the package's
    established single-file convention, after environment selection is settled.
    """
    environment = getattr(args, "environment", None) or getattr(args, "default_environment", None)
    if environment is not None and environment not in ENVIRONMENTS:
        raise ContractViolation("环境只能是 dev、test 或 prod")
    explicit = getattr(args, "config", None)
    if explicit is not None:
        if not str(explicit).strip():
            raise ContractViolation("显式连接配置路径不能为空")
        path, source = explicit, "explicit"
    else:
        if environment is None:
            raise ContractViolation("请先指定环境 dev/test/prod，或提供工程明确的默认环境、显式 --config 路径；模板为 " + (str(root / TARGETS_TEMPLATE_FILE) if root is not None else "操作包内 " + TARGETS_TEMPLATE_FILE))
        overrides = configuration_paths(getattr(args, "config_path", []))
        project = configuration_paths(getattr(args, "project_config", []), shared=True)
        if environment in overrides:
            path, source = overrides[environment], "session"
        elif environment in project or "shared" in project:
            path, source = project.get(environment, project.get("shared")), "project"
        elif root is None:
            raise ContractViolation("存在多个数据库目录；请按工程约定明确配置路径")
        elif (root / TARGETS_FILE).exists() or (root / TARGETS_FILE).is_symlink():
            path, source = root / TARGETS_FILE, "project"
        else:
            path, source = root / f"database.{environment}.yaml", "default"
    return {"environment": environment, "path": str(Path(path).absolute()), "source": source}


SENSITIVE_NAME_PARTS = {
    "account",
    "credential",
    "database_url",
    "dsn",
    "endpoint",
    "host",
    "password",
    "query",
    "secret",
    "sql",
    "statement",
    "token",
    "url",
    "user",
    "username",
}
SENSITIVE_COMPACT_SUFFIXES = {
    "account",
    "apikey",
    "credential",
    "databaseurl",
    "dsn",
    "endpoint",
    "host",
    "hostname",
    "password",
    "passwd",
    "privatekey",
    "pwd",
    "query",
    "secret",
    "sql",
    "statement",
    "token",
    "url",
    "user",
    "username",
}
SQL_METHODS = {
    "callproc",
    "cmd_query",
    "cmd_query_iter",
    "execute",
    "executemany",
    "query",
}
SQL_TEXT = re.compile(
    r"^\s*(?:alter|call|create|delete|drop|grant|insert|merge|replace|revoke|"
    r"select|truncate|update|with)\s+\S",
    re.IGNORECASE,
)
SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema"
REQUIRED_OPERATIONS = {
    "check": "read",
    "diagnose": "read",
    "backup": "write",
    "initialize": "write",
    "table-check": "read",
    "update": "write",
}
DIAGNOSIS_STATES = {"empty", "current", "upgrade", "partial", "unmanaged", "newer", "unknown"}
DIAGNOSIS_PATHS = {
    "empty": {"initialize"}, "current": set(), "upgrade": {"update"},
    "partial": {"repair"}, "unmanaged": set(), "newer": set(), "unknown": set(),
}


def validate_diagnosis(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"state", "current_version", "target_version"}:
        raise ContractViolation("diagnosis 字段不闭合")
    if not isinstance(value["state"], str) or value["state"] not in DIAGNOSIS_STATES:
        raise ContractViolation("diagnosis state 无效")
    for key in ("current_version", "target_version"):
        if value[key] is not None and (not isinstance(value[key], str) or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", value[key]) is None):
            raise ContractViolation("diagnosis version 无效")
    if value["target_version"] is None or (value["state"] in {"current", "upgrade", "newer"} and value["current_version"] is None):
        raise ContractViolation("diagnosis 缺少可核对版本")
    if value["state"] == "current" and value["current_version"] != value["target_version"]:
        raise ContractViolation("diagnosis current 与目标版本矛盾")
    if value["state"] in {"upgrade", "newer"} and value["current_version"] == value["target_version"]:
        raise ContractViolation("diagnosis 版本关系与执行路径矛盾")
    return value


GUIDE_FIELDS = {"summary", "prerequisites", "impact", "repeat", "recovery", "objects"}
REPORT_OBJECT = re.compile(r"^[A-Za-z_][A-Za-z0-9_.$-]{0,127}$")
REPORT_KINDS = {"database", "table", "column", "index", "constraint", "data"}
REPORT_REASONS = {"missing", "unexpected", "type", "nullability", "default", "primary-key", "definition", "pending"}
REPORT_ACTIONS = {"create", "alter", "drop", "insert", "update", "delete", "check"}
# One project-owned protocol compatibility declaration, never server identity.
PROFILE_SCHEMA = "wf-prod.database_operations_profile"
PROFILE_FAMILIES = ("mariadb", "mysql")
PROFILE_VERSION = re.compile(r"^[0-9]{1,9}(?:\.[0-9]{1,9}){1,2}(?:[-+][a-z0-9.-]{1,64})?$")
PROFILE_IDENTITY = re.compile(r"^(?=.{1,200}$)[a-z][a-z0-9.-]*(?:_[a-z][a-z0-9.-]*)*$")
PROFILE_FIELDS = {"schema", "schema_version", "profile_id", "protocol_targets", "driver", "compatibility"}
PROFILE_COMPATIBILITY_FIELDS = {"transactional_ddl", "advisory_lock"}
# Protocol-level script constraints, not capabilities detected on a server.
PROTOCOL_COMPATIBILITY = {
    "mysql": {"transactional_ddl": False, "advisory_lock": True},
    "mariadb": {"transactional_ddl": False, "advisory_lock": True},
}


def profile_family_key(item: dict[str, str]) -> tuple[str, tuple[int, ...], str]:
    """Order protocol_targets by name, then by numeric version, then by version suffix.

    Entries with the same key (for example ``8.0`` and ``8.00``) declare the
    same family version and count as a repeated declaration.
    """

    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)*)(.*)", item["version"])
    assert match is not None
    return item["family"], tuple(int(part) for part in match.group(1).split(".")), match.group(2)


def profile_identity(protocol_targets: list[dict[str, str]]) -> str:
    """The profile id and file name: every declared family, in canonical order."""

    return "_".join(f"{item['family']}-{item['version']}" for item in protocol_targets)


def validate_profile_protocol_targets(value: Any, label: str) -> list[dict[str, str]]:
    if not isinstance(value, list) or not value:
        raise ContractViolation(f"{label} protocol_targets 必须是非空列表")
    protocol_targets: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict) or set(item) != {"family", "version"}:
            raise ContractViolation(f"{label} protocol_targets 条目字段不闭合")
        if not isinstance(item["family"], str) or item["family"] not in PROFILE_FAMILIES:
            raise ContractViolation(f"{label} family 只允许 mysql 或 mariadb")
        if not isinstance(item["version"], str) or PROFILE_VERSION.fullmatch(item["version"]) is None:
            raise ContractViolation(f"{label} version 无效")
        protocol_targets.append({"family": item["family"], "version": item["version"]})
    keys = [profile_family_key(item) for item in protocol_targets]
    if len(set(keys)) != len(keys) or keys != sorted(keys):
        raise ContractViolation(f"{label} protocol_targets 必须按协议家族与版本排序且不重复")
    return protocol_targets


def _profile_common(value: dict[str, Any], label: str, protocol_targets: list[dict[str, str]]) -> None:
    if value["schema"] != PROFILE_SCHEMA or value["schema_version"] != 1 or value["driver"] != "pymysql":
        raise ContractViolation(f"{label} schema/version/driver 不兼容")
    if (
        not isinstance(value["profile_id"], str)
        or PROFILE_IDENTITY.fullmatch(value["profile_id"]) is None
        or value["profile_id"] != profile_identity(protocol_targets)
    ):
        raise ContractViolation(f"{label} profile_id 与声明的协议目标不一致")
    compatibility = value["compatibility"]
    if (
        not isinstance(compatibility, dict)
        or set(compatibility) != PROFILE_COMPATIBILITY_FIELDS
        or any(type(compatibility[key]) is not bool for key in compatibility)
    ):
        raise ContractViolation(f"{label} compatibility 无效")


def legacy_profile(value: Any) -> bool:
    """Recognize deployment-product declarations without reinterpreting them."""
    common = {"schema", "schema_version", "profile_id", "driver", "compatibility"}
    return isinstance(value, dict) and set(value) in (
        common | {"engine", "version"}, common | {"engines"}
    )


def validate_profile(value: Any, label: str) -> dict[str, Any]:
    if legacy_profile(value):
        raise ContractViolation(
            f"{label} 是旧格式 profile（部署产品声明）；须由人确认协议兼容目标，按当前模板维护操作包"
        )
    if not isinstance(value, dict) or set(value) != PROFILE_FIELDS:
        raise ContractViolation(f"{label} 字段不闭合")
    targets = validate_profile_protocol_targets(value["protocol_targets"], label)
    _profile_common(value, label, targets)
    expected = {
        key: all(PROTOCOL_COMPATIBILITY[item["family"]][key] for item in targets)
        for key in PROFILE_COMPATIBILITY_FIELDS
    }
    if value["compatibility"] != expected:
        raise ContractViolation(f"{label} compatibility 与协议目标不一致")
    return value


def declared_protocol_targets(value: Any, label: str) -> list[dict[str, str]]:
    return validate_profile(value, label)["protocol_targets"]


def is_backup_operation(operation: dict[str, Any]) -> bool:
    """Legacy backup and explicitly declared strategies share one purpose."""
    return operation["name"] == "backup" or operation.get("purpose") == "backup"


def sql_statement(template: str, identifiers: dict[str, str], allowed: tuple[str, ...]) -> str:
    """Substitute only allowlisted single MySQL/MariaDB identifiers.

    Callers bind data separately with the driver's parameter argument. The
    conformance checker requires literal template/allowlist at the call site.
    """
    identifier = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
    if (not isinstance(template, str) or not isinstance(identifiers, dict)
        or not isinstance(allowed, tuple) or not allowed
        or any(not isinstance(item, str) or identifier.fullmatch(item) is None for item in allowed)):
        raise ContractViolation("受控 SQL 模板或对象 allowlist 无效")
    names = re.findall(r"\{([a-z][a-z0-9_]*)\}", template)
    residue = re.sub(r"\{[a-z][a-z0-9_]*\}", "", template)
    if not names or "{" in residue or "}" in residue or set(names) != set(identifiers):
        raise ContractViolation("受控 SQL 标识符占位不闭合")
    for value in identifiers.values():
        if not isinstance(value, str) or identifier.fullmatch(value) is None or value not in allowed:
            raise ContractViolation("SQL 标识符不在源码声明的对象范围中")
    return re.sub(r"\{([a-z][a-z0-9_]*)\}", lambda match: "`" + identifiers[match.group(1)] + "`", template)


def validate_operation_metadata(operation: Any) -> dict[str, Any]:
    """One declaration shared by generator, dispatcher and automation."""

    required = {"name", "mode", "runner", "input_schema"}
    if not isinstance(operation, dict) or set(operation) - {"purpose"} not in (
        required, required | {"guide", "example_input"}
    ):
        raise ContractViolation("operation 字段不闭合")
    if "purpose" in operation and (
        operation["purpose"] != "backup" or operation.get("mode") != "write"
        or "guide" not in operation
        or operation.get("name") in set(REQUIRED_OPERATIONS) - {"backup"} | {"repair"}
    ):
        raise ContractViolation("backup purpose 必须是独立 write operation 并提供 guide 和示例")
    if operation.get("name") == "repair" and (
        operation.get("mode") != "write" or "guide" not in operation
    ):
        raise ContractViolation("repair 必须使用 write mode 并提供项目使用说明和输入示例")
    if "guide" in operation:
        if not isinstance(operation["example_input"], str) or re.fullmatch(r"operations/[a-z][a-z0-9_-]*\.example\.json", operation["example_input"]) is None:
            raise ContractViolation("operation example_input 必须引用包内固定示例文件")
        guide = operation["guide"]
        if not isinstance(guide, dict) or set(guide) != GUIDE_FIELDS:
            raise ContractViolation("operation guide 字段不闭合")
        for field in GUIDE_FIELDS - {"objects"}:
            _plain_text(guide[field], f"operation guide.{field}")
        objects = guide["objects"]
        if (
            not isinstance(objects, list) or not objects
            or any(not isinstance(item, str) or REPORT_OBJECT.fullmatch(item) is None for item in objects)
            or objects != sorted(set(objects))
        ):
            raise ContractViolation("operation guide.objects 必须是排序唯一的数据库对象名")
    return operation


def validate_complete_operations(operations: dict[str, Any], entities: Any) -> None:
    """A connectivity-only package cannot be delivered as complete."""

    for entity in entities:
        names = entity["operations"]
        missing = sorted(set(REQUIRED_OPERATIONS) - set(names))
        if missing:
            raise ContractViolation(f"entity {entity['entity_id']} 缺少数据库操作：{', '.join(missing)}")
        for name, mode in REQUIRED_OPERATIONS.items():
            operation = operations[name]
            if operation["mode"] != mode:
                raise ContractViolation(f"operation {name} 必须使用 {mode} mode")
            if name != "check" and "guide" not in operation:
                raise ContractViolation(f"operation {name} 缺少项目使用说明和输入示例")


def validate_report(value: Any, guide: Any) -> dict[str, Any]:
    """Only declared object names and closed classifications leave the runner."""

    if not isinstance(value, dict) or set(value) != {"changes"} or not isinstance(value["changes"], list):
        raise ContractViolation("report 必须是闭合的 changes 列表")
    if not isinstance(guide, dict) or len(value["changes"]) > 1000:
        raise ContractViolation("report 缺少 operation guide 或超出容量")
    for change in value["changes"]:
        if not isinstance(change, dict) or set(change) != {"kind", "object", "reason", "action"}:
            raise ContractViolation("report change 字段不闭合")
        if (
            not isinstance(change["kind"], str) or change["kind"] not in REPORT_KINDS
            or not isinstance(change["reason"], str) or change["reason"] not in REPORT_REASONS
            or not isinstance(change["action"], str) or change["action"] not in REPORT_ACTIONS
            or not isinstance(change["object"], str) or change["object"] not in guide["objects"]
        ):
            raise ContractViolation("report 只能公开已声明对象和固定差异分类")
    return value


def operation_files(operation: dict[str, Any]) -> set[str]:
    result = {operation["runner"], operation["input_schema"]}
    if "example_input" in operation:
        result.add(operation["example_input"])
    return result


def sensitive_property(name: str) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", "_", name.casefold()).strip("_")
    parts = set(normalized.split("_")) if normalized else set()
    compact = normalized.replace("_", "")
    return (
        normalized in SENSITIVE_NAME_PARTS
        or bool(parts & SENSITIVE_NAME_PARTS)
        or any(compact.endswith(suffix) for suffix in SENSITIVE_COMPACT_SUFFIXES)
    )


def _plain_text(value: Any, label: str, *, limit: int = 4096) -> str:
    if (
        not isinstance(value, str)
        or not value.strip()
        or len(value) > limit
        or any(character in value for character in "\r\n\x00")
    ):
        raise ContractViolation(f"{label}未填写或无效")
    return value


def targets_yaml_module() -> Any:
    """Load the documented package dependency only for YAML operations."""

    try:
        import yaml
    except ImportError:
        raise ContractViolation("YAML连接配置需要PyYAML；请运行 python3 -m pip install PyYAML") from None
    return yaml


def parse_targets_yaml(raw: bytes, label: str) -> Any:
    """Parse one safe YAML document without exposing input or parser diagnostics."""

    yaml = targets_yaml_module()

    class TargetsLoader(yaml.SafeLoader):
        def construct_mapping(self, node: Any, deep: bool = False) -> dict[str, Any]:
            if not isinstance(node, yaml.MappingNode):
                raise ContractViolation(f"{label}含无效映射")
            result: dict[str, Any] = {}
            for key_node, value_node in node.value:
                key = self.construct_object(key_node, deep=deep)
                if not isinstance(key, str) or key in result:
                    raise ContractViolation(f"{label}含重复或非字符串字段")
                result[key] = self.construct_object(value_node, deep=deep)
            return result

    try:
        return yaml.load(raw.decode("utf-8"), Loader=TargetsLoader)
    except ContractViolation:
        raise
    except (UnicodeDecodeError, yaml.YAMLError, ValueError, RecursionError):
        # YAML exceptions can include an entire credential line, even for tags
        # and duplicate keys. Only this fixed, secret-free message may escape.
        raise ContractViolation(f"{label}不是有效的单文档安全YAML") from None


def targets_template_bytes(entity_ids: list[str]) -> bytes:
    """Emit an editable block YAML skeleton in a stable field/entity order."""

    yaml = targets_yaml_module()
    return yaml.safe_dump(
        targets_template_document(entity_ids),
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
    ).encode("utf-8")


def targets_template_document(entity_ids: list[str]) -> dict[str, Any]:
    """The tracked skeleton of database.yaml: one empty target per entity."""

    return {
        "schema": TARGETS_SCHEMA,
        "schema_version": 1,
        "entities": [
            {
                "entity_id": entity_id,
                "host": "",
                "port": None,
                "database": "",
                "username": "",
                "password": "",
                "tls_ca_file": None,
            }
            for entity_id in sorted(entity_ids)
        ],
    }


def validate_targets(value: Any, *, template: bool = False) -> dict[str, dict[str, Any]]:
    """Close the database.yaml (or its template) shape and return targets by entity.

    ``template=True`` requires every connection field to stay empty so the
    tracked skeleton can never carry a real target.
    """

    label = TARGETS_TEMPLATE_FILE if template else TARGETS_FILE
    if not isinstance(value, dict) or set(value) != {"schema", "schema_version", "entities"}:
        raise ContractViolation(f"{label}字段不闭合")
    if value["schema"] != TARGETS_SCHEMA or type(value["schema_version"]) is not int or value["schema_version"] != 1:
        raise ContractViolation(f"{label} schema/version不兼容")
    if not isinstance(value["entities"], list):
        raise ContractViolation(f"{label} entities必须是array")
    result: dict[str, dict[str, Any]] = {}
    for raw in value["entities"]:
        if not isinstance(raw, dict) or not TARGET_REQUIRED_FIELDS <= set(raw) <= TARGET_FIELDS:
            raise ContractViolation(f"{label} entity字段不闭合")
        entity_id = raw["entity_id"]
        if not isinstance(entity_id, str) or ENTITY_IDENTITY.fullmatch(entity_id) is None:
            raise ContractViolation(f"{label} entity_id无效")
        if entity_id in result:
            raise ContractViolation(f"{label} entity重复：{entity_id}")
        entry = f"{label} {entity_id}"
        if template:
            if (
                raw["host"] != ""
                or raw["port"] is not None
                or raw["database"] != ""
                or raw["username"] != ""
                or raw["password"] != ""
                or raw.get("tls_ca_file") is not None
            ):
                raise ContractViolation(f"{entry} 连接字段必须留空")
            result[entity_id] = {**raw, "tls_ca_file": None}
            continue
        for field in ("host", "database", "username"):
            _plain_text(raw[field], f"{entry} {field}")
        _plain_text(raw["password"], f"{entry} password")
        port = raw["port"]
        if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
            raise ContractViolation(f"{entry} port必须是1..65535")
        ca = raw.get("tls_ca_file")
        if ca is not None and (
            not isinstance(ca, str)
            or TLS_CA_PATH.fullmatch(ca) is None
            or any(part in {"", ".", ".."} for part in ca.split("/"))
        ):
            raise ContractViolation(f"{entry} tls_ca_file必须是{LOCAL_ROOT}/下的相对路径")
        result[entity_id] = {**raw, "tls_ca_file": ca}
    return result


def target_projection(target: dict[str, Any]) -> dict[str, Any]:
    """The non-secret part of one target that may enter plans and evidence."""

    return {field: target[field] for field in TARGET_PROJECTION_FIELDS}


def validate_material(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractViolation("material必须是闭合JSON object")
    required = {"host", "port", "database", "username", "password"}
    allowed = required | {"tls"}
    if set(value) != required and set(value) != allowed:
        raise ContractViolation("material字段不闭合")
    for key in ("host", "database", "username", "password"):
        item = value[key]
        if not isinstance(item, str) or not item or len(item) > 4096:
            raise ContractViolation(f"material.{key}无效")
    port = value["port"]
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise ContractViolation("material.port无效")
    if "tls" in value:
        tls = value["tls"]
        if not isinstance(tls, dict) or not tls:
            raise ContractViolation("material.tls必须是非空闭合object")
        allowed_tls = {"ca", "cert", "check_hostname", "key"}
        if not set(tls) <= allowed_tls:
            raise ContractViolation("material.tls字段不闭合")
        for key, item in tls.items():
            if key == "check_hostname":
                if type(item) is not bool:
                    raise ContractViolation("material.tls.check_hostname无效")
            elif not isinstance(item, str) or not item or len(item) > 16384:
                raise ContractViolation(f"material.tls.{key}无效")
    return value


def secret_scalars(material: dict[str, Any]) -> list[str]:
    """Values that must never leave the runner boundary: password and TLS material.

    host, port, database and username are the target's non-secret projection;
    they are bound into plans on purpose and are not treated as leaks.
    """

    result: list[str] = [material["password"]]
    tls = material.get("tls")
    if isinstance(tls, dict):
        result.extend(item for key, item in tls.items() if key != "check_hostname")
    return [item for item in result if isinstance(item, str) and item]


def _schema_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    optional_draft = {"$schema"} if value.get("$schema") == SCHEMA_DRAFT else set()
    if set(value) != expected | optional_draft:
        raise ContractViolation(f"{label}字段不闭合")


def validate_input_schema(
    value: Any,
    label: str = "operation input schema",
    *,
    _root: bool = True,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractViolation(f"{label}必须是object")
    kind = value.get("type")
    if _root and kind != "object":
        raise ContractViolation(f"{label} root必须是闭合object")
    if kind == "object":
        _schema_keys(value, {"type", "additionalProperties", "required", "properties"}, label)
        if value["additionalProperties"] is not False:
            raise ContractViolation(f"{label}必须additionalProperties=false")
        properties = value["properties"]
        required = value["required"]
        if not isinstance(properties, dict) or not isinstance(required, list):
            raise ContractViolation(f"{label} properties/required无效")
        if required != sorted(properties) or len(required) != len(set(required)):
            raise ContractViolation(f"{label}必须要求全部排序后的properties")
        for name, child in properties.items():
            if PROPERTY_NAME.fullmatch(name) is None or sensitive_property(name):
                raise ContractViolation(f"{label}含敏感或无效property：{name}")
            validate_input_schema(child, f"{label}.{name}", _root=False)
        return value
    if kind == "array":
        _schema_keys(value, {"type", "items", "minItems", "maxItems", "uniqueItems"}, label)
        if (type(value["minItems"]) is not int or type(value["maxItems"]) is not int
            or not 1 <= value["minItems"] <= value["maxItems"] <= 1000
            or value["uniqueItems"] is not True or not isinstance(value["items"], dict)
            or value["items"].get("type") != "string"):
            raise ContractViolation(f"{label} array 必须是有界去重的 string enum 列表")
        validate_input_schema(value["items"], f"{label}.items", _root=False)
        return value
    if kind == "string":
        _schema_keys(value, {"type", "enum"}, label)
        choices = value["enum"]
        if (
            not isinstance(choices, list)
            or not choices
            or any(not isinstance(item, str) or len(item) > 4096 for item in choices)
            or choices != sorted(set(choices))
        ):
            raise ContractViolation(f"{label} string enum无效")
        if any(SQL_TEXT.search(item) for item in choices):
            raise ContractViolation(f"{label}不得包含SQL原文")
        return value
    if kind in {"integer", "number"}:
        _schema_keys(value, {"type", "minimum", "maximum"}, label)
        minimum = value["minimum"]
        maximum = value["maximum"]
        expected = int if kind == "integer" else (int, float)
        if (
            isinstance(minimum, bool)
            or isinstance(maximum, bool)
            or not isinstance(minimum, expected)
            or not isinstance(maximum, expected)
            or minimum > maximum
        ):
            raise ContractViolation(f"{label} numeric range无效")
        return value
    if kind == "boolean":
        _schema_keys(value, {"type"}, label)
        return value
    raise ContractViolation(f"{label} type不在闭合allowlist")


def validate_operation_input(value: Any, schema: dict[str, Any], label: str = "operation input") -> None:
    kind = schema["type"]
    if kind == "object":
        if not isinstance(value, dict) or set(value) != set(schema["properties"]):
            raise ContractViolation(f"{label}字段不闭合")
        for name, child in schema["properties"].items():
            validate_operation_input(value[name], child, f"{label}.{name}")
        return
    if kind == "array":
        if not isinstance(value, list) or not schema["minItems"] <= len(value) <= schema["maxItems"]:
            raise ContractViolation(f"{label} 列表数量越界")
        for item in value:
            validate_operation_input(item, schema["items"], f"{label}.items")
        if len(set(value)) != len(value):
            raise ContractViolation(f"{label} 列表含重复条目")
        return
    if kind == "string":
        if not isinstance(value, str) or value not in schema["enum"]:
            raise ContractViolation(f"{label}不在允许值中")
        return
    if kind == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            raise ContractViolation(f"{label}不是integer")
    elif kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ContractViolation(f"{label}不是number")
    elif kind == "boolean":
        if type(value) is not bool:
            raise ContractViolation(f"{label}不是boolean")
        return
    if value < schema["minimum"] or value > schema["maximum"]:
        raise ContractViolation(f"{label}越出允许范围")


def validate_runner_source_text(
    source: str,
    label: str,
    *,
    filename: str = "<database-operation-runner>",
) -> None:
    try:
        tree = ast.parse(source, filename=filename)
    except SyntaxError as error:
        raise ContractViolation(f"{label}不是可解析Python source") from error

    allowed_imports = {"hashlib", "json", "pathlib", "pymysql", "ssl", "sys", "time"}
    allowed_from_imports = {"pathlib": {"Path"}, "lib.contracts": {"sql_statement"}}
    builtin_callables = {
        "SystemExit",
        "ValueError",
        "bool",
        "int",
        "len",
        "list",
        "set",
        "sorted",
        "object",
        "print",
        "str",
        "type",
    }
    allowed_attribute_callables = {
        "commit",
        "close",
        "connect",
        "create_default_context",
        "cursor",
        "dumps",
        "encode",
        "exists",
        "fetchone",
        "fetchall",
        "get",
        "hexdigest",
        "load",
        "loads",
        "read_bytes",
        "read_text",
        "replace",
        "rollback",
        "sha256",
        "sleep",
        "strip",
        "unlink",
        "write",
        "write_text",
    } | SQL_METHODS
    subscript_data_methods = {"encode"}
    declared_callables = set(builtin_callables)

    helper_imports = [node for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module == "lib.contracts"]
    helper_bindings = [alias for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom))
                       for alias in node.names if (alias.asname or alias.name.split(".")[0]) == "sql_statement"]
    if helper_imports and (len(helper_bindings) != 1 or len(helper_imports) != 1
        or helper_imports[0].level != 0
        or len(helper_imports[0].names) != 1
        or helper_imports[0].names[0].name != "sql_statement"
        or helper_imports[0].names[0].asname is not None
        or any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "sql_statement" for node in ast.walk(tree))):
        raise ContractViolation(f"{label}受控 SQL helper identity 不唯一")

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            raise ContractViolation(f"{label}包含未声明class执行面")
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.decorator_list:
                raise ContractViolation(f"{label}包含decorator执行面")
            declared_callables.add(node.name)
        elif isinstance(node, ast.Import):
            for imported in node.names:
                root = imported.name.split(".", 1)[0]
                if root not in allowed_imports or imported.name != root:
                    raise ContractViolation(f"{label}包含未允许import执行面")
                declared_callables.add(imported.asname or root)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if module == "__future__":
                continue
            allowed_names = allowed_from_imports.get(module)
            if allowed_names is None:
                raise ContractViolation(f"{label}包含未允许from-import执行面")
            for imported in node.names:
                if imported.name not in allowed_names:
                    raise ContractViolation(f"{label}包含未允许from-import执行面")
                declared_callables.add(imported.asname or imported.name)

    for node in ast.walk(tree):
        # Pattern captures and exception aliases bind names without a Name/Store
        # node. Protect the same callable identities across all binding syntax.
        captured = None
        if isinstance(node, ast.ExceptHandler) or type(node).__name__ in {"MatchAs", "MatchStar"}:
            captured = node.name
        elif type(node).__name__ == "MatchMapping":
            captured = node.rest
        if captured in declared_callables:
            raise ContractViolation(f"{label}重绑定允许调用identity")
        if isinstance(node, ast.Attribute) and (
            node.attr in {"modules", "path", "meta_path", "path_hooks", "path_importer_cache"}
            or (isinstance(node.ctx, (ast.Store, ast.Del)) and node.attr not in {"check_hostname", "verify_mode"})
        ):
            raise ContractViolation(f"{label}包含导入环境或受信模块篡改执行面")
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            raise ContractViolation(f"{label}包含private attribute执行面")
        if (
            isinstance(node, ast.Name)
            and isinstance(node.ctx, ast.Store)
            and node.id in declared_callables
        ):
            raise ContractViolation(f"{label}重绑定允许调用identity")
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            arguments = (
                list(node.args.posonlyargs)
                + list(node.args.args)
                + list(node.args.kwonlyargs)
            )
            if node.args.vararg is not None:
                arguments.append(node.args.vararg)
            if node.args.kwarg is not None:
                arguments.append(node.args.kwarg)
            if any(argument.arg in declared_callables for argument in arguments):
                raise ContractViolation(f"{label}参数重绑定允许调用identity")

    def static_attribute_target(node: ast.Attribute) -> bool:
        value: ast.expr = node.value
        while isinstance(value, ast.Attribute):
            if value.attr.startswith("__"):
                return False
            value = value.value
        if isinstance(value, ast.Subscript):
            return node.attr in subscript_data_methods
        return isinstance(value, (ast.Name, ast.Call))

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if isinstance(node.func, ast.Name):
            if node.func.id not in declared_callables:
                raise ContractViolation(
                    f"{label}包含动态SQL或未声明调用执行面"
                )
        elif isinstance(node.func, ast.Attribute):
            if (
                node.func.attr not in allowed_attribute_callables
                or not static_attribute_target(node.func)
            ):
                raise ContractViolation(
                    f"{label}包含动态SQL或未声明调用执行面"
                )
        else:
            raise ContractViolation(f"{label}包含动态SQL或未声明调用执行面")
        call_name = (
            node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id
        )
        if call_name == "sorted" and (len(node.args) != 1 or node.keywords):
            raise ContractViolation(f"{label} sorted 只允许单 iterable，不接受高阶 key 调用")
        if call_name == "sql_statement":
            if (not helper_imports or not isinstance(node.func, ast.Name)
                or len(node.args) != 3 or node.keywords
                or not isinstance(node.args[0], ast.Constant) or not isinstance(node.args[0].value, str)
                or not isinstance(node.args[2], ast.Tuple)
                or not node.args[2].elts
                or any(not isinstance(item, ast.Constant) or not isinstance(item.value, str)
                       or re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,63}", item.value) is None for item in node.args[2].elts)):
                raise ContractViolation(f"{label}受控 SQL 必须使用源码 literal 模板与对象 allowlist")
        if call_name.casefold() in SQL_METHODS:
            statement = node.args[0] if node.args else None
            literal = isinstance(statement, ast.Constant) and isinstance(statement.value, str)
            controlled = (isinstance(statement, ast.Call) and isinstance(statement.func, ast.Name)
                          and statement.func.id == "sql_statement" and bool(helper_imports))
            if not literal and not controlled:
                raise ContractViolation(f"{label}包含动态SQL执行面")


def validate_runner_source(path: Path, label: str) -> None:
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise ContractViolation(f"{label}不是可解析Python source") from error
    validate_runner_source_text(source, label, filename=str(path))
