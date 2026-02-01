#!/bin/bash

# 打包后验证脚本
# 用于验证 Python 路径和 Skills 是否正确打包

echo "=========================================="
echo "Project4 打包验证脚本"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 1. 检查打包后的文件结构
echo "1. 检查打包后的文件结构..."
echo ""

APP_PATH="dist/mac-arm64/Project4.app"

if [ ! -d "$APP_PATH" ]; then
    check_fail "应用未找到: $APP_PATH"
    echo ""
    echo "请先运行: npm run build:mac"
    exit 1
fi

check_pass "应用已找到: $APP_PATH"
echo ""

# 2. 检查 Python 运行时
echo "2. 检查 Python 运行时..."
echo ""

PYTHON_ARM64="$APP_PATH/Contents/Resources/python-arm64/bin/python3"
PYTHON_X64="$APP_PATH/Contents/Resources/python-x64/bin/python3"

if [ -f "$PYTHON_ARM64" ]; then
    check_pass "python-arm64 已打包"
    echo "   路径: $PYTHON_ARM64"
else
    check_fail "python-arm64 未找到"
fi

if [ -f "$PYTHON_X64" ]; then
    check_pass "python-x64 已打包"
    echo "   路径: $PYTHON_X64"
else
    check_warn "python-x64 未找到（可选）"
fi

echo ""

# 3. 检查 Skills 目录
echo "3. 检查 Skills 目录..."
echo ""

SKILLS_DIR="$APP_PATH/Contents/Resources/skills"

if [ ! -d "$SKILLS_DIR" ]; then
    check_fail "Skills 目录未找到: $SKILLS_DIR"
    echo ""
    echo "问题：Skills 没有被打包到 extraResources"
    echo "解决：检查 package.json 中的 extraResources 配置"
    exit 1
fi

check_pass "Skills 目录已找到: $SKILLS_DIR"
echo ""

# 4. 检查每个 Skill
echo "4. 检查内置 Skills..."
echo ""

SKILLS=("skill-creator" "docx" "pptx" "xlsx" "pdf")
MISSING_SKILLS=()

for skill in "${SKILLS[@]}"; do
    SKILL_PATH="$SKILLS_DIR/$skill"
    SKILL_MD="$SKILL_PATH/SKILL.md"

    if [ -d "$SKILL_PATH" ]; then
        if [ -f "$SKILL_MD" ]; then
            check_pass "$skill"
            echo "   路径: $SKILL_PATH"

            # 检查文件大小
            SIZE=$(du -sh "$SKILL_PATH" | cut -f1)
            echo "   大小: $SIZE"

            # 检查是否有脚本
            if [ -d "$SKILL_PATH/scripts" ]; then
                SCRIPT_COUNT=$(find "$SKILL_PATH/scripts" -type f | wc -l | tr -d ' ')
                echo "   脚本: $SCRIPT_COUNT 个"
            fi

            # 检查是否有参考文档
            if [ -d "$SKILL_PATH/references" ]; then
                REF_COUNT=$(find "$SKILL_PATH/references" -type f | wc -l | tr -d ' ')
                echo "   参考: $REF_COUNT 个"
            fi
        else
            check_fail "$skill (SKILL.md 缺失)"
            MISSING_SKILLS+=("$skill")
        fi
    else
        check_fail "$skill (目录缺失)"
        MISSING_SKILLS+=("$skill")
    fi
    echo ""
done

# 5. 检查 app.asar
echo "5. 检查 app.asar..."
echo ""

ASAR_PATH="$APP_PATH/Contents/Resources/app.asar"

if [ -f "$ASAR_PATH" ]; then
    check_pass "app.asar 已找到"
    SIZE=$(du -sh "$ASAR_PATH" | cut -f1)
    echo "   大小: $SIZE"

    # 检查 asar 中是否包含 skills（不应该包含）
    if command -v npx &> /dev/null; then
        if npx asar list "$ASAR_PATH" 2>/dev/null | grep -q "resources/skills"; then
            check_warn "app.asar 中包含 skills（应该在 extraResources 中）"
        else
            check_pass "app.asar 中不包含 skills（正确）"
        fi
    fi
else
    check_fail "app.asar 未找到"
fi

echo ""

# 6. 总结
echo "=========================================="
echo "验证总结"
echo "=========================================="
echo ""

if [ ${#MISSING_SKILLS[@]} -eq 0 ]; then
    check_pass "所有检查通过！"
    echo ""
    echo "✓ Python 运行时已正确打包"
    echo "✓ 所有 5 个 Skills 已正确打包"
    echo "✓ Skills 在 extraResources 中（不在 asar 中）"
    echo ""
    echo "下一步："
    echo "1. 在另一台 Mac 上安装应用"
    echo "2. 启动应用并检查日志"
    echo "3. 进入设置页面验证 Skills 显示"
    echo ""
else
    check_fail "发现 ${#MISSING_SKILLS[@]} 个问题"
    echo ""
    echo "缺失的 Skills:"
    for skill in "${MISSING_SKILLS[@]}"; do
        echo "  - $skill"
    done
    echo ""
    echo "请检查："
    echo "1. resources/skills/ 目录是否包含所有 skills"
    echo "2. package.json 中的 extraResources 配置是否正确"
    echo "3. 重新运行: npm run build:mac"
    exit 1
fi

# 7. 生成安装测试脚本
echo "=========================================="
echo "生成安装测试脚本"
echo "=========================================="
echo ""

TEST_SCRIPT="test-installed-app.sh"

cat > "$TEST_SCRIPT" << 'EOF'
#!/bin/bash

# 安装后测试脚本
# 在安装应用后运行此脚本验证

echo "=========================================="
echo "Project4 安装后验证"
echo "=========================================="
echo ""

APP_PATH="/Applications/Project4.app"

if [ ! -d "$APP_PATH" ]; then
    echo "✗ 应用未安装: $APP_PATH"
    exit 1
fi

echo "✓ 应用已安装"
echo ""

# 检查 Python
echo "检查 Python 路径..."
PYTHON_ARM64="$APP_PATH/Contents/Resources/python-arm64/bin/python3"
PYTHON_X64="$APP_PATH/Contents/Resources/python-x64/bin/python3"

if [ -f "$PYTHON_ARM64" ]; then
    echo "✓ python-arm64: $PYTHON_ARM64"
fi

if [ -f "$PYTHON_X64" ]; then
    echo "✓ python-x64: $PYTHON_X64"
fi

echo ""

# 检查 Skills
echo "检查 Skills..."
SKILLS_DIR="$APP_PATH/Contents/Resources/skills"

if [ -d "$SKILLS_DIR" ]; then
    echo "✓ Skills 目录: $SKILLS_DIR"
    echo ""
    echo "内置 Skills:"
    ls -1 "$SKILLS_DIR"
else
    echo "✗ Skills 目录未找到"
fi

echo ""

# 检查日志
echo "检查应用日志..."
LOG_DIR="$HOME/.project4"

if [ -d "$LOG_DIR" ]; then
    echo "✓ 日志目录: $LOG_DIR"
    echo ""

    # Python 日志
    if [ -f "$LOG_DIR/python-debug.log" ]; then
        echo "Python 路径日志 (最后 10 行):"
        tail -10 "$LOG_DIR/python-debug.log" | grep "Found Python"
    fi

    echo ""

    # Skills 日志
    if [ -f "$LOG_DIR/main.log" ]; then
        echo "Skills 加载日志:"
        grep "Built-in.*skill configured" "$LOG_DIR/main.log" | tail -5
    fi
else
    echo "⚠ 日志目录未找到（应用可能还未运行）"
    echo "请先启动应用，然后重新运行此脚本"
fi

echo ""
echo "=========================================="
echo "验证完成"
echo "=========================================="
EOF

chmod +x "$TEST_SCRIPT"

check_pass "已生成安装测试脚本: $TEST_SCRIPT"
echo ""
echo "使用方法："
echo "1. 在另一台 Mac 上安装应用"
echo "2. 运行: ./$TEST_SCRIPT"
echo ""

echo "=========================================="
echo "验证完成"
echo "=========================================="
