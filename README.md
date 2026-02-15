<!-- README.md -->
# AI Code Assistant

**Version:** 0.4.0

A **browser extension + native host** toolchain that accelerates the flow of AI‑generated code into real projects. Save code blocks directly from Copilot Studio and Power Virtual Agents to your local filesystem with intelligent filename detection, project management, and cross‑device sync.

---

## Features

✨ **Smart Filename Detection** — 7 extraction strategies:
- Markdown fenced block info strings (` ```rust main.rs `)
- Inline file path references (`// src/main.rs`, `# path/to/file.py`)
- Heading‑based context (`### Update config.toml`)
- Language‑based defaults (`untitled.rs`, `untitled.py`, `untitled.js`)
- Manual override in save modal

💾 **Path Memory** — Remembers last‑used directory per project; proposes intelligent defaults for subsequent saves.

☁️ **Chrome Sync Storage** — Projects and preferences sync across devices via `chrome.storage.sync`.

📦 **Export/Import** — Back up and restore project configurations as JSON.

🎯 **Project Management** — CRUD operations for projects in a clean popup UI; switch active projects on the fly.

🔒 **Safe File Operations** — Rust native host validates paths, creates directories automatically, and prevents traversal attacks.

---

## Architecture

```
┌─────────────────────────────────────┐
│  Browser (Chrome/Edge)              │
│  ┌─────────────────────────────┐   │
│  │  Content Script             │   │
│  │  • Detects code blocks      │   │
│  │  • Injects save button      │   │
│  │  • Opens modal UI           │   │
│  └──────────┬──────────────────┘   │
│             │ chrome.runtime       │
│  ┌──────────▼──────────────────┐   │
│  │  Background (Service Worker)│   │
│  │  • Native messaging bridge  │   │
│  └──────────┬──────────────────┘   │
└─────────────┼────────────────────────┘
              │ Native Messaging Protocol
              │ (stdin/stdout, JSON frames)
┌─────────────▼────────────────────────┐
│  Native Host (Rust)                  │
│  • Parses requests (Ping, Save)      │
│  • Validates paths (absolute only)   │
│  • Creates dirs, writes files        │
│  • Returns success/error responses   │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│  Local Filesystem                    │
│  ~/projects/my-project/src/main.rs   │
└──────────────────────────────────────┘
```

**Components:**
- **`extension/`** — Chrome Manifest V3 extension (content.js, background.js, popup.html/js, styles.css)
- **`native-host/`** — Rust binary (`ai-code-host`) implementing Chrome Native Messaging
- **`scripts/`** — Installation (`install.sh`) and diagnostics (`diagnose.sh`)
- **`test/`** — Filename detection test harness (`content-test.html`)

---

## Installation

### Prerequisites
- **Rust** (stable toolchain): [Install Rust](https://rustup.rs/)
- **Chrome or Edge** (native messaging support required)
- **Linux/macOS** (Snap Chromium not supported; see Known Issues)

### Step 1: Install Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### Step 2: Build and Install Native Host
```bash
./scripts/install.sh
```
This script:
1. Builds `native-host` in release mode → `target/release/ccs-host`
2. Copies binary to `~/.local/bin/ccs-host`
3. Registers native messaging manifest:
   - **Chrome:** `~/.config/google-chrome/NativeMessagingHosts/com.ccs.host.json`
   - **Edge:** `~/.config/microsoft-edge/NativeMessagingHosts/com.ccs.host.json`

**Verify installation:**
```bash
which ccs-host
# Should output: /home/youruser/.local/bin/ccs-host
```

### Step 3: Load Chrome Extension
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` directory
5. Note the extension ID (e.g., `abcdefg...`)

### Step 4: Update Native Messaging Manifest (if needed)
If you changed the extension ID, edit:
```bash
~/.config/google-chrome/NativeMessagingHosts/com.ccs.host.json
```
Update the `"allowed_origins"` array:
```json
{
  "name": "com.ccs.host",
  "description": "AI Code Assistant native host",
  "path": "/home/youruser/.local/bin/ccs-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
```

---

## Usage

### Saving Code Blocks
1. **Navigate** to a supported site (Copilot Studio, Power Virtual Agents).
2. **Hover** over a code block → A **Save** button appears in the top-right corner.
3. **Click Save** → Modal opens with:
   - **Project:** Select active project (or create new via popup)
   - **Filename:** Auto-detected (editable)
   - **Full path:** `{project_path}/{filename}`
4. **Confirm** → Code is written to disk; success notification appears.

### Managing Projects
1. Click the **AI Code Assistant** extension icon (popup).
2. **Add Project:**
   - Enter **name** and **absolute path** (e.g., `/home/user/my-project`)
   - Click **Add**; project appears in list
3. **Set Active:**
   - Click the radio button next to a project → It becomes the default save target
4. **Edit/Delete:**
   - Click **Edit** to modify path
   - Click **Delete** to remove (with confirmation)
5. **Export/Import:**
   - **Export All** → Downloads `projects-backup.json`
   - **Import** → Upload JSON to restore projects

### Filename Detection Strategies (Priority Order)
1. **Fenced block info string:** ` ```rust src/main.rs `
2. **Inline comment:** `// src/config.rs` or `# lib/utils.py`
3. **Heading context:** `### Update backend/api.ts`
4. **Clipboard heuristic:** Pasted text containing file paths
5. **Language extension:** `untitled.rs`, `untitled.py`, `untitled.js`
6. **Generic fallback:** `untitled.txt`
7. **Manual override:** Edit in the save modal

---

## Configuration

**Storage:** All project data persists in `chrome.storage.sync` (syncs across signed-in Chrome instances).

**No local config file** (removed in v0.4.0; see Migration Notes).

**Permissions (manifest.json):**
- `activeTab` — Access current tab for code block detection
- `storage` — Persist projects and preferences
- `nativeMessaging` — Communicate with Rust host

**Supported Sites (content_scripts matches):**
- `https://copilotstudio.microsoft.com/*`
- `https://powerva.microsoft.com/*`

---

## Known Issues

### Snap Chromium Not Supported
**Problem:** Snap-packaged Chromium cannot access `~/.config` for native messaging manifests.

**Solution:**
- Install Chrome/Edge via `.deb` package (Ubuntu/Debian):
  ```bash
  wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo dpkg -i google-chrome-stable_current_amd64.deb
  ```
- Or use a non-Snap browser build.

---

## Migration Notes

### Upgrading from v0.3.x to v0.4.0

**Breaking Change:** Removed `~/.config/ai-code-assistant/projects.toml`.

**Action Required:**
1. **Export** your projects from v0.3.x (if available):
   - Open popup → **Export All** → Save `projects-backup.json`
2. **Upgrade** extension and native host:
   ```bash
   git pull
   ./scripts/install.sh
   ```
3. **Import** projects:
   - Open popup → **Import** → Select `projects-backup.json`

**Why?** Chrome storage provides:
- Cross-device sync
- No filesystem dependencies
- Better UX for add-ons in sandboxed environments

---

## Development

### Running Tests
**Filename Detection Test Harness:**
```bash
open test/content-test.html
```
- Verify detection strategies against sample code blocks.

### Diagnostics
```bash
./scripts/diagnose.sh
```
Checks:
- Rust installation
- Native host binary location
- Native messaging manifest registration
- Extension load status

### Project Structure
```
.
├── extension/
│   ├── manifest.json       # Manifest V3 config
│   ├── content.js          # Injects save button, detects filenames
│   ├── background.js       # Native messaging bridge
│   ├── popup.html          # Project management UI
│   ├── popup.js            # CRUD logic for projects
│   └── styles.css          # Modal and popup styles
├── native-host/
│   ├── Cargo.toml          # Rust dependencies (serde, serde_json)
│   └── src/
│       └── main.rs         # Native messaging protocol handler
├── scripts/
│   ├── install.sh          # Build and install native host
│   └── diagnose.sh         # System diagnostic checks
├── test/
│   └── content-test.html   # Filename detection test page
└── README.md               # This file
```

### Building Manually
```bash
cd native-host
cargo build --release
# Binary: target/release/ccs-host
```

### Debugging Native Host
**Enable logging** (optional):
```rust
// In native-host/src/main.rs, add:
eprintln!("Received request: {:?}", request);
```
Stderr logs appear in:
```bash
journalctl --user -u chrome  # systemd
~/.xsession-errors            # X11
```

---

## Future Enhancements

Planned features (not yet implemented):
- ⌨️ **Keyboard Shortcuts** — Quick-save, quick-append, quick-open-in-editor
- 🔧 **Editor Integration** — Configurable "open in editor" command after save
- 🌿 **Git Awareness** — Warn on dirty workspace, branch hints, optional auto-commit
- 📦 **Batch Operations** — Save multiple blocks atomically as a change set
- 🔍 **Dry-Run Mode** — Preview writes without touching disk
- 🏪 **Chrome Web Store** — One-click installation

**Contributions welcome!** Open an issue or PR on GitHub.

---

## License

*(Add your license here, e.g., MIT, Apache-2.0)*

---

## Support

**Issues?** Run diagnostics first:
```bash
./scripts/diagnose.sh
```

**Questions?** Open an issue or contact the maintainer.

---

**Version:** 0.4.0  
**Last Updated:** 2026-02-15
