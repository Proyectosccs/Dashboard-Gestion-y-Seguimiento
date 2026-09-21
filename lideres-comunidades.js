(function () {
  'use strict';

  // Mismo proyecto de Supabase que el resto del sitio, pero tabla propia
  // (lideres_contacts) — sin datos sensibles que enmascarar, lectura y
  // escritura anónima abierta (mismo modelo de seguridad que Dra Florangel).
  const SUPABASE_URL = 'https://hcylkagvwfncdaaizutn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';
  const TABLE = 'lideres_contacts';

  // Mismo set de estados que el tablero de seguimiento del directorio UCV.
  const STATUSES = [
    { key: 'pending', label: 'Pendiente', emoji: '○', color: '#82796a' },
    { key: 'contacted', label: 'Contactado', emoji: '📞', color: '#4a7fd4' },
    { key: 'following', label: 'En seguimiento', emoji: '↻', color: '#2fa89b' },
    { key: 'waiting_response', label: 'Esperando respuesta', emoji: '◷', color: '#c67139' },
    { key: 'executed', label: 'Ejecutado', emoji: '✓', color: '#4f8f68' },
    { key: 'blocked', label: 'Bloqueado', emoji: '⛔', color: '#a02525' }
  ];
  const STATUS_MAP = {};
  STATUSES.forEach(function (s) { STATUS_MAP[s.key] = s; });

  // Paleta cíclica para colorear cada comunidad de forma estable (mismo
  // nombre siempre cae en el mismo color) sin depender de un catálogo fijo,
  // ya que "community" es texto libre que el equipo escribe manualmente.
  const COMMUNITY_PALETTE = ['#15803d', '#0369a1', '#c67139', '#7c3aed', '#be185d', '#0f766e', '#a16207', '#4338ca', '#b91c1c', '#0e7490'];

  const state = {
    client: null,
    view: 'contacts',
    contacts: [],
    query: '',
    editor: null,
    dragId: null
  };

  const dom = {};

  window.lideresAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
    if (target.dataset.view) return setView(target.dataset.view);
    if (target.dataset.action === 'move-status') return moveStatus(target.dataset.id, target.dataset.status);
    if (target.dataset.action) return handleAction(target.dataset.action, target.dataset.id);
    const actionsById = {
      'retry-load': function () { loadContacts(false); },
      'contact-search-clear': clearSearch,
      'contact-dialog-close': closeContactDialog,
      'contact-dialog-cancel': closeContactDialog,
      'contact-archive': archiveEditingContact
    };
    const action = actionsById[target.id];
    if (action) action();
  };

  function handleAction(action, id) {
    if (action === 'new-contact') openContactDialog();
    if (action === 'edit-contact') openContactDialog(findById(state.contacts, id));
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
    dom.statusBoard = document.getElementById('status-board');
    dom.contactSearch = document.getElementById('contact-search');
    dom.contactSearchClear = document.getElementById('contact-search-clear');
    dom.contactResultCount = document.getElementById('contact-result-count');
    dom.contactDialog = document.getElementById('contact-dialog');
    dom.contactForm = document.getElementById('contact-form');
    dom.contactDialogTitle = document.getElementById('contact-dialog-title');
    dom.contactError = document.getElementById('contact-error');
    dom.contactArchive = document.getElementById('contact-archive');
    dom.communitySuggestions = document.getElementById('community-suggestions');
    dom.statusSelect = document.getElementById('field-contact-status');
  }

  function bindStaticEvents() {
    dom.contactForm.addEventListener('submit', onContactSubmit);
    dom.contactDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeContactDialog(); });
    dom.contactSearch.addEventListener('input', function () {
      state.query = dom.contactSearch.value;
      renderContacts();
    });
  }

  function populateStatusSelect() {
    renderMarkup(dom.statusSelect, STATUSES.map(function (s) {
      return '<option value="' + safe(s.key) + '">' + safe(s.emoji + ' ' + s.label) + '</option>';
    }).join(''));
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
    renderContacts();
    renderStatusBoard();
    setView(state.view);
  }

  function subscribeRealtime() {
    if (!state.client) return;
    state.client.channel('lideres-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function () { loadContacts(false); })
      .subscribe();
  }

  // ---------- Contactos agrupados por comunidad ----------

  function matchesQuery(contact, query) {
    if (!query) return true;
    return normalize([contact.name, contact.role, contact.community].join(' ')).includes(query);
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

  function groupByCommunity(contacts) {
    const groups = new Map();
    contacts.forEach(function (contact) {
      const label = communityLabel(contact.community);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(contact);
    });
    const unassigned = 'Sin comunidad asignada';
    return Array.from(groups.keys())
      .sort(function (a, b) {
        if (a === unassigned) return 1;
        if (b === unassigned) return -1;
        return a.localeCompare(b, 'es');
      })
      .map(function (label) { return { label: label, items: groups.get(label) }; });
  }

  function renderContacts() {
    const query = normalize(state.query);
    const filtered = state.contacts.filter(function (contact) { return matchesQuery(contact, query); });
    dom.contactResultCount.textContent = filtered.length + ' de ' + state.contacts.length + ' líderes';
    dom.contactSearchClear.hidden = !state.query;

    if (!filtered.length) {
      renderMarkup(dom.contactsGroups, emptyState(
        state.contacts.length ? '🔎 Sin coincidencias' : '🧑‍🤝‍🧑 Directorio vacío',
        state.contacts.length ? 'Prueba otra búsqueda o limpia el filtro.' : 'Agrega los líderes comunitarios y su comunidad.',
        state.contacts.length ? '<button class="btn btn-secondary" type="button" id="empty-clear-search">Limpiar búsqueda</button>' : ''
      ));
      const clear = document.getElementById('empty-clear-search');
      if (clear) clear.addEventListener('click', clearSearch);
      return;
    }

    const groups = groupByCommunity(filtered);
    renderMarkup(dom.contactsGroups, groups.map(function (group) {
      const color = communityColor(group.label === 'Sin comunidad asignada' ? '' : group.label);
      return '<section class="community-section">' +
        '<div class="community-section-head">' +
          '<span class="community-dot" style="--community-color:' + safe(color) + '"></span>' +
          '<h3>' + safe(group.label) + '</h3>' +
          '<span class="community-count">' + group.items.length + '</span>' +
        '</div>' +
        '<div class="contact-grid">' + group.items.map(function (c) { return renderContactCard(c, color); }).join('') + '</div>' +
      '</section>';
    }).join(''));
  }

  function renderContactCard(contact, color) {
    const status = STATUS_MAP[contact.status] || STATUSES[0];
    const phone = contact.phone
      ? '<a href="tel:' + safe(contact.phone) + '">' + safe(contact.phone) + '</a>'
      : 'Por confirmar';
    const email = contact.email
      ? '<a href="mailto:' + safe(contact.email) + '">' + safe(contact.email) + '</a>'
      : 'Por confirmar';
    return '<article class="contact-card" style="--affiliation-color:' + safe(color) + '">' +
      '<div class="contact-card-header"><div class="contact-avatar" aria-hidden="true">' + safe(initials(contact.name)) + '</div><div><h3>' + safe(contact.name) + '</h3><div class="contact-role">' + safe(contact.role || 'Líder comunitario') + '</div></div></div>' +
      '<div class="contact-chips">' +
        '<span class="affiliation-chip">📍 ' + safe(communityLabel(contact.community)) + '</span>' +
        '<span class="status-pill" style="--status-color:' + safe(status.color) + '">' + safe(status.emoji + ' ' + status.label) + '</span>' +
      '</div>' +
      '<div class="contact-details">' +
        detailRow('◉ Teléfono', phone) +
        detailRow('✉ Correo', email) +
        detailRow('↳ Notas', safe(contact.notes || 'Por confirmar')) +
      '</div>' +
      '<div class="contact-card-actions">' +
        '<button class="btn btn-secondary" type="button" data-action="edit-contact" data-id="' + safe(contact.id) + '" onclick="window.lideresAction(event)">Editar</button>' +
      '</div>' +
    '</article>';
  }

  function detailRow(label, value) {
    return '<div class="detail-row"><span class="detail-label">' + safe(label) + '</span><span class="detail-value">' + value + '</span></div>';
  }

  function clearSearch() {
    state.query = '';
    dom.contactSearch.value = '';
    renderContacts();
  }

  // ---------- Tablero operativo (estado de seguimiento) ----------

  function renderStatusBoard() {
    renderMarkup(dom.statusBoard, STATUSES.map(function (status) {
      const items = state.contacts.filter(function (c) { return (c.status || 'pending') === status.key; });
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
    dom.contactForm.elements.phone.value = contact ? (contact.phone || '') : '';
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
      phone: dom.contactForm.elements.phone.value.trim(),
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
    renderContacts();
    renderStatusBoard();
    closeContactDialog();
  }

  async function archiveEditingContact() {
    if (!state.editor) return;
    const id = state.editor;
    const res = await state.client.from(TABLE).update({ archived_at: new Date().toISOString() }).eq('id', id);
    if (res.error) { toast('No se pudo archivar — revisa tu conexión.', 'error'); return; }
    state.contacts = state.contacts.filter(function (c) { return c.id !== id; });
    renderContacts();
    renderStatusBoard();
    closeContactDialog();
    toast('Líder archivado.', 'success');
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
