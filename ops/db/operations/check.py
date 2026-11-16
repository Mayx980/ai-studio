#!/usr/bin/env python3
"""Fixed MySQL/MariaDB read-only connectivity and identity check."""

from __future__ import annotations

import hashlib
import json
import ssl
import sys


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def driver_failure(error):
    """A PyMySQL error as its driver error code and PEP 249 class name; None otherwise."""
    try:
        import pymysql

        classes = (
            (pymysql.OperationalError, "OperationalError"),
            (pymysql.ProgrammingError, "ProgrammingError"),
            (pymysql.IntegrityError, "IntegrityError"),
            (pymysql.DataError, "DataError"),
            (pymysql.NotSupportedError, "NotSupportedError"),
            (pymysql.InternalError, "InternalError"),
            (pymysql.InterfaceError, "InterfaceError"),
            (pymysql.DatabaseError, "DatabaseError"),
            (pymysql.Error, "Error"),
        )
        for kind, name in classes:
            if type(error) is kind and type(error.args[0]) is int:
                return {"code": error.args[0], "exception": name}
    except Exception:
        return None
    return None


def main() -> int:
    try:
        request = json.load(sys.stdin)
        if request.get("action") != "check":
            raise ValueError("unsupported action")
        material = request["material"]
        import pymysql

        options = {
            "host": material["host"],
            "port": int(material["port"]),
            "user": material["username"],
            "password": material["password"],
            "database": material["database"],
            "connect_timeout": 10,
            "read_timeout": 10,
            "write_timeout": 10,
            "autocommit": False,
        }
        if material.get("tls"):
            options["ssl"] = ssl.create_default_context(cadata=material["tls"]["ca"])
        else:
            options["ssl_disabled"] = True
        connection = pymysql.connect(**options)
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT @@version")
                version = str(cursor.fetchone()[0])
                cursor.execute("SELECT DATABASE()")
                selected = str(cursor.fetchone()[0])
            connection.rollback()
        finally:
            connection.close()
        # Observe server text without inferring a product or proving SQL compatibility.
        identity_source = canonical(
            {
                "host": material["host"],
                "port": int(material["port"]),
                "database": material["database"],
            }
        ).encode("utf-8")
        result = {
            "database_identity": "sha256:" + hashlib.sha256(identity_source).hexdigest(),
            "observed_state": {"server_version": version, "selected": bool(selected)},
            "status": "passed",
        }
        sys.stdout.write(canonical(result) + "\n")
        return 0
    except Exception as error:
        failure = driver_failure(error)
        if failure is not None:
            sys.stdout.write(canonical({"failure": failure}) + "\n")
        print("database check failed", file=sys.stderr)
        return 2


raise SystemExit(main())
