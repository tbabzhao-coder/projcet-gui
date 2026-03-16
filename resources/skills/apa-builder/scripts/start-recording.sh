#!/bin/bash
set -e

# APA 录制启动脚本 - 使用 Playwright Chromium
# 用法: ./start-recording.sh <TARGET_URL>
# 环境变量:
#   PLAYWRIGHT_CLI_PATH - playwright CLI 路径（打包环境由调用方设置）
#   PLAYWRIGHT_BROWSERS_PATH - 浏览器目录路径（打包环境由调用方设置）
#   NODE_PATH - node 可执行文件路径（打包环境由调用方设置）

if [ -z "$1" ]; then
  echo "错误: 缺少目标 URL"
  echo "用法: $0 <TARGET_URL>"
  exit 1
fi

TARGET_URL="$1"

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

# 确定 playwright 执行方式
# 优先使用环境变量指定的路径（打包环境），否则回退到 npx（开发环境）
if [ -n "$PLAYWRIGHT_CLI_PATH" ] && [ -f "$PLAYWRIGHT_CLI_PATH" ]; then
  NODE_BIN="${NODE_PATH:-node}"
  echo "使用打包的 Playwright CLI: $PLAYWRIGHT_CLI_PATH"
  "$NODE_BIN" "$PLAYWRIGHT_CLI_PATH" codegen \
    --output "$RECORDING_DIR/recording.js" \
    --save-har "$RECORDING_DIR/recording.har" \
    --save-storage "$RECORDING_DIR/storage.json" \
    $LOAD_STORAGE_ARG \
    --viewport-size 1280,720 \
    "$TARGET_URL"
else
  echo "使用 npx playwright（开发模式）"
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
