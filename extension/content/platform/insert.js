(() => {
  'use strict';

  const AIC = window.AIC;

  function insertIntoElement(element, text) {
    const currentValue = element.value || element.innerText || element.textContent || '';
    const newValue = currentValue ? currentValue + '\n\n' + text : text;

    // contentEditable
    if (element.contentEditable === 'true' || element.getAttribute('role') === 'textbox') {
      element.focus();

      let success = document.execCommand('insertText', false, newValue);
      if (!success) {
        if ('innerText' in element) element.innerText = newValue;
        else element.textContent = newValue;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(element);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      return true;
    }

    // input
    if (element.tagName === 'INPUT') {
      element.focus();
      element.select();
      const success = document.execCommand('insertText', false, newValue);
      if (!success) {
        element.value = newValue;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (element.setSelectionRange) element.setSelectionRange(newValue.length, newValue.length);
      return true;
    }

    // textarea
    if (element.tagName === 'TEXTAREA') {
      element.focus();
      element.select();
      const success = document.execCommand('insertText', false, newValue);
      if (success) {
        element.setSelectionRange(newValue.length, newValue.length);
      } else {
        element.value = newValue;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.setSelectionRange(newValue.length, newValue.length);
      }
      return true;
    }

    return false;
  }

  AIC.Insert = {
    async intoChat(text) {
      const platform = AIC.Platform.detect();
      let element = null;

      switch (platform) {
        case 'chatgpt':
          element =
            document.querySelector('main form textarea') ||
            document.querySelector('textarea[data-virtualkeyboard="true"]') ||
            document.querySelector('textarea[placeholder*="Ask"]');
          break;

        case 'claude':
          element = document.querySelector('div[contenteditable="true"]');
          break;

        case 'gemini':
          element =
            document.querySelector('rich-textarea .ql-editor') ||
            document.querySelector('.input-area textarea');
          break;

        case 'm365copilot': {
          const selectors = [
            'textarea[data-testid="chat-input"]',
            'textarea[placeholder*="Ask"]',
            'textarea[placeholder*="Type"]',
            'textarea[placeholder*="message"]',
            'textarea[aria-label*="Type a message"]',
            'textarea[aria-label*="Chat"]',
            '[data-automationid="textInput"] textarea',
            '.ms-TextField-field textarea',
            '.fui-Input__input',
            '.fui-Textarea__textarea',
            '[role="textbox"]',
            '[contenteditable="true"][role="textbox"]',
            '.chat-input-container textarea',
            '.message-box textarea',
            'div[class*="chatInput"] textarea',
            'div[class*="messageBox"] textarea',
            '[data-testid*="chat"] textarea',
            'div[class*="chat"] textarea'
          ];
          for (const s of selectors) {
            element = document.querySelector(s);
            if (element) break;
          }
          if (!element) {
            const all = document.querySelectorAll('textarea, [contenteditable="true"]');
            for (const el of all) {
              if (AIC.DOM.isVisible(el)) { element = el; break; }
            }
          }
          break;
        }

        case 'copilotstudio': {
          const selectors = [
            'textarea[data-testid="chat-input"]',
            'textarea[placeholder*="Type"]',
            'textarea[placeholder*="message"]',
            'textarea[aria-label*="message"]',
            'textarea[aria-label*="chat"]',
            'main textarea',
            '[role="main"] textarea',
            '.chat-input textarea',
            '.message-input textarea',
            'div[data-testid="chat-panel"] textarea',
            '.ms-TextField-field[type="text"]',
            'input[role="textbox"]'
          ];
          for (const s of selectors) {
            element = document.querySelector(s);
            if (element) break;
          }
          break;
        }

        case 'copilot':
          element =
            document.querySelector('#searchbox textarea') ||
            document.querySelector('textarea[placeholder*="Ask"]') ||
            document.querySelector('.cib-serp-main textarea');
          break;

        default:
          return false;
      }

      if (!element) return false;
      return insertIntoElement(element, text);
    }
  };
})();
