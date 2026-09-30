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
  const CONTACTS_KEY = 'florangel-contacts-v1';
  const UI_KEY = 'florangel-ui-v1';

  // Campos compartidos del formulario de eventos, iguales en todos los
  // calendarios (Networking, Organización, Dra Florangel, CMDLT, Coalición).
  const MEDICAL_SPECIALTIES = [
    'Medicina General', 'Medicina Interna', 'Pediatría', 'Ginecología y Obstetricia',
    'Cardiología', 'Dermatología', 'Oftalmología', 'Otorrinolaringología', 'Psiquiatría',
    'Psicología', 'Nutrición y Dietética', 'Odontología', 'Fisioterapia', 'Endocrinología',
    'Urología', 'Traumatología', 'Gastroenterología', 'Neurología'
  ];
  const OTHER_SPECIALTY_VALUE = '__otros__';

  // Código de país + número, en vez de un solo campo de texto libre — mismo
  // catálogo copiado en cada dashboard del sitio que tiene contactos.
  const PHONE_COUNTRIES = [
    { code: '+58', label: '🇻🇪 +58 Venezuela' },
    { code: '+57', label: '🇨🇴 +57 Colombia' },
    { code: '+1', label: '🇺🇸 +1 EE. UU. / Canadá' },
    { code: '+34', label: '🇪🇸 +34 España' },
    { code: '+51', label: '🇵🇪 +51 Perú' },
    { code: '+52', label: '🇲🇽 +52 México' },
    { code: '+54', label: '🇦🇷 +54 Argentina' },
    { code: '+56', label: '🇨🇱 +56 Chile' },
    { code: '+593', label: '🇪🇨 +593 Ecuador' },
    { code: '+507', label: '🇵🇦 +507 Panamá' }
  ];
  const DEFAULT_PHONE_CODE = PHONE_COUNTRIES[0].code;

  function populatePhoneCodeSelect(selectEl, currentCode) {
    renderMarkup(selectEl, PHONE_COUNTRIES.map(function (c) { return '<option value="' + c.code + '">' + c.label + '</option>'; }).join(''));
    selectEl.value = currentCode || DEFAULT_PHONE_CODE;
  }

  function splitPhone(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === 'Por confirmar' || raw.charAt(0) !== '+') return { code: DEFAULT_PHONE_CODE, number: raw && raw !== 'Por confirmar' ? raw : '' };
    const sorted = PHONE_COUNTRIES.slice().sort(function (a, b) { return b.code.length - a.code.length; });
    const found = sorted.find(function (c) { return raw.indexOf(c.code) === 0; });
    if (found) return { code: found.code, number: raw.slice(found.code.length).trim() };
    return { code: DEFAULT_PHONE_CODE, number: raw };
  }

  function combinePhone(code, number) {
    const digits = number.trim();
    return digits ? code + digits : '';
  }

  // Estado de contacto (contactado o no) — mismo catálogo en todos los
  // dashboards con contactos.
  const CONTACT_STATUSES = [
    { key: 'pending', label: 'Pendiente', emoji: '○' },
    { key: 'contacted', label: 'Contactado', emoji: '📞' },
    { key: 'waiting_response', label: 'Esperando respuesta', emoji: '⏳' }
  ];
  const CONTACT_STATUS_MAP = {};
  CONTACT_STATUSES.forEach(function (s) { CONTACT_STATUS_MAP[s.key] = s; });
  function contactStatusInfo(c) { return CONTACT_STATUS_MAP[c && c.status] || CONTACT_STATUSES[0]; }
  function populateContactStatusSelect(selectEl, current) {
    renderMarkup(selectEl, CONTACT_STATUSES.map(function (s) { return '<option value="' + s.key + '">' + s.emoji + ' ' + s.label + '</option>'; }).join(''));
    selectEl.value = current || CONTACT_STATUSES[0].key;
  }
  function populateContactStatusFilter(selectEl) {
    renderMarkup(selectEl, '<option value="">Todos los estados</option>' + CONTACT_STATUSES.map(function (s) { return '<option value="' + s.key + '">' + s.emoji + ' ' + s.label + '</option>'; }).join(''));
  }
  function downloadVCard(c) {
    if (!c) return;
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + (c.name || 'Contacto')];
    if (c.role) lines.push('TITLE:' + c.role);
    if (c.org) lines.push('ORG:' + c.org);
    if (c.phone) lines.push('TEL;TYPE=CELL:' + c.phone);
    if (c.email) lines.push('EMAIL:' + c.email);
    if (c.notes) lines.push('NOTE:' + String(c.notes).replace(/\r?\n/g, '\\n'));
    lines.push('END:VCARD');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (c.name || 'contacto').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') + '.vcf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Modo edición: textos y orden personalizables, igual que en el tablero
  // UCV — pero sin los controles de tamaño de burbuja/título, porque este
  // sitio usa una hoja de estilos fija en vez de estilos calculados en JS.
  const DEFAULT_UI = {
    pageTitle: 'Dra Florangel',
    pageSubtitle: 'Tareas pendientes y calendario de jornadas.',
    tasksTitle: 'Tareas de Equipo',
    calendarTitle: '🗓️ Calendario de jornadas',
    contactsTitle: 'Contactos',
    tabOrder: ['tasks', 'calendar', 'contacts'],
    boardOrder: ['kpis', 'board']
  };
  const NAV_ITEMS = {
    tasks: { emoji: '📋', label: 'Tareas de Equipo' },
    calendar: { emoji: '🗓️', label: 'Calendario' },
    contacts: { emoji: '🤝', label: 'Contactos' }
  };
  const BOARD_ITEMS = {
    kpis: { emoji: '📊', label: 'Indicadores' },
    board: { emoji: '🗂️', label: 'Tablero de tareas' }
  };

  function normalizeUI(value) {
    const v = value || {};
    const tabIds = Object.keys(NAV_ITEMS);
    const sectionIds = Object.keys(BOARD_ITEMS);
    const tabs = Array.isArray(v.tabOrder) ? v.tabOrder.filter(function (x) { return NAV_ITEMS[x]; }) : [];
    tabIds.forEach(function (id) { if (tabs.indexOf(id) === -1) tabs.push(id); });
    const sections = Array.isArray(v.boardOrder) ? v.boardOrder.filter(function (x) { return BOARD_ITEMS[x]; }) : [];
    sectionIds.forEach(function (id) { if (sections.indexOf(id) === -1) sections.push(id); });
    return Object.assign({}, DEFAULT_UI, v, { tabOrder: tabs, boardOrder: sections });
  }

  function cloneUI(value) {
    const v = normalizeUI(value);
    return Object.assign({}, v, { tabOrder: v.tabOrder.slice(), boardOrder: v.boardOrder.slice() });
  }

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
    contacts: [],
    query: '',
    contactStatusFilter: '',
    teamMembers: [],
    taskResponsableFilter: '',
    calendarMonth: new Date().toISOString().slice(0, 7),
    calendarViewMode: 'month',
    calendarWeekStart: mondayOf(new Date().toISOString().slice(0, 10)),
    calendarYear: new Date().getUTCFullYear(),
    taskEditor: null,
    eventEditor: null,
    contactEditor: null,
    contactViewer: null,
    dragTaskId: null,
    ui: cloneUI(DEFAULT_UI),
    customizeForm: cloneUI(DEFAULT_UI)
  };

  const dom = {};

  window.florangelAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
    if (target.dataset.view) return setView(target.dataset.view);
    if (target.dataset.calendarView) return setCalendarViewMode(target.dataset.calendarView);
    if (target.dataset.action === 'move-task') return moveTask(target.dataset.id, target.dataset.stage);
    if (target.dataset.action) return handleAction(target.dataset.action, target.dataset.id);
    const actionsById = {
      'retry-load': loadAllData,
      'calendar-prev': function () { changePeriod(-1); },
      'calendar-next': function () { changePeriod(1); },
      'calendar-today': function () {
        const todayIso = new Date().toISOString().slice(0, 10);
        state.calendarMonth = todayIso.slice(0, 7);
        state.calendarWeekStart = mondayOf(todayIso);
        state.calendarYear = new Date().getUTCFullYear();
        renderCalendar();
      },
      'task-dialog-close': closeTaskDialog,
      'task-dialog-cancel': closeTaskDialog,
      'task-delete': deleteEditingTask,
      'tasks-filter-clear': function () {
        state.taskResponsableFilter = '';
        dom.tasksResponsableFilter.value = '';
        renderKanban();
      },
      'event-dialog-close': closeEventDialog,
      'event-dialog-cancel': closeEventDialog,
      'event-delete': deleteEditingEvent,
      'field-event-jornada-type': onJornadaTypeChange,
      'field-event-specialty-other': onSpecialtyOtherChange,
      'contact-dialog-close': closeContactDialog,
      'contact-dialog-cancel': closeContactDialog,
      'contact-delete': deleteEditingContact,
      'contact-search-clear': clearContactSearch,
      'contact-detail-close': closeContactDetail,
      'contact-detail-edit': editFromContactDetail,
      'contact-detail-delete': deleteFromContactDetail,
      'contact-detail-vcard': function () { downloadVCard(findById(state.contacts, state.contactViewer)); },
      'customize-open': openCustomize,
      'customize-dialog-close': closeCustomize,
      'customize-dialog-cancel': closeCustomize,
      'customize-reset': resetCustomize
    };
    const action = actionsById[target.id];
    if (action) action();
    if (target.dataset.yearDay) {
      state.calendarMonth = target.dataset.yearDay.slice(0, 7);
      setCalendarViewMode('month');
    }
  };

  function handleAction(action, id) {
    if (action === 'new-task') openTaskDialog();
    if (action === 'edit-task') openTaskDialog(findById(state.tasks, id));
    if (action === 'new-event') openEventDialog();
    if (action === 'edit-event') openEventDialog(findById(state.events, id));
    if (action === 'new-contact') openContactDialog();
    if (action === 'edit-contact') openContactDialog(findById(state.contacts, id));
    if (action === 'view-contact') openContactDetail(findById(state.contacts, id));
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
    dom.calendarViewSwitcher = document.getElementById('calendar-view-switcher');
    dom.calendarPeriodNav = document.getElementById('calendar-period-nav');
    dom.calendarPeriodLabel = document.getElementById('calendar-period-label');
    dom.calendarMonthView = document.getElementById('calendar-month-view');
    dom.calendarGrid = document.getElementById('calendar-grid');
    dom.calendarWeekView = document.getElementById('calendar-week-view');
    dom.calendarWeekGrid = document.getElementById('calendar-week-grid');
    dom.calendarYearView = document.getElementById('calendar-year-view');
    dom.calendarYearGrid = document.getElementById('calendar-year-grid');
    dom.calendarAgendaView = document.getElementById('calendar-agenda-view');
    dom.calendarAgendaList = document.getElementById('calendar-agenda-list');
    dom.taskDialog = document.getElementById('task-dialog');
    dom.taskForm = document.getElementById('task-form');
    dom.taskDialogTitle = document.getElementById('task-dialog-title');
    dom.taskError = document.getElementById('task-error');
    dom.taskDelete = document.getElementById('task-delete');
    dom.responsableChecklist = document.getElementById('responsable-checklist');
    dom.newResponsableField = document.getElementById('new-responsable-field');
    dom.taskDueDate = document.getElementById('field-task-due-date');
    dom.taskStageSelect = document.getElementById('field-task-stage');
    dom.taskFollowupField = document.getElementById('task-followup-field');
    dom.taskFollowupSelect = document.getElementById('field-task-followup');
    dom.taskPrioritySelect = document.getElementById('field-task-priority');
    dom.taskDetail = document.getElementById('field-task-detail');
    dom.taskNextAction = document.getElementById('field-task-next-action');
    dom.eventDialog = document.getElementById('event-dialog');
    dom.eventForm = document.getElementById('event-form');
    dom.eventDialogTitle = document.getElementById('event-dialog-title');
    dom.eventError = document.getElementById('event-error');
    dom.eventJornadaTypeSelect = document.getElementById('field-event-jornada-type');
    dom.eventSpecialtiesField = document.getElementById('event-specialties-field');
    dom.eventSpecialtiesList = document.getElementById('event-specialties-list');
    dom.eventCustomSpecialtyField = document.getElementById('event-custom-specialty-field');
    dom.eventParticipantsList = document.getElementById('event-participants-list');
    dom.eventDelete = document.getElementById('event-delete');
    dom.contactsViewTitle = document.getElementById('contacts-view-title');
    dom.contactSearch = document.getElementById('contact-search');
    dom.contactSearchClear = document.getElementById('contact-search-clear');
    dom.contactResultCount = document.getElementById('contact-result-count');
    dom.contactsList = document.getElementById('contacts-list');
    dom.contactDialog = document.getElementById('contact-dialog');
    dom.contactDialogTitle = document.getElementById('contact-dialog-title');
    dom.contactForm = document.getElementById('contact-form');
    dom.contactError = document.getElementById('contact-error');
    dom.contactDelete = document.getElementById('contact-delete');
    dom.contactPhoneCode = document.getElementById('field-contact-phone-code');
    dom.contactStatusSelect = document.getElementById('field-contact-status');
    dom.contactStatusFilter = document.getElementById('contact-status-filter');
    dom.contactDetailDialog = document.getElementById('contact-detail-dialog');
    dom.contactDetailTitle = document.getElementById('contact-detail-title');
    dom.contactDetailBody = document.getElementById('contact-detail-body');
    dom.pageTitle = document.getElementById('page-title');
    dom.pageSubtitle = document.getElementById('page-subtitle');
    dom.tabNav = document.getElementById('tab-nav');
    dom.tasksBlocks = document.getElementById('tasks-blocks');
    dom.tasksTitle = document.getElementById('tasks-title');
    dom.calendarTitle = document.getElementById('calendar-title');
    dom.customizeDialog = document.getElementById('customize-dialog');
    dom.customizeForm = document.getElementById('customize-form');
    dom.customPageTitle = document.getElementById('field-custom-page-title');
    dom.customSubtitle = document.getElementById('field-custom-subtitle');
    dom.customTasksTitle = document.getElementById('field-custom-tasks-title');
    dom.customCalendarTitle = document.getElementById('field-custom-calendar-title');
    dom.customContactsTitle = document.getElementById('field-custom-contacts-title');
    dom.customizeTabsList = document.getElementById('customize-tabs-list');
    dom.customizeSectionsList = document.getElementById('customize-sections-list');
  }

  function bindStaticEvents() {
    dom.taskForm.addEventListener('submit', onTaskSubmit);
    dom.eventForm.addEventListener('submit', onEventSubmit);
    dom.contactForm.addEventListener('submit', onContactSubmit);
    dom.taskDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeTaskDialog(); });
    dom.eventDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeEventDialog(); });
    dom.contactDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeContactDialog(); });
    dom.contactSearch.addEventListener('input', handleContactSearch);
    populateContactStatusFilter(dom.contactStatusFilter);
    dom.contactStatusFilter.addEventListener('change', function () {
      state.contactStatusFilter = dom.contactStatusFilter.value;
      renderContacts();
    });
    dom.contactDetailDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeContactDetail(); });
    dom.customizeForm.addEventListener('submit', onCustomizeSubmit);
    dom.customizeDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeCustomize(); });
    dom.responsableChecklist.addEventListener('change', onResponsableChecklistChange);
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
    if (res.error) { state.loadFailed = true; return fallback; }
    if (!res.data) return fallback;
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

  // Guarda un cambio sobre la versión ACTUAL de Supabase, no sobre la que
  // este tablero tiene en memoria: lee, aplica `change` y escribe solo si
  // nadie guardó entre medio (si alguien lo hizo, reintenta sobre esa
  // versión). Si la lectura falla no escribe nada. Devuelve el valor
  // guardado, o null si no se pudo guardar.
  async function mutateKey(table, key, fallback, change) {
    if (!state.client) return null;
    for (let intento = 0; intento < 4; intento++) {
      const res = await state.client.from(table).select('value,updated_at').eq('key', key).maybeSingle();
      if (res.error) return null;
      const raw = res.data ? res.data.value : null;
      const current = (Array.isArray(fallback) ? Array.isArray(raw) : raw != null) ? raw : fallback;
      const next = change(JSON.parse(JSON.stringify(current)));
      const stamp = new Date().toISOString();
      const w = res.data
        ? await state.client.from(table).update({ value: next, updated_at: stamp }).eq('key', key).eq('updated_at', res.data.updated_at).select('key')
        : await state.client.from(table).insert({ key: key, value: next, updated_at: stamp }).select('key');
      if (w.error) { if (!res.data) continue; return null; }
      if (w.data && w.data.length) return next;
    }
    return null;
  }

  // Aplica `change` al instante en pantalla y lo guarda con mutateKey; al
  // terminar, la pantalla queda con lo que realmente quedó guardado
  // (incluido lo que otra persona haya agregado mientras tanto).
  function applyChange(key, field, change, render) {
    state[field] = change(state[field]);
    render();
    mutateKey(TABLE, key, [], change).then(function (saved) {
      if (saved === null) {
        toast('No se pudo guardar — revisa tu conexión.', 'error');
        loadAllData(true);
        return;
      }
      state[field] = field === 'tasks'
        ? saved.map(function (t) { return Object.assign({}, t, { responsable: normalizeResponsableList(t.responsable) }); })
        : saved;
      render();
    });
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
    state.loadFailed = false;

    const [tasksValue, eventsValue, contactsValue, teamMembers, uiValue] = await Promise.all([
      readKey(TASKS_KEY, null),
      readKey(EVENTS_KEY, null),
      readKey(CONTACTS_KEY, null),
      loadTeamMembers(),
      readKey(UI_KEY, null)
    ]);
    state.teamMembers = teamMembers;
    state.ui = cloneUI(uiValue);
    applyUI();

    let tasks = Array.isArray(tasksValue) ? tasksValue : [];
    let events = Array.isArray(eventsValue) ? eventsValue : [];

    // Primera vez que se abre este tablero: siembra un evento de ejemplo
    // este fin de semana para que el calendario no arranque vacío.
    if (tasksValue === null && eventsValue === null && !state.loadFailed) {
      events = [{
        id: uid(), title: 'Jornadas', event_date: upcomingWeekendDate(), start_time: '',
        location: '', notes: '', created_at: new Date().toISOString()
      }];
      await writeKey(EVENTS_KEY, events);
      await writeKey(TASKS_KEY, []);
    }

    state.tasks = tasks.map(function (t) { return Object.assign({}, t, { responsable: normalizeResponsableList(t.responsable) }); });
    state.events = events;
    state.contacts = Array.isArray(contactsValue) ? contactsValue : [];
    dom.loadingState.hidden = true;
    populateTasksResponsableFilter();
    renderKanban();
    renderContacts();
    if (state.view === 'calendar') renderCalendar();
    if (!background) setView(state.view);
  }

  function subscribeRealtime() {
    if (!state.client) return;
    state.client.channel('florangel-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function () { loadAllData(true); })
      .subscribe();
  }

  // ---------- Modo edición ----------

  function applyUI() {
    const ui = state.ui;
    dom.pageTitle.textContent = ui.pageTitle;
    dom.pageSubtitle.textContent = ui.pageSubtitle;
    dom.tasksTitle.textContent = ui.tasksTitle;
    dom.calendarTitle.textContent = ui.calendarTitle;
    dom.contactsViewTitle.textContent = ui.contactsTitle;
    reorderChildren(dom.tabNav, ui.tabOrder, function (id) { return dom.tabNav.querySelector('[data-view="' + id + '"]'); });
    reorderChildren(dom.tasksBlocks, ui.boardOrder, function (id) { return document.getElementById('tasks-block-' + id); });
  }

  function reorderChildren(parent, order, findChild) {
    order.forEach(function (id) {
      const child = findChild(id);
      if (child) parent.appendChild(child);
    });
  }

  function openCustomize() {
    state.customizeForm = cloneUI(state.ui);
    dom.customPageTitle.value = state.customizeForm.pageTitle;
    dom.customSubtitle.value = state.customizeForm.pageSubtitle;
    dom.customTasksTitle.value = state.customizeForm.tasksTitle;
    dom.customCalendarTitle.value = state.customizeForm.calendarTitle;
    dom.customContactsTitle.value = state.customizeForm.contactsTitle;
    renderCustomizeLists();
    dom.customizeDialog.showModal();
  }

  function closeCustomize() { dom.customizeDialog.close(); }

  function resetCustomize() {
    state.customizeForm = cloneUI(DEFAULT_UI);
    dom.customPageTitle.value = state.customizeForm.pageTitle;
    dom.customSubtitle.value = state.customizeForm.pageSubtitle;
    dom.customTasksTitle.value = state.customizeForm.tasksTitle;
    dom.customCalendarTitle.value = state.customizeForm.calendarTitle;
    dom.customContactsTitle.value = state.customizeForm.contactsTitle;
    renderCustomizeLists();
  }

  function renderCustomizeLists() {
    renderReorderList(dom.customizeTabsList, state.customizeForm.tabOrder, NAV_ITEMS, moveTabOrder);
    renderReorderList(dom.customizeSectionsList, state.customizeForm.boardOrder, BOARD_ITEMS, moveSectionOrder);
  }

  function renderReorderList(node, order, items, mover) {
    renderMarkup(node, order.map(function (id, index) {
      const item = items[id];
      return '<div class="reorder-row">' +
        '<span>' + item.emoji + '</span><span class="reorder-row-label">' + safe(item.label) + '</span>' +
        '<button type="button" class="icon-button icon-button-sm" data-reorder-id="' + id + '" data-reorder-dir="-1" aria-label="Mover hacia arriba"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" class="icon-button icon-button-sm" data-reorder-id="' + id + '" data-reorder-dir="1" aria-label="Mover hacia abajo"' + (index === order.length - 1 ? ' disabled' : '') + '>↓</button>' +
      '</div>';
    }).join(''));
    node.querySelectorAll('[data-reorder-id]').forEach(function (button) {
      button.addEventListener('click', function () { mover(button.dataset.reorderId, Number(button.dataset.reorderDir)); });
    });
  }

  function moveInArray(list, id, delta) {
    const index = list.indexOf(id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= list.length) return list;
    const next = list.slice();
    next.splice(index, 1);
    next.splice(target, 0, id);
    return next;
  }

  function moveTabOrder(id, delta) {
    state.customizeForm.tabOrder = moveInArray(state.customizeForm.tabOrder, id, delta);
    renderCustomizeLists();
  }

  function moveSectionOrder(id, delta) {
    state.customizeForm.boardOrder = moveInArray(state.customizeForm.boardOrder, id, delta);
    renderCustomizeLists();
  }

  async function onCustomizeSubmit(e) {
    e.preventDefault();
    const next = {
      pageTitle: dom.customPageTitle.value.trim() || DEFAULT_UI.pageTitle,
      pageSubtitle: dom.customSubtitle.value.trim() || DEFAULT_UI.pageSubtitle,
      tasksTitle: dom.customTasksTitle.value.trim() || DEFAULT_UI.tasksTitle,
      calendarTitle: dom.customCalendarTitle.value.trim() || DEFAULT_UI.calendarTitle,
      contactsTitle: dom.customContactsTitle.value.trim() || DEFAULT_UI.contactsTitle,
      tabOrder: state.customizeForm.tabOrder,
      boardOrder: state.customizeForm.boardOrder
    };
    if (!state.client) { toast('No se pudo guardar el diseño — revisa tu conexión.', 'error'); return; }
    const res = await state.client.from(TABLE).upsert({ key: UI_KEY, value: next, updated_at: new Date().toISOString() });
    if (res.error) { toast('No se pudo guardar el diseño — revisa tu conexión.', 'error'); return; }
    state.ui = cloneUI(next);
    applyUI();
    closeCustomize();
    toast('Diseño guardado.', 'success');
  }

  // ---------- Tareas (kanban) ----------

  function renderKpis() {
    const responsableFilter = state.taskResponsableFilter || null;
    const scoped = state.tasks.filter(function (t) { return !responsableFilter || t.responsable.indexOf(responsableFilter) > -1; });
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
      const items = state.tasks.filter(function (t) { return t.stage === stage.key && (!responsableFilter || t.responsable.indexOf(responsableFilter) > -1); });
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
    const responsable = responsableNamesLabel(task.responsable);
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

  function normalizeResponsableList(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
  }

  function responsableNamesLabel(value) {
    return normalizeResponsableList(value).map(responsableName).filter(Boolean).join(', ');
  }

  function populateResponsableChecklist(currentIds) {
    const selected = normalizeResponsableList(currentIds);
    const rows = state.teamMembers.map(function (m) {
      const checked = selected.indexOf(m.id) > -1 ? ' checked' : '';
      return '<label class="responsable-check-row"><input type="checkbox" value="' + safe(m.id) + '"' + checked + '> 👤 ' + safe(m.name) + '</label>';
    });
    rows.push('<label class="responsable-check-row"><input type="checkbox" id="responsable-check-new" value="' + NEW_MEMBER_VALUE + '"> ➕ Otro (agregar miembro nuevo)</label>');
    renderMarkup(dom.responsableChecklist, rows.join(''));
    dom.newResponsableField.hidden = true;
  }

  function onResponsableChecklistChange(e) {
    if (!e.target || e.target.id !== 'responsable-check-new') return;
    dom.newResponsableField.hidden = !e.target.checked;
    if (e.target.checked) dom.taskForm.elements.new_responsable_name.focus();
  }

  function getSelectedResponsableIds() {
    return Array.from(dom.responsableChecklist.querySelectorAll('input[type="checkbox"]:checked'))
      .map(function (cb) { return cb.value; })
      .filter(function (v) { return v && v !== NEW_MEMBER_VALUE; });
  }

  function isNewResponsableChecked() {
    const cb = document.getElementById('responsable-check-new');
    return !!(cb && cb.checked);
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
    const next = await mutateKey(SHARED_TABLE, TEAM_MEMBERS_KEY, [], function (list) { return list.concat(entry); });
    if (next === null) return null;
    state.teamMembers = next;
    return entry;
  }

  function moveTask(id, stage) {
    const task = findById(state.tasks, id);
    if (!task || task.stage === stage) return;
    applyChange(TASKS_KEY, 'tasks', function (list) {
      return list.map(function (t) { return t.id === id ? Object.assign({}, t, { stage: stage }) : t; });
    }, renderKanban);
  }

  function openTaskDialog(task) {
    state.taskEditor = task ? task.id : null;
    dom.taskDialogTitle.textContent = task ? 'Editar tarea' : 'Agregar tarea';
    dom.taskDelete.hidden = !task;
    hideError(dom.taskError);
    dom.taskForm.elements.title.value = task ? task.title : '';
    populateResponsableChecklist(task ? task.responsable : []);
    dom.taskDueDate.value = task ? (task.dueDate || '') : '';
    dom.taskDetail.value = task ? taskDetailText(task) : '';
    dom.taskNextAction.value = task ? (task.nextAction || '') : '';
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
    let responsableIds = getSelectedResponsableIds();
    if (isNewResponsableChecked()) {
      const newName = dom.taskForm.elements.new_responsable_name.value.trim();
      if (!newName) { showError(dom.taskError, 'Escribe el nombre del nuevo responsable.'); return; }
      const created = await createTeamMember(newName);
      if (!created) { showError(dom.taskError, 'No se pudo guardar el responsable — revisa tu conexión.'); return; }
      responsableIds = responsableIds.concat([created.id]);
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
      responsable: responsableIds,
      dueDate: dom.taskDueDate.value,
      nextAction: dom.taskNextAction.value.trim(),
      created_at: new Date().toISOString()
    };
    const editId = state.taskEditor;
    applyChange(TASKS_KEY, 'tasks', function (list) {
      if (!editId) return list.concat(payload);
      return list.map(function (t) { return t.id === editId ? Object.assign({}, t, payload, { created_at: t.created_at }) : t; });
    }, renderKanban);
    closeTaskDialog();
    toast('Tarea guardada.', 'success');
  }

  function deleteEditingTask() {
    if (!state.taskEditor) return;
    const delId = state.taskEditor;
    applyChange(TASKS_KEY, 'tasks', function (list) { return list.filter(function (t) { return t.id !== delId; }); }, renderKanban);
    closeTaskDialog();
    toast('Tarea eliminada.', 'success');
  }

  // ---------- Calendario ----------

  function mondayOf(iso) {
    const date = new Date(iso + 'T00:00:00Z');
    const offset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - offset);
    return date.toISOString().slice(0, 10);
  }

  function setCalendarViewMode(mode) {
    if (['week', 'month', 'year', 'agenda'].indexOf(mode) === -1) return;
    state.calendarViewMode = mode;
    dom.calendarViewSwitcher.querySelectorAll('.calendar-view-btn').forEach(function (btn) {
      if (btn.dataset.calendarView === mode) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    renderCalendar();
  }

  function changePeriod(delta) {
    if (state.calendarViewMode === 'week') {
      const date = new Date(state.calendarWeekStart + 'T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + delta * 7);
      state.calendarWeekStart = date.toISOString().slice(0, 10);
    } else if (state.calendarViewMode === 'year') {
      state.calendarYear += delta;
    } else {
      const parts = state.calendarMonth.split('-').map(Number);
      const date = new Date(Date.UTC(parts[0], parts[1] - 1 + delta, 1));
      state.calendarMonth = date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
    }
    renderCalendar();
  }

  function eventsOnDay(iso) {
    return state.events.filter(function (item) { return item.event_date === iso; })
      .sort(function (a, b) { return (a.start_time || '99:99').localeCompare(b.start_time || '99:99'); });
  }

  function renderCalendar() {
    const mode = state.calendarViewMode;
    dom.calendarMonthView.hidden = mode !== 'month';
    dom.calendarWeekView.hidden = mode !== 'week';
    dom.calendarYearView.hidden = mode !== 'year';
    dom.calendarAgendaView.hidden = mode !== 'agenda';
    dom.calendarPeriodNav.hidden = mode === 'agenda';
    if (mode === 'week') renderWeekView();
    else if (mode === 'year') renderYearView();
    else if (mode === 'agenda') renderAgendaView();
    else renderMonthView();
  }

  function renderMonthView() {
    const parts = state.calendarMonth.split('-').map(Number);
    const year = parts[0];
    const monthIndex = parts[1] - 1;
    dom.calendarPeriodLabel.textContent = MONTHS[monthIndex] + ' ' + year;
    const first = new Date(Date.UTC(year, monthIndex, 1));
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    const today = new Date().toISOString().slice(0, 10);
    let markup = WEEKDAYS.map(function (day) { return '<div class="calendar-weekday">' + day + '</div>'; }).join('');
    for (let blank = 0; blank < mondayOffset; blank += 1) markup += '<div class="calendar-day is-blank" aria-hidden="true"></div>';
    for (let day = 1; day <= lastDay; day += 1) {
      const iso = year + '-' + String(monthIndex + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const dayEvents = eventsOnDay(iso);
      markup += '<div class="calendar-day' + (iso === today ? ' is-today' : '') + '">' +
        '<span class="calendar-number">' + day + '</span>' +
        dayEvents.map(function (item) {
          return '<button class="calendar-event" type="button" data-action="edit-event" data-id="' + safe(item.id) + '" onclick="window.florangelAction(event)">' + safe(formatTime(item.start_time) + ' · ' + item.title) + '</button>';
        }).join('') + '</div>';
    }
    renderMarkup(dom.calendarGrid, markup);
  }

  function formatShortDate(date) {
    return date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()].slice(0, 3) + '.';
  }

  function renderWeekView() {
    const startDate = new Date(state.calendarWeekStart + 'T00:00:00Z');
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    dom.calendarPeriodLabel.textContent = formatShortDate(startDate) + ' – ' + formatShortDate(endDate) + ' ' + endDate.getUTCFullYear();
    const today = new Date().toISOString().slice(0, 10);
    let markup = '';
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startDate);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dayEvents = eventsOnDay(iso);
      markup += '<div class="calendar-week-day' + (iso === today ? ' is-today' : '') + '">' +
        '<div class="calendar-week-day-head">' + WEEKDAYS[i] + '</div>' +
        '<div class="calendar-week-day-number">' + d.getUTCDate() + '</div>' +
        '<div class="calendar-week-events">' +
          (dayEvents.length ? dayEvents.map(function (item) {
            return '<button class="calendar-event" type="button" data-action="edit-event" data-id="' + safe(item.id) + '" onclick="window.florangelAction(event)">' + safe(formatTime(item.start_time) + ' · ' + item.title) + '</button>';
          }).join('') : '<span style="font-size:11px;color:var(--color-neutral-500)">Sin eventos</span>') +
        '</div>' +
      '</div>';
    }
    renderMarkup(dom.calendarWeekGrid, markup);
  }

  function renderYearView() {
    const year = state.calendarYear;
    dom.calendarPeriodLabel.textContent = String(year);
    const today = new Date().toISOString().slice(0, 10);
    let markup = '';
    for (let m = 0; m < 12; m += 1) {
      const first = new Date(Date.UTC(year, m, 1));
      const lastDay = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      const mondayOffset = (first.getUTCDay() + 6) % 7;
      let days = WEEKDAYS.map(function (w) { return '<div class="calendar-year-weekday">' + w[0] + '</div>'; }).join('');
      for (let blank = 0; blank < mondayOffset; blank += 1) days += '<div class="calendar-year-day is-blank"></div>';
      for (let day = 1; day <= lastDay; day += 1) {
        const iso = year + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        const dayEvents = eventsOnDay(iso);
        days += '<button type="button" class="calendar-year-day' + (iso === today ? ' is-today' : '') + '" data-year-day="' + iso + '" onclick="window.florangelAction(event)">' +
          '<span>' + day + '</span>' +
          '<span class="calendar-year-day-dots">' + (dayEvents.length ? '<span class="calendar-year-day-dot"></span>' : '') + '</span>' +
        '</button>';
      }
      markup += '<div class="calendar-year-month"><h4 class="calendar-year-month-label">' + MONTHS[m] + '</h4><div class="calendar-year-days">' + days + '</div></div>';
    }
    renderMarkup(dom.calendarYearGrid, markup);
  }

  function renderAgendaView() {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = state.events.filter(function (e) { return e.event_date >= today; })
      .sort(function (a, b) {
        if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
        return (a.start_time || '99:99').localeCompare(b.start_time || '99:99');
      });
    if (!upcoming.length) {
      renderMarkup(dom.calendarAgendaList, '<div class="empty-state"><strong>Sin próximos eventos</strong><span>No hay eventos programados a partir de hoy.</span></div>');
      return;
    }
    const groups = [];
    upcoming.forEach(function (e) {
      let group = groups[groups.length - 1];
      if (!group || group.date !== e.event_date) { group = { date: e.event_date, items: [] }; groups.push(group); }
      group.items.push(e);
    });
    renderMarkup(dom.calendarAgendaList, groups.map(function (g) {
      return '<div>' +
        '<h4 class="calendar-agenda-group-label">' + safe(formatDate(g.date)) + '</h4>' +
        '<div class="agenda-list">' + g.items.map(function (e) {
          const timeLabel = e.start_time ? formatTime(e.start_time) : 'Hora por confirmar';
          return '<button type="button" class="agenda-row" data-action="edit-event" data-id="' + safe(e.id) + '" onclick="window.florangelAction(event)" style="width:100%;text-align:left;font:inherit;cursor:pointer">' +
            '<div>' +
              '<p class="agenda-row-title">' + safe(e.title) + '</p>' +
              '<p class="agenda-row-meta">◷ ' + safe(timeLabel) + (e.location ? ' · ⌖ ' + safe(e.location) : '') + '</p>' +
            '</div>' +
          '</button>';
        }).join('') + '</div>' +
      '</div>';
    }).join(''));
  }

  function populateSpecialtiesList(checkedList) {
    const canonicalChecked = [];
    let customChecked = [];
    if (checkedList) {
      checkedList.forEach(function (s) {
        if (MEDICAL_SPECIALTIES.indexOf(s) > -1) canonicalChecked.push(s); else customChecked.push(s);
      });
    } else {
      Array.from(dom.eventSpecialtiesList.querySelectorAll('.event-specialty-checkbox:checked')).forEach(function (cb) {
        if (cb.value !== OTHER_SPECIALTY_VALUE) canonicalChecked.push(cb.value);
      });
    }
    const items = MEDICAL_SPECIALTIES.map(function (label) {
      const checked = canonicalChecked.indexOf(label) > -1 ? ' checked' : '';
      return '<label class="checkbox-chip"><input type="checkbox" class="event-specialty-checkbox" value="' + safe(label) + '"' + checked + '>' + safe(label) + '</label>';
    });
    const hasCustom = checkedList ? customChecked.length > 0 : (document.getElementById('field-event-specialty-other') && document.getElementById('field-event-specialty-other').checked);
    items.push('<label class="checkbox-chip"><input type="checkbox" id="field-event-specialty-other" class="event-specialty-checkbox" value="' + OTHER_SPECIALTY_VALUE + '"' + (hasCustom ? ' checked' : '') + ' onchange="window.florangelAction(event)">Otros</label>');
    renderMarkup(dom.eventSpecialtiesList, items.join(''));
    dom.eventCustomSpecialtyField.hidden = !hasCustom;
    if (checkedList) dom.eventForm.elements.custom_specialties.value = customChecked.join(', ');
  }

  function onJornadaTypeChange() {
    const isMedica = dom.eventJornadaTypeSelect.value === 'medica';
    dom.eventSpecialtiesField.hidden = !isMedica;
    if (isMedica) populateSpecialtiesList();
  }

  function onSpecialtyOtherChange() {
    const other = document.getElementById('field-event-specialty-other');
    dom.eventCustomSpecialtyField.hidden = !(other && other.checked);
  }

  function readSpecialties() {
    const canonical = Array.from(dom.eventSpecialtiesList.querySelectorAll('.event-specialty-checkbox:checked'))
      .map(function (cb) { return cb.value; })
      .filter(function (v) { return v !== OTHER_SPECIALTY_VALUE; });
    const customRaw = dom.eventForm.elements.custom_specialties.value.trim();
    const custom = customRaw ? customRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
    return canonical.concat(custom);
  }

  function populateParticipantsList(checkedKeys) {
    const previouslyChecked = checkedKeys || Array.from(dom.eventParticipantsList.querySelectorAll('input:checked')).map(function (cb) { return cb.value; });
    const items = state.teamMembers.map(function (m) {
      const key = 'team:' + m.id;
      const checked = previouslyChecked.indexOf(key) > -1 ? ' checked' : '';
      return '<label class="checkbox-chip"><input type="checkbox" class="event-participant-checkbox" value="' + safe(key) + '"' + checked + '>👤 ' + safe(m.name) + '</label>';
    });
    renderMarkup(dom.eventParticipantsList, items.length ? items.join('') : '<span style="font-size:12px;color:var(--color-neutral-600)">No hay participantes disponibles todavía.</span>');
  }

  function readParticipants() {
    return Array.from(dom.eventParticipantsList.querySelectorAll('.event-participant-checkbox:checked')).map(function (cb) { return cb.value; });
  }

  function openEventDialog(evt) {
    state.eventEditor = evt ? evt.id : null;
    dom.eventDialogTitle.textContent = evt ? 'Editar evento' : 'Agregar evento';
    dom.eventDelete.hidden = !evt;
    hideError(dom.eventError);
    dom.eventForm.elements.title.value = evt ? evt.title : '';
    dom.eventForm.elements.event_date.value = evt ? evt.event_date : (state.calendarMonth + '-01');
    dom.eventForm.elements.start_time.value = evt ? timeInput(evt.start_time) : '';
    dom.eventForm.elements.end_time.value = evt ? timeInput(evt.end_time) : '';
    dom.eventForm.elements.location.value = evt ? (evt.location || '') : '';
    dom.eventForm.elements.status.value = evt ? (evt.status || 'planned') : 'planned';
    dom.eventForm.elements.notes.value = evt ? (evt.notes || '') : '';
    dom.eventForm.elements.participates_ingenia.value = evt && evt.participatesIngenia === true ? 'si' : 'no';
    dom.eventForm.elements.jornada_type.value = evt ? (evt.jornadaType || '') : '';
    const isMedica = evt && evt.jornadaType === 'medica';
    dom.eventSpecialtiesField.hidden = !isMedica;
    populateSpecialtiesList(isMedica ? (evt.specialties || []) : []);
    populateParticipantsList(evt ? (evt.participants || []) : []);
    dom.eventDialog.showModal();
    dom.eventForm.elements.title.focus();
  }

  function closeEventDialog() { dom.eventDialog.close(); state.eventEditor = null; }

  function onEventSubmit(e) {
    e.preventDefault();
    const title = dom.eventForm.elements.title.value.trim();
    const eventDate = dom.eventForm.elements.event_date.value;
    if (!title || !eventDate) { showError(dom.eventError, 'Nombre y fecha son obligatorios.'); return; }
    const jornadaType = dom.eventJornadaTypeSelect.value;
    const payload = {
      id: state.eventEditor || uid(),
      title: title,
      event_date: eventDate,
      start_time: dom.eventForm.elements.start_time.value,
      end_time: dom.eventForm.elements.end_time.value,
      location: dom.eventForm.elements.location.value.trim(),
      status: dom.eventForm.elements.status.value,
      notes: dom.eventForm.elements.notes.value.trim(),
      participatesIngenia: dom.eventForm.elements.participates_ingenia.value === 'si',
      jornadaType: jornadaType,
      specialties: jornadaType === 'medica' ? readSpecialties() : [],
      participants: readParticipants(),
      created_at: new Date().toISOString()
    };
    const editId = state.eventEditor;
    applyChange(EVENTS_KEY, 'events', function (list) {
      if (!editId) return list.concat(payload);
      return list.map(function (ev) { return ev.id === editId ? Object.assign({}, ev, payload, { created_at: ev.created_at }) : ev; });
    }, renderCalendar);
    closeEventDialog();
    toast('Evento guardado.', 'success');
  }

  function deleteEditingEvent() {
    if (!state.eventEditor) return;
    const delId = state.eventEditor;
    applyChange(EVENTS_KEY, 'events', function (list) { return list.filter(function (ev) { return ev.id !== delId; }); }, renderCalendar);
    closeEventDialog();
    toast('Evento eliminado.', 'success');
  }

  // ---------- Contactos ----------

  function normalizeText(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  function handleContactSearch(e) {
    state.query = e.target.value;
    renderContacts();
  }

  function clearContactSearch() {
    state.query = '';
    dom.contactSearch.value = '';
    renderContacts();
    dom.contactSearch.focus();
  }

  // Franja de contactos: total y cuántos hay en cada estado (sin importar
  // el filtro activo). Clic en un estado = filtrar por él; otro clic o clic
  // en el total = quitar el filtro.
  function renderContactsKpiStrip() {
    const strip = document.getElementById('contacts-kpi-strip');
    if (!strip) return;
    const counts = {};
    state.contacts.forEach(function (c) { const k = c.status || 'pending'; counts[k] = (counts[k] || 0) + 1; });
    const active = state.contactStatusFilter || '';
    renderMarkup(strip,
      '<button type="button" class="kpi-strip-chip" data-kpi-status="" aria-pressed="' + (active ? 'false' : 'true') + '">👥 <strong>' + state.contacts.length + '</strong> ' + (state.contacts.length === 1 ? 'contacto' : 'contactos') + ' en total</button>' +
      '<span class="kpi-strip-divider" aria-hidden="true"></span>' +
      CONTACT_STATUSES.map(function (s) {
        return '<button type="button" class="kpi-strip-chip" data-kpi-status="' + safe(s.key) + '" aria-pressed="' + (active === s.key ? 'true' : 'false') + '" title="Ver solo: ' + safe(s.label) + '">' + s.emoji + ' ' + safe(s.label) + ' <strong>' + (counts[s.key] || 0) + '</strong></button>';
      }).join(''));
    strip.onclick = function (e) {
      const btn = e.target.closest('[data-kpi-status]');
      if (!btn) return;
      const k = btn.dataset.kpiStatus;
      state.contactStatusFilter = (k && state.contactStatusFilter !== k) ? k : '';
      if (dom.contactStatusFilter) dom.contactStatusFilter.value = state.contactStatusFilter;
      renderContacts();
    };
  }

  function renderContacts() {
    renderContactsKpiStrip();
    const query = normalizeText(state.query);
    const contacts = state.contacts.filter(function (c) {
      if (state.contactStatusFilter && (c.status || 'pending') !== state.contactStatusFilter) return false;
      return !query || normalizeText([c.name, c.role].join(' ')).indexOf(query) > -1;
    });
    dom.contactResultCount.textContent = contacts.length + ' de ' + state.contacts.length + ' contactos';
    dom.contactSearchClear.hidden = !state.query;
    if (!contacts.length) {
      renderMarkup(dom.contactsList, '<div class="empty-state"><strong>' + safe(state.contacts.length ? '🔎 Sin coincidencias' : '🤝 Directorio vacío') + '</strong><span>' + safe(state.contacts.length ? 'Prueba otra búsqueda o limpia el filtro.' : 'Agrega los contactos de esta organización.') + '</span></div>');
      return;
    }
    renderMarkup(dom.contactsList, contacts.map(function (c) {
      const phone = c.phone ? safe(c.phone) : 'Por confirmar';
      const email = c.email ? safe(c.email) : 'Por confirmar';
      const status = contactStatusInfo(c);
      return '<article class="contact-card contact-card-compact" data-action="view-contact" data-id="' + safe(c.id) + '" tabindex="0" role="button" aria-label="Ver detalle de ' + safe(c.name) + '" onclick="window.florangelAction(event)">' +
        '<div class="contact-card-header"><div class="contact-avatar" aria-hidden="true">' + safe(initials(c.name)) + '</div><div><h3>' + safe(c.name) + '</h3><span class="contact-status-pill status-' + status.key + '">' + status.emoji + ' ' + safe(status.label) + '</span></div></div>' +
        '<div class="contact-mini-row">📱 ' + phone + '</div>' +
        '<div class="contact-mini-row">✉ ' + email + '</div>' +
      '</article>';
    }).join(''));
  }

  function openContactDialog(existing) {
    hideError(dom.contactError);
    dom.contactForm.reset();
    state.contactEditor = existing ? existing.id : null;
    dom.contactDialogTitle.textContent = existing ? 'Editar contacto' : 'Agregar contacto';
    dom.contactDelete.hidden = !existing;
    const parsedPhone = splitPhone(existing ? existing.phone : '');
    populatePhoneCodeSelect(dom.contactPhoneCode, parsedPhone.code);
    dom.contactForm.elements.phone_number.value = parsedPhone.number;
    populateContactStatusSelect(dom.contactStatusSelect, existing ? existing.status : '');
    if (existing) {
      dom.contactForm.elements.name.value = existing.name || '';
      dom.contactForm.elements.role.value = existing.role || '';
      dom.contactForm.elements.email.value = existing.email || '';
      dom.contactForm.elements.notes.value = existing.notes || '';
    }
    dom.contactDialog.showModal();
    dom.contactForm.elements.name.focus();
  }

  function closeContactDialog() { dom.contactDialog.close(); state.contactEditor = null; }

  function onContactSubmit(e) {
    e.preventDefault();
    hideError(dom.contactError);
    const name = dom.contactForm.elements.name.value.trim();
    if (!name) { showError(dom.contactError, 'El nombre es obligatorio.'); return; }
    const payload = {
      id: state.contactEditor || uid(),
      name: name,
      role: dom.contactForm.elements.role.value.trim(),
      phone: combinePhone(dom.contactPhoneCode.value, dom.contactForm.elements.phone_number.value),
      email: dom.contactForm.elements.email.value.trim(),
      status: dom.contactStatusSelect.value || 'pending',
      notes: dom.contactForm.elements.notes.value.trim(),
      created_at: new Date().toISOString()
    };
    const editId = state.contactEditor;
    applyChange(CONTACTS_KEY, 'contacts', function (list) {
      if (!editId) return list.concat(payload);
      return list.map(function (c) { return c.id === editId ? Object.assign({}, c, payload, { created_at: c.created_at }) : c; });
    }, renderContacts);
    closeContactDialog();
    toast('Contacto guardado.', 'success');
  }

  function deleteContact(contact) {
    if (!contact) return;
    applyChange(CONTACTS_KEY, 'contacts', function (list) { return list.filter(function (c) { return c.id !== contact.id; }); }, renderContacts);
    toast('Contacto eliminado.', 'success');
  }

  function deleteEditingContact() {
    const contact = findById(state.contacts, state.contactEditor);
    deleteContact(contact);
    closeContactDialog();
  }

  function openContactDetail(c) {
    if (!c) return;
    state.contactViewer = c.id;
    const status = contactStatusInfo(c);
    dom.contactDetailTitle.textContent = c.name || 'Contacto';
    renderMarkup(dom.contactDetailBody,
      '<div class="contact-row"><span class="contact-row-label">Rol</span><span class="contact-row-value">' + safe(c.role || 'Contacto') + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">◉ Teléfono</span><span class="contact-row-value">' + (c.phone ? '<a href="tel:' + safe(c.phone) + '">' + safe(c.phone) + '</a>' : 'Por confirmar') + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">✉ Correo</span><span class="contact-row-value">' + (c.email ? '<a href="mailto:' + safe(c.email) + '">' + safe(c.email) + '</a>' : 'Por confirmar') + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">Estado</span><span class="contact-row-value">' + status.emoji + ' ' + safe(status.label) + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">↳ Notas</span><span class="contact-row-value">' + (c.notes ? safe(c.notes) : 'Sin notas.') + '</span></div>'
    );
    dom.contactDetailDialog.showModal();
  }

  function closeContactDetail() { dom.contactDetailDialog.close(); state.contactViewer = null; }

  function editFromContactDetail() {
    const c = findById(state.contacts, state.contactViewer);
    closeContactDetail();
    openContactDialog(c);
  }

  function deleteFromContactDetail() {
    const c = findById(state.contacts, state.contactViewer);
    closeContactDetail();
    deleteContact(c);
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
