#!/usr/bin/env python3
"""
PDF Tools MCP Server using official MCP library
"""
import asyncio
import json
from pathlib import Path
from typing import Any, Sequence

from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
import mcp.server.stdio

# Import local PDF tools
from pdf_tools import pdf_to_pngs, extract_images, extract_text, summary, extract_pdf_text_with_ocr, extract_image_text_with_ocr

# Create the server instance
server = Server("pdf-tools-mcp")

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """List available tools."""
    return [
        types.Tool(
            name="pdf_to_images",
            description="Convert PDF pages to PNG images",
            inputSchema={
                "type": "object",
                "properties": {
                    "pdf_path": {"type": "string", "description": "Path to the PDF file"},
                    "output_folder": {"type": "string", "description": "Folder to save PNG images"},
                    "dpi": {"type": "number", "description": "DPI for image conversion", "default": 150}
                },
                "required": ["pdf_path", "output_folder"]
            }
        ),
        types.Tool(
            name="extract_pdf_images",
            description="Extract embedded images from PDF",
            inputSchema={
                "type": "object",
                "properties": {
                    "pdf_path": {"type": "string", "description": "Path to the PDF file"},
                    "output_folder": {"type": "string", "description": "Folder to save extracted images"}
                },
                "required": ["pdf_path", "output_folder"]
            }
        ),
        types.Tool(
            name="extract_pdf_text",
            description="Extract text from PDF pages",
            inputSchema={
                "type": "object",
                "properties": {
                    "pdf_path": {"type": "string", "description": "Path to the PDF file"},
                    "output_folder": {"type": "string", "description": "Folder to save text files"}
                },
                "required": ["pdf_path", "output_folder"]
            }
        ),
        types.Tool(
            name="get_pdf_summary",
            description="Get PDF metadata and summary information",
            inputSchema={
                "type": "object",
                "properties": {
                    "pdf_path": {"type": "string", "description": "Path to the PDF file"}
                },
                "required": ["pdf_path"]
            }
        ),
        types.Tool(
            name="extract_pdf_text_with_ocr",
            description="Extract text from PDF using OCR on page images - useful for scanned PDFs or protected documents",
            inputSchema={
                "type": "object",
                "properties": {
                    "pdf_path": {"type": "string", "description": "Path to the PDF file"},
                    "output_folder": {"type": "string", "description": "Folder to save OCR output (optional)"},
                    "pages_to_read": {"type": "number", "description": "Number of pages to process (optional, defaults to all)"},
                    "start_page": {"type": "number", "description": "Starting page number (1-based, defaults to 1)"}
                },
                "required": ["pdf_path"]
            }
        ),
        types.Tool(
            name="extract_image_text_with_ocr",
            description="Extract text from image files using OCR - supports PNG, JPG, JPEG, etc.",
            inputSchema={
                "type": "object",
                "properties": {
                    "image_path": {"type": "string", "description": "Path to the image file"},
                    "output_folder": {"type": "string", "description": "Folder to save OCR output (optional)"}
                },
                "required": ["image_path"]
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(name: str, arguments: dict[str, Any] | None) -> list[types.TextContent]:
    """Handle tool calls."""
    if arguments is None:
        arguments = {}
    
    try:
        if name == "pdf_to_images":
            result = pdf_to_pngs(
                Path(arguments["pdf_path"]),
                Path(arguments["output_folder"]),
                dpi=int(arguments.get("dpi", 150))
            )
        elif name == "extract_pdf_images":
            result = extract_images(
                Path(arguments["pdf_path"]),
                Path(arguments["output_folder"])
            )
        elif name == "extract_pdf_text":
            result = extract_text(
                Path(arguments["pdf_path"]),
                Path(arguments["output_folder"])
            )
        elif name == "get_pdf_summary":
            result = summary(Path(arguments["pdf_path"]))
        elif name == "extract_pdf_text_with_ocr":
            # Handle optional parameters
            output_folder = arguments.get("output_folder")
            pages_to_read = arguments.get("pages_to_read")
            start_page = arguments.get("start_page", 1)
            
            # Convert to Path if provided
            output_folder_path = Path(output_folder) if output_folder else None
            
            result = extract_pdf_text_with_ocr(
                Path(arguments["pdf_path"]),
                output_folder=output_folder_path,
                pages_to_read=int(pages_to_read) if pages_to_read else None,
                start_page=int(start_page)
            )
        elif name == "extract_image_text_with_ocr":
            # Handle optional parameters
            output_folder = arguments.get("output_folder")
            
            # Convert to Path if provided
            output_folder_path = Path(output_folder) if output_folder else None
            
            result = extract_image_text_with_ocr(
                Path(arguments["image_path"]),
                output_folder=output_folder_path
            )
        else:
            raise ValueError(f"Unknown tool: {name}")
        
        # Format result
        if isinstance(result, str):
            try:
                parsed_result = json.loads(result)
                formatted_result = json.dumps(parsed_result, indent=2)
            except:
                formatted_result = result
        else:
            formatted_result = json.dumps(result, indent=2) if isinstance(result, (dict, list)) else str(result)
        
        return [types.TextContent(type="text", text=formatted_result)]
        
    except Exception as e:
        return [types.TextContent(type="text", text=f"Error executing {name}: {str(e)}")]

async def main():
    # Run the server using stdio transport
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="pdf-tools-mcp",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )

if __name__ == "__main__":
    asyncio.run(main())
