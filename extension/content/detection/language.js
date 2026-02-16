(() => {
  'use strict';

  const AIC = window.AIC;

  AIC.Language = {
    detect(codeEl) {
      const classes = (codeEl?.className || '') + ' ' + (codeEl?.closest('pre')?.className || '');
      const langMap = [
        [/\b(rust)\b/i, 'rs'],
        [/\b(javascript|js)\b/i, 'js'],
        [/\b(typescript|ts)\b/i, 'ts'],
        [/\b(python|py)\b/i, 'py'],
        [/\b(bash|shell|sh)\b/i, 'sh'],
        [/\b(json)\b/i, 'json'],
        [/\b(yaml|yml)\b/i, 'yaml'],
        [/\b(toml)\b/i, 'toml'],
        [/\b(sql)\b/i, 'sql'],
        [/\b(html)\b/i, 'html'],
        [/\b(css)\b/i, 'css'],
        [/\b(markdown|md)\b/i, 'md'],
        [/\b(go|golang)\b/i, 'go'],
        [/\b(java)\b/i, 'java'],
        [/\b(c|cpp|c\+\+)\b/i, 'cpp'],
        [/\b(ruby|rb)\b/i, 'rb'],
        [/\b(php)\b/i, 'php'],
        [/\b(swift)\b/i, 'swift'],
        [/\b(kotlin|kt)\b/i, 'kt'],
        [/\b(dockerfile)\b/i, 'dockerfile']
      ];
      for (const [pattern, ext] of langMap) {
        if (pattern.test(classes)) return ext;
      }
      return 'txt';
    }
  };
})();
