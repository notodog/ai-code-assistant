(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.Path = {
    join(root, relativePath) {
      const cleanRelative = (relativePath || '').replace(/^\/+/, '');
      const cleanRoot = (root || '').replace(/\/+$/, '');
      return `${cleanRoot}/${cleanRelative}`;
    }
  };
})();
