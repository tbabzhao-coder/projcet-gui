PDF Tools MCP
================

A Model Context Protocol (MCP) server for PDF manipulation tools using PyMuPDF with OCR capabilities. Convert PDFs to PNG pages, extract embedded images, extract text with OCR support, and get PDF metadata.

## Features

- **pdf_to_images**: Convert PDF pages to PNG images
- **extract_pdf_images**: Extract embedded images from PDF files  
- **extract_pdf_text**: Extract text from PDF pages
- **extract_pdf_text_with_ocr**: Extract text using OCR (Tesseract) - ideal for scanned PDFs or protected documents
- **get_pdf_summary**: Get PDF metadata and summary information

## Version 0.3.0 Changes

- Added OCR functionality using Tesseract for text extraction from scanned/protected PDFs
- Enhanced image processing with OpenCV for better OCR accuracy
- Configurable page range processing (start_page, pages_to_read)
- Confidence scoring for OCR results
- Support for image enhancement and noise reduction

## Prerequisites

For OCR functionality, you need Tesseract OCR installed:

**Windows:**
Download and install from: https://github.com/UB-Mannheim/tesseract/wiki
Default installation path: `C:\Program Files\Tesseract-OCR\tesseract.exe`

**Linux:**
```bash
sudo apt-get install tesseract-ocr
```

**macOS:**
```bash
brew install tesseract
```

Usage examples (local):

Install dependencies:

```bash
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
```

Convert PDF to pages:

```bash
python run_mcp.py pdf2png --read_file_path "/abs/path/to/file.pdf" --write_folder_path "/abs/out"
```

Copy cover and closing into a theme:

```bash
python copy_cover_closing.py "/abs/out/pages" "C:/Users/USER/MCPServers/haia-slidev-builder-mcp/themes/GreenCoin-theme/assets"
```

Usage via npm (after publish):

Run without install:

```bash
npx pdf-tools-mcp --help
npx pdf-tools-mcp pdf2png --read_file_path "/abs/file.pdf" --write_folder_path "/abs/out"
```

Use as an MCP tool (example client config):

```jsonc
{
	"mcpServers": {
		"pdf-tools": {
			"command": "node",
			"args": ["pdf-tools-mcp", "--"],
			"env": {
				// Ensure Python is available on PATH; optional to set PYTHON explicitly
				// "PYTHON": "C:/Users/USER/.virtualenvs/pdf-tools/Scripts/python.exe"
			}
		}
	}
}
```
