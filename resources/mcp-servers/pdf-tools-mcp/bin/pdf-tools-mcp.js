#!/usr/bin/env node
// Simple Node launcher for the Python MCP server
// Tries to use the current environment's python and run run_mcp.py with CLI args

const { spawn } = require('node:child_process')
const { join } = require('node:path')

const args = process.argv.slice(2)

const isMcpMode =
  process.env.MCP_MODE === 'stdio' ||
  args.length === 0 ||
  args[0] === 'mcp'

const script = isMcpMode
  ? join(__dirname, '..', 'pdf_tools_mcp_server_official.py')
  : join(__dirname, '..', 'run_mcp.py')

const forwarded = isMcpMode && args[0] === 'mcp' ? args.slice(1) : args

const child = spawn(process.env.PYTHON || 'python', [script, ...forwarded], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code) => process.exit(code ?? 0))
