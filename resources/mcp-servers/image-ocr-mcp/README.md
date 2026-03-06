# Image OCR MCP Server

A Model Context Protocol (MCP) server that provides OCR (Optical Character Recognition) capabilities for images using Tesseract.js.

## Features

- **ocr_image**: Extract text from images with basic OCR
- **ocr_image_with_confidence**: Extract text with confidence scores for quality assessment

## Supported Formats

- PNG
- JPG/JPEG
- BMP
- TIFF
- WebP

## Supported Languages

Tesseract.js supports 100+ languages. Common ones include:

- `eng` - English
- `chi_sim` - Simplified Chinese
- `chi_tra` - Traditional Chinese
- `jpn` - Japanese
- `kor` - Korean
- `fra` - French
- `deu` - German
- `spa` - Spanish
- `rus` - Russian
- `ara` - Arabic

## Installation

This server is bundled with Project4 and requires no additional system dependencies (unlike pdf-tools-mcp which requires Tesseract OCR to be installed).

## Usage

### Basic OCR

```javascript
{
  "tool": "ocr_image",
  "arguments": {
    "image_path": "/path/to/image.png",
    "language": "eng"
  }
}
```

### OCR with Confidence Scores

```javascript
{
  "tool": "ocr_image_with_confidence",
  "arguments": {
    "image_path": "/path/to/image.png",
    "language": "eng",
    "min_confidence": 60
  }
}
```

## Configuration

Add to your MCP servers configuration:

```json
{
  "mcpServers": {
    "image-ocr": {
      "command": "node",
      "args": ["/path/to/image-ocr-mcp/index.js"]
    }
  }
}
```

## Page Segmentation Modes (PSM)

- `0` - Orientation and script detection (OSD) only
- `1` - Automatic page segmentation with OSD
- `3` - Fully automatic page segmentation (default)
- `6` - Assume a single uniform block of text
- `11` - Sparse text. Find as much text as possible in no particular order
- `13` - Raw line. Treat the image as a single text line

## Notes

- First OCR operation may take longer as Tesseract.js downloads language data
- Language data is cached for subsequent operations
- Pure JavaScript implementation - no system dependencies required
