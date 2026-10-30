// Display preferences stay in this browser and sync with the local device preview.
(() => {
  'use strict';

  const key = 'noteable.appearance';
  const modes = ['dark', 'light', 'grayscale'];
  let preference = { mode: 'dark', updatedAt: 0 };

  function valid(value) {
    return value &&
      modes.includes(value.mode) &&
      Number.isSafeInteger(value.updatedAt) &&
      value.updatedAt >= 0;
  }

  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (valid(stored)) preference = stored;
  } catch {
    // The chooser still works when browser storage is unavailable.
  }

  function paint() {
    document.documentElement.dataset.appearance = preference.mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', preference.mode === 'dark' ? '#0a1028' : '#f1f1ed',
    );
    document.querySelectorAll('[data-appearance-select]').forEach((select) => {
      select.value = preference.mode;
    });
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(preference));
    } catch {
      // Keep the current choice for this visit.
    }
  }

  function share() {
    const message = { type: 'noteable:appearance', preference };
    if (window.parent !== window) window.parent.postMessage(message, '*');
    document.getElementById('appPreview')?.contentWindow?.postMessage(message, '*');
  }

  function receive(next) {
    if (!valid(next) || next.updatedAt <= preference.updatedAt) return;
    preference = { mode: next.mode, updatedAt: next.updatedAt };
    paint();
    save();
    share();
  }

  // Apply the stored choice before the page is painted.
  paint();
  document.addEventListener('DOMContentLoaded', () => {
    paint();
    document.querySelectorAll('[data-appearance-select]').forEach((select) => {
      select.addEventListener('change', () => {
        if (!modes.includes(select.value)) return;
        preference = {
          mode: select.value,
          updatedAt: Math.max(Date.now(), preference.updatedAt + 1),
        };
        paint();
        save();
        share();
      });
    });
    document.getElementById('appPreview')?.addEventListener('load', share);
    share();
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== key) return;
    try {
      receive(JSON.parse(event.newValue));
    } catch {
      // Ignore unrelated or incomplete saved preferences.
    }
  });
  window.addEventListener('message', (event) => {
    const preview = document.getElementById('appPreview')?.contentWindow;
    const fromPreview = preview && event.source === preview;
    const fromParent = window.parent !== window && event.source === window.parent;
    if ((fromPreview || fromParent) && event.data?.type === 'noteable:appearance') {
      receive(event.data.preference);
    }
  });
})();
