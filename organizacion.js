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

  const ORG_ID = new URLSearchParams(window.location.search).get('org') || '';
  const EVENTS_KEY = 'ingenia-custom-' + ORG_ID + '-events-v1';
  const CONTACTS_KEY = 'ingenia-custom-' + ORG_ID + '-contacts-v1';
  const HIERARCHY_KEY = 'ingenia-custom-' + ORG_ID + '-hierarchy-v1';
  const UI_KEY = 'ingenia-custom-' + ORG_ID + '-ui-v1';

  // Modo edición: textos y orden personalizables, igual que en el tablero
  // UCV — pero sin los controles de tamaño de burbuja/título, porque este
  // sitio usa una hoja de estilos fija en vez de estilos calculados en JS.
  const DEFAULT_UI = {
    pageSubtitle: 'Calendario y tareas propias de esta organización.',
    calendarTitle: 'Calendario',
    contactsTitle: 'Contactos',
    hierarchyTitle: 'Jerarquía',
    tasksTitle: 'Tareas de Equipo',
    tabOrder: ['calendar', 'contacts', 'hierarchy', 'tasks'],
    boardOrder: ['kpis', 'board']
  };
  const NAV_ITEMS = {
    calendar: { emoji: '🗓️', label: 'Calendario' },
    contacts: { emoji: '🤝', label: 'Contactos' },
    hierarchy: { emoji: '🏛️', label: 'Jerarquía' },
    tasks: { emoji: '📋', label: 'Tareas de Equipo' }
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
    contacts: [],
    hierarchy: [],
    editingArea: null,
    query: '',
    contactStatusFilter: '',
    editingContact: null,
    viewingContact: null,
    allTasks: [],
    teamMembers: [],
    taskResponsableFilter: '',
    calendarMonth: new Date().toISOString().slice(0, 7),
    calendarViewMode: 'month',
    calendarWeekStart: mondayOf(new Date().toISOString().slice(0, 10)),
    calendarYear: new Date().getUTCFullYear(),
    selectedDay: new Date().toISOString().slice(0, 10),
    editingEvent: null,
    editingTask: null,
    dragTaskId: null,
    ui: cloneUI(DEFAULT_UI),
    customizeForm: cloneUI(DEFAULT_UI)
  };

  const dom = {};

  window.orgAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
    if (target.dataset.view) return setView(target.dataset.view);
    if (target.dataset.calendarView) return setCalendarViewMode(target.dataset.calendarView);
    const actionsById = {
      'retry-load': function () { loadAll(false); },
      'calendar-prev': function () { changePeriod(-1); },
      'calendar-next': function () { changePeriod(1); },
      'calendar-today': function () {
        const todayIso = new Date().toISOString().slice(0, 10);
        state.calendarMonth = todayIso.slice(0, 7);
        state.calendarWeekStart = mondayOf(todayIso);
        state.calendarYear = new Date().getUTCFullYear();
        state.selectedDay = todayIso;
        renderCalendar();
      },
      'new-event-btn': openEventDialog,
      'event-dialog-close': closeEventDialog,
      'event-dialog-cancel': closeEventDialog,
      'event-delete': deleteEditingEvent,
      'field-event-jornada-type': onJornadaTypeChange,
      'field-event-specialty-other': onSpecialtyOtherChange,
      'new-contact-btn': openContactDialog,
      'contact-dialog-close': closeContactDialog,
      'contact-dialog-cancel': closeContactDialog,
      'contact-delete': deleteEditingContact,
      'contact-search-clear': clearContactSearch,
      'contact-detail-close': closeContactDetail,
      'contact-detail-edit': editFromContactDetail,
      'contact-detail-delete': deleteFromContactDetail,
      'contact-detail-vcard': function () { downloadVCard(state.viewingContact); },
      'new-area-btn': function () { openAreaDialog(null, ''); },
      'area-dialog-close': closeAreaDialog,
      'area-dialog-cancel': closeAreaDialog,
      'area-delete': deleteEditingArea,
      'new-task-btn': openTaskDialog,
      'task-dialog-close': closeTaskDialog,
      'task-dialog-cancel': closeTaskDialog,
      'task-delete': deleteEditingTask,
      'tasks-filter-clear': function () {
        state.taskResponsableFilter = '';
        dom.tasksResponsableFilter.value = '';
        renderTasksBoard();
        renderKpis();
      },
      'customize-open': openCustomize,
      'customize-dialog-close': closeCustomize,
      'customize-dialog-cancel': closeCustomize,
      'customize-reset': resetCustomize
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
    if (target.dataset.yearDay) {
      state.selectedDay = target.dataset.yearDay;
      state.calendarMonth = target.dataset.yearDay.slice(0, 7);
      setCalendarViewMode('month');
    }
    if (target.dataset.eventId) openEventDialog(findById(state.events, target.dataset.eventId));
    if (target.dataset.taskId) openTaskDialog(findById(state.allTasks, target.dataset.taskId));
    if (target.dataset.contactId) openContactDialog(findById(state.contacts, target.dataset.contactId));
    if (target.dataset.contactDetailId) openContactDetail(findById(state.contacts, target.dataset.contactDetailId));
    if (target.dataset.action === 'move-task-status') moveTaskStatus(target.dataset.id, target.dataset.status);
    if (target.dataset.areaId) openAreaDialog(findById(state.hierarchy, target.dataset.areaId));
    if (target.dataset.action === 'add-child-area') openAreaDialog(null, target.dataset.parentId);
  };

  function findById(list, id) {
    return list.find(function (item) { return String(item.id) === String(id); }) || null;
  }

  function init() {
    cacheDom();
    if (!ORG_ID) return showNotFound();
    dom.eventForm.addEventListener('submit', onEventSubmit);
    dom.eventDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeEventDialog(); });
    dom.contactForm.addEventListener('submit', onContactSubmit);
    dom.contactDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeContactDialog(); });
    dom.contactSearch.addEventListener('input', handleContactSearch);
    populateContactStatusFilter(dom.contactStatusFilter);
    dom.contactStatusFilter.addEventListener('change', function () {
      state.contactStatusFilter = dom.contactStatusFilter.value;
      renderContacts();
    });
    dom.contactDetailDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeContactDetail(); });
    dom.areaForm.addEventListener('submit', onAreaSubmit);
    dom.areaDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeAreaDialog(); });
    dom.areaContactLink.addEventListener('change', onAreaContactLinkChange);
    dom.taskForm.addEventListener('submit', onTaskSubmit);
    dom.taskDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeTaskDialog(); });
    dom.customizeForm.addEventListener('submit', onCustomizeSubmit);
    dom.customizeDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeCustomize(); });
    dom.responsableChecklist.addEventListener('change', onResponsableChecklistChange);
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
    dom.agendaTitle = document.getElementById('agenda-title');
    dom.agendaList = document.getElementById('agenda-list');
    dom.eventDialog = document.getElementById('event-dialog');
    dom.eventDialogTitle = document.getElementById('event-dialog-title');
    dom.eventForm = document.getElementById('event-form');
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
    dom.hierarchyViewTitle = document.getElementById('hierarchy-view-title');
    dom.hierarchyTree = document.getElementById('hierarchy-tree');
    dom.areaDialog = document.getElementById('area-dialog');
    dom.areaDialogTitle = document.getElementById('area-dialog-title');
    dom.areaForm = document.getElementById('area-form');
    dom.areaError = document.getElementById('area-error');
    dom.areaParentSelect = document.getElementById('field-area-parent');
    dom.areaContactLink = document.getElementById('field-area-contact-link');
    dom.areaPhoneCode = document.getElementById('field-area-responsible-phone-code');
    dom.areaStatusSelect = document.getElementById('field-area-status');
    dom.areaSaveAsContact = document.getElementById('field-area-save-as-contact');
    dom.areaDelete = document.getElementById('area-delete');
    dom.customHierarchyTitle = document.getElementById('field-custom-hierarchy-title');
    dom.tasksKpiGrid = document.getElementById('tasks-kpi-grid');
    dom.tasksResponsableFilter = document.getElementById('tasks-responsable-filter');
    dom.tasksBoard = document.getElementById('tasks-board');
    dom.taskDialog = document.getElementById('task-dialog');
    dom.taskDialogTitle = document.getElementById('task-dialog-title');
    dom.taskForm = document.getElementById('task-form');
    dom.taskError = document.getElementById('task-error');
    dom.taskDelete = document.getElementById('task-delete');
    dom.responsableChecklist = document.getElementById('responsable-checklist');
    dom.newResponsableField = document.getElementById('new-responsable-field');
    dom.taskDueDate = document.getElementById('field-task-due-date');
    dom.taskStatusSelect = document.getElementById('field-task-status');
    dom.taskFollowupField = document.getElementById('task-followup-field');
    dom.taskFollowupSelect = document.getElementById('field-task-followup');
    dom.taskPrioritySelect = document.getElementById('field-task-priority');
    dom.taskDetail = document.getElementById('field-task-detail');
    dom.taskNextAction = document.getElementById('field-task-next-action');
    dom.toastRegion = document.getElementById('toast-region');
    dom.pageSubtitle = document.getElementById('page-subtitle');
    dom.calendarViewTitle = document.getElementById('calendar-view-title');
    dom.tasksViewTitle = document.getElementById('tasks-view-title');
    dom.tasksBlocks = document.getElementById('tasks-blocks');
    dom.customizeDialog = document.getElementById('customize-dialog');
    dom.customizeForm = document.getElementById('customize-form');
    dom.customSubtitle = document.getElementById('field-custom-subtitle');
    dom.customCalendarTitle = document.getElementById('field-custom-calendar-title');
    dom.customContactsTitle = document.getElementById('field-custom-contacts-title');
    dom.customTasksTitle = document.getElementById('field-custom-tasks-title');
    dom.customizeTabsList = document.getElementById('customize-tabs-list');
    dom.customizeSectionsList = document.getElementById('customize-sections-list');
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

    const [registryRes, tasksRes, eventsRes, contactsRes, hierarchyRes, membersRes, uiRes] = await Promise.all([
      state.client.from(TABLE).select('value').eq('key', CUSTOM_CALENDARS_KEY).maybeSingle(),
      state.client.from(TABLE).select('value').eq('key', TEAM_TASKS_KEY).maybeSingle(),
      state.client.from(TABLE).select('value').eq('key', EVENTS_KEY).maybeSingle(),
      state.client.from(TABLE).select('value').eq('key', CONTACTS_KEY).maybeSingle(),
      state.client.from(TABLE).select('value').eq('key', HIERARCHY_KEY).maybeSingle(),
      state.client.from(TABLE).select('value').eq('key', TEAM_MEMBERS_KEY).maybeSingle(),
      state.client.from(TABLE).select('value').eq('key', UI_KEY).maybeSingle()
    ]);

    if (registryRes.error && tasksRes.error && eventsRes.error) return showConnectionFailure();
    if (registryRes.error || tasksRes.error || eventsRes.error) dom.connectivityBanner.hidden = false;

    const registry = Array.isArray(registryRes.data && registryRes.data.value) ? registryRes.data.value : [];
    state.org = registry.find(function (o) { return o.id === ORG_ID; }) || null;
    if (!state.org) { dom.loadingState.hidden = true; return showNotFound(); }

    state.allTasks = (Array.isArray(tasksRes.data && tasksRes.data.value) ? tasksRes.data.value : []).map(function (t) {
      return Object.assign({}, t, { responsable: normalizeResponsableList(t.responsable) });
    });
    state.events = (Array.isArray(eventsRes.data && eventsRes.data.value) ? eventsRes.data.value : []).filter(function (e) { return !!e.event_date; });
    state.contacts = Array.isArray(contactsRes.data && contactsRes.data.value) ? contactsRes.data.value : [];
    state.hierarchy = Array.isArray(hierarchyRes.data && hierarchyRes.data.value) ? hierarchyRes.data.value : [];
    state.teamMembers = Array.isArray(membersRes.data && membersRes.data.value) ? membersRes.data.value : [];
    state.ui = cloneUI(uiRes.data && uiRes.data.value);

    applyOrgTheme();
    applyUI();
    dom.loadingState.hidden = true;
    dom.tabNav.hidden = false;
    populateTasksResponsableFilter();
    renderTasksBoard();
    renderKpis();
    renderContacts();
    renderHierarchy();
    setView(state.view);
    renderCalendar();
  }

  // Guarda un cambio sobre la versión ACTUAL de Supabase, no sobre la que
  // este tablero cargó al abrirse: lee, aplica `change` y escribe solo si
  // nadie guardó entre medio (si alguien lo hizo, reintenta sobre esa
  // versión). Si la lectura falla no escribe nada — así un fallo de conexión
  // al abrir nunca termina guardando una lista vacía encima de la real, y dos
  // computadoras (o dos tableros que comparten las tareas de equipo) no se
  // pisan. Devuelve el valor guardado, o null si no se pudo guardar.
  async function mutateBoardKey(key, fallback, change) {
    for (let intento = 0; intento < 4; intento++) {
      const res = await state.client.from(TABLE).select('value,updated_at').eq('key', key).maybeSingle();
      if (res.error) return null;
      const raw = res.data ? res.data.value : null;
      const current = (Array.isArray(fallback) ? Array.isArray(raw) : raw != null) ? raw : fallback;
      const next = change(JSON.parse(JSON.stringify(current)));
      const stamp = new Date().toISOString();
      const w = res.data
        ? await state.client.from(TABLE).update({ value: next, updated_at: stamp }).eq('key', key).eq('updated_at', res.data.updated_at).select('key')
        : await state.client.from(TABLE).insert({ key: key, value: next, updated_at: stamp }).select('key');
      if (w.error) { if (!res.data) continue; return null; }
      if (w.data && w.data.length) return next;
    }
    return null;
  }

  async function writeBoardKey(key, value) {
    const res = await state.client.from(TABLE).upsert({ key: key, value: value, updated_at: new Date().toISOString() });
    return !res.error;
  }

  // ---------- Modo edición ----------

  function applyUI() {
    const ui = state.ui;
    dom.pageSubtitle.textContent = ui.pageSubtitle;
    dom.calendarViewTitle.textContent = ui.calendarTitle;
    dom.contactsViewTitle.textContent = ui.contactsTitle;
    dom.hierarchyViewTitle.textContent = ui.hierarchyTitle;
    dom.tasksViewTitle.textContent = ui.tasksTitle;
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
    dom.customSubtitle.value = state.customizeForm.pageSubtitle;
    dom.customCalendarTitle.value = state.customizeForm.calendarTitle;
    dom.customContactsTitle.value = state.customizeForm.contactsTitle;
    dom.customHierarchyTitle.value = state.customizeForm.hierarchyTitle;
    dom.customTasksTitle.value = state.customizeForm.tasksTitle;
    renderCustomizeLists();
    dom.customizeDialog.showModal();
  }

  function closeCustomize() { dom.customizeDialog.close(); }

  function resetCustomize() {
    state.customizeForm = cloneUI(DEFAULT_UI);
    dom.customSubtitle.value = state.customizeForm.pageSubtitle;
    dom.customCalendarTitle.value = state.customizeForm.calendarTitle;
    dom.customContactsTitle.value = state.customizeForm.contactsTitle;
    dom.customHierarchyTitle.value = state.customizeForm.hierarchyTitle;
    dom.customTasksTitle.value = state.customizeForm.tasksTitle;
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
      pageSubtitle: dom.customSubtitle.value.trim() || DEFAULT_UI.pageSubtitle,
      calendarTitle: dom.customCalendarTitle.value.trim() || DEFAULT_UI.calendarTitle,
      contactsTitle: dom.customContactsTitle.value.trim() || DEFAULT_UI.contactsTitle,
      hierarchyTitle: dom.customHierarchyTitle.value.trim() || DEFAULT_UI.hierarchyTitle,
      tasksTitle: dom.customTasksTitle.value.trim() || DEFAULT_UI.tasksTitle,
      tabOrder: state.customizeForm.tabOrder,
      boardOrder: state.customizeForm.boardOrder
    };
    const ok = await writeBoardKey(UI_KEY, next);
    if (!ok) { toast('No se pudo guardar el diseño — revisa tu conexión.', 'error'); return; }
    state.ui = cloneUI(next);
    applyUI();
    closeCustomize();
    toast('Diseño guardado.', 'success');
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
    return state.events.filter(function (e) { return e.event_date === iso; })
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
          (dayEvents.length ? dayEvents.map(function (e) {
            const timeLabel = e.start_time ? formatTime(e.start_time) : '';
            return '<button type="button" class="calendar-event" data-event-id="' + safe(e.id) + '" onclick="window.orgAction(event)">' + (timeLabel ? safe(timeLabel) + ' · ' : '') + safe(e.title) + '</button>';
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
        days += '<button type="button" class="calendar-year-day' + (iso === today ? ' is-today' : '') + '" data-year-day="' + iso + '" onclick="window.orgAction(event)">' +
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
          return '<button type="button" class="agenda-row" data-event-id="' + safe(e.id) + '" onclick="window.orgAction(event)" style="width:100%;text-align:left;font:inherit;cursor:pointer">' +
            '<div>' +
              '<p class="agenda-row-title">' + safe(e.title) + '</p>' +
              '<p class="agenda-row-meta">◷ ' + safe(timeLabel) + (e.location ? ' · ⌖ ' + safe(e.location) : '') + '</p>' +
            '</div>' +
          '</button>';
        }).join('') + '</div>' +
      '</div>';
    }).join(''));
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
    items.push('<label class="checkbox-chip"><input type="checkbox" id="field-event-specialty-other" class="event-specialty-checkbox" value="' + OTHER_SPECIALTY_VALUE + '"' + (hasCustom ? ' checked' : '') + ' onchange="window.orgAction(event)">Otros</label>');
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
      dom.eventForm.elements.end_time.value = existing.end_time ? existing.end_time.slice(0, 5) : '';
      dom.eventForm.elements.location.value = existing.location || '';
      dom.eventForm.elements.status.value = existing.status || 'planned';
      dom.eventForm.elements.notes.value = existing.notes || '';
      dom.eventForm.elements.participates_ingenia.value = existing.participatesIngenia === true ? 'si' : 'no';
      dom.eventForm.elements.jornada_type.value = existing.jornadaType || '';
      dom.eventSpecialtiesField.hidden = existing.jornadaType !== 'medica';
      populateSpecialtiesList(existing.jornadaType === 'medica' ? (existing.specialties || []) : []);
      populateParticipantsList(existing.participants || []);
    } else {
      dom.eventForm.elements.event_date.value = state.selectedDay || new Date().toISOString().slice(0, 10);
      dom.eventForm.elements.participates_ingenia.value = 'no';
      dom.eventForm.elements.status.value = 'planned';
      dom.eventSpecialtiesField.hidden = true;
      populateSpecialtiesList([]);
      populateParticipantsList([]);
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
    if (!title || !eventDate) { showError(dom.eventError, 'Nombre del evento y fecha son obligatorios.'); return; }
    const existing = state.editingEvent;
    const jornadaType = dom.eventJornadaTypeSelect.value;
    const payload = Object.assign({}, existing || {}, {
      id: existing ? existing.id : uid(),
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
      created_at: existing ? existing.created_at : new Date().toISOString()
    });
    const next = await mutateBoardKey(EVENTS_KEY, [], function (list) {
      return existing
        ? list.map(function (ev) { return ev.id === existing.id ? payload : ev; })
        : list.concat(payload);
    });
    const ok = next !== null;
    if (!ok) { showError(dom.eventError, 'No se pudo guardar — revisa tu conexión.'); return; }
    state.events = next.filter(function (e) { return !!e.event_date; });
    closeEventDialog();
    state.selectedDay = eventDate;
    renderCalendar();
    toast('Evento guardado.', 'success');
  }

  async function deleteEditingEvent() {
    if (!state.editingEvent) return;
    const next = await mutateBoardKey(EVENTS_KEY, [], function (list) { return list.filter(function (ev) { return ev.id !== state.editingEvent.id; }); });
    const ok = next !== null;
    if (!ok) { showError(dom.eventError, 'No se pudo eliminar — revisa tu conexión.'); return; }
    state.events = next.filter(function (e) { return !!e.event_date; });
    closeEventDialog();
    renderCalendar();
    toast('Evento eliminado.', 'success');
  }

  // ---------- Contactos ----------

  function normalize(text) {
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

  // Tarjetas de contactos: total y cuántos hay en cada estado (sin importar
  // el filtro activo). Clic en un estado = filtrar por él; otro clic o clic
  // en el total = quitar el filtro.
  function renderContactsKpiStrip() {
    const strip = document.getElementById('contacts-kpi-strip');
    if (!strip) return;
    const counts = {};
    state.contacts.forEach(function (c) { const k = c.status || 'pending'; counts[k] = (counts[k] || 0) + 1; });
    const active = state.contactStatusFilter || '';
    const cards = [
      { key: '', icon: '👥', value: state.contacts.length, label: state.contacts.length === 1 ? 'Contacto identificado' : 'Contactos identificados', cls: 'kpi-primary' },
      { key: 'pending', icon: '○', value: counts.pending || 0, label: 'Pendientes', cls: 'kpi-neutral' },
      { key: 'contacted', icon: '📞', value: counts.contacted || 0, label: 'Contactados', cls: 'kpi-good' },
      { key: 'waiting_response', icon: '⏳', value: counts.waiting_response || 0, label: 'Esperando respuesta', cls: 'kpi-accent' }
    ];
    renderMarkup(strip, cards.map(function (c) {
      const pressed = c.key ? active === c.key : !active;
      return '<button type="button" class="kpi-card kpi-card-btn ' + c.cls + '" data-kpi-status="' + c.key + '" aria-pressed="' + pressed + '"' +
        (c.key ? ' title="Ver solo: ' + safe(c.label) + '"' : ' title="Ver todos"') + '>' +
        '<span class="kpi-icon" aria-hidden="true">' + c.icon + '</span><strong>' + c.value + '</strong><span class="kpi-label">' + safe(c.label) + '</span></button>';
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
    const query = normalize(state.query);
    const contacts = state.contacts.filter(function (c) {
      if (state.contactStatusFilter && (c.status || 'pending') !== state.contactStatusFilter) return false;
      return !query || normalize([c.name, c.role].join(' ')).indexOf(query) > -1;
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
      return '<article class="contact-card contact-card-compact" data-contact-detail-id="' + safe(c.id) + '" tabindex="0" role="button" aria-label="Ver detalle de ' + safe(c.name) + '" onclick="window.orgAction(event)">' +
        '<div class="contact-card-header"><div class="contact-avatar" aria-hidden="true">' + safe(initials(c.name)) + '</div><div><h3>' + safe(c.name) + '</h3><span class="contact-status-pill status-' + status.key + '">' + status.emoji + ' ' + safe(status.label) + '</span></div></div>' +
        '<div class="contact-mini-row">📱 ' + phone + '</div>' +
        '<div class="contact-mini-row">✉ ' + email + '</div>' +
      '</article>';
    }).join(''));
  }

  function openContactDialog(existing) {
    hideError(dom.contactError);
    dom.contactForm.reset();
    state.editingContact = existing || null;
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

  function closeContactDialog() { dom.contactDialog.close(); state.editingContact = null; }

  async function onContactSubmit(e) {
    e.preventDefault();
    hideError(dom.contactError);
    const name = dom.contactForm.elements.name.value.trim();
    if (!name) { showError(dom.contactError, 'El nombre es obligatorio.'); return; }
    const existing = state.editingContact;
    const payload = {
      id: existing ? existing.id : uid(),
      name: name,
      role: dom.contactForm.elements.role.value.trim(),
      phone: combinePhone(dom.contactPhoneCode.value, dom.contactForm.elements.phone_number.value),
      email: dom.contactForm.elements.email.value.trim(),
      status: dom.contactStatusSelect.value || 'pending',
      notes: dom.contactForm.elements.notes.value.trim(),
      created_at: existing ? existing.created_at : new Date().toISOString()
    };
    const next = await mutateBoardKey(CONTACTS_KEY, [], function (list) {
      return existing
        ? list.map(function (c) { return c.id === existing.id ? payload : c; })
        : list.concat(payload);
    });
    const ok = next !== null;
    if (!ok) { showError(dom.contactError, 'No se pudo guardar — revisa tu conexión.'); return; }
    state.contacts = next;
    renderContacts();
    closeContactDialog();
    toast('Contacto guardado.', 'success');
  }

  async function deleteContact(contact) {
    if (!contact) return;
    const next = await mutateBoardKey(CONTACTS_KEY, [], function (list) { return list.filter(function (c) { return c.id !== contact.id; }); });
    const ok = next !== null;
    if (!ok) { toast('No se pudo eliminar — revisa tu conexión.', 'error'); return; }
    state.contacts = next;
    renderContacts();
    toast('Contacto eliminado.', 'success');
  }

  async function deleteEditingContact() {
    const contact = state.editingContact;
    await deleteContact(contact);
    closeContactDialog();
  }

  // ---------- Jerarquía ----------

  function getDescendantIds(id) {
    const result = [];
    const stack = [id];
    while (stack.length) {
      const current = stack.pop();
      state.hierarchy.forEach(function (a) {
        if (a.parentId === current && result.indexOf(a.id) === -1) { result.push(a.id); stack.push(a.id); }
      });
    }
    return result;
  }

  function populateAreaParentSelect(excludeIds, current) {
    const options = state.hierarchy
      .filter(function (a) { return excludeIds.indexOf(a.id) === -1; })
      .map(function (a) { return '<option value="' + safe(a.id) + '">' + safe(a.name) + '</option>'; })
      .join('');
    renderMarkup(dom.areaParentSelect, '<option value="">— Nivel superior (sin área padre) —</option>' + options);
    dom.areaParentSelect.value = current || '';
  }

  function populateAreaContactLink() {
    const options = state.contacts.map(function (c) {
      return '<option value="' + safe(c.id) + '">' + safe(c.name) + (c.role ? ' · ' + safe(c.role) : '') + '</option>';
    }).join('');
    renderMarkup(dom.areaContactLink, '<option value="">— Selecciona un contacto —</option>' + options);
    dom.areaContactLink.value = '';
  }

  // Autocompleta el responsable con los datos de un contacto ya existente
  // — es una copia puntual, no un vínculo permanente: si ese contacto
  // cambia después, el área no se actualiza sola.
  function onAreaContactLinkChange() {
    const contact = findById(state.contacts, dom.areaContactLink.value);
    if (!contact) return;
    dom.areaForm.elements.responsible_name.value = contact.name || '';
    const parsedPhone = splitPhone(contact.phone || '');
    populatePhoneCodeSelect(dom.areaPhoneCode, parsedPhone.code);
    dom.areaForm.elements.responsible_phone_number.value = parsedPhone.number;
    dom.areaForm.elements.responsible_email.value = contact.email || '';
    if (!dom.areaForm.elements.responsible_role.value.trim()) dom.areaForm.elements.responsible_role.value = contact.role || '';
  }

  function openAreaDialog(existing, presetParentId) {
    hideError(dom.areaError);
    dom.areaForm.reset();
    state.editingArea = existing || null;
    dom.areaDialogTitle.textContent = existing ? 'Editar área' : 'Agregar área';
    dom.areaDelete.hidden = !existing;
    const excludeIds = existing ? [existing.id].concat(getDescendantIds(existing.id)) : [];
    populateAreaParentSelect(excludeIds, existing ? existing.parentId : (presetParentId || ''));
    populateAreaContactLink();
    const parsedPhone = splitPhone(existing ? existing.responsiblePhone : '');
    populatePhoneCodeSelect(dom.areaPhoneCode, parsedPhone.code);
    dom.areaForm.elements.responsible_phone_number.value = parsedPhone.number;
    populateContactStatusSelect(dom.areaStatusSelect, existing ? existing.status : '');
    if (existing) {
      dom.areaForm.elements.name.value = existing.name || '';
      dom.areaForm.elements.responsible_name.value = existing.responsibleName || '';
      dom.areaForm.elements.responsible_email.value = existing.responsibleEmail || '';
      dom.areaForm.elements.responsible_role.value = existing.responsibleRole || '';
      dom.areaForm.elements.responsible_function.value = existing.responsibleFunction || '';
      dom.areaForm.elements.responsible_account.value = existing.responsibleAccount || '';
      dom.areaForm.elements.responsible_affiliation.value = existing.responsibleAffiliation || '';
      dom.areaForm.elements.notes.value = existing.notes || '';
    }
    dom.areaDialog.showModal();
    dom.areaForm.elements.name.focus();
  }

  function closeAreaDialog() { dom.areaDialog.close(); state.editingArea = null; }

  async function onAreaSubmit(e) {
    e.preventDefault();
    hideError(dom.areaError);
    const name = dom.areaForm.elements.name.value.trim();
    if (!name) { showError(dom.areaError, 'El nombre del área es obligatorio.'); return; }
    const existing = state.editingArea;
    const payload = {
      id: existing ? existing.id : uid(),
      name: name,
      parentId: dom.areaParentSelect.value || '',
      responsibleName: dom.areaForm.elements.responsible_name.value.trim(),
      responsiblePhone: combinePhone(dom.areaPhoneCode.value, dom.areaForm.elements.responsible_phone_number.value),
      responsibleEmail: dom.areaForm.elements.responsible_email.value.trim(),
      responsibleRole: dom.areaForm.elements.responsible_role.value.trim(),
      responsibleFunction: dom.areaForm.elements.responsible_function.value.trim(),
      responsibleAccount: dom.areaForm.elements.responsible_account.value.trim(),
      responsibleAffiliation: dom.areaForm.elements.responsible_affiliation.value.trim(),
      status: dom.areaStatusSelect.value || 'pending',
      notes: dom.areaForm.elements.notes.value.trim(),
      created_at: existing ? existing.created_at : new Date().toISOString()
    };
    const next = await mutateBoardKey(HIERARCHY_KEY, [], function (list) {
      return existing
        ? list.map(function (a) { return a.id === existing.id ? payload : a; })
        : list.concat(payload);
    });
    const ok = next !== null;
    if (!ok) { showError(dom.areaError, 'No se pudo guardar — revisa tu conexión.'); return; }
    state.hierarchy = next;
    renderHierarchy();
    if (dom.areaSaveAsContact.checked && payload.responsibleName) await saveResponsibleAsContact(payload);
    closeAreaDialog();
    toast('Área guardada.', 'success');
  }

  // Crea (o actualiza, si ya existe uno con el mismo nombre) un contacto de
  // la organización a partir del responsable del área — para no tener que
  // escribir sus datos dos veces si también quieres verlo en Contactos.
  async function saveResponsibleAsContact(area) {
    const matchName = area.responsibleName.trim().toLowerCase();
    const next = await mutateBoardKey(CONTACTS_KEY, [], function (list) {
      const idx = list.findIndex(function (c) { return (c.name || '').trim().toLowerCase() === matchName; });
      const contact = {
        id: idx > -1 ? list[idx].id : uid(),
        name: area.responsibleName,
        role: area.responsibleRole,
        phone: area.responsiblePhone,
        email: area.responsibleEmail,
        status: idx > -1 ? list[idx].status : 'pending',
        notes: idx > -1 ? list[idx].notes : '',
        created_at: idx > -1 ? list[idx].created_at : new Date().toISOString()
      };
      if (idx > -1) { const copy = list.slice(); copy[idx] = contact; return copy; }
      return list.concat(contact);
    });
    if (next !== null) { state.contacts = next; renderContacts(); }
  }

  async function deleteEditingArea() {
    const area = state.editingArea;
    if (!area) return;
    const hasChildren = state.hierarchy.some(function (a) { return a.parentId === area.id; });
    if (hasChildren) { showError(dom.areaError, 'Esta área tiene sub-áreas — muévelas o elimínalas primero.'); return; }
    const next = await mutateBoardKey(HIERARCHY_KEY, [], function (list) { return list.filter(function (a) { return a.id !== area.id; }); });
    const ok = next !== null;
    if (!ok) { showError(dom.areaError, 'No se pudo eliminar — revisa tu conexión.'); return; }
    state.hierarchy = next;
    renderHierarchy();
    closeAreaDialog();
    toast('Área eliminada.', 'success');
  }

  function hierarchyNodeHtml(area) {
    const status = contactStatusInfo(area);
    const children = state.hierarchy.filter(function (a) { return a.parentId === area.id; });
    const respLine = area.responsibleName
      ? '👤 ' + safe(area.responsibleName) + (area.responsibleRole ? ' · ' + safe(area.responsibleRole) : '')
      : '<span class="hierarchy-empty">Sin responsable asignado</span>';
    return '<div class="hierarchy-node">' +
      '<div class="hierarchy-node-card">' +
        '<div class="hierarchy-node-head">' +
          '<span class="hierarchy-node-name">' + safe(area.name) + '</span>' +
          '<span class="contact-status-pill status-' + status.key + '">' + status.emoji + ' ' + safe(status.label) + '</span>' +
        '</div>' +
        '<div class="hierarchy-node-resp">' + respLine + '</div>' +
        (area.notes ? '<div class="hierarchy-node-notes">' + safe(area.notes) + '</div>' : '') +
        '<div class="hierarchy-node-actions">' +
          '<button type="button" class="link-button" data-action="add-child-area" data-parent-id="' + safe(area.id) + '" onclick="window.orgAction(event)">➕ Sub-área</button>' +
          '<button type="button" class="icon-button icon-button-sm" data-area-id="' + safe(area.id) + '" onclick="window.orgAction(event)" aria-label="Editar ' + safe(area.name) + '">✏️</button>' +
        '</div>' +
      '</div>' +
      (children.length ? '<div class="hierarchy-children">' + children.map(hierarchyNodeHtml).join('') + '</div>' : '') +
    '</div>';
  }

  function renderHierarchy() {
    if (!dom.hierarchyTree) return;
    if (!state.hierarchy.length) {
      renderMarkup(dom.hierarchyTree, '<div class="empty-state"><strong>🏛️ Jerarquía vacía</strong><span>Agrega la primera área con el botón de arriba.</span></div>');
      return;
    }
    const roots = state.hierarchy.filter(function (a) { return !a.parentId || !findById(state.hierarchy, a.parentId); });
    renderMarkup(dom.hierarchyTree, roots.map(hierarchyNodeHtml).join(''));
  }

  function openContactDetail(c) {
    if (!c) return;
    state.viewingContact = c;
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

  function closeContactDetail() { dom.contactDetailDialog.close(); state.viewingContact = null; }

  function editFromContactDetail() {
    const c = state.viewingContact;
    closeContactDetail();
    openContactDialog(c);
  }

  async function deleteFromContactDetail() {
    const c = state.viewingContact;
    closeContactDetail();
    await deleteContact(c);
  }

  // ---------- Tareas ----------

  function renderKpis() {
    const responsableFilter = state.taskResponsableFilter || null;
    const scoped = state.allTasks.filter(function (t) { return t.org === ORG_ID && (!responsableFilter || t.responsable.indexOf(responsableFilter) > -1); });
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
    const scoped = state.allTasks.filter(function (t) { return t.org === ORG_ID && (!responsableFilter || t.responsable.indexOf(responsableFilter) > -1); });
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
    const responsable = responsableNamesLabel(task.responsable);
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

  // Acepta tanto el formato viejo (un solo id como string) como el actual
  // (arreglo de ids) — así las tareas guardadas antes de permitir varios
  // responsables se siguen mostrando bien sin necesidad de migrarlas.
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
    const next = await mutateBoardKey(TEAM_MEMBERS_KEY, [], function (list) { return list.concat(entry); });
    const ok = next !== null;
    if (!ok) return null;
    state.teamMembers = next;
    return entry;
  }


  async function moveTaskStatus(id, status) {
    const task = findById(state.allTasks, id);
    if (!task || task.status === status) return;
    const previous = task.status;
    task.status = status;
    renderTasksBoard();
    renderKpis();
    const next = await mutateBoardKey(TEAM_TASKS_KEY, [], function (list) {
      return list.map(function (t) { return t.id === id ? Object.assign({}, t, { status: status }) : t; });
    });
    if (next === null) { task.status = previous; renderTasksBoard(); renderKpis(); toast('No se pudo actualizar el estado — revisa tu conexión.', 'error'); return; }
    state.allTasks = next.map(function (t) { return Object.assign({}, t, { responsable: normalizeResponsableList(t.responsable) }); });
    renderTasksBoard();
    renderKpis();
  }

  function openTaskDialog(existing) {
    hideError(dom.taskError);
    dom.taskForm.reset();
    state.editingTask = existing || null;
    dom.taskDialogTitle.textContent = existing ? 'Editar tarea' : 'Agregar tarea';
    dom.taskDelete.hidden = !existing;
    dom.taskForm.elements.title.value = existing ? (existing.title || '') : '';
    populateResponsableChecklist(existing ? existing.responsable : []);
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
    let responsableIds = getSelectedResponsableIds();
    if (isNewResponsableChecked()) {
      const newName = dom.taskForm.elements.new_responsable_name.value.trim();
      if (!newName) { showError(dom.taskError, 'Escribe el nombre del nuevo responsable.'); return; }
      const created = await createTeamMember(newName);
      if (!created) { showError(dom.taskError, 'No se pudo guardar el responsable — revisa tu conexión.'); return; }
      responsableIds = responsableIds.concat([created.id]);
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
      responsable: responsableIds,
      dueDate: dom.taskDueDate.value,
      nextAction: dom.taskNextAction.value.trim(),
      created_at: existing ? existing.created_at : new Date().toISOString()
    };
    const next = await mutateBoardKey(TEAM_TASKS_KEY, [], function (list) {
      return existing
        ? list.map(function (t) { return t.id === existing.id ? payload : t; })
        : list.concat(payload);
    });
    const ok = next !== null;
    if (!ok) { showError(dom.taskError, 'No se pudo guardar — revisa tu conexión.'); return; }
    state.allTasks = next.map(function (t) { return Object.assign({}, t, { responsable: normalizeResponsableList(t.responsable) }); });
    renderTasksBoard();
    renderKpis();
    closeTaskDialog();
    toast('Tarea guardada.', 'success');
  }

  async function deleteEditingTask() {
    if (!state.editingTask) return;
    const next = await mutateBoardKey(TEAM_TASKS_KEY, [], function (list) { return list.filter(function (t) { return t.id !== state.editingTask.id; }); });
    const ok = next !== null;
    if (!ok) { toast('No se pudo eliminar — revisa tu conexión.', 'error'); return; }
    state.allTasks = next.map(function (t) { return Object.assign({}, t, { responsable: normalizeResponsableList(t.responsable) }); });
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
