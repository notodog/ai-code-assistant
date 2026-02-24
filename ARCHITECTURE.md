# AI Code Assistant: Complete Architecture & Flow Documentation

**Version:** 0.4.0
**Date:** February 15, 2026  
**Purpose:** Comprehensive technical reference for developers maintaining and extending the AI Code Assistant browser extension + Rust native host toolchain.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Structure](#2-project-structure)
3. [Architecture Overview](#3-architecture-overview)
4. [Component Breakdown](#4-component-breakdown)
5. [Communication Protocol](#5-communication-protocol)
6. [Key Features](#6-key-features)
7. [Security Model](#7-security-model)
8. [Build & Installation](#8-build--installation)
9. [Testing & Diagnostics](#9-testing--diagnostics)
10. [Future Enhancements](#10-future-enhancements)

---

## 1. Executive Summary

**AI Code Assistant** accelerates the flow of AI-generated code from browser-based chat interfaces (ChatGPT, Claude, Gemini, etc.) into real development projects. It provides:

- **One-click save**: Inject save buttons into code blocks on AI chat pages
- **Smart filename detection**: 7 strategies to infer filenames from context
- **Project management**: Multi-project workspace with Chrome Sync storage
- **Shell script execution**: Detect and execute bash scripts directly from chat, with live output capture
- **Safe file operations**: Rust native host enforces path validation and containment

**Technology Stack:**
- **Frontend:** Chrome Extension (Manifest V3)
- **Backend:** Rust native messaging host
- **Storage:** Chrome Storage Sync API
- **Protocol:** JSON over stdin/stdout

**Supported Platforms:** Chrome, Edge (Linux/macOS; Snap Chromium unsupported)

---

## 2. Project Structure

```
ai-code-assistant/
├── extension/
│   ├── manifest.json          # Extension config (permissions, scripts, background)
│   ├── content.js             # Injected into AI chat pages; handles UI + detection
│   ├── background.js          # Service worker; routes messages to native host
│   ├── popup.html             # Extension popup UI
│   ├── popup.js               # Project management logic
│   └── styles.css             # Modal and button styles
├── native-host/
│   ├── Cargo.toml             # Rust dependencies (serde, serde_json)
│   └── src/
│       └── main.rs            # Native messaging host; handles Save/Ping actions
├── scripts/
│   ├── install.sh             # Builds Rust binary, installs manifest
│   └── diagnose.sh            # Validates installation and paths
└── test/
    └── content-test.html      # Local test harness for content script
```

**Installation Paths (Linux/macOS):**
- Binary: `~/.local/bin/ai-code-host`
- Native manifest: `~/.config/google-chrome/NativeMessagingHosts/com.aicode.host.json`

---

## 3. Architecture Overview

### 3.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (AI Chat Page)                                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Content Script (content.js)                                  │  │
│  │  • Observes DOM for <pre> blocks                              │  │
│  │  • Injects Save/Exec buttons                                  │  │
│  │  • Detects filenames (7 strategies)                           │  │
│  │  • Opens Save/Exec modal                                      │  │
│  └────────────────┬──────────────────────────────────────────────┘  │
│                   │ chrome.runtime.sendMessage()                    │
│  ┌────────────────▼──────────────────────────────────────────────┐  │
│  │  Background Service Worker (background.js)                    │  │
│  │  • Routes messages to native host                             │  │
│  │  • Handles chrome.runtime.sendNativeMessage()                 │  │
│  └────────────────┬──────────────────────────────────────────────┘  │
└───────────────────┼─────────────────────────────────────────────────┘
                    │ JSON over stdin/stdout
┌───────────────────▼──────────────────────────────────────────────┐
│  Native Host (Rust: ai-code-host)                                │
│  • Validates paths (absolute, canonical, inside project root)    │
│  • Creates directories                                           │
│  • Writes files                                                  │
│  • Executes shell scripts (planned)                              │
└──────────────────────────────────────────────────────────────────┘
                    │
                    ▼
          ┌─────────────────┐
          │   Filesystem    │
          └─────────────────┘
```

### 3.2 Save Flow

```
User clicks "💾 Save" → content.js opens modal
  ↓
User confirms (project + path) → sendMessage to background
  ↓
background.js → chrome.runtime.sendNativeMessage("com.aicode.host", {
  action: "save",
  path: "/absolute/path/to/file.js",
  content: "...",
  project_root: "/absolute/path/to/project"
})
  ↓
Rust host validates path → creates dirs → writes file
  ↓
Response: { success: true } or { success: false, error: "..." }
  ↓
content.js shows success/error alert
```

### 3.3 Exec Flow (Shell Scripts)

```
User sees code block with .sh extension or shebang → content.js injects "▶️ Exec"
  ↓
User clicks "▶️ Exec" → content.js opens Exec Modal
  ↓
User selects project, workdir, timeout → clicks "Execute"
  ↓
sendMessage to background → sendNativeMessage({
  action: "execute",
  code: "#!/bin/bash\necho 'hello'",
  working_dir: "/absolute/path/to/workdir",
  timeout_secs: 30
})
  ↓
Rust host (PLANNED) → spawns shell process → captures stdout/stderr → enforces timeout
  ↓
Response: { success: true, stdout: "hello\n", stderr: "", exit_code: 0 }
  ↓
Modal displays output in real-time (stdout green, stderr red, status indicator)
```

---

## 4. Component Breakdown

### 4.1 Extension: `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "AI Code Assistant",
  "version": "0.4.0",
  "permissions": [
    "activeTab",
    "storage",
    "nativeMessaging"
  ],
  "host_permissions": [
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": [
      "https://chat.openai.com/*",
      "https://claude.ai/*",
      "https://gemini.google.com/*"
    ],
    "js": ["content.js"],
    "css": ["styles.css"]
  }],
  "action": {
    "default_popup": "popup.html"
  }
}
```

**Key Points:**
- **Manifest V3:** Uses `service_worker` instead of persistent background page
- **Permissions:**
  - `activeTab`: Access current tab content
  - `storage`: Chrome Storage Sync for projects
  - `nativeMessaging`: Communicate with Rust host
- **Content scripts:** Auto-injected on AI chat domains

---

### 4.2 Extension: `content.js`

**Responsibilities:**
1. **Observe DOM** for new `<pre>` blocks (code blocks from AI responses)
2. **Inject UI buttons** (Save or Exec, depending on content type)
3. **Detect filenames** using 7 strategies
4. **Open modals** (Save or Exec)
5. **Send messages** to background script

#### 4.2.1 Filename Detection Strategies (Priority Order)

| # | Strategy | Example |
|---|----------|---------|
| 1 | **Explicit label** | `# filename: app.js` or `// File: app.js` |
| 2 | **Markdown header** | `## app.js` above code block |
| 3 | **Code fence language** | <code>\`\`\`javascript:app.js</code> |
| 4 | **Comment first line** | `// app.js` or `/* app.js */` |
| 5 | **Previous text** | "Save this as `app.js`:" before block |
| 6 | **Extension from language** | Language "python" → `.py` |
| 7 | **Path memory** | Last-used path for this project |

#### 4.2.2 Shell Script Detection

```js
function isShellScript(code, ext) {
  if (ext === 'sh') return true;
  const shebangRegex = /^#!\s*\/(?:usr\/)?bin\/(ba)?sh/;
  return shebangRegex.test(code.trim());
}
```

**Logic:**
- If detected extension is `sh`, or
- Code starts with `#!/bin/bash` or `#!/bin/sh`
→ Inject **Exec button** (`▶️`) instead of Save button

#### 4.2.3 Save Modal Structure

```html
<div id="aic-modal-overlay">
  <div id="aic-modal">
    <h2>💾 Save Code</h2>
    <label>
      Project:
      <select id="aic-project">
        <!-- Populated from chrome.storage.sync -->
      </select>
    </label>
    <label>
      Save to:
      <input id="aic-path" type="text" value="/detected/path.js">
    </label>
    <div id="aic-preview">
      <!-- First 10 lines + "... (X more lines)" -->
    </div>
    <button id="aic-save">Save</button>
    <button id="aic-cancel">Cancel</button>
  </div>
</div>
```

**Behavior:**
- Pre-populates project (default) and path (detected filename)
- When project changes → auto-updates path with project root
- On save → validates, sends message, shows spinner "⏳ Saving…"
- Success → "✅ Saved!" (fades after 2s)
- Error → "❌ Failed: [reason]" with retry option

#### 4.2.4 Exec Modal Structure

```html
<div id="aic-exec-modal-overlay">
  <div id="aic-exec-modal">
    <h2>▶️ Execute Shell Script</h2>
    <label>
      Project:
      <select id="aic-exec-project">
        <!-- Populated from chrome.storage.sync -->
      </select>
    </label>
    <label>
      Working Directory:
      <input id="aic-exec-workdir" type="text" value="/path/to/workdir">
    </label>
    <label>
      Timeout (seconds):
      <input id="aic-exec-timeout" type="number" value="30">
    </label>
    <div id="aic-exec-script-preview">
      <strong>Script Preview:</strong>
      <pre><!-- First 500 chars --></pre>
      <small>(X lines total)</small>
    </div>
    <button id="aic-execute">Execute</button>
    <button id="aic-cancel">Cancel</button>
    <div id="aic-exec-output" style="display:none;">
      <h3>Output</h3>
      <pre id="aic-stdout" class="output-success"></pre>
      <pre id="aic-stderr" class="output-error"></pre>
      <div id="aic-status"></div>
    </div>
  </div>
</div>
```

**Behavior:**
- Pre-populates project, workdir (project root), timeout (30s)
- When project changes → auto-updates workdir
- On execute:
  1. Disable button, show "⏳ Executing…"
  2. Send message: `{ action: 'execute', code, workdir, timeout }`
  3. Display stdout (green), stderr (red), exit code
  4. Success → "✅ Completed (exit 0)"
  5. Error → "❌ Failed (exit N)" with stderr and retry option
- ESC or overlay click closes modal

## 4.2.5 Enhanced Exec Modal with Copy-to-Reply

The execute modal now includes a **Copy to Reply** feature that allows users to seamlessly insert execution results into AI chat conversations.

### Execution Flow with Copy-to-Reply

```
User clicks Execute → Script runs → Output displayed → Copy-to-Reply button appears
                                                         ↓
                                    User clicks "Copy to Reply"
                                                         ↓
                        Platform detection (ChatGPT/Claude/Gemini)
                                                         ↓
                           Insert formatted output into chat input
                                                         ↓
                    Success toast OR fallback to clipboard copy
```

### Copy-to-Reply Implementation Details

**Platform Detection:**
- ChatGPT: `#prompt-textarea` or `textarea[data-id="prompt-textarea"]`
- Claude: `div[contenteditable="true"]` with ProseMirror
- Gemini: `rich-textarea .ql-editor` or `.input-area textarea`

**Output Format:**
```
Command executed: [first line of script]...
Working directory: /path/to/project
Exit code: 0

--- Output ---
[stdout content]

--- Errors ---
[stderr content if any]
```

**Security Considerations:**
- Output is sanitized before insertion
- Clipboard API used with proper permissions
- Fallback to legacy clipboard methods if needed

**User Experience:**
- Toast notifications for success/failure
- Automatic cursor positioning at end of text
- Modal closes after successful copy
- Retry button for failed executions

### Enhanced Modal Behavior

**Pre-execution:**
- Modal shows project selector, workdir display, timeout input
- Script preview shows first 500 chars with line count
- Execute button enabled, keyboard shortcuts active (Enter to execute, ESC to close)

**During execution:**
- Execute button disabled, shows "⏳ Executing..."
- Message sent: `{ action: 'execute', command: code, working_dir: workdir, timeout_secs: timeout }`

**Post-execution:**
- Output section appears with stdout (green) and stderr (red)
- Status shows exit code with appropriate icon
- **NEW: Copy-to-Reply and Retry buttons appear**

**Copy-to-Reply action:**
- Formats execution results into markdown code block
- Detects AI platform (ChatGPT/Claude/Gemini)
- Inserts into appropriate text input
- Falls back to clipboard if insertion fails
- Shows toast notification
- Closes modal on success

### JavaScript Implementation Reference

The copy-to-reply feature is implemented through these key functions:

- `insertExecutionResultToChat(executionResult)` - Main orchestrator
- `formatExecutionOutput(result)` - Formats output as markdown
- `detectAIPlatform()` - Identifies ChatGPT/Claude/Gemini
- `insertIntoTextArea(platform, text)` - Platform-specific insertion
- `copyToClipboard(text)` - Fallback clipboard handler
- `showToast(message)` - User feedback notifications

### Modal HTML Structure

```html
<div id="aic-exec-output">
  <h4>Output:</h4>
  <pre id="aic-stdout" class="aic-stdout"></pre>
  <pre id="aic-stderr" class="aic-stderr"></pre>
  <div id="aic-status" class="aic-status"></div>
  
  <!-- NEW: Copy to Reply Section -->
  <div id="aic-copy-reply">
    <button id="aic-copy-to-reply" class="aic-modal-btn primary">
      📋 Copy to Reply
    </button>
    <button id="aic-retry" class="aic-modal-btn secondary">
      🔄 Retry
    </button>
  </div>
</div>
```

### Testing Checklist

1. **Build and install:**
   ```bash
   cd rust && cargo build --release
   ./scripts/install.sh
   # Load extension in Chrome
   ```

2. **Test execution flow:**
   - Click exec button on shell script
   - Verify modal shows correct project/workdir
   - Execute a simple command (e.g., `echo "test"`)
   - Confirm output displays correctly

3. **Test copy-to-reply:**
   - After execution, click "Copy to Reply"
   - Verify text inserted into AI chat input
   - Test on ChatGPT, Claude, and Gemini
   - Test clipboard fallback by blocking textarea access

4. **Test error handling:**
   - Execute script that fails
   - Verify stderr shown in red
   - Test retry button functionality
   - Test timeout enforcement

5. **Test keyboard shortcuts:**
   - ESC to close modal
   - Enter to execute (when button enabled
---

### 4.3 Extension: `background.js`

**Single Responsibility:** Route messages from content script to native host.

```js
// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'save' || request.action === 'execute' || request.action === 'ping') {
    chrome.runtime.sendNativeMessage(
      'com.aicode.host',
      request,
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      }
    );
    return true; // Async response
  }
});
```

**Key Points:**
- Listens for `save`, `execute`, `ping` actions
- Forwards to native host via `chrome.runtime.sendNativeMessage`
- Returns response or error to content script

---

### 4.4 Extension: `popup.js`

**Responsibilities:**
1. **CRUD operations** for projects (Create, Read, Update, Delete)
2. **Storage:** Uses `chrome.storage.sync` (syncs across devices)
3. **Export/Import:** Download/upload JSON config

#### 4.4.1 Project Schema

```json
{
  "projects": [
    {
      "id": "proj-1234567890",
      "name": "My App",
      "root": "/home/user/projects/my-app",
      "isDefault": true
    }
  ]
}
```

#### 4.4.2 Key Functions

- `loadProjects()`: Fetch from `chrome.storage.sync`
- `saveProjects(projects)`: Persist to storage
- `addProject(name, root)`: Generate unique ID, set as default if first
- `deleteProject(id)`: Remove, reassign default if needed
- `exportConfig()`: Download JSON file
- `importConfig(file)`: Upload JSON, validate schema, merge/replace

---

### 4.5 Native Host: `main.rs`

**Location:** `native-host/src/main.rs`

#### 4.5.1 Entry Point

```rust
// native-host/src/main.rs
use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::fs;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "lowercase")]
enum Request {
    Ping,
    Save {
        path: String,
        content: String,
        project_root: String,
    },
    // Execute not yet implemented
}

#[derive(Serialize)]
struct Response {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stdout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stderr: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exit_code: Option<i32>,
}

fn main() {
    loop {
        let request = read_request();
        let response = handle_request(request);
        write_response(response);
    }
}
```

#### 4.5.2 Request Handling

```rust
fn handle_request(req: Request) -> Response {
    match req {
        Request::Ping => Response { success: true, error: None, stdout: None, stderr: None, exit_code: None },
        Request::Save { path, content, project_root } => {
            match save_file(&path, &content, &project_root) {
                Ok(_) => Response { success: true, error: None, stdout: None, stderr: None, exit_code: None },
                Err(e) => Response { success: false, error: Some(e), stdout: None, stderr: None, exit_code: None },
            }
        }
    }
}
```

#### 4.5.3 Path Validation

**Security Requirements:**
1. **Absolute paths only** (reject relative paths like `../file.js`)
2. **Canonical resolution** (resolve symlinks, normalize)
3. **Containment check** (ensure path is inside `project_root`)

```rust
fn save_file(path: &str, content: &str, project_root: &str) -> Result<(), String> {
    let path_buf = PathBuf::from(path);
    let root_buf = PathBuf::from(project_root);

    // 1. Reject relative paths
    if !path_buf.is_absolute() {
        return Err("Path must be absolute".to_string());
    }

    // 2. Canonicalize root (must exist)
    let canonical_root = root_buf.canonicalize()
        .map_err(|_| "Project root does not exist or is inaccessible".to_string())?;

    // 3. Ensure parent dir exists or create it
    if let Some(parent) = path_buf.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
    }

    // 4. Write file
    fs::write(&path_buf, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // 5. Canonicalize written path and check containment
    let canonical_path = path_buf.canonicalize()
        .map_err(|e| format!("Failed to resolve written path: {}", e))?;

    if !canonical_path.starts_with(&canonical_root) {
        // Rollback: delete the file
        let _ = fs::remove_file(&path_buf);
        return Err("Path is outside project root (traversal attempt)".to_string());
    }

    Ok(())
}
```

**Why This Order?**
- Create dirs **before** canonicalizing the target path (path doesn't exist yet)
- Write file **before** final containment check (so we can canonicalize it)
- Rollback if containment check fails (delete the file)

---

## 5. Communication Protocol

### 5.1 Message Format

**Transport:** JSON over stdin/stdout (native messaging protocol)

**Frame Structure (managed by Chrome):**
```
[4-byte length (little-endian)][JSON payload]
```

**Application Layer (our protocol):**

#### 5.1.1 Ping

**Request:**
```json
{
  "action": "ping"
}
```

**Response:**
```json
{
  "success": true
}
```

#### 5.1.2 Save

**Request:**
```json
{
  "action": "save",
  "path": "/home/user/projects/my-app/src/app.js",
  "content": "console.log('Hello, world!');",
  "project_root": "/home/user/projects/my-app"
}
```

**Response (Success):**
```json
{
  "success": true
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Path is outside project root (traversal attempt)"
}
```

#### 5.1.3 Execute (Planned)

**Request:**
```json
{
  "action": "execute",
  "code": "#!/bin/bash\necho 'Hello from shell'\nls -la",
  "working_dir": "/home/user/projects/my-app",
  "timeout_secs": 30
}
```

**Response (Success):**
```json
{
  "success": true,
  "stdout": "Hello from shell\ntotal 24\ndrwxr-xr-x  3 user user 4096 ...",
  "stderr": "",
  "exit_code": 0
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Execution timed out after 30 seconds",
  "stdout": "Hello from shell\n",
  "stderr": "",
  "exit_code": null
}
```

**Response (Non-zero Exit):**
```json
{
  "success": false,
  "stdout": "",
  "stderr": "bash: command not found: invalid_cmd\n",
  "exit_code": 127
}
```

---

## 6. Key Features

### 6.1 Smart Filename Detection

**Problem:** AI chat interfaces don't always provide structured metadata for generated code.

**Solution:** 7-strategy heuristic cascade (see §4.2.1)

**UX:**
- Auto-populate filename in Save modal
- User can override before saving
- Path memory per project

---

### 6.2 Project Management

**Features:**
- Multiple projects with unique IDs
- Default project (pre-selected in modals)
- Sync across devices via Chrome Storage Sync
- Export/Import for backup and sharing

**Storage Schema:**
```json
{
  "projects": [
    { "id": "proj-123", "name": "Frontend", "root": "/home/user/frontend", "isDefault": true },
    { "id": "proj-456", "name": "Backend", "root": "/home/user/backend", "isDefault": false }
  ]
}
```

---

### 6.3 Shell Script Execution

**Status:** ⚠️ **Frontend complete, Rust implementation pending**

#### 6.3.1 Detection Logic

```js
function isShellScript(code, ext) {
  if (ext === 'sh') return true;
  const shebangRegex = /^#!\s*\/(?:usr\/)?bin\/(ba)?sh/;
  return shebangRegex.test(code.trim());
}
```

#### 6.3.2 UI Flow

1. **Detect shell script** → Inject "▶️ Exec" button instead of "💾 Save"
2. **User clicks Exec** → Open Exec Modal with:
   - Project selector (updates workdir automatically)
   - Working directory input (editable)
   - Timeout input (default 30s)
   - Script preview (first 500 chars + line count)
3. **User clicks Execute**:
   - Disable button, show "⏳ Executing…"
   - Send message to background → native host
   - Display live output in modal
4. **Results:**
   - Stdout (green text)
   - Stderr (red text)
   - Exit code and status indicator
   - Retry button on error

#### 6.3.3 Rust Implementation (TODO)

**Required additions to `main.rs`:**

```rust
use std::process::{Command, Stdio};
use std::time::Duration;
use std::thread;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "lowercase")]
enum Request {
    Ping,
    Save { /* ... */ },
    Execute {
        code: String,
        workdir: String,
        timeout: u64,
    },
}

fn handle_execute(code: &str, workdir: &str, timeout_secs: u64) -> Response {
    // 1. Validate workdir is absolute and exists
    let workdir_path = PathBuf::from(workdir);
    if !workdir_path.is_absolute() || !workdir_path.exists() {
        return Response {
            success: false,
            error: Some("Invalid working directory".to_string()),
            stdout: None,
            stderr: None,
            exit_code: None,
        };
    }

    // 2. Write script to temp file
    let script_path = "/tmp/aic-exec.sh"; // Consider using tempfile crate
    if let Err(e) = fs::write(script_path, code) {
        return Response {
            success: false,
            error: Some(format!("Failed to write script: {}", e)),
            stdout: None,
            stderr: None,
            exit_code: None,
        };
    }

    // 3. Spawn bash with timeout
    let output = Command::new("bash")
        .arg(script_path)
        .current_dir(workdir_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    // TODO: Implement timeout enforcement (use std::thread or tokio)

    // 4. Parse output
    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code();
            let success = output.status.success();

            Response {
                success,
                error: if success { None } else { Some("Script exited with error".to_string()) },
                stdout: Some(stdout),
                stderr: Some(stderr),
                exit_code,
            }
        }
        Err(e) => Response {
            success: false,
            error: Some(format!("Failed to execute: {}", e)),
            stdout: None,
            stderr: None,
            exit_code: None,
        },
    }
}
```

**Dependencies to add to `Cargo.toml`:**
```toml
[dependencies]
tempfile = "3"  # For secure temp files
```

---

## 7. Security Model

### 7.1 Threat Model

**Assumptions:**
- User trusts AI-generated code they explicitly choose to save/execute
- Extension has access to current tab only (`activeTab`)
- Native host runs with user's filesystem permissions

**Risks:**
1. **Path traversal:** Malicious AI suggests `../../../../etc/passwd` as save path
2. **Code injection:** Malicious script escapes shell or modifies system
3. **Data exfiltration:** Script reads sensitive files and sends to attacker
4. **Denial of service:** Infinite loop or fork bomb

### 7.2 Mitigations

#### 7.2.1 Path Validation (Save Action)

✅ **Implemented:**
- Reject relative paths (`../`, `./`)
- Canonicalize paths (resolve symlinks)
- Enforce containment within `project_root`
- Rollback on containment violation

#### 7.2.2 Command Execution (Execute Action)

⚠️ **Planned:**

| Control | Implementation |
|---------|----------------|
| **Workdir validation** | Absolute path, exists, inside project root |
| **Timeout enforcement** | Kill process after timeout (default 30s) |
| **Resource limits** | Use `ulimit` or cgroups (future) |
| **No shell interpolation** | Pass script via file, not `-c` with untrusted string |
| **Sandboxing** | Consider `bubblewrap` or Docker (future) |
| **User confirmation** | Exec modal shows script preview before execution |

**Example timeout enforcement (Rust):**
```rust
use std::sync::mpsc;

fn execute_with_timeout(cmd: Command, timeout: Duration) -> io::Result<Output> {
    let (tx, rx) = mpsc::channel();
    let handle = thread::spawn(move || {
        let output = cmd.output();
        tx.send(output).ok();
    });

    match rx.recv_timeout(timeout) {
        Ok(result) => result,
        Err(_) => {
            // Timeout: kill process (requires storing child PID)
            Err(io::Error::new(io::ErrorKind::TimedOut, "Execution timed out"))
        }
    }
}
```

#### 7.2.3 Extension Permissions

✅ **Minimal scope:**
- `activeTab`: Only current tab, not all tabs
- `storage`: Sync API only (no local file access)
- `nativeMessaging`: Explicit user install of native host

#### 7.2.4 Native Messaging Security

✅ **Chrome enforces:**
- Native host manifest must be in system location
- Binary path must be absolute
- Communication only via stdin/stdout (no network)

---

## 8. Build & Installation

### 8.1 Prerequisites

- **Rust:** `rustc` 1.70+ and `cargo`
- **Browser:** Chrome or Edge (Linux/macOS)
- **Git:** For cloning repository

### 8.2 Build Steps

#### 8.2.1 Build Rust Native Host

```bash
cd native-host
cargo build --release
```

**Output:** `target/release/ai-code-host`

#### 8.2.2 Install Native Host

```bash
# Copy binary to user bin
mkdir -p ~/.local/bin
cp target/release/ai-code-host ~/.local/bin/
chmod +x ~/.local/bin/ai-code-host

# Create native messaging manifest
mkdir -p ~/.config/google-chrome/NativeMessagingHosts
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

**Note:** Replace `YOUR_EXTENSION_ID` after loading extension in Chrome.

#### 8.2.3 Load Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/` directory
5. Copy the **Extension ID** from the card
6. Update `com.aicode.host.json` with the ID
7. Reload the extension

### 8.3 Automated Install

Use the provided script:

```bash
./scripts/install.sh
```

**What it does:**
1. Builds Rust binary (`cargo build --release`)
2. Copies to `~/.local/bin/`
3. Creates native messaging manifest
4. Prompts for extension ID
5. Validates installation

### 8.4 Diagnostics

```bash
./scripts/diagnose.sh
```

**Checks:**
- Binary exists and is executable
- Native manifest exists and is valid JSON
- Extension ID is populated
- Paths are absolute
- Test ping request

---

## 9. Testing & Diagnostics

### 9.1 Unit Tests (Rust)

**TODO:** Add tests for:
- Path validation (reject `../`, enforce containment)
- JSON parsing (malformed requests)
- Save success/failure cases

**Example:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reject_relative_path() {
        let result = save_file("../etc/passwd", "content", "/home/user/project");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("absolute"));
    }

    #[test]
    fn test_reject_traversal() {
        let result = save_file("/tmp/outside.txt", "content", "/home/user/project");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("outside project root"));
    }
}
```

Run tests:
```bash
cd native-host
cargo test
```

### 9.2 Integration Tests (Extension)

**Local test harness:** `test/content-test.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Content Script Test</title>
  <script src="../extension/content.js"></script>
</head>
<body>
  <h1>Test Code Blocks</h1>
  
  <!-- Test 1: JavaScript with filename -->
  <h2>app.js</h2>
  <pre><code class="language-javascript">console.log('Hello');</code></pre>
  
  <!-- Test 2: Shell script with shebang -->
  <pre><code>#!/bin/bash
echo "Test"</code></pre>
  
  <!-- Test 3: Python with comment -->
  <pre><code class="language-python"># main.py
print('Hello')</code></pre>
</body>
</html>
```

**Manual test:**
1. Open `test/content-test.html` in Chrome
2. Verify buttons appear (💾 for JS/Python, ▶️ for bash)
3. Click buttons and verify modals open
4. Test save/exec flows

### 9.3 End-to-End Test

1. Open ChatGPT/Claude
2. Ask: "Write a Python hello world script"
3. Verify:
   - Save button appears
   - Filename detected correctly
   - Modal pre-populates project and path
   - Save succeeds and file appears on disk
4. Ask: "Write a bash script to list files"
5. Verify:
   - Exec button appears (not Save)
   - Modal opens with script preview
   - Execute runs and shows output
   - Stdout/stderr displayed correctly

---

## 10. Future Enhancements

### 10.1 High Priority

- [x] **Complete Execute action in Rust**
  - Spawn process with timeout
  - Capture stdout/stderr
  - Add workdir validation
  - Resource limits (ulimit)

- [ ] **Path intelligence**
  - Learn filename patterns per project
  - Suggest based on existing structure
  - Language-specific conventions

- [ ] **Batch operations**
  - Select multiple code blocks
  - Preview as change set
  - Atomic save (all or nothing)

### 10.2 Medium Priority

- [ ] **Keyboard shortcuts**
  - Quick-save: `Ctrl+S` on hovered block
  - Quick-exec: `Ctrl+Enter` for shell scripts
  - Navigate projects: `Alt+1`, `Alt+2`

- [ ] **Editor integration**
  - "Open in VS Code" button after save
  - Configurable editor command in popup
  - Jump to line number

- [ ] **Git awareness (opt-in)**
  - Warn if workdir is dirty
  - Show current branch in project selector
  - Optional auto-add after save
  - Optional commit with AI-generated message

### 10.3 Long Term

- [ ] **Diff preview**
  - Show side-by-side diff if file exists
  - "Append" vs "Overwrite" choice
  - Smart merge for incremental changes

- [ ] **Sandboxing for Execute**
  - Docker container execution
  - Bubblewrap/Firejail integration
  - Network isolation toggle

- [ ] **Multi-language execution**
  - Detect Python scripts (`#!/usr/bin/env python3`)
  - Node.js script execution
  - Configurable interpreters per project

- [ ] **Cloud sync (optional)**
  - Sync projects across non-Chrome browsers
  - Encrypted backup to user's cloud storage

- [ ] **AI-assisted path correction**
  - Suggest fixes for invalid paths
  - Auto-create nested dirs with confirmation

---

## Appendices

### A. Dependencies

#### Extension
- **None** (vanilla JavaScript)

#### Rust Native Host
```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
# Future:
# tempfile = "3"  # For execute action
```

### B. File Paths Reference

| Component | Path |
|-----------|------|
| Extension manifest | `extension/manifest.json` |
| Content script | `extension/content.js` |
| Background worker | `extension/background.js` |
| Popup UI | `extension/popup.html`, `extension/popup.js` |
| Rust source | `native-host/src/main.rs` |
| Rust config | `native-host/Cargo.toml` |
| Install script | `scripts/install.sh` |
| Diagnostics | `scripts/diagnose.sh` |
| Binary (post-install) | `~/.local/bin/ai-code-host` |
| Native manifest | `~/.config/google-chrome/NativeMessagingHosts/com.aicode.host.json` |

### C. Chrome APIs Used

| API | Purpose |
|-----|---------|
| `chrome.runtime.sendMessage()` | Content → Background |
| `chrome.runtime.sendNativeMessage()` | Background → Native Host |
| `chrome.storage.sync` | Persist projects (synced across devices) |
| `chrome.runtime.onMessage` | Listen for messages in background |

### D. Known Limitations

1. **Snap Chromium:** Native messaging broken due to sandboxing
   - **Workaround:** Use `.deb` package or Flatpak with proper permissions
2. **Windows:** Not yet supported (path validation assumes Unix)
3. **Execute timeout:** Not yet enforced (process may run indefinitely)
4. **No undo:** File writes and executions are immediate and irreversible
5. **Large files:** No streaming; entire content held in memory

---

## Summary Checklist for Future Developers

When modifying this project, ensure you understand:

- ✅ **Architecture:** Browser → Content → Background → Native Host → FS
- ✅ **Protocol:** JSON over stdin/stdout, handled by Chrome native messaging
- ✅ **Security:** Path validation (absolute, canonical, contained)
- ✅ **Extension:** Manifest V3, service worker, content scripts, storage API
- ✅ **Rust:** Serde for JSON, path validation, file I/O
- ✅ **Exec Flow:** Detection (shebang/ext) → Modal → Native Host (TODO)
- ✅ **Install:** Build Rust, copy binary, create manifest, load extension
- ✅ **Test:** Unit (Rust), integration (HTML harness), E2E (live chat)

**Questions or need to extend a feature?**
1. Check this doc for the component's location and responsibilities
2. Review the protocol schema (§5)
3. Add tests before changing core logic (§9)
4. Update this doc with your changes

---

**End of Documentation**
