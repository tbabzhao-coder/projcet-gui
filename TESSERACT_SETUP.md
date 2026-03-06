# Tesseract OCR Setup Guide

本项目内置了两个 OCR MCP 服务器：

## 1. Image OCR MCP (推荐)

**纯 JavaScript 实现，无需系统依赖**

- 使用 Tesseract.js
- 支持格式：PNG, JPG, JPEG, BMP, TIFF, WebP
- 支持 100+ 语言
- 开箱即用，无需额外安装

### 工具

- `ocr_image`: 基础 OCR 文本提取
- `ocr_image_with_confidence`: 带置信度评分的 OCR

### 使用示例

```javascript
// 基础 OCR
{
  "tool": "ocr_image",
  "arguments": {
    "image_path": "/path/to/image.png",
    "language": "eng"  // 或 "chi_sim" (简体中文), "jpn" (日语) 等
  }
}

// 带置信度的 OCR
{
  "tool": "ocr_image_with_confidence",
  "arguments": {
    "image_path": "/path/to/image.png",
    "language": "chi_sim",
    "min_confidence": 60
  }
}
```

## 2. PDF Tools MCP

**需要系统依赖：Python + Tesseract OCR**

- 支持 PDF 处理和 OCR
- 功能更强大但需要额外安装

### macOS 安装

```bash
# 安装 Tesseract OCR
brew install tesseract

# 安装中文语言包（可选）
brew install tesseract-lang

# 验证安装
tesseract --version
```

### Windows 安装

1. 下载 Tesseract 安装程序：
   https://github.com/UB-Mannheim/tesseract/wiki

2. 安装时选择需要的语言包

3. 添加到系统 PATH：
   ```
   C:\Program Files\Tesseract-OCR
   ```

4. 验证安装：
   ```cmd
   tesseract --version
   ```

### Linux 安装

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install tesseract-ocr
sudo apt-get install tesseract-ocr-chi-sim  # 简体中文

# Fedora
sudo dnf install tesseract
sudo dnf install tesseract-langpack-chi_sim

# 验证安装
tesseract --version
```

### Python 依赖

PDF Tools MCP 会自动使用系统 Python，需要安装以下包：

```bash
pip3 install pymupdf opencv-python pytesseract pillow numpy
```

## 语言代码参考

常用语言代码：

- `eng` - 英语
- `chi_sim` - 简体中文
- `chi_tra` - 繁体中文
- `jpn` - 日语
- `kor` - 韩语
- `fra` - 法语
- `deu` - 德语
- `spa` - 西班牙语
- `rus` - 俄语
- `ara` - 阿拉伯语

## 选择建议

- **图片 OCR**：使用 `image-ocr` MCP（无需安装，开箱即用）
- **PDF OCR**：使用 `pdf-tools` MCP（需要安装 Tesseract）

## 故障排除

### Image OCR MCP

如果首次使用较慢，这是正常的，因为 Tesseract.js 需要下载语言数据。后续使用会从缓存加载。

### PDF Tools MCP

如果 PDF Tools MCP 无法启动：

1. 确认 Tesseract 已安装：`tesseract --version`
2. 确认 Python 已安装：`python3 --version`
3. 确认 Python 包已安装：`pip3 list | grep pytesseract`
4. 检查应用日志中的错误信息

## 配置位置

MCP 服务器配置在应用设置中：

设置 → MCP Servers → 启用/禁用相应服务器
