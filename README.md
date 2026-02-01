# Project4

An AI-powered productivity assistant built with Claude Agent SDK.

## Features

- 🤖 AI-powered chat interface with Claude
- 📁 Multiple workspace support
- 🔌 MCP (Model Context Protocol) server integration
- 🐍 Built-in Python runtime for Office automation
- 📊 Office document support (PowerPoint, Word, Excel)
- 🌐 Web browsing capabilities
- 💾 Persistent memory and filesystem access

## Built-in MCP Servers

- **Playwright** - Browser automation
- **Filesystem** - Secure file operations
- **Memory** - Persistent knowledge graph
- **Office Suite** - PowerPoint, Word, Excel automation

## Development

```bash
# Install dependencies
npm install

# Prepare Python runtime and MCP servers
npm run prepare:mac-arm64  # For Apple Silicon
npm run prepare:mac-x64    # For Intel Mac
npm run prepare:win-x64    # For Windows

# Start development server
npm run dev

# Build application
npm run build

# Build installers
npm run build:mac
npm run build:win
```

## Requirements

- Node.js 20+
- Anthropic API key

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please contact the development team.
