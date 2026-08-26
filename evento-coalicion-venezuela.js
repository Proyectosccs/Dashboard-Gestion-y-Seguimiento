(function () {
  'use strict';

  const SUPABASE_URL = 'https://hcylkagvwfncdaaizutn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';
  const EDITOR_FUNCTION_URL = SUPABASE_URL + '/functions/v1/coalicion-editor';
  const TABLES = {
    contacts: 'coalicion_contacts',
    events: 'coalicion_events',
    inventory: 'coalicion_inventory',
    batches: 'coalicion_batches'
  };

  const EVENT_STATUS = {
    planned: 'Planificado',
    confirmed: 'Confirmado',
    in_progress: 'En ejecución',
    completed: 'Completado'
  };
  const BATCH_STATUS = {
    planned: 'Planificado',
    confirmed: 'Confirmado',
    arrived: 'En el lugar',
    completed: 'Entrega completada'
  };
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const state = {
    client: null,
    editing: false,
    editorKey: '',
    view: 'summary',
    calendarMonth: new Date().toISOString().slice(0, 7),
    contacts: [],
    events: [],
    inventory: [],
    batches: [],
    query: '',
    editor: null,
    editorDirty: false,
    discardArmed: false,
    realtime: null,
    loadId: 0
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
      'edit-access-button': toggleEditAccess,
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
    dom.editAccessButton = document.getElementById('edit-access-button');
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
    dom.batchesList = document.getElementById('batches-list');
    dom.keyDialog = document.getElementById('key-dialog');
    dom.keyForm = document.getElementById('key-form');
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
    dom.keyForm.addEventListener('submit', activateEditing);
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

  function toggleEditAccess() {
    if (!state.editing) {
      dom.keyError.hidden = true;
      dom.keyError.textContent = '';
      dom.editorKey.value = '';
      dom.keyDialog.showModal();
      dom.editorKey.focus();
      return;
    }
    lockEditing();
    loadAllData(true);
    toast('Modo edición desactivado.', 'success');
  }

  function lockEditing() {
    state.editing = false;
    state.editorKey = '';
    document.body.classList.remove('is-editing');
    dom.sessionRole.textContent = 'Vista pública';
    dom.editAccessButton.textContent = '🔑 Activar edición';
  }

  async function activateEditing(event) {
    event.preventDefault();
    const key = dom.editorKey.value;
    dom.keyError.hidden = true;
    if (key.length < 12) {
      dom.keyError.textContent = 'La clave debe tener al menos 12 caracteres.';
      dom.keyError.hidden = false;
      dom.editorKey.setAttribute('aria-invalid', 'true');
      dom.editorKey.focus();
      return;
    }
    setBusy(dom.keySubmit, true);
    const result = await callEditorApi('verify', { key: key });
    setBusy(dom.keySubmit, false);
    if (result.error || result.data !== true) {
      dom.keyError.textContent = 'La clave no es válida. Verifícala e inténtalo nuevamente.';
      dom.keyError.hidden = false;
      dom.editorKey.setAttribute('aria-invalid', 'true');
      dom.editorKey.select();
      return;
    }
    state.editing = true;
    state.editorKey = key;
    document.body.classList.add('is-editing');
    dom.sessionRole.textContent = 'Edición activa';
    dom.editAccessButton.textContent = 'Bloquear edición';
    dom.editorKey.removeAttribute('aria-invalid');
    closeKeyDialog();
    await loadAllData(true);
    toast('Modo edición activado.', 'success');
  }

  function closeKeyDialog() {
    dom.editorKey.value = '';
    dom.editorKey.type = 'password';
    dom.toggleEditorKey.textContent = 'Mostrar';
    dom.toggleEditorKey.setAttribute('aria-label', 'Mostrar clave de edición');
    dom.toggleEditorKey.setAttribute('aria-pressed', 'false');
    dom.keyError.hidden = true;
    if (dom.keyDialog.open) dom.keyDialog.close();
    dom.editAccessButton.focus();
  }

  function toggleEditorKey() {
    const revealing = dom.editorKey.type === 'password';
    dom.editorKey.type = revealing ? 'text' : 'password';
    dom.toggleEditorKey.textContent = revealing ? 'Ocultar' : 'Mostrar';
    dom.toggleEditorKey.setAttribute('aria-label', revealing ? 'Ocultar clave de edición' : 'Mostrar clave de edición');
    dom.toggleEditorKey.setAttribute('aria-pressed', String(revealing));
    dom.editorKey.focus();
  }

  function showConnectionFailure() {
    dom.loadingState.hidden = true;
    dom.connectivityBanner.textContent = 'La conexión de datos no está disponible. Revisa la configuración de Supabase.';
    dom.connectivityBanner.hidden = false;
  }

  async function loadAllData(background) {
    if (!state.client) return;
    const loadId = ++state.loadId;
    if (!background) dom.loadingState.hidden = false;
    dom.connectivityBanner.hidden = true;

    const contactsRequest = state.editing
      ? callEditorApi('contacts', { key: state.editorKey })
      : state.client.from(TABLES.contacts).select('id,name,role,created_at,updated_at').is('archived_at', null).order('name');
    const results = await Promise.all([
      contactsRequest,
      state.client.from(TABLES.events).select('*').is('archived_at', null).order('event_date'),
      state.client.from(TABLES.inventory).select('*').is('archived_at', null).order('name'),
      state.client.from(TABLES.batches).select('*').is('archived_at', null).order('created_at')
    ]);

    if (loadId !== state.loadId) return;
    const failed = results.find(function (result) { return result.error; });
    if (failed) {
      if (state.editing && results[0].error) {
        lockEditing();
        toast('La clave dejó de ser válida. Volvimos a la vista pública.', 'error');
        return loadAllData(true);
      }
      dom.loadingState.hidden = true;
      dom.connectivityBanner.hidden = false;
      return;
    }

    state.contacts = results[0].data || [];
    state.events = results[1].data || [];
    state.inventory = results[2].data || [];
    state.batches = results[3].data || [];
    dom.loadingState.hidden = true;
    renderAll();
    if (!background) setView(state.view);
  }

  function subscribeRealtime() {
    teardownRealtime();
    let channel = state.client.channel('coalicion-evento-publico');
    [TABLES.events, TABLES.inventory, TABLES.batches].forEach(function (table) {
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
      contacts: 'Contactos — Evento Coalición Venezuela',
      batches: 'Lotes — Evento Coalición Venezuela'
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
    if (viewName === 'batches') renderBatches();
  }

  function handleAppAction(event) {
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    handleAction(actionNode.dataset.action, actionNode.dataset.id);
  }

  function handleAction(action, id) {
    if (action === 'new-contact') openEditor('contact');
    if (action === 'edit-contact') openEditor('contact', findById(state.contacts, id));
    if (action === 'new-event') openEditor('event');
    if (action === 'edit-event') openEditor('event', findById(state.events, id));
    if (action === 'new-inventory') openEditor('inventory');
    if (action === 'edit-inventory') openEditor('inventory', findById(state.inventory, id));
    if (action === 'new-batch') openEditor('batch');
    if (action === 'edit-batch') openEditor('batch', findById(state.batches, id));
  }

  function renderAll() {
    renderSummary();
    renderCalendar();
    renderContacts();
    renderBatches();
  }

  function renderSummary() {
    const plannedPeople = state.batches.reduce(function (sum, batch) { return sum + Number(batch.expected_count || 0); }, 0);
    const inventoryAvailable = state.inventory.reduce(function (sum, item) {
      return sum + Math.max(0, Number(item.total_quantity || 0) - Number(item.distributed_quantity || 0));
    }, 0);
    const completeBatches = state.batches.filter(function (batch) { return batch.status === 'completed'; }).length;
    renderMarkup(dom.kpiGrid,
      kpi('kpi-primary', state.events.length, '🗓️ Eventos registrados') +
      kpi('kpi-blue', state.contacts.length, '🤝 Responsables') +
      kpi('kpi-sky', inventoryAvailable, '📦 Unidades disponibles') +
      kpi('kpi-indigo', plannedPeople, '👥 Personas previstas')
    );

    const next = nextEvent();
    if (!next) {
      renderMarkup(dom.nextEventCard, emptyState('🗓️ Sin evento registrado', 'Agrega la fecha, una dirección o un enlace de Maps para activar el pulso operativo.', canEdit() ? '<button class="btn btn-primary" type="button" data-action="new-event">➕ Agregar evento</button>' : ''));
    } else {
      const date = dateParts(next.event_date);
      renderMarkup(dom.nextEventCard,
        '<div class="event-hero-content">' +
          '<div class="event-date-block"><span class="event-day">' + safe(date.day) + '</span><div><span class="event-month">' + safe(date.month + ' ' + date.year) + '</span><div class="status-pill status-' + safe(next.status) + '">' + safe(EVENT_STATUS[next.status] || 'Planificado') + '</div></div></div>' +
          '<h3>' + safe(next.title) + '</h3>' +
          '<div class="event-meta"><p>◷ ' + safe(formatTime(next.start_time)) + '</p>' + renderEventLocation(next) + (next.notes ? '<p>↳ ' + safe(next.notes) + '</p>' : '') + '</div>' +
        '</div>' +
        (canEdit() ? '<div class="event-actions"><button class="btn btn-secondary" type="button" data-action="edit-event" data-id="' + safe(next.id) + '">Editar evento</button></div>' : '')
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
          (canEdit() ? '<button class="btn btn-ghost" type="button" data-action="edit-inventory" data-id="' + safe(item.id) + '">Actualizar</button>' : '') +
        '</article>';
      }).join(''));
    }

    const finalKpi = dom.kpiGrid.lastElementChild;
    if (finalKpi) finalKpi.setAttribute('title', completeBatches + ' lotes completados');
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
          return '<button class="calendar-event" type="button" data-action="edit-event" data-id="' + safe(item.id) + '"' + (canEdit() ? '' : ' disabled') + '>' + safe(formatTime(item.start_time) + ' · ' + item.title) + '</button>';
        }).join('') + '</div>';
    }
    renderMarkup(dom.calendarGrid, markup);
  }

  function renderContacts() {
    const query = normalize(state.query);
    const contacts = state.contacts.filter(function (contact) {
      return !query || normalize([contact.name, contact.role, contact.email, contact.phone].join(' ')).includes(query);
    });
    dom.contactResultCount.textContent = contacts.length + ' de ' + state.contacts.length + ' contactos';
    dom.contactSearchClear.hidden = !state.query;
    if (!contacts.length) {
      renderMarkup(dom.contactsList, emptyState(state.contacts.length ? '🔎 Sin coincidencias' : '🤝 Directorio vacío', state.contacts.length ? 'Prueba otra búsqueda o limpia el filtro.' : 'Agrega los responsables autorizados del evento.', state.contacts.length ? '<button class="btn btn-secondary" type="button" id="empty-clear-search">Limpiar búsqueda</button>' : ''));
      const clear = document.getElementById('empty-clear-search');
      if (clear) clear.addEventListener('click', clearContactSearch);
      return;
    }
    renderMarkup(dom.contactsList, contacts.map(function (contact) {
      return '<article class="contact-card">' +
        '<div class="contact-card-header"><div class="contact-avatar" aria-hidden="true">' + safe(initials(contact.name)) + '</div><div><h3>' + safe(contact.name) + '</h3><div class="contact-role">' + safe(contact.role || 'Responsable') + '</div></div></div>' +
        '<span class="private-chip">Información protegida</span>' +
        (canEdit() ? '<div class="contact-details">' +
          '<div>▣ Cédula: <strong>' + safe(contact.national_id || 'Por confirmar') + '</strong></div>' +
          '<div>◉ <a href="tel:' + safe(contact.phone || '') + '">' + safe(contact.phone || 'Por confirmar') + '</a></div>' +
          '<div>✉ <a href="mailto:' + safe(contact.email || '') + '">' + safe(contact.email || 'Por confirmar') + '</a></div>' +
          (contact.notes ? '<div>↳ ' + safe(contact.notes) + '</div>' : '') +
        '</div>' : '<div class="notice notice-warning">Activa el modo edición para visualizar los datos completos de contacto.</div>') +
        (canEdit() ? '<div class="contact-card-actions"><button class="btn btn-secondary" type="button" data-action="edit-contact" data-id="' + safe(contact.id) + '">Editar contacto</button></div>' : '') +
      '</article>';
    }).join(''));
  }

  function renderBatches() {
    if (!state.batches.length) {
      renderMarkup(dom.batchesList, emptyState('👥 No hay lotes registrados', 'Agrega cada grupo con su líder, cantidad prevista y ventana de llegada.', canEdit() ? '<button class="btn btn-primary" type="button" data-action="new-batch">➕ Agregar lote</button>' : ''));
      return;
    }
    renderMarkup(dom.batchesList, state.batches.map(function (batch) {
      const event = findById(state.events, batch.event_id);
      return '<article class="batch-card">' +
        '<div><h3>' + safe(batch.label) + '</h3><div class="status-pill status-' + safe(batch.status) + '">' + safe(BATCH_STATUS[batch.status] || 'Planificado') + '</div></div>' +
        '<div class="batch-value"><span>Líder</span><strong>' + safe(batch.leader_name || 'Por confirmar') + '</strong></div>' +
        '<div class="batch-value"><span>Personas</span><strong>' + Number(batch.expected_count || 0) + '</strong></div>' +
        '<div class="batch-value"><span>Llegada</span><strong>' + safe(batch.arrival_window || 'Por confirmar') + '</strong></div>' +
        '<div class="batch-value"><span>Evento</span><strong>' + safe(event ? event.title : 'Por asignar') + '</strong></div>' +
        (canEdit() ? '<button class="btn btn-secondary" type="button" data-action="edit-batch" data-id="' + safe(batch.id) + '">Editar</button>' : '') +
      '</article>';
    }).join(''));
  }

  function openEditor(type, record) {
    if (!canEdit()) return;
    state.editor = { type: type, record: record || null };
    state.editorDirty = false;
    state.discardArmed = false;
    dom.dialogCancel.textContent = 'Cancelar';
    hideDialogError();
    const configs = {
      contact: { eyebrow: 'Directorio privado', title: record ? 'Editar contacto' : 'Agregar contacto', fields: contactFields(record) },
      event: { eyebrow: 'Agenda compartida', title: record ? 'Editar evento' : 'Agregar evento', fields: eventFields(record) },
      inventory: { eyebrow: 'Control de existencias', title: record ? 'Actualizar inventario' : 'Agregar artículo', fields: inventoryFields(record) },
      batch: { eyebrow: 'Recepción por grupos', title: record ? 'Editar lote' : 'Agregar lote', fields: batchFields(record) }
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

  function batchFields(record) {
    const item = record || {};
    const eventOptions = state.events.reduce(function (acc, event) { acc[event.id] = event.title + ' · ' + formatDate(event.event_date); return acc; }, { '': 'Por asignar' });
    return field('Identificación del lote', 'label', item.label, 'text', true, '', 'field-full') +
      field('Líder responsable', 'leader_name', item.leader_name, 'text', true) +
      field('Cantidad prevista (mínimo 15)', 'expected_count', item.expected_count || 15, 'number', true, 'numeric') +
      field('Ventana de llegada', 'arrival_window', item.arrival_window, 'text', false) +
      selectField('Estado', 'status', item.status || 'planned', BATCH_STATUS) +
      selectField('Evento', 'event_id', item.event_id || '', eventOptions, 'field-full') +
      textareaField('Notas del lote', 'notes', item.notes, 'field-full');
  }

  async function saveEditor(event) {
    event.preventDefault();
    if (!state.editor || !canEdit()) return;
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
      key: state.editorKey,
      entity: state.editor.type,
      payload: payload,
      id: state.editor.record ? state.editor.record.id : null
    });
    setBusy(dom.dialogSave, false);
    if (result.error) {
      if (result.error.code === '28000' || String(result.error.message || '').includes('invalid editor key')) {
        lockEditing();
        showDialogError('La clave de edición dejó de ser válida. Cierra este formulario y actívala nuevamente.');
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
      if (!data.name.trim()) return issue('name', 'Escribe el nombre completo del contacto.');
      if (!data.role.trim()) return issue('role', 'Indica el rol del contacto.');
      if (!data.phone.trim()) return issue('phone', 'Ingresa un teléfono de contacto.');
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
    if (type === 'batch') {
      if (!data.label.trim()) return issue('label', 'Identifica el lote.');
      if (!data.leader_name.trim()) return issue('leader_name', 'Indica el líder responsable.');
      if (Number(data.expected_count) < 15) return issue('expected_count', 'Cada lote debe incluir al menos 15 personas.');
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
    if (type === 'batch') {
      trimmed.expected_count = Number(trimmed.expected_count);
      trimmed.event_id = trimmed.event_id || null;
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

  function canEdit() {
    return state.editing && !!state.editorKey;
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
