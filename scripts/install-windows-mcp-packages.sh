#!/bin/bash
# 在 macOS 上为 Windows Python 手动安装 MCP 包
# 这个脚本会下载 wheel 文件并解压到 Windows Python 的 site-packages

PYTHON_DIR="/Users/zhaoyang/Desktop/dev/project4/hello-project4-main/resources/python"
SITE_PACKAGES="$PYTHON_DIR/Lib/site-packages"

echo "=== Installing Office MCP packages for Windows Python ==="
echo ""

# 创建临时目录
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# 下载并安装包
packages=(
  "office-powerpoint-mcp-server"
  "office-word-mcp-server"
  "excel-mcp-server"
)

for pkg in "${packages[@]}"; do
  echo "📦 Downloading $pkg..."
  pip3 download --only-binary=:all: --platform win_amd64 --python-version 312 "$pkg" 2>/dev/null || \
  pip3 download --no-deps "$pkg"
  
  echo "   Extracting $pkg..."
  for wheel in *.whl; do
    if [ -f "$wheel" ]; then
      unzip -q "$wheel" -d "$SITE_PACKAGES"
      rm "$wheel"
    fi
  done
  
  echo "   ✅ $pkg installed"
done

# 清理
cd -
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Done! Office MCP packages installed for Windows Python"
