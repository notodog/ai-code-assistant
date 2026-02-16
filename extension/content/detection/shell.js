(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.Shell = {
    isShellScript(code, ext) {
      if (ext === 'sh') return true;
      const trimmed = (code || '').trim();
      return /^#!\/(bin|usr\/bin)\/(bash|sh|zsh)/.test(trimmed);
    }
  };
})();
