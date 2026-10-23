// Browser-only prototype. No network calls, credentials, or external libraries.
(() => {
  'use strict';
  if (window.self !== window.top)
    document.documentElement.classList.add('embedded-preview');

  // Storage keys and note colors
  const KEYS = {
    notes: 'stickyNotesPrototype.notes',
    draft: 'stickyNotesPrototype.draftV2',
    legacyDraft: 'stickyNotesPrototype.draft',
    templates: 'stickyNotesPrototype.templates',
  };
  const COLORS = [
    ['Sun', '#f5df87'],
    ['Lilac', '#d9cfee'],
    ['Blue', '#c8dce9'],
    ['Rose', '#efc8c6'],
    ['Sage', '#d7dfbe'],
    ['Peach', '#f1d1ad'],
  ];
  const LEGACY_COLORS = [
    '#ffe16a',
    '#a9dbe8',
    '#f5aabd',
    '#c7e59b',
    '#c8b2ec',
    '#ffc28f',
  ];
  const $ = (id) => document.getElementById(id);

  // Note data helpers
  const makeId = () =>
    globalThis.crypto?.randomUUID?.() ||
    `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const cleanCollection = (value) =>
    typeof value === 'string' && value.trim()
      ? value.trim().replace(/\s+/g, ' ').slice(0, 40)
      : 'Inbox';
  const validDate = (value) =>
    typeof value === 'string' && Number.isFinite(Date.parse(value));
  const colorValue = (value) =>
    COLORS.some((c) => c[1] === value) || LEGACY_COLORS.includes(value)
      ? value
      : COLORS[0][1];
  const blankField = (label = 'Notes') => ({
    id: makeId(),
    label,
    text: '',
    mode: 'text',
    strokes: [],
  });
  const blankDraft = (color = COLORS[0][1]) => ({
    title: '',
    color,
    reminderAt: '',
    fields: [blankField()],
  });

  // Browser storage and saved data
  let storageWarning = false;
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      storageWarning = true;
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      toast('Browser storage is full or unavailable. Your changes could not be saved.');
      return false;
    }
  }
  function normalizeFields(raw, fallback = '') {
    if (!Array.isArray(raw) || !raw.length) return [{ ...blankField(), text: fallback }];
    return raw
      .filter((f) => f && typeof f === 'object')
      .map((f) => ({
        id: makeId(),
        label: typeof f.label === 'string' ? f.label.slice(0, 60) : 'Notes',
        text: typeof f.text === 'string' ? f.text : '',
        mode: f.mode === 'draw' ? 'draw' : 'text',
        strokes: Array.isArray(f.strokes)
          ? f.strokes
              .filter(Array.isArray)
              .map((s) =>
                s.filter(
                  (p) =>
                    Array.isArray(p) &&
                    p.length === 2 &&
                    p.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
                ),
              )
              .filter((s) => s.length)
          : [],
      }));
  }
  function normalizeNote(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const now = new Date().toISOString();
    const fields = normalizeFields(
      raw.fields,
      typeof raw.text === 'string' ? raw.text : '',
    );
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
      title: typeof raw.title === 'string' ? raw.title.slice(0, 160) : '',
      fields: fields.length ? fields : [blankField()],
      text: typeof raw.text === 'string' ? raw.text : '',
      color: colorValue(raw.color),
      category: cleanCollection(raw.category),
      pinned: Boolean(raw.pinned),
      createdAt: validDate(raw.createdAt) ? raw.createdAt : now,
      updatedAt: validDate(raw.updatedAt) ? raw.updatedAt : now,
      reminderAt: validDate(raw.reminderAt) ? raw.reminderAt : '',
      reminderDismissed: Boolean(raw.reminderDismissed),
      sortPosition: Number.isFinite(raw.sortPosition) ? raw.sortPosition : index,
    };
  }

  // Restore notes and the unfinished draft
  const saved = read(KEYS.notes, []);
  let notes = Array.isArray(saved) ? saved.map(normalizeNote).filter(Boolean) : [];
  let draft = blankDraft();
  const storedDraft = read(KEYS.draft, null);
  if (storedDraft && typeof storedDraft === 'object') {
    draft = {
      ...draft,
      title: typeof storedDraft.title === 'string' ? storedDraft.title : '',
      color: colorValue(storedDraft.color),
      reminderAt: validDate(storedDraft.reminderAt) ? storedDraft.reminderAt : '',
      fields: normalizeFields(storedDraft.fields),
    };
    if (!draft.fields.length) draft.fields = [blankField()];
  } else {
    try {
      draft.fields[0].text = localStorage.getItem(KEYS.legacyDraft) || '';
    } catch {
      storageWarning = true;
    }
  }

  // Built-in and saved templates
  const builtins = [
    { id: 'class', name: 'Class notes', labels: ['Notes', 'Key concepts', 'Questions'] },
    {
      id: 'meeting',
      name: 'Meeting notes',
      labels: ['Notes', 'Decisions', 'Action items'],
    },
    { id: 'idea', name: 'An idea', labels: ['Idea', 'Next steps'] },
  ];
  const savedTemplates = read(KEYS.templates, []);
  let templates = Array.isArray(savedTemplates)
    ? savedTemplates.filter(
        (t) =>
          t &&
          typeof t.id === 'string' &&
          typeof t.name === 'string' &&
          Array.isArray(t.labels) &&
          t.labels.every((l) => typeof l === 'string'),
      )
    : [];

  // Current view and editor state
  let editor = null;
  let view = 'capture';
  let toastTimer;
  const announcedReminders = new Set();
  const hasContent = (note) =>
    note.fields.some((f) => f.text.trim() || f.strokes.some((s) => s.length));
  const titleOf = (note) =>
    note.title.trim() ||
    note.fields
      .map((f) => f.text.trim().split('\n')[0])
      .find(Boolean)
      ?.slice(0, 75) ||
    'Drawing';
  const dateLabel = (value) =>
    new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
      new Date(value),
    );
  const reminderLabel = (value) =>
    new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  const localDate = (value) => {
    if (!validDate(value)) return '';
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const fromInputDate = (value) =>
    value && Number.isFinite(new Date(value).getTime())
      ? new Date(value).toISOString()
      : '';
  const due = (note) =>
    note.reminderAt &&
    !note.reminderDismissed &&
    Date.parse(note.reminderAt) <= Date.now();
  const pending = (note) => note.reminderAt && !note.reminderDismissed;


  // DOM helpers and messages
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function button(text, className, action) {
    const el = node('button', className, text);
    el.type = 'button';
    el.addEventListener('click', action);
    return el;
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4800);
  }

  // Draft persistence and capture screen
  function persistDraft() {
    const saved = write(KEYS.draft, draft);
    $('draftStatus').textContent = saved
      ? hasContent(draft) || draft.title
        ? 'Draft saved on this device'
        : 'Empty draft'
      : 'Draft not saved — storage unavailable';
    $('saveCapture').disabled = !hasContent(draft);
  }
  function paintColors(container, model, changed) {
    container.replaceChildren();
    const choices = COLORS.some((c) => c[1] === model.color)
      ? COLORS
      : [...COLORS, ['Original', model.color]];
    choices.forEach(([name, color]) => {
      const el = button('', 'swatch', () => {
        model.color = color;
        paintColors(container, model, changed);
        changed();
      });
      el.style.setProperty('--swatch', color);
      el.setAttribute('aria-label', `${name} note color`);
      el.title = name;
      el.setAttribute('aria-pressed', String(model.color === color));
      container.append(el);
    });
  }
  function renderCapture() {
    $('draftTitle').value = draft.title;
    $('draftReminder').value = localDate(draft.reminderAt);
    $('draftReminder').dispatchEvent(new Event('picker-sync'));
    $('captureOptions').hidden = !draft.reminderAt;
    $('captureOptionsButton').setAttribute(
      'aria-expanded',
      String(Boolean(draft.reminderAt)),
    );
    $('capturePad').style.setProperty('--note', draft.color);
    paintColors($('captureColors'), draft, () => {
      $('capturePad').style.setProperty('--note', draft.color);
      persistDraft();
    });
    renderFields($('captureFields'), draft, persistDraft);
    $('saveCapture').disabled = !hasContent(draft);
    $('draftStatus').textContent = hasContent(draft)
      ? 'Draft restored on this device'
      : 'Empty draft';
  }

  // Text fields and drawing tools
  function renderFields(container, model, changed) {
    container.replaceChildren();
    model.fields.forEach((field, index) => {
      const section = node('section', 'note-field');
      const head = node('div', 'field-head');
      const name = node('input', 'field-name');
      name.value = field.label;
      name.placeholder = 'Field name';
      name.maxLength = 60;
      name.setAttribute('aria-label', `Field ${index + 1} name`);
      name.addEventListener('input', () => {
        field.label = name.value;
        changed();
      });
      head.append(name);
      const tools = node('div', 'field-tools');
      const textButton = button('Type', '', () => switchMode('text'));
      const drawButton = button('Draw', '', () => switchMode('draw'));
      textButton.setAttribute('aria-pressed', String(field.mode === 'text'));
      drawButton.setAttribute('aria-pressed', String(field.mode === 'draw'));
      tools.append(textButton, drawButton);
      if (model.fields.length > 1)
        tools.append(
          button('×', '', () => {
            if (
              (field.text || field.strokes.length) &&
              !confirm('Remove this field and its content?')
            )
              return;
            model.fields.splice(index, 1);
            changed();
            renderFields(container, model, changed);
          }),
        );
      if (model.fields.length > 1)
        tools.lastChild.setAttribute('aria-label', `Remove field ${index + 1}`);
      head.append(tools);
      section.append(head);
      const textarea = node('textarea', 'field-text');
      textarea.value = field.text;
      textarea.placeholder = index ? 'Write here…' : 'Write a note…';
      textarea.setAttribute('aria-label', `Field ${index + 1} text`);
      textarea.addEventListener('input', () => {
        field.text = textarea.value;
        changed();
      });
      textarea.hidden = field.mode !== 'text';
      section.append(textarea);
      const canvas = node('canvas', 'drawing');
      canvas.width = 1200;
      canvas.height = 360;
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute(
        'aria-label',
        `Field ${index + 1} drawing. Use a mouse, touch, or stylus. Use Type for a text alternative.`,
      );
      canvas.hidden = field.mode !== 'draw';
      section.append(canvas);
      const help = node('div');
      help.hidden = field.mode !== 'draw';
      help.append(
        node(
          'p',
          'drawing-help',
          'Draw with a mouse, finger, or stylus. Ink stays with this field. Type and ink are both saved.',
        ),
      );
      help.append(
        button('Undo stroke', 'text-button', () => {
          field.strokes.pop();
          redraw(canvas, field.strokes);
          changed();
        }),
      );
      section.append(help);
      container.append(section);
      bindDrawing(canvas, field, changed);
      redraw(canvas, field.strokes);
      function switchMode(mode) {
        field.mode = mode;
        textarea.hidden = mode !== 'text';
        canvas.hidden = mode !== 'draw';
        help.hidden = mode !== 'draw';
        textButton.setAttribute('aria-pressed', String(mode === 'text'));
        drawButton.setAttribute('aria-pressed', String(mode === 'draw'));
        changed();
        if (mode === 'text') textarea.focus();
        else canvas.focus();
      }
    });
  }

  // Drawing strokes
  function redraw(canvas, strokes) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#354333';
    ctx.fillStyle = '#354333';
    strokes.forEach((points) => {
      if (!points.length) return;
      if (points.length === 1) {
        ctx.beginPath();
        ctx.arc(
          points[0][0] * canvas.width,
          points[0][1] * canvas.height,
          2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        return;
      }
      ctx.beginPath();
      points.forEach(([x, y], i) =>
        i
          ? ctx.lineTo(x * canvas.width, y * canvas.height)
          : ctx.moveTo(x * canvas.width, y * canvas.height),
      );
      ctx.stroke();
    });
  }
  function bindDrawing(canvas, field, changed) {
    let activePointer = null;
    const point = (event) => {
      const r = canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)),
        Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)),
      ];
    };
    canvas.addEventListener('pointerdown', (event) => {
      if (activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0))
        return;
      event.preventDefault();
      activePointer = event.pointerId;
      canvas.setPointerCapture(activePointer);
      field.strokes.push([point(event)]);
      redraw(canvas, field.strokes);
      changed();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (activePointer !== event.pointerId) return;
      field.strokes[field.strokes.length - 1].push(point(event));
      redraw(canvas, field.strokes);
    });
    const finish = (event) => {
      if (activePointer === event.pointerId) {
        activePointer = null;
        changed();
      }
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    canvas.addEventListener('lostpointercapture', finish);
  }
  function addField(model, container, changed) {
    model.fields.push(blankField(''));
    changed();
    renderFields(container, model, changed);
    container.lastChild.querySelector('input').focus();
  }

  // Save a captured note
  function saveCapture() {
    if (!hasContent(draft)) return;
    const now = new Date().toISOString();
    const note = {
      ...copy(draft),
      id: makeId(),
      category: 'Inbox',
      pinned: false,
      createdAt: now,
      updatedAt: now,
      reminderDismissed: false,
      sortPosition: Math.max(-1, ...notes.map((n) => n.sortPosition)) + 1,
    };
    note.fields.forEach((f) => {
      f.label = f.label.trim() || 'Notes';
    });
    note.text = note.fields.map((f) => f.text).join('\n\n');
    if (!write(KEYS.notes, [...notes, note])) return;
    notes.push(note);
    draft = blankDraft(draft.color);
    // Clear the legacy draft only after the new note was safely written.
    try {
      localStorage.removeItem(KEYS.legacyDraft);
      localStorage.removeItem(KEYS.draft);
    } catch {
      // Saved note remains available.
    }
    $('templateSelect').value = '';
    renderCapture();
    renderNavigation();
    renderRecent();
    toast('Note saved.');
    $('captureFields').querySelector('textarea').focus();
    checkReminders();
  }

  // Navigation and recent notes
  function renderNavigation() {
    $('noteCount').textContent = notes.length;
    $('reminderCount').textContent = notes.filter(pending).length;
    const collections = [...new Set(['Inbox', ...notes.map((n) => n.category)])].sort(
      (a, b) => (a === 'Inbox' ? -1 : b === 'Inbox' ? 1 : a.localeCompare(b)),
    );
    $('collectionNav').replaceChildren();
    $('collectionOptions').replaceChildren();
    const selected = $('collectionFilter').value;
    $('collectionFilter').replaceChildren(new Option('All collections', ''));
    collections.forEach((name) => {
      const item = button('', 'nav-item collection', () => {
        $('collectionFilter').value = name;
        showView('review');
      });
      item.append(
        node('span', 'collection-dot'),
        node('span', '', name),
        node(
          'span',
          'nav-count',
          String(notes.filter((n) => n.category === name).length),
        ),
      );
      $('collectionNav').append(item);
      $('collectionFilter').append(new Option(name, name));
      $('collectionOptions').append(new Option(name, name));
    });
    $('collectionFilter').value = collections.includes(selected) ? selected : '';
  }
  function renderRecent() {
    $('recentCount').textContent = String(notes.length).padStart(2, '0');
    $('recentNotes').replaceChildren();
    if (!notes.length) {
      $('recentNotes').append(node('p', 'recent-empty', 'No saved notes.'));
      return;
    }
    notes
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 3)
      .forEach((note) => {
        const card = button('', 'recent-note', () => openEditor(note.id));
        card.style.setProperty('--note', note.color);
        const meta = node('div', 'recent-label');
        meta.append(
          node('span', '', note.category),
          node('span', '', dateLabel(note.createdAt)),
        );
        card.append(
          meta,
          node('h3', '', titleOf(note)),
          node(
            'p',
            '',
            note.fields
              .map((f) => f.text)
              .filter(Boolean)
              .join(' · ') || 'A captured sketch',
          ),
        );
        $('recentNotes').append(card);
      });
  }

  // Switch views and build the notebook
  function showView(next) {
    view = next;
    const capture = next === 'capture';
    $('captureView').hidden = !capture;
    $('reviewView').hidden = capture;
    ['capture', 'review', 'reminders'].forEach((name) => {
      const nav = $(`${name}Nav`);
      nav.classList.toggle('selected', name === next);
      if (name === next) nav.setAttribute('aria-current', 'page');
      else nav.removeAttribute('aria-current');
    });
    $('breadcrumb').textContent =
      `Workspace / ${capture ? 'Quick capture' : next === 'reminders' ? 'Reminders' : 'My notebook'}`;
    $('reviewHeading').textContent = next === 'reminders' ? 'Reminders' : 'My notebook';
    renderNavigation();
    renderRecent();
    if (!capture) renderBoard();
    if (capture)
      $('captureFields')
        .querySelector('textarea:not([hidden]), canvas:not([hidden])')
        ?.focus();
    else $('searchInput').focus();
  }
  function renderBoard() {
    const query = $('searchInput').value.trim().toLocaleLowerCase();
    const collection = $('collectionFilter').value;
    const matches = notes.filter(
      (n) =>
        (!collection || n.category === collection) &&
        (!$('pinnedFilter').checked || n.pinned) &&
        (view !== 'reminders' || pending(n)) &&
        [n.title, n.category, ...n.fields.flatMap((f) => [f.label, f.text])]
          .join('\n')
          .toLocaleLowerCase()
          .includes(query),
    );
    matches.sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || a.sortPosition - b.sortPosition,
    );
    const columns = new Map();
    matches.forEach((note) =>
      note.fields.forEach((field, i) => {
        const label = field.label.trim() || 'Notes';
        if (!columns.has(label)) columns.set(label, []);
        columns.get(label).push({ note, field, index: i });
      }),
    );
    $('reviewBoard').replaceChildren();
    columns.forEach((entries, label) => {
      const column = node('section', 'board-column');
      const heading = node('h2', 'column-heading', label);
      heading.append(node('span', '', String(entries.length).padStart(2, '0')));
      column.append(heading);
      entries.forEach(({ note, field, index }) =>
        column.append(renderCard(note, field, index)),
      );
      $('reviewBoard').append(column);
    });
    $('reviewEmpty').hidden = matches.length > 0;
    $('emptyMessage').textContent = !notes.length
      ? 'Save a note to get started.'
      : view === 'reminders' && !notes.some(pending)
        ? 'No pending reminders. Add one when capturing or editing a note.'
        : 'No notes match these filters. Try a different search or collection.';
    const overdue = notes.filter(due).length;
    $('dueBanner').hidden = !overdue;
    $('dueBanner').textContent =
      `${overdue} ${overdue === 1 ? 'reminder needs' : 'reminders need'} your attention. Open a note to reschedule, or mark its reminder done.`;
  }
  function renderCard(note, field, index) {
    const card = node('article', 'board-card');
    card.style.setProperty('--note', note.color);
    const meta = node('div', 'card-meta');
    meta.append(
      node('span', '', note.category),
      node('span', '', note.pinned ? '◆ Pinned' : dateLabel(note.updatedAt)),
    );
    const open = button('', 'card-open', () => openEditor(note.id));
    open.setAttribute(
      'aria-label',
      `Edit ${titleOf(note)}, ${field.label || 'Notes'} field`,
    );
    open.append(node('h3', '', titleOf(note)));
    if (field.text) open.append(node('p', '', field.text));
    if (field.strokes.length) {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 360;
      redraw(canvas, field.strokes);
      const img = node('img');
      img.src = canvas.toDataURL();
      img.alt = `Drawing in ${field.label || 'Notes'}`;
      open.append(img);
    }
    if (!field.text && !field.strokes.length) open.append(node('p', '', 'Empty field.'));
    card.append(meta, open);
    if (pending(note)) {
      card.append(
        node(
          'span',
          `reminder-badge${due(note) ? ' overdue' : ''}`,
          `${due(note) ? 'Due' : 'Reminder'} · ${reminderLabel(note.reminderAt)}`,
        ),
      );
      card.append(
        button('Mark reminder done', 'text-button', () =>
          updateNote(note.id, (n) => {
            n.reminderDismissed = true;
          }),
        ),
      );
    }
    const footer = node('div', 'card-footer');
    footer.append(node('span', '', `${index + 1} / ${note.fields.length} fields`));
    const actions = node('div');
    actions.append(
      button(note.pinned ? 'Unpin' : 'Pin', '', () =>
        updateNote(note.id, (n) => {
          n.pinned = !n.pinned;
        }),
      ),
      button('Edit ↗', '', () => openEditor(note.id)),
    );
    footer.append(actions);
    card.append(footer);
    return card;
  }

  // Update notes and open the editor
  function updateNote(id, mutate) {
    const updated = copy(notes);
    const note = updated.find((n) => n.id === id);
    if (!note) return;
    mutate(note);
    note.updatedAt = new Date().toISOString();
    if (!write(KEYS.notes, updated)) return;
    notes = updated;
    renderNavigation();
    renderRecent();
    renderBoard();
  }
  function openEditor(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    editor = copy(note);
    $('editTitle').value = editor.title;
    $('editCollection').value = editor.category;
    $('editReminder').value = localDate(editor.reminderAt);
    $('editPinned').checked = editor.pinned;
    $('editReminder').dispatchEvent(new Event('picker-sync'));
    $('editPaper').style.setProperty('--note', editor.color);
    paintColors($('editColors'), editor, () =>
      $('editPaper').style.setProperty('--note', editor.color),
    );
    renderFields($('editFields'), editor, () => {});
    $('editorMeta').textContent =
      `Captured ${reminderLabel(editor.createdAt)} · Changes save when you choose Save changes.`;
    $('noteDialog').showModal();
    $('editTitle').focus();
  }
  function editorValues() {
    editor.title = $('editTitle').value.trim();
    editor.category = cleanCollection($('editCollection').value);
    editor.pinned = $('editPinned').checked;
    const reminder = fromInputDate($('editReminder').value);
    if (reminder !== editor.reminderAt) editor.reminderDismissed = false;
    editor.reminderAt = reminder;
    editor.fields.forEach((f) => {
      f.label = f.label.trim() || 'Notes';
    });
    editor.text = editor.fields.map((f) => f.text).join('\n\n');
    return editor;
  }

  // Template menu and reminder checks
  function renderTemplates() {
    const selected = $('templateSelect').value;
    $('templateSelect').replaceChildren(new Option('Blank note', ''));
    [...builtins, ...templates].forEach((t) =>
      $('templateSelect').append(new Option(t.name, t.id)),
    );
    $('templateSelect').value = selected;
  }
  function checkReminders() {
    const fresh = notes.filter(
      (n) => due(n) && !announcedReminders.has(n.id + n.reminderAt),
    );
    fresh.forEach((n) => announcedReminders.add(n.id + n.reminderAt));
    if (fresh.length) toast(`Reminder: ${fresh.map(titleOf).join(' · ')}`);
    $('reminderCount').textContent = notes.filter(pending).length;
    if (view !== 'capture') renderBoard();
  }


  // Navigation, capture, and editor events
  $('captureNav').addEventListener('click', () => showView('capture'));
  $('reviewNav').addEventListener('click', () => {
    $('collectionFilter').value = '';
    showView('review');
  });
  $('remindersNav').addEventListener('click', () => {
    $('collectionFilter').value = '';
    $('searchInput').value = '';
    $('pinnedFilter').checked = false;
    showView('reminders');
  });
  document.querySelector('.brand').addEventListener('click', (e) => {
    e.preventDefault();
    showView('capture');
  });
  ['newNoteButton', 'emptyCaptureButton'].forEach((id) =>
    $(id).addEventListener('click', () => showView('capture')),
  );
  $('viewAllButton').addEventListener('click', () => {
    $('collectionFilter').value = '';
    showView('review');
  });
  $('draftTitle').addEventListener('input', () => {
    draft.title = $('draftTitle').value;
    persistDraft();
  });
  $('draftReminder').addEventListener('change', () => {
    draft.reminderAt = fromInputDate($('draftReminder').value);
    persistDraft();
  });
  $('captureOptionsButton').addEventListener('click', () => {
    const expanded = $('captureOptions').hidden;
    $('captureOptions').hidden = !expanded;
    $('captureOptionsButton').setAttribute('aria-expanded', String(expanded));
    if (expanded) $('draftReminder').nextElementSibling.querySelector('button').focus();
  });
  $('saveCapture').addEventListener('click', saveCapture);
  $('addCaptureField').addEventListener('click', () =>
    addField(draft, $('captureFields'), persistDraft),
  );
  $('addEditField').addEventListener('click', () =>
    addField(editor, $('editFields'), () => {}),
  );
  $('templateSelect').addEventListener('change', () => {
    if (
      (hasContent(draft) || draft.title.trim()) &&
      !confirm('Replace the current draft with this template?')
    ) {
      $('templateSelect').value = '';
      return;
    }
    const template = [...builtins, ...templates].find(
      (t) => t.id === $('templateSelect').value,
    );
    draft.fields = template
      ? template.labels.map((label) => blankField(label))
      : [blankField()];
    if (!draft.fields.length) draft.fields = [blankField()];
    draft.title = '';
    if (template?.color) draft.color = colorValue(template.color);
    renderCapture();
    persistDraft();
  });
  ['searchInput', 'collectionFilter', 'pinnedFilter'].forEach((id) =>
    $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderBoard),
  );
  $('closeEditor').addEventListener('click', () => $('noteDialog').close());
  $('noteDialog').addEventListener('close', () => {
    editor = null;
  });
  $('editorForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const note = editorValues();
    if (!hasContent(note)) {
      toast('Keep some text or a drawing, or use Delete note.');
      return;
    }
    note.updatedAt = new Date().toISOString();
    const updated = notes.map((n) => (n.id === note.id ? copy(note) : n));
    if (!write(KEYS.notes, updated)) return;
    notes = updated;
    $('noteDialog').close();
    renderNavigation();
    renderRecent();
    renderBoard();
    toast('Changes saved.');
    checkReminders();
  });
  $('deleteNote').addEventListener('click', () => {
    if (!confirm('Delete this note and all its fields? This cannot be undone.')) return;
    const updated = notes.filter((n) => n.id !== editor.id);
    if (!write(KEYS.notes, updated)) return;
    notes = updated;
    $('noteDialog').close();
    renderNavigation();
    renderRecent();
    renderBoard();
    toast('Note deleted.');
  });
  $('saveTemplate').addEventListener('click', () => {
    const name = prompt(
      'Template name. Only field labels and color are saved; your note content stays out.',
      $('editTitle').value || 'My template',
    );
    if (!name?.trim()) return;
    const updated = [
      ...templates,
      {
        id: makeId(),
        name: name.trim().slice(0, 60),
        color: editor.color,
        labels: editor.fields.map((f) => f.label.trim() || 'Notes'),
      },
    ];
    if (!write(KEYS.templates, updated)) return;
    templates = updated;
    renderTemplates();
    toast('Template ready in the capture menu.');
  });
  document.addEventListener('keydown', (event) => {
    if (document.querySelector('dialog[open]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && view === 'capture') {
      event.preventDefault();
      saveCapture();
    }
    if (
      event.key.toLowerCase() === 'n' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
    ) {
      event.preventDefault();
      showView('capture');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkReminders();
  });

  // Initial render
  renderCapture();
  renderTemplates();
  renderNavigation();
  renderRecent();
  $('captureNav').setAttribute('aria-current', 'page');
  if (storageWarning)
    toast(
      'Some browser data could not be read. Check your storage settings before saving.',
    );
  checkReminders();
  setInterval(checkReminders, 15000);
})();
