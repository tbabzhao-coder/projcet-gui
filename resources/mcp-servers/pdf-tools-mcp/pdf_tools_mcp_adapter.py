#!/usr/bin/env python3
"""
Proper MCP adapter for pdf-tools.

This script implements the Model Context Protocol (MCP) to expose PDF tools
as proper MCP tools that VS Code can discover and use.
"""
import sys
import json
from typing import Dict, Any, List
from pdf_tools import pdf_to_pngs, extract_images, extract_text, summary


def send_rpc(resp: Dict[str, Any]):
    body = json.dumps(resp)
    header = f"Content-Length: {len(body)}\r\n\r\n"
    sys.stdout.write(header)
    sys.stdout.write(body)
    sys.stdout.flush()


def read_message() -> Dict[str, Any] | None:
    # Read headers
    headers = {}
    while True:
        line = sys.stdin.readline()
        if not line:
            return None
        line = line.strip()
        if line == "":
            break
        parts = line.split(":", 1)
        if len(parts) == 2:
            headers[parts[0].strip().lower()] = parts[1].strip()
    if 'content-length' not in headers:
        return None
    length = int(headers['content-length'])
    body = sys.stdin.read(length)
    return json.loads(body)


def get_mcp_tools() -> List[Dict[str, Any]]:
    """Return the list of MCP tools this server provides"""
    return [
        {
            "name": "pdf_to_images",
            "description": "Convert PDF pages to PNG images",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pdf_path": {"type": "string", "description": "Path to the PDF file"},
                    "output_folder": {"type": "string", "description": "Folder to save PNG images"},
                    "dpi": {"type": "number", "description": "DPI for image conversion", "default": 150}
                },
                "required": ["pdf_path", "output_folder"]
            }
        },
        {
            "name": "extract_pdf_images", 
            "description": "Extract embedded images from PDF",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pdf_path": {"type": "string", "description": "Path to the PDF file"},
                    "output_folder": {"type": "string", "description": "Folder to save extracted images"}
                },
                "required": ["pdf_path", "output_folder"]
            }
        },
        {
            "name": "extract_pdf_text",
            "description": "Extract text from PDF pages", 
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pdf_path": {"type": "string", "description": "Path to the PDF file"},
                    "output_folder": {"type": "string", "description": "Folder to save text files"}
                },
                "required": ["pdf_path", "output_folder"]
            }
        },
        {
            "name": "get_pdf_summary",
            "description": "Get PDF metadata and summary information",
            "inputSchema": {
                "type": "object", 
                "properties": {
                    "pdf_path": {"type": "string", "description": "Path to the PDF file"}
                },
                "required": ["pdf_path"]
            }
        }
    ]


def handle_request(req: Dict[str, Any]):
    # JSON-RPC request or notification
    if 'method' not in req:
        return
    method = req['method']
    id_ = req.get('id')
    
    try:
        if method == 'initialize':
            # MCP initialization - respond with proper capabilities
            result = {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "pdf-tools-mcp",
                    "version": "0.1.0"
                }
            }
            if id_ is not None:
                send_rpc({"jsonrpc": "2.0", "id": id_, "result": result})
            return
            
        elif method == 'notifications/initialized':
            # Client confirms initialization - no response needed
            return
            
        elif method == 'tools/list':
            # Return the list of available tools
            result = {"tools": get_mcp_tools()}
            if id_ is not None:
                send_rpc({"jsonrpc": "2.0", "id": id_, "result": result})
            return
            
        elif method == 'tools/call':
            # Execute a tool
            params = req.get('params', {})
            tool_name = params.get('name')
            arguments = params.get('arguments', {})
            
            if tool_name == 'pdf_to_images':
                result = pdf_to_pngs(
                    PathLike(arguments['pdf_path']), 
                    PathLike(arguments['output_folder']), 
                    dpi=int(arguments.get('dpi', 150))
                )
            elif tool_name == 'extract_pdf_images':
                result = extract_images(
                    PathLike(arguments['pdf_path']), 
                    PathLike(arguments['output_folder'])
                )
            elif tool_name == 'extract_pdf_text':
                result = extract_text(
                    PathLike(arguments['pdf_path']), 
                    PathLike(arguments['output_folder'])
                )
            elif tool_name == 'get_pdf_summary':
                result = summary(PathLike(arguments['pdf_path']))
            else:
                raise ValueError(f"Unknown tool: {tool_name}")

            # Parse JSON result if it's a string
            try:
                if isinstance(result, str):
                    parsed_result = json.loads(result)
                else:
                    parsed_result = result
            except Exception:
                parsed_result = str(result)
                
            response = {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(parsed_result, indent=2) if isinstance(parsed_result, (dict, list)) else str(parsed_result)
                    }
                ]
            }
            if id_ is not None:
                send_rpc({"jsonrpc": "2.0", "id": id_, "result": response})
            return

        elif method == 'shutdown':
            if id_ is not None:
                send_rpc({"jsonrpc": "2.0", "id": id_, "result": None})
            return
            
        elif method == 'exit':
            sys.exit(0)

        # Unknown method
        if id_ is not None:
            send_rpc({"jsonrpc": "2.0", "id": id_, "error": {"code": -32601, "message": f"Method not found: {method}"}})
            
    except Exception as e:
        if id_ is not None:
            send_rpc({"jsonrpc": "2.0", "id": id_, "error": {"code": -32000, "message": str(e)}})


class PathLike:
    """Simple wrapper to accept both str and Path-like inputs"""
    def __init__(self, p):
        from pathlib import Path
        self.path = Path(p)

    def __str__(self):
        return str(self.path)

    def __fspath__(self):
        return str(self.path)


def run_loop():
    # main loop
    while True:
        msg = read_message()
        if msg is None:
            break
        # handle req/notification
        handle_request(msg)


def self_test():
    # quick import test to verify adapter loads
    try:
        import fitz  # noqa: F401
        print('IMPORT_OK')
        return 0
    except Exception as e:
        print('IMPORT_FAIL', e)
        return 2


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--test', action='store_true', help='Run a quick self-test and exit')
    args = parser.parse_args()
    if args.test:
        sys.exit(self_test())
    # enter stdio JSON-RPC loop
    try:
        run_loop()
    except KeyboardInterrupt:
        pass
