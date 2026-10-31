// Browser-only prototype. No network calls, credentials, or external libraries.
(() => {
  'use strict';
  if (window.self !== window.top)
    document.documentElement.classList.add('embedded-preview');

  // Browser storage and note colors
  const KEYS = {
    notes: 'noteable.notes',
    draft: 'noteable.draft',
    templates: 'noteable.templates',
    sort: 'noteable.sort',
  };
  const COLORS = [
    ['Black & Yellow', '#ffe600', '#111111', '#171717'],
    ['Blue & Red', '#0455e8', '#ff3030', '#ffffff'],
    ['Coral & Teal', '#00babe', '#ff947e', '#10282a'],
    ['Purple & Pink', '#7313a3', '#ff948b', '#ffffff'],
    ['Graphite & Lime', '#363636', '#c8ec00', '#ffffff'],
    ['Black & Orange', '#ff9900', '#111111', '#171717'],
  ];
  const builtins = [
    {
      id: 'cornell',
      name: 'Cornell notes',
      labels: ['Notes', 'Details', 'Summary'],
      slots: ['cues', 'notes', 'summary'],
      layout: 'cornell',
      color: COLORS[0][1],
    },
    {
      id: 'todo',
      name: 'To-do list',
      labels: ['To do', 'In progress', 'Done'],
      color: COLORS[2][1],
    },
    {
      id: 'class',
      name: 'Class notes',
      labels: ['Notes', 'Key concepts', 'Questions'],
      color: COLORS[1][1],
    },
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
    COLORS.some((c) => c[1] === value) ? value : COLORS[0][1];
  const fieldSlot = (value) =>
    ['cues', 'notes', 'summary'].includes(value) ? value : '';
  const noteLayout = (value) => (value === 'cornell' ? 'cornell' : 'stacked');
  const blankField = (label = 'Notes', slot = '') => ({
    label,
    text: '',
    mode: 'text',
    strokes: [],
    slot: fieldSlot(slot),
  });
  const blankDraft = () => ({
    title: '',
    category: 'Inbox',
    color: builtins[0].color,
    reminderAt: '',
    templateId: 'cornell',
    layout: 'cornell',
    fields: builtins[0].labels.map((label, index) =>
      blankField(label, builtins[0].slots[index]),
    ),
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
  function saveNoteLists(nextNotes, nextTrash = trash) {
    return write(KEYS.notes, [...nextNotes, ...nextTrash]);
  }
  function normalizeFields(raw) {
    if (!Array.isArray(raw)) return [blankField()];
    const fields = raw
      .filter((f) => f && typeof f === 'object')
      .map((f) => ({
        label: typeof f.label === 'string' ? f.label.slice(0, 60) : 'Notes',
        text: typeof f.text === 'string' ? f.text : '',
        mode: f.mode === 'draw' ? 'draw' : 'text',
        slot: fieldSlot(f.slot),
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
    return fields.length ? fields : [blankField()];
  }
  function normalizeNote(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const now = new Date().toISOString();
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
      title: typeof raw.title === 'string' ? raw.title.slice(0, 160) : '',
      fields: normalizeFields(raw.fields),
      color: colorValue(raw.color),
      category: cleanCollection(raw.category),
      pinned: Boolean(raw.pinned),
      createdAt: validDate(raw.createdAt) ? raw.createdAt : now,
      updatedAt: validDate(raw.updatedAt) ? raw.updatedAt : now,
      reminderAt: validDate(raw.reminderAt) ? raw.reminderAt : '',
      reminderDismissed: Boolean(raw.reminderDismissed),
      deletedAt: validDate(raw.deletedAt) ? raw.deletedAt : '',
      layout: noteLayout(raw.layout),
      sortPosition: Number.isFinite(raw.sortPosition) ? raw.sortPosition : index,
    };
  }
  function normalizeDraft(raw) {
    return {
      ...blankDraft(),
      title: typeof raw.title === 'string' ? raw.title.slice(0, 160) : '',
      category: cleanCollection(raw.category),
      color: colorValue(raw.color),
      reminderAt: validDate(raw.reminderAt) ? raw.reminderAt : '',
      templateId: typeof raw.templateId === 'string' ? raw.templateId : '',
      layout: noteLayout(raw.layout),
      fields: normalizeFields(raw.fields),
    };
  }
  function normalizeTemplate(raw) {
    return {
      id: raw.id,
      name: raw.name.slice(0, 60),
      labels: raw.labels.map((label) => label.slice(0, 60)),
      color: colorValue(raw.color),
      layout: noteLayout(raw.layout),
      slots: raw.labels.map((_, index) => fieldSlot(raw.slots?.[index])),
    };
  }

  // Restore notes and the unfinished draft
  const saved = read(KEYS.notes, []);
  const loadedNotes = Array.isArray(saved)
    ? saved.map(normalizeNote).filter(Boolean)
    : [];
  let notes = loadedNotes.filter((note) => !note.deletedAt);
  let trash = loadedNotes.filter((note) => note.deletedAt);
  let draft = blankDraft();
  const storedDraft = read(KEYS.draft, null);
  if (storedDraft && typeof storedDraft === 'object') {
    draft = normalizeDraft(storedDraft);
  }

  // Built-in and saved templates
  const savedTemplates = read(KEYS.templates, []);
  let templates = Array.isArray(savedTemplates)
    ? savedTemplates.filter(
        (t) =>
          t &&
          typeof t.id === 'string' &&
          typeof t.name === 'string' &&
          Array.isArray(t.labels) &&
          t.labels.every((l) => typeof l === 'string'),
      ).map(normalizeTemplate)
    : [];

  // Current view and editor state
  let editor = null;
  let editorSnapshot = null;
  let pendingBackup = null;
  const storedSort = read(KEYS.sort, 'updated');
  let sortOrder = ['updated', 'newest', 'title'].includes(storedSort) ? storedSort : 'updated';
  let view = 'capture';
  let relatedNoteId = null;
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
  function toast(message, action) {
    clearTimeout(toastTimer);
    $('toast').replaceChildren(node('span', '', message));
    if (action) $('toast').append(button(action.label, 'toast-action', action.run));
    $('toast').classList.add('visible');
    toastTimer = setTimeout(
      () => $('toast').classList.remove('visible'),
      action ? 10000 : 4800,
    );
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
    updateReminderButton();
  }
  function updateReminderButton() {
    $('captureOptionsButton').textContent = draft.reminderAt
      ? '◷ Edit reminder'
      : '◷ Remind me';
    $('captureOptionsButton').classList.toggle('has-reminder', Boolean(draft.reminderAt));
    if (draft.reminderAt)
      $('captureOptionsButton').title = reminderLabel(draft.reminderAt);
    else $('captureOptionsButton').removeAttribute('title');
  }
  function paintColors(container, model, changed) {
    container.replaceChildren();
    COLORS.forEach(([name, color, accent]) => {
      const el = button('', 'swatch', () => {
        model.color = color;
        paintColors(container, model, changed);
        changed();
      });
      el.style.setProperty('--swatch', color);
      el.style.setProperty('--swatch-accent', accent);
      el.setAttribute('aria-label', `${name} note color`);
      el.title = name;
      el.setAttribute('aria-pressed', String(model.color === color));
      container.append(el);
    });
  }
  function paintNote(element, color) {
    const theme = COLORS.find((choice) => choice[1] === color) || COLORS[0];
    element.style.setProperty('--note', theme[1]);
    element.style.setProperty('--note-accent', theme[2]);
    element.style.setProperty('--note-ink', theme[3]);
  }
  function renderCapture() {
    $('draftTitle').value = draft.title;
    $('draftCollection').value = draft.category;
    $('draftReminder').value = localDate(draft.reminderAt);
    $('draftReminder').dispatchEvent(new Event('picker-sync'));
    $('captureOptions').hidden = !draft.reminderAt;
    $('captureOptionsButton').setAttribute(
      'aria-expanded',
      String(Boolean(draft.reminderAt)),
    );
    paintNote($('capturePad'), draft.color);
    paintColors($('captureColors'), draft, () => {
      paintNote($('capturePad'), draft.color);
      persistDraft();
    });
    renderFields($('captureFields'), draft, persistDraft);
    $('saveCapture').disabled = !hasContent(draft);
    $('draftStatus').textContent = hasContent(draft)
      ? 'Draft restored on this device'
      : 'Empty draft';
    updateReminderButton();
  }

  // Text fields and drawing tools
  function renderFields(container, model, changed) {
    container.replaceChildren();
    container.classList.add('note-fields');
    container.dataset.layout = noteLayout(model.layout);
    renderFieldSuggestions();
    model.fields.forEach((field, index) => {
      const section = node('section', 'note-field');
      section.dataset.slot = field.slot || 'extra';
      const head = node('div', 'field-head');
      const nameLabel = node('label', 'field-name-label', 'Field name');
      const name = node('input', 'field-name');
      name.id = `${container.id}-name-${index}`;
      nameLabel.htmlFor = name.id;
      name.setAttribute('list', 'fieldNameOptions');
      name.setAttribute('aria-describedby', 'fieldGuide');
      name.value = field.label;
      name.placeholder = 'Field name';
      name.maxLength = 60;
      name.setAttribute('aria-label', `Field ${index + 1} name`);
      name.addEventListener('input', () => {
        field.label = name.value;
        changed();
      });
      nameLabel.append(name);
      head.append(nameLabel);
      const tools = node('div', 'field-tools');
      const textButton = button('Type', '', () => switchMode('text'));
      const drawButton = button('Draw', '', () => switchMode('draw'));
      textButton.setAttribute('aria-pressed', String(field.mode === 'text'));
      drawButton.setAttribute('aria-pressed', String(field.mode === 'draw'));
      tools.append(textButton, drawButton);
      if (model.fields.length > 1) {
        const remove = button('×', '', () => {
          if (
            (field.text || field.strokes.length) &&
            !confirm('Remove this field and its content?')
          )
            return;
          model.fields.splice(index, 1);
          changed();
          renderFields(container, model, changed);
        });
        remove.setAttribute('aria-label', `Remove field ${index + 1}`);
        tools.append(remove);
      }
      head.append(tools);
      section.append(head);
      const textarea = node('textarea', 'field-text');
      textarea.value = field.text;
      textarea.placeholder =
        field.slot === 'cues'
          ? 'Write a note…'
          : field.slot === 'summary'
            ? 'Sum up the main idea…'
            : model.layout === 'cornell' && field.slot === 'notes'
              ? 'Add details…'
              : index
                ? 'Write here…'
                : 'Write a note…';
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
      title: draft.title,
      color: draft.color,
      reminderAt: draft.reminderAt,
      layout: draft.layout,
      fields: copy(draft.fields),
      id: makeId(),
      category: cleanCollection(draft.category),
      pinned: false,
      createdAt: now,
      updatedAt: now,
      reminderDismissed: false,
      sortPosition: Math.max(-1, ...notes.map((n) => n.sortPosition)) + 1,
    };
    note.fields.forEach((f) => {
      f.label = f.label.trim() || 'Notes';
    });
    if (!saveNoteLists([...notes, note])) return;
    notes.push(note);
    draft = blankDraft();
    // Clear the draft only after the new note was safely written.
    try {
      localStorage.removeItem(KEYS.draft);
    } catch {
      // Saved note remains available.
    }
    renderTemplates();
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
    $('trashCount').textContent = trash.length;
    renderFieldSuggestions();
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
  function renderFieldSuggestions() {
    const labels = new Set([
      'Notes',
      'Questions',
      'Tasks',
      ...notes.flatMap((note) => note.fields.map((field) => field.label.trim())),
      ...draft.fields.map((field) => field.label.trim()),
      ...[...builtins, ...templates].flatMap((template) => template.labels),
    ]);
    $('fieldNameOptions').replaceChildren(
      ...[...labels]
        .filter(Boolean)
        .sort()
        .map((label) => new Option(label, label)),
    );
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
        paintNote(card, note.color);
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
    relatedNoteId = null;
    const capture = next === 'capture';
    $('captureView').hidden = !capture;
    $('reviewView').hidden = capture;
    ['capture', 'review', 'reminders', 'trash'].forEach((name) => {
      const nav = $(`${name}Nav`);
      nav.classList.toggle('selected', name === next);
      if (name === next) nav.setAttribute('aria-current', 'page');
      else nav.removeAttribute('aria-current');
    });
    $('breadcrumb').textContent =
      `Workspace / ${capture ? 'Quick capture' : next === 'reminders' ? 'Reminders' : next === 'trash' ? 'Recently Deleted' : 'My notebook'}`;
    $('reviewHeading').textContent =
      next === 'reminders'
        ? 'Reminders'
        : next === 'trash'
          ? 'Recently Deleted'
          : 'My notebook';
    $('collectionFilter').hidden = next === 'trash';
    document.querySelector('label[for="collectionFilter"]').hidden = next === 'trash';
    $('pinnedFilter').closest('label').hidden = next === 'trash';
    $('sortControl').hidden = next === 'trash';
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
    if (view === 'trash') {
      renderTrash();
      return;
    }
    $('reviewBoard').classList.remove('trash-board');
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
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (sortOrder === 'title'
          ? titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base', numeric: true })
          : Date.parse(sortOrder === 'newest' ? b.createdAt : b.updatedAt) -
            Date.parse(sortOrder === 'newest' ? a.createdAt : a.updatedAt)) ||
        a.sortPosition - b.sortPosition,
    );
    const columns = new Map();
    matches.forEach((note) =>
      note.fields.forEach((field) => {
        const label = field.label.trim() || 'Notes';
        if (!columns.has(label)) columns.set(label, []);
        columns.get(label).push({ note, field });
      }),
    );
    $('reviewBoard').replaceChildren();
    columns.forEach((entries, label) => {
      const column = node('section', 'board-column');
      const heading = node('h2', 'column-heading', label);
      heading.append(node('span', '', String(entries.length).padStart(2, '0')));
      column.append(heading);
      entries.forEach(({ note, field }) => column.append(renderCard(note, field)));
      $('reviewBoard').append(column);
    });
    renderRelatedCards();
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
  function renderCard(note, field) {
    const card = node('article', 'board-card');
    card.dataset.noteId = note.id;
    paintNote(card, note.color);
    const meta = node('div', 'card-meta');
    const actions = node('div', 'card-actions');
    const pin = button(note.pinned ? 'Unpin' : 'Pin', '', () =>
      updateNote(note.id, (n) => {
        n.pinned = !n.pinned;
      }),
    );
    pin.setAttribute('aria-pressed', String(note.pinned));
    actions.append(pin, button('Edit ↗', '', () => openEditor(note.id)));
    meta.append(node('span', 'card-category', note.category), actions);
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
    if (note.fields.length > 1) {
      const related = button('Show related', 'related-button', () => {
        relatedNoteId = relatedNoteId === note.id ? null : note.id;
        renderRelatedCards();
      });
      related.setAttribute('aria-pressed', 'false');
      related.setAttribute('aria-controls', 'reviewBoard');
      footer.append(related);
    }
    const remove = button('', 'card-delete', () => requestDeleteNote(note.id));
    remove.setAttribute('aria-label', `Delete ${titleOf(note)} and all its sections`);
    remove.title = 'Delete note and all its sections';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.7');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7');
    icon.append(path);
    remove.append(icon);
    footer.append(remove);
    card.append(footer);
    return card;
  }

  // Related cards share a saved note ID, even when titles or colors match others.
  function renderRelatedCards() {
    const cards = [...$('reviewBoard').querySelectorAll('.board-card[data-note-id]')];
    const selected = notes.find(
      (note) =>
        note.id === relatedNoteId &&
        note.fields.length > 1 &&
        cards.some((card) => card.dataset.noteId === note.id),
    );
    if (!selected) relatedNoteId = null;
    cards.forEach((card) => {
      const related = card.dataset.noteId === relatedNoteId;
      card.classList.toggle('related-card', related);
      const control = card.querySelector('.related-button');
      if (control) {
        control.textContent = related ? 'Stop pulse' : 'Show related';
        control.setAttribute('aria-pressed', String(related));
      }
    });
  }

  // Update notes and open the editor
  function updateNote(id, mutate) {
    const updated = copy(notes);
    const note = updated.find((n) => n.id === id);
    if (!note) return;
    mutate(note);
    note.updatedAt = new Date().toISOString();
    if (!saveNoteLists(updated)) return;
    notes = updated;
    renderNavigation();
    renderRecent();
    renderBoard();
  }

  // Deleted notes stay in the same storage record for safe recovery.
  function requestDeleteNote(id) {
    if (!confirm('Move this note and all its sections to Recently Deleted? You can restore it there.')) return;
    moveToTrash(id);
  }
  function moveToTrash(id) {
    const note = notes.find((candidate) => candidate.id === id);
    if (!note) return;
    const remaining = notes.filter((candidate) => candidate.id !== id);
    const nextTrash = [...trash, { ...copy(note), deletedAt: new Date().toISOString() }];
    if (!saveNoteLists(remaining, nextTrash)) return;
    notes = remaining;
    trash = nextTrash;
    $('noteDialog').close();
    renderNavigation();
    renderRecent();
    renderBoard();
    toast('Note moved to Recently Deleted.', {
      label: 'Undo',
      run: () => restoreNote(id),
    });
  }
  function restoreNote(id) {
    const deleted = trash.find((note) => note.id === id);
    if (!deleted) return;
    const restored = { ...copy(deleted), deletedAt: '' };
    const nextNotes = [...notes, restored];
    const nextTrash = trash.filter((note) => note.id !== id);
    if (!saveNoteLists(nextNotes, nextTrash)) return;
    notes = nextNotes;
    trash = nextTrash;
    announcedReminders.delete(restored.id + restored.reminderAt);
    renderNavigation();
    renderRecent();
    renderBoard();
    toast('Note restored.');
  }
  function renderTrash() {
    relatedNoteId = null;
    const query = $('searchInput').value.trim().toLocaleLowerCase();
    const matches = trash
      .filter((note) =>
        [
          note.title,
          note.category,
          ...note.fields.flatMap((field) => [field.label, field.text]),
        ]
          .join('\n')
          .toLocaleLowerCase()
          .includes(query),
      )
      .sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt));
    $('reviewBoard').classList.add('trash-board');
    $('reviewBoard').replaceChildren();
    $('dueBanner').hidden = true;
    $('reviewEmpty').hidden = matches.length > 0;
    $('emptyMessage').textContent = !trash.length
      ? 'No deleted notes. Notes you delete can be restored here.'
      : 'No deleted notes match this search.';
    matches.forEach((note) => {
      const card = node('article', 'board-card');
      paintNote(card, note.color);
      card.append(
        node('p', 'card-meta', `Deleted ${reminderLabel(note.deletedAt)}`),
        node('h2', 'deleted-title', titleOf(note)),
        node(
          'p',
          'deleted-preview',
          note.fields
            .map((field) => field.text)
            .filter(Boolean)
            .join(' · ') || 'A saved drawing',
        ),
        node(
          'p',
          'deleted-meta',
          `${note.category} · ${note.fields.length} ${note.fields.length === 1 ? 'field' : 'fields'}`,
        ),
        button('Restore', 'secondary', () => restoreNote(note.id)),
      );
      $('reviewBoard').append(card);
    });
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
    paintNote($('editPaper'), editor.color);
    paintColors($('editColors'), editor, () =>
      paintNote($('editPaper'), editor.color),
    );
    renderFields($('editFields'), editor, () => {});
    $('editorMeta').textContent =
      `Captured ${reminderLabel(editor.createdAt)} · Changes save when you choose Save changes.`;
    editorSnapshot = JSON.stringify(editorValues());
    $('noteDialog').showModal();
    $('editTitle').focus();
  }
  function editorValues() {
    const value = copy(editor);
    value.title = $('editTitle').value.trim();
    value.category = cleanCollection($('editCollection').value);
    value.pinned = $('editPinned').checked;
    const reminder = $('editReminder').value === localDate(editor.reminderAt)
      ? editor.reminderAt
      : fromInputDate($('editReminder').value);
    if (reminder !== editor.reminderAt) value.reminderDismissed = false;
    value.reminderAt = reminder;
    value.fields.forEach((f) => {
      f.label = f.label.trim() || 'Notes';
    });
    return value;
  }
  function editorIsDirty() {
    return editor && $('noteDialog').open &&
      JSON.stringify(editorValues()) !== editorSnapshot;
  }
  function requestCloseEditor() {
    if (editorIsDirty() && !confirm('Discard unsaved changes to this note?')) return;
    $('noteDialog').close();
  }

  // Portable backups. Restore merges versions instead of overwriting current work.
  function downloadBackup() {
    const backup = {
      format: 'noteable-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      notes: [...notes, ...trash],
      templates,
      draft: normalizeDraft(draft),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    }));
    const link = node('a');
    link.href = url;
    link.download = `noteable-backup-${backup.exportedAt.slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('backupStatus').textContent = 'Backup downloaded. Keep the file somewhere you can find it.';
  }
  function parseBackup(raw) {
    const data = JSON.parse(raw);
    const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const text = (value, max) => typeof value === 'string' && value.length <= max;
    const date = (value) => value === '' || validDate(value);
    const slot = (value) => value === undefined || value === '' || fieldSlot(value) === value;
    const fields = (value) => Array.isArray(value) && value.length > 0 && value.every((field) =>
      object(field) && text(field.label, 60) && typeof field.text === 'string' &&
      ['text', 'draw'].includes(field.mode) && slot(field.slot) &&
      Array.isArray(field.strokes) && field.strokes.every((stroke) =>
        Array.isArray(stroke) && stroke.every((point) => Array.isArray(point) &&
          point.length === 2 && point.every((n) => Number.isFinite(n) && n >= 0 && n <= 1))),
    );
    const model = (value) => object(value) && text(value.title, 160) &&
      COLORS.some((choice) => choice[1] === value.color) &&
      ['cornell', 'stacked'].includes(value.layout) && fields(value.fields) &&
      date(value.reminderAt);
    const note = (value) => model(value) && typeof value.id === 'string' && value.id &&
      text(value.category, 40) && typeof value.pinned === 'boolean' &&
      validDate(value.createdAt) && validDate(value.updatedAt) && date(value.deletedAt) &&
      typeof value.reminderDismissed === 'boolean' && Number.isFinite(value.sortPosition);
    const template = (value) => object(value) && typeof value.id === 'string' && value.id &&
      text(value.name, 60) && value.name.trim() && Array.isArray(value.labels) &&
      value.labels.length > 0 && value.labels.every((label) => text(label, 60)) &&
      COLORS.some((choice) => choice[1] === value.color) &&
      ['cornell', 'stacked'].includes(value.layout) &&
      (value.slots === undefined || (Array.isArray(value.slots) &&
        value.slots.length === value.labels.length && value.slots.every(slot)));
    if (!object(data) || data.format !== 'noteable-backup')
      throw new Error('Choose a Noteable backup file.');
    if (data.version !== 1)
      throw new Error('This backup version is not supported by this copy of Noteable.');
    if (!validDate(data.exportedAt) || !Array.isArray(data.notes) ||
      !data.notes.every(note) || !Array.isArray(data.templates) ||
      !data.templates.every(template) ||
      (data.draft != null && (!model(data.draft) || !text(data.draft.category, 40))))
      throw new Error('This backup has invalid or incomplete data. Nothing was restored.');
    return data;
  }
  const noteSignature = (note) => {
    const { id, sortPosition, ...contents } = normalizeNote(note, 0);
    return JSON.stringify(contents);
  };
  const templateSignature = (template) => {
    const { id, ...contents } = normalizeTemplate(template);
    return JSON.stringify(contents);
  };
  function storeRestoredData(nextNotes, nextTemplates) {
    const written = [];
    try {
      for (const [key, value] of [[KEYS.notes, nextNotes], [KEYS.templates, nextTemplates]]) {
        const previous = localStorage.getItem(key);
        localStorage.setItem(key, JSON.stringify(value));
        written.push([key, previous]);
      }
      return true;
    } catch {
      // If the second write fails, put the first record back before reporting failure.
      for (const [key, previous] of written.reverse()) {
        try {
          if (previous === null) localStorage.removeItem(key);
          else localStorage.setItem(key, previous);
        } catch {
          // Restore only adds data, so existing work survives even if rollback is blocked.
        }
      }
      $('backupStatus').textContent =
        'Restore could not finish. Current work was kept. Free some browser storage and try again.';
      return false;
    }
  }
  function restoreBackup() {
    if (!pendingBackup) return;
    const data = pendingBackup;
    const merged = [...notes, ...trash];
    const signatures = new Set(merged.map(noteSignature));
    const ids = new Set(merged.map((note) => note.id));
    let position = Math.max(-1, ...merged.map((note) => note.sortPosition)) + 1;
    const incoming = data.notes.map(normalizeNote);
    if (data.draft && (hasContent(data.draft) || data.draft.title.trim())) {
      incoming.push(normalizeNote({
        ...data.draft,
        id: makeId(),
        title: data.draft.title.trim() || 'Restored draft',
        createdAt: data.exportedAt,
        updatedAt: data.exportedAt,
      }, position));
    }
    let addedNotes = 0;
    for (const note of incoming) {
      const signature = noteSignature(note);
      if (signatures.has(signature)) continue;
      if (ids.has(note.id)) note.id = makeId();
      note.sortPosition = position++;
      ids.add(note.id);
      signatures.add(signature);
      merged.push(note);
      addedNotes++;
    }
    const nextTemplates = templates.slice();
    const templateSignatures = new Set(templates.map(templateSignature));
    const templateIds = new Set([...builtins, ...templates].map((template) => template.id));
    for (const raw of data.templates) {
      const template = normalizeTemplate(raw);
      const signature = templateSignature(template);
      if (templateSignatures.has(signature)) continue;
      if (templateIds.has(template.id)) template.id = makeId();
      templateIds.add(template.id);
      templateSignatures.add(signature);
      nextTemplates.push(template);
    }
    const addedTemplates = nextTemplates.length - templates.length;
    if ((addedNotes || addedTemplates) && !storeRestoredData(merged, nextTemplates)) return;
    notes = merged.filter((note) => !note.deletedAt);
    trash = merged.filter((note) => note.deletedAt);
    templates = nextTemplates;
    renderTemplates();
    renderNavigation();
    renderRecent();
    if (view !== 'capture') renderBoard();
    $('backupStatus').textContent = addedNotes || addedTemplates
      ? `Restored ${addedNotes} ${addedNotes === 1 ? 'note' : 'notes'} and ${addedTemplates} ${addedTemplates === 1 ? 'template' : 'templates'}. Current work kept.`
      : 'Everything in this backup is already here. Nothing changed.';
    pendingBackup = null;
    $('restoreBackup').disabled = true;
    $('backupFile').value = '';
  }

  // Template menu and reminder checks
  function renderTemplates() {
    $('templateSelect').replaceChildren();
    [...builtins, ...templates].forEach((t) =>
      $('templateSelect').append(new Option(t.name, t.id)),
    );
    const selected = [...builtins, ...templates].find((t) => t.id === draft.templateId);
    if (!selected) {
      const custom = new Option('Custom fields', '');
      custom.disabled = true;
      $('templateSelect').prepend(custom);
    }
    $('templateSelect').value = selected?.id || '';
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
  $('trashNav').addEventListener('click', () => {
    $('searchInput').value = '';
    showView('trash');
  });
  $('helpButton').addEventListener('click', () => $('helpDialog').showModal());
  $('closeHelp').addEventListener('click', () => $('helpDialog').close());
  $('backupButton').addEventListener('click', () => $('backupDialog').showModal());
  $('closeBackup').addEventListener('click', () => $('backupDialog').close());
  $('backupDialog').addEventListener('close', () => {
    pendingBackup = null;
    $('backupFile').value = '';
    $('restoreBackup').disabled = true;
    $('backupStatus').textContent = '';
  });
  $('downloadBackup').addEventListener('click', downloadBackup);
  $('restoreBackup').addEventListener('click', restoreBackup);
  $('backupFile').addEventListener('change', async () => {
    pendingBackup = null;
    $('restoreBackup').disabled = true;
    const file = $('backupFile').files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      $('backupStatus').textContent = 'Choose a backup smaller than 20 MB.';
      return;
    }
    $('backupStatus').textContent = 'Reading backup…';
    try {
      const raw = await file.text();
      if ($('backupFile').files[0] !== file) return;
      pendingBackup = parseBackup(raw);
      $('backupStatus').textContent =
        `Ready: ${pendingBackup.notes.length} saved notes, ${pendingBackup.templates.length} templates. Click Restore backup to add them.`;
      $('restoreBackup').disabled = false;
    } catch (error) {
      if ($('backupFile').files[0] !== file) return;
      $('backupStatus').textContent = error instanceof SyntaxError
        ? 'This file is not valid JSON. Choose a Noteable backup. Nothing was restored.'
        : error.message || 'Could not read this file. Nothing was restored.';
    }
  });

  // Account forms are a demo. Nothing is sent or saved.
  function showAccount(mode) {
    const signup = mode === 'signup';
    $('accountForm').reset();
    $('accountHeading').textContent = signup ? 'Sign up' : 'Sign in';
    $('accountSubmit').textContent = signup ? 'Sign up' : 'Sign in';
    $('accountNameField').hidden = !signup;
    $('accountName').required = signup;
    $('accountPassword').autocomplete = signup ? 'new-password' : 'off';
    $('accountDialog').showModal();
    $(signup ? 'accountName' : 'accountEmail').focus();
  }
  $('signInButton').addEventListener('click', () => showAccount('signin'));
  $('signUpButton').addEventListener('click', () => showAccount('signup'));
  $('closeAccount').addEventListener('click', () => $('accountDialog').close());
  $('accountDialog').addEventListener('close', () => $('accountForm').reset());
  $('accountForm').addEventListener('submit', (event) => {
    event.preventDefault();
    $('accountDialog').close();
    toast('Just a demo for now. No account was created or signed in.');
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
  $('draftCollection').addEventListener('input', () => {
    draft.category = $('draftCollection').value;
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
      renderTemplates();
      return;
    }
    const template = [...builtins, ...templates].find(
      (t) => t.id === $('templateSelect').value,
    );
    draft.templateId = template?.id || '';
    draft.fields = template
      ? template.labels.map((label, index) => blankField(label, template.slots?.[index]))
      : [blankField()];
    draft.layout = noteLayout(template?.layout);
    if (!draft.fields.length) draft.fields = [blankField()];
    draft.title = '';
    if (template?.color) draft.color = colorValue(template.color);
    renderCapture();
    persistDraft();
  });
  ['searchInput', 'collectionFilter', 'pinnedFilter'].forEach((id) =>
    $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderBoard),
  );
  $('sortSelect').value = sortOrder;
  $('sortSelect').addEventListener('change', () => {
    sortOrder = $('sortSelect').value;
    write(KEYS.sort, sortOrder);
    renderBoard();
  });
  $('closeEditor').addEventListener('click', requestCloseEditor);
  $('noteDialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    requestCloseEditor();
  });
  $('noteDialog').addEventListener('close', () => {
    editor = null;
    editorSnapshot = null;
  });
  window.addEventListener('beforeunload', (event) => {
    if (!editorIsDirty()) return;
    event.preventDefault();
    event.returnValue = '';
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
    if (!saveNoteLists(updated)) return;
    notes = updated;
    $('noteDialog').close();
    renderNavigation();
    renderRecent();
    renderBoard();
    toast('Changes saved.');
    checkReminders();
  });
  $('deleteNote').addEventListener('click', () => {
    requestDeleteNote(editor.id);
  });
  $('saveTemplate').addEventListener('click', () => {
    const name = prompt(
      'Name your template. It keeps the field names, layout, and colors, not your writing.',
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
        layout: noteLayout(editor.layout),
        slots: editor.fields.map((field) => fieldSlot(field.slot)),
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
