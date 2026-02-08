# Copilot Code Saver

A Chrome/Chromium browser extension that saves code blocks from AI assistants (like Microsoft Copilot Studio) directly to your project files — no more copy-paste hell.

## 🎯 Problem Solved

When using web-based AI coding assistants without API access, developers face a tedious workflow:
1. Copy code from browser
2. Switch to terminal/editor
3. Paste and save to file
4. Repeat dozens of times per session

**Copilot Code Saver** adds a "Save" button to every code block, letting you save directly to your project directory with smart filename detection.

## ✨ Features

- **One-click save** — Save button on every code block
- **Smart filename detection** — Parses surrounding context for filename hints
- **Multi-project support** — Configure multiple projects, switch between them
- **Direct filesystem writes** — Files go straight to your project (not Downloads)
- **Language detection** — Auto-detects file extension from code highlighting
- **Context-aware paths** — Recognizes paths like "in src/components/" from conversation

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER EXTENSION                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ content.js  │  │ background  │  │ popup.html/js           │  │
│  │ - Injects   │  │ .js         │  │ - Settings UI           │  │
│  │   save btn  │  │ - Routes    │  │ - Project config        │  │
│  │ - Parses    │  │   messages  │  │   (future)              │  │
│  │   context   │  │   to native │  │                         │  │
│  │ - Shows     │  │   host      │  │                         │  │
│  │   modal     │  │             │  │                         │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────┘  │
│         │                │                                       │
└─────────┼────────────────┼───────────────────────────────────────┘
          │                │
          │   Chrome       │  Native Messaging
          │   Runtime      │  (stdio)
          │   Messages     │
          │                ▼
          │  ┌─────────────────────────────────────────────────────┐
          │  │              NATIVE HOST (Rust)                     │
          │  │  - Reads project config from TOML                   │
          │  │  - Receives {project, path, content}                │
          │  │  - Writes files to actual filesystem                │
          │  │  - Returns success/error                            │
          │  └─────────────────────────────────────────────────────┘
          │                │
          │                ▼
          │  ┌─────────────────────────────────────────────────────┐
          │  │              FILESYSTEM                              │
          │  │  ~/prj/my-app/src/utils.rs                          │
          │  │  ~/.dotfiles/config.toml                            │
          │  │  ~/bin/script.sh                                    │
          │  └─────────────────────────────────────────────────────┘
          │
          └──► projects.toml (config file)
```

## 📁 Project Structure

```
copilot-code-saver/
├── extension/
│   ├── manifest.json      # Extension manifest (Manifest V3)
│   ├── content.js         # Injected into Copilot pages
│   ├── background.js      # Service worker for native messaging
│   ├── popup.html         # Settings popup UI
│   ├── popup.js           # Settings logic
│   └── styles.css         # Modal styles
│
├── native-host/
│   ├── Cargo.toml         # Rust dependencies
│   ├── src/
│   │   └── main.rs        # Native messaging host
│   ├── config.example.toml
│   └── install.sh         # Installation script
│
└── README.md
```

## 🚀 Installation

### Prerequisites

- **Rust** (for building native host): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Google Chrome** or **Chromium** (non-snap version — see [Known Issues](#known-issues))

### Step 1: Clone/Create Project

```bash
mkdir -p ~/prj/copilot-code-saver
cd ~/prj/copilot-code-saver
```

### Step 2: Create Extension Files

#### `extension/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Copilot Code Saver",
  "version": "0.3.1",
  "description": "Save code blocks directly to your project files",
  "permissions": ["activeTab", "storage", "nativeMessaging"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": [
        "https://copilotstudio.microsoft.com/*",
        "https://*.powerva.microsoft.com/*"
      ],
      "js": ["content.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    }
  ]
}
```

#### `extension/background.js`

```javascript
const HOST_NAME = 'com.ccs.host';

console.log('[CCS Background] Service worker loaded');
console.log('[CCS Background] sendNativeMessage available:', typeof chrome.runtime.sendNativeMessage);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[CCS Background] Received message:', request);
  
  if (request.target !== 'background') return false;
  
  if (typeof chrome.runtime.sendNativeMessage !== 'function') {
    console.error('[CCS Background] sendNativeMessage not available');
    sendResponse({ 
      success: false, 
      error: 'Native messaging not available. Is the native host installed?' 
    });
    return true;
  }
  
  chrome.runtime.sendNativeMessage(HOST_NAME, request.message, (response) => {
    console.log('[CCS Background] Native response:', response);
    if (chrome.runtime.lastError) {
      console.error('[CCS Background] Native error:', chrome.runtime.lastError);
      sendResponse({ 
        success: false, 
        error: chrome.runtime.lastError.message 
      });
    } else {
      sendResponse(response);
    }
  });
  
  return true; // Keep channel open for async response
});
```

#### `extension/content.js`

```javascript
(() => {
  const PROCESSED_ATTR = 'data-ccs-processed';

  const ICONS = {
    save: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
  };

  // ============ NATIVE MESSAGING (via background) ============

  function sendNativeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { target: 'background', message: message },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            reject(new Error('No response from background script'));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  async function listProjects() {
    try {
      const response = await sendNativeMessage({ action: 'list_projects' });
      if (response.success) {
        return { projects: response.projects, default: response.default };
      }
      throw new Error(response.error || 'Unknown error');
    } catch (e) {
      console.error('[CCS] Failed to list projects:', e);
      return { projects: [], default: null, error: e.message };
    }
  }

  async function saveFile(projectId, path, content) {
    try {
      const response = await sendNativeMessage({
        action: 'save',
        project: projectId,
        path: path,
        content: content
      });
      return response;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ============ CONTEXT PARSING ============

  function findSurroundingText(preElement) {
    const texts = [];
    let sibling = preElement.previousElementSibling;
    for (let i = 0; i < 3 && sibling; i++) {
      texts.push(sibling.textContent || '');
      sibling = sibling.previousElementSibling;
    }
    const parent = preElement.parentElement;
    if (parent) {
      let parentSibling = parent.previousElementSibling;
      for (let i = 0; i < 2 && parentSibling; i++) {
        texts.push(parentSibling.textContent || '');
        parentSibling = parentSibling.previousElementSibling;
      }
    }
    return texts.join(' ').substring(0, 2000);
  }

  function parseFilenameFromContext(surroundingText, codeContent) {
    const patterns = [
      /(?:save|create|name|call|called|file|filename)[:\s]+[`"']?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[`"']?/i,
      /[`"']([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[`"'](?:\s+file)?/i,
      /(?:in|at|to)\s+[`"']?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[`"']?/i,
    ];
    for (const pattern of patterns) {
      const match = surroundingText.match(pattern);
      if (match?.[1]) return { filename: match[1], source: 'context' };
    }
    const firstLines = codeContent.split('\n').slice(0, 3).join('\n');
    const commentPatterns = [
      /(?:\/\/|#|\/\*)\s*(?:file|filename)?:?\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/i,
    ];
    for (const pattern of commentPatterns) {
      const match = firstLines.match(pattern);
      if (match?.[1]) return { filename: match[1], source: 'code comment' };
    }
    return null;
  }

  function detectLanguage(codeBlock) {
    const classes = (codeBlock.className || '') + ' ' + (codeBlock.closest('pre')?.className || '');
    const langMap = [
      [/\b(rust)\b/i, 'rs'], [/\b(javascript|js)\b/i, 'js'], [/\b(typescript|ts)\b/i, 'ts'],
      [/\b(python|py)\b/i, 'py'], [/\b(bash|shell|sh)\b/i, 'sh'], [/\b(json)\b/i, 'json'],
      [/\b(yaml|yml)\b/i, 'yaml'], [/\b(toml)\b/i, 'toml'], [/\b(sql)\b/i, 'sql'],
      [/\b(html)\b/i, 'html'], [/\b(css)\b/i, 'css'], [/\b(markdown|md)\b/i, 'md'],
    ];
    for (const [pattern, ext] of langMap) {
      if (pattern.test(classes)) return ext;
    }
    return 'txt';
  }

  // ============ MODAL ============

  async function showSaveModal(code, detectedInfo, onSave, onCancel) {
    const { projects, default: defaultProject, error } = await listProjects();
    
    if (error || projects.length === 0) {
      alert(`Copilot Code Saver: ${error || 'No projects configured'}\n\nEdit ~/copilot-code-saver/projects.toml to add projects.`);
      onCancel();
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'ccs-modal-overlay';
    
    const ext = detectedInfo.ext || 'txt';
    const defaultFilename = detectedInfo.filename || `snippet-${Date.now().toString(36)}.${ext}`;
    
    chrome.storage.sync.get(['lastProject'], (stored) => {
      const selectedProject = stored.lastProject || defaultProject || projects[0]?.id;
      
      const projectOptions = projects.map(p => 
        `<option value="${p.id}" ${p.id === selectedProject ? 'selected' : ''}>${p.name}</option>`
      ).join('');
      
      const selectedProjectData = projects.find(p => p.id === selectedProject);
      
      overlay.innerHTML = `
        <div class="ccs-modal">
          <h3>💾 Save to Project</h3>
          
          ${detectedInfo.filename ? `
            <div class="ccs-detected">
              ✨ Detected from ${detectedInfo.source}: <strong>${detectedInfo.filename}</strong>
            </div>
          ` : ''}
          
          <label>Project</label>
          <select id="ccs-project">${projectOptions}</select>
          
          <label>Path (relative to project root)</label>
          <input type="text" id="ccs-path" value="${defaultFilename}" placeholder="src/utils.rs">
          
          <label>Full Path Preview</label>
          <div class="ccs-preview" id="ccs-preview">
            ${selectedProjectData?.root || ''}/${defaultFilename}
          </div>
          
          <div class="ccs-modal-buttons">
            <button class="ccs-modal-btn secondary" id="ccs-cancel">Cancel</button>
            <button class="ccs-modal-btn primary" id="ccs-save">Save</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(overlay);
      
      const projectSelect = overlay.querySelector('#ccs-project');
      const pathInput = overlay.querySelector('#ccs-path');
      const preview = overlay.querySelector('#ccs-preview');
      
      function updatePreview() {
        const proj = projects.find(p => p.id === projectSelect.value);
        const path = pathInput.value.replace(/^\/+/, '');
        preview.textContent = `${proj?.root || ''}/${path}`;
      }
      
      projectSelect.addEventListener('change', updatePreview);
      pathInput.addEventListener('input', updatePreview);
      pathInput.focus();
      pathInput.select();
      
      overlay.querySelector('#ccs-cancel').addEventListener('click', () => {
        overlay.remove();
        onCancel();
      });
      
      overlay.querySelector('#ccs-save').addEventListener('click', async () => {
        const projectId = projectSelect.value;
        const path = pathInput.value.trim().replace(/^\/+/, '');
        chrome.storage.sync.set({ lastProject: projectId });
        overlay.remove();
        onSave(projectId, path);
      });
      
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          overlay.remove();
          onCancel();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          overlay.querySelector('#ccs-save').click();
        }
      });
    });
  }

  // ============ BUTTON INJECTION ============

  function injectButton(preElement, index) {
    if (preElement.hasAttribute(PROCESSED_ATTR)) return;
    preElement.setAttribute(PROCESSED_ATTR, 'true');

    const codeEl = preElement.querySelector('code') || preElement;
    const code = codeEl.textContent || '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative; display: inline-block; width: 100%;';
    preElement.parentNode.insertBefore(wrapper, preElement);
    wrapper.appendChild(preElement);

    const btn = document.createElement('button');
    btn.innerHTML = ICONS.save;
    btn.title = 'Save to project';
    btn.style.cssText = `
      position: absolute;
      bottom: 10px;
      right: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      margin: 0;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 6px;
      cursor: pointer;
      color: #444;
      transition: all 0.15s ease;
      box-shadow: 0 1px 4px rgba(0,0,0,0.12);
      z-index: 10000;
    `;
    
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#0078d4';
      btn.style.color = 'white';
      btn.style.borderColor = '#0078d4';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255, 255, 255, 0.95)';
      btn.style.color = '#444';
      btn.style.borderColor = 'rgba(0, 0, 0, 0.15)';
    });
    
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const surroundingText = findSurroundingText(preElement);
      const parsedFilename = parseFilenameFromContext(surroundingText, code);
      const ext = detectLanguage(codeEl);
      
      const detectedInfo = {
        filename: parsedFilename?.filename || null,
        source: parsedFilename?.source || null,
        ext: ext
      };
      
      showSaveModal(code, detectedInfo,
        async (projectId, path) => {
          const result = await saveFile(projectId, path, code);
          if (result.success) {
            btn.innerHTML = ICONS.check;
            btn.title = `Saved to ${result.full_path}`;
          } else {
            btn.innerHTML = ICONS.error;
            btn.title = `Error: ${result.error}`;
            alert(`Save failed: ${result.error}`);
          }
          setTimeout(() => {
            btn.innerHTML = ICONS.save;
            btn.title = 'Save to project';
          }, 2000);
        },
        () => {}
      );
    });

    wrapper.appendChild(btn);
  }

  function processCodeBlocks() {
    document.querySelectorAll('pre').forEach((pre, index) => {
      injectButton(pre, index);
    });
  }

  const observer = new MutationObserver(() => processCodeBlocks());
  processCodeBlocks();
  observer.observe(document.body, { childList: true, subtree: true });

  console.log('[Copilot Code Saver] Loaded v0.3.1');
})();
```

#### `extension/styles.css`

```css
.ccs-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.ccs-modal {
  background: white;
  border-radius: 12px;
  padding: 20px;
  width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.ccs-modal h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.ccs-modal label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #666;
  margin-bottom: 4px;
}

.ccs-modal input,
.ccs-modal select {
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
}

.ccs-modal input:focus,
.ccs-modal select:focus {
  outline: none;
  border-color: #0078d4;
}

.ccs-detected {
  background: #e7f3ff;
  border: 1px solid #0078d4;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #0078d4;
}

.ccs-preview {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 10px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  color: #333;
  word-break: break-all;
  margin-bottom: 12px;
}

.ccs-modal-buttons {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.ccs-modal-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.ccs-modal-btn.primary {
  background: #0078d4;
  color: white;
}

.ccs-modal-btn.primary:hover {
  background: #106ebe;
}

.ccs-modal-btn.secondary {
  background: #f0f0f0;
  color: #333;
}

.ccs-modal-btn.secondary:hover {
  background: #e0e0e0;
}
```

#### `extension/popup.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 300px;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #333;
    }
    h1 { font-size: 15px; font-weight: 600; margin-bottom: 12px; color: #0078d4; }
    p { font-size: 12px; color: #666; line-height: 1.5; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
    .section { margin-top: 16px; padding-top: 12px; border-top: 1px solid #eee; }
    a { color: #0078d4; }
  </style>
</head>
<body>
  <h1>⚡ Copilot Code Saver</h1>
  <p>Save code blocks directly to your project files.</p>
  
  <div class="section">
    <p><strong>Config file:</strong><br>
    <code>~/copilot-code-saver/projects.toml</code></p>
  </div>
  
  <div class="section">
    <p><strong>Usage:</strong><br>
    Click the save button (↓) on any code block in Copilot Studio.</p>
  </div>
</body>
</html>
```

### Step 3: Build Native Host

#### `native-host/Cargo.toml`

```toml
[package]
name = "ccs-host"
version = "0.1.0"
edition = "2021"
description = "Native messaging host for Copilot Code Saver"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
toml = "0.8"
dirs = "5.0"
anyhow = "1.0"

[profile.release]
opt-level = "z"
lto = true
strip = true
```

#### `native-host/src/main.rs`

```rust
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{self, Read, Write};
use std::path::PathBuf;

// ============ CONFIG ============

#[derive(Debug, Deserialize)]
struct Config {
    default: Option<String>,
    projects: HashMap<String, ProjectConfig>,
}

#[derive(Debug, Deserialize, Clone)]
struct ProjectConfig {
    name: String,
    root: String,
}

fn config_path() -> PathBuf {
    let candidates = [
        // Snap-specific location (check first for Ubuntu snap users)
        dirs::home_dir().map(|h| h.join("snap/chromium/common/copilot-code-saver/projects.toml")),
        // Home directory (snap-accessible fallback)
        dirs::home_dir().map(|h| h.join("copilot-code-saver").join("projects.toml")),
        // Standard config location
        dirs::config_dir().map(|c| c.join("copilot-code-saver").join("projects.toml")),
    ];
    
    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return candidate;
        }
    }
    
    // Default to home directory for creation
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("copilot-code-saver")
        .join("projects.toml")
}

fn load_config() -> Result<Config> {
    let path = config_path();
    
    if !path.exists() {
        // Create default config
        let default_config = r#"# Copilot Code Saver - Project Configuration
# default = "my-project"

[projects.example]
name = "Example Project"
root = "/home/user/projects/example"
"#;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, default_config)?;
    }
    
    let content = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read config: {:?}", path))?;
    
    let config: Config = toml::from_str(&content)
        .with_context(|| "Failed to parse config")?;
    
    Ok(config)
}

// ============ NATIVE MESSAGING PROTOCOL ============

#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
enum Request {
    ListProjects,
    Save {
        project: String,
        path: String,
        content: String,
    },
    GetConfig,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum Response {
    Projects {
        success: bool,
        projects: Vec<ProjectInfo>,
        default: Option<String>,
    },
    SaveResult {
        success: bool,
        full_path: Option<String>,
        error: Option<String>,
    },
    Config {
        success: bool,
        config_path: String,
    },
    Error {
        success: bool,
        error: String,
    },
}

#[derive(Debug, Serialize)]
struct ProjectInfo {
    id: String,
    name: String,
    root: String,
}

// ============ MESSAGE I/O ============

fn read_message() -> Result<Request> {
    let mut len_bytes = [0u8; 4];
    io::stdin().read_exact(&mut len_bytes)?;
    let len = u32::from_ne_bytes(len_bytes) as usize;
    
    let mut buffer = vec![0u8; len];
    io::stdin().read_exact(&mut buffer)?;
    
    let request: Request = serde_json::from_slice(&buffer)?;
    Ok(request)
}

fn write_message(response: &Response) -> Result<()> {
    let json = serde_json::to_vec(response)?;
    let len = json.len() as u32;
    
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    
    handle.write_all(&len.to_ne_bytes())?;
    handle.write_all(&json)?;
    handle.flush()?;
    
    Ok(())
}

// ============ HANDLERS ============

fn handle_list_projects(config: &Config) -> Response {
    let projects: Vec<ProjectInfo> = config
        .projects
        .iter()
        .map(|(id, proj)| ProjectInfo {
            id: id.clone(),
            name: proj.name.clone(),
            root: proj.root.clone(),
        })
        .collect();
    
    Response::Projects {
        success: true,
        projects,
        default: config.default.clone(),
    }
}

fn handle_save(config: &Config, project_id: &str, rel_path: &str, content: &str) -> Response {
    // Find project
    let project = match config.projects.get(project_id) {
        Some(p) => p,
        None => {
            return Response::SaveResult {
                success: false,
                full_path: None,
                error: Some(format!("Project '{}' not found", project_id)),
            }
        }
    };
    
    // Build full path
    let root = PathBuf::from(&project.root);
    
    // Sanitize relative path (prevent directory traversal)
    let rel_path = rel_path.trim_start_matches('/').trim_start_matches("../");
    let full_path = root.join(rel_path);
    
    // Ensure path is still within project root
    match full_path.canonicalize() {
        Ok(canonical) => {
            if !canonical.starts_with(&root) {
                return Response::SaveResult {
                    success: false,
                    full_path: None,
                    error: Some("Path escapes project root".to_string()),
                };
            }
        }
        Err(_) => {
            // File doesn't exist yet, check parent
            if let Some(parent) = full_path.parent() {
                if parent.exists() {
                    if let Ok(canonical_parent) = parent.canonicalize() {
                        if !canonical_parent.starts_with(&root) {
                            return Response::SaveResult {
                                success: false,
                                full_path: None,
                                error: Some("Path escapes project root".to_string()),
                            };
                        }
                    }
                }
            }
        }
    }
    
    // Create parent directories if needed
    if let Some(parent) = full_path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return Response::SaveResult {
                success: false,
                full_path: None,
                error: Some(format!("Failed to create directories: {}", e)),
            };
        }
    }
    
    // Write file
    match fs::write(&full_path, content) {
        Ok(_) => Response::SaveResult {
            success: true,
            full_path: Some(full_path.to_string_lossy().to_string()),
            error: None,
        },
        Err(e) => Response::SaveResult {
            success: false,
            full_path: None,
            error: Some(format!("Failed to write file: {}", e)),
        },
    }
}

fn handle_get_config() -> Response {
    Response::Config {
        success: true,
        config_path: config_path().to_string_lossy().to_string(),
    }
}

// ============ MAIN ============

fn main() {
    let config = match load_config() {
        Ok(c) => c,
        Err(e) => {
            let _ = write_message(&Response::Error {
                success: false,
                error: format!("Config error: {}", e),
            });
            return;
        }
    };
    
    loop {
        let request = match read_message() {
            Ok(r) => r,
            Err(_) => break, // EOF or error, exit cleanly
        };
        
        let response = match request {
            Request::ListProjects => handle_list_projects(&config),
            Request::Save { project, path, content } => {
                handle_save(&config, &project, &path, &content)
            }
            Request::GetConfig => handle_get_config(),
        };
        
        if write_message(&response).is_err() {
            break;
        }
    }
}
```

### Step 4: Build and Install

```bash
cd ~/prj/copilot-code-saver/native-host

# Build
cargo build --release

# Install binary
mkdir -p ~/bin
cp target/release/ccs-host ~/bin/
chmod +x ~/bin/ccs-host
```

### Step 5: Configure Projects

```bash
mkdir -p ~/copilot-code-saver

cat > ~/copilot-code-saver/projects.toml << 'EOF'
# Default project (used when none selected)
default = "my-app"

[projects.my-app]
name = "My Application"
root = "/home/YOUR_USERNAME/prj/my-app"

[projects.dotfiles]
name = "Dotfiles"
root = "/home/YOUR_USERNAME/.dotfiles"

[projects.scripts]
name = "Scripts"
root = "/home/YOUR_USERNAME/bin"
EOF
```

Edit paths to match your actual project locations.

### Step 6: Register Native Messaging Host

Get your extension ID first:
1. Go to `chrome://extensions/`
2. Enable Developer mode
3. Load unpacked → select `extension/` folder
4. Copy the extension ID

```bash
# For Google Chrome
mkdir -p ~/.config/google-chrome/NativeMessagingHosts

# Replace YOUR_EXTENSION_ID with actual ID
cat > ~/.config/google-chrome/NativeMessagingHosts/com.ccs.host.json << EOF
{
  "name": "com.ccs.host",
  "description": "Copilot Code Saver Native Host",
  "path": "$HOME/bin/ccs-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
EOF
```

### Step 7: Test

1. Restart Chrome completely
2. Go to Copilot Studio
3. Get a code response
4. Click the save button (bottom-right of code block)
5. Select project, edit path, click Save

## 🔧 Configuration

### Project Configuration (`~/copilot-code-saver/projects.toml`)

```toml
# Set default project
default = "my-app"

# Define projects
[projects.my-app]
name = "My Application"      # Display name in dropdown
root = "/home/user/prj/app"  # Absolute path to project root

[projects.another]
name = "Another Project"
root = "/home/user/prj/another"
```

### Supported Target Sites

Edit `extension/manifest.json` to add more sites:

```json
"content_scripts": [
  {
    "matches": [
      "https://copilotstudio.microsoft.com/*",
      "https://*.powerva.microsoft.com/*",
      "https://chat.openai.com/*",           // ChatGPT
      "https://claude.ai/*"                   // Claude
    ],
    ...
  }
]
```

## ⚠️ Known Issues

### Snap Chromium Does Not Support Native Messaging

**Problem:** Native messaging doesn't work in browsers installed as snap packages (Ubuntu's default Chromium). The snap sandbox prevents execution of external binaries.

**Error:** `"Specified native messaging host not found"`

**Solution:** Install Google Chrome or Chromium from a non-snap source:

```bash
# Option 1: Google Chrome .deb
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt --fix-broken install

# Option 2: Chromium from PPA
sudo add-apt-repository ppa:saiarcot895/chromium-dev
sudo apt update
sudo apt install chromium-browser
```

| Browser Install Method | Native Messaging |
|------------------------|------------------|
| Chromium snap          | ❌ Blocked        |
| Google Chrome .deb     | ✅ Works          |
| Chromium PPA           | ✅ Works          |
| Firefox snap           | ❌ Blocked        |
| Firefox .deb           | ✅ Works          |

## 🧪 Testing the Native Host

```bash
# Test binary directly
cat > /tmp/test-ccs.py << 'EOF'
import subprocess
import struct
import json

msg = {"action": "list_projects"}
encoded = json.dumps(msg).encode('utf-8')

proc = subprocess.Popen(
    ['/home/YOUR_USERNAME/bin/ccs-host'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)
stdout, stderr = proc.communicate(input=struct.pack('I', len(encoded)) + encoded)

if stderr:
    print(f"STDERR: {stderr.decode()}")
if stdout and len(stdout) >= 4:
    length = struct.unpack('I', stdout[:4])[0]
    response = json.loads(stdout[4:4+length])
    print(json.dumps(response, indent=2))
EOF

python3 /tmp/test-ccs.py
```

Expected output:
```json
{
  "success": true,
  "projects": [
    {"id": "my-app", "name": "My Application", "root": "/home/user/prj/my-app"}
  ],
  "default": "my-app"
}
```

## 🐛 Troubleshooting

### Extension not loading
- Check `chrome://extensions/` for errors
- Verify `manifest.json` is valid JSON
- Check Developer mode is enabled

### Save button not appearing
- Open DevTools (F12) → Console
- Look for `[Copilot Code Saver] Loaded`
- Check if site matches `content_scripts.matches` in manifest

### "Native messaging host not found"
- Verify native host manifest exists in correct location
- Check extension ID matches `allowed_origins`
- Ensure binary path is absolute and executable
- **If using snap Chromium**: Switch to non-snap browser

### "No projects configured"
- Check config file exists: `~/copilot-code-saver/projects.toml`
- Validate TOML syntax
- Test native host directly with Python script above

### Service Worker Issues
- Go to `chrome://extensions/`
- Click "Service Worker" link under extension
- Check console for errors

## 🗺️ Roadmap

### Completed ✅
- [x] Phase 1: Basic save button with download
- [x] Phase 2: Smart filename detection, modal UI
- [x] Phase 3: Native messaging for direct filesystem writes

### Future Enhancements
- [ ] Phase 4: Settings UI in popup for project management
- [ ] Phase 5: Keyboard shortcuts (Ctrl+Shift+S)
- [ ] Phase 6: "Open in editor" after save (configurable command)
- [ ] Phase 7: File tree browser in modal
- [ ] Phase 8: Git integration (branch awareness)
- [ ] Phase 9: Support more AI chat platforms (ChatGPT, Claude, etc.)
- [ ] Phase 10: Publish to Chrome Web Store

## 📄 License

MIT

## 🙏 Credits

Built during a pair-programming session with AI assistance, solving the real problem of "copy-paste hell" when using web-based AI coding assistants without API access.
