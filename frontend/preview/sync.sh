#!/usr/bin/env bash
# 将当前 checkout 安全 fast-forward 到 start.py 注入的 exact origin branch。
#
# 本脚本由 start.py 以宿主子进程运行，git 授权复用运行环境已有的凭证助手或
# netrc，脚本不读取任何本机配置文件或凭证。只允许 fetch 与 `merge --ff-only`。
# dirty、detached、分叉、本地 ahead、identity 不一致、Git 操作中或任何不明确状态
# 都会写 blocked 状态并以非零退出；不丢弃工作区字节，不重写历史，也不打印凭证。

set -euo pipefail
umask 077

TAB=$'\t'
CR=$'\r'
HIDDEN_VALUE='<已隐藏：取值含空白、控制字符或非 ASCII 字符，无法安全定位凭证>'

if [ -n "${PREVIEW_WORKSPACE:-}" ]; then
  REPO_ROOT=${PREVIEW_WORKSPACE}
elif REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then
  :
else
  printf 'sync: 无法解析 repo 根目录\n' >&2
  exit 2
fi

# 仓库地址、分支与间隔只接受 start.py 注入的运行时值。
REPOSITORY=${PREVIEW_REPOSITORY:-}
BRANCH=${PREVIEW_BRANCH:-}
INTERVAL=${PREVIEW_SYNC_INTERVAL_SECONDS:-30}
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
# A project copy follows its own location, independently of provider paths.
case "$SCRIPT_DIR" in
  "$REPO_ROOT"/*) PREVIEW_ROOT=${SCRIPT_DIR#"$REPO_ROOT"/} ;;
  *)
    # Direct package invocation retains the two established default locations.
    case "${PREVIEW_SYNC_STATUS_FILE:-}" in
      "$REPO_ROOT/frontend/preview/runtime/sync.json") PREVIEW_ROOT=frontend/preview ;;
      *) PREVIEW_ROOT=experience/preview ;;
    esac ;;
esac
EXPECTED_STATUS_FILE=${REPO_ROOT}/${PREVIEW_ROOT}/runtime/sync.json
STATUS_FILE=${PREVIEW_SYNC_STATUS_FILE:-${EXPECTED_STATUS_FILE}}
HEARTBEAT=${PREVIEW_SYNC_HEARTBEAT:-/tmp/preview-sync-ready}
# start.py 的进程号；父进程消失时循环退出，避免残留后台 sync。
PARENT_PID=${PREVIEW_PARENT_PID:-}
ONCE=0

export GIT_TERMINAL_PROMPT=0

for argument in "$@"; do
  case "${argument}" in
    --once) ONCE=1 ;;
    *)
      printf 'sync: unknown argument: %s\n' "${argument}" >&2
      exit 2
      ;;
  esac
done

if [ "${STATUS_FILE}" != "${EXPECTED_STATUS_FILE}" ]; then
  printf 'sync: status file 必须是 %s\n' "$EXPECTED_STATUS_FILE" >&2
  exit 2
fi

case "${PARENT_PID}" in
  ''|*[!0-9]*)
    if [ -n "${PARENT_PID}" ]; then
      printf 'sync: PREVIEW_PARENT_PID 必须是进程号\n' >&2
      exit 2
    fi
    ;;
esac

parent_alive() {
  [ -z "${PARENT_PID}" ] || kill -0 "${PARENT_PID}" 2>/dev/null
}

running=1
stop() { running=0; }
trap stop TERM INT HUP

redact() {
  local value=$1 prefix='' rest head authority remainder
  value=$(printf '%s' "${value}" | LC_ALL=C sed -e 's/^[ '"${TAB}${CR}"']*//' -e 's/[ '"${TAB}${CR}"']*$//')
  if printf '%s' "${value}" | LC_ALL=C grep -q '[^!-~]'; then
    printf '%s' "${HIDDEN_VALUE}"
    return 0
  fi
  rest=${value}
  head=${rest%%:*}
  case "${rest}" in
    *:*)
      case "${head}" in
        *[@/]*) ;;
        *) prefix="${head}:"; rest=${rest#*:} ;;
      esac
      ;;
  esac
  while [ "${rest}" != "${rest#/}" ]; do
    prefix="${prefix}/"
    rest=${rest#/}
  done
  authority=${rest%%[/?#]*}
  remainder=${rest#"${authority}"}
  case "${authority}" in
    *@*) printf '%s***@%s%s' "${prefix}" "${authority##*@}" "${remainder}" ;;
    *) printf '%s' "${value}" ;;
  esac
}

prepare_status_path() {
  local directory=${STATUS_FILE%/*}
  if [ -L "${directory}" ] || [ -L "${STATUS_FILE}" ]; then
    printf 'sync: runtime status 路径不能是符号链接\n' >&2
    exit 2
  fi
  mkdir -p "${directory}"
  if [ -L "${directory}" ] || [ ! -d "${directory}" ]; then
    printf 'sync: runtime status parent 不是普通目录\n' >&2
    exit 2
  fi
}

report() {
  local status=$1 reason=$2 before=$3 after=$4 line remote directory temporary
  remote=$(redact "${REPOSITORY}")
  line=$(printf '{"status":"%s","reason":"%s","remote":"%s","branch":"%s","before":"%s","after":"%s"}' \
    "${status}" "${reason}" "${remote}" "${BRANCH}" "${before}" "${after}")
  prepare_status_path
  directory=${STATUS_FILE%/*}
  temporary=$(mktemp "${directory}/.sync.XXXXXX") || {
    printf 'sync: 无法建立runtime临时状态\n' >&2
    exit 2
  }
  if ! printf '%s\n' "${line}" >"${temporary}" || ! mv -f -- "${temporary}" "${STATUS_FILE}"; then
    rm -f -- "${temporary}"
    printf 'sync: 无法原子写入runtime状态\n' >&2
    exit 2
  fi
  printf '%s\n' "${line}"
  : >"${HEARTBEAT}" 2>/dev/null || true
}

head_sha() {
  git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || printf 'unknown'
}

git_operation_in_progress() {
  local git_dir marker
  git_dir=$(git -C "${REPO_ROOT}" rev-parse --git-dir 2>/dev/null) || return 1
  case "${git_dir}" in
    /*) ;;
    *) git_dir=${REPO_ROOT}/${git_dir} ;;
  esac
  for marker in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG rebase-merge rebase-apply sequencer; do
    if [ -e "${git_dir}/${marker}" ]; then
      return 0
    fi
  done
  return 1
}

blocked() {
  local reason=$1 before=$2
  report blocked "${reason}" "${before}" "${before}"
  return 2
}

# session workspace 可以是 main 或 linked worktree：REPO_ROOT 的 physical path 必须恰好
# 对应 `git worktree list --porcelain -z` 中一个非 bare 登记（与 start.py 同一口径）。
registered_worktree() {
  local field path='' bare=0 matches=0 physical
  while IFS= read -r -d '' field; do
    case "${field}" in
      'worktree '*)
        path=${field#'worktree '}
        bare=0
        ;;
      bare)
        bare=1
        ;;
      '')
        if [ -n "${path}" ] && [ "${bare}" -eq 0 ]; then
          physical=$(cd "${path}" 2>/dev/null && pwd -P) || physical=''
          if [ -n "${physical}" ] && [ "${physical}" = "${REPO_ROOT}" ]; then
            matches=$((matches + 1))
          fi
        fi
        path=''
        bare=0
        ;;
    esac
  done < <(git -C "${REPO_ROOT}" worktree list --porcelain -z 2>/dev/null)
  [ "${matches}" -eq 1 ]
}

sync_once() {
  local before after toplevel origin current remote_status after_fetch
  before=$(head_sha)

  if [ -z "${REPOSITORY}" ]; then
    report disabled no-repository-configured "${before}" "${before}"
    return 0
  fi

  toplevel=$(git -C "${REPO_ROOT}" rev-parse --show-toplevel 2>/dev/null || printf '')
  if [ -z "${toplevel}" ]; then
    if [ -e "${REPO_ROOT}/.git" ]; then
      blocked repository-unreadable "${before}"
    else
      blocked not-repository-root "${before}"
    fi
    return $?
  fi
  if [ "${toplevel}" != "${REPO_ROOT}" ]; then
    blocked not-repository-root "${before}"
    return $?
  fi
  if ! registered_worktree; then
    blocked not-registered-worktree "${before}"
    return $?
  fi

  origin=$(git -C "${REPO_ROOT}" ls-remote --get-url origin 2>/dev/null || printf '')
  if [ -z "${origin}" ] || [ "${origin}" = origin ]; then
    origin=$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null || printf '')
  fi
  if [ "${origin}" != "${REPOSITORY}" ]; then
    blocked repository-mismatch "${before}"
    return $?
  fi
  if git_operation_in_progress; then
    blocked git-operation-in-progress "${before}"
    return $?
  fi
  if [ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]; then
    blocked dirty-worktree "${before}"
    return $?
  fi
  current=$(git -C "${REPO_ROOT}" symbolic-ref --quiet --short HEAD 2>/dev/null || printf '')
  if [ -z "${current}" ]; then
    blocked detached-head "${before}"
    return $?
  fi
  if [ "${current}" != "${BRANCH}" ]; then
    blocked branch-mismatch "${before}"
    return $?
  fi

  remote_status=0
  git -C "${REPO_ROOT}" ls-remote --exit-code --heads origin "${BRANCH}" >/dev/null 2>&1 \
    || remote_status=$?
  if [ "${remote_status}" -ne 0 ]; then
    if [ "${remote_status}" -eq 2 ]; then
      blocked remote-branch-missing "${before}"
    else
      blocked remote-unreachable "${before}"
    fi
    return $?
  fi
  if ! git -C "${REPO_ROOT}" fetch --no-tags origin \
    "refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}" >/dev/null 2>&1; then
    blocked fetch-rejected "${before}"
    return $?
  fi

  after_fetch=$(head_sha)
  current=$(git -C "${REPO_ROOT}" symbolic-ref --quiet --short HEAD 2>/dev/null || printf '')
  if [ "${after_fetch}" != "${before}" ] || [ "${current}" != "${BRANCH}" ]; then
    blocked checkout-changed-during-fetch "${before}"
    return $?
  fi
  if git_operation_in_progress || [ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]; then
    blocked worktree-changed-during-fetch "${before}"
    return $?
  fi

  if git -C "${REPO_ROOT}" merge-base --is-ancestor "origin/${BRANCH}" HEAD; then
    if [ "$(git -C "${REPO_ROOT}" rev-parse HEAD)" = "$(git -C "${REPO_ROOT}" rev-parse "origin/${BRANCH}")" ]; then
      report current already-up-to-date "${before}" "${before}"
      return 0
    fi
    blocked local-ahead "${before}"
    return $?
  fi
  if ! git -C "${REPO_ROOT}" merge-base --is-ancestor HEAD "origin/${BRANCH}"; then
    blocked diverged "${before}"
    return $?
  fi
  if ! git -C "${REPO_ROOT}" merge --ff-only "origin/${BRANCH}" >/dev/null 2>&1; then
    blocked fast-forward-failed "${before}"
    return $?
  fi
  after=$(head_sha)
  report synced fast-forwarded "${before}" "${after}"
}

if printf '%s' "${REPOSITORY}" | LC_ALL=C grep -q '[^!-~]' \
  || printf '%s' "${REPOSITORY}" | grep -q '["\\]'; then
  printf 'sync: PREVIEW_REPOSITORY 含无法安全记录的字符\n' >&2
  exit 2
fi

if [ -n "${REPOSITORY}" ]; then
  case "${BRANCH}" in
    ''|[!A-Za-z0-9._]*|*[!A-Za-z0-9._/-]*)
      printf 'sync: 启用 PREVIEW_REPOSITORY 时 start.py 必须注入合法的当前分支 PREVIEW_BRANCH\n' >&2
      exit 2
      ;;
  esac
  if [ "${#BRANCH}" -gt 255 ]; then
    printf 'sync: PREVIEW_BRANCH 过长\n' >&2
    exit 2
  fi
fi

case "${INTERVAL}" in
  ''|*[!0-9]*)
    printf 'sync: PREVIEW_SYNC_INTERVAL_SECONDS 必须是整数\n' >&2
    exit 2
    ;;
esac
if [ "${INTERVAL}" -lt 1 ] || [ "${INTERVAL}" -gt 3600 ]; then
  printf 'sync: PREVIEW_SYNC_INTERVAL_SECONDS 必须位于 1..3600\n' >&2
  exit 2
fi

sync_once
if [ "${ONCE}" -eq 1 ]; then
  exit 0
fi

while [ "${running}" -eq 1 ]; do
  remaining=${INTERVAL}
  while [ "${remaining}" -gt 0 ] && [ "${running}" -eq 1 ]; do
    sleep 1
    remaining=$((remaining - 1))
    if ! parent_alive; then
      running=0
    fi
  done
  if [ "${running}" -eq 1 ]; then
    sync_once
  fi
done
