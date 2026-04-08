#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}"

cd "${REPO_ROOT}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误: 未找到 pnpm，请先安装 pnpm。" >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
PACKAGE_VERSION="$(node -p "require('./package.json').version")"

COMMIT_MESSAGE="${1:-release: v${PACKAGE_VERSION}}"

if [[ $# -gt 0 ]]; then
  shift
fi

PUBLISH_ARGS=("$@")

echo "==> 当前分支: ${CURRENT_BRANCH}"
echo "==> 执行 pnpm build:lib"
pnpm build:lib

echo "==> 提交发布变更"
git add -A

if git diff --cached --quiet; then
  echo "==> 没有可提交的变更，跳过 git commit"
else
  git commit -m "${COMMIT_MESSAGE}"
fi

if [[ ${#PUBLISH_ARGS[@]} -gt 0 ]]; then
  echo "==> 执行 pnpm publish ${PUBLISH_ARGS[*]}"
  pnpm publish "${PUBLISH_ARGS[@]}"
else
  echo "==> 执行 pnpm publish"
  pnpm publish
fi

echo "==> 推送到 origin/${CURRENT_BRANCH}"
git push origin "${CURRENT_BRANCH}"

echo "==> 完成"
