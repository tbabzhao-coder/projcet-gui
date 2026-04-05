# Project Rules

## Cross-Platform Compatibility

This is an Electron app that runs on macOS, Windows, and Linux. **Every change must consider Windows compatibility.**

Key points:
- File paths: always use `path.join()` or `path.resolve()`, never hardcode `/` as separator
- Path display in UI: Windows uses `\`, macOS/Linux uses `/` — handle both when parsing or displaying paths
- Line endings: be aware of CRLF (Windows) vs LF (macOS/Linux)
- Shell commands: if executing shell commands, ensure they work on both PowerShell/cmd and bash/zsh, or use platform-specific branches
- File system: Windows paths can start with drive letters (e.g., `C:\`), filenames are case-insensitive
- Electron APIs: prefer Electron/Node.js cross-platform APIs over platform-specific ones
