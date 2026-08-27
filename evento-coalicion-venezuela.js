(function () {
  'use strict';

  const SUPABASE_URL = 'https://hcylkagvwfncdaaizutn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';
  const EDITOR_FUNCTION_URL = SUPABASE_URL + '/functions/v1/coalicion-editor';
  const LITE_FUNCTION_URL = SUPABASE_URL + '/functions/v1/lite-resultados';
  const TABLES = {
    contacts: 'coalicion_contacts',
    events: 'coalicion_events',
    inventory: 'coalicion_inventory'
  };
  const SEMAFORO_META = {
    Rojo: { key: 'rojo', label: 'Rojo · colapsado', color: 'var(--coalition-danger)', soft: 'var(--coalition-danger-soft)' },
    Amarillo: { key: 'amarillo', label: 'Amarillo · inhabitable (de pie)', color: 'var(--coalition-warning)', soft: 'var(--coalition-warning-soft)' },
    Verde: { key: 'verde', label: 'Verde · habitable', color: 'var(--coalition-good)', soft: 'var(--coalition-good-soft)' }
  };
  const NUCLEO_BRACKETS = [
    { key: '1-2', label: '1–2 personas', test: function (t) { return t <= 2; } },
    { key: '3-4', label: '3–4 personas', test: function (t) { return t >= 3 && t <= 4; } },
    { key: '5-6', label: '5–6 personas', test: function (t) { return t >= 5 && t <= 6; } },
    { key: '7+', label: '7 o más', test: function (t) { return t >= 7; } }
  ];

  const EVENT_STATUS = {
    planned: 'Planificado',
    confirmed: 'Confirmado',
    in_progress: 'En ejecución',
    completed: 'Completado'
  };
  const AFFILIATIONS = {
    '': 'Selecciona una opción',
    'Coalicion con amor a Venezuela': 'Coalicion con amor a Venezuela',
    'Fundacion Ingenia': 'Fundacion Ingenia',
    'Voluntariado AVAA': 'Voluntariado AVAA',
    'Voluntario Particular': 'Voluntario Particular'
  };
  const AFFILIATION_CLASSES = {
    'Coalicion con amor a Venezuela': 'affiliation-coalicion',
    'Fundacion Ingenia': 'affiliation-ingenia',
    'Voluntariado AVAA': 'affiliation-avaa',
    'Voluntario Particular': 'affiliation-particular'
  };
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const state = {
    client: null,
    view: 'summary',
    calendarMonth: new Date().toISOString().slice(0, 7),
    contacts: [],
    revealedContacts: {},
    events: [],
    inventory: [],
    query: '',
    keyRequest: null,
    keyRequestCounter: 0,
    keyTrigger: null,
    sensitiveEditorKey: '',
    editor: null,
    editorDirty: false,
    discardArmed: false,
    realtime: null,
    loadId: 0,
    results: { loading: false, error: null, loaded: false, entregas: [], semaforoFilter: null },
    map: null,
    mapMarkers: null
  };

  const dom = {};

  document.addEventListener('DOMContentLoaded', init);

  window.coalicionAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
    if (target.dataset.view) return setView(target.dataset.view);
    if (target.dataset.action) return handleAction(target.dataset.action, target.dataset.id);
    const actionsById = {
      'retry-load': loadAllData,
      'calendar-prev': function () { changeMonth(-1); },
      'calendar-next': function () { changeMonth(1); },
      'calendar-today': function () { state.calendarMonth = new Date().toISOString().slice(0, 7); renderCalendar(); },
      'contact-search-clear': clearContactSearch,
      'key-dialog-close': closeKeyDialog,
      'key-dialog-cancel': closeKeyDialog,
      'toggle-editor-key': toggleEditorKey,
      'dialog-close': requestCloseEditor,
      'dialog-cancel': requestCloseEditor
    };
    const action = actionsById[target.id];
    if (action) action();
  };

  function init() {
    cacheDom();
    bindStaticEvents();
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return showConnectionFailure();

    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadAllData();
    subscribeRealtime();
  }

  function cacheDom() {
    dom.appShell = document.getElementById('app-shell');
    dom.sessionName = document.getElementById('session-name');
    dom.sessionRole = document.getElementById('session-role');
    dom.loadingState = document.getElementById('loading-state');
    dom.connectivityBanner = document.getElementById('connectivity-banner');
    dom.retryLoad = document.getElementById('retry-load');
    dom.kpiGrid = document.getElementById('kpi-grid');
    dom.nextEventCard = document.getElementById('next-event-card');
    dom.inventoryList = document.getElementById('inventory-list');
    dom.calendarMonthLabel = document.getElementById('calendar-month-label');
    dom.calendarGrid = document.getElementById('calendar-grid');
    dom.contactSearch = document.getElementById('contact-search');
    dom.contactSearchClear = document.getElementById('contact-search-clear');
    dom.contactResultCount = document.getElementById('contact-result-count');
    dom.contactsList = document.getElementById('contacts-list');
    dom.resultsStatus = document.getElementById('results-status');
    dom.resultsEmpty = document.getElementById('results-empty');
    dom.resultsBody = document.getElementById('results-body');
    dom.resultsRefresh = document.getElementById('results-refresh');
    dom.resultsKpiGrid = document.getElementById('results-kpi-grid');
    dom.resultsSemaforo = document.getElementById('results-semaforo');
    dom.resultsSemaforoBar = document.getElementById('results-semaforo-bar');
    dom.resultsFilterPill = document.getElementById('results-filter-pill');
    dom.resultsZoneList = document.getElementById('results-zone-list');
    dom.resultsMap = document.getElementById('results-map');
    dom.resultsNeeds = document.getElementById('results-needs');
    dom.resultsNucleos = document.getElementById('results-nucleos');
    dom.keyDialog = document.getElementById('key-dialog');
    dom.keyForm = document.getElementById('key-form');
    dom.keyDialogTitle = document.getElementById('key-dialog-title');
    dom.keyDialogCopy = document.getElementById('key-dialog-copy');
    dom.editorKey = document.getElementById('editor-key');
    dom.keyError = document.getElementById('key-error');
    dom.keySubmit = document.getElementById('key-submit');
    dom.toggleEditorKey = document.getElementById('toggle-editor-key');
    dom.editorDialog = document.getElementById('editor-dialog');
    dom.editorForm = document.getElementById('editor-form');
    dom.dialogTitle = document.getElementById('dialog-title');
    dom.dialogEyebrow = document.getElementById('dialog-eyebrow');
    dom.dialogFields = document.getElementById('dialog-fields');
    dom.dialogError = document.getElementById('dialog-error');
    dom.dialogSave = document.getElementById('dialog-save');
    dom.dialogCancel = document.getElementById('dialog-cancel');
    dom.dialogClose = document.getElementById('dialog-close');
    dom.toastRegion = document.getElementById('toast-region');
  }

  function bindStaticEvents() {
    dom.appShell.addEventListener('click', handleAppAction);
    dom.contactSearch.addEventListener('input', handleContactSearch);
    dom.keyForm.addEventListener('submit', authorizeSensitiveAccess);
    dom.keyDialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeKeyDialog();
    });
    dom.editorForm.addEventListener('submit', saveEditor);
    dom.editorForm.addEventListener('input', function () {
      state.editorDirty = true;
      state.discardArmed = false;
      dom.dialogCancel.textContent = 'Cancelar';
      hideDialogError();
    });
    dom.editorDialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      requestCloseEditor();
    });
    window.addEventListener('beforeunload', function (event) {
      if (!state.editorDirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') loadAllData(true);
    });
  }

  function showConnectionFailure() {
    dom.loadingState.hidden = true;
    dom.connectivityBanner.textContent = 'La conexión de datos no está disponible. Revisa la configuración de Supabase.';
    dom.connectivityBanner.hidden = false;
  }

  function requestSensitiveAccess(purpose, contactId) {
    const contact = contactId ? findById(state.contacts, contactId) : null;
    const name = contact ? contact.name : 'este responsable';
    state.keyRequest = { purpose: purpose, contactId: contactId || null, token: ++state.keyRequestCounter };
    state.keyTrigger = document.activeElement;
    dom.keyDialogTitle.textContent = purpose === 'reveal'
      ? 'Ver datos de ' + name
      : 'Editar a ' + name;
    dom.keyDialogCopy.textContent = purpose === 'reveal'
      ? 'Ingresa la clave para mostrar la cédula, el teléfono, el correo y las notas.'
      : 'Ingresa la clave para editar la información sensible de este responsable.';
    dom.keyError.hidden = true;
    dom.keyError.textContent = '';
    dom.editorKey.value = '';
    dom.editorKey.type = 'password';
    dom.toggleEditorKey.textContent = 'Mostrar';
    dom.toggleEditorKey.setAttribute('aria-label', 'Mostrar clave');
    dom.toggleEditorKey.setAttribute('aria-pressed', 'false');
    dom.keyDialog.showModal();
    dom.editorKey.focus();
  }

  async function authorizeSensitiveAccess(event) {
    event.preventDefault();
    const request = state.keyRequest;
    const key = dom.editorKey.value;
    dom.keyError.hidden = true;
    dom.editorKey.removeAttribute('aria-invalid');
    if (!request) return;
    if (key.length < 12) {
      dom.keyError.textContent = 'La clave debe tener al menos 12 caracteres.';
      dom.keyError.hidden = false;
      dom.editorKey.setAttribute('aria-invalid', 'true');
      dom.editorKey.focus();
      return;
    }

    setBusy(dom.keySubmit, true);
    const result = await callEditorApi('responsible', { key: key, id: request.contactId });
    setBusy(dom.keySubmit, false);
    if (!state.keyRequest || state.keyRequest.token !== request.token) return;

    if (result.error) {
      dom.keyError.textContent = 'La clave no es válida. Verifícala e inténtalo nuevamente.';
      dom.keyError.hidden = false;
      dom.editorKey.setAttribute('aria-invalid', 'true');
      dom.editorKey.select();
      return;
    }

    if (request.purpose === 'reveal') {
      state.revealedContacts[request.contactId] = result.data;
      closeKeyDialog(false);
      renderContacts();
      const hideButton = dom.contactsList.querySelector('[data-action="hide-contact"][data-id="' + request.contactId + '"]');
      if (hideButton) hideButton.focus();
      toast('Datos sensibles visibles para este responsable.', 'success');
      return;
    }

    state.sensitiveEditorKey = key;
    const record = request.purpose === 'edit' ? result.data : null;
    closeKeyDialog(false);
    openEditor('contact', record);
  }

  function closeKeyDialog(restoreFocus) {
    dom.editorKey.value = '';
    dom.editorKey.type = 'password';
    dom.toggleEditorKey.textContent = 'Mostrar';
    dom.toggleEditorKey.setAttribute('aria-label', 'Mostrar clave');
    dom.toggleEditorKey.setAttribute('aria-pressed', 'false');
    dom.keyError.hidden = true;
    if (dom.keyDialog.open) dom.keyDialog.close();
    const trigger = state.keyTrigger;
    state.keyRequest = null;
    state.keyTrigger = null;
    if (restoreFocus !== false && trigger && typeof trigger.focus === 'function') trigger.focus();
  }

  function toggleEditorKey() {
    const revealing = dom.editorKey.type === 'password';
    dom.editorKey.type = revealing ? 'text' : 'password';
    dom.toggleEditorKey.textContent = revealing ? 'Ocultar' : 'Mostrar';
    dom.toggleEditorKey.setAttribute('aria-label', revealing ? 'Ocultar clave' : 'Mostrar clave');
    dom.toggleEditorKey.setAttribute('aria-pressed', String(revealing));
    dom.editorKey.focus();
  }

  async function loadAllData(background) {
    if (!state.client) return;
    const loadId = ++state.loadId;
    if (!background) dom.loadingState.hidden = false;
    dom.connectivityBanner.hidden = true;

    const contactsRequest = state.client.from(TABLES.contacts)
      .select('id,name,role,belongs_to,created_at,updated_at')
      .is('archived_at', null)
      .order('name');
    const results = await Promise.all([
      contactsRequest,
      state.client.from(TABLES.events).select('*').is('archived_at', null).order('event_date'),
      state.client.from(TABLES.inventory).select('*').is('archived_at', null).order('name')
    ]);

    if (loadId !== state.loadId) return;
    const failed = results.find(function (result) { return result.error; });
    if (failed) {
      dom.loadingState.hidden = true;
      dom.connectivityBanner.hidden = false;
      return;
    }

    state.contacts = results[0].data || [];
    state.revealedContacts = {};
    state.events = results[1].data || [];
    state.inventory = results[2].data || [];
    dom.loadingState.hidden = true;
    renderAll();
    if (!background) setView(state.view);
  }

  function subscribeRealtime() {
    teardownRealtime();
    let channel = state.client.channel('coalicion-evento-publico');
    [TABLES.events, TABLES.inventory].forEach(function (table) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: table }, function () {
        loadAllData(true);
      });
    });
    state.realtime = channel.subscribe();
  }

  function teardownRealtime() {
    if (state.client && state.realtime) state.client.removeChannel(state.realtime);
    state.realtime = null;
  }

  function setView(viewName) {
    state.view = viewName;
    const titles = {
      summary: 'Resumen — Evento Coalición Venezuela',
      calendar: 'Calendario — Evento Coalición Venezuela',
      contacts: 'Responsables — Evento Coalición Venezuela',
      results: 'Resultados — Evento Coalición Venezuela'
    };
    document.querySelectorAll('.tab-button').forEach(function (button) {
      if (button.dataset.view === viewName) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('.view').forEach(function (view) { view.hidden = true; });
    const active = document.getElementById(viewName + '-view');
    if (active) active.hidden = false;
    document.title = titles[viewName] || titles.summary;
    if (viewName === 'calendar') renderCalendar();
    if (viewName === 'contacts') renderContacts();
    if (viewName === 'results') loadResultsIfNeeded();
  }

  function handleAppAction(event) {
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    handleAction(actionNode.dataset.action, actionNode.dataset.id);
  }

  function handleAction(action, id) {
    if (action === 'new-contact') openEditor('contact');
    if (action === 'edit-contact') requestSensitiveAccess('edit', id);
    if (action === 'reveal-contact') requestSensitiveAccess('reveal', id);
    if (action === 'hide-contact') hideContact(id);
    if (action === 'new-event') openEditor('event');
    if (action === 'edit-event') openEditor('event', findById(state.events, id));
    if (action === 'new-inventory') openEditor('inventory');
    if (action === 'edit-inventory') openEditor('inventory', findById(state.inventory, id));
    if (action === 'refresh-results') fetchResultados(true);
    if (action === 'filter-semaforo') toggleSemaforoFilter(id);
  }

  function hideContact(id) {
    delete state.revealedContacts[id];
    renderContacts();
    const revealButton = dom.contactsList.querySelector('[data-action="reveal-contact"][data-id="' + id + '"]');
    if (revealButton) revealButton.focus();
  }

  function renderAll() {
    renderSummary();
    renderCalendar();
    renderContacts();
  }

  function renderSummary() {
    const inventoryAvailable = state.inventory.reduce(function (sum, item) {
      return sum + Math.max(0, Number(item.total_quantity || 0) - Number(item.distributed_quantity || 0));
    }, 0);
    renderMarkup(dom.kpiGrid,
      kpi('kpi-primary', state.events.length, '🗓️ Eventos registrados') +
      kpi('kpi-blue', state.contacts.length, '🤝 Responsables') +
      kpi('kpi-sky', inventoryAvailable, '📦 Unidades disponibles')
    );

    const next = nextEvent();
    if (!next) {
      renderMarkup(dom.nextEventCard, emptyState('🗓️ Sin evento registrado', 'Agrega la fecha, una dirección o un enlace de Maps para activar el pulso operativo.', '<button class="btn btn-primary" type="button" data-action="new-event">➕ Agregar evento</button>'));
    } else {
      const date = dateParts(next.event_date);
      renderMarkup(dom.nextEventCard,
        '<div class="event-hero-content">' +
          '<div class="event-date-block"><span class="event-day">' + safe(date.day) + '</span><div><span class="event-month">' + safe(date.month + ' ' + date.year) + '</span><div class="status-pill status-' + safe(next.status) + '">' + safe(EVENT_STATUS[next.status] || 'Planificado') + '</div></div></div>' +
          '<h3>' + safe(next.title) + '</h3>' +
          '<div class="event-meta"><p>◷ ' + safe(formatTime(next.start_time)) + '</p>' + renderEventLocation(next) + (next.notes ? '<p>↳ ' + safe(next.notes) + '</p>' : '') + '</div>' +
        '</div>' +
        '<div class="event-actions"><button class="btn btn-secondary" type="button" data-action="edit-event" data-id="' + safe(next.id) + '">Editar evento</button></div>'
      );
    }

    if (!state.inventory.length) {
      renderMarkup(dom.inventoryList, emptyState('📦 Inventario pendiente', 'Registra los artículos disponibles y las unidades distribuidas.', ''));
    } else {
      renderMarkup(dom.inventoryList, state.inventory.map(function (item) {
        const total = Math.max(0, Number(item.total_quantity || 0));
        const distributed = Math.max(0, Number(item.distributed_quantity || 0));
        const available = Math.max(0, total - distributed);
        const pct = total ? Math.min(100, Math.round(distributed / total * 100)) : 0;
        return '<article class="inventory-item">' +
          '<div class="inventory-top"><span class="inventory-name">' + safe(item.name) + '</span><span class="inventory-count">' + available + '</span></div>' +
          '<div class="progress-track" role="progressbar" aria-label="Distribución de ' + safe(item.name) + '" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + distributed + '"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="inventory-meta"><span>' + distributed + ' distribuidas</span><span>' + total + ' ' + safe(item.unit || 'unidades') + '</span></div>' +
          '<button class="btn btn-ghost" type="button" data-action="edit-inventory" data-id="' + safe(item.id) + '">Actualizar</button>' +
        '</article>';
      }).join(''));
    }
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
          return '<button class="calendar-event" type="button" data-action="edit-event" data-id="' + safe(item.id) + '">' + safe(formatTime(item.start_time) + ' · ' + item.title) + '</button>';
        }).join('') + '</div>';
    }
    renderMarkup(dom.calendarGrid, markup);
  }

  function renderContacts() {
    const query = normalize(state.query);
    const contacts = state.contacts.filter(function (contact) {
      return !query || normalize([contact.name, contact.role, contact.belongs_to].join(' ')).includes(query);
    });
    dom.contactResultCount.textContent = contacts.length + ' de ' + state.contacts.length + ' responsables';
    dom.contactSearchClear.hidden = !state.query;
    if (!contacts.length) {
      renderMarkup(dom.contactsList, emptyState(state.contacts.length ? '🔎 Sin coincidencias' : '🤝 Directorio vacío', state.contacts.length ? 'Prueba otra búsqueda o limpia el filtro.' : 'Agrega los responsables autorizados del evento.', state.contacts.length ? '<button class="btn btn-secondary" type="button" id="empty-clear-search">Limpiar búsqueda</button>' : ''));
      const clear = document.getElementById('empty-clear-search');
      if (clear) clear.addEventListener('click', clearContactSearch);
      return;
    }
    renderMarkup(dom.contactsList, contacts.map(function (contact) {
      const fullContact = state.revealedContacts[contact.id];
      return '<article class="contact-card ' + safe(affiliationClass(contact.belongs_to)) + '">' +
        '<div class="contact-card-header"><div class="contact-avatar" aria-hidden="true">' + safe(initials(contact.name)) + '</div><div><h3>' + safe(contact.name) + '</h3><div class="contact-role">' + safe(contact.role || 'Responsable') + '</div></div></div>' +
        '<div class="contact-chips"><span class="affiliation-chip">🏷️ ' + safe(contact.belongs_to || 'Pertenencia por confirmar') + '</span><span class="private-chip">🔐 Datos sensibles protegidos</span></div>' +
        renderSensitiveDetails(fullContact) +
        '<div class="contact-card-actions">' +
          '<button class="btn btn-ghost privacy-eye" type="button" data-action="' + (fullContact ? 'hide-contact' : 'reveal-contact') + '" data-id="' + safe(contact.id) + '" aria-label="' + (fullContact ? 'Ocultar' : 'Ver') + ' datos sensibles de ' + safe(contact.name) + '">' + (fullContact ? '🙈 Ocultar datos' : '👁️ Ver datos') + '</button>' +
          '<button class="btn btn-secondary" type="button" data-action="edit-contact" data-id="' + safe(contact.id) + '">Editar responsable</button>' +
        '</div>' +
      '</article>';
    }).join(''));
  }

  function renderSensitiveDetails(contact) {
    if (!contact) {
      return '<div class="contact-details" aria-label="Datos sensibles ocultos">' +
        sensitiveRow('▣ Cédula', '<span class="masked-value" aria-label="Oculto">••••••••</span>') +
        sensitiveRow('◉ Teléfono', '<span class="masked-value" aria-label="Oculto">•••• ••••</span>') +
        sensitiveRow('✉ Correo', '<span class="masked-value" aria-label="Oculto">••••••@••••.•••</span>') +
        sensitiveRow('↳ Notas', '<span class="masked-value" aria-label="Oculto">••••••••••</span>') +
      '</div>';
    }
    const phone = contact.phone
      ? '<a href="tel:' + safe(contact.phone) + '">' + safe(contact.phone) + '</a>'
      : 'Por confirmar';
    const email = contact.email
      ? '<a href="mailto:' + safe(contact.email) + '">' + safe(contact.email) + '</a>'
      : 'Por confirmar';
    return '<div class="contact-details">' +
      sensitiveRow('▣ Cédula', '<strong>' + safe(contact.national_id || 'Por confirmar') + '</strong>') +
      sensitiveRow('◉ Teléfono', phone) +
      sensitiveRow('✉ Correo', email) +
      sensitiveRow('↳ Notas', safe(contact.notes || 'Por confirmar')) +
    '</div>';
  }

  function sensitiveRow(label, value) {
    return '<div class="sensitive-row"><span class="sensitive-label">' + safe(label) + '</span><span class="sensitive-value">' + value + '</span></div>';
  }

  // ---------- Resultados de la jornada (conektados Lite) ----------

  function loadResultsIfNeeded() {
    if (state.results.loaded || state.results.loading) {
      if (state.results.loaded) renderResultados();
      return;
    }
    fetchResultados(false);
  }

  async function callLiteApi(resource, params) {
    try {
      const response = await fetch(LITE_FUNCTION_URL, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: resource, params: params || {} })
      });
      const body = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        return { data: null, error: { status: response.status, message: body.error || 'operation unavailable' } };
      }
      return { data: body.data, error: null };
    } catch (_error) {
      return { data: null, error: { status: 0, message: 'network unavailable' } };
    }
  }

  async function fetchResultados(userTriggered) {
    state.results.loading = true;
    state.results.error = null;
    if (userTriggered || !state.results.loaded) {
      dom.resultsStatus.hidden = false;
      dom.resultsStatus.className = 'notice notice-warning page-notice';
      dom.resultsStatus.textContent = 'Cargando resultados de conektados Lite…';
      dom.resultsBody.hidden = true;
      dom.resultsEmpty.hidden = true;
    }
    const result = await callLiteApi('entregas', {});
    state.results.loading = false;
    if (result.error) {
      state.results.error = result.error;
      dom.resultsStatus.hidden = false;
      dom.resultsStatus.className = 'notice notice-error page-notice';
      dom.resultsStatus.textContent = result.error.status === 401
        ? 'La conexión con conektados Lite todavía no está configurada (falta el token o el dominio).'
        : 'No pudimos traer los resultados de conektados Lite. ' + (result.error.message || '') + ' — intenta actualizar en un momento.';
      dom.resultsBody.hidden = true;
      return;
    }
    state.results.loaded = true;
    state.results.entregas = (result.data && result.data.entregas) || [];
    dom.resultsStatus.hidden = true;
    renderResultados();
  }

  function toggleSemaforoFilter(colorKey) {
    state.results.semaforoFilter = state.results.semaforoFilter === colorKey ? null : colorKey;
    renderResultados();
  }

  function normalizeZoneName(raw) {
    const text = String(raw || '').trim();
    if (!text) return 'Sin especificar';
    const stripped = text.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/^(barrio|sector|urbanizacion|urb\.?|calle|avenida|av\.?|zona)\s+/i, '')
      .replace(/\s+/g, ' ').trim();
    return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : text;
  }

  function computeResultsMetrics(entregas) {
    const totalCajas = entregas.reduce(function (sum, e) { return sum + Number(e.cantidadPaquetes || 0); }, 0);
    const totalAdultos = entregas.reduce(function (sum, e) { return sum + Number(e.composicionAdultos || 0); }, 0);
    const totalNinos = entregas.reduce(function (sum, e) { return sum + Number(e.composicionNinos || 0); }, 0);
    const confirmadas = entregas.filter(function (e) { return e.confirmadoRecibido === true; }).length;
    const pendientes = entregas.filter(function (e) { return e.confirmadoRecibido === null || e.confirmadoRecibido === undefined; }).length;

    const semaforo = { Rojo: 0, Amarillo: 0, Verde: 0 };
    entregas.forEach(function (e) {
      const status = Array.isArray(e.statusVivienda) ? e.statusVivienda[0] : e.statusVivienda;
      if (semaforo[status] != null) semaforo[status] += 1;
    });

    const zoneMap = {};
    entregas.forEach(function (e) {
      const zone = normalizeZoneName(e.ubicacionActual);
      if (!zoneMap[zone]) zoneMap[zone] = { name: zone, count: 0, lat: null, lng: null, semaforo: { Rojo: 0, Amarillo: 0, Verde: 0 } };
      zoneMap[zone].count += 1;
      const status = Array.isArray(e.statusVivienda) ? e.statusVivienda[0] : e.statusVivienda;
      if (zoneMap[zone].semaforo[status] != null) zoneMap[zone].semaforo[status] += 1;
      if (zoneMap[zone].lat == null && typeof e.ubicacionLat === 'number') { zoneMap[zone].lat = e.ubicacionLat; zoneMap[zone].lng = e.ubicacionLng; }
    });
    const zones = Object.keys(zoneMap).map(function (k) { return zoneMap[k]; }).sort(function (a, b) { return b.count - a.count; });

    const needMap = {};
    entregas.forEach(function (e) {
      const need = e.necesidad || 'Sin especificar';
      needMap[need] = (needMap[need] || 0) + 1;
    });
    const needs = Object.keys(needMap).map(function (k) { return { name: k, count: needMap[k] }; }).sort(function (a, b) { return b.count - a.count; });

    const nucleos = NUCLEO_BRACKETS.map(function (bracket) {
      const matching = entregas.filter(function (e) {
        const total = Number(e.composicionAdultos || 0) + Number(e.composicionNinos || 0);
        return bracket.test(total);
      });
      const cajas = matching.reduce(function (sum, e) { return sum + Number(e.cantidadPaquetes || 0); }, 0);
      return { key: bracket.key, label: bracket.label, count: matching.length, cajas: cajas, avgCajas: matching.length ? (cajas / matching.length) : 0 };
    });

    return {
      totalEntregas: entregas.length, totalCajas: totalCajas,
      totalAdultos: totalAdultos, totalNinos: totalNinos, personas: totalAdultos + totalNinos,
      confirmadas: confirmadas, pendientes: pendientes, semaforo: semaforo, zones: zones, needs: needs, nucleos: nucleos
    };
  }

  function renderResultados() {
    const filter = state.results.semaforoFilter;
    const all = state.results.entregas;
    const filtered = filter
      ? all.filter(function (e) { const s = Array.isArray(e.statusVivienda) ? e.statusVivienda[0] : e.statusVivienda; return s === filter; })
      : all;

    if (!all.length) {
      dom.resultsBody.hidden = true;
      dom.resultsEmpty.hidden = false;
      renderMarkup(dom.resultsEmpty, emptyState('📦 Aún no hay entregas registradas', 'En cuanto el equipo empiece a registrar en conektados Lite, esta pantalla se llena sola.', ''));
      return;
    }
    dom.resultsEmpty.hidden = true;
    dom.resultsBody.hidden = false;

    const m = computeResultsMetrics(filtered);

    renderMarkup(dom.resultsKpiGrid,
      kpi('kpi-primary', m.totalCajas, '📦 Cajas entregadas') +
      kpi('kpi-blue', m.totalEntregas, '🫂 Entregas registradas') +
      kpi('kpi-sky', m.personas, '👥 Personas beneficiadas') +
      kpi('kpi-indigo', m.confirmadas, '✅ Confirmadas por QR')
    );

    renderSemaforoBlock(m.semaforo, all.length);
    renderZonesBlock(m.zones);
    renderNeedsBlock(m.needs);
    renderNucleosBlock(m.nucleos);
  }

  function renderSemaforoBlock(semaforo) {
    const total = semaforo.Rojo + semaforo.Amarillo + semaforo.Verde;
    const filter = state.results.semaforoFilter;
    renderMarkup(dom.resultsSemaforo, ['Rojo', 'Amarillo', 'Verde'].map(function (key) {
      const meta = SEMAFORO_META[key];
      const count = semaforo[key];
      const pct = total ? Math.round(count / total * 100) : 0;
      const active = !filter || filter === key;
      return '<button type="button" class="semaforo-chip' + (active ? ' active' : '') + '" data-action="filter-semaforo" data-id="' + key + '" style="--chip-color:' + meta.color + ';--chip-soft:' + meta.soft + '">' +
        '<span class="semaforo-dot"></span><span class="semaforo-num">' + count + '</span><span class="semaforo-label">' + meta.label + '</span><span class="semaforo-pct">' + pct + '%</span>' +
      '</button>';
    }).join(''));

    renderMarkup(dom.resultsSemaforoBar, ['Rojo', 'Amarillo', 'Verde'].map(function (key) {
      const meta = SEMAFORO_META[key];
      const pct = total ? (semaforo[key] / total * 100) : 0;
      return '<span style="width:' + pct + '%;background:' + meta.color + '"></span>';
    }).join(''));

    if (filter) {
      dom.resultsFilterPill.hidden = false;
      renderMarkup(dom.resultsFilterPill, '🔎 Mostrando solo <strong>' + SEMAFORO_META[filter].label + '</strong> · <button type="button" data-action="filter-semaforo" data-id="' + filter + '">ver todas</button>');
    } else {
      dom.resultsFilterPill.hidden = true;
    }
  }

  function renderZonesBlock(zones) {
    if (!zones.length) {
      renderMarkup(dom.resultsZoneList, emptyState('📍 Sin ubicaciones', 'Las entregas todavía no traen ubicación.', ''));
      dom.resultsMap.innerHTML = '';
      return;
    }
    const maxCount = zones[0].count;
    renderMarkup(dom.resultsZoneList, zones.slice(0, 10).map(function (z) {
      const pct = maxCount ? Math.round(z.count / maxCount * 100) : 0;
      return '<div class="zone-row"><span class="zone-name">' + safe(z.name) + '</span><span class="zone-count">' + z.count + '</span>' +
        '<span class="zone-track"><span class="zone-fill" style="width:' + pct + '%"></span></span></div>';
    }).join(''));

    renderResultsMap(zones);
  }

  function renderResultsMap(zones) {
    if (!window.L || !dom.resultsMap) return;
    const withCoords = zones.filter(function (z) { return typeof z.lat === 'number' && typeof z.lng === 'number'; });
    if (!state.map) {
      state.map = window.L.map(dom.resultsMap, { attributionControl: true, zoomControl: true, scrollWheelZoom: false });
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap'
      }).addTo(state.map);
      state.mapMarkers = window.L.layerGroup().addTo(state.map);
    }
    state.mapMarkers.clearLayers();
    if (!withCoords.length) {
      state.map.setView([10.5, -66.9], 9);
      return;
    }
    const SEMAFORO_HEX = { Rojo: '#a02525', Amarillo: '#b8790a', Verde: '#0f7a3d' };
    const bounds = [];
    withCoords.forEach(function (z) {
      const dominant = ['Rojo', 'Amarillo', 'Verde'].reduce(function (best, key) { return z.semaforo[key] > z.semaforo[best] ? key : best; }, 'Verde');
      const color = SEMAFORO_HEX[dominant] || '#1d4ed8';
      const marker = window.L.circleMarker([z.lat, z.lng], { radius: Math.min(20, 6 + z.count), color: '#fff', weight: 2, fillColor: color, fillOpacity: .85 });
      marker.bindTooltip(safe(z.name) + ' · ' + z.count);
      marker.addTo(state.mapMarkers);
      bounds.push([z.lat, z.lng]);
    });
    state.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    setTimeout(function () { if (state.map) state.map.invalidateSize(); }, 60);
  }

  function renderNeedsBlock(needs) {
    if (!needs.length) {
      renderMarkup(dom.resultsNeeds, emptyState('🥫 Sin necesidades registradas', '', ''));
      return;
    }
    const total = needs.reduce(function (sum, n) { return sum + n.count; }, 0);
    const max = needs[0].count;
    renderMarkup(dom.resultsNeeds, needs.map(function (n) {
      const pct = max ? Math.round(n.count / max * 100) : 0;
      const share = total ? Math.round(n.count / total * 100) : 0;
      return '<div class="need-row"><span class="need-label">' + safe(n.name) + '</span>' +
        '<span class="need-track"><span class="need-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="need-val">' + n.count + ' · ' + share + '%</span></div>';
    }).join(''));
  }

  function renderNucleosBlock(nucleos) {
    renderMarkup(dom.resultsNucleos, nucleos.map(function (n) {
      return '<div class="nucleo-card"><strong>' + n.count + '</strong><span>' + safe(n.label) + '</span>' +
        '<div class="nucleo-meta">' + n.cajas + ' cajas · ' + n.avgCajas.toFixed(1) + ' prom.</div></div>';
    }).join(''));
  }

  function openEditor(type, record) {
    state.editor = { type: type, record: record || null };
    state.editorDirty = false;
    state.discardArmed = false;
    dom.dialogCancel.textContent = 'Cancelar';
    hideDialogError();
    const configs = {
      contact: { eyebrow: 'Equipo del evento', title: record ? 'Editar responsable' : 'Agregar responsable', fields: contactFields(record) },
      event: { eyebrow: 'Agenda compartida', title: record ? 'Editar evento' : 'Agregar evento', fields: eventFields(record) },
      inventory: { eyebrow: 'Control de existencias', title: record ? 'Actualizar inventario' : 'Agregar artículo', fields: inventoryFields(record) }
    };
    const config = configs[type];
    dom.dialogEyebrow.textContent = config.eyebrow;
    dom.dialogTitle.textContent = config.title;
    renderMarkup(dom.dialogFields, config.fields);
    dom.editorDialog.showModal();
    const first = dom.dialogFields.querySelector('input, select, textarea');
    if (first) first.focus();
  }

  function contactFields(record) {
    const item = record || {};
    return field('Nombre completo', 'name', item.name, 'text', true) +
      field('Rol en el evento', 'role', item.role || 'Responsable', 'text', true) +
      selectField('Pertenece a:', 'belongs_to', item.belongs_to || '', AFFILIATIONS, 'field-full') +
      field('Cédula', 'national_id', item.national_id, 'text', false, 'numeric') +
      field('Teléfono', 'phone', item.phone, 'tel', true, 'tel') +
      field('Correo electrónico', 'email', item.email, 'email', false, 'email') +
      textareaField('Notas operativas', 'notes', item.notes, 'field-full');
  }

  function eventFields(record) {
    const item = record || {};
    return field('Nombre del evento', 'title', item.title, 'text', true, '', 'field-full') +
      field('Fecha', 'event_date', item.event_date || new Date().toISOString().slice(0, 10), 'date', true) +
      field('Hora de inicio', 'start_time', timeInput(item.start_time), 'time', false) +
      field('📍 Dirección (opcional si agregas Maps)', 'location', item.location, 'text', false, '', 'field-full', 'Ej.: Calle Real de Mare Abajo, frente al bulevar', 'Puedes dejarla vacía si pegas el enlace de Google Maps.') +
      field('🗺️ Enlace de Google Maps (opcional si agregas dirección)', 'maps_url', item.maps_url, 'url', false, 'url', 'field-full', 'Pega el enlace del punto exacto', 'Debes completar la dirección o este enlace. Acepta maps.google.com y maps.app.goo.gl.') +
      selectField('Estado', 'status', item.status || 'planned', EVENT_STATUS) +
      textareaField('Indicaciones y notas', 'notes', item.notes, 'field-full');
  }

  function inventoryFields(record) {
    const item = record || {};
    return field('Artículo', 'name', item.name, 'text', true, '', 'field-full') +
      field('Cantidad total', 'total_quantity', item.total_quantity || 0, 'number', true, 'numeric') +
      field('Cantidad distribuida', 'distributed_quantity', item.distributed_quantity || 0, 'number', true, 'numeric') +
      field('Unidad de medida', 'unit', item.unit || 'unidades', 'text', true, '', 'field-full');
  }

  async function saveEditor(event) {
    event.preventDefault();
    if (!state.editor) return;
    hideDialogError();
    const data = Object.fromEntries(new FormData(dom.editorForm).entries());
    const validation = validateEditor(state.editor.type, data);
    if (validation) {
      showDialogError(validation.message);
      const fieldNode = dom.editorForm.elements[validation.field];
      if (fieldNode) {
        fieldNode.setAttribute('aria-invalid', 'true');
        fieldNode.focus();
      }
      return;
    }

    dom.editorForm.querySelectorAll('[aria-invalid="true"]').forEach(function (node) { node.removeAttribute('aria-invalid'); });
    const payload = normalizePayload(state.editor.type, data);
    setBusy(dom.dialogSave, true);
    const result = await callEditorApi('save', {
      key: state.editor.type === 'contact' && state.editor.record ? state.sensitiveEditorKey : undefined,
      entity: state.editor.type,
      payload: payload,
      id: state.editor.record ? state.editor.record.id : null
    });
    setBusy(dom.dialogSave, false);
    if (result.error) {
      if (state.editor.type === 'contact' && result.error.code === '28000') {
        state.sensitiveEditorKey = '';
        showDialogError('La clave dejó de ser válida. Cierra el formulario e inténtalo nuevamente.');
        return;
      }
      showDialogError('No pudimos guardar los cambios. Revisa tu conexión y vuelve a intentarlo.');
      return;
    }

    state.editorDirty = false;
    closeEditor();
    toast('Cambios guardados.', 'success');
    await loadAllData(true);
  }

  function validateEditor(type, data) {
    if (type === 'contact') {
      if (!data.name.trim()) return issue('name', 'Escribe el nombre completo del responsable.');
      if (!data.role.trim()) return issue('role', 'Indica el rol del responsable.');
      if (!data.belongs_to) return issue('belongs_to', 'Selecciona a qué organización pertenece.');
      if (!data.phone.trim()) return issue('phone', 'Ingresa el teléfono del responsable.');
      if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) return issue('email', 'Corrige el formato del correo electrónico.');
    }
    if (type === 'event') {
      if (!data.title.trim()) return issue('title', 'Escribe el nombre del evento.');
      if (!data.event_date) return issue('event_date', 'Selecciona la fecha del evento.');
      if (!data.location.trim() && !data.maps_url.trim()) return issue('location', 'Agrega una dirección o un enlace de Google Maps.');
      if (data.maps_url && !isGoogleMapsUrl(data.maps_url)) return issue('maps_url', 'Pega un enlace válido de Google Maps.');
    }
    if (type === 'inventory') {
      if (!data.name.trim()) return issue('name', 'Escribe el nombre del artículo.');
      if (Number(data.total_quantity) < 0) return issue('total_quantity', 'La cantidad total no puede ser negativa.');
      if (Number(data.distributed_quantity) < 0) return issue('distributed_quantity', 'La cantidad distribuida no puede ser negativa.');
      if (Number(data.distributed_quantity) > Number(data.total_quantity)) return issue('distributed_quantity', 'La cantidad distribuida no puede superar el total.');
    }
    return null;
  }

  function normalizePayload(type, data) {
    const trimmed = {};
    Object.keys(data).forEach(function (key) { trimmed[key] = typeof data[key] === 'string' ? data[key].trim() : data[key]; });
    if (type === 'inventory') {
      trimmed.total_quantity = Number(trimmed.total_quantity);
      trimmed.distributed_quantity = Number(trimmed.distributed_quantity);
    }
    if (type === 'event') trimmed.start_time = trimmed.start_time || null;
    return trimmed;
  }

  function requestCloseEditor() {
    if (!state.editorDirty) {
      closeEditor();
      return;
    }
    if (!state.discardArmed) {
      state.discardArmed = true;
      dom.dialogCancel.textContent = 'Descartar cambios';
      showDialogError('Hay cambios sin guardar. Presiona “Descartar cambios” para cerrar sin guardarlos.');
      dom.dialogCancel.focus();
      return;
    }
    state.editorDirty = false;
    closeEditor();
  }

  function closeEditor() {
    if (dom.editorDialog.open) dom.editorDialog.close();
    state.editor = null;
    state.sensitiveEditorKey = '';
    state.editorDirty = false;
    state.discardArmed = false;
    dom.dialogCancel.textContent = 'Cancelar';
  }

  function handleContactSearch(event) {
    state.query = event.target.value;
    renderContacts();
  }

  function clearContactSearch() {
    state.query = '';
    dom.contactSearch.value = '';
    renderContacts();
    dom.contactSearch.focus();
  }

  function changeMonth(delta) {
    const parts = state.calendarMonth.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1 + delta, 1));
    state.calendarMonth = date.toISOString().slice(0, 7);
    renderCalendar();
  }

  async function callEditorApi(action, payload) {
    try {
      const response = await fetch(EDITOR_FUNCTION_URL, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(Object.assign({ action: action }, payload || {}))
      });
      const body = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        return {
          data: null,
          error: {
            code: response.status === 401 ? '28000' : 'EDGE_FUNCTION_ERROR',
            message: body.error || 'operation unavailable'
          }
        };
      }
      return { data: body.data, error: null };
    } catch (_error) {
      return { data: null, error: { code: 'NETWORK_ERROR', message: 'network unavailable' } };
    }
  }

  function nextEvent() {
    if (!state.events.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    return state.events.find(function (event) { return event.event_date >= today && event.status !== 'completed'; }) || state.events[state.events.length - 1];
  }

  function kpi(className, value, label) {
    return '<article class="kpi-card ' + className + '"><strong>' + Number(value || 0) + '</strong><span>' + safe(label) + '</span></article>';
  }

  function emptyState(title, copy, action) {
    return '<div class="empty-state"><strong>' + safe(title) + '</strong><span>' + safe(copy) + '</span>' + (action || '') + '</div>';
  }

  function field(label, name, value, type, required, inputmode, extraClass, placeholder, help) {
    const helpId = help ? 'field-' + safe(name) + '-help' : '';
    return '<div class="field ' + safe(extraClass || '') + '"><label for="field-' + safe(name) + '">' + safe(label) + '</label>' +
      '<input id="field-' + safe(name) + '" class="input" name="' + safe(name) + '" type="' + safe(type || 'text') + '" value="' + safe(value == null ? '' : value) + '"' + (required ? ' required' : '') + (inputmode ? ' inputmode="' + safe(inputmode) + '"' : '') + (placeholder ? ' placeholder="' + safe(placeholder) + '"' : '') + (help ? ' aria-describedby="' + helpId + '"' : '') + '>' + (help ? '<small id="' + helpId + '" class="field-help">' + safe(help) + '</small>' : '') + '</div>';
  }

  function renderEventLocation(event) {
    const location = event.location || 'Punto compartido en Google Maps';
    const url = googleMapsUrl(event.maps_url, location);
    return '<p class="event-location"><span>⌖ ' + safe(location) + '</span><a class="maps-link" href="' + safe(url) + '" target="_blank" rel="noopener noreferrer" aria-label="Abrir ' + safe(location) + ' en Google Maps">↗ Abrir en Google Maps</a></p>';
  }

  function googleMapsUrl(value, location) {
    if (isGoogleMapsUrl(value)) return String(value).trim();
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location || '');
  }

  function isGoogleMapsUrl(value) {
    if (!value) return false;
    try {
      const parsed = new URL(String(value).trim());
      const host = parsed.hostname.toLowerCase();
      return parsed.protocol === 'https:' && (
        host === 'maps.app.goo.gl' ||
        (host === 'goo.gl' && parsed.pathname.startsWith('/maps')) ||
        host.startsWith('maps.google.') ||
        (host.startsWith('www.google.') && parsed.pathname.startsWith('/maps')) ||
        (host.startsWith('google.') && parsed.pathname.startsWith('/maps'))
      );
    } catch (_error) {
      return false;
    }
  }

  function textareaField(label, name, value, extraClass) {
    return '<div class="field ' + safe(extraClass || '') + '"><label for="field-' + safe(name) + '">' + safe(label) + '</label><textarea id="field-' + safe(name) + '" class="input" name="' + safe(name) + '">' + safe(value || '') + '</textarea></div>';
  }

  function selectField(label, name, selected, options, extraClass) {
    const optionMarkup = Object.keys(options).map(function (key) {
      return '<option value="' + safe(key) + '"' + (String(selected) === String(key) ? ' selected' : '') + '>' + safe(options[key]) + '</option>';
    }).join('');
    return '<div class="field ' + safe(extraClass || '') + '"><label for="field-' + safe(name) + '">' + safe(label) + '</label><select id="field-' + safe(name) + '" class="input" name="' + safe(name) + '">' + optionMarkup + '</select></div>';
  }

  function showDialogError(message) {
    dom.dialogError.textContent = message;
    dom.dialogError.hidden = false;
  }

  function hideDialogError() {
    dom.dialogError.hidden = true;
    dom.dialogError.textContent = '';
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    button.setAttribute('aria-busy', String(busy));
  }

  function toast(message, tone) {
    const node = document.createElement('div');
    node.className = 'toast toast-' + (tone || 'success');
    node.textContent = message;
    dom.toastRegion.replaceChildren(node);
    window.setTimeout(function () {
      if (node.parentNode) node.remove();
    }, 3500);
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

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part[0]; }).join('').toUpperCase();
  }

  function findById(list, id) {
    return list.find(function (item) { return String(item.id) === String(id); }) || null;
  }

  function affiliationClass(value) {
    return AFFILIATION_CLASSES[value] || 'affiliation-unassigned';
  }

  function issue(fieldName, message) { return { field: fieldName, message: message }; }

  function dateParts(iso) {
    const parts = String(iso || '').split('-');
    return { year: parts[0] || '—', month: MONTHS[Number(parts[1] || 1) - 1], day: parts[2] || '—' };
  }

  function formatDate(iso) {
    const parts = dateParts(iso);
    return parts.day + ' ' + parts.month.slice(0, 3) + ' ' + parts.year;
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
})();
