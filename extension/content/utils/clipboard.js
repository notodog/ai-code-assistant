(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.Clipboard = {
    copy(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(() => this._fallback(text));
      }
      return Promise.resolve(this._fallback(text));
    },

    _fallback(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };
})();
