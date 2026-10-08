(function () {
  'use strict';

  // Mismo proyecto de Supabase que el resto del sitio, pero tabla propia
  // (lideres_contacts) — sin datos sensibles que enmascarar, lectura y
  // escritura anónima abierta (mismo modelo de seguridad que Dra Florangel).
  const SUPABASE_URL = 'https://hcylkagvwfncdaaizutn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';
  const TABLE = 'lideres_contacts';

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
    { code: '+507', label: '🇵🇦 +507 Panamá' },
    { code: '+599', label: '🇨🇼 +599 Curazao' }
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

  function downloadVCard(c) {
    if (!c) return;
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + (c.name || 'Contacto')];
    if (c.role) lines.push('TITLE:' + c.role);
    if (c.community) lines.push('ORG:' + c.community);
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

  // Solo dos estados de seguimiento: pendiente por contactar y ya contactado.
  const STATUSES = [
    { key: 'pending', label: 'Pendiente', emoji: '○', color: '#82796a' },
    { key: 'contacted', label: 'Contactado', emoji: '📞', color: '#4a7fd4' },
    { key: 'waiting_response', label: 'Esperando por ellos', emoji: '⏳', color: '#c67139' },
    { key: 'waiting_on_us', label: 'Esperando por nosotros', emoji: '📥', color: '#7c3aed' }
  ];
  const STATUS_MAP = {};
  STATUSES.forEach(function (s) { STATUS_MAP[s.key] = s; });

  // Paleta cíclica para colorear cada comunidad de forma estable (mismo
  // nombre siempre cae en el mismo color) sin depender de un catálogo fijo,
  // ya que "community" es texto libre que el equipo escribe manualmente.
  const COMMUNITY_PALETTE = ['#15803d', '#0369a1', '#c67139', '#7c3aed', '#be185d', '#0f766e', '#a16207', '#4338ca', '#b91c1c', '#0e7490'];

  const state = {
    client: null,
    contacts: [],
    query: '',
    communityFilter: '',
    statusFilter: '',
    contactsViewMode: 'list',
    editor: null,
    viewingContact: null,
    dragId: null
  };

  const dom = {};

  window.lideresAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
    if (target.dataset.contactsView) return setContactsViewMode(target.dataset.contactsView);
    if (target.dataset.action === 'move-status') return moveStatus(target.dataset.id, target.dataset.status);
    if (target.dataset.communityFilter !== undefined) {
      const community = target.dataset.communityFilter;
      state.communityFilter = state.communityFilter === community ? '' : community;
      renderContacts();
      return;
    }
    if (target.dataset.action) return handleAction(target.dataset.action, target.dataset.id);
    const actionsById = {
      'retry-load': function () { loadContacts(false); },
      'contact-search-clear': clearSearch,
      'filters-clear': clearFilters,
      'contact-dialog-close': closeContactDialog,
      'contact-dialog-cancel': closeContactDialog,
      'contact-archive': archiveEditingContact,
      'contact-detail-close': closeContactDetail,
      'contact-detail-edit': editFromContactDetail,
      'contact-detail-archive': archiveFromContactDetail,
      'contact-detail-vcard': function () { downloadVCard(state.viewingContact); }
    };
    const action = actionsById[target.id];
    if (action) action();
  };

  function handleAction(action, id) {
    if (action === 'new-contact') openContactDialog();
    if (action === 'edit-contact') openContactDialog(findById(state.contacts, id));
    if (action === 'view-contact') openContactDetail(findById(state.contacts, id));
  }

  function init() {
    cacheDom();
    bindStaticEvents();
    populateStatusSelect();
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return showConnectionFailure();
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadContacts(false);
    subscribeRealtime();
  }

  function cacheDom() {
    dom.loadingState = document.getElementById('loading-state');
    dom.connectivityBanner = document.getElementById('connectivity-banner');
    dom.toastRegion = document.getElementById('toast-region');
    dom.contactsGroups = document.getElementById('contacts-groups');
    dom.communityPillStrip = document.getElementById('community-pill-strip');
    dom.kpiIdentified = document.getElementById('kpi-identified');
    dom.kpiContacted = document.getElementById('kpi-contacted');
    dom.kpiPending = document.getElementById('kpi-pending');
    dom.statusBoard = document.getElementById('status-board');
    dom.contactSearch = document.getElementById('contact-search');
    dom.contactSearchClear = document.getElementById('contact-search-clear');
    dom.contactResultCount = document.getElementById('contact-result-count');
    dom.contactDialog = document.getElementById('contact-dialog');
    dom.contactForm = document.getElementById('contact-form');
    dom.contactDialogTitle = document.getElementById('contact-dialog-title');
    dom.contactError = document.getElementById('contact-error');
    dom.contactArchive = document.getElementById('contact-archive');
    dom.contactPhoneCode = document.getElementById('field-contact-phone-code');
    dom.communitySuggestions = document.getElementById('community-suggestions');
    dom.statusSelect = document.getElementById('field-contact-status');
    dom.statusFilter = document.getElementById('status-filter');
    dom.contactDetailDialog = document.getElementById('contact-detail-dialog');
    dom.contactDetailTitle = document.getElementById('contact-detail-title');
    dom.contactDetailBody = document.getElementById('contact-detail-body');
  }

  function bindStaticEvents() {
    dom.contactForm.addEventListener('submit', onContactSubmit);
    dom.contactDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeContactDialog(); });
    dom.contactSearch.addEventListener('input', function () {
      state.query = dom.contactSearch.value;
      renderContacts();
    });
    dom.statusFilter.addEventListener('change', function () {
      state.statusFilter = dom.statusFilter.value;
      renderContacts();
    });
    dom.contactDetailDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeContactDetail(); });
  }

  function populateStatusSelect() {
    renderMarkup(dom.statusSelect, STATUSES.map(function (s) {
      return '<option value="' + safe(s.key) + '">' + safe(s.emoji + ' ' + s.label) + '</option>';
    }).join(''));
    renderMarkup(dom.statusFilter, ['<option value="">Todos los estados</option>'].concat(STATUSES.map(function (s) {
      return '<option value="' + safe(s.key) + '">' + safe(s.emoji + ' ' + s.label) + '</option>';
    })).join(''));
  }

  // El filtro por comunidad ahora se elige desde la franja de arriba
  // (renderCommunityPillStrip); aquí solo se descarta si esa comunidad ya
  // no tiene contactos.
  function populateCommunityFilter() {
    const current = state.communityFilter;
    if (!current) return;
    const labels = state.contacts.map(function (c) { return communityLabel(c.community); });
    if (labels.indexOf(current) === -1) state.communityFilter = '';
  }

  function showConnectionFailure() {
    dom.loadingState.hidden = true;
    dom.connectivityBanner.hidden = false;
  }

  function setContactsViewMode(mode) {
    if (['list', 'kanban'].indexOf(mode) === -1) return;
    state.contactsViewMode = mode;
    document.querySelectorAll('.contacts-view-toggle .tab-button').forEach(function (btn) {
      if (btn.dataset.contactsView === mode) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    dom.contactsGroups.hidden = mode !== 'list';
    dom.statusBoard.hidden = mode !== 'kanban';
    if (mode === 'kanban') renderStatusBoard();
  }

  async function loadContacts(showSpinner) {
    if (!state.client) return;
    if (showSpinner !== false) dom.loadingState.hidden = false;
    dom.connectivityBanner.hidden = true;

    const res = await state.client.from(TABLE).select('*').is('archived_at', null).order('created_at', { ascending: true });
    if (res.error) {
      dom.loadingState.hidden = true;
      dom.connectivityBanner.hidden = false;
      return;
    }
    state.contacts = res.data || [];
    dom.loadingState.hidden = true;
    populateCommunityFilter();
    renderContacts();
  }

  function subscribeRealtime() {
    if (!state.client) return;
    state.client.channel('lideres-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function () { loadContacts(false); })
      .subscribe();
  }

  // ---------- Contactos agrupados por comunidad ----------

  function matchesFilters(contact, query) {
    if (query && !normalize([contact.name, contact.role, contact.community].join(' ')).includes(query)) return false;
    if (state.communityFilter && communityLabel(contact.community) !== state.communityFilter) return false;
    if (state.statusFilter && (contact.status || 'pending') !== state.statusFilter) return false;
    return true;
  }

  function communityLabel(value) {
    const trimmed = String(value || '').trim();
    return trimmed || 'Sin comunidad asignada';
  }

  function communityColor(value) {
    const label = communityLabel(value);
    if (label === 'Sin comunidad asignada') return '#64748b';
    let hash = 0;
    for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
    return COMMUNITY_PALETTE[hash % COMMUNITY_PALETTE.length];
  }

  function renderKpis() {
    const contacted = state.contacts.filter(function (c) { return c.status === 'contacted'; }).length;
    const pending = state.contacts.length - contacted;
    dom.kpiIdentified.textContent = state.contacts.length;
    dom.kpiContacted.textContent = contacted;
    dom.kpiPending.textContent = pending;
  }

  function renderContacts() {
    renderKpis();
    renderCommunityPillStrip();
    const query = normalize(state.query);
    const filtered = state.contacts.filter(function (contact) { return matchesFilters(contact, query); });
    dom.contactResultCount.textContent = filtered.length + ' de ' + state.contacts.length + ' líderes';
    dom.contactSearchClear.hidden = !state.query;

    if (!filtered.length) {
      renderMarkup(dom.contactsGroups, emptyState(
        state.contacts.length ? '🔎 Sin coincidencias' : '🧑‍🤝‍🧑 Directorio vacío',
        state.contacts.length ? 'Prueba otra búsqueda o limpia los filtros.' : 'Agrega los líderes comunitarios y su comunidad.',
        state.contacts.length ? '<button class="btn btn-secondary" type="button" id="empty-clear-search">Limpiar filtros</button>' : ''
      ));
      const clear = document.getElementById('empty-clear-search');
      if (clear) clear.addEventListener('click', clearFilters);
    } else {
      renderMarkup(dom.contactsGroups, filtered.map(function (c) {
        return renderContactCard(c, communityColor(c.community));
      }).join(''));
    }
    if (state.contactsViewMode === 'kanban') renderStatusBoard();
  }

  function renderContactCard(contact, color) {
    const status = STATUS_MAP[contact.status] || STATUSES[0];
    const phone = contact.phone ? safe(contact.phone) : 'Por confirmar';
    const email = contact.email ? safe(contact.email) : 'Por confirmar';
    return '<article class="contact-card contact-card-compact" style="--affiliation-color:' + safe(color) + '" data-action="view-contact" data-id="' + safe(contact.id) + '" tabindex="0" role="button" aria-label="Ver detalle de ' + safe(contact.name) + '" onclick="window.lideresAction(event)">' +
      '<div class="contact-card-header">' +
        '<div class="contact-avatar" aria-hidden="true">' + safe(initials(contact.name)) + '</div>' +
        '<div class="contact-card-heading"><h3>' + safe(contact.name) + '</h3><div class="contact-community-line">📍 ' + safe(communityLabel(contact.community)) + '</div></div>' +
        '<span class="contact-status-pill status-' + safe(status.key) + '">' + safe(status.emoji) + ' ' + safe(status.label) + '</span>' +
      '</div>' +
      '<div class="contact-simple-row">✉️ ' + email + '</div>' +
      '<div class="contact-simple-row">📱 ' + phone + '</div>' +
    '</article>';
  }

  function openContactDetail(contact) {
    if (!contact) return;
    state.viewingContact = contact;
    const status = STATUS_MAP[contact.status] || STATUSES[0];
    dom.contactDetailTitle.textContent = contact.name || 'Líder';
    renderMarkup(dom.contactDetailBody,
      '<div class="contact-row"><span class="contact-row-label">📍 Comunidad</span><span class="contact-row-value">' + safe(communityLabel(contact.community)) + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">Rol</span><span class="contact-row-value">' + safe(contact.role || 'Líder comunitario') + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">📱 Teléfono</span><span class="contact-row-value">' + (contact.phone ? '<a href="tel:' + safe(contact.phone) + '">' + safe(contact.phone) + '</a>' : 'Por confirmar') + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">✉️ Correo</span><span class="contact-row-value">' + (contact.email ? '<a href="mailto:' + safe(contact.email) + '">' + safe(contact.email) + '</a>' : 'Por confirmar') + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">Estado</span><span class="contact-row-value">' + safe(status.emoji) + ' ' + safe(status.label) + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">🗒️ Notas</span><span class="contact-row-value">' + (contact.notes ? safe(contact.notes) : 'Sin notas.') + '</span></div>'
    );
    dom.contactDetailDialog.showModal();
  }

  function closeContactDetail() { dom.contactDetailDialog.close(); state.viewingContact = null; }

  function editFromContactDetail() {
    const contact = state.viewingContact;
    closeContactDetail();
    openContactDialog(contact);
  }

  async function archiveFromContactDetail() {
    const contact = state.viewingContact;
    closeContactDetail();
    await archiveContact(contact);
  }

  function clearSearch() {
    state.query = '';
    dom.contactSearch.value = '';
    renderContacts();
  }

  function clearFilters() {
    state.query = '';
    state.communityFilter = '';
    state.statusFilter = '';
    dom.contactSearch.value = '';
    dom.statusFilter.value = '';
    renderContacts();
  }

  // Franja de comunidades con conteo (igual que la franja de organizaciones
  // en Networking) — clic en una comunidad filtra por ella, otro clic o
  // clic en el total la quita. Los conteos son del total sin filtrar.
  function renderCommunityPillStrip() {
    if (!dom.communityPillStrip) return;
    const counts = {};
    state.contacts.forEach(function (c) {
      const label = communityLabel(c.community);
      counts[label] = (counts[label] || 0) + 1;
    });
    const labels = Object.keys(counts).sort(function (a, b) {
      if (a === 'Sin comunidad asignada') return 1;
      if (b === 'Sin comunidad asignada') return -1;
      return counts[b] - counts[a];
    });
    const active = state.communityFilter || '';
    renderMarkup(dom.communityPillStrip,
      '<button type="button" class="kpi-strip-chip" data-community-filter="" aria-pressed="' + (active ? 'false' : 'true') + '" onclick="window.lideresAction(event)">👥 <strong>' + state.contacts.length + '</strong> ' + (state.contacts.length === 1 ? 'líder' : 'líderes') + ' en total</button>' +
      '<span class="kpi-strip-divider" aria-hidden="true"></span>' +
      labels.map(function (label) {
        return '<button type="button" class="kpi-strip-chip" data-community-filter="' + safe(label) + '" aria-pressed="' + (active === label ? 'true' : 'false') + '" title="Ver solo ' + safe(label) + '" onclick="window.lideresAction(event)">📍 ' + safe(label) + ' <strong>' + counts[label] + '</strong></button>';
      }).join(''));
  }

  // ---------- Tablero operativo (estado de seguimiento) ----------

  // No aplica state.statusFilter (agruparía todo en una sola columna) — sí
  // respeta la búsqueda y el filtro de comunidad, igual que la lista.
  function renderStatusBoard() {
    const query = normalize(state.query);
    const contacts = state.contacts.filter(function (c) {
      if (query && !normalize([c.name, c.role, c.community].join(' ')).includes(query)) return false;
      if (state.communityFilter && communityLabel(c.community) !== state.communityFilter) return false;
      return true;
    });
    renderMarkup(dom.statusBoard, STATUSES.map(function (status) {
      const items = contacts.filter(function (c) { return (c.status || 'pending') === status.key; });
      return '<div class="kanban-column" data-status="' + status.key + '">' +
        '<div class="kanban-column-head"><h3>' + safe(status.emoji + ' ' + status.label) + '</h3><span class="kanban-count">' + items.length + '</span></div>' +
        (items.length ? items.map(function (c) { return renderStatusCard(c, status); }).join('') : '<div class="kanban-empty">Sin líderes</div>') +
      '</div>';
    }).join(''));

    dom.statusBoard.querySelectorAll('.kanban-card').forEach(function (card) {
      card.addEventListener('dragstart', function () { state.dragId = card.dataset.id; card.classList.add('dragging'); });
      card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
    });
    dom.statusBoard.querySelectorAll('.kanban-column').forEach(function (column) {
      column.addEventListener('dragover', function (e) { e.preventDefault(); column.classList.add('drag-over'); });
      column.addEventListener('dragleave', function () { column.classList.remove('drag-over'); });
      column.addEventListener('drop', function (e) {
        e.preventDefault();
        column.classList.remove('drag-over');
        if (state.dragId) moveStatus(state.dragId, column.dataset.status);
        state.dragId = null;
      });
    });
  }

  function renderStatusCard(contact, status) {
    const statusIndex = STATUSES.findIndex(function (s) { return s.key === status.key; });
    const moveButtons = [];
    if (statusIndex > 0) moveButtons.push('<button type="button" class="kanban-move-btn" data-action="move-status" data-id="' + safe(contact.id) + '" data-status="' + STATUSES[statusIndex - 1].key + '" onclick="window.lideresAction(event)">← ' + safe(STATUSES[statusIndex - 1].label) + '</button>');
    if (statusIndex < STATUSES.length - 1) moveButtons.push('<button type="button" class="kanban-move-btn" data-action="move-status" data-id="' + safe(contact.id) + '" data-status="' + STATUSES[statusIndex + 1].key + '" onclick="window.lideresAction(event)">' + safe(STATUSES[statusIndex + 1].label) + ' →</button>');
    return '<article class="kanban-card" draggable="true" data-id="' + safe(contact.id) + '" style="--status-color:' + safe(status.color) + '">' +
      '<button type="button" style="all:unset;cursor:pointer" data-action="edit-contact" data-id="' + safe(contact.id) + '" onclick="window.lideresAction(event)">' +
        '<p class="kanban-card-title">' + safe(contact.name) + '</p>' +
        '<p class="kanban-card-notes">' + safe(communityLabel(contact.community)) + (contact.role ? ' · ' + safe(contact.role) : '') + '</p>' +
      '</button>' +
      '<div class="kanban-card-actions">' + moveButtons.join('') + '</div>' +
    '</article>';
  }

  async function moveStatus(id, statusKey) {
    const contact = findById(state.contacts, id);
    if (!contact || contact.status === statusKey) return;
    const previous = contact.status;
    contact.status = statusKey;
    renderStatusBoard();
    renderContacts();
    const res = await state.client.from(TABLE).update({ status: statusKey, updated_at: new Date().toISOString() }).eq('id', id);
    if (res.error) {
      contact.status = previous;
      renderStatusBoard();
      renderContacts();
      toast('No se pudo actualizar el estado — revisa tu conexión.', 'error');
    }
  }

  // ---------- Alta / edición ----------

  function openContactDialog(contact) {
    state.editor = contact ? contact.id : null;
    dom.contactDialogTitle.textContent = contact ? 'Editar líder' : 'Agregar líder';
    dom.contactArchive.hidden = !contact;
    hideError(dom.contactError);
    dom.contactForm.elements.name.value = contact ? contact.name : '';
    dom.contactForm.elements.community.value = contact ? (contact.community || '') : '';
    dom.contactForm.elements.role.value = contact ? (contact.role || '') : '';
    const parsedPhone = splitPhone(contact ? contact.phone : '');
    populatePhoneCodeSelect(dom.contactPhoneCode, parsedPhone.code);
    dom.contactForm.elements.phone_number.value = parsedPhone.number;
    dom.contactForm.elements.email.value = contact ? (contact.email || '') : '';
    dom.contactForm.elements.status.value = contact ? (contact.status || 'pending') : 'pending';
    dom.contactForm.elements.notes.value = contact ? (contact.notes || '') : '';
    populateCommunitySuggestions();
    dom.contactDialog.showModal();
    dom.contactForm.elements.name.focus();
  }

  function populateCommunitySuggestions() {
    const communities = Array.from(new Set(state.contacts.map(function (c) { return String(c.community || '').trim(); }).filter(Boolean))).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    renderMarkup(dom.communitySuggestions, communities.map(function (c) { return '<option value="' + safe(c) + '"></option>'; }).join(''));
  }

  function closeContactDialog() { dom.contactDialog.close(); state.editor = null; }

  async function onContactSubmit(e) {
    e.preventDefault();
    const name = dom.contactForm.elements.name.value.trim();
    if (!name) { showError(dom.contactError, 'El nombre es obligatorio.'); return; }
    const payload = {
      name: name,
      community: dom.contactForm.elements.community.value.trim(),
      role: dom.contactForm.elements.role.value.trim(),
      phone: combinePhone(dom.contactPhoneCode.value, dom.contactForm.elements.phone_number.value),
      email: dom.contactForm.elements.email.value.trim(),
      status: dom.contactForm.elements.status.value,
      notes: dom.contactForm.elements.notes.value.trim(),
      updated_at: new Date().toISOString()
    };

    if (state.editor) {
      const res = await state.client.from(TABLE).update(payload).eq('id', state.editor).select().single();
      if (res.error) { showError(dom.contactError, 'No se pudo guardar — revisa tu conexión.'); return; }
      state.contacts = state.contacts.map(function (c) { return c.id === state.editor ? res.data : c; });
      toast('Líder actualizado.', 'success');
    } else {
      const res = await state.client.from(TABLE).insert(payload).select().single();
      if (res.error) { showError(dom.contactError, 'No se pudo guardar — revisa tu conexión.'); return; }
      state.contacts = state.contacts.concat(res.data);
      toast('Líder agregado.', 'success');
    }
    populateCommunityFilter();
    renderContacts();
    renderStatusBoard();
    closeContactDialog();
  }

  async function archiveContact(contact) {
    if (!contact) return;
    const id = contact.id;
    const res = await state.client.from(TABLE).update({ archived_at: new Date().toISOString() }).eq('id', id);
    if (res.error) { toast('No se pudo archivar — revisa tu conexión.', 'error'); return; }
    state.contacts = state.contacts.filter(function (c) { return c.id !== id; });
    populateCommunityFilter();
    renderContacts();
    renderStatusBoard();
    toast('Líder archivado.', 'success');
  }

  async function archiveEditingContact() {
    const contact = findById(state.contacts, state.editor);
    await archiveContact(contact);
    closeContactDialog();
  }

  // ---------- Utilidades ----------

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

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part[0]; }).join('').toUpperCase();
  }

  function emptyState(title, copy, action) {
    return '<div class="empty-state"><strong>' + safe(title) + '</strong><span>' + safe(copy) + '</span>' + (action || '') + '</div>';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
