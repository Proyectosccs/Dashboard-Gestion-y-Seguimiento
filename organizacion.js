(function () {
  'use strict';

  // Página independiente para una organización creada al vuelo desde
  // Networking Fundación Ingenia (ver calendario-fundacion-ingenia.js).
  // Mismo proyecto de Supabase, mismas claves de ingenia_board_state:
  // el registro de organizaciones, los eventos propios de esta
  // organización, y la lista compartida de tareas del equipo (filtrada
  // aquí por "org"). Cualquier cambio hecho aquí se refleja también en
  // el tablero general de Networking Fundación Ingenia, y viceversa.
  const SUPABASE_URL = 'https://hcylkagvwfncdaaizutn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';
  const TABLE = 'ingenia_board_state';
  const CUSTOM_CALENDARS_KEY = 'ingenia-custom-calendars-v1';
  const TEAM_TASKS_KEY = 'ingenia-team-tasks-v1';
  // Roster de responsables compartido con todos los espacios de tareas del
  // sitio (este tablero, Networking Fundación Ingenia y Dra Florangel).
  const TEAM_MEMBERS_KEY = 'ingenia-team-members-v1';
  const NEW_MEMBER_VALUE = '__new_member__';

  const ORG_ID = new URLSearchParams(window.location.search).get('org') || '';
  const EVENTS_KEY = 'ingenia-custom-' + ORG_ID + '-events-v1';

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const TASK_STATUSES = [
    { key: 'pendiente', label: 'Pendiente', color: '#82796a' },
    { key: 'en_proceso', label: 'En proceso', color: '#0f766e' },
    { key: 'listo', label: 'Listo', color: '#0f7a3d' },
    { key: 'bloqueada', label: 'Bloqueada', color: '#a02525' }
  ];
  const FOLLOWUP_STATUSES = [
    { key: 'contacted', label: 'Contactado' },
    { key: 'in_progress', label: 'En seguimiento' },
    { key: 'waiting_response', label: 'Esperando respuesta' }
  ];

  const state = {
    client: null,
    view: 'calendar',
    org: null,
    events: [],
    allTasks: [],
    teamMembers: [],
    taskResponsableFilter: '',
    calendarMonth: new Date().toISOString().slice(0, 7),
    selectedDay: new Date().toISOString().slice(0, 10),
    editingEvent: null,
    editingTask: null,
    dragTaskId: null
  };

  const dom = {};

  window.orgAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
    if (target.dataset.view) return setView(target.dataset.view);
    const actionsById = {
      'retry-load': function () { loadAll(false); },
      'calendar-prev': function () { changeMonth(-1); },
      'calendar-next': function () { changeMonth(1); },
      'calendar-today': function () {
        state.calendarMonth = new Date().toISOString().slice(0, 7);
        state.selectedDay = new Date().toISOString().slice(0, 10);
        renderCalendar();
      },
      'new-event-btn': openEventDialog,
      'event-dialog-close': closeEventDialog,
      'event-dialog-cancel': closeEventDialog,
      'event-delete': deleteEditingEvent,
      'new-task-btn': openTaskDialog,
      'task-dialog-close': closeTaskDialog,
      'task-dialog-cancel': closeTaskDialog,
      'task-delete': deleteEditingTask,
      'responsable-delete': deleteResponsableFromRoster,
      'tasks-filter-clear': function () {
        state.taskResponsableFilter = '';
        dom.tasksResponsableFilter.value = '';
        renderTasksBoard();
        renderKpis();
      }
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
    if (target.dataset.eventId) openEventDialog(findById(state.events, target.dataset.eventId));
    if (target.dataset.taskId) openTaskDialog(findById(state.allTasks, target.dataset.taskId));
    if (target.dataset.action === 'move-task-status') moveTaskStatus(target.dataset.id, target.dataset.status);
  };

  function findById(list, id) {
    return list.find(function (item) { return String(item.id) === String(id); }) || null;
  }

  function init() {
    cacheDom();
    if (!ORG_ID) return showNotFound();
    dom.eventForm.addEventListener('submit', onEventSubmit);
    dom.eventDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeEventDialog(); });
    dom.taskForm.addEventListener('submit', onTaskSubmit);
    dom.taskDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeTaskDialog(); });
    dom.taskResponsableSelect.addEventListener('change', onResponsableChange);
    dom.taskStatusSelect.addEventListener('change', onTaskStatusChange);
    dom.tasksResponsableFilter.addEventListener('change', function () {
      state.taskResponsableFilter = dom.tasksResponsableFilter.value;
      renderTasksBoard();
      renderKpis();
    });
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return showConnectionFailure();
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadAll(true);
  }

  function cacheDom() {
    dom.tabNav = document.getElementById('tab-nav');
    dom.loadingState = document.getElementById('loading-state');
    dom.notFoundState = document.getElementById('not-found-state');
    dom.connectivityBanner = document.getElementById('connectivity-banner');
    dom.orgTitle = document.getElementById('org-title');
    dom.calendarMonthLabel = document.getElementById('calendar-month-label');
    dom.calendarGrid = document.getElementById('calendar-grid');
    dom.agendaTitle = document.getElementById('agenda-title');
    dom.agendaList = document.getElementById('agenda-list');
    dom.eventDialog = document.getElementById('event-dialog');
    dom.eventDialogTitle = document.getElementById('event-dialog-title');
    dom.eventForm = document.getElementById('event-form');
    dom.eventError = document.getElementById('event-error');
    dom.eventDelete = document.getElementById('event-delete');
    dom.tasksKpiGrid = document.getElementById('tasks-kpi-grid');
    dom.tasksResponsableFilter = document.getElementById('tasks-responsable-filter');
    dom.tasksBoard = document.getElementById('tasks-board');
    dom.taskDialog = document.getElementById('task-dialog');
    dom.taskDialogTitle = document.getElementById('task-dialog-title');
    dom.taskForm = document.getElementById('task-form');
    dom.taskError = document.getElementById('task-error');
    dom.taskDelete = document.getElementById('task-delete');
    dom.taskResponsableSelect = document.getElementById('field-task-responsable');
    dom.newResponsableField = document.getElementById('new-responsable-field');
    dom.taskDueDate = document.getElementById('field-task-due-date');
    dom.taskStatusSelect = document.getElementById('field-task-status');
    dom.taskFollowupField = document.getElementById('task-followup-field');
    dom.taskFollowupSelect = document.getElementById('field-task-followup');
    dom.taskPrioritySelect = document.getElementById('field-task-priority');
    dom.taskDetail = document.getElementById('field-task-detail');
    dom.taskNextAction = document.getElementById('field-task-next-action');
    dom.toastRegion = document.getElementById('toast-region');
  }

  function toast(message, tone) {
    const node = document.createElement('div');
    node.className = 'toast toast-' + (tone || 'success');
    node.textContent = message;
    dom.toastRegion.replaceChildren(node);
    window.setTimeout(function () { if (node.parentNode) node.remove(); }, 3500);
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

  function showNotFound() {
    dom.loadingState.hidden = true;
    dom.notFoundState.hidden = false;
  }

  function applyOrgTheme() {
    document.title = state.org.name + ' — Networking Fundación Ingenia';
    dom.orgTitle.textContent = state.org.name;
    document.documentElement.style.setProperty('--org-color', state.org.color || '#7c3aed');
  }

  async function loadAll(showSpinner) {
    if (showSpinner !== false) dom.loadingState.hidden = false;
    dom.connectivityBanner.hidden = true;

    const [registryRes, tasksRes, eventsRes, membersRes] = await Promise.all([
      state.client.from(TABLE).select('value').eq('key', CUSTOM_CALENDARS_KEY).maybeSingle(),
      state.client.from(TABLE).select('value').eq('key', TEAM_TASKS_KEY).maybeSingle(),
      state.client.from(TABLE).select('value').eq('key', EVENTS_KEY).maybeSingle(),
      state.client.from(TABLE).select('value').eq('key', TEAM_MEMBERS_KEY).maybeSingle()
    ]);

    if (registryRes.error && tasksRes.error && eventsRes.error) return showConnectionFailure();
    if (registryRes.error || tasksRes.error || eventsRes.error) dom.connectivityBanner.hidden = false;

    const registry = Array.isArray(registryRes.data && registryRes.data.value) ? registryRes.data.value : [];
    state.org = registry.find(function (o) { return o.id === ORG_ID; }) || null;
    if (!state.org) { dom.loadingState.hidden = true; return showNotFound(); }

    state.allTasks = Array.isArray(tasksRes.data && tasksRes.data.value) ? tasksRes.data.value : [];
    state.events = (Array.isArray(eventsRes.data && eventsRes.data.value) ? eventsRes.data.value : []).filter(function (e) { return !!e.event_date; });
    state.teamMembers = Array.isArray(membersRes.data && membersRes.data.value) ? membersRes.data.value : [];

    applyOrgTheme();
    dom.loadingState.hidden = true;
    dom.tabNav.hidden = false;
    populateTasksResponsableFilter();
    renderTasksBoard();
    renderKpis();
    setView(state.view);
    renderCalendar();
  }

  async function writeBoardKey(key, value) {
    const res = await state.client.from(TABLE).upsert({ key: key, value: value, updated_at: new Date().toISOString() });
    return !res.error;
  }

  // ---------- Calendario ----------

  function changeMonth(delta) {
    const parts = state.calendarMonth.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1 + delta, 1));
    state.calendarMonth = date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
    renderCalendar();
  }

  function eventsOnDay(iso) {
    return state.events.filter(function (e) { return e.event_date === iso; })
      .sort(function (a, b) { return (a.start_time || '99:99').localeCompare(b.start_time || '99:99'); });
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
      markup += '<button type="button" class="calendar-day' + (iso === today ? ' is-today' : '') + (isSelected ? ' is-selected' : '') + '" data-day="' + iso + '" onclick="window.orgAction(event)" style="text-align:left;font:inherit;cursor:pointer">' +
        '<span class="calendar-number">' + day + '</span>' +
        dayEvents.map(function (e) {
          return '<span class="calendar-event" data-event-id="' + safe(e.id) + '" onclick="window.orgAction(event)">' + safe(e.title) + '</span>';
        }).join('') +
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
      renderMarkup(dom.agendaList, '<div class="empty-state"><strong>Sin eventos</strong><span>No hay nada registrado para este día.</span></div>');
      return;
    }
    renderMarkup(dom.agendaList, dayEvents.map(function (e) {
      const timeLabel = e.start_time ? formatTime(e.start_time) : 'Hora por confirmar';
      return '<button type="button" class="agenda-row" data-event-id="' + safe(e.id) + '" onclick="window.orgAction(event)" style="width:100%;text-align:left;font:inherit;cursor:pointer">' +
        '<div>' +
          '<p class="agenda-row-title">' + safe(e.title) + '</p>' +
          '<p class="agenda-row-meta">◷ ' + safe(timeLabel) + (e.location ? ' · ⌖ ' + safe(e.location) : '') + '</p>' +
        '</div>' +
      '</button>';
    }).join(''));
  }

  function openEventDialog(existing) {
    hideError(dom.eventError);
    dom.eventForm.reset();
    state.editingEvent = existing || null;
    dom.eventDialogTitle.textContent = existing ? 'Editar evento' : 'Agregar evento';
    dom.eventDelete.hidden = !existing;
    if (existing) {
      dom.eventForm.elements.title.value = existing.title || '';
      dom.eventForm.elements.event_date.value = existing.event_date || '';
      dom.eventForm.elements.start_time.value = existing.start_time ? existing.start_time.slice(0, 5) : '';
      dom.eventForm.elements.location.value = existing.location || '';
      dom.eventForm.elements.notes.value = existing.notes || '';
    } else {
      dom.eventForm.elements.event_date.value = state.selectedDay || new Date().toISOString().slice(0, 10);
    }
    dom.eventDialog.showModal();
    dom.eventForm.elements.title.focus();
  }

  function closeEventDialog() { dom.eventDialog.close(); state.editingEvent = null; }

  async function onEventSubmit(e) {
    e.preventDefault();
    hideError(dom.eventError);
    const title = dom.eventForm.elements.title.value.trim();
    const eventDate = dom.eventForm.elements.event_date.value;
    if (!title || !eventDate) { showError(dom.eventError, 'Título y fecha son obligatorios.'); return; }
    const existing = state.editingEvent;
    const payload = {
      id: existing ? existing.id : uid(),
      title: title,
      event_date: eventDate,
      start_time: dom.eventForm.elements.start_time.value,
      location: dom.eventForm.elements.location.value.trim(),
      notes: dom.eventForm.elements.notes.value.trim(),
      created_at: existing ? existing.created_at : new Date().toISOString()
    };
    const next = existing
      ? state.events.map(function (ev) { return ev.id === existing.id ? payload : ev; })
      : state.events.concat(payload);
    const ok = await writeBoardKey(EVENTS_KEY, next);
    if (!ok) { showError(dom.eventError, 'No se pudo guardar — revisa tu conexión.'); return; }
    state.events = next;
    closeEventDialog();
    state.selectedDay = eventDate;
    renderCalendar();
    toast('Evento guardado.', 'success');
  }

  async function deleteEditingEvent() {
    if (!state.editingEvent) return;
    const next = state.events.filter(function (ev) { return ev.id !== state.editingEvent.id; });
    const ok = await writeBoardKey(EVENTS_KEY, next);
    if (!ok) { showError(dom.eventError, 'No se pudo eliminar — revisa tu conexión.'); return; }
    state.events = next;
    closeEventDialog();
    renderCalendar();
    toast('Evento eliminado.', 'success');
  }

  // ---------- Tareas ----------

  function renderKpis() {
    const responsableFilter = state.taskResponsableFilter || null;
    const scoped = state.allTasks.filter(function (t) { return t.org === ORG_ID && (!responsableFilter || t.responsable === responsableFilter); });
    function count(statusKey) { return scoped.filter(function (t) { return (t.status || 'pendiente') === statusKey; }).length; }
    const cards = [
      { icon: '🧩', value: scoped.length, label: 'Tareas', cls: 'kpi-primary' },
      { icon: '○', value: count('pendiente'), label: 'Pendiente', cls: 'kpi-neutral' },
      { icon: '↻', value: count('en_proceso'), label: 'En proceso', cls: 'kpi-accent' },
      { icon: '✓', value: count('listo'), label: 'Listo', cls: 'kpi-good' },
      { icon: '⛔', value: count('bloqueada'), label: 'Bloqueada', cls: 'kpi-danger' }
    ];
    renderMarkup(dom.tasksKpiGrid, cards.map(function (c) {
      return '<article class="kpi-card ' + c.cls + '"><span class="kpi-icon" aria-hidden="true">' + c.icon + '</span><strong>' + c.value + '</strong><span class="kpi-label">' + safe(c.label) + '</span></article>';
    }).join(''));
  }

  function renderTasksBoard() {
    const responsableFilter = state.taskResponsableFilter || null;
    const scoped = state.allTasks.filter(function (t) { return t.org === ORG_ID && (!responsableFilter || t.responsable === responsableFilter); });
    renderMarkup(dom.tasksBoard, TASK_STATUSES.map(function (status) {
      const items = scoped.filter(function (t) { return (t.status || 'pendiente') === status.key; });
      return '<div class="kanban-column" data-status="' + status.key + '">' +
        '<div class="kanban-column-head"><h3>' + safe(status.label) + '</h3><span class="kanban-count">' + items.length + '</span></div>' +
        (items.length ? items.map(renderTaskCard).join('') : '<div class="kanban-empty">Sin tareas</div>') +
      '</div>';
    }).join(''));

    dom.tasksBoard.querySelectorAll('.kanban-card').forEach(function (card) {
      card.addEventListener('dragstart', function () { state.dragTaskId = card.dataset.id; card.classList.add('dragging'); });
      card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
    });
    dom.tasksBoard.querySelectorAll('.kanban-column').forEach(function (column) {
      column.addEventListener('dragover', function (e) { e.preventDefault(); column.classList.add('drag-over'); });
      column.addEventListener('dragleave', function () { column.classList.remove('drag-over'); });
      column.addEventListener('drop', function (e) {
        e.preventDefault();
        column.classList.remove('drag-over');
        if (state.dragTaskId) moveTaskStatus(state.dragTaskId, column.dataset.status);
        state.dragTaskId = null;
      });
    });
  }

  function taskDetailText(task) { return task.detail != null ? task.detail : (task.notes || ''); }

  function taskFollowupLabel(task) {
    if (task.status !== 'en_proceso' || !task.followupStatus) return '';
    const f = FOLLOWUP_STATUSES.find(function (x) { return x.key === task.followupStatus; });
    return f ? f.label : '';
  }

  function renderTaskCard(task) {
    const statusIndex = TASK_STATUSES.findIndex(function (s) { return s.key === (task.status || 'pendiente'); });
    const status = TASK_STATUSES[statusIndex] || TASK_STATUSES[0];
    const moveButtons = [];
    if (statusIndex > 0) moveButtons.push('<button type="button" class="kanban-move-btn" data-action="move-task-status" data-id="' + safe(task.id) + '" data-status="' + TASK_STATUSES[statusIndex - 1].key + '" onclick="window.orgAction(event)">← ' + safe(TASK_STATUSES[statusIndex - 1].label) + '</button>');
    if (statusIndex < TASK_STATUSES.length - 1) moveButtons.push('<button type="button" class="kanban-move-btn" data-action="move-task-status" data-id="' + safe(task.id) + '" data-status="' + TASK_STATUSES[statusIndex + 1].key + '" onclick="window.orgAction(event)">' + safe(TASK_STATUSES[statusIndex + 1].label) + ' →</button>');
    const responsable = responsableName(task.responsable);
    const detailText = taskDetailText(task);
    const followupLabel = taskFollowupLabel(task);
    return '<article class="kanban-card" draggable="true" data-id="' + safe(task.id) + '" style="--status-color:' + safe(status.color) + '">' +
      '<button type="button" style="all:unset;cursor:pointer" data-task-id="' + safe(task.id) + '" onclick="window.orgAction(event)">' +
        '<p class="kanban-card-title">' + safe(task.title) + '</p>' +
        (detailText ? '<p class="kanban-card-notes">' + safe(detailText) + '</p>' : '') +
        (responsable ? '<span class="responsable-tag">👤 ' + safe(responsable) + '</span>' : '') +
        (followupLabel ? '<span class="responsable-tag">↻ ' + safe(followupLabel) + '</span>' : '') +
        (task.dueDate ? '<span class="responsable-tag">⏰ ' + safe(formatDate(task.dueDate)) + '</span>' : '') +
      '</button>' +
      '<div class="kanban-card-actions">' + moveButtons.join('') + '</div>' +
    '</article>';
  }

  // ---------- Responsables (roster compartido con todos los espacios de tareas) ----------

  function findTeamMember(id) {
    return state.teamMembers.find(function (m) { return m.id === id; }) || null;
  }

  function responsableName(id) {
    const member = id ? findTeamMember(id) : null;
    return member ? member.name : '';
  }

  function populateResponsableSelect(currentId) {
    const options = ['<option value="">Sin asignar</option>'].concat(state.teamMembers.map(function (m) {
      return '<option value="' + safe(m.id) + '">👤 ' + safe(m.name) + '</option>';
    }), ['<option value="' + NEW_MEMBER_VALUE + '">➕ Otro (agregar miembro nuevo)</option>']);
    renderMarkup(dom.taskResponsableSelect, options.join(''));
    dom.taskResponsableSelect.value = currentId || '';
    dom.newResponsableField.hidden = true;
  }

  function onResponsableChange() {
    const isNew = dom.taskResponsableSelect.value === NEW_MEMBER_VALUE;
    dom.newResponsableField.hidden = !isNew;
    if (isNew) dom.taskForm.elements.new_responsable_name.focus();
  }

  function onTaskStatusChange() {
    dom.taskFollowupField.hidden = dom.taskStatusSelect.value !== 'en_proceso';
  }

  function populateTasksResponsableFilter() {
    const current = dom.tasksResponsableFilter.value;
    const options = state.teamMembers.map(function (m) {
      return '<option value="' + safe(m.id) + '">👤 ' + safe(m.name) + '</option>';
    });
    renderMarkup(dom.tasksResponsableFilter, ['<option value="">Todos los responsables</option>'].concat(options).join(''));
    const stillExists = state.teamMembers.some(function (m) { return m.id === current; });
    dom.tasksResponsableFilter.value = stillExists ? current : '';
    state.taskResponsableFilter = dom.tasksResponsableFilter.value;
  }

  async function createTeamMember(name) {
    const entry = { id: uid(), name: name, created_at: new Date().toISOString() };
    const next = state.teamMembers.concat(entry);
    const ok = await writeBoardKey(TEAM_MEMBERS_KEY, next);
    if (!ok) return null;
    state.teamMembers = next;
    return entry;
  }

  async function deleteResponsableFromRoster() {
    const selectedId = dom.taskResponsableSelect.value;
    if (!selectedId || selectedId === NEW_MEMBER_VALUE) return;
    const member = findTeamMember(selectedId);
    if (!member) return;
    const next = state.teamMembers.filter(function (m) { return m.id !== selectedId; });
    const ok = await writeBoardKey(TEAM_MEMBERS_KEY, next);
    if (!ok) { toast('No se pudo eliminar al responsable — revisa tu conexión.', 'error'); return; }
    state.teamMembers = next;
    populateResponsableSelect('');
    populateTasksResponsableFilter();
    renderTasksBoard();
    renderKpis();
    toast('Responsable eliminado del equipo.', 'success');
  }

  async function moveTaskStatus(id, status) {
    const task = findById(state.allTasks, id);
    if (!task || task.status === status) return;
    const previous = task.status;
    task.status = status;
    renderTasksBoard();
    renderKpis();
    const ok = await writeBoardKey(TEAM_TASKS_KEY, state.allTasks);
    if (!ok) { task.status = previous; renderTasksBoard(); renderKpis(); toast('No se pudo actualizar el estado — revisa tu conexión.', 'error'); }
  }

  function openTaskDialog(existing) {
    hideError(dom.taskError);
    dom.taskForm.reset();
    state.editingTask = existing || null;
    dom.taskDialogTitle.textContent = existing ? 'Editar tarea' : 'Agregar tarea';
    dom.taskDelete.hidden = !existing;
    dom.taskForm.elements.title.value = existing ? (existing.title || '') : '';
    populateResponsableSelect(existing ? existing.responsable : '');
    dom.taskDueDate.value = existing ? (existing.dueDate || '') : '';
    dom.taskDetail.value = existing ? taskDetailText(existing) : '';
    dom.taskNextAction.value = existing ? (existing.nextAction || '') : '';
    dom.taskPrioritySelect.value = existing ? (existing.priority || 'media') : 'media';
    dom.taskStatusSelect.value = existing ? (existing.status || 'pendiente') : 'pendiente';
    dom.taskFollowupSelect.value = existing ? (existing.followupStatus || 'in_progress') : 'in_progress';
    onTaskStatusChange();
    dom.taskDialog.showModal();
    dom.taskForm.elements.title.focus();
  }

  function closeTaskDialog() { dom.taskDialog.close(); state.editingTask = null; }

  async function onTaskSubmit(e) {
    e.preventDefault();
    hideError(dom.taskError);
    const title = dom.taskForm.elements.title.value.trim();
    if (!title) { showError(dom.taskError, 'El título es obligatorio.'); return; }
    let responsable = dom.taskForm.elements.responsable.value;
    if (responsable === NEW_MEMBER_VALUE) {
      const newName = dom.taskForm.elements.new_responsable_name.value.trim();
      if (!newName) { showError(dom.taskError, 'Escribe el nombre del nuevo responsable.'); return; }
      const created = await createTeamMember(newName);
      if (!created) { showError(dom.taskError, 'No se pudo guardar el responsable — revisa tu conexión.'); return; }
      responsable = created.id;
      populateTasksResponsableFilter();
    }
    const existing = state.editingTask;
    const status = dom.taskForm.elements.status.value;
    const payload = {
      id: existing ? existing.id : uid(),
      org: ORG_ID,
      title: title,
      detail: dom.taskDetail.value.trim(),
      status: status,
      followupStatus: status === 'en_proceso' ? dom.taskFollowupSelect.value : '',
      priority: dom.taskPrioritySelect.value,
      responsable: responsable,
      dueDate: dom.taskDueDate.value,
      nextAction: dom.taskNextAction.value.trim(),
      created_at: existing ? existing.created_at : new Date().toISOString()
    };
    const next = existing
      ? state.allTasks.map(function (t) { return t.id === existing.id ? payload : t; })
      : state.allTasks.concat(payload);
    const ok = await writeBoardKey(TEAM_TASKS_KEY, next);
    if (!ok) { showError(dom.taskError, 'No se pudo guardar — revisa tu conexión.'); return; }
    state.allTasks = next;
    renderTasksBoard();
    renderKpis();
    closeTaskDialog();
    toast('Tarea guardada.', 'success');
  }

  async function deleteEditingTask() {
    if (!state.editingTask) return;
    const next = state.allTasks.filter(function (t) { return t.id !== state.editingTask.id; });
    const ok = await writeBoardKey(TEAM_TASKS_KEY, next);
    if (!ok) { toast('No se pudo eliminar — revisa tu conexión.', 'error'); return; }
    state.allTasks = next;
    renderTasksBoard();
    renderKpis();
    closeTaskDialog();
    toast('Tarea eliminada.', 'success');
  }

  // ---------- Utilidades ----------

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
