# AI Code Integration Extension

**Browser extension + Rust native host** that accelerates the flow of AI-generated code into real projects. Save code blocks from ChatGPT, Claude, or any web-based AI assistant directly to your filesystem with one click—no copy/paste.

---

## Overview

AI Code Assistant bridges the gap between AI-powered coding sessions and your local development environment. Instead of copying and pasting code snippets manually, this tool provides:

- **One-click save**: Detect code blocks in AI chat interfaces, infer filenames and paths, and write directly to your project.
- **In-browser execution**: Run shell commands (build, test, lint) from the chat UI and see output inline—ideal for iterative AI-assisted development.
- **Project-aware workflows**: Manage multiple projects with persistent root paths, synced across Chrome sessions.

---

## ✨ Features

- **One-Click Save**: Detect code blocks in AI chat UIs; save to disk with inferred filenames and paths
- **Intelligent Filename Inference**: Extract paths from surrounding context (e.g., "save to `src/main.rs`")
- **Multi-Project Management**: Configure and switch between project roots; enforce containment
- **Shell Script Execution** *(experimental)*: Run shell scripts with live output, configurable timeouts
- **Cross-Browser Ready**: Manifest V3 (Chrome/Edge); architecture supports Firefox ports
- **Security First**: Absolute path validation, canonical containment checks, no shell interpolation
- **Zero Implicit Writes**: In-memory defaults; no config files created without explicit user action

---

## 🚀 Quick Start

### Prerequisites
- **Chrome/Edge** 88+ (Manifest V3 support)
- **Rust** 1.70+ (for building native host)
- **Linux/macOS** (Windows support experimental)

### Installation (5 minutes)

#### 1. Build & Install Native Host
```bash
# Clone repository
git clone https://github.com/yourusername/ai-code-extension.git
cd ai-code-extension

# Build and install (copies binary to ~/.local/bin/, creates native messaging manifest)
./scripts/install.sh
```

**Manual Installation** (if script fails):
```bash
# Build Rust binary
cd native-host
cargo build --release

# Copy binary
mkdir -p ~/.local/bin
cp target/release/ai-code-host ~/.local/bin/

# Create native messaging manifest
mkdir -p ~/.config/google-chrome/NativeMessagingHosts
cat > ~/.config/google-chrome/NativeMessagingHosts/com.aicode.host.json <<EOF
{
  "name": "com.aicode.host",
  "description": "AI Code Integration Native Host",
  "path": "$HOME/.local/bin/ai-code-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
EOF
```

#### 2. Load Extension in Chrome
1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `extension/` directory
5. Copy the **Extension ID** from the card
6. **Update native messaging manifest**: Edit `~/.config/google-chrome/NativeMessagingHosts/com.aicode.host.json` and replace `YOUR_EXTENSION_ID` with the copied ID

#### 3. Verify Installation
1. Click the extension icon in Chrome toolbar
2. Click **"Test Connection"** in popup
3. Should see: `✅ Native host connected`

---

## 📖 Usage

### Save Code Blocks
1. Visit ChatGPT, Claude, or any AI chat interface
2. Hover over a code block → **"💾 Save"** button appears
3. Click save → modal opens with:
   - **Inferred filename** (editable)
   - **Project root** dropdown (if multiple configured)
   - **Preview** of file path
4. Click **"Save"** → file written to disk
5. Success/error toast appears

**Example Flow:**
```
User: "Create a Rust function in src/utils.rs"
AI: [code block]
Extension: Infers filename → src/utils.rs
User: Clicks save → file written to /home/user/project/src/utils.rs
```

### Configure Projects
1. Click extension icon → **"⚙️ Settings"**
2. Add project roots (must be absolute paths):
   ```
   /home/user/my-rust-project
   /home/user/web-app
   ```
3. Select default project
4. Save settings

### Execute Shell Scripts *(experimental)*
1. Detect a shell script block (`.sh`, bash, shell)
2. Click **"▶️ Execute"** button
3. Modal shows:
   - **Timeout** (default 30s, max 300s)
   - **Live output** stream
4. Script runs in temporary file; output captured in real-time

---

## 🏗️ Architecture

```
┌─────────────────┐
│  Web Page (AI)  │
│  Code Blocks    │
└────────┬────────┘
         │ DOM Mutation Observer
         ▼
┌─────────────────┐
│ Content Script  │  Inject UI, detect blocks
│  (content.js)   │
└────────┬────────┘
         │ chrome.runtime.sendMessage
         ▼
┌─────────────────┐
│ Service Worker  │  Route actions, manage state
│ (background.js) │
└────────┬────────┘
         │ chrome.runtime.connectNative
         ▼
┌─────────────────┐
│  Native Host    │  Validate paths, write files, exec scripts
│ (Rust binary)   │  JSON over stdin/stdout
└─────────────────┘
         │
         ▼
    Filesystem
```

**See [ARCHITECTURE.md](./ARCHITECTURE.md)** for detailed component design and protocol specification.

---

## 🔒 Security Model

- **Path Validation**: All paths canonicalized and checked for containment within declared project roots
- **No Shell Interpolation**: Scripts passed via temporary files; no `sh -c` with user input
- **Minimal Permissions**: `activeTab`, `storage`, `nativeMessaging` only
- **No Network Access**: Extension and native host are fully offline
- **Rollback on Failure**: Atomic writes; errors don't leave partial files

---

## 🛠️ Troubleshooting

### "Native host not found" Error
**Cause**: Native messaging manifest misconfigured or binary not in PATH.

**Fix**:
```bash
# Verify binary exists and is executable
ls -l ~/.local/bin/ai-code-host
chmod +x ~/.local/bin/ai-code-host

# Check manifest path (Chrome)
cat ~/.config/google-chrome/NativeMessagingHosts/com.aicode.host.json

# Verify extension ID matches manifest
# In chrome://extensions/, copy Extension ID
# Update "allowed_origins" in manifest: "chrome-extension://EXTENSION_ID/"

# Restart Chrome completely
```

### "Path outside project root" Error
**Cause**: Inferred filename resolves outside configured project roots.

**Fix**:
- Ensure project root is an **absolute path** (e.g., `/home/user/project`, not `~/project`)
- Check for `../` in inferred filename (path traversal rejected)
- Manually edit filename in save modal before saving

### Extension Buttons Not Appearing
**Cause**: Content script didn't inject (CSP restrictions, page load timing).

**Fix**:
- Reload the AI chat page
- Check browser console for errors (`F12` → Console tab)
- Verify site is not in extension's exclusion list

### Script Execution Timeout
**Cause**: Script runs longer than configured timeout (default 30s).

**Fix**:
- Increase timeout in execution modal (max 300s)
- Optimize script (avoid long-running loops, network calls)
- Run script manually in terminal for debugging

---

## 🧪 Development

### Run Tests
```bash
# Rust native host unit tests
cd native-host
cargo test

# Extension tests (manual for now)
# Load extension in chrome://extensions/ with Developer mode
# Open test pages in tests/ directory
```

### Debug Native Host
```bash
# Enable verbose logging (edit main.rs, set ENABLE_FILE_LOG=true)
cargo build --release
cp target/release/ai-code-host ~/.local/bin/

# Send test message via stdin
echo '{"action":"ping"}' | ~/.local/bin/ai-code-host
# Expected output: {"status":"ok","message":"pong"}
```

### Project Structure
```
ai-code-extension/
├── extension/              # Browser extension (Manifest V3)
│   ├── manifest.json       # Extension config, permissions
│   ├── content.js          # DOM injection, UI, detection
│   ├── background.js       # Service worker, native messaging
│   ├── popup.html/js/css   # Extension popup UI
│   └── icons/              # Extension icons
├── native-host/            # Rust native host
│   ├── Cargo.toml          # Dependencies: serde, wait-timeout
│   ├── src/
│   │   └── main.rs         # JSON protocol, file I/O, exec
│   └── tests/              # Unit tests
├── scripts/
│   └── install.sh          # Build + install automation
├── tests/                  # Test HTML pages for extension
├── ARCHITECTURE.md         # Detailed design docs
└── README.md               # This file
```

---

## 🤝 Contributing

Contributions welcome! Please:
1. **Open an issue** to discuss feature/bugfix before coding
2. Follow existing code style (rustfmt, eslint)
3. Add tests for new features
4. Update docs (README, ARCHITECTURE) for user-facing changes

**High-Priority Improvements:**
- Windows support (native messaging manifest, path handling)
- Firefox/Edge ports (WebExtensions API)
- Sandboxing for script execution (bubblewrap, Docker)
- Batch save operations (multiple blocks → single changeset)

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) file.

---

## 🗺️ Roadmap

- [x] One-click save with filename inference
- [x] Multi-project management
- [x] Shell script execution with timeout
- [ ] Windows native messaging support
- [ ] Firefox port (Manifest V2 → V3 migration)
- [ ] Git awareness (dirty workspace warnings, auto-commit hooks)
- [ ] Keyboard shortcuts (quick-save, quick-append)
- [ ] Batch operations (save multiple blocks atomically)
- [ ] Dry-run mode (preview without writing)
- [ ] Open-in-editor integration

---

**Questions? Issues?** Open a GitHub issue or check [ARCHITECTURE.md](./ARCHITECTURE.md) for deep technical details.
