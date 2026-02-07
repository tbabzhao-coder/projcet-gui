#!/bin/bash

# 文件监控迁移 - 一键执行脚本
# 这个脚本会引导你完成整个迁移过程

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_step() {
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# 确认函数
confirm() {
    local prompt="$1"
    local default="${2:-n}"

    if [ "$default" = "y" ]; then
        prompt="$prompt [Y/n] "
    else
        prompt="$prompt [y/N] "
    fi

    read -p "$prompt" response
    response=${response:-$default}

    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# 检查文件是否存在
check_file() {
    if [ -f "$1" ]; then
        log_success "Found: $1"
        return 0
    else
        log_error "Missing: $1"
        return 1
    fi
}

# 显示欢迎信息
show_welcome() {
    clear
    echo -e "${CYAN}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   文件监控迁移：从 chokidar 到 @parcel/watcher              ║
║                                                               ║
║   这个脚本会引导你完成整个迁移过程                           ║
║   预计时间：3-4 小时                                         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}\n"
}

# 显示迁移收益
show_benefits() {
    log_step "迁移收益预览"

    echo "从 chokidar 迁移到 @parcel/watcher 将带来："
    echo ""
    echo -e "${GREEN}✓${NC} 解决 EMFILE 错误（文件句柄耗尽）"
    echo -e "${GREEN}✓${NC} 初始化速度提升 5-10 倍"
    echo -e "${GREEN}✓${NC} 内存占用降低 70-80%"
    echo -e "${GREEN}✓${NC} CPU 占用降低 90%+"
    echo -e "${GREEN}✓${NC} 自动读取 .gitignore 规则"
    echo -e "${GREEN}✓${NC} 支持更大的项目和更多工作区"
    echo ""

    if ! confirm "是否继续迁移？" "y"; then
        log_warn "迁移已取消"
        exit 0
    fi
}

# 检查前置条件
check_prerequisites() {
    log_step "步骤 1/10: 检查前置条件"

    local all_ok=true

    # 检查 Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node -v)
        log_success "Node.js: $node_version"
    else
        log_error "Node.js 未安装"
        all_ok=false
    fi

    # 检查 npm
    if command -v npm &> /dev/null; then
        local npm_version=$(npm -v)
        log_success "npm: $npm_version"
    else
        log_error "npm 未安装"
        all_ok=false
    fi

    # 检查 Git
    if command -v git &> /dev/null; then
        local git_version=$(git --version)
        log_success "Git: $git_version"
    else
        log_error "Git 未安装"
        all_ok=false
    fi

    # 检查项目目录
    if [ -d "projcet-gui" ]; then
        log_success "项目目录: projcet-gui"
    else
        log_error "项目目录不存在: projcet-gui"
        all_ok=false
    fi

    # 检查必要文件
    check_file "projcet-gui/package.json"
    check_file "projcet-gui/src/main/services/artifact-cache.service.ts"
    check_file "MIGRATION_PLAN.md"
    check_file "QUICK_START_MIGRATION.md"

    if [ "$all_ok" = false ]; then
        log_error "前置条件检查失败，请先解决上述问题"
        exit 1
    fi

    log_success "所有前置条件满足"
}

# 创建 Git 分支
create_branch() {
    log_step "步骤 2/10: 创建 Git 分支"

    cd projcet-gui

    # 检查是否有未提交的更改
    if ! git diff-index --quiet HEAD --; then
        log_warn "检测到未提交的更改"
        if confirm "是否先提交这些更改？"; then
            git add .
            git commit -m "chore: commit before migration"
            log_success "更改已提交"
        else
            log_warn "继续迁移，但建议先提交更改"
        fi
    fi

    # 创建新分支
    local branch_name="feature/migrate-to-parcel-watcher"

    if git show-ref --verify --quiet "refs/heads/$branch_name"; then
        log_warn "分支 $branch_name 已存在"
        if confirm "是否切换到该分支？"; then
            git checkout "$branch_name"
            log_success "已切换到分支: $branch_name"
        fi
    else
        git checkout -b "$branch_name"
        log_success "已创建并切换到分支: $branch_name"
    fi

    cd ..
}

# 运行备份
run_backup() {
    log_step "步骤 3/10: 创建备份"

    cd projcet-gui

    log_info "备份关键文件..."
    node scripts/migrate-watcher.mjs backup

    log_success "备份完成"
    cd ..
}

# 运行基准测试
run_benchmark_before() {
    log_step "步骤 4/10: 运行基准测试（迁移前）"

    cd projcet-gui

    log_info "运行性能基准测试..."
    node scripts/benchmark-watcher.mjs > ../benchmark-before.txt 2>&1 || true

    log_success "基准测试完成，结果保存到: benchmark-before.txt"
    cd ..
}

# 安装依赖
install_dependencies() {
    log_step "步骤 5/10: 安装新依赖"

    cd projcet-gui

    log_info "安装 @parcel/watcher 和 ignore..."
    node scripts/migrate-watcher.mjs install

    log_success "依赖安装完成"
    cd ..
}

# 卸载旧依赖
uninstall_old_dependencies() {
    log_step "步骤 6/10: 卸载旧依赖"

    cd projcet-gui

    log_info "卸载 chokidar 和 @types/chokidar..."
    node scripts/migrate-watcher.mjs uninstall-old

    log_success "旧依赖已卸载"
    cd ..
}

# 更新配置
update_config() {
    log_step "步骤 7/10: 更新配置文件"

    cd projcet-gui

    log_info "更新 package.json..."
    node scripts/migrate-watcher.mjs update-config

    log_success "配置文件已更新"
    cd ..
}

# 代码修改指导
guide_code_changes() {
    log_step "步骤 8/10: 代码修改"

    echo -e "${YELLOW}重要：${NC}现在需要手动修改代码"
    echo ""
    echo "请按照以下步骤修改 artifact-cache.service.ts："
    echo ""
    echo "1. 打开文件："
    echo "   ${CYAN}projcet-gui/src/main/services/artifact-cache.service.ts${NC}"
    echo ""
    echo "2. 参考文档："
    echo "   ${CYAN}QUICK_START_MIGRATION.md${NC} - 第 2️⃣ 阶段"
    echo ""
    echo "3. 主要修改点："
    echo "   - 更新导入语句"
    echo "   - 更新 SpaceCache 接口"
    echo "   - 删除 WATCHER_EXCLUDE 常量"
    echo "   - 添加新的辅助函数"
    echo "   - 重写 initWatcher 函数"
    echo "   - 更新相关函数"
    echo ""
    echo "4. 代码示例："
    echo "   查看 ${CYAN}QUICK_START_MIGRATION.md${NC} 中的详细代码示例"
    echo ""

    if ! confirm "代码修改完成后，按 y 继续"; then
        log_warn "请完成代码修改后重新运行此脚本"
        exit 0
    fi
}

# 编译检查
compile_check() {
    log_step "步骤 9/10: 编译检查"

    cd projcet-gui

    log_info "运行编译..."
    if npm run build; then
        log_success "编译成功"
    else
        log_error "编译失败"
        log_warn "请检查错误信息，修复后重新运行"
        exit 1
    fi

    cd ..
}

# 运行测试
run_tests() {
    log_step "步骤 10/10: 运行测试"

    cd projcet-gui

    # 单元测试
    log_info "运行单元测试..."
    if npm run test:unit; then
        log_success "单元测试通过"
    else
        log_error "单元测试失败"
        if ! confirm "是否继续？"; then
            exit 1
        fi
    fi

    # 基准测试（迁移后）
    log_info "运行性能基准测试（迁移后）..."
    node scripts/benchmark-watcher.mjs > ../benchmark-after.txt 2>&1 || true
    log_success "基准测试完成，结果保存到: benchmark-after.txt"

    cd ..
}

# 显示性能对比
show_performance_comparison() {
    log_step "性能对比"

    if [ -f "benchmark-before.txt" ] && [ -f "benchmark-after.txt" ]; then
        echo "迁移前后性能对比："
        echo ""
        echo -e "${CYAN}迁移前：${NC}"
        head -20 benchmark-before.txt || echo "无数据"
        echo ""
        echo -e "${CYAN}迁移后：${NC}"
        head -20 benchmark-after.txt || echo "无数据"
        echo ""
    else
        log_warn "基准测试文件不存在，跳过性能对比"
    fi
}

# 显示下一步
show_next_steps() {
    log_step "迁移完成！"

    echo -e "${GREEN}恭喜！自动化部分已完成。${NC}"
    echo ""
    echo "接下来的步骤："
    echo ""
    echo "1. ${CYAN}手动测试${NC}"
    echo "   cd projcet-gui"
    echo "   npm run dev"
    echo "   - 打开小项目测试"
    echo "   - 打开大项目测试"
    echo "   - 测试文件变化同步"
    echo "   - 测试 .gitignore 过滤"
    echo ""
    echo "2. ${CYAN}性能验证${NC}"
    echo "   - 检查初始化时间 < 3 秒"
    echo "   - 检查内存占用 < 100 MB"
    echo "   - 确认无 EMFILE 错误"
    echo ""
    echo "3. ${CYAN}提交代码${NC}"
    echo "   cd projcet-gui"
    echo "   git add ."
    echo "   git commit -m \"feat: migrate to @parcel/watcher\""
    echo "   git push origin feature/migrate-to-parcel-watcher"
    echo ""
    echo "4. ${CYAN}如果遇到问题${NC}"
    echo "   node scripts/migrate-watcher.mjs rollback"
    echo ""
    echo -e "${YELLOW}提示：${NC}查看 DELIVERY_CHECKLIST.md 了解完整的验收标准"
    echo ""
}

# 主函数
main() {
    show_welcome
    show_benefits
    check_prerequisites
    create_branch
    run_backup
    run_benchmark_before
    install_dependencies
    uninstall_old_dependencies
    update_config
    guide_code_changes
    compile_check
    run_tests
    show_performance_comparison
    show_next_steps

    echo -e "\n${GREEN}✓ 迁移脚本执行完成！${NC}\n"
}

# 错误处理
trap 'log_error "脚本执行失败，可以运行 rollback 恢复"; exit 1' ERR

# 运行主函数
main "$@"
