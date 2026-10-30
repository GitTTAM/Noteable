// Date and time pickers work locally, including inside the device-preview iframe.
(() => {
  'use strict';

  // Local date and time helpers
  const pad = (value) => String(value).padStart(2, '0');
  const currentLocalValue = () => {
    const now = new Date();
    return `${dateString(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };
  const dateString = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  // Picker elements and buttons
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function button(text, label, action) {
    const el = make('button', '', text);
    el.type = 'button';
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('click', action);
    return el;
  }

  // Create a picker for each reminder field
  document.querySelectorAll('input[type="datetime-local"]').forEach((input) => {
    input.hidden = true;
    const wrapper = make('div', 'reminder-picker');
    const dateButton = button('Choose date ▦', 'Choose reminder date', () =>
      open(calendar, dateButton),
    );
    const timeButton = button('Choose time ◷', 'Choose reminder time', () =>
      open(time, timeButton),
    );
    const clearButton = button('×', 'Clear reminder', () => {
      input.value = '';
      changed();
    });
    clearButton.className = 'clear-reminder';
    wrapper.append(dateButton, timeButton, clearButton);
    input.after(wrapper);
    const calendar = make('div', 'reminder-popup');
    const time = make('div', 'reminder-popup time-popup');
    calendar.id = `${input.id}Calendar`;
    time.id = `${input.id}Time`;
    [calendar, time].forEach((popup) => {
      popup.setAttribute('popover', 'auto');
      popup.setAttribute('role', 'dialog');
      wrapper.append(popup);
    });
    calendar.setAttribute('aria-label', 'Choose reminder date');
    time.setAttribute('aria-label', 'Choose reminder time');
    [
      [dateButton, calendar],
      [timeButton, time],
    ].forEach(([trigger, popup]) => {
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', popup.id);
      trigger.setAttribute('aria-expanded', 'false');
      popup.addEventListener('toggle', () =>
        trigger.setAttribute('aria-expanded', String(popup.matches(':popover-open'))),
      );
      popup.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close(popup, trigger);
        }
      });
    });

    // Keyboard focus and popup closing
    let returningFocus = false;
    function close(popup, trigger) {
      returningFocus = true;
      popup.hidePopover();
      trigger.focus();
      queueMicrotask(() => {
        returningFocus = false;
      });
    }
    [
      [dateButton, calendar],
      [timeButton, time],
    ].forEach(([trigger, popup]) => {
      let pointerFocus = false;
      trigger.addEventListener('pointerdown', () => {
        pointerFocus = true;
      });
      trigger.addEventListener('blur', () => {
        pointerFocus = false;
      });
      trigger.addEventListener('focus', (event) => {
        const fromPointer = pointerFocus;
        pointerFocus = false;
        if (!fromPointer && !returningFocus && !popup.contains(event.relatedTarget)) {
          // Finish focusing the field before moving keyboard focus into its popup.
          queueMicrotask(() => {
            if (document.activeElement === trigger) open(popup, trigger);
          });
        }
      });
    });

    // Keep visible date and time fields in sync
    let month = new Date();
    function selectedDate() {
      return input.value ? new Date(`${input.value.slice(0, 10)}T12:00:00`) : new Date();
    }
    function sync() {
      const value = input.value;
      const dateText = value
        ? new Intl.DateTimeFormat(undefined, {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
          }).format(selectedDate())
        : 'Choose date';
      dateButton.replaceChildren(
        make('span', 'picker-value', dateText),
        make('span', 'picker-icon', '▦'),
      );
      const timeText = value
        ? new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(value))
        : 'Choose time';
      timeButton.replaceChildren(
        make('span', 'picker-value', timeText),
        make('span', 'picker-icon', '◷'),
      );
      clearButton.hidden = !value;
    }
    function changed() {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function saveDate(date) {
      input.value = `${dateString(date)}T${input.value ? input.value.slice(11, 16) : currentLocalValue().slice(11, 16)}`;
      changed();
      close(calendar, dateButton);
    }

    // Calendar and date navigation
    function renderCalendar(focusDate) {
      calendar.replaceChildren();
      const header = make('div', 'picker-heading');
      const monthTitle = make(
        'strong',
        '',
        new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
          month,
        ),
      );
      monthTitle.setAttribute('aria-live', 'polite');
      header.append(
        button('‹', 'Previous month', () => {
          month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
          renderCalendar();
          calendar.querySelector('[aria-label="Previous month"]').focus();
        }),
        monthTitle,
        button('›', 'Next month', () => {
          month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
          renderCalendar();
          calendar.querySelector('[aria-label="Next month"]').focus();
        }),
      );
      const grid = make('div', 'calendar-days');
      ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach((day) =>
        grid.append(make('span', 'weekday', day)),
      );
      const first = new Date(month.getFullYear(), month.getMonth(), 1);
      const start = new Date(month.getFullYear(), month.getMonth(), 1 - first.getDay());
      const today = dateString(new Date());
      const selected = input.value.slice(0, 10);
      for (let i = 0; i < 42; i++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const key = dateString(date);
        const label = new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }).format(date);
        const day = button(String(date.getDate()), label, () => saveDate(date));
        day.dataset.date = key;
        day.classList.toggle('other-month', date.getMonth() !== month.getMonth());
        day.classList.toggle('selected', key === selected);
        day.setAttribute('aria-pressed', String(key === selected));
        if (key === today) day.setAttribute('aria-current', 'date');
        day.addEventListener('keydown', (event) => {
          const offsets = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -7,
            ArrowDown: 7,
            Home: -date.getDay(),
            End: 6 - date.getDay(),
          };
          let target;
          if (Object.hasOwn(offsets, event.key))
            target = new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate() + offsets[event.key],
            );
          else if (event.key === 'PageUp' || event.key === 'PageDown') {
            const targetMonth = date.getMonth() + (event.key === 'PageUp' ? -1 : 1);
            const lastDay = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
            target = new Date(
              date.getFullYear(),
              targetMonth,
              Math.min(date.getDate(), lastDay),
            );
          } else return;
          event.preventDefault();
          event.stopPropagation();
          month = new Date(target.getFullYear(), target.getMonth(), 1);
          renderCalendar(dateString(target));
        });
        grid.append(day);
      }
      const footer = make('div', 'picker-footer');
      footer.append(
        button('Today', '', () => saveDate(new Date())),
        button('Close', '', () => close(calendar, dateButton)),
      );
      calendar.append(header, grid, footer);
      if (focusDate) calendar.querySelector(`[data-date="${focusDate}"]`)?.focus();
    }

    // Hour, minute, and AM/PM controls
    function renderTime() {
      time.replaceChildren(make('strong', 'time-heading', 'Set reminder time'));
      const row = make('div', 'time-selects');
      function select(label, options, value) {
        const field = make('label', '', label);
        const el = document.createElement('select');
        el.setAttribute('aria-label', label);
        options.forEach((option) => el.append(new Option(option, option)));
        el.value = value;
        field.append(el);
        row.append(field);
        return el;
      }
      const current = input.value ? new Date(input.value) : new Date();
      const hours = select(
        'Hour',
        Array.from({ length: 12 }, (_, i) => String(i + 1)),
        String(current.getHours() % 12 || 12),
      );
      const minutes = select(
        'Minute',
        Array.from({ length: 60 }, (_, i) => pad(i)),
        pad(current.getMinutes()),
      );
      const period = select(
        'AM / PM',
        ['AM', 'PM'],
        current.getHours() >= 12 ? 'PM' : 'AM',
      );
      const footer = make('div', 'picker-footer');
      footer.append(
        button('Cancel', '', () => close(time, timeButton)),
        button('Set time', '', () => {
          const hour = (Number(hours.value) % 12) + (period.value === 'PM' ? 12 : 0);
          input.value = `${input.value ? input.value.slice(0, 10) : dateString(new Date())}T${pad(hour)}:${minutes.value}`;
          changed();
          close(time, timeButton);
        }),
      );
      time.append(row, footer);
    }

    // Open and position the popups
    function open(popup, trigger) {
      if (popup.matches(':popover-open')) return;
      if (!input.value) {
        input.value = currentLocalValue();
        changed();
      }
      if (popup === calendar) {
        const selected = selectedDate();
        month = new Date(selected.getFullYear(), selected.getMonth(), 1);
        renderCalendar();
      } else renderTime();
      popup.showPopover();
      position(popup, trigger);
      if (popup === calendar)
        calendar
          .querySelector(
            `[data-date="${input.value.slice(0, 10) || dateString(new Date())}"]`,
          )
          ?.focus();
      else time.querySelector('select').focus();
    }
    function position(popup, trigger) {
      const rect = trigger.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(rect.right - popup.offsetWidth, innerWidth - popup.offsetWidth - 8),
      );
      const top =
        rect.bottom + popup.offsetHeight + 8 <= innerHeight
          ? rect.bottom + 5
          : Math.max(8, rect.top - popup.offsetHeight - 5);
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    }

    // Scrolling, resizing, dialog closing, and field updates
    function repositionOpen() {
      [
        [calendar, dateButton],
        [time, timeButton],
      ].forEach(([popup, trigger]) => {
        if (popup.matches(':popover-open')) position(popup, trigger);
      });
    }
    window.addEventListener('resize', repositionOpen);
    document.addEventListener('scroll', repositionOpen, true);
    input.closest('dialog')?.addEventListener('close', () => {
      returningFocus = true;
      calendar.hidePopover();
      time.hidePopover();
      queueMicrotask(() => {
        returningFocus = false;
      });
    });
    input.addEventListener('picker-sync', sync);
    input.addEventListener('change', sync);
    sync();
  });
})();
