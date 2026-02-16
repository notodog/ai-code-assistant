// extension/content.js (bootstrap)
(() => {
  'use strict';

  // Start observing + injection
  window.AIC?.Processor?.start();

  console.log(`[AI Code Assistant] Loaded v${window.AIC?.VERSION || 'unknown'}`);
})();
