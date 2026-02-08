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
      alert(`Copilot Code Saver: ${error || 'No projects configured'}\n\nEdit ~/.config/copilot-code-saver/projects.toml to add projects.`);
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
