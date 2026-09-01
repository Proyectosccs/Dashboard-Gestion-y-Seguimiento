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

  const state = {
    client: null,
    events: [],
    calendarMonth: new Date().toISOString().slice(0, 7),
    selectedDay: new Date().toISOString().slice(0, 10),
    editingEvent: null
  };

  const dom = {};

  window.ingeniaAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
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

  function init() {
    cacheDom();
    dom.eventForm.addEventListener('submit', onEventSubmit);
    dom.eventDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeEventDialog(); });
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return showConnectionFailure();
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadAll();
  }

  function cacheDom() {
    dom.loadingState = document.getElementById('loading-state');
    dom.connectivityBanner = document.getElementById('connectivity-banner');
    dom.calendarView = document.getElementById('calendar-view');
    dom.calendarMonthLabel = document.getElementById('calendar-month-label');
    dom.calendarGrid = document.getElementById('calendar-grid');
    dom.agendaTitle = document.getElementById('agenda-title');
    dom.agendaList = document.getElementById('agenda-list');
    dom.eventDialog = document.getElementById('event-dialog');
    dom.eventDialogTitle = document.getElementById('event-dialog-title');
    dom.eventForm = document.getElementById('event-form');
    dom.eventError = document.getElementById('event-error');
  }

  function showConnectionFailure() {
    dom.loadingState.hidden = true;
    dom.connectivityBanner.hidden = false;
  }

  async function loadAll() {
    dom.loadingState.hidden = false;
    dom.connectivityBanner.hidden = true;

    const [coalicionRes, florangelRes, ucvRes, ingeniaRes] = await Promise.all([
      state.client.from('coalicion_events').select('id,title,event_date,start_time,location,maps_url,notes,status').is('archived_at', null),
      state.client.from('florangel_board_state').select('value').eq('key', 'florangel-events-v1').maybeSingle(),
      state.client.from('ucv_board_state').select('value').eq('key', 'ucv-journeys-v3').maybeSingle(),
      state.client.from('ingenia_board_state').select('key,value').in('key', ['ingenia-networking-events-v1', 'ingenia-otros-events-v1'])
    ]);

    const anyFailed = coalicionRes.error && florangelRes.error && ucvRes.error && ingeniaRes.error;
    if (anyFailed) {
      showConnectionFailure();
      return;
    }
    if (coalicionRes.error || florangelRes.error || ucvRes.error) dom.connectivityBanner.hidden = false;

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

    const ingeniaRows = ingeniaRes.data || [];
    const networkingRaw = ingeniaRows.find(function (r) { return r.key === 'ingenia-networking-events-v1'; });
    const otrosRaw = ingeniaRows.find(function (r) { return r.key === 'ingenia-otros-events-v1'; });
    const networkingEvents = (Array.isArray(networkingRaw && networkingRaw.value) ? networkingRaw.value : []).map(function (e) {
      return { id: 'networking-' + e.id, rawId: e.id, source: 'networking', title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e };
    });
    const otrosEvents = (Array.isArray(otrosRaw && otrosRaw.value) ? otrosRaw.value : []).map(function (e) {
      return { id: 'otros-' + e.id, rawId: e.id, source: 'otros', title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e };
    });

    state.events = coalicionEvents.concat(florangelEvents, ucvEvents, networkingEvents, otrosEvents).filter(function (e) { return !!e.date; });
    dom.loadingState.hidden = true;
    dom.calendarView.hidden = false;
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
          return '<span class="calendar-event src-' + e.source + '" data-event-id="' + safe(e.id) + '" onclick="window.ingeniaAction(event)">' + safe(e.title) + '</span>';
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
      return '<button type="button" class="agenda-row" data-event-id="' + safe(e.id) + '" onclick="window.ingeniaAction(event)" style="width:100%;text-align:left;font:inherit;cursor:pointer">' +
        '<span class="source-dot src-' + e.source + '"></span>' +
        '<div>' +
          '<p class="agenda-row-title">' + safe(e.title) + '</p>' +
          '<p class="agenda-row-meta">◷ ' + safe(timeLabel) + (e.location ? ' · ⌖ ' + safe(e.location) : '') + '</p>' +
          '<span class="agenda-row-source src-' + e.source + '">' + safe(SOURCE_LABELS[e.source]) + '</span>' +
        '</div>' +
      '</button>';
    }).join(''));
  }

  // ---------- Agregar evento (a la fuente elegida) ----------

  function openEventDialog(existing) {
    hideError(dom.eventError);
    dom.eventForm.reset();
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
    const source = dom.eventForm.elements.source.value;
    const title = dom.eventForm.elements.title.value.trim();
    const eventDate = dom.eventForm.elements.event_date.value;
    const startTime = dom.eventForm.elements.start_time.value;
    const location = dom.eventForm.elements.location.value.trim();
    const notes = dom.eventForm.elements.notes.value.trim();
    if (!title || !eventDate) { showError(dom.eventError, 'Título y fecha son obligatorios.'); return; }
    if (source === 'coalicion' && !location) { showError(dom.eventError, 'Coalición Venezuela necesita una ubicación (o edítalo luego para agregar el link de Maps).'); return; }

    const submitBtn = dom.eventForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    let ok = false;
    const fields = { title: title, event_date: eventDate, start_time: startTime, location: location, notes: notes };
    const existing = state.editingEvent;
    if (source === 'coalicion') ok = await saveCoalicionEvent(fields, existing);
    else if (source === 'florangel') ok = await saveFlorangelEvent(fields, existing);
    else if (source === 'ucv') ok = await saveUcvEvent(fields, existing);
    else if (source === 'networking') ok = await saveIngeniaEvent('ingenia-networking-events-v1', fields, existing);
    else if (source === 'otros') ok = await saveIngeniaEvent('ingenia-otros-events-v1', fields, existing);
    submitBtn.disabled = false;

    if (!ok) { showError(dom.eventError, 'No se pudo guardar — revisa tu conexión e intenta de nuevo.'); return; }
    closeEventDialog();
    await loadAll();
    state.selectedDay = eventDate;
    renderCalendar();
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
