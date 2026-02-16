(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.Projects = {
    async list() {
      return new Promise((resolve) => {
        chrome.storage.sync.get(['projects', 'defaultProject'], (data) => {
          const projects = data.projects || [];
          if (projects.length === 0) {
            resolve({
              projects: [],
              default: null,
              error: 'No projects configured. Click the extension icon to add projects.'
            });
          } else {
            resolve({
              projects,
              default: data.defaultProject || projects[0]?.id || null
            });
          }
        });
      });
    },

    async getLastProjectId(fallbackId) {
      return new Promise((resolve) => {
        chrome.storage.sync.get(['lastProject'], (data) => {
          resolve(data.lastProject || fallbackId);
        });
      });
    },

    setLastProjectId(projectId) {
      chrome.storage.sync.set({ lastProject: projectId });
    }
  };
})();
