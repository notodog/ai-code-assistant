(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.DOM = {
    isVisible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }
  };
})();
