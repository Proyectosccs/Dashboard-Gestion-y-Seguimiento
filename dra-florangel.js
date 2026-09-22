(function () {
  'use strict';

  // Mismo proyecto de Supabase que el resto del sitio, pero tabla propia
  // (florangel_board_state) — los datos de este tablero nunca se mezclan
  // con los de Coalición Venezuela ni con el directorio UCV.
  const SUPABASE_URL = 'https://hcylkagvwfncdaaizutn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';
  const TABLE = 'florangel_board_state';
  const TASKS_KEY = 'florangel-tasks-v1';
  const EVENTS_KEY = 'florangel-events-v1';

  // Roster de responsables compartido con TODOS los espacios de tareas del
  // sitio (este tablero, Networking Fundación Ingenia y cada página de
  // organización) — vive en ingenia_board_state, no en florangel_board_state,
  // aunque se lea/escriba con el mismo cliente de Supabase (mismo proyecto).
  const SHARED_TABLE = 'ingenia_board_state';
  const TEAM_MEMBERS_KEY = 'ingenia-team-members-v1';
  const NEW_MEMBER_VALUE = '__new_member__';

  // Misma nomenclatura que Tareas de Equipo en Networking Fundación
  // Ingenia — la columna sigue siendo "todo/doing/done" internamente,
  // solo cambia la etiqueta visible.
  const STAGES = [
    { key: 'todo', label: 'Pendiente', short: 'Pendiente', color: '#a15a7c' },
    { key: 'doing', label: 'En proceso', short: 'En proceso', color: '#7c3aed' },
    { key: 'done', label: 'Listo', short: 'Listo', color: '#0f7a3d' },
    { key: 'blocked', label: 'Bloqueada', short: 'Bloqueada', color: '#a02525' }
  ];
  const FOLLOWUP_STATUSES = [
    { key: 'contacted', label: 'Contactado' },
    { key: 'in_progress', label: 'En seguimiento' },
    { key: 'waiting_response', label: 'Esperando respuesta' }
  ];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const state = {
    client: null,
    view: 'tasks',
    tasks: [],
    events: [],
    teamMembers: [],
    taskResponsableFilter: '',
    calendarMonth: new Date().toISOString().slice(0, 7),
    taskEditor: null,
    eventEditor: null,
    dragTaskId: null
  };

  const dom = {};

  window.florangelAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
    if (target.dataset.view) return setView(target.dataset.view);
    if (target.dataset.action === 'move-task') return moveTask(target.dataset.id, target.dataset.stage);
    if (target.dataset.action) return handleAction(target.dataset.action, target.dataset.id);
    const actionsById = {
      'retry-load': loadAllData,
      'calendar-prev': function () { changeMonth(-1); },
      'calendar-next': function () { changeMonth(1); },
      'calendar-today': function () { state.calendarMonth = new Date().toISOString().slice(0, 7); renderCalendar(); },
      'task-dialog-close': closeTaskDialog,
      'task-dialog-cancel': closeTaskDialog,
      'task-delete': deleteEditingTask,
      'responsable-delete': deleteResponsableFromRoster,
      'tasks-filter-clear': function () {
        state.taskResponsableFilter = '';
        dom.tasksResponsableFilter.value = '';
        renderKanban();
      },
      'event-dialog-close': closeEventDialog,
      'event-dialog-cancel': closeEventDialog,
      'event-delete': deleteEditingEvent
    };
    const action = actionsById[target.id];
    if (action) action();
  };

  function handleAction(action, id) {
    if (action === 'new-task') openTaskDialog();
    if (action === 'edit-task') openTaskDialog(findById(state.tasks, id));
    if (action === 'new-event') openEventDialog();
    if (action === 'edit-event') openEventDialog(findById(state.events, id));
  }

  function init() {
    cacheDom();
    bindStaticEvents();
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return showConnectionFailure();
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadAllData();
    subscribeRealtime();
  }

  function cacheDom() {
    dom.loadingState = document.getElementById('loading-state');
    dom.connectivityBanner = document.getElementById('connectivity-banner');
    dom.toastRegion = document.getElementById('toast-region');
    dom.kanbanBoard = document.getElementById('kanban-board');
    dom.tasksKpiGrid = document.getElementById('tasks-kpi-grid');
    dom.tasksResponsableFilter = document.getElementById('tasks-responsable-filter');
    dom.calendarMonthLabel = document.getElementById('calendar-month-label');
    dom.calendarGrid = document.getElementById('calendar-grid');
    dom.taskDialog = document.getElementById('task-dialog');
    dom.taskForm = document.getElementById('task-form');
    dom.taskDialogTitle = document.getElementById('task-dialog-title');
    dom.taskError = document.getElementById('task-error');
    dom.taskDelete = document.getElementById('task-delete');
    dom.taskResponsableSelect = document.getElementById('field-task-responsable');
    dom.newResponsableField = document.getElementById('new-responsable-field');
    dom.taskDueDate = document.getElementById('field-task-due-date');
    dom.taskStageSelect = document.getElementById('field-task-stage');
    dom.taskFollowupField = document.getElementById('task-followup-field');
    dom.taskFollowupSelect = document.getElementById('field-task-followup');
    dom.taskPrioritySelect = document.getElementById('field-task-priority');
    dom.taskDetail = document.getElementById('field-task-detail');
    dom.taskNextAction = document.getElementById('field-task-next-action');
    dom.taskEvidence = document.getElementById('field-task-evidence');
    dom.eventDialog = document.getElementById('event-dialog');
    dom.eventForm = document.getElementById('event-form');
    dom.eventDialogTitle = document.getElementById('event-dialog-title');
    dom.eventError = document.getElementById('event-error');
    dom.eventDelete = document.getElementById('event-delete');
  }

  function bindStaticEvents() {
    dom.taskForm.addEventListener('submit', onTaskSubmit);
    dom.eventForm.addEventListener('submit', onEventSubmit);
    dom.taskDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeTaskDialog(); });
    dom.eventDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeEventDialog(); });
    dom.taskResponsableSelect.addEventListener('change', onResponsableChange);
    dom.taskStageSelect.addEventListener('change', onTaskStageChange);
    dom.tasksResponsableFilter.addEventListener('change', function () {
      state.taskResponsableFilter = dom.tasksResponsableFilter.value;
      renderKanban();
    });
  }

  function showConnectionFailure() {
    dom.loadingState.hidden = true;
    dom.connectivityBanner.hidden = false;
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
    if (viewName === 'calendar') renderCalendar();
  }

  async function readKey(key, fallback) {
    if (!state.client) return fallback;
    const res = await state.client.from(TABLE).select('value').eq('key', key).maybeSingle();
    if (res.error || !res.data) return fallback;
    return res.data.value;
  }

  async function writeKey(key, value) {
    if (!state.client) return;
    const res = await state.client.from(TABLE).upsert({ key: key, value: value, updated_at: new Date().toISOString() });
    if (res.error) {
      console.error('Error al guardar (' + key + ')', res.error);
      toast('No se pudo guardar — revisa tu conexión.', 'error');
    }
  }

  // El roster de responsables vive en la tabla compartida (SHARED_TABLE),
  // no en la propia de este tablero — por eso no reusa readKey/writeKey.
  async function loadTeamMembers() {
    if (!state.client) return [];
    const res = await state.client.from(SHARED_TABLE).select('value').eq('key', TEAM_MEMBERS_KEY).maybeSingle();
    if (res.error || !res.data) return [];
    return Array.isArray(res.data.value) ? res.data.value : [];
  }

  async function writeTeamMembers(list) {
    if (!state.client) return false;
    const res = await state.client.from(SHARED_TABLE).upsert({ key: TEAM_MEMBERS_KEY, value: list, updated_at: new Date().toISOString() });
    return !res.error;
  }

  async function loadAllData(background) {
    if (!state.client) return;
    if (!background) dom.loadingState.hidden = false;
    dom.connectivityBanner.hidden = true;

    const [tasksValue, eventsValue, teamMembers] = await Promise.all([
      readKey(TASKS_KEY, null),
      readKey(EVENTS_KEY, null),
      loadTeamMembers()
    ]);
    state.teamMembers = teamMembers;

    let tasks = Array.isArray(tasksValue) ? tasksValue : [];
    let events = Array.isArray(eventsValue) ? eventsValue : [];

    // Primera vez que se abre este tablero: siembra un evento de ejemplo
    // este fin de semana para que el calendario no arranque vacío.
    if (tasksValue === null && eventsValue === null) {
      events = [{
        id: uid(), title: 'Jornadas', event_date: upcomingWeekendDate(), start_time: '',
        location: '', notes: '', created_at: new Date().toISOString()
      }];
      await writeKey(EVENTS_KEY, events);
      await writeKey(TASKS_KEY, []);
    }

    state.tasks = tasks;
    state.events = events;
    dom.loadingState.hidden = true;
    populateTasksResponsableFilter();
    renderKanban();
    if (state.view === 'calendar') renderCalendar();
    if (!background) setView(state.view);
  }

  function subscribeRealtime() {
    if (!state.client) return;
    state.client.channel('florangel-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function () { loadAllData(true); })
      .subscribe();
  }

  // ---------- Tareas (kanban) ----------

  function renderKpis() {
    const responsableFilter = state.taskResponsableFilter || null;
    const scoped = state.tasks.filter(function (t) { return !responsableFilter || t.responsable === responsableFilter; });
    const cards = [
      { icon: '🧩', value: scoped.length, label: 'Tareas', cls: 'kpi-primary' }
    ].concat(STAGES.map(function (stage, idx) {
      const count = scoped.filter(function (t) { return t.stage === stage.key; }).length;
      const icons = ['○', '↻', '✓', '⛔'];
      const classes = ['kpi-neutral', 'kpi-sky', 'kpi-good', 'kpi-danger'];
      return { icon: icons[idx], value: count, label: stage.label, cls: classes[idx] };
    }));
    renderMarkup(dom.tasksKpiGrid, cards.map(function (c) {
      return '<article class="kpi-card ' + c.cls + '"><span class="kpi-icon" aria-hidden="true">' + c.icon + '</span><strong>' + c.value + '</strong><span class="kpi-label">' + safe(c.label) + '</span></article>';
    }).join(''));
  }

  function renderKanban() {
    renderKpis();
    const responsableFilter = state.taskResponsableFilter || null;
    renderMarkup(dom.kanbanBoard, STAGES.map(function (stage) {
      const items = state.tasks.filter(function (t) { return t.stage === stage.key && (!responsableFilter || t.responsable === responsableFilter); });
      return '<div class="kanban-column" data-stage="' + stage.key + '">' +
        '<div class="kanban-column-head"><h3>' + safe(stage.label) + '</h3><span class="kanban-count">' + items.length + '</span></div>' +
        (items.length ? items.map(renderTaskCard).join('') : '<div class="kanban-empty">Sin tareas</div>') +
      '</div>';
    }).join(''));

    dom.kanbanBoard.querySelectorAll('.kanban-card').forEach(function (card) {
      card.addEventListener('dragstart', function () {
        state.dragTaskId = card.dataset.id;
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
    });
    dom.kanbanBoard.querySelectorAll('.kanban-column').forEach(function (column) {
      column.addEventListener('dragover', function (e) { e.preventDefault(); column.classList.add('drag-over'); });
      column.addEventListener('dragleave', function () { column.classList.remove('drag-over'); });
      column.addEventListener('drop', function (e) {
        e.preventDefault();
        column.classList.remove('drag-over');
        if (state.dragTaskId) moveTask(state.dragTaskId, column.dataset.stage);
        state.dragTaskId = null;
      });
    });
  }

  function taskDetailText(task) { return task.detail != null ? task.detail : (task.notes || ''); }

  function taskFollowupLabel(task) {
    if (task.stage !== 'doing' || !task.followupStatus) return '';
    const f = FOLLOWUP_STATUSES.find(function (x) { return x.key === task.followupStatus; });
    return f ? f.label : '';
  }

  function renderTaskCard(task) {
    const stageIndex = STAGES.findIndex(function (s) { return s.key === task.stage; });
    const moveButtons = [];
    if (stageIndex > 0) moveButtons.push('<button type="button" class="kanban-move-btn" data-action="move-task" data-id="' + safe(task.id) + '" data-stage="' + STAGES[stageIndex - 1].key + '" onclick="window.florangelAction(event)">← ' + safe(STAGES[stageIndex - 1].short) + '</button>');
    if (stageIndex < STAGES.length - 1) moveButtons.push('<button type="button" class="kanban-move-btn" data-action="move-task" data-id="' + safe(task.id) + '" data-stage="' + STAGES[stageIndex + 1].key + '" onclick="window.florangelAction(event)">' + safe(STAGES[stageIndex + 1].short) + ' →</button>');
    const responsable = responsableName(task.responsable);
    const detailText = taskDetailText(task);
    const followupLabel = taskFollowupLabel(task);
    return '<article class="kanban-card" draggable="true" data-id="' + safe(task.id) + '">' +
      '<button type="button" style="all:unset;cursor:pointer" data-action="edit-task" data-id="' + safe(task.id) + '" onclick="window.florangelAction(event)">' +
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

  function onTaskStageChange() {
    dom.taskFollowupField.hidden = dom.taskStageSelect.value !== 'doing';
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
    const ok = await writeTeamMembers(next);
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
    const ok = await writeTeamMembers(next);
    if (!ok) { toast('No se pudo eliminar al responsable — revisa tu conexión.', 'error'); return; }
    state.teamMembers = next;
    populateResponsableSelect('');
    populateTasksResponsableFilter();
    renderKanban();
    toast('Responsable eliminado del equipo.', 'success');
  }

  function moveTask(id, stage) {
    const task = findById(state.tasks, id);
    if (!task || task.stage === stage) return;
    task.stage = stage;
    renderKanban();
    writeKey(TASKS_KEY, state.tasks);
  }

  function openTaskDialog(task) {
    state.taskEditor = task ? task.id : null;
    dom.taskDialogTitle.textContent = task ? 'Editar tarea' : 'Agregar tarea';
    dom.taskDelete.hidden = !task;
    hideError(dom.taskError);
    dom.taskForm.elements.title.value = task ? task.title : '';
    populateResponsableSelect(task ? task.responsable : '');
    dom.taskDueDate.value = task ? (task.dueDate || '') : '';
    dom.taskDetail.value = task ? taskDetailText(task) : '';
    dom.taskNextAction.value = task ? (task.nextAction || '') : '';
    dom.taskEvidence.value = task ? (task.evidence || '') : '';
    dom.taskPrioritySelect.value = task ? (task.priority || 'media') : 'media';
    dom.taskStageSelect.value = task ? task.stage : 'todo';
    dom.taskFollowupSelect.value = task ? (task.followupStatus || 'in_progress') : 'in_progress';
    onTaskStageChange();
    dom.taskDialog.showModal();
    dom.taskForm.elements.title.focus();
  }

  function closeTaskDialog() { dom.taskDialog.close(); state.taskEditor = null; }

  async function onTaskSubmit(e) {
    e.preventDefault();
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
    const stage = dom.taskStageSelect.value;
    const payload = {
      id: state.taskEditor || uid(),
      title: title,
      detail: dom.taskDetail.value.trim(),
      stage: stage,
      followupStatus: stage === 'doing' ? dom.taskFollowupSelect.value : '',
      priority: dom.taskPrioritySelect.value,
      responsable: responsable,
      dueDate: dom.taskDueDate.value,
      nextAction: dom.taskNextAction.value.trim(),
      evidence: dom.taskEvidence.value.trim(),
      created_at: new Date().toISOString()
    };
    if (state.taskEditor) {
      const existing = findById(state.tasks, state.taskEditor);
      state.tasks = state.tasks.map(function (t) { return t.id === state.taskEditor ? Object.assign({}, existing, payload, { created_at: existing.created_at }) : t; });
    } else {
      state.tasks = state.tasks.concat(payload);
    }
    writeKey(TASKS_KEY, state.tasks);
    renderKanban();
    closeTaskDialog();
    toast('Tarea guardada.', 'success');
  }

  function deleteEditingTask() {
    if (!state.taskEditor) return;
    state.tasks = state.tasks.filter(function (t) { return t.id !== state.taskEditor; });
    writeKey(TASKS_KEY, state.tasks);
    renderKanban();
    closeTaskDialog();
    toast('Tarea eliminada.', 'success');
  }

  // ---------- Calendario ----------

  function changeMonth(delta) {
    const parts = state.calendarMonth.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1 + delta, 1));
    state.calendarMonth = date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
    renderCalendar();
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
      const dayEvents = state.events.filter(function (item) { return item.event_date === iso; });
      markup += '<div class="calendar-day' + (iso === today ? ' is-today' : '') + '">' +
        '<span class="calendar-number">' + day + '</span>' +
        dayEvents.map(function (item) {
          return '<button class="calendar-event" type="button" data-action="edit-event" data-id="' + safe(item.id) + '" onclick="window.florangelAction(event)">' + safe(formatTime(item.start_time) + ' · ' + item.title) + '</button>';
        }).join('') + '</div>';
    }
    renderMarkup(dom.calendarGrid, markup);
  }

  function openEventDialog(evt) {
    state.eventEditor = evt ? evt.id : null;
    dom.eventDialogTitle.textContent = evt ? 'Editar evento' : 'Agregar evento';
    dom.eventDelete.hidden = !evt;
    hideError(dom.eventError);
    dom.eventForm.elements.title.value = evt ? evt.title : '';
    dom.eventForm.elements.event_date.value = evt ? evt.event_date : (state.calendarMonth + '-01');
    dom.eventForm.elements.start_time.value = evt ? timeInput(evt.start_time) : '';
    dom.eventForm.elements.location.value = evt ? (evt.location || '') : '';
    dom.eventForm.elements.notes.value = evt ? (evt.notes || '') : '';
    dom.eventDialog.showModal();
    dom.eventForm.elements.title.focus();
  }

  function closeEventDialog() { dom.eventDialog.close(); state.eventEditor = null; }

  function onEventSubmit(e) {
    e.preventDefault();
    const title = dom.eventForm.elements.title.value.trim();
    const eventDate = dom.eventForm.elements.event_date.value;
    if (!title || !eventDate) { showError(dom.eventError, 'Nombre y fecha son obligatorios.'); return; }
    const payload = {
      id: state.eventEditor || uid(),
      title: title,
      event_date: eventDate,
      start_time: dom.eventForm.elements.start_time.value,
      location: dom.eventForm.elements.location.value.trim(),
      notes: dom.eventForm.elements.notes.value.trim(),
      created_at: new Date().toISOString()
    };
    if (state.eventEditor) {
      const existing = findById(state.events, state.eventEditor);
      state.events = state.events.map(function (ev) { return ev.id === state.eventEditor ? Object.assign({}, existing, payload, { created_at: existing.created_at }) : ev; });
    } else {
      state.events = state.events.concat(payload);
    }
    writeKey(EVENTS_KEY, state.events);
    renderCalendar();
    closeEventDialog();
    toast('Evento guardado.', 'success');
  }

  function deleteEditingEvent() {
    if (!state.eventEditor) return;
    state.events = state.events.filter(function (ev) { return ev.id !== state.eventEditor; });
    writeKey(EVENTS_KEY, state.events);
    renderCalendar();
    closeEventDialog();
    toast('Evento eliminado.', 'success');
  }

  // ---------- Utilidades ----------

  function uid() {
    return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function upcomingWeekendDate() {
    const now = new Date();
    const dow = now.getDay();
    const target = new Date(now);
    if (dow !== 6 && dow !== 0) target.setDate(now.getDate() + ((6 - dow + 7) % 7));
    return target.toISOString().slice(0, 10);
  }

  function findById(list, id) {
    return list.find(function (item) { return String(item.id) === String(id); }) || null;
  }

  function showError(node, message) { node.textContent = message; node.hidden = false; }
  function hideError(node) { node.hidden = true; node.textContent = ''; }

  function toast(message, tone) {
    const node = document.createElement('div');
    node.className = 'toast toast-' + (tone || 'success');
    node.textContent = message;
    dom.toastRegion.replaceChildren(node);
    window.setTimeout(function () { if (node.parentNode) node.remove(); }, 3500);
  }

  function renderMarkup(node, markup) {
    const parsed = new DOMParser().parseFromString('<body>' + markup + '</body>', 'text/html');
    node.replaceChildren.apply(node, Array.from(parsed.body.childNodes));
  }

  function safe(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  function timeInput(value) {
    return value ? String(value).slice(0, 5) : '';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
