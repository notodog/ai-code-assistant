(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.FilenameDetector = {
    detect(preElement, codeContent, languageExt) {
      const codeBlock = preElement.querySelector('code') || preElement;
      const surroundingText = this.getSurroundingText(preElement);
      return (
        this.fromCodeBlockHeader(preElement) ||
        this.fromConversationContext(surroundingText) ||
        this.fromFirstLineComment(codeContent) ||
        this.fromCodeStructure(codeContent, languageExt) ||
        this.fromMarkdownContext(preElement) ||
        this.generateSmartDefault(codeContent, languageExt)
      );
    },

    getSurroundingText(preElement) {
      const texts = [];
      let sibling = preElement.previousElementSibling;
      for (let i = 0; i < 5 && sibling; i++) {
        texts.push(sibling.textContent || '');
        sibling = sibling.previousElementSibling;
      }

      const parent = preElement.parentElement;
      if (parent) {
        let parentSibling = parent.previousElementSibling;
        for (let i = 0; i < 3 && parentSibling; i++) {
          texts.push(parentSibling.textContent || '');
          parentSibling = parentSibling.previousElementSibling;
        }
      }

      const grandparent = parent?.parentElement;
      if (grandparent) {
        let gpSibling = grandparent.previousElementSibling;
        for (let i = 0; i < 2 && gpSibling; i++) {
          texts.push(gpSibling.textContent || '');
          gpSibling = gpSibling.previousElementSibling;
        }
      }

      return texts.join(' ').substring(0, 3000);
    },

    fromCodeBlockHeader(preElement) {
      let header = preElement.previousElementSibling;
      if (!header && preElement.parentElement) header = preElement.parentElement.previousElementSibling;

      if (header) {
        const headerText = header.textContent?.trim() || '';
        const match = headerText.match(/^([a-zA-Z0-9_\-./\\]+\.([a-zA-Z0-9]+))$/);
        if (match) return { filename: match[1], source: 'header', confidence: 'high' };
      }

      const codeEl = preElement.querySelector('code');
      if (codeEl) {
        const dataFile =
          codeEl.getAttribute('data-file') ||
          codeEl.getAttribute('data-filename') ||
          preElement.getAttribute('data-file');
        if (dataFile) return { filename: dataFile, source: 'data-attr', confidence: 'high' };
      }

      const title = preElement.getAttribute('title') || codeEl?.getAttribute('title');
      if (title && /\.[a-z0-9]+$/i.test(title)) {
        return { filename: title, source: 'title-attr', confidence: 'high' };
      }

      return null;
    },

    fromConversationContext(text) {
      const patterns = [
        { re: /(?:save|create|write)\s+(?:this\s+)?(?:as|to|in)\s+[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]?/i, conf: 'high' },
        { re: /(?:file|filename|name)[:\s]+[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]?/i, conf: 'high' },
        { re: /(?:called|named)\s+[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]?/i, conf: 'high' },
        { re: /(?:update|modify|edit|change)\s+(?:your\s+)?[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]?/i, conf: 'high' },
        { re: /(?:here'?s?|this is)\s+(?:the\s+)?(?:updated?\s+)?[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]?/i, conf: 'medium' },
        { re: /[`'"]([a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]/i, conf: 'medium' },
        { re: /[`'"]([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]/i, conf: 'low' },
        { re: /\bin\s+[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]?/i, conf: 'medium' },
        { re: /^#+\s*[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]?\s*$/m, conf: 'high' }
      ];

      for (const { re, conf } of patterns) {
        const match = text.match(re);
        if (match && match[1]) {
          const filename = match[1];
          if (this.isValidFilename(filename)) return { filename, source: 'context', confidence: conf };
        }
      }
      return null;
    },

    fromFirstLineComment(code) {
      const lines = code.trim().split('\n').slice(0, 3);
      const patterns = [
        /^\/\/\s*(?:file(?:name|path)?[:\s]+)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i,
        /^#\s*(?:file(?:name|path)?[:\s]+)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i,
        /^\/\*+\s*(?:@file\s+)?(?:file(?:name|path)?[:\s]+)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i,
        /^<!--\s*(?:file(?:name|path)?[:\s]+)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i,
        /^--\s*(?:file(?:name|path)?[:\s]+)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i
      ];

      for (const line of lines) {
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match && match[1] && this.isValidFilename(match[1])) {
            return { filename: match[1], source: 'comment', confidence: 'high' };
          }
        }
      }
      return null;
    },

    fromCodeStructure(code, ext) {
      const rules = [
        // Rust
        { test: /^fn\s+main\s*\(/m, ext: 'rs', name: 'main.rs', conf: 'high' },
        { test: /^#\[\s*cfg\(test\)\s*\]/m, ext: 'rs', name: 'lib.rs', conf: 'medium' },
        { test: /^pub\s+mod\s+/m, ext: 'rs', name: 'lib.rs', conf: 'medium' },
        { test: /^mod\s+tests\s*\{/m, ext: 'rs', name: 'lib.rs', conf: 'medium' },
        {
          test: /^(?:pub\s+)?struct\s+(\w+)/m,
          ext: 'rs',
          nameFn: (m) => this.toSnakeCase(m[1]) + '.rs',
          conf: 'low'
        },

        // Python
        { test: /^if\s+__name__\s*==\s*['"]__main__['"]/m, ext: 'py', name: 'main.py', conf: 'high' },
        { test: /^from\s+flask\s+import/m, ext: 'py', name: 'app.py', conf: 'medium' },
        { test: /^from\s+django/m, ext: 'py', name: 'views.py', conf: 'low' },
        { test: /^import\s+pytest/m, ext: 'py', name: 'test_main.py', conf: 'medium' },
        { test: /^def\s+test_/m, ext: 'py', name: 'test_main.py', conf: 'medium' },
        {
          test: /^class\s+(\w+)(?:\(.*\))?:/m,
          ext: 'py',
          nameFn: (m) => this.toSnakeCase(m[1]) + '.py',
          conf: 'low'
        },

        // JS/TS
        { test: /^['"]use client['"]/m, ext: 'jsx', name: 'page.tsx', conf: 'medium' },
        { test: /^['"]use server['"]/m, ext: 'js', name: 'actions.ts', conf: 'medium' },
        {
          test: /^(?:export\s+)?(?:default\s+)?function\s+(\w+)/m,
          extMatch: /^[jt]sx?$/,
          nameFn: (m, ext2) => {
            const name = m[1];
            if (/^[A-Z]/.test(name)) return `${name}.${ext2 === 'ts' ? 'tsx' : 'jsx'}`;
            return null;
          },
          conf: 'medium'
        },
        {
          test: /^export\s+default\s+function\s+(\w+)/m,
          ext: 'js',
          nameFn: (m) => `${m[1]}.js`,
          conf: 'low'
        },

        // Go
        { test: /^package\s+main\b/m, ext: 'go', name: 'main.go', conf: 'high' },
        { test: /^func\s+Test\w+\s*\(/m, ext: 'go', name: 'main_test.go', conf: 'medium' },

        // Config / Common
        { test: /^\[package\]\s*$/m, ext: 'toml', name: 'Cargo.toml', conf: 'high' },
        { test: /^\[dependencies\]/m, ext: 'toml', name: 'Cargo.toml', conf: 'medium' },
        { test: /^\[tool\.poetry\]/m, ext: 'toml', name: 'pyproject.toml', conf: 'high' },
        { test: /^\[build-system\]/m, ext: 'toml', name: 'pyproject.toml', conf: 'medium' },
        { test: /^{\s*"name"\s*:\s*"[^"]+"\s*,\s*"version"/m, ext: 'json', name: 'package.json', conf: 'high' },
        { test: /^{\s*"compilerOptions"/m, ext: 'json', name: 'tsconfig.json', conf: 'high' },
        { test: /"manifest_version"\s*:\s*\d/m, ext: 'json', name: 'manifest.json', conf: 'high' },
        { test: /^{\s*"scripts"\s*:/m, ext: 'json', name: 'package.json', conf: 'medium' },
        { test: /^version:\s*['"]?\d/m, ext: 'yaml', name: 'docker-compose.yml', conf: 'low' },
        { test: /^services:\s*$/m, ext: 'yaml', name: 'docker-compose.yml', conf: 'medium' },
        { test: /^FROM\s+\w+/m, name: 'Dockerfile', conf: 'high' },
        { test: /^apiVersion:\s*apps\/v1/m, ext: 'yaml', name: 'deployment.yaml', conf: 'medium' },
        { test: /^@tailwind/m, ext: 'css', name: 'globals.css', conf: 'medium' },

        // Markup
        { test: /^<!DOCTYPE html>/i, ext: 'html', name: 'index.html', conf: 'medium' },
        { test: /^<html/i, ext: 'html', name: 'index.html', conf: 'low' },

        // Shell
        { test: /^#!\/usr\/bin\/env\s+bash/m, ext: 'sh', name: 'script.sh', conf: 'medium' },
        { test: /^#!\/bin\/bash/m, ext: 'sh', name: 'script.sh', conf: 'medium' },
        { test: /^#!\/usr\/bin\/env\s+sh/m, ext: 'sh', name: 'script.sh', conf: 'medium' },
        { test: /^#!\/usr\/bin\/env\s+zsh/m, ext: 'sh', name: 'script.zsh', conf: 'medium' },

        // CSS
        { test: /^:root\s*{/m, ext: 'css', name: 'styles.css', conf: 'low' },

        // SQL
        { test: /^CREATE\s+TABLE/im, ext: 'sql', name: 'schema.sql', conf: 'medium' },
        { test: /^CREATE\s+DATABASE/im, ext: 'sql', name: 'init.sql', conf: 'medium' },
        { test: /^INSERT\s+INTO/im, ext: 'sql', name: 'seed.sql', conf: 'low' }
      ];

      for (const rule of rules) {
        if (rule.ext && ext !== rule.ext) continue;
        if (rule.extMatch && !rule.extMatch.test(ext)) continue;

        const match = code.match(rule.test);
        if (!match) continue;

        let filename;
        if (rule.nameFn) {
          filename = rule.nameFn(match, ext);
          if (!filename) continue;
        } else {
          filename = rule.name;
        }

        return { filename, source: 'code-structure', confidence: rule.conf };
      }

      return null;
    },

    fromMarkdownContext(preElement) {
      const elementsToCheck = [];
      let el = preElement.previousElementSibling;
      for (let i = 0; i < 3 && el; i++) {
        elementsToCheck.push(el);
        el = el.previousElementSibling;
      }
      if (preElement.parentElement) {
        let parentEl = preElement.parentElement.previousElementSibling;
        for (let i = 0; i < 3 && parentEl; i++) {
          elementsToCheck.push(parentEl);
          parentEl = parentEl.previousElementSibling;
        }
      }

      for (const node of elementsToCheck) {
        const text = node.textContent?.trim() || '';
        const patterns = [
          /^#+\s*[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]?\s*$/,
          /^\*\*[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]?\*\*$/,
          /^File:\s*[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`'"]?$/i
        ];
        for (const p of patterns) {
          const m = text.match(p);
          if (m && m[1] && this.isValidFilename(m[1])) {
            return { filename: m[1], source: 'markdown', confidence: 'high' };
          }
        }
      }
      return null;
    },

    generateSmartDefault(code, ext) {
      const extractors = [
        { re: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, suffix: ext },
        { re: /^(?:export\s+)?class\s+(\w+)/m, suffix: ext },
        { re: /^(?:export\s+)?const\s+(\w+)\s*=/m, suffix: ext },
        { re: /^(?:pub\s+)?(?:struct|enum)\s+(\w+)/m, suffix: 'rs' }
      ];

      for (const { re, suffix } of extractors) {
        const match = code.match(re);
        if (match && match[1]) {
          const name = this.toSnakeCase(match[1]);
          return { filename: `${name}.${suffix || ext}`, source: 'extracted', confidence: 'low' };
        }
      }

      return {
        filename: `snippet-${Date.now().toString(36)}.${ext}`,
        source: 'generated',
        confidence: 'none'
      };
    },

    toSnakeCase(str) {
      return str
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')
        .replace(/__+/g, '_');
    },

    isValidFilename(name) {
      if (!name || name.length > 255) return false;
      if (name.startsWith('.') && name.split('.').length < 3) return false;
      if (/^[0-9]/.test(name)) return false;
      if (!/\.[a-z0-9]{1,10}$/i.test(name)) return false;
      if (/[<>:"\n?*]/.test(name)) return false;
      return true;
    }
  };
})();
