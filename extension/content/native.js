(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.Native = {
    send(message) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ target: 'background', message }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            reject(new Error('No response from background script'));
          } else {
            resolve(response);
          }
        });
      });
    },

    async saveFile(absolutePath, content) {
      try {
        return await this.send({ action: 'save', path: absolutePath, content });
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    async executeShell(command, workingDir, timeoutSecs) {
      return await this.send({
        action: 'execute',
        command,
        working_dir: workingDir,
        timeout_secs: timeoutSecs
      });
    }
  };
})();
