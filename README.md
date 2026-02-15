# AI Code Assistant

**Version:** 0.4.0  
**Last Updated:** February 15, 2026

A **browser extension + native host** toolchain that accelerates the flow of AI-generated code into real projects. Capture code blocks from ChatGPT or Claude, save them to disk with smart filename detection, and execute shell commands directly from your browser—all without leaving the AI conversation.

---

## Overview

AI Code Assistant bridges the gap between AI-powered coding sessions and your local development environment. Instead of copying and pasting code snippets manually, this tool provides:

- **One-click save**: Detect code blocks in AI chat interfaces, infer filenames and paths, and write directly to your project.
- **In-browser execution**: Run shell commands (build, test, lint) from the chat UI and see output inline—ideal for iterative AI-assisted development.
- **Project-aware workflows**: Manage multiple projects with persistent root paths, synced across Chrome sessions.

**Architecture:** Cross-browser content script + background orchestration + Rust native host.  
For deep technical details, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Features

### 1. Smart Code Save
- **Filename inference**: Extracts filenames from code fences, surrounding text, or language tags.
- **Path memory**: Remembers last-used paths per project; supports quick append or overwrite.
- **Project management**: Store and switch between multiple project roots (synced via `chrome.storage.sync`).
- **Safe writes**: Blocks directory traversal (`../`), enforces canonical containment within project root.

### 2. Command Execution
- **Shell runner**: Execute arbitrary commands in a chosen working directory.
- **Timeout enforcement**: Configurable timeout (5–300s, default 30s); process killed on expiry with partial output returned.
- **Inline feedback**: Success/error states with stdout/stderr displayed in modal.
- **Project selector**: Pick from stored projects or provide a custom working directory.

### 3. Configuration & Sync
- **Export/Import**: Share project lists and settings across machines via JSON.
- **Chrome sync**: Project data automatically synced when signed into Chrome.
- **Protocol-based**: JSON over stdin/stdout for reliable extension ↔ native host communication.

---

## Installation

### Prerequisites
- **Rust toolchain**: Install from [rustup.rs](https://rustup.rs).
- **Chrome/Chromium**: Manifest V3 compatible (≥ Chrome 88).
- **OS**: Linux or macOS. **Windows support is planned but not yet implemented.**

> ⚠️ **Snap-packaged Chromium** does not support native messaging due to sandboxing restrictions. Use the `.deb` package from Google or a non-Snap build.

---

### Step 1: Build the Native Host

```bash
cd native-host
cargo build --release
```

Binary output: `target/release/ai-code-host`

---

### Step 2: Install the Native Host

Run the provided install script (auto-detects Snap Chromium and warns):

```bash
./scripts/install.sh
```

**What it does:**
1. Copies the binary to `~/.local/bin/ai-code-host`.
2. Generates a native messaging manifest at:
   - **Chrome:** `~/.config/google-chrome/NativeMessagingHosts/com.aicode.host.json`
   - **Chromium:** `~/.config/chromium/NativeMessagingHosts/com.aicode.host.json`
3. Validates the installation and checks for Snap packaging issues.

**Manual installation (if needed):**
```bash
# Copy binary
cp target/release/ai-code-host ~/.local/bin/

# Create manifest directory
mkdir -p ~/.config/google-chrome/NativeMessagingHosts

# Write manifest
cat > ~/.config/google-chrome/NativeMessagingHosts/com.aicode.host.json <<EOF
{
  "name": "com.aicode.host",
  "description": "AI Code Assistant Native Host",
  "path": "$HOME/.local/bin/ai-code-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
EOF
```

---

### Step 3: Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in top-right corner).
3. Click **Load unpacked** and select the `extension/` directory from this repo.
4. Note the **Extension ID** (e.g., `abcdefghijklmnopqrstuvwxyz123456`).
5. Update the native messaging manifest's `allowed_origins` field:
   ```json
   "allowed_origins": [
     "chrome-extension://abcdefghijklmnopqrstuvwxyz123456/"
   ]
   ```
6. Restart Chrome for the manifest change to take effect.

---

## Usage

### Save Code Flow

1. **Visit an AI chat** (ChatGPT, Claude, etc.) and generate code.
2. **Hover over a code block** → A **💾 Save** button appears.
3. **Click Save** → Modal opens with:
   - **Inferred filename** (editable)
   - **Project selector** (or custom path input)
   - **Append/Overwrite** toggle
4. **Confirm** → Native host writes the file and displays success/error.
5. **Path memory**: The chosen path is stored; subsequent saves default to the same directory.

**Example:**
```javascript
// Filename: utils.js
function greet(name) {
  return `Hello, ${name}!`;
}
```
→ Click Save → Filename auto-filled as `utils.js` → Select project `MyApp` → Written to `/path/to/MyApp/utils.js`.

---

### Execute Command Flow

1. **Click the 🚀 Execute button** in the AI Code Assistant toolbar (or injected UI).
2. **Execute modal opens** with:
   - **Command input** (e.g., `cargo build`, `npm test`)
   - **Working directory selector** (project or custom path)
   - **Timeout** (default 30s, range 5–300s)
3. **Click Run** → Native host spawns the process:
   - **On success**: Modal displays stdout/stderr and exit code.
   - **On timeout**: Process killed (including children), partial output returned with timeout error.
   - **On error**: Modal shows error details (invalid path, permission denied, etc.).
4. **Output** is displayed inline; modal can be closed and reopened to view history (session-only).

**Timeout Enforcement:**
- Default: **30 seconds** (user-configurable per request).
- Implementation: Native host uses `tokio::time::timeout` and `kill()` + `waitpid()` to ensure child processes are reaped.
- If timeout expires, the response includes `"timeout": true` and any output captured before termination.

**Security Considerations:**
- **No shell interpretation by default**: Commands are executed directly (no `sh -c` wrapper) unless explicitly required.
- **Working directory validation**: Must be an existing, absolute path; relative paths and traversal attempts are rejected.
- **No implicit persistence**: Execute requests are stateless; no command history is logged to disk.

---

## Troubleshooting

### Native Host Not Found

**Symptoms:**
- Extension shows "Native host connection failed" or "Native messaging host not found."

**Solutions:**
1. Verify the binary exists and is executable:
   ```bash
   ls -l ~/.local/bin/ai-code-host
   chmod +x ~/.local/bin/ai-code-host
   ```
2. Check the manifest path matches your browser:
   - Chrome: `~/.config/google-chrome/NativeMessagingHosts/com.aicode.host.json`
   - Chromium: `~/.config/chromium/NativeMessagingHosts/com.aicode.host.json`
3. Ensure `allowed_origins` in the manifest matches your extension ID.
4. Restart Chrome completely (not just reload the extension).

---

### Snap Chromium Issues

**Symptom:**
- Native messaging fails with "Access denied" or no response from host.

**Cause:**
- Snap-packaged Chromium runs in a strict sandbox that blocks native messaging.

**Solution:**
- Uninstall Snap Chromium:
  ```bash
  sudo snap remove chromium
  ```
- Install the official `.deb` package:
  ```bash
  wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo dpkg -i google-chrome-stable_current_amd64.deb
  ```
- Or use a non-Snap Chromium build from your distro's repos.

---

### Permission Errors on Save/Execute

**Symptoms:**
- "Permission denied" when writing files or running commands.

**Solutions:**
1. Verify the project root and working directory are **writable**:
   ```bash
   ls -ld /path/to/project
   ```
2. Ensure the native host binary has execute permissions:
   ```bash
   chmod +x ~/.local/bin/ai-code-host
   ```
3. For execute: confirm the command itself is executable (e.g., `cargo`, `npm` in `$PATH`).

---

### Timeout Issues

**Symptom:**
- Commands are killed prematurely or timeout errors appear for fast commands.

**Solutions:**
1. Increase the timeout value in the Execute modal (max 300s).
2. For long-running tasks, consider running them outside the extension or using a build tool.
3. Check stderr output for clues if the command hangs (e.g., waiting for input).

---

## Known Issues

1. **Windows Not Supported**
   - The native host uses Unix-specific process management (`fork`, `kill`, `waitpid`).
   - Windows support requires porting to `std::process` or `winapi` equivalents.
   - **Workaround:** Use WSL2 with Linux Chrome/Chromium.

2. **Snap Chromium Incompatible**
   - Snap's strict confinement blocks native messaging.
   - **Workaround:** Install non-Snap Chrome or Chromium (see Troubleshooting).

3. **Execute History Not Persisted**
   - Output from execute requests is session-only (not logged to disk or storage).
   - **Future:** Add optional command history with user opt-in.

4. **Large Output Truncation**
   - Stdout/stderr buffers may truncate for commands producing > 1MB output.
   - **Mitigation:** Native host uses streaming buffers; future versions will support chunked responses.

---

## Future Enhancements

- **Windows Support**: Port process management to cross-platform APIs.
- **Batch Operations**: Save multiple code blocks as a change set with preview.
- **Git Integration**: Warn on dirty workspace, optional auto-commit after save.
- **Editor Hooks**: Configurable "open in editor" command after save.
- **Keyboard Shortcuts**: Quick-save, quick-execute, and modal navigation.
- **Dry-Run Mode**: Preview file writes and command execution without side effects.
- **Smart Context**: Infer project root from `git` or language-specific config files.

---

## Architecture

For a **deep technical dive**, including protocol schemas, message flows, timeout implementation, and security boundaries, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

**High-level stack:**
- **Extension** (Manifest V3): Content script (UI injection) + background service worker (messaging orchestrator).
- **Native Host** (Rust): Protocol parser, file I/O, subprocess executor, timeout enforcer.
- **Protocol**: JSON frames over stdin/stdout with length-prefixed headers (Chrome native messaging format).

---

## Contributing

Contributions are welcome! Please:

1. **Open an issue** before starting major features or architectural changes.
2. Follow the existing code style (Rust: `cargo fmt`; JS: project conventions).
3. Add tests for new protocol actions or file path logic.
4. Update `ARCHITECTURE.md` for protocol changes; update `README.md` for user-facing features.
5. Ensure CI passes (if configured) or manually verify:
   ```bash
   cargo test --all
   cargo clippy -- -D warnings
   ```

**Areas needing help:**
- Windows native host port
- Firefox/Edge extension ports
- UI/UX polish (icons, animations, accessibility)
- Automated integration tests (Puppeteer or similar)

---

## License

**MIT License** (or specify your chosen license).

See [`LICENSE`](LICENSE) for full text.

---

## Questions or Issues?

- **Bug reports:** Open an issue with logs, OS, Chrome version, and steps to reproduce.
- **Feature requests:** Describe the use case and how it fits into the AI→code workflow.
- **Security concerns:** Please report privately to the maintainer before public disclosure.

---

**Happy coding with AI! 🚀**
