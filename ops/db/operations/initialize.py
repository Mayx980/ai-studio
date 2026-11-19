#!/usr/bin/env python3
"""AFXEN mysql 8.4 schema v1 operations. Only db-ops invokes this runner.

Schema changes are explicit, forward-only and require the dispatcher's plan.
No application data, credentials or SQL errors are printed.
"""
from __future__ import annotations
import hashlib
import json
import ssl
import sys
import pymysql
from pathlib import Path
from lib.contracts import sql_statement

targetDigest = '16e7f3cb8ba23109aa3fd877cce472ed3f35d5154509a27d4e3df34c5d304b7e'
tables = ['schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports', 'backupCatalog']
backupNames = {'schemaMigrations': 'backupSchemaMigrations', 'users': 'backupUsers', 'sessions': 'backupSessions', 'userSettings': 'backupUserSettings', 'providerSecrets': 'backupProviderSecrets', 'creationStates': 'backupCreationStates', 'libraryStates': 'backupLibraryStates', 'mediaFiles': 'backupMediaFiles', 'dataImports': 'backupDataImports'}
expectedColumns = [['backupCatalog', 'createdAt', 'bigint unsigned', 'NO', None, '', None, None], ['backupCatalog', 'digest', 'char(64)', 'NO', None, '', 'ascii', 'ascii_bin'], ['backupCatalog', 'id', 'varchar(32)', 'NO', None, '', 'ascii', 'ascii_bin'], ['creationStates', 'payload', 'json', 'NO', None, '', None, None], ['creationStates', 'revision', 'char(64)', 'NO', None, '', 'ascii', 'ascii_bin'], ['creationStates', 'userId', 'char(36)', 'NO', None, '', 'ascii', 'ascii_bin'], ['dataImports', 'completedAt', 'bigint unsigned', 'NO', None, '', None, None], ['dataImports', 'id', 'varchar(64)', 'NO', None, '', 'ascii', 'ascii_bin'], ['dataImports', 'sourceDigest', 'char(64)', 'NO', None, '', 'ascii', 'ascii_bin'], ['dataImports', 'userId', 'char(36)', 'NO', None, '', 'ascii', 'ascii_bin'], ['libraryStates', 'content', 'longtext', 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['libraryStates', 'deleted', 'tinyint unsigned', 'NO', '0', '', None, None], ['libraryStates', 'library', "enum('assets','templates')", 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['libraryStates', 'name', 'varchar(128)', 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['libraryStates', 'revision', 'char(64)', 'NO', None, '', 'ascii', 'ascii_bin'], ['libraryStates', 'userId', 'char(36)', 'NO', None, '', 'ascii', 'ascii_bin'], ['mediaFiles', 'bucket', 'varchar(255)', 'YES', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['mediaFiles', 'createdAt', 'bigint unsigned', 'NO', None, '', None, None], ['mediaFiles', 'id', 'char(36)', 'NO', None, '', 'ascii', 'ascii_bin'], ['mediaFiles', 'locationHash', 'char(64)', 'YES', None, '', 'ascii', 'ascii_bin'], ['mediaFiles', 'logicalPath', 'varchar(4096)', 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['mediaFiles', 'mimeType', 'varchar(128)', 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['mediaFiles', 'object', 'varchar(1024)', 'YES', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['mediaFiles', 'pathHash', 'char(64)', 'NO', None, '', 'ascii', 'ascii_bin'], ['mediaFiles', 'revision', 'char(64)', 'NO', None, '', 'ascii', 'ascii_bin'], ['mediaFiles', 'size', 'bigint unsigned', 'NO', None, '', None, None], ['mediaFiles', 'status', "enum('pending','active','retired','deleted')", 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['mediaFiles', 'storageKind', "enum('local','oss')", 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['mediaFiles', 'userId', 'char(36)', 'NO', None, '', 'ascii', 'ascii_bin'], ['providerSecrets', 'ciphertext', 'varbinary(8192)', 'NO', None, '', None, None], ['providerSecrets', 'keyVersion', 'varchar(32)', 'NO', None, '', 'ascii', 'ascii_bin'], ['providerSecrets', 'kind', "enum('text','media')", 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['providerSecrets', 'nonce', 'binary(12)', 'NO', None, '', None, None], ['providerSecrets', 'providerId', 'varchar(128)', 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['providerSecrets', 'tag', 'binary(16)', 'NO', None, '', None, None], ['providerSecrets', 'userId', 'char(36)', 'NO', None, '', 'ascii', 'ascii_bin'], ['schemaMigrations', 'appliedAt', 'bigint unsigned', 'NO', None, '', None, None], ['schemaMigrations', 'digest', 'char(64)', 'NO', None, '', 'ascii', 'ascii_bin'], ['schemaMigrations', 'shape', 'json', 'YES', None, '', None, None], ['schemaMigrations', 'version', 'int unsigned', 'NO', None, '', None, None], ['sessions', 'authVersion', 'bigint unsigned', 'NO', None, '', None, None], ['sessions', 'csrf', 'char(64)', 'NO', None, '', 'ascii', 'ascii_bin'], ['sessions', 'expiresAt', 'bigint unsigned', 'NO', None, '', None, None], ['sessions', 'tokenHash', 'char(64)', 'NO', None, '', 'ascii', 'ascii_bin'], ['sessions', 'userId', 'char(36)', 'NO', None, '', 'ascii', 'ascii_bin'], ['userSettings', 'payload', 'json', 'NO', None, '', None, None], ['userSettings', 'revision', 'bigint unsigned', 'NO', '1', '', None, None], ['userSettings', 'userId', 'char(36)', 'NO', None, '', 'ascii', 'ascii_bin'], ['users', 'authVersion', 'bigint unsigned', 'NO', '1', '', None, None], ['users', 'createdAt', 'bigint unsigned', 'NO', None, '', None, None], ['users', 'enabled', 'tinyint unsigned', 'NO', '1', '', None, None], ['users', 'id', 'char(36)', 'NO', None, '', 'ascii', 'ascii_bin'], ['users', 'legacyRoot', 'tinyint unsigned', 'NO', '0', '', None, None], ['users', 'mustChangePassword', 'tinyint unsigned', 'NO', '1', '', None, None], ['users', 'name', 'varchar(80)', 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['users', 'passwordHash', 'varchar(255)', 'NO', None, '', 'ascii', 'ascii_bin'], ['users', 'role', "enum('admin','user')", 'NO', None, '', 'utf8mb4', 'utf8mb4_0900_bin'], ['users', 'username', 'varchar(64)', 'NO', None, '', 'ascii', 'ascii_bin']]
expectedIndexes = [['backupCatalog', 'PRIMARY', 0, 1, 'id'], ['creationStates', 'PRIMARY', 0, 1, 'userId'], ['dataImports', 'PRIMARY', 0, 1, 'id'], ['dataImports', 'idxImportsUser', 1, 1, 'userId'], ['libraryStates', 'PRIMARY', 0, 1, 'userId'], ['libraryStates', 'PRIMARY', 0, 2, 'library'], ['libraryStates', 'PRIMARY', 0, 3, 'name'], ['mediaFiles', 'PRIMARY', 0, 1, 'id'], ['mediaFiles', 'idxMediaDirectory', 1, 1, 'userId'], ['mediaFiles', 'idxMediaDirectory', 1, 2, 'status'], ['mediaFiles', 'idxMediaDirectory', 1, 3, 'createdAt'], ['mediaFiles', 'idxMediaPath', 1, 1, 'userId'], ['mediaFiles', 'idxMediaPath', 1, 2, 'pathHash'], ['mediaFiles', 'uniqMediaLocation', 0, 1, 'userId'], ['mediaFiles', 'uniqMediaLocation', 0, 2, 'locationHash'], ['providerSecrets', 'PRIMARY', 0, 1, 'userId'], ['providerSecrets', 'PRIMARY', 0, 2, 'providerId'], ['providerSecrets', 'PRIMARY', 0, 3, 'kind'], ['schemaMigrations', 'PRIMARY', 0, 1, 'version'], ['sessions', 'PRIMARY', 0, 1, 'tokenHash'], ['sessions', 'idxSessionsExpiry', 1, 1, 'expiresAt'], ['sessions', 'idxSessionsUserExpires', 1, 1, 'userId'], ['sessions', 'idxSessionsUserExpires', 1, 2, 'expiresAt'], ['userSettings', 'PRIMARY', 0, 1, 'userId'], ['users', 'PRIMARY', 0, 1, 'id'], ['users', 'uniqUsersUsername', 0, 1, 'username']]
expectedForeign = [['creationStates', 'fkCreationStatesUser', 'userId', 'users', 'id', 'RESTRICT', 'RESTRICT'], ['dataImports', 'fkDataImportsUser', 'userId', 'users', 'id', 'RESTRICT', 'RESTRICT'], ['libraryStates', 'fkLibraryStatesUser', 'userId', 'users', 'id', 'RESTRICT', 'RESTRICT'], ['mediaFiles', 'fkMediaFilesUser', 'userId', 'users', 'id', 'RESTRICT', 'RESTRICT'], ['providerSecrets', 'fkProviderSecretsUser', 'userId', 'users', 'id', 'RESTRICT', 'RESTRICT'], ['sessions', 'fkSessionsUser', 'userId', 'users', 'id', 'RESTRICT', 'RESTRICT'], ['userSettings', 'fkUserSettingsUser', 'userId', 'users', 'id', 'RESTRICT', 'RESTRICT']]
expectedChecks = [['libraryStates', 'chkLibraryDeleted', 'YES'], ['libraryStates', 'chkLibraryJson', 'YES'], ['mediaFiles', 'chkMediaLocation', 'YES'], ['mediaFiles', 'chkMediaSize', 'YES'], ['mediaFiles', 'chkMediaStorage', 'YES'], ['userSettings', 'chkSettingsRevision', 'YES'], ['users', 'chkUserAuthVersion', 'YES'], ['users', 'chkUserEnabled', 'YES'], ['users', 'chkUserLegacyRoot', 'YES'], ['users', 'chkUserPasswordChange', 'YES']]

backupTables = ['schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports']


def canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def shape(cursor: pymysql.cursors.Cursor) -> dict:
    result = {}
    cursor.execute("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports', 'backupCatalog') ORDER BY TABLE_NAME,COLUMN_NAME")
    result['columns'] = [list(row) for row in cursor.fetchall()]
    cursor.execute("SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports', 'backupCatalog') ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX")
    result['indexes'] = [list(row) for row in cursor.fetchall()]
    cursor.execute("SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL AND k.TABLE_NAME IN ('schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports', 'backupCatalog') ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION")
    result['foreign'] = [list(row) for row in cursor.fetchall()]
    cursor.execute("SELECT TABLE_NAME,CONSTRAINT_NAME,ENFORCED FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='CHECK' AND TABLE_NAME IN ('schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports', 'backupCatalog') ORDER BY TABLE_NAME,CONSTRAINT_NAME")
    result['checks'] = [list(row) for row in cursor.fetchall()]
    cursor.execute("SELECT t.TABLE_NAME,t.CONSTRAINT_NAME,c.CHECK_CLAUSE FROM information_schema.TABLE_CONSTRAINTS t JOIN information_schema.CHECK_CONSTRAINTS c ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME WHERE t.CONSTRAINT_SCHEMA=DATABASE() AND t.CONSTRAINT_TYPE='CHECK' AND t.TABLE_NAME IN ('schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports', 'backupCatalog') ORDER BY t.TABLE_NAME,t.CONSTRAINT_NAME")
    result['clauses'] = [list(row) for row in cursor.fetchall()]
    cursor.execute("SELECT TABLE_NAME,ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports', 'backupCatalog') ORDER BY TABLE_NAME")
    result['engines'] = [list(row) for row in cursor.fetchall()]
    return result


def createTables(cursor: pymysql.cursors.Cursor) -> None:
    cursor.execute('CREATE TABLE `schemaMigrations` (`version` int unsigned NOT NULL, `digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `shape` json NULL, `appliedAt` bigint unsigned NOT NULL, PRIMARY KEY (`version`)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin')
    cursor.execute("CREATE TABLE `users` (`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `username` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `name` varchar(80) NOT NULL, `role` enum('admin','user') NOT NULL, `enabled` tinyint unsigned NOT NULL DEFAULT 1, `passwordHash` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `authVersion` bigint unsigned NOT NULL DEFAULT 1, `mustChangePassword` tinyint unsigned NOT NULL DEFAULT 1, `legacyRoot` tinyint unsigned NOT NULL DEFAULT 0, `createdAt` bigint unsigned NOT NULL, PRIMARY KEY (`id`), UNIQUE KEY `uniqUsersUsername` (`username`), CONSTRAINT `chkUserEnabled` CHECK (enabled in (0,1)), CONSTRAINT `chkUserPasswordChange` CHECK (mustChangePassword in (0,1)), CONSTRAINT `chkUserLegacyRoot` CHECK (legacyRoot in (0,1)), CONSTRAINT `chkUserAuthVersion` CHECK (authVersion >= 1)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin")
    cursor.execute('CREATE TABLE `sessions` (`tokenHash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `authVersion` bigint unsigned NOT NULL, `csrf` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `expiresAt` bigint unsigned NOT NULL, PRIMARY KEY (`tokenHash`), KEY `idxSessionsUserExpires` (`userId`,`expiresAt`), KEY `idxSessionsExpiry` (`expiresAt`), CONSTRAINT `fkSessionsUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin')
    cursor.execute('CREATE TABLE `userSettings` (`userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `payload` json NOT NULL, `revision` bigint unsigned NOT NULL DEFAULT 1, PRIMARY KEY (`userId`), CONSTRAINT `fkUserSettingsUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT, CONSTRAINT `chkSettingsRevision` CHECK (revision >= 1)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin')
    cursor.execute("CREATE TABLE `providerSecrets` (`userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `providerId` varchar(128) NOT NULL, `kind` enum('text','media') NOT NULL, `keyVersion` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `nonce` binary(12) NOT NULL, `ciphertext` varbinary(8192) NOT NULL, `tag` binary(16) NOT NULL, PRIMARY KEY (`userId`,`providerId`,`kind`), CONSTRAINT `fkProviderSecretsUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin")
    cursor.execute('CREATE TABLE `creationStates` (`userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `payload` json NOT NULL, `revision` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, PRIMARY KEY (`userId`), CONSTRAINT `fkCreationStatesUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin')
    cursor.execute("CREATE TABLE `libraryStates` (`userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `library` enum('assets','templates') NOT NULL, `name` varchar(128) NOT NULL, `content` longtext NOT NULL, `revision` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `deleted` tinyint unsigned NOT NULL DEFAULT 0, PRIMARY KEY (`userId`,`library`,`name`), CONSTRAINT `fkLibraryStatesUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT, CONSTRAINT `chkLibraryDeleted` CHECK (deleted in (0,1)), CONSTRAINT `chkLibraryJson` CHECK (json_valid(content))) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin")
    cursor.execute("CREATE TABLE `mediaFiles` (`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `logicalPath` varchar(4096) NOT NULL, `pathHash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `locationHash` char(64) CHARACTER SET ascii COLLATE ascii_bin NULL, `storageKind` enum('local','oss') NOT NULL, `bucket` varchar(255) NULL, `object` varchar(1024) NULL, `mimeType` varchar(128) NOT NULL, `size` bigint unsigned NOT NULL, `revision` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `status` enum('pending','active','retired','deleted') NOT NULL, `createdAt` bigint unsigned NOT NULL, PRIMARY KEY (`id`), UNIQUE KEY `uniqMediaLocation` (`userId`,`locationHash`), KEY `idxMediaPath` (`userId`,`pathHash`), KEY `idxMediaDirectory` (`userId`,`status`,`createdAt`), CONSTRAINT `fkMediaFilesUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT, CONSTRAINT `chkMediaSize` CHECK (size between 1 and 104857600), CONSTRAINT `chkMediaLocation` CHECK ((status = 'active' and locationHash is not null and locationHash = pathHash) or (status <> 'active' and locationHash is null)), CONSTRAINT `chkMediaStorage` CHECK ((storageKind = 'local' and bucket is null and object is null) or (storageKind = 'oss' and bucket is not null and object is not null))) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin")
    cursor.execute('CREATE TABLE `dataImports` (`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `sourceDigest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `completedAt` bigint unsigned NOT NULL, PRIMARY KEY (`id`), KEY `idxImportsUser` (`userId`), CONSTRAINT `fkDataImportsUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin')

    cursor.execute('CREATE TABLE `backupCatalog` (`id` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, `createdAt` bigint unsigned NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin')

def differences(actual: dict, baseline: dict | None = None) -> list:
    changes = []
    for expected in expectedColumns:
        found = None
        for row in actual["columns"]:
            if row[:2] == expected[:2]:
                found = row
        name = expected[0] + "." + expected[1]
        if found is None:
            changes += [{"kind": "column", "object": name, "reason": "missing", "action": "check"}]
        else:
            if found[2] != expected[2] or found[5:] != expected[5:]:
                changes += [{"kind": "column", "object": name, "reason": "type", "action": "check"}]
            if found[3] != expected[3]:
                changes += [{"kind": "column", "object": name, "reason": "nullability", "action": "check"}]
            if found[4] != expected[4]:
                changes += [{"kind": "column", "object": name, "reason": "default", "action": "check"}]
    for row in actual["columns"]:
        if row[:2] not in [expected[:2] for expected in expectedColumns]:
            changes += [{"kind": "column", "object": row[0] + "." + row[1], "reason": "unexpected", "action": "check"}]
    for category, expectedRows, kind in (("indexes", expectedIndexes, "index"), ("foreign", expectedForeign, "constraint"), ("checks", expectedChecks, "constraint")):
        for row in expectedRows:
            if row not in actual[category]:
                changes += [{"kind": kind, "object": row[0] + "." + row[1], "reason": "definition", "action": "check"}]
        for row in actual[category]:
            if row not in expectedRows:
                changes += [{"kind": kind, "object": row[0], "reason": "unexpected", "action": "check"}]
    for row in actual["engines"]:
        if row[1] != "InnoDB" or row[2] != "utf8mb4_0900_bin":
            changes += [{"kind": "table", "object": row[0], "reason": "definition", "action": "check"}]
    if baseline is not None and actual["clauses"] != baseline.get("clauses"):
        for row in actual["clauses"]:
            if row not in baseline.get("clauses", []):
                changes += [{"kind": "constraint", "object": row[0] + "." + row[1], "reason": "definition", "action": "check"}]
    unique = {}
    for change in changes:
        unique[canonical(change)] = change
    return [unique[key] for key in sorted(unique)]


def observe(cursor: pymysql.cursors.Cursor) -> dict:
    cursor.execute("SELECT @@server_uuid, DATABASE()")
    identity = hashlib.sha256(canonical(list(cursor.fetchone())).encode()).hexdigest()
    cursor.execute("SHOW GRANTS FOR CURRENT_USER")
    grants = hashlib.sha256(canonical([list(row) for row in cursor.fetchall()]).encode()).hexdigest()
    cursor.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME")
    present = [row[0] for row in cursor.fetchall()]
    actual = shape(cursor)
    version = None
    recordDigest = None
    baseline = None
    if "schemaMigrations" in present:
        cursor.execute("SELECT version,digest,shape FROM schemaMigrations ORDER BY version DESC LIMIT 1")
        row = cursor.fetchone()
        if row is not None:
            version = int(row[0])
            recordDigest = row[1]
            baseline = json.loads(row[2]) if type(row[2]) is str else row[2]
    changes = differences(actual, baseline)
    known = [name for name in tables if name in present]
    unknown = [name for name in present if name not in tables and name not in [backupNames[name] for name in backupTables]]
    state = "unknown"
    if not present:
        state = "empty"
    elif version is not None and version > 1:
        state = "newer"
    elif version == 1 and recordDigest == targetDigest and baseline is not None and not changes and not unknown:
        state = "current"
    elif known and (version == 1 or len(known) < len(tables)) and not unknown:
        state = "partial"
    else:
        state = "unmanaged"
    return {"identity": identity, "grants": grants, "state": state, "version": version, "shape": actual, "changes": changes, "present": present}


def backupState(cursor: pymysql.cursors.Cursor) -> dict:
    result = {}
    for table in backupTables:
        cursor.execute(sql_statement("CHECKSUM TABLE {copy} EXTENDED", {"copy": backupNames[table]}, ('schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports', 'backupSchemaMigrations', 'backupUsers', 'backupSessions', 'backupUserSettings', 'backupProviderSecrets', 'backupCreationStates', 'backupLibraryStates', 'backupMediaFiles', 'backupDataImports')))
        saved = cursor.fetchone()[1]
        if saved is None:
            raise ValueError("backup is missing or unreadable")
        result[table] = int(saved)
    cursor.execute("SELECT digest FROM backupCatalog WHERE id = 'current'")
    row = cursor.fetchone()
    if row is None or row[0] != hashlib.sha256(canonical(result).encode()).hexdigest():
        raise ValueError("backup artifact verification failed")
    return result


def createBackup(cursor: pymysql.cursors.Cursor) -> None:
    cursor.execute("CREATE TABLE `backupSchemaMigrations` LIKE `schemaMigrations`")
    cursor.execute("CREATE TABLE `backupUsers` LIKE `users`")
    cursor.execute("CREATE TABLE `backupSessions` LIKE `sessions`")
    cursor.execute("CREATE TABLE `backupUserSettings` LIKE `userSettings`")
    cursor.execute("CREATE TABLE `backupProviderSecrets` LIKE `providerSecrets`")
    cursor.execute("CREATE TABLE `backupCreationStates` LIKE `creationStates`")
    cursor.execute("CREATE TABLE `backupLibraryStates` LIKE `libraryStates`")
    cursor.execute("CREATE TABLE `backupMediaFiles` LIKE `mediaFiles`")
    cursor.execute("CREATE TABLE `backupDataImports` LIKE `dataImports`")
    cursor.execute('LOCK TABLES `schemaMigrations` READ, `backupSchemaMigrations` WRITE, `users` READ, `backupUsers` WRITE, `sessions` READ, `backupSessions` WRITE, `userSettings` READ, `backupUserSettings` WRITE, `providerSecrets` READ, `backupProviderSecrets` WRITE, `creationStates` READ, `backupCreationStates` WRITE, `libraryStates` READ, `backupLibraryStates` WRITE, `mediaFiles` READ, `backupMediaFiles` WRITE, `dataImports` READ, `backupDataImports` WRITE, `backupCatalog` WRITE')
    cursor.execute("INSERT INTO `backupSchemaMigrations` SELECT * FROM `schemaMigrations`")
    cursor.execute("INSERT INTO `backupUsers` SELECT * FROM `users`")
    cursor.execute("INSERT INTO `backupSessions` SELECT * FROM `sessions`")
    cursor.execute("INSERT INTO `backupUserSettings` SELECT * FROM `userSettings`")
    cursor.execute("INSERT INTO `backupProviderSecrets` SELECT * FROM `providerSecrets`")
    cursor.execute("INSERT INTO `backupCreationStates` SELECT * FROM `creationStates`")
    cursor.execute("INSERT INTO `backupLibraryStates` SELECT * FROM `libraryStates`")
    cursor.execute("INSERT INTO `backupMediaFiles` SELECT * FROM `mediaFiles`")
    cursor.execute("INSERT INTO `backupDataImports` SELECT * FROM `dataImports`")
    saved = {}
    for table in backupTables:
        cursor.execute(sql_statement("CHECKSUM TABLE {source} EXTENDED", {"source": table}, ('schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports', 'backupSchemaMigrations', 'backupUsers', 'backupSessions', 'backupUserSettings', 'backupProviderSecrets', 'backupCreationStates', 'backupLibraryStates', 'backupMediaFiles', 'backupDataImports')))
        original = cursor.fetchone()[1]
        cursor.execute(sql_statement("CHECKSUM TABLE {copy} EXTENDED", {"copy": backupNames[table]}, ('schemaMigrations', 'users', 'sessions', 'userSettings', 'providerSecrets', 'creationStates', 'libraryStates', 'mediaFiles', 'dataImports', 'backupSchemaMigrations', 'backupUsers', 'backupSessions', 'backupUserSettings', 'backupProviderSecrets', 'backupCreationStates', 'backupLibraryStates', 'backupMediaFiles', 'backupDataImports')))
        copied = cursor.fetchone()[1]
        if original is None or copied is None or copied != original:
            raise ValueError("backup copy did not preserve source contents")
        saved[table] = int(copied)
    cursor.execute("INSERT INTO backupCatalog (id,digest,createdAt) VALUES ('current',%s,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)", (hashlib.sha256(canonical(saved).encode()).hexdigest(),))


def main() -> int:
    try:
        request = json.load(sys.stdin)
        action = request["action"]
        operation = Path(__file__).stem
        material = request["material"]
        options = {"host": material["host"], "port": int(material["port"]), "user": material["username"], "password": material["password"],
                   "database": material["database"], "connect_timeout": 10, "read_timeout": 120, "write_timeout": 120, "autocommit": False, "charset": "utf8mb4"}
        if material.get("tls"):
            options["ssl"] = ssl.create_default_context(cadata=material["tls"]["ca"])
        else:
            options["ssl_disabled"] = True
        connection = pymysql.connect(**options)
        try:
            with connection.cursor() as cursor:
                if action == "apply":
                    cursor.execute("SELECT GET_LOCK('afxenDatabaseMaintenance',0)")
                    if cursor.fetchone()[0] != 1:
                        raise ValueError("another maintenance operation is active")
                current = observe(cursor)
                report = {"changes": current["changes"]}
                if operation == "diagnose" or operation == "table_check" or operation == "tableCheck":
                    if action != "check":
                        raise ValueError("read-only operation")
                    result = {"database_identity": current["identity"], "observed_state": {"shape": current["shape"], "grants": current["grants"]},
                              "status": "passed" if current["state"] == "current" else "drift", "report": report}
                    if operation == "diagnose":
                        result["diagnosis"] = {"state": current["state"], "current_version": str(current["version"]) if current["version"] is not None else None, "target_version": "1"}
                        if not report["changes"] and current["state"] != "current":
                            result["report"] = {"changes": [{"kind": "data", "object": "schemaMigrations", "reason": "definition", "action": "check"}]}
                    sys.stdout.write(canonical(result) + "\n")
                    return 0 if operation == "diagnose" or current["state"] == "current" else 1
                if operation not in ("initialize", "update", "backup", "revokesessions"):
                    raise ValueError("unrecognized operation")
                if operation == "initialize" and current["state"] not in ("empty", "current"):
                    raise ValueError("initialization requires empty or current schema")
                if operation in ("update", "backup", "revokesessions") and current["state"] != "current":
                    raise ValueError("operation requires the exact current schema")
                changes = []
                saved = None
                if operation == "initialize" and current["state"] == "empty":
                    changes = [{"kind": "table", "object": table, "reason": "missing", "action": "create"} for table in tables]
                if operation == "backup":
                    existing = [name for name in [backupNames[name] for name in backupTables] if name in current["present"]]
                    if existing:
                        saved = backupState(cursor)
                    else:
                        changes = [{"kind": "table", "object": backupNames[table], "reason": "missing", "action": "create"} for table in backupTables]
                    changes += [{"kind": "data", "object": table, "reason": "definition", "action": "check"} for table in backupTables]
                if operation == "revokesessions":
                    cursor.execute("SELECT COUNT(*) FROM sessions")
                    if cursor.fetchone()[0]:
                        changes = [{"kind": "data", "object": "sessions", "reason": "pending", "action": "delete"}]
                if action == "preflight":
                    sys.stdout.write(canonical({"database_identity": current["identity"], "observed_state": {"shape": current["shape"], "version": current["version"], "grants": current["grants"], "saved": saved}, "report": {"changes": changes}}) + "\n")
                    return 0
                if action == "apply":
                    if operation == "initialize" and current["state"] == "empty":
                        createTables(cursor)
                        actual = shape(cursor)
                        if differences(actual):
                            raise ValueError("created structure differs from contract")
                        cursor.execute("INSERT INTO schemaMigrations (version,digest,shape,appliedAt) VALUES (%s,%s,%s,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)", (1,targetDigest,canonical(actual)))
                    if operation == "backup" and saved is None:
                        createBackup(cursor)
                    if operation == "revokesessions":
                        cursor.execute("DELETE FROM sessions")
                    connection.commit()
                    result = {"status": "applied"}
                elif action == "verify" or action == "readback":
                    fresh = observe(cursor)
                    if fresh["state"] != "current":
                        raise ValueError("current schema verification failed")
                    if operation == "backup":
                        saved = backupState(cursor)
                    if operation == "revokesessions":
                        cursor.execute("SELECT COUNT(*) FROM sessions")
                        if cursor.fetchone()[0]:
                            raise ValueError("sessions were not revoked")
                    result = {"status": "passed", "matches": True} if action == "verify" else {"status": "passed", "state": {"version": 1, "structure": fresh["shape"], "saved": saved}}
                else:
                    raise ValueError("unsupported action")
                sys.stdout.write(canonical(result) + "\n")
                return 0
        finally:
            connection.rollback()
            connection.close()
    except ValueError:
        print("database operation refused: inspect the same-version diagnosis and runbook", file=sys.stderr)
        return 2
    except Exception:
        print("database operation failed; database state is not assumed complete", file=sys.stderr)
        return 2


raise SystemExit(main())
