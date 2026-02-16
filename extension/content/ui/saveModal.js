(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.SaveModal = {
    async show(code, detectedInfo, onSave, onCancel) {
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
      const lastDir = await AIC.RecentPaths.getLastDirectory(selectedProjectId);

      let defaultFilename = detectedInfo.filename || `snippet-${Date.now().toString(36)}.${detectedInfo.ext}`;
      if (lastDir && !defaultFilename.includes('/')) defaultFilename = lastDir + defaultFilename;

      const selectedProjectData = projects.find(p => p.id === selectedProjectId) || projects[0];
      const projectOptions = projects
        .map(p => `<option value="${p.id}" ${p.id === selectedProjectId ? 'selected' : ''}>${p.name}</option>`)
        .join('');

      const confidenceBadge =
        detectedInfo.confidence && detectedInfo.confidence !== 'none'
          ? `<span class="aic-confidence aic-confidence-${detectedInfo.confidence}">${detectedInfo.confidence}</span>`
          : '';

      overlay.innerHTML = `
        <div class="aic-modal">
          <h3>💾 Save to Project</h3>
          ${detectedInfo.filename ? `
            <div class="aic-detected">
              ✨ Detected from ${detectedInfo.source}: <strong>${detectedInfo.filename}</strong>
              ${confidenceBadge}
            </div>
          ` : ''}

          <label>Project</label>
          <select id="aic-project">${projectOptions}</select>

          <label>Path (relative to project root)</label>
          <input type="text" id="aic-path" value="${defaultFilename}" placeholder="src/utils.rs">

          <label>Full Path Preview</label>
          <div class="aic-preview" id="aic-preview">${AIC.Path.join(selectedProjectData?.root || '', defaultFilename)}</div>

          <div class="aic-modal-buttons">
            <button class="aic-modal-btn secondary" id="aic-cancel">Cancel</button>
            <button class="aic-modal-btn primary" id="aic-save">Save</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const projectSelect = overlay.querySelector('#aic-project');
      const pathInput = overlay.querySelector('#aic-path');
      const preview = overlay.querySelector('#aic-preview');

      const updatePreview = () => {
        const proj = projects.find(p => p.id === projectSelect.value);
        const relativePath = pathInput.value.replace(/^\/+/, '');
        preview.textContent = AIC.Path.join(proj?.root || '', relativePath);
      };

      projectSelect.addEventListener('change', async () => {
        const newProjectId = projectSelect.value;
        const newLastDir = await AIC.RecentPaths.getLastDirectory(newProjectId);
        const currentPath = pathInput.value;
        if (newLastDir && !currentPath.includes('/')) pathInput.value = newLastDir + currentPath;
        AIC.Projects.setLastProjectId(newProjectId);
        updatePreview();
      });

      pathInput.addEventListener('input', updatePreview);
      pathInput.focus();
      pathInput.select();

      overlay.querySelector('#aic-cancel').addEventListener('click', () => {
        overlay.remove();
        onCancel?.();
      });

      overlay.querySelector('#aic-save').addEventListener('click', async () => {
        const projectId = projectSelect.value;
        const project = projects.find(p => p.id === projectId);
        const relativePath = pathInput.value.trim().replace(/^\/+/, '');

        if (!project) return alert('Please select a project');
        if (!relativePath) return alert('Please enter a file path');

        const absolutePath = AIC.Path.join(project.root, relativePath);
        await AIC.RecentPaths.save(projectId, relativePath);
        AIC.Projects.setLastProjectId(projectId);

        overlay.remove();
        onSave?.(absolutePath);
      });

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { overlay.remove(); onCancel?.(); }
        else if (e.key === 'Enter' && !e.shiftKey) overlay.querySelector('#aic-save').click();
      });
    }
  };
})();
