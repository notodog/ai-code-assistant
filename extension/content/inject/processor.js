(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.Processor = {
    processAll() {
      document.querySelectorAll('pre').forEach((pre) => AIC.ButtonInjector.inject(pre));
    },

    start() {
      this.processAll();
      const observer = new MutationObserver(() => this.processAll());
      observer.observe(document.body, { childList: true, subtree: true });
      return observer;
    }
  };
})();
