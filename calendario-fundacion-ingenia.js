(function () {
  'use strict';

  // Calendario de solo lectura que une tres fuentes independientes — nunca
  // escribe en ninguna de las tres, solo lee y muestra junto.
  const SUPABASE_URL = 'https://hcylkagvwfncdaaizutn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';
  const COALICION_EDITOR_URL = SUPABASE_URL + '/functions/v1/coalicion-editor';

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const SOURCE_LABELS = { coalicion: 'Coalición Venezuela', florangel: 'Dra Florangel', ucv: 'UCV', networking: 'Networking Fund. Ingenia', otros: 'Otros' };
  const FIXED_SOURCE_COLOR = { coalicion: '#1d4ed8', florangel: '#be185d', ucv: '#0f766e', networking: '#7c3aed', otros: '#57534e' };
  const FIXED_SOURCE_EMOJI = { coalicion: '🤝', florangel: '🩺', ucv: '🎓', networking: '🌐', otros: '📌' };

  // Calendarios creados al vuelo desde "Otra organización o calendario":
  // el registro (nombre + color) vive en ingenia_board_state bajo esta
  // clave; cada uno guarda sus eventos en su propia clave
  // 'ingenia-custom-<id>-events-v1', mismo patrón que networking/otros.
  const CUSTOM_CALENDARS_KEY = 'ingenia-custom-calendars-v1';
  const CUSTOM_PALETTE = ['#7c3aed', '#be185d', '#0f766e', '#c67139', '#1d4ed8', '#15803d', '#a16207', '#4338ca', '#b91c1c', '#0e7490'];
  const NEW_CALENDAR_VALUE = '__new__';

  const state = {
    client: null,
    view: 'calendar',
    events: [],
    customCalendars: [],
    calendarMonth: new Date().toISOString().slice(0, 7),
    selectedDay: new Date().toISOString().slice(0, 10),
    editingEvent: null
  };

  const dom = {};

  window.ingeniaAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
    if (target.dataset.view) return setView(target.dataset.view);
    const actionsById = {
      'retry-load': loadAll,
      'calendar-prev': function () { changeMonth(-1); },
      'calendar-next': function () { changeMonth(1); },
      'calendar-today': function () {
        state.calendarMonth = new Date().toISOString().slice(0, 7);
        state.selectedDay = new Date().toISOString().slice(0, 10);
        renderCalendar();
      },
      'new-event-btn': openEventDialog,
      'event-dialog-close': closeEventDialog,
      'event-dialog-cancel': closeEventDialog
    };
    const action = actionsById[target.id];
    if (action) action();
    if (target.dataset.day) {
      state.selectedDay = target.dataset.day;
      renderCalendar();
      window.setTimeout(function () {
        const el = document.getElementById('agenda-title');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
    if (target.dataset.eventId) {
      openEventDialog(findById(state.events, target.dataset.eventId));
    }
  };

  function findById(list, id) {
    return list.find(function (item) { return item.id === id; }) || null;
  }

  function findCustomCalendar(id) {
    return state.customCalendars.find(function (c) { return c.id === id; }) || null;
  }

  // Info de color/etiqueta para cualquier fuente, fija o creada al vuelo.
  function sourceInfo(key) {
    if (SOURCE_LABELS[key]) return { label: SOURCE_LABELS[key], color: FIXED_SOURCE_COLOR[key], fixed: true };
    const custom = findCustomCalendar(key);
    if (custom) return { label: custom.name, color: custom.color, fixed: false };
    return { label: 'Otros', color: FIXED_SOURCE_COLOR.otros, fixed: true };
  }

  function sourceDotHtml(key) {
    const info = sourceInfo(key);
    return info.fixed
      ? '<span class="source-dot src-' + key + '"></span>'
      : '<span class="source-dot src-dynamic" style="--source-color:' + safe(info.color) + '"></span>';
  }

  function sourceClassStyle(key) {
    const info = sourceInfo(key);
    return info.fixed
      ? { cls: 'src-' + key, style: '' }
      : { cls: 'src-dynamic', style: 'style="--source-color:' + safe(info.color) + '"' };
  }

  function init() {
    cacheDom();
    dom.eventForm.addEventListener('submit', onEventSubmit);
    dom.eventDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeEventDialog(); });
    dom.eventSourceSelect.addEventListener('change', onSourceChange);
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return showConnectionFailure();
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadAll();
  }

  function cacheDom() {
    dom.loadingState = document.getElementById('loading-state');
    dom.connectivityBanner = document.getElementById('connectivity-banner');
    dom.calendarView = document.getElementById('calendar-view');
    dom.sourceLegend = document.getElementById('source-legend');
    dom.calendarMonthLabel = document.getElementById('calendar-month-label');
    dom.calendarGrid = document.getElementById('calendar-grid');
    dom.agendaTitle = document.getElementById('agenda-title');
    dom.agendaList = document.getElementById('agenda-list');
    dom.eventDialog = document.getElementById('event-dialog');
    dom.eventDialogTitle = document.getElementById('event-dialog-title');
    dom.eventForm = document.getElementById('event-form');
    dom.eventError = document.getElementById('event-error');
    dom.eventSourceSelect = document.getElementById('field-event-source');
    dom.newCalendarField = document.getElementById('new-calendar-field');
  }

  function setView(viewName) {
    state.view = viewName;
    document.querySelectorAll('.tab-button').forEach(function (button) {
      if (button.dataset.view === viewName) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('.view').forEach(function (view) { view.hidden = true; });
    const active = document.getElementById(viewName + '-view');
    if (active) active.hidden = false;
  }

  function showConnectionFailure() {
    dom.loadingState.hidden = true;
    dom.connectivityBanner.hidden = false;
  }

  function onSourceChange() {
    const isNew = dom.eventSourceSelect.value === NEW_CALENDAR_VALUE;
    dom.newCalendarField.hidden = !isNew;
    if (isNew) dom.eventForm.elements.new_calendar_name.focus();
  }

  async function loadAll() {
    dom.loadingState.hidden = false;
    dom.connectivityBanner.hidden = true;

    const [coalicionRes, florangelRes, ucvRes, ingeniaRes] = await Promise.all([
      state.client.from('coalicion_events').select('id,title,event_date,start_time,location,maps_url,notes,status').is('archived_at', null),
      state.client.from('florangel_board_state').select('value').eq('key', 'florangel-events-v1').maybeSingle(),
      state.client.from('ucv_board_state').select('value').eq('key', 'ucv-journeys-v3').maybeSingle(),
      state.client.from('ingenia_board_state').select('key,value').in('key', ['ingenia-networking-events-v1', 'ingenia-otros-events-v1', CUSTOM_CALENDARS_KEY])
    ]);

    const anyFailed = coalicionRes.error && florangelRes.error && ucvRes.error && ingeniaRes.error;
    if (anyFailed) {
      showConnectionFailure();
      return;
    }
    if (coalicionRes.error || florangelRes.error || ucvRes.error) dom.connectivityBanner.hidden = false;

    const ingeniaRowsEarly = ingeniaRes.data || [];
    const registryRaw = ingeniaRowsEarly.find(function (r) { return r.key === CUSTOM_CALENDARS_KEY; });
    state.customCalendars = Array.isArray(registryRaw && registryRaw.value) ? registryRaw.value : [];

    let customEvents = [];
    if (state.customCalendars.length) {
      const customKeys = state.customCalendars.map(function (c) { return 'ingenia-custom-' + c.id + '-events-v1'; });
      const customRes = await state.client.from('ingenia_board_state').select('key,value').in('key', customKeys);
      const customRows = customRes.data || [];
      state.customCalendars.forEach(function (c) {
        const row = customRows.find(function (r) { return r.key === 'ingenia-custom-' + c.id + '-events-v1'; });
        const items = Array.isArray(row && row.value) ? row.value : [];
        items.forEach(function (e) {
          customEvents.push({ id: c.id + '-' + e.id, rawId: e.id, source: c.id, title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e });
        });
      });
    }

    const coalicionEvents = (coalicionRes.data || []).map(function (e) {
      return { id: 'coalicion-' + e.id, rawId: e.id, source: 'coalicion', title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e };
    });

    const florangelEvents = (Array.isArray(florangelRes.data && florangelRes.data.value) ? florangelRes.data.value : []).map(function (e) {
      return { id: 'florangel-' + e.id, rawId: e.id, source: 'florangel', title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e };
    });

    const journeys = Array.isArray(ucvRes.data && ucvRes.data.value) ? ucvRes.data.value : [];
    const ucvEvents = [];
    journeys.forEach(function (j) {
      const dates = Array.isArray(j.dates) ? j.dates : (j.date ? [j.date] : []);
      dates.forEach(function (d) {
        ucvEvents.push({ id: 'ucv-' + (j.id || d) + '-' + d, rawId: j.id, source: 'ucv', title: j.title || 'Evento por confirmar', date: d, time: null, timeText: j.time || '', location: j.location || '', notes: j.notes || '', raw: j });
      });
    });

    const networkingRaw = ingeniaRowsEarly.find(function (r) { return r.key === 'ingenia-networking-events-v1'; });
    const otrosRaw = ingeniaRowsEarly.find(function (r) { return r.key === 'ingenia-otros-events-v1'; });
    const networkingEvents = (Array.isArray(networkingRaw && networkingRaw.value) ? networkingRaw.value : []).map(function (e) {
      return { id: 'networking-' + e.id, rawId: e.id, source: 'networking', title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e };
    });
    const otrosEvents = (Array.isArray(otrosRaw && otrosRaw.value) ? otrosRaw.value : []).map(function (e) {
      return { id: 'otros-' + e.id, rawId: e.id, source: 'otros', title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e };
    });

    state.events = coalicionEvents.concat(florangelEvents, ucvEvents, networkingEvents, otrosEvents, customEvents).filter(function (e) { return !!e.date; });
    dom.loadingState.hidden = true;
    renderLegend();
    populateSourceSelect();
    setView(state.view);
    renderCalendar();
  }

  function changeMonth(delta) {
    const parts = state.calendarMonth.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1 + delta, 1));
    state.calendarMonth = date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
    renderCalendar();
  }

  function eventsOnDay(iso) {
    return state.events.filter(function (e) { return e.date === iso; })
      .sort(function (a, b) { return (a.time || '99:99').localeCompare(b.time || '99:99'); });
  }

  function renderCalendar() {
    const parts = state.calendarMonth.split('-').map(Number);
    const year = parts[0];
    const monthIndex = parts[1] - 1;
    dom.calendarMonthLabel.textContent = MONTHS[monthIndex] + ' ' + year;
    const first = new Date(Date.UTC(year, monthIndex, 1));
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    const today = new Date().toISOString().slice(0, 10);
    let markup = WEEKDAYS.map(function (day) { return '<div class="calendar-weekday">' + day + '</div>'; }).join('');
    for (let blank = 0; blank < mondayOffset; blank += 1) markup += '<div class="calendar-day is-blank" aria-hidden="true"></div>';
    for (let day = 1; day <= lastDay; day += 1) {
      const iso = year + '-' + String(monthIndex + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const dayEvents = eventsOnDay(iso);
      const isSelected = iso === state.selectedDay;
      markup += '<button type="button" class="calendar-day' + (iso === today ? ' is-today' : '') + (isSelected ? ' is-selected' : '') + '" data-day="' + iso + '" onclick="window.ingeniaAction(event)" style="' + (isSelected ? 'outline:2px solid var(--color-accent);outline-offset:-2px;' : '') + 'text-align:left;font:inherit;cursor:pointer">' +
        '<span class="calendar-number">' + day + '</span>' +
        dayEvents.slice(0, 3).map(function (e) {
          const cs = sourceClassStyle(e.source);
          return '<span class="calendar-event ' + cs.cls + '" ' + cs.style + ' data-event-id="' + safe(e.id) + '" onclick="window.ingeniaAction(event)">' + safe(e.title) + '</span>';
        }).join('') +
        (dayEvents.length > 3 ? '<span class="calendar-event">+' + (dayEvents.length - 3) + ' más</span>' : '') +
      '</button>';
    }
    renderMarkup(dom.calendarGrid, markup);
    renderAgenda();
  }

  function renderAgenda() {
    const iso = state.selectedDay;
    const dayEvents = eventsOnDay(iso);
    dom.agendaTitle.textContent = formatDate(iso) + (dayEvents.length ? ' · ' + dayEvents.length + (dayEvents.length === 1 ? ' evento' : ' eventos') : '');
    if (!dayEvents.length) {
      renderMarkup(dom.agendaList, '<div class="empty-state"><strong>Sin eventos</strong><span>No hay nada registrado en ninguno de los tres calendarios para este día.</span></div>');
      return;
    }
    renderMarkup(dom.agendaList, dayEvents.map(function (e) {
      const timeLabel = e.time ? formatTime(e.time) : (e.timeText || 'Hora por confirmar');
      const info = sourceInfo(e.source);
      const cs = sourceClassStyle(e.source);
      return '<button type="button" class="agenda-row" data-event-id="' + safe(e.id) + '" onclick="window.ingeniaAction(event)" style="width:100%;text-align:left;font:inherit;cursor:pointer">' +
        sourceDotHtml(e.source) +
        '<div>' +
          '<p class="agenda-row-title">' + safe(e.title) + '</p>' +
          '<p class="agenda-row-meta">◷ ' + safe(timeLabel) + (e.location ? ' · ⌖ ' + safe(e.location) : '') + '</p>' +
          '<span class="agenda-row-source ' + cs.cls + '" ' + cs.style + '>' + safe(info.label) + '</span>' +
        '</div>' +
      '</button>';
    }).join(''));
  }

  function renderLegend() {
    const fixedKeys = ['coalicion', 'florangel', 'ucv', 'networking', 'otros'];
    const items = fixedKeys.map(function (key) {
      return '<span class="source-legend-item">' + sourceDotHtml(key) + safe(SOURCE_LABELS[key]) + '</span>';
    }).concat(state.customCalendars.map(function (c) {
      return '<span class="source-legend-item">' + sourceDotHtml(c.id) + safe(c.name) + '</span>';
    }));
    renderMarkup(dom.sourceLegend, items.join(''));
  }

  function populateSourceSelect() {
    const current = dom.eventSourceSelect.value;
    const fixedOptions = ['coalicion', 'florangel', 'ucv', 'networking', 'otros'].map(function (key) {
      return '<option value="' + key + '">' + FIXED_SOURCE_EMOJI[key] + ' ' + safe(SOURCE_LABELS[key]) + '</option>';
    });
    const customOptions = state.customCalendars.map(function (c) {
      return '<option value="' + safe(c.id) + '">🏷️ ' + safe(c.name) + '</option>';
    });
    const newOption = '<option value="' + NEW_CALENDAR_VALUE + '">➕ Otra organización o calendario (crear nueva)</option>';
    renderMarkup(dom.eventSourceSelect, fixedOptions.concat(customOptions, newOption).join(''));
    if (current) dom.eventSourceSelect.value = current;
  }

  // ---------- Agregar evento (a la fuente elegida) ----------

  function openEventDialog(existing) {
    hideError(dom.eventError);
    dom.eventForm.reset();
    populateSourceSelect();
    dom.newCalendarField.hidden = true;
    state.editingEvent = existing || null;
    dom.eventDialogTitle.textContent = existing ? 'Editar evento' : 'Agregar evento';
    dom.eventForm.elements.source.disabled = !!existing;
    if (existing) {
      dom.eventForm.elements.source.value = existing.source;
      dom.eventForm.elements.title.value = existing.title || '';
      dom.eventForm.elements.event_date.value = existing.date || '';
      dom.eventForm.elements.start_time.value = existing.time ? existing.time.slice(0, 5) : '';
      dom.eventForm.elements.location.value = existing.location || '';
      dom.eventForm.elements.notes.value = existing.notes || '';
    } else {
      dom.eventForm.elements.event_date.value = state.selectedDay || new Date().toISOString().slice(0, 10);
    }
    dom.eventDialog.showModal();
    dom.eventForm.elements.title.focus();
  }

  function closeEventDialog() { dom.eventDialog.close(); dom.eventForm.elements.source.disabled = false; state.editingEvent = null; }

  async function onEventSubmit(e) {
    e.preventDefault();
    hideError(dom.eventError);
    let source = dom.eventForm.elements.source.value;
    const title = dom.eventForm.elements.title.value.trim();
    const eventDate = dom.eventForm.elements.event_date.value;
    const startTime = dom.eventForm.elements.start_time.value;
    const location = dom.eventForm.elements.location.value.trim();
    const notes = dom.eventForm.elements.notes.value.trim();
    if (!title || !eventDate) { showError(dom.eventError, 'Título y fecha son obligatorios.'); return; }
    if (source === 'coalicion' && !location) { showError(dom.eventError, 'Coalición Venezuela necesita una ubicación (o edítalo luego para agregar el link de Maps).'); return; }

    let newCalendarName = '';
    if (source === NEW_CALENDAR_VALUE) {
      newCalendarName = dom.eventForm.elements.new_calendar_name.value.trim();
      if (!newCalendarName) { showError(dom.eventError, 'Escribe el nombre del nuevo calendario u organización.'); return; }
    }

    const submitBtn = dom.eventForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    let ok = false;
    const fields = { title: title, event_date: eventDate, start_time: startTime, location: location, notes: notes };
    const existing = state.editingEvent;

    if (source === NEW_CALENDAR_VALUE) {
      const created = await createCustomCalendar(newCalendarName);
      if (created) { source = created.id; ok = await saveIngeniaEvent('ingenia-custom-' + created.id + '-events-v1', fields, null); }
    }
    else if (source === 'coalicion') ok = await saveCoalicionEvent(fields, existing);
    else if (source === 'florangel') ok = await saveFlorangelEvent(fields, existing);
    else if (source === 'ucv') ok = await saveUcvEvent(fields, existing);
    else if (source === 'networking') ok = await saveIngeniaEvent('ingenia-networking-events-v1', fields, existing);
    else if (source === 'otros') ok = await saveIngeniaEvent('ingenia-otros-events-v1', fields, existing);
    else ok = await saveIngeniaEvent('ingenia-custom-' + source + '-events-v1', fields, existing);
    submitBtn.disabled = false;

    if (!ok) { showError(dom.eventError, 'No se pudo guardar — revisa tu conexión e intenta de nuevo.'); return; }
    closeEventDialog();
    await loadAll();
    state.selectedDay = eventDate;
    renderCalendar();
  }

  // Registra un calendario/organización nuevo (nombre + color) antes de
  // guardar el primer evento que le pertenece.
  async function createCustomCalendar(name) {
    const id = slugify(name) + '-' + Date.now().toString(36).slice(-4);
    const color = CUSTOM_PALETTE[state.customCalendars.length % CUSTOM_PALETTE.length];
    const entry = { id: id, name: name, color: color, created_at: new Date().toISOString() };
    const next = state.customCalendars.concat(entry);
    const okWrite = await writeBoardKey('ingenia_board_state', CUSTOM_CALENDARS_KEY, next);
    if (!okWrite) return null;
    state.customCalendars = next;
    return entry;
  }

  function slugify(text) {
    const clean = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    return clean || 'org';
  }

  async function saveCoalicionEvent(fields, existing) {
    // Al editar, conservamos status/maps_url originales — este formulario
    // simplificado no los toca, así que no se deben perder.
    const raw = existing && existing.raw;
    try {
      const res = await fetch(COALICION_EDITOR_URL, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save', entity: 'event', id: existing ? existing.rawId : null,
          payload: {
            title: fields.title, event_date: fields.event_date, start_time: fields.start_time || '', location: fields.location,
            maps_url: (raw && raw.maps_url) || '', notes: fields.notes, status: (raw && raw.status) || 'planned'
          }
        })
      });
      return res.ok;
    } catch (_err) { return false; }
  }

  async function saveFlorangelEvent(fields, existing) {
    const current = await readBoardKey('florangel_board_state', 'florangel-events-v1', []);
    const next = upsertById(current, existing, function (base) {
      return Object.assign({}, base, {
        id: existing ? existing.rawId : uid(), title: fields.title, event_date: fields.event_date,
        start_time: fields.start_time, location: fields.location, notes: fields.notes
      });
    });
    return writeBoardKey('florangel_board_state', 'florangel-events-v1', next);
  }

  async function saveUcvEvent(fields, existing) {
    const current = await readBoardKey('ucv_board_state', 'ucv-journeys-v3', []);
    if (existing) {
      // Las jornadas de UCV traen campos que este formulario no maneja
      // (eventType, status, voluntarios asignados, checks...) — se preservan
      // tal cual, solo se actualizan título/fecha/hora/ubicación/notas. Si la
      // jornada tenía varias fechas, solo se reemplaza la de este evento.
      const next = current.map(function (j) {
        if (j.id !== existing.rawId) return j;
        const dates = Array.isArray(j.dates) ? j.dates.slice() : [];
        const idx = dates.indexOf(existing.date);
        if (idx > -1) dates[idx] = fields.event_date; else dates.push(fields.event_date);
        return Object.assign({}, j, { title: fields.title, dates: dates, time: fields.start_time || '', location: fields.location, notes: fields.notes });
      });
      return writeBoardKey('ucv_board_state', 'ucv-journeys-v3', next);
    }
    const next = current.concat({
      id: uid(), title: fields.title, dates: [fields.event_date], time: fields.start_time || '',
      location: fields.location, notes: fields.notes, status: 'planned', eventType: 'other',
      owner: '', doctors: '', students: '', assignedVolunteers: [], checks: {}
    });
    return writeBoardKey('ucv_board_state', 'ucv-journeys-v3', next);
  }

  async function saveIngeniaEvent(key, fields, existing) {
    const current = await readBoardKey('ingenia_board_state', key, []);
    const next = upsertById(current, existing, function (base) {
      return Object.assign({}, base, {
        id: existing ? existing.rawId : uid(), title: fields.title, event_date: fields.event_date,
        start_time: fields.start_time, location: fields.location, notes: fields.notes
      });
    });
    return writeBoardKey('ingenia_board_state', key, next);
  }

  // Actualiza el elemento existente conservando sus demás campos (merge), o
  // agrega uno nuevo si no hay "existing" — usado por las fuentes que
  // guardan arreglos simples (Florangel, Networking, Otros).
  function upsertById(list, existing, buildItem) {
    if (!existing) return list.concat(buildItem({ created_at: new Date().toISOString() }));
    let found = false;
    const next = list.map(function (item) {
      if (item.id !== existing.rawId) return item;
      found = true;
      return buildItem(item);
    });
    return found ? next : list.concat(buildItem({ created_at: new Date().toISOString() }));
  }

  async function readBoardKey(table, key, fallback) {
    const res = await state.client.from(table).select('value').eq('key', key).maybeSingle();
    if (res.error || !res.data || !Array.isArray(res.data.value)) return fallback;
    return res.data.value;
  }

  async function writeBoardKey(table, key, value) {
    const res = await state.client.from(table).upsert({ key: key, value: value, updated_at: new Date().toISOString() });
    return !res.error;
  }

  function uid() { return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function showError(node, message) { node.textContent = message; node.hidden = false; }
  function hideError(node) { node.hidden = true; node.textContent = ''; }

  function safe(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderMarkup(node, markup) {
    const parsed = new DOMParser().parseFromString('<body>' + markup + '</body>', 'text/html');
    node.replaceChildren.apply(node, Array.from(parsed.body.childNodes));
  }

  function formatDate(iso) {
    const parts = String(iso || '').split('-');
    const month = MONTHS[Number(parts[1] || 1) - 1] || '';
    return (parts[2] || '—') + ' de ' + month + ' ' + (parts[0] || '');
  }

  function formatTime(value) {
    if (!value) return 'Hora por confirmar';
    const parts = String(value).slice(0, 5).split(':');
    const hour = Number(parts[0]);
    const suffix = hour >= 12 ? 'p. m.' : 'a. m.';
    const displayHour = hour % 12 || 12;
    return displayHour + ':' + parts[1] + ' ' + suffix;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
