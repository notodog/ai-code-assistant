const HOST_NAME = 'com.ccs.host';

console.log('[CCS Background] Service worker loaded');
console.log('[CCS Background] sendNativeMessage available:', typeof chrome.runtime.sendNativeMessage);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[CCS Background] Received message:', request);
  
  if (request.target !== 'background') return false;
  
  if (typeof chrome.runtime.sendNativeMessage !== 'function') {
    console.error('[CCS Background] sendNativeMessage not available');
    sendResponse({ 
      success: false, 
      error: 'Native messaging not available. Is the native host installed?' 
    });
    return true;
  }
  
  chrome.runtime.sendNativeMessage(HOST_NAME, request.message, (response) => {
    console.log('[CCS Background] Native response:', response);
    if (chrome.runtime.lastError) {
      console.error('[CCS Background] Native error:', chrome.runtime.lastError);
      sendResponse({ 
        success: false, 
        error: chrome.runtime.lastError.message 
      });
    } else {
      sendResponse(response);
    }
  });
  
  return true;
});
