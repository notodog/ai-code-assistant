const fields = ['projectName', 'defaultSubdir', 'namingStrategy'];

// Load saved settings
chrome.storage.sync.get(fields, (data) => {
  fields.forEach(field => {
    if (data[field]) {
      document.getElementById(field).value = data[field];
    }
  });
});

// Save settings
document.getElementById('save').addEventListener('click', () => {
  const settings = {};
  fields.forEach(field => {
    settings[field] = document.getElementById(field).value;
  });
  
  chrome.storage.sync.set(settings, () => {
    const msg = document.getElementById('savedMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
  });
});
