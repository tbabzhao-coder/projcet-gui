#!/bin/bash
set -e

# APA 录制启动脚本 - 使用 Playwright Chromium
# 用法: ./start-recording.sh <TARGET_URL>
# 环境变量（可选，脚本会自动探测内置路径）:
#   PLAYWRIGHT_CLI_PATH - playwright CLI 路径
#   PLAYWRIGHT_BROWSERS_PATH - 浏览器目录路径
#   NODE_PATH - node 可执行文件路径

if [ -z "$1" ]; then
  echo "错误: 缺少目标 URL"
  echo "用法: $0 <TARGET_URL>"
  exit 1
fi

TARGET_URL="$1"

# ============================================
# 自动探测内置运行时
# ============================================
# 脚本位于 resources/skills/apa-builder/scripts/
# 内置资源在 resources/ 下（extraResources 目标目录）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# 从 scripts/ -> apa-builder/ -> skills/ -> resources/
RESOURCES_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# 探测内置 Node.js
if [ -z "$NODE_BIN" ]; then
  if [ "$(uname)" = "Darwin" ]; then
    # macOS: node-arm64/bin/node 或 node-x64/bin/node
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
      CANDIDATE="$RESOURCES_DIR/node-arm64/bin/node"
    else
      CANDIDATE="$RESOURCES_DIR/node-x64/bin/node"
    fi
    [ -f "$CANDIDATE" ] && NODE_BIN="$CANDIDATE"
  else
    # Windows (Git Bash): node-win-x64/node.exe
    CANDIDATE="$RESOURCES_DIR/node-win-x64/node.exe"
    [ -f "$CANDIDATE" ] && NODE_BIN="$CANDIDATE"
  fi
fi
NODE_BIN="${NODE_BIN:-node}"

# 探测内置 Playwright CLI（如果环境变量未设置）
if [ -z "$PLAYWRIGHT_CLI_PATH" ] || [ ! -f "$PLAYWRIGHT_CLI_PATH" ]; then
  # 候选路径（按优先级）
  CANDIDATES=(
    "$RESOURCES_DIR/mcp-servers/@playwright/mcp/node_modules/playwright/cli.js"
    "$RESOURCES_DIR/mcp-servers/playwright/cli.js"
    "$RESOURCES_DIR/mcp-servers/playwright-core/cli.js"
  )
  for C in "${CANDIDATES[@]}"; do
    if [ -f "$C" ]; then
      PLAYWRIGHT_CLI_PATH="$C"
      echo "探测到内置 Playwright CLI: $PLAYWRIGHT_CLI_PATH"
      break
    fi
  done
fi

# 探测内置 Playwright 浏览器目录
if [ -z "$PLAYWRIGHT_BROWSERS_PATH" ]; then
  CANDIDATE="$RESOURCES_DIR/playwright-browsers"
  if [ -d "$CANDIDATE" ]; then
    export PLAYWRIGHT_BROWSERS_PATH="$CANDIDATE"
    echo "探测到内置浏览器目录: $PLAYWRIGHT_BROWSERS_PATH"
  fi
fi

# ============================================
# 录制准备
# ============================================

# 从 URL 提取 hostname，用于 session 隔离
HOSTNAME=$(python3 -c "from urllib.parse import urlparse; print(urlparse('$TARGET_URL').hostname)")
SESSION_DIR="$HOME/.project4/apa-sessions/$HOSTNAME"
mkdir -p "$SESSION_DIR"

# 创建临时目录存放录制产物
RECORDING_DIR="$HOME/.project4/apa-recordings/recording-$(date +%s)"
mkdir -p "$RECORDING_DIR"
echo "录制产物将保存到: $RECORDING_DIR"

# 检查是否有已保存的登录态
STORAGE_FILE="$SESSION_DIR/storage.json"
LOAD_STORAGE_ARG=""
if [ -f "$STORAGE_FILE" ]; then
  LOAD_STORAGE_ARG="--load-storage $STORAGE_FILE"
fi

# ============================================
# 启动录制
# ============================================

if [ -n "$PLAYWRIGHT_CLI_PATH" ] && [ -f "$PLAYWRIGHT_CLI_PATH" ]; then
  echo "使用 Playwright CLI: $PLAYWRIGHT_CLI_PATH"
  echo "使用 Node: $NODE_BIN"
  "$NODE_BIN" "$PLAYWRIGHT_CLI_PATH" codegen \
    --output "$RECORDING_DIR/recording.js" \
    --save-har "$RECORDING_DIR/recording.har" \
    --save-storage "$RECORDING_DIR/storage.json" \
    $LOAD_STORAGE_ARG \
    --viewport-size 1280,720 \
    "$TARGET_URL"
else
  echo "警告: 未找到项目内 playwright，回退到 npx（可能版本不匹配）"
  npx playwright codegen \
    --output "$RECORDING_DIR/recording.js" \
    --save-har "$RECORDING_DIR/recording.har" \
    --save-storage "$RECORDING_DIR/storage.json" \
    $LOAD_STORAGE_ARG \
    --viewport-size 1280,720 \
    "$TARGET_URL"
fi

# 录制完成后，保存登录态到 session 目录
if [ -f "$RECORDING_DIR/storage.json" ]; then
  cp "$RECORDING_DIR/storage.json" "$SESSION_DIR/storage.json"
fi

echo "录制完成！产物目录: $RECORDING_DIR"
