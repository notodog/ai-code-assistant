(() => {
  'use strict';

  const AIC = window.AIC;

  function styleButton(btn) {
    btn.style.cssText = `
      position: absolute;
      bottom: 10px;
      right: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: #333;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: all 0.2s;
      z-index: 10;
    `;
    btn.style.lineHeight = '1';
    btn.style.justifyContent = 'center';
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255, 255, 255, 1)';
      btn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255, 255, 255, 0.9)';
      btn.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
    });
    btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.95)'; });
    btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
  }

  AIC.ButtonInjector = {
    inject(preElement) {
      if (preElement.hasAttribute(AIC.PROCESSED_ATTR)) return;
      if (preElement.closest('.aic-modal-overlay')) return;
      if (preElement.classList.contains('aic-exec-preview')) return;

      preElement.setAttribute(AIC.PROCESSED_ATTR, 'true');

      const codeEl = preElement.querySelector('code') || preElement;
      const code = codeEl.textContent || '';

      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position: relative; display: inline-block; width: 100%;';
      preElement.parentNode.insertBefore(wrapper, preElement);
      wrapper.appendChild(preElement);

      const ext = AIC.Language.detect(codeEl);
      const isShell = AIC.Shell.isShellScript(code, ext);

      const btn = document.createElement('button');
      btn.innerHTML = isShell ? AIC.ICONS.exec : AIC.ICONS.save;
      btn.title = isShell ? 'Execute shell script' : 'Save to project';

      styleButton(btn);

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const detected = AIC.FilenameDetector.detect(preElement, code, ext);
        const detectedInfo = { filename: detected.filename, source: detected.source, confidence: detected.confidence, ext };

        if (isShell) {
          AIC.ExecuteModal.show(code, detectedInfo,
            () => {
              btn.innerHTML = '✓';
              btn.title = 'Executed successfully';
              setTimeout(() => { btn.innerHTML = AIC.ICONS.exec; btn.title = 'Execute shell script'; }, 2000);
            },
            () => {}
          );
          return;
        }

        AIC.SaveModal.show(code, detectedInfo,
          async (absolutePath) => {
            const result = await AIC.Native.saveFile(absolutePath, code);
            if (result.success) {
              btn.innerHTML = AIC.ICONS.check;
              btn.title = `Saved to ${result.full_path}`;
            } else {
              btn.innerHTML = AIC.ICONS.error;
              btn.title = `Error: ${result.error}`;
              alert(`Save failed: ${result.error}`);
            }
            setTimeout(() => {
              btn.innerHTML = AIC.ICONS.save;
              btn.title = 'Save to project';
            }, 2000);
          },
          () => {}
        );
      });

      wrapper.appendChild(btn);
    }
  };
})();
