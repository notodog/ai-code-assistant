(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.RecentPaths = {
    async get(projectId) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['recentPaths'], (data) => {
          const all = data.recentPaths || {};
          resolve(all[projectId] || []);
        });
      });
    },

    async save(projectId, filePath) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['recentPaths'], (data) => {
          const all = data.recentPaths || {};
          const paths = all[projectId] || [];
          const updated = [filePath, ...paths.filter(p => p !== filePath)].slice(0, 10);
          all[projectId] = updated;
          chrome.storage.local.set({ recentPaths: all }, resolve);
        });
      });
    },

    async getLastDirectory(projectId) {
      const paths = await this.get(projectId);
      if (paths.length > 0) {
        const lastPath = paths[0];
        const idx = lastPath.lastIndexOf('/');
        return idx > 0 ? lastPath.substring(0, idx + 1) : '';
      }
      return '';
    }
  };
})();
