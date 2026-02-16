(() => {
  'use strict';

  const AIC = window.AIC;

  function formatExecutionOutput(result) {
    let output = '```\n';
    output += `Command executed: ${result.command.split('\n')[0]}...\n`;
    output += `Working directory: ${result.workdir}\n`;
    output += `Exit code: ${result.exitCode}\n`;
    output += '\n--- Output ---\n';
    if (result.stdout) {
      output += result.stdout;
      if (!result.stdout.endsWith('\n')) output += '\n';
    }
    if (result.stderr) {
      output += '\n--- Errors ---\n';
      output += result.stderr;
      if (!result.stderr.endsWith('\n')) output += '\n';
    }
    output += '```';
    return output;
  }

  AIC.ExecuteModal = {
    async show(code, detectedInfo, onExecute, onCancel) {
      const { projects, default: defaultProject, error } = await AIC.Projects.list();
      if (error || projects.length === 0) {
        alert(`AI Code Assistant: ${error || 'No projects configured'}\n\nClick the extension icon to add projects.`);
        onCancel?.();
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'aic-modal-overlay';

      const storedLast = await AIC.Projects.getLastProjectId(defaultProject || projects[0]?.id);
      const selectedProjectId = storedLast || defaultProject || projects[0]?.id;
      const selectedProject = projects.find(p => p.id === selectedProjectId) || projects[0];
      const workdir = selectedProject?.root || '/tmp';

      const lineCount = code.split('\n').length;
      const preview = code.length > 500 ? code.substring(0, 497) + '...' : code;

      overlay.innerHTML = `
        <div class="aic-modal">
          <h3>▶️ Execute Shell Script</h3>

          <label>Project</label>
          <select id="aic-exec-project">
            ${projects.map(p => `
              <option value="${p.id}" ${p.id === selectedProjectId ? 'selected' : ''}>${p.name}</option>
            `).join('')}
          </select>

          <div style="margin: 12px 0; padding: 8px; background: #333333; border-radius: 4px; font-size: 12px;">
            <strong>Working Directory:</strong> <code id="aic-exec-workdir-display">${workdir}</code>
          </div>

          <label>Script Preview (${lineCount} lines):</label>
          <pre class="aic-exec-preview">${preview}</pre>

          <label>Timeout (seconds):</label>
          <input type="number" id="aic-exec-timeout" value="30" min="1" max="300" />

          <div class="aic-modal-buttons">
            <button id="aic-execute" class="aic-modal-btn primary">▶️ Execute</button>
            <button id="aic-cancel" class="aic-modal-btn secondary">Cancel</button>
          </div>

          <div id="aic-exec-output" style="display:none; margin-top: 16px; border-top: 2px solid #ddd; padding-top: 16px;">
            <h4 style="margin: 0 0 8px 0;">Output:</h4>
            <pre id="aic-stdout" class="aic-stdout"></pre>
            <pre id="aic-stderr" class="aic-stderr"></pre>
            <div id="aic-status" class="aic-status"></div>

            <div id="aic-copy-reply" style="display:none; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0;">
              <button id="aic-copy-to-reply" class="aic-modal-btn primary">📋 Copy to Reply</button>
              <button id="aic-retry" class="aic-modal-btn secondary">🔄 Retry</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const projectSelect = overlay.querySelector('#aic-exec-project');
      projectSelect.addEventListener('change', () => {
        const id = projectSelect.value;
        const proj = projects.find(p => p.id === id);
        if (proj) {
          overlay.querySelector('#aic-exec-workdir-display').textContent = proj.root;
          AIC.Projects.setLastProjectId(id);
        }
      });

      const executeBtn = overlay.querySelector('#aic-execute');
      executeBtn.addEventListener('click', async () => {
        const workdir2 = overlay.querySelector('#aic-exec-workdir-display').textContent;
        const timeout = parseInt(overlay.querySelector('#aic-exec-timeout').value, 10);

        executeBtn.disabled = true;
        executeBtn.textContent = '⏳ Executing...';

        try {
          const response = await AIC.Native.executeShell(code, workdir2, timeout);

          const outputDiv = overlay.querySelector('#aic-exec-output');
          outputDiv.style.display = 'block';

          const stdoutEl = overlay.querySelector('#aic-stdout');
          const stderrEl = overlay.querySelector('#aic-stderr');
          const statusEl = overlay.querySelector('#aic-status');
          const copyReplyDiv = overlay.querySelector('#aic-copy-reply');

          stdoutEl.textContent = response.stdout || '(no output)';
          stderrEl.textContent = response.stderr || '';
          stderrEl.style.display = response.stderr ? 'block' : 'none';

          const executionResult = {
            command: code,
            workdir: workdir2,
            stdout: response.stdout || '',
            stderr: response.stderr || '',
            exitCode: response.exit_code ?? 0,
            success: response.success
          };

          if (response.success) {
            statusEl.innerHTML = `✅ Exit code: ${executionResult.exitCode}`;
            statusEl.className = 'aic-status success';
            executeBtn.textContent = '✓ Executed';
            onExecute?.();
          } else {
            statusEl.innerHTML = `❌ Failed${response.exit_code ? ` (exit ${response.exit_code})` : ''}: ${response.error || 'Unknown error'}`;
            statusEl.className = 'aic-status error';
            executeBtn.textContent = 'Failed';
          }

          copyReplyDiv.style.display = 'flex';
          copyReplyDiv.style.gap = '8px';

          overlay.querySelector('#aic-copy-to-reply').addEventListener('click', async () => {
            const formatted = formatExecutionOutput(executionResult);

            overlay.remove();
            await new Promise(r => setTimeout(r, 100));

            try {
              const inserted = await AIC.Insert.intoChat(formatted);
              if (inserted) AIC.Toast.show('✅ Execution result added to reply!');
              else { await AIC.Clipboard.copy(formatted); AIC.Toast.show('📋 Execution result copied to clipboard!'); }
            } catch (e) {
              await AIC.Clipboard.copy(formatted);
              AIC.Toast.show('📋 Execution result copied to clipboard!');
            }
          });

          overlay.querySelector('#aic-retry').addEventListener('click', () => {
            outputDiv.style.display = 'none';
            executeBtn.disabled = false;
            executeBtn.textContent = '▶️ Execute';
            copyReplyDiv.style.display = 'none';
          });

        } catch (err) {
          const statusEl = overlay.querySelector('#aic-status');
          statusEl.innerHTML = `❌ Error: ${err.message}`;
          statusEl.className = 'aic-status error';
          executeBtn.disabled = false;
          executeBtn.textContent = 'Retry';
        }
      });

      overlay.querySelector('#aic-cancel').addEventListener('click', () => {
        overlay.remove();
        onCancel?.();
      });

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { overlay.remove(); onCancel?.(); }
        else if (e.key === 'Enter' && !e.shiftKey && !executeBtn.disabled) executeBtn.click();
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { overlay.remove(); onCancel?.(); }
      });
    }
  };
})();
