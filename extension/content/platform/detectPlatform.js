(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.Platform = {
    detect() {
      const hostname = window.location.hostname;
      const url = window.location.href;

      if (hostname === 'chat.openai.com' || hostname === 'chatgpt.com' || hostname.includes('openai.com')) return 'chatgpt';
      if (hostname === 'claude.ai' || hostname.includes('claude.ai')) return 'claude';
      if (hostname === 'gemini.google.com' || hostname.includes('gemini.google.com')) return 'gemini';

      if (hostname === 'm365.cloud.microsoft' || hostname.includes('m365.cloud.microsoft') || url.includes('m365.cloud.microsoft/chat')) return 'm365copilot';
      if (hostname === 'copilotstudio.microsoft.com' || url.includes('copilotstudio.microsoft.com')) return 'copilotstudio';
      if (hostname === 'copilot.microsoft.com' || (hostname === 'www.bing.com' && url.includes('/chat'))) return 'copilot';

      return 'unknown';
    }
  };
})();
