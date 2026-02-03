# Project4 Windows 调试指南

## 📋 日志位置

### Windows 系统日志路径
```
%USERPROFILE%\AppData\Roaming\Project4\logs\
```

完整路径示例：
```
C:\Users\YourUsername\AppData\Roaming\Project4\logs\main.log
```

### 快速打开日志目录

**方法1：使用运行对话框（最快）**
1. 按 `Win + R` 打开运行对话框
2. 输入：`%APPDATA%\Project4\logs`
3. 按回车

**方法2：使用文件资源管理器**
1. 打开文件资源管理器
2. 在地址栏输入：`%APPDATA%\Project4\logs`
3. 按回车

**方法3：使用命令行**
```cmd
explorer %APPDATA%\Project4\logs
```

### 日志文件说明

- **main.log** - 主进程日志（最新）
- **main.old.log** - 主进程日志（旧文件，自动轮转）
- **renderer.log** - 渲染进程日志（如果有）

日志文件会自动轮转，单个文件最大 5MB。

## 🔧 开启 Debug 模式

### 方法1：使用 F12 快捷键（推荐）⭐

应用已内置 DevTools 快捷键支持：

1. **打开 DevTools**
   - 按 `F12` 键
   - 或按 `Ctrl + Shift + I`

2. **查看控制台**
   - DevTools 会以独立窗口打开
   - 切换到 Console 标签查看实时日志

3. **关闭 DevTools**
   - 再次按 `F12` 或 `Ctrl + Shift + I`

### 方法2：通过菜单打开 DevTools

1. 点击菜单栏 `View` (查看)
2. 选择 `Toggle Developer Tools` (切换开发者工具)

### 方法3：设置环境变量（高级）

创建启动脚本来启用详细日志：

**debug.bat**
```batch
@echo off
REM 设置日志级别为 debug
set ELECTRON_ENABLE_LOGGING=1
set NODE_ENV=development

REM 启动应用
start "" "%LOCALAPPDATA%\Programs\Project4\Project4.exe"
```

保存为 `debug.bat`，双击运行。

### 方法4：命令行启动（最详细）

```cmd
cd %LOCALAPPDATA%\Programs\Project4
set ELECTRON_ENABLE_LOGGING=1
set NODE_ENV=development
Project4.exe --enable-logging --v=1
```

## 📊 查看实时日志

### 使用 PowerShell 实时监控日志

```powershell
# 实时查看主进程日志
Get-Content "$env:APPDATA\Project4\logs\main.log" -Wait -Tail 50
```

### 使用命令提示符

```cmd
# 查看最新50行日志
powershell -Command "Get-Content $env:APPDATA\Project4\logs\main.log -Tail 50"

# 实时监控（需要第三方工具如 tail.exe）
tail -f %APPDATA%\Project4\logs\main.log
```

### 使用第三方工具

推荐工具：
- **Notepad++** - 支持实时刷新
- **BareTail** - 专业日志查看工具
- **mTail** - 多文件日志监控

## 🐛 常见调试场景

### 1. 应用启动失败

**查看启动日志**：
```cmd
type %APPDATA%\Project4\logs\main.log | findstr "ERROR"
```

**常见错误**：
- `ENOENT` - 文件或目录不存在
- `EACCES` - 权限不足
- `EPERM` - 操作不允许
- `Out of memory` - 内存不足

### 2. MCP 服务器启动失败

**搜索 MCP 相关日志**：
```cmd
type %APPDATA%\Project4\logs\main.log | findstr "MCP"
```

**检查点**：
- Python 运行时是否正常
- Git Bash 是否可用
- 端口是否被占用

### 3. API 调用失败

**搜索 API 错误**：
```cmd
type %APPDATA%\Project4\logs\main.log | findstr "API\|anthropic"
```

**常见问题**：
- API Key 无效
- 网络连接问题
- 代理配置错误

### 4. 内存溢出 (OOM)

**搜索内存相关错误**：
```cmd
type %APPDATA%\Project4\logs\main.log | findstr "heap\|memory\|OOM"
```

**解决方案**：
- 关闭不必要的 MCP 服务器
- 清理对话历史
- 增加系统内存

## 📝 日志级别说明

当前配置：
```typescript
log.transports.file.level = 'info'           // 文件日志级别
log.transports.console.level = isDev ? 'debug' : 'info'  // 控制台日志级别
```

日志级别（从低到高）：
- **silly** - 最详细，所有信息
- **debug** - 调试信息
- **info** - 一般信息（默认）
- **warn** - 警告信息
- **error** - 错误信息

## 🔍 高级调试技巧

### 1. 启用 Chromium 详细日志

```cmd
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_LOG_ASAR_READS=1
Project4.exe --enable-logging --v=1
```

### 2. 启用网络日志

```cmd
Project4.exe --log-net-log=network.json
```

查看网络请求详情（JSON 格式）。

### 3. 禁用 GPU 加速（排查渲染问题）

```cmd
Project4.exe --disable-gpu --disable-software-rasterizer
```

注意：应用已默认在 Windows 上禁用 GPU 加速以提高兼容性。

### 4. 启用性能分析

在 DevTools 中：
1. 按 `F12` 打开 DevTools
2. 切换到 `Performance` 标签
3. 点击录制按钮
4. 执行操作
5. 停止录制并分析

### 5. 内存快照

在 DevTools 中：
1. 按 `F12` 打开 DevTools
2. 切换到 `Memory` 标签
3. 选择 `Heap snapshot`
4. 点击 `Take snapshot`
5. 分析内存使用

## 📤 提交 Bug 报告

收集以下信息：

### 1. 系统信息
```cmd
systeminfo | findstr /B /C:"OS Name" /C:"OS Version" /C:"System Type" /C:"Total Physical Memory"
```

### 2. 应用版本
- 打开应用
- 查看 `Help` -> `About` (如果有)
- 或查看安装目录中的版本信息

### 3. 日志文件
```cmd
# 打包日志文件
powershell Compress-Archive -Path "$env:APPDATA\Project4\logs\*" -DestinationPath "%USERPROFILE%\Desktop\project4-logs.zip"
```

### 4. 错误截图
- 按 `F12` 打开 DevTools
- 切换到 Console 标签
- 截图错误信息

### 5. 重现步骤
详细描述如何重现问题：
1. 打开应用
2. 执行操作 A
3. 执行操作 B
4. 观察到错误 X

## 🛠️ 常用调试命令

### 清理应用数据
```cmd
REM 备份数据
xcopy /E /I %APPDATA%\Project4 %USERPROFILE%\Desktop\Project4-backup

REM 清理缓存
rmdir /S /Q %APPDATA%\Project4\Cache
rmdir /S /Q %APPDATA%\Project4\GPUCache

REM 清理日志
del /Q %APPDATA%\Project4\logs\*.log
```

### 重置应用配置
```cmd
REM 备份配置
copy %APPDATA%\Project4\config.json %USERPROFILE%\Desktop\config-backup.json

REM 删除配置（应用会重新创建）
del %APPDATA%\Project4\config.json
```

### 检查端口占用
```cmd
REM 检查常用端口
netstat -ano | findstr "5173 3000 8080"
```

### 检查进程
```cmd
REM 查看 Project4 进程
tasklist | findstr "Project4"

REM 强制结束进程（如果卡死）
taskkill /F /IM Project4.exe
```

## 📞 获取帮助

如果以上方法无法解决问题：

1. **收集日志**：按照上述步骤收集完整日志
2. **记录错误**：截图或复制错误信息
3. **描述问题**：详细说明问题和重现步骤
4. **提交 Issue**：在 GitHub 仓库提交问题报告

## 🔐 隐私提示

提交日志前，请检查并删除敏感信息：
- API Keys
- 个人对话内容
- 文件路径中的用户名
- 其他隐私数据

可以使用文本编辑器搜索并替换敏感信息。

## 🚀 快速诊断脚本

将以下脚本保存为 `diagnose.bat`，双击运行可快速收集诊断信息：

```batch
@echo off
echo ========================================
echo Project4 诊断工具
echo ========================================
echo.

REM 创建诊断报告目录
set REPORT_DIR=%USERPROFILE%\Desktop\Project4-Diagnostic-%date:~0,4%%date:~5,2%%date:~8,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set REPORT_DIR=%REPORT_DIR: =0%
mkdir "%REPORT_DIR%"

echo [1/6] 收集系统信息...
systeminfo > "%REPORT_DIR%\system-info.txt"

echo [2/6] 收集进程信息...
tasklist /V > "%REPORT_DIR%\processes.txt"

echo [3/6] 收集网络信息...
netstat -ano > "%REPORT_DIR%\network.txt"

echo [4/6] 复制日志文件...
xcopy /E /I "%APPDATA%\Project4\logs" "%REPORT_DIR%\logs"

echo [5/6] 复制配置文件...
copy "%APPDATA%\Project4\config.json" "%REPORT_DIR%\config.json" 2>nul

echo [6/6] 打包诊断报告...
powershell Compress-Archive -Path "%REPORT_DIR%\*" -DestinationPath "%REPORT_DIR%.zip"

echo.
echo ========================================
echo 诊断完成！
echo 报告位置: %REPORT_DIR%.zip
echo ========================================
echo.
echo 请将此文件发送给技术支持。
echo 注意：请检查并删除敏感信息后再发送！
echo.
pause
```

## 📚 相关文档

- [系统配置要求](./SYSTEM_REQUIREMENTS.md)
- [安装指南](./INSTALLATION_GUIDE.md)
- [常见问题](./FAQ.md)
