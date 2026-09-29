(function () {
  'use strict';

  // Calendario de solo lectura que une tres fuentes independientes — nunca
  // escribe en ninguna de las tres, solo lee y muestra junto.
  const SUPABASE_URL = 'https://hcylkagvwfncdaaizutn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';
  const COALICION_EDITOR_URL = SUPABASE_URL + '/functions/v1/coalicion-editor';

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const SOURCE_LABELS = { coalicion: 'Coalición Venezuela', florangel: 'Dra Florangel', ucv: 'UCV', cmdlt: 'Centro Médico Docente de La Trinidad', networking: 'Fundación Ingenia', otros: 'Otros' };
  // Deben coincidir exactamente con --source-<clave> en
  // calendario-fundacion-ingenia.css (ahí pinta la leyenda y los eventos;
  // aquí solo se usa para la tarjeta de cada organización en "Organizaciones").
  const FIXED_SOURCE_COLOR = { coalicion: '#1d4ed8', florangel: '#be185d', ucv: '#166534', cmdlt: '#b45309', networking: '#7c3aed', otros: '#57534e' };
  const FIXED_SOURCE_EMOJI = { coalicion: '🤝', florangel: '🩺', ucv: '🎓', cmdlt: '🏥', networking: '🌐', otros: '📌' };

  // Calendarios creados al vuelo desde "Otra organización o calendario":
  // el registro (nombre + color) vive en ingenia_board_state bajo esta
  // clave; cada uno guarda sus eventos en su propia clave
  // 'ingenia-custom-<id>-events-v1', mismo patrón que networking/otros.
  const CUSTOM_CALENDARS_KEY = 'ingenia-custom-calendars-v1';
  // Ningún color aquí debe repetir ni acercarse demasiado a los de
  // FIXED_SOURCE_COLOR — de lo contrario una organización creada al vuelo
  // se confunde visualmente con una de las organizaciones fijas (pasó con
  // "#7c3aed" = Networking, "#be185d" = Dra Florangel, y con el verde de
  // UCV — por eso no hay ningún verde en esta paleta).
  const CUSTOM_PALETTE = ['#dc2626', '#0891b2', '#eab308', '#a21caf', '#9f1239', '#78350f', '#1e40af', '#701a75', '#164e63', '#4c0519'];
  const NEW_CALENDAR_VALUE = '__new__';

  // Campos compartidos del formulario de eventos, iguales en todos los
  // calendarios (Networking, Organización, Dra Florangel, CMDLT, Coalición).
  const EVENT_STATUS = { planned: 'Planificado', confirmed: 'Confirmado', in_progress: 'En Ejecución', completed: 'Completado', cancelled: 'Cancelada' };
  const JORNADA_TYPES = { insumos: 'Insumos', medica: 'Médica' };
  const MEDICAL_SPECIALTIES = [
    'Medicina General', 'Medicina Interna', 'Pediatría', 'Ginecología y Obstetricia',
    'Cardiología', 'Dermatología', 'Oftalmología', 'Otorrinolaringología', 'Psiquiatría',
    'Psicología', 'Nutrición y Dietética', 'Odontología', 'Fisioterapia', 'Endocrinología',
    'Urología', 'Traumatología', 'Gastroenterología', 'Neurología'
  ];
  const OTHER_SPECIALTY_VALUE = '__otros__';
  // UCV ya usa sus propios valores de "status" (planned/confirmed/executing/closed)
  // en sus jornadas — se traduce en ambas direcciones para que el Estado
  // compartido no le pise su propio esquema.
  const SHARED_STATUS_TO_UCV = { planned: 'planned', confirmed: 'confirmed', in_progress: 'executing', completed: 'closed', cancelled: 'cancelled' };
  const UCV_STATUS_TO_SHARED = { planned: 'planned', confirmed: 'confirmed', executing: 'in_progress', closed: 'completed', cancelled: 'cancelled' };

  // Organizaciones "reales" (con tablero propio o no) que se pueden elegir
  // al crear una tarea o al listarlas en la pestaña Organizaciones. "otros"
  // queda fuera a propósito — es el cajón genérico legado, ya no se ofrece
  // para datos nuevos, solo se sigue mostrando si ya hay eventos viejos ahí.
  const REAL_ORGS = ['coalicion', 'florangel', 'ucv', 'cmdlt', 'networking'];
  // Código de país + número, en vez de un solo campo de texto libre — así
  // todos los teléfonos quedan en el mismo formato ("+58" + dígitos, sin
  // espacios) sin importar quién los cargue. Mismo catálogo copiado en
  // cada dashboard del sitio (organizacion.js, dra-florangel.js, cmdlt.js,
  // lideres-comunidades.js, evento-coalicion-venezuela.js — y su
  // equivalente en Directorio y Agenda Relaciones UCV.dc.html).
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

  // Separa un teléfono ya guardado ("+584141234567", pero también formatos
  // viejos sin "+" o con "Por confirmar") en código + número, para
  // precargar el selector al editar un contacto existente. Compara contra
  // el catálogo de códigos empezando por los más largos (p. ej. "+593"
  // antes que "+58") para no confundir prefijos que se solapan.
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
  // dashboards con contactos. UCV es la excepción: su propio "status" es
  // texto libre y se traduce a este catálogo solo para filtrar/mostrar acá
  // (ver loadAll), sin tocar su campo original.
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
    const info = sourceInfo(c.source);
    if (info && info.label) lines.push('ORG:' + info.label);
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

  // Organizaciones cuyos contactos se pueden agregar/editar desde este
  // tablero. "networking" = Fundación Ingenia (equipo propio, sin
  // dashboard dedicado) — sus contactos se guardan en
  // 'ingenia-networking-contacts-v1' e incluyen la subdivisión interna
  // (ver NETWORKING_SUBDIVISIONS).
  const CONTACT_ORGS = ['coalicion', 'florangel', 'cmdlt', 'ucv', 'networking'];
  // Subdivisión interna de un contacto de Fundación Ingenia.
  const NETWORKING_SUBDIVISIONS = ['Voluntario', 'Taller y fabricación', 'Logística', 'Protección civil', 'Driver', 'Bomberos'];
  // Coalición exige esta afiliación exacta (coalicion_update_contact_public
  // la valida en el servidor) — son las únicas 4 opciones válidas.
  const COALICION_AFFILIATIONS = ['Coalicion con amor a Venezuela', 'Fundacion Ingenia', 'Voluntariado AVAA', 'Voluntario Particular'];
  // UCV usa "Rol" como catálogo fijo (no texto libre) — copiado de ROLE en
  // Directorio y Agenda Relaciones UCV.dc.html; si ese catálogo cambia allá,
  // hay que actualizarlo acá también.
  const UCV_ROLES = [
    { id: 'Coordinador', label: '🧭 Coordinador' },
    { id: 'Enlace', label: '🔗 Enlace' },
    { id: 'Profesional del Área', label: '🩺 Profesional del Área' },
    { id: 'Estudiante', label: '🎓 Estudiante' },
    { id: 'Por confirmar', label: '❔ Rol por confirmar' }
  ];
  // Lista plana de unidades administrativas (ADMIN) + escuelas por facultad
  // (FACULTIES), copiada de unitOptionsList() en el mismo archivo de UCV —
  // un contacto de UCV siempre pertenece a una de estas unidades.
  const UCV_UNITS = [
    { id: 'vac', label: '🎓 Vicerrectorado Académico' },
    { id: 'sc', label: '🤝 Servicios Comunitarios · bajo Vicerrectorado' },
    { id: 'op', label: '🧩 Coordinación operativa UCV' },
    { id: 'vad', label: '💼 Vicerrectorado Administrativo' },
    { id: 'sg', label: '🗂️ Secretaría General' },
    { id: 'sp-mg', label: 'Facultad de Medicina · Medicina general' },
    { id: 'sp-mi', label: 'Facultad de Medicina · Medicina interna' },
    { id: 'sp-ped', label: 'Facultad de Medicina · Pediatría' },
    { id: 'sp-tra', label: 'Facultad de Medicina · Traumatología' },
    { id: 'sp-psi', label: 'Facultad de Medicina · Psiquiatría' },
    { id: 'sp-oto', label: 'Facultad de Medicina · Otorrinolaringología' },
    { id: 'sp-neu', label: 'Facultad de Medicina · Neurología' },
    { id: 'sp-gas', label: 'Facultad de Medicina · Gastroenterología' },
    { id: 'sp-car', label: 'Facultad de Medicina · Cardiología' },
    { id: 'sp-gin', label: 'Facultad de Medicina · Ginecología y Obstetricia' },
    { id: 'sp-end', label: 'Facultad de Medicina · Endocrinología' },
    { id: 'sp-der', label: 'Facultad de Medicina · Dermatología' },
    { id: 'sp-oft', label: 'Facultad de Medicina · Oftalmología' },
    { id: 'sp-uro', label: 'Facultad de Medicina · Urología' },
    { id: 'bio', label: 'Facultad de Medicina · Escuela de Bioanálisis' },
    { id: 'nut', label: 'Facultad de Medicina · Escuela de Nutrición y Dietética' },
    { id: 'sal-fis', label: 'Facultad de Medicina · Escuela de Salud Pública · Fisioterapia' },
    { id: 'sal-to', label: 'Facultad de Medicina · Escuela de Salud Pública · Terapia ocupacional' },
    { id: 'enf', label: 'Facultad de Medicina · Escuela de Enfermería' },
    { id: 'odo-e', label: 'Facultad de Odontología · Escuela de Odontología' },
    { id: 'far-e', label: 'Facultad de Farmacia · Escuela de Farmacia' },
    { id: 'psi', label: 'Facultad de Humanidades y Educación · Escuela de Psicología' },
    { id: 'edu', label: 'Facultad de Humanidades y Educación · Escuela de Educación' },
    { id: 'com', label: 'Facultad de Humanidades y Educación · Escuela de Comunicación Social' },
    { id: 'ts', label: 'Facultad de Ciencias Económicas y Sociales · Escuela de Trabajo Social' },
    { id: 'soc', label: 'Facultad de Ciencias Económicas y Sociales · Escuela de Sociología' },
    { id: 'arq-e', label: 'Facultad de Arquitectura y Urbanismo · Escuela de Arquitectura' },
    { id: 'civ', label: 'Facultad de Ingeniería · Escuela de Ingeniería Civil' }
  ];
  const ORG_LINKS = {
    ucv: './Directorio y Agenda Relaciones UCV.dc.html',
    coalicion: './evento-coalicion-venezuela.html',
    florangel: './dra-florangel.html',
    cmdlt: './cmdlt.html'
  };
  // La pestaña Organizaciones no lista "networking": es este mismo
  // dashboard, no una organización externa con tablero propio.
  const ORG_DIRECTORY = ['coalicion', 'florangel', 'ucv', 'cmdlt'];

  const TEAM_TASKS_KEY = 'ingenia-team-tasks-v1';
  const TASK_STATUSES = [
    { key: 'pendiente', label: 'Pendiente', color: '#82796a' },
    { key: 'en_proceso', label: 'En proceso', color: '#0f766e' },
    { key: 'listo', label: 'Listo', color: '#0f7a3d' },
    { key: 'bloqueada', label: 'Bloqueada', color: '#a02525' }
  ];
  // Sub-estado de "en_proceso" — mismo detalle de seguimiento que antes se
  // describía entre paréntesis, ahora como su propio selector.
  const FOLLOWUP_STATUSES = [
    { key: 'contacted', label: 'Contactado' },
    { key: 'in_progress', label: 'En seguimiento' },
    { key: 'waiting_response', label: 'Esperando respuesta' }
  ];
  const PRIORITIES = [
    { key: 'critica', label: 'Crítica' },
    { key: 'alta', label: 'Alta' },
    { key: 'media', label: 'Media' },
    { key: 'baja', label: 'Baja' }
  ];

  // Roster de responsables compartido por TODOS los espacios de tareas del
  // sitio (este tablero, cada página de organización, y Dra Florangel) —
  // vive siempre en ingenia_board_state aunque el dashboard que lo consuma
  // guarde sus tareas en otra tabla.
  const TEAM_MEMBERS_KEY = 'ingenia-team-members-v1';
  const NEW_MEMBER_VALUE = '__new_member__';

  const UI_KEY = 'ingenia-ui-v1';

  // Modo edición: textos y orden personalizables, igual que en el tablero
  // UCV — pero sin los controles de tamaño de burbuja/título, porque este
  // sitio usa una hoja de estilos fija en vez de estilos calculados en JS.
  const DEFAULT_UI = {
    pageTitle: 'Networking Fundación Ingenia',
    pageSubtitle: 'Dashboard de Gestión y Seguimiento del Equipo de Networking de Fundación Ingenia.',
    tasksTitle: 'Tareas de Equipo',
    organizationsTitle: 'Organizaciones',
    leadersTitle: 'Líderes de Comunidades',
    tabOrder: ['resumen', 'calendar', 'reuniones', 'contacts', 'tasks', 'organizations', 'leaders'],
    boardOrder: ['kpis', 'board']
  };
  const NAV_ITEMS = {
    resumen: { emoji: '📊', label: 'Resumen' },
    calendar: { emoji: '🗓️', label: 'Calendario' },
    reuniones: { emoji: '🗒️', label: 'Reuniones' },
    contacts: { emoji: '🤝', label: 'Contactos' },
    tasks: { emoji: '📋', label: 'Tareas de Equipo' },
    organizations: { emoji: '🏢', label: 'Organizaciones' },
    leaders: { emoji: '🧑‍🤝‍🧑', label: 'Líderes de Comunidades' }
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

  const state = {
    client: null,
    view: 'calendar',
    events: [],
    contacts: [],
    contactQuery: '',
    contactOrgFilter: '',
    contactStatusFilter: '',
    editingContact: null,
    viewingContact: null,
    customCalendars: [],
    tasks: [],
    teamMembers: [],
    orgContactsCache: {},
    calendarMonth: new Date().toISOString().slice(0, 7),
    selectedDay: new Date().toISOString().slice(0, 10),
    calendarViewMode: 'month',
    calendarWeekStart: mondayOf(new Date().toISOString().slice(0, 10)),
    calendarYear: new Date().getFullYear(),
    editingEvent: null,
    editingTask: null,
    dragTaskId: null,
    taskOrgFilter: '',
    taskResponsableFilter: '',
    kpiPeriod: 'month',
    kpiOrgFilter: '',
    reunionOrgFilter: '',
    pendientesDraft: [],
    minutaFilesDraft: [],
    minutaFileUploading: false,
    editingResponsableId: null,
    ui: cloneUI(DEFAULT_UI),
    customizeForm: cloneUI(DEFAULT_UI)
  };

  const dom = {};

  window.ingeniaAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
    if (target.dataset.view) return setView(target.dataset.view);
    if (target.dataset.calendarView) return setCalendarViewMode(target.dataset.calendarView);
    if (target.dataset.kpiPeriod) return setKpiPeriod(target.dataset.kpiPeriod);
    const actionsById = {
      'retry-load': loadAll,
      'calendar-prev': function () { changePeriod(-1); },
      'calendar-next': function () { changePeriod(1); },
      'calendar-today': function () {
        const todayIso = new Date().toISOString().slice(0, 10);
        state.calendarMonth = todayIso.slice(0, 7);
        state.selectedDay = todayIso;
        state.calendarWeekStart = mondayOf(todayIso);
        state.calendarYear = new Date().getFullYear();
        renderCalendar();
      },
      'new-event-btn': openEventDialog,
      'new-reunion-btn': function () { openEventDialog(null, { presetJornadaType: 'reunion' }); },
      'event-dialog-close': closeEventDialog,
      'event-dialog-cancel': closeEventDialog,
      'event-delete': deleteEditingEvent,
      'field-event-jornada-type': onJornadaTypeChange,
      'field-event-specialty-other': onSpecialtyOtherChange,
      'event-pendiente-add': addPendiente,
      'new-contact-btn': openContactDialog,
      'contact-dialog-close': closeContactDialog,
      'contact-dialog-cancel': closeContactDialog,
      'contact-delete': deleteEditingContact,
      'contact-search-clear': clearContactSearch,
      'field-contact-org': onContactOrgChange,
      'contact-detail-close': closeContactDetail,
      'contact-detail-edit': editFromContactDetail,
      'contact-detail-delete': deleteFromContactDetail,
      'contact-detail-vcard': function () { downloadVCard(state.viewingContact); },
      'new-task-btn': openTaskDialog,
      'task-dialog-close': closeTaskDialog,
      'task-dialog-cancel': closeTaskDialog,
      'task-delete': deleteEditingTask,
      'tasks-filter-clear': function () {
        state.taskOrgFilter = '';
        state.taskResponsableFilter = '';
        dom.tasksOrgFilter.value = '';
        dom.tasksResponsableFilter.value = '';
        refreshTaskBoards();
      },
      'new-org-btn': openOrgDialog,
      'org-dialog-close': closeOrgDialog,
      'org-dialog-cancel': closeOrgDialog,
      'new-responsable-btn': openResponsablesDialog,
      'responsables-dialog-close': closeResponsablesDialog,
      'responsables-dialog-done': closeResponsablesDialog,
      'responsable-add-only': addResponsableOnly,
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
    if (target.dataset.eventId) {
      openEventDialog(findById(state.events, target.dataset.eventId));
    }
    if (target.dataset.contactId) {
      openContactDialog(findById(state.contacts, target.dataset.contactId));
    }
    if (target.dataset.contactDetailId) {
      openContactDetail(findById(state.contacts, target.dataset.contactDetailId));
    }
    if (target.dataset.taskId) {
      openTaskDialog(findById(state.tasks, target.dataset.taskId));
    }
    if (target.dataset.action === 'move-task-status') {
      moveTaskStatus(target.dataset.id, target.dataset.status);
    }
    if (target.dataset.action === 'delete-responsable-only') {
      deleteResponsableOnly(target.dataset.id);
    }
    if (target.dataset.action === 'edit-responsable-only') {
      startEditResponsable(target.dataset.id);
    }
    if (target.dataset.action === 'save-edit-responsable-only') {
      saveEditResponsable(target.dataset.id);
    }
    if (target.dataset.action === 'cancel-edit-responsable-only') {
      cancelEditResponsable();
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
    dom.contactForm.addEventListener('submit', onContactSubmit);
    dom.contactDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeContactDialog(); });
    dom.contactSearch.addEventListener('input', handleContactSearch);
    dom.contactOrgFilter.addEventListener('change', function () {
      state.contactOrgFilter = dom.contactOrgFilter.value;
      renderContacts();
    });
    populateContactStatusFilter(dom.contactStatusFilter);
    dom.contactStatusFilter.addEventListener('change', function () {
      state.contactStatusFilter = dom.contactStatusFilter.value;
      renderContacts();
    });
    dom.contactDetailDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeContactDetail(); });
    dom.eventMinutaFileInput.addEventListener('change', onMinutaFileSelected);
    renderMarkup(dom.contactSubdivisionSelect, NETWORKING_SUBDIVISIONS.map(function (s) { return '<option value="' + safe(s) + '">' + safe(s) + '</option>'; }).join(''));
    dom.taskForm.addEventListener('submit', onTaskSubmit);
    dom.taskDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeTaskDialog(); });
    dom.tasksOrgFilter.addEventListener('change', function () {
      state.taskOrgFilter = dom.tasksOrgFilter.value;
      refreshTaskBoards();
    });
    dom.tasksResponsableFilter.addEventListener('change', function () {
      state.taskResponsableFilter = dom.tasksResponsableFilter.value;
      refreshTaskBoards();
    });
    dom.resumenOrgFilter.addEventListener('change', function () {
      state.kpiOrgFilter = dom.resumenOrgFilter.value;
      renderResumenView();
    });
    dom.reunionesOrgFilter.addEventListener('change', function () {
      state.reunionOrgFilter = dom.reunionesOrgFilter.value;
      renderReunionesView();
    });
    dom.responsableChecklist.addEventListener('change', onResponsableChecklistChange);
    dom.taskStatusSelect.addEventListener('change', onTaskStatusChange);
    dom.orgForm.addEventListener('submit', onOrgSubmit);
    dom.orgDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeOrgDialog(); });
    dom.customizeForm.addEventListener('submit', onCustomizeSubmit);
    dom.customizeDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeCustomize(); });
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return showConnectionFailure();
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadAll();
  }

  function cacheDom() {
    dom.loadingState = document.getElementById('loading-state');
    dom.connectivityBanner = document.getElementById('connectivity-banner');
    dom.calendarView = document.getElementById('calendar-view');
    dom.sourceLegend = document.getElementById('source-legend');
    dom.calendarViewSwitcher = document.getElementById('calendar-view-switcher');
    dom.calendarToolbar = document.getElementById('calendar-toolbar');
    dom.calendarPeriodNav = document.getElementById('calendar-period-nav');
    dom.calendarPeriodLabel = document.getElementById('calendar-period-label');
    dom.calendarMonthView = document.getElementById('calendar-month-view');
    dom.calendarGrid = document.getElementById('calendar-grid');
    dom.agendaTitle = document.getElementById('agenda-title');
    dom.agendaList = document.getElementById('agenda-list');
    dom.calendarWeekView = document.getElementById('calendar-week-view');
    dom.calendarWeekGrid = document.getElementById('calendar-week-grid');
    dom.calendarYearView = document.getElementById('calendar-year-view');
    dom.calendarYearGrid = document.getElementById('calendar-year-grid');
    dom.calendarAgendaView = document.getElementById('calendar-agenda-view');
    dom.calendarAgendaList = document.getElementById('calendar-agenda-list');
    dom.eventDialog = document.getElementById('event-dialog');
    dom.eventDialogTitle = document.getElementById('event-dialog-title');
    dom.eventForm = document.getElementById('event-form');
    dom.eventError = document.getElementById('event-error');
    dom.eventSourceSelect = document.getElementById('field-event-source');
    dom.eventCollaboratorsList = document.getElementById('event-collaborators-list');
    dom.newCalendarField = document.getElementById('new-calendar-field');
    dom.eventJornadaTypeSelect = document.getElementById('field-event-jornada-type');
    dom.eventSpecialtiesField = document.getElementById('event-specialties-field');
    dom.eventSpecialtiesList = document.getElementById('event-specialties-list');
    dom.eventCustomSpecialtyField = document.getElementById('event-custom-specialty-field');
    dom.eventParticipantsList = document.getElementById('event-participants-list');
    dom.eventDelete = document.getElementById('event-delete');
    dom.tasksBoard = document.getElementById('tasks-board');
    dom.taskDialog = document.getElementById('task-dialog');
    dom.taskDialogTitle = document.getElementById('task-dialog-title');
    dom.taskForm = document.getElementById('task-form');
    dom.taskError = document.getElementById('task-error');
    dom.taskDelete = document.getElementById('task-delete');
    dom.taskOrgSelect = document.getElementById('field-task-org');
    dom.responsableChecklist = document.getElementById('responsable-checklist');
    dom.newResponsableField = document.getElementById('new-responsable-field');
    dom.taskDueDate = document.getElementById('field-task-due-date');
    dom.taskStatusSelect = document.getElementById('field-task-status');
    dom.taskFollowupField = document.getElementById('task-followup-field');
    dom.taskFollowupSelect = document.getElementById('field-task-followup');
    dom.taskPrioritySelect = document.getElementById('field-task-priority');
    dom.taskDetail = document.getElementById('field-task-detail');
    dom.taskNextAction = document.getElementById('field-task-next-action');
    dom.tasksOrgFilter = document.getElementById('tasks-org-filter');
    dom.tasksResponsableFilter = document.getElementById('tasks-responsable-filter');
    dom.tasksKpiGrid = document.getElementById('tasks-kpi-grid');
    dom.responsablesDialog = document.getElementById('responsables-dialog');
    dom.responsablesList = document.getElementById('responsables-list');
    dom.responsablesError = document.getElementById('responsables-error');
    dom.newResponsableOnlyName = document.getElementById('field-new-responsable-only-name');
    dom.organizationsGrid = document.getElementById('organizations-grid');
    dom.orgDialog = document.getElementById('org-dialog');
    dom.orgForm = document.getElementById('org-form');
    dom.orgError = document.getElementById('org-error');
    dom.toastRegion = document.getElementById('toast-region');
    dom.pageTitle = document.getElementById('page-title');
    dom.pageSubtitle = document.getElementById('page-subtitle');
    dom.tabNav = document.getElementById('tab-nav');
    dom.tasksBlocks = document.getElementById('tasks-blocks');
    dom.tasksViewTitle = document.getElementById('tasks-view-title');
    dom.organizationsViewTitle = document.getElementById('organizations-view-title');
    dom.leadersViewTitle = document.getElementById('leaders-view-title');
    dom.customizeDialog = document.getElementById('customize-dialog');
    dom.customizeForm = document.getElementById('customize-form');
    dom.customPageTitle = document.getElementById('field-custom-page-title');
    dom.customSubtitle = document.getElementById('field-custom-subtitle');
    dom.customTasksTitle = document.getElementById('field-custom-tasks-title');
    dom.customOrganizationsTitle = document.getElementById('field-custom-organizations-title');
    dom.customLeadersTitle = document.getElementById('field-custom-leaders-title');
    dom.customizeTabsList = document.getElementById('customize-tabs-list');
    dom.customizeSectionsList = document.getElementById('customize-sections-list');
    dom.kpiStrip = document.getElementById('kpi-strip');
    dom.kpiStripJornadas = document.getElementById('kpi-strip-jornadas');
    dom.kpiStripParticipacion = document.getElementById('kpi-strip-participacion');
    dom.kpiStripCanceladas = document.getElementById('kpi-strip-canceladas');
    dom.resumenOrgFilter = document.getElementById('resumen-org-filter');
    dom.resumenKpiGrid = document.getElementById('resumen-kpi-grid');
    dom.resumenOrgBreakdown = document.getElementById('resumen-org-breakdown');
    dom.resumenUpcoming = document.getElementById('resumen-upcoming');
    dom.eventMeetingField = document.getElementById('event-meeting-field');
    dom.eventPendientesList = document.getElementById('event-pendientes-list');
    dom.eventMinutaFilesList = document.getElementById('event-minuta-files-list');
    dom.eventMinutaFileInput = document.getElementById('event-minuta-file-input');
    dom.eventMinutaFileStatus = document.getElementById('event-minuta-file-status');
    dom.reunionesOrgFilter = document.getElementById('reuniones-org-filter');
    dom.reunionesList = document.getElementById('reuniones-list');
    dom.contactSearch = document.getElementById('contact-search');
    dom.contactSearchClear = document.getElementById('contact-search-clear');
    dom.contactOrgFilter = document.getElementById('contact-org-filter');
    dom.contactResultCount = document.getElementById('contact-result-count');
    dom.contactsList = document.getElementById('contacts-list');
    dom.contactDialog = document.getElementById('contact-dialog');
    dom.contactDialogTitle = document.getElementById('contact-dialog-title');
    dom.contactForm = document.getElementById('contact-form');
    dom.contactError = document.getElementById('contact-error');
    dom.contactPhoneCode = document.getElementById('field-contact-phone-code');
    dom.contactOrgSelect = document.getElementById('field-contact-org');
    dom.contactCoalicionFields = document.getElementById('contact-coalicion-fields');
    dom.contactUcvFields = document.getElementById('contact-ucv-fields');
    dom.contactNetworkingFields = document.getElementById('contact-networking-fields');
    dom.contactSubdivisionSelect = document.getElementById('field-contact-subdivision');
    dom.contactUcvRoleSelect = document.getElementById('field-contact-ucv-role');
    dom.contactUnitSelect = document.getElementById('field-contact-unit');
    dom.contactRoleField = document.getElementById('contact-role-field');
    dom.contactNotesField = document.getElementById('contact-notes-field');
    dom.contactStatusField = document.getElementById('contact-status-field');
    dom.contactStatusSelect = document.getElementById('field-contact-status');
    dom.contactStatusFilter = document.getElementById('contact-status-filter');
    dom.contactDelete = document.getElementById('contact-delete');
    dom.contactDetailDialog = document.getElementById('contact-detail-dialog');
    dom.contactDetailTitle = document.getElementById('contact-detail-title');
    dom.contactDetailBody = document.getElementById('contact-detail-body');
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

  function onSourceChange() {
    const isNew = dom.eventSourceSelect.value === NEW_CALENDAR_VALUE;
    dom.newCalendarField.hidden = !isNew;
    if (isNew) dom.eventForm.elements.new_calendar_name.focus();
    populateCollaboratorsList();
    refreshParticipantsList();
    renderPendientesList();
  }

  async function loadAll() {
    dom.loadingState.hidden = false;
    dom.connectivityBanner.hidden = true;

    const [coalicionRes, coalicionContactsRes, florangelRes, florangelContactsRes, ucvRes, ucvContactsRes, ingeniaRes] = await Promise.all([
      state.client.from('coalicion_events').select('id,title,event_date,start_time,end_time,location,maps_url,notes,status,jornada_type,specialties,collaborating_orgs,participants,participo_fundacion_ingenia,minuta,pendientes').is('archived_at', null),
      state.client.from('coalicion_contacts').select('id,name,role,belongs_to,national_id,phone,email,notes,status').is('archived_at', null),
      state.client.from('florangel_board_state').select('value').eq('key', 'florangel-events-v1').maybeSingle(),
      state.client.from('florangel_board_state').select('value').eq('key', 'florangel-contacts-v1').maybeSingle(),
      state.client.from('ucv_board_state').select('value').eq('key', 'ucv-journeys-v3').maybeSingle(),
      state.client.from('ucv_board_state').select('value').eq('key', 'ucv-contacts-v1').maybeSingle(),
      state.client.from('ingenia_board_state').select('key,value').in('key', ['ingenia-networking-events-v1', 'ingenia-otros-events-v1', 'ingenia-custom-cmdlt-events-v1', 'cmdlt-contacts-v1', 'ingenia-networking-contacts-v1', CUSTOM_CALENDARS_KEY, TEAM_TASKS_KEY, TEAM_MEMBERS_KEY, UI_KEY])
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
    const tasksRaw = ingeniaRowsEarly.find(function (r) { return r.key === TEAM_TASKS_KEY; });
    state.tasks = (Array.isArray(tasksRaw && tasksRaw.value) ? tasksRaw.value : []).map(function (t) {
      return Object.assign({}, t, { responsable: normalizeResponsableList(t.responsable) });
    });
    const membersRaw = ingeniaRowsEarly.find(function (r) { return r.key === TEAM_MEMBERS_KEY; });
    state.teamMembers = Array.isArray(membersRaw && membersRaw.value) ? membersRaw.value : [];
    const uiRaw = ingeniaRowsEarly.find(function (r) { return r.key === UI_KEY; });
    state.ui = cloneUI(uiRaw && uiRaw.value);
    applyUI();

    let customEvents = [];
    let customContacts = [];
    if (state.customCalendars.length) {
      const customEventKeys = state.customCalendars.map(function (c) { return 'ingenia-custom-' + c.id + '-events-v1'; });
      const customContactKeys = state.customCalendars.map(function (c) { return 'ingenia-custom-' + c.id + '-contacts-v1'; });
      const customRes = await state.client.from('ingenia_board_state').select('key,value').in('key', customEventKeys.concat(customContactKeys));
      const customRows = customRes.data || [];
      state.customCalendars.forEach(function (c) {
        const row = customRows.find(function (r) { return r.key === 'ingenia-custom-' + c.id + '-events-v1'; });
        const items = Array.isArray(row && row.value) ? row.value : [];
        items.forEach(function (e) {
          customEvents.push({ id: c.id + '-' + e.id, rawId: e.id, source: c.id, title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e });
        });
        const contactsRow = customRows.find(function (r) { return r.key === 'ingenia-custom-' + c.id + '-contacts-v1'; });
        const contactItems = Array.isArray(contactsRow && contactsRow.value) ? contactsRow.value : [];
        contactItems.forEach(function (contact) {
          customContacts.push({ id: c.id + '-' + contact.id, rawId: contact.id, source: c.id, name: contact.name, role: contact.role, phone: contact.phone, email: contact.email, notes: contact.notes, status: contact.status || 'pending', raw: contact });
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
    const cmdltRaw = ingeniaRowsEarly.find(function (r) { return r.key === 'ingenia-custom-cmdlt-events-v1'; });
    const networkingEvents = (Array.isArray(networkingRaw && networkingRaw.value) ? networkingRaw.value : []).map(function (e) {
      return { id: 'networking-' + e.id, rawId: e.id, source: 'networking', title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e };
    });
    const otrosEvents = (Array.isArray(otrosRaw && otrosRaw.value) ? otrosRaw.value : []).map(function (e) {
      return { id: 'otros-' + e.id, rawId: e.id, source: 'otros', title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e };
    });
    const cmdltEvents = (Array.isArray(cmdltRaw && cmdltRaw.value) ? cmdltRaw.value : []).map(function (e) {
      return { id: 'cmdlt-' + e.id, rawId: e.id, source: 'cmdlt', title: e.title, date: e.event_date, time: e.start_time, location: e.location, notes: e.notes || '', raw: e };
    });

    state.events = coalicionEvents.concat(florangelEvents, ucvEvents, networkingEvents, otrosEvents, cmdltEvents, customEvents).filter(function (e) { return !!e.date; });

    const coalicionContacts = (coalicionContactsRes.data || []).map(function (c) {
      return { id: 'coalicion-' + c.id, rawId: c.id, source: 'coalicion', name: c.name, role: c.role, phone: c.phone, email: c.email, notes: c.notes, status: c.status || 'pending', raw: c };
    });
    const florangelContacts = (Array.isArray(florangelContactsRes.data && florangelContactsRes.data.value) ? florangelContactsRes.data.value : []).map(function (c) {
      return { id: 'florangel-' + c.id, rawId: c.id, source: 'florangel', name: c.name, role: c.role, phone: c.phone, email: c.email, notes: c.notes, status: c.status || 'pending', raw: c };
    });
    const cmdltContactsRaw = ingeniaRowsEarly.find(function (r) { return r.key === 'cmdlt-contacts-v1'; });
    const cmdltContacts = (Array.isArray(cmdltContactsRaw && cmdltContactsRaw.value) ? cmdltContactsRaw.value : []).map(function (c) {
      return { id: 'cmdlt-' + c.id, rawId: c.id, source: 'cmdlt', name: c.name, role: c.role, phone: c.phone, email: c.email, notes: c.notes, status: c.status || 'pending', raw: c };
    });
    const ucvContacts = (Array.isArray(ucvContactsRes.data && ucvContactsRes.data.value) ? ucvContactsRes.data.value : []).map(function (c) {
      // UCV no usa el catálogo pending/contacted — tiene su propio campo de
      // texto libre "status" (más rico, ver Jerarquía/Contactos de UCV). Para
      // el filtro unificado de Networking, se traduce: "Por confirmar" (o
      // vacío) = pendiente, cualquier otro valor ya escrito = contactado.
      return { id: 'ucv-' + c.id, rawId: c.id, source: 'ucv', name: c.name, role: c.role, phone: c.phone, email: c.email, notes: '', status: (c.status && c.status !== 'Por confirmar') ? 'contacted' : 'pending', raw: c };
    });
    const networkingContactsRaw = ingeniaRowsEarly.find(function (r) { return r.key === 'ingenia-networking-contacts-v1'; });
    const networkingContacts = (Array.isArray(networkingContactsRaw && networkingContactsRaw.value) ? networkingContactsRaw.value : []).map(function (c) {
      return { id: 'networking-' + c.id, rawId: c.id, source: 'networking', name: c.name, role: c.role, phone: c.phone, email: c.email, notes: c.notes, status: c.status || 'pending', raw: c };
    });
    state.contacts = coalicionContacts.concat(florangelContacts, cmdltContacts, ucvContacts, networkingContacts, customContacts).filter(function (c) { return !!c.name; });

    dom.loadingState.hidden = true;
    renderLegend();
    populateSourceSelect();
    populateTasksOrgFilter();
    populateTasksResponsableFilter();
    refreshTaskBoards();
    renderOrganizations();
    populateResumenOrgFilter();
    renderKpiStrip();
    renderResumenView();
    populateReunionesOrgFilter();
    renderReunionesView();
    populateContactOrgFilter();
    populateContactOrgSelect();
    renderContacts();
    setView(state.view);
    renderCalendar();
  }

  // ---------- Modo edición ----------

  function applyUI() {
    const ui = state.ui;
    dom.pageTitle.textContent = ui.pageTitle;
    dom.pageSubtitle.textContent = ui.pageSubtitle;
    dom.tasksViewTitle.textContent = ui.tasksTitle;
    dom.organizationsViewTitle.textContent = ui.organizationsTitle;
    dom.leadersViewTitle.textContent = ui.leadersTitle;
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
    dom.customOrganizationsTitle.value = state.customizeForm.organizationsTitle;
    dom.customLeadersTitle.value = state.customizeForm.leadersTitle;
    renderCustomizeLists();
    dom.customizeDialog.showModal();
  }

  function closeCustomize() { dom.customizeDialog.close(); }

  function resetCustomize() {
    state.customizeForm = cloneUI(DEFAULT_UI);
    dom.customPageTitle.value = state.customizeForm.pageTitle;
    dom.customSubtitle.value = state.customizeForm.pageSubtitle;
    dom.customTasksTitle.value = state.customizeForm.tasksTitle;
    dom.customOrganizationsTitle.value = state.customizeForm.organizationsTitle;
    dom.customLeadersTitle.value = state.customizeForm.leadersTitle;
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
      organizationsTitle: dom.customOrganizationsTitle.value.trim() || DEFAULT_UI.organizationsTitle,
      leadersTitle: dom.customLeadersTitle.value.trim() || DEFAULT_UI.leadersTitle,
      tabOrder: state.customizeForm.tabOrder,
      boardOrder: state.customizeForm.boardOrder
    };
    const ok = await writeBoardKey('ingenia_board_state', UI_KEY, next);
    if (!ok) { toast('No se pudo guardar el diseño — revisa tu conexión.', 'error'); return; }
    state.ui = cloneUI(next);
    applyUI();
    closeCustomize();
    toast('Diseño guardado.', 'success');
  }

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
    return state.events.filter(function (e) { return e.date === iso; })
      .sort(function (a, b) { return (a.time || '99:99').localeCompare(b.time || '99:99'); });
  }

  function renderCalendar() {
    renderLegend();
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
            const cs = sourceClassStyle(e.source);
            const timeLabel = e.time ? formatTime(e.time) : '';
            return '<button type="button" class="calendar-event ' + cs.cls + '" ' + cs.style + ' data-event-id="' + safe(e.id) + '" onclick="window.ingeniaAction(event)" style="white-space:normal;height:auto">' + (timeLabel ? safe(timeLabel) + ' · ' : '') + safe(e.title) + '</button>';
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
        const sources = [];
        dayEvents.forEach(function (e) { if (sources.indexOf(e.source) === -1) sources.push(e.source); });
        days += '<button type="button" class="calendar-year-day' + (iso === today ? ' is-today' : '') + '" data-year-day="' + iso + '" onclick="window.ingeniaAction(event)">' +
          '<span>' + day + '</span>' +
          '<span class="calendar-year-day-dots">' + sources.slice(0, 4).map(function (s) { return sourceDotHtml(s); }).join('') + '</span>' +
        '</button>';
      }
      markup += '<div class="calendar-year-month"><h4 class="calendar-year-month-label">' + MONTHS[m] + '</h4><div class="calendar-year-days">' + days + '</div></div>';
    }
    renderMarkup(dom.calendarYearGrid, markup);
  }

  function renderAgendaView() {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = state.events.filter(function (e) { return e.date >= today; })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.time || '99:99').localeCompare(b.time || '99:99');
      });
    if (!upcoming.length) {
      renderMarkup(dom.calendarAgendaList, '<div class="empty-state"><strong>Sin próximos eventos</strong><span>No hay eventos programados a partir de hoy.</span></div>');
      return;
    }
    const groups = [];
    upcoming.forEach(function (e) {
      let group = groups[groups.length - 1];
      if (!group || group.date !== e.date) { group = { date: e.date, items: [] }; groups.push(group); }
      group.items.push(e);
    });
    renderMarkup(dom.calendarAgendaList, groups.map(function (g) {
      return '<div>' +
        '<h4 class="calendar-agenda-group-label">' + safe(formatDate(g.date)) + '</h4>' +
        '<div class="agenda-list">' + g.items.map(function (e) {
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
        }).join('') + '</div>' +
      '</div>';
    }).join(''));
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
    // "otros" (el cajón genérico legado) no se muestra en la leyenda: la
    // lista debe crecer solo con organizaciones reales conforme se agregan.
    const items = REAL_ORGS.map(function (key) {
      return '<span class="source-legend-item">' + sourceDotHtml(key) + safe(SOURCE_LABELS[key]) + '</span>';
    }).concat(state.customCalendars.map(function (c) {
      return '<span class="source-legend-item">' + sourceDotHtml(c.id) + safe(c.name) + '</span>';
    }));
    renderMarkup(dom.sourceLegend, items.join(''));
  }

  function populateSourceSelect() {
    const current = dom.eventSourceSelect.value;
    // "otros" ya no se ofrece para eventos nuevos, pero si se está editando
    // uno viejo con esa fuente hay que conservar la opción para no perderla.
    const editingSource = state.editingEvent && state.editingEvent.source;
    const fixedKeys = REAL_ORGS.concat(editingSource === 'otros' ? ['otros'] : []);
    const fixedOptions = fixedKeys.map(function (key) {
      return '<option value="' + key + '">' + FIXED_SOURCE_EMOJI[key] + ' ' + safe(SOURCE_LABELS[key]) + '</option>';
    });
    const customOptions = state.customCalendars.map(function (c) {
      return '<option value="' + safe(c.id) + '">🏷️ ' + safe(c.name) + '</option>';
    });
    const newOption = '<option value="' + NEW_CALENDAR_VALUE + '">➕ Otra organización o calendario (crear nueva)</option>';
    renderMarkup(dom.eventSourceSelect, fixedOptions.concat(customOptions, newOption).join(''));
    if (current) dom.eventSourceSelect.value = current;
  }

  function populateOrgSelect(currentOrg) {
    const options = REAL_ORGS.map(function (key) {
      return '<option value="' + key + '">' + FIXED_SOURCE_EMOJI[key] + ' ' + safe(SOURCE_LABELS[key]) + '</option>';
    }).concat(state.customCalendars.map(function (c) {
      return '<option value="' + safe(c.id) + '">🏷️ ' + safe(c.name) + '</option>';
    }));
    renderMarkup(dom.taskOrgSelect, options.join(''));
    if (currentOrg) dom.taskOrgSelect.value = currentOrg;
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

  // ---------- Gestión de responsables (botón dedicado, sin pasar por una tarea) ----------

  function openResponsablesDialog() {
    hideError(dom.responsablesError);
    dom.newResponsableOnlyName.value = '';
    state.editingResponsableId = null;
    renderResponsablesList();
    dom.responsablesDialog.showModal();
  }

  function closeResponsablesDialog() { dom.responsablesDialog.close(); state.editingResponsableId = null; }

  function renderResponsablesList() {
    if (!state.teamMembers.length) {
      renderMarkup(dom.responsablesList, '<div class="responsables-empty">Todavía no hay responsables en el equipo.</div>');
      return;
    }
    renderMarkup(dom.responsablesList, state.teamMembers.map(function (m) {
      if (m.id === state.editingResponsableId) {
        return '<div class="responsable-manage-row responsable-manage-row-editing">' +
          '<input type="text" class="input" id="responsable-edit-input" value="' + safe(m.name) + '" />' +
          '<button type="button" data-action="save-edit-responsable-only" data-id="' + safe(m.id) + '" onclick="window.ingeniaAction(event)" aria-label="Guardar" title="Guardar">✅</button>' +
          '<button type="button" data-action="cancel-edit-responsable-only" onclick="window.ingeniaAction(event)" aria-label="Cancelar" title="Cancelar">✕</button>' +
        '</div>';
      }
      return '<div class="responsable-manage-row"><span>👤 ' + safe(m.name) + '</span>' +
        '<button type="button" data-action="edit-responsable-only" data-id="' + safe(m.id) + '" onclick="window.ingeniaAction(event)" aria-label="Editar a ' + safe(m.name) + '" title="Editar">✏️</button>' +
        '<button type="button" data-action="delete-responsable-only" data-id="' + safe(m.id) + '" onclick="window.ingeniaAction(event)" aria-label="Eliminar a ' + safe(m.name) + '" title="Eliminar">🗑️</button></div>';
    }).join(''));
    if (state.editingResponsableId) {
      const input = document.getElementById('responsable-edit-input');
      if (input) { input.focus(); input.select(); }
    }
  }

  function startEditResponsable(id) {
    state.editingResponsableId = id;
    renderResponsablesList();
  }

  function cancelEditResponsable() {
    state.editingResponsableId = null;
    renderResponsablesList();
  }

  async function saveEditResponsable(id) {
    const input = document.getElementById('responsable-edit-input');
    const name = input ? input.value.trim() : '';
    if (!name) { showError(dom.responsablesError, 'El nombre no puede quedar vacío.'); return; }
    const next = state.teamMembers.map(function (m) { return m.id === id ? Object.assign({}, m, { name: name }) : m; });
    const ok = await writeBoardKey('ingenia_board_state', TEAM_MEMBERS_KEY, next);
    if (!ok) { showError(dom.responsablesError, 'No se pudo guardar — revisa tu conexión.'); return; }
    state.teamMembers = next;
    state.editingResponsableId = null;
    renderResponsablesList();
    populateTasksResponsableFilter();
    refreshTaskBoards();
    toast('Responsable actualizado.', 'success');
  }

  async function addResponsableOnly() {
    hideError(dom.responsablesError);
    const name = dom.newResponsableOnlyName.value.trim();
    if (!name) { showError(dom.responsablesError, 'Escribe el nombre del nuevo responsable.'); return; }
    const created = await createTeamMember(name);
    if (!created) { showError(dom.responsablesError, 'No se pudo guardar — revisa tu conexión.'); return; }
    dom.newResponsableOnlyName.value = '';
    renderResponsablesList();
    populateTasksResponsableFilter();
    toast('Responsable agregado al equipo.', 'success');
  }

  async function deleteResponsableOnly(id) {
    const member = findTeamMember(id);
    if (!member) return;
    const next = state.teamMembers.filter(function (m) { return m.id !== id; });
    const ok = await writeBoardKey('ingenia_board_state', TEAM_MEMBERS_KEY, next);
    if (!ok) { showError(dom.responsablesError, 'No se pudo eliminar — revisa tu conexión.'); return; }
    state.teamMembers = next;
    renderResponsablesList();
    populateTasksResponsableFilter();
    refreshTaskBoards();
    toast('Responsable eliminado del equipo.', 'success');
  }

  async function createTeamMember(name) {
    const entry = { id: uid(), name: name, created_at: new Date().toISOString() };
    const next = state.teamMembers.concat(entry);
    const ok = await writeBoardKey('ingenia_board_state', TEAM_MEMBERS_KEY, next);
    if (!ok) return null;
    state.teamMembers = next;
    return entry;
  }


  // ---------- Agregar evento (a la fuente elegida) ----------

  function readParticipatesIngenia(raw) {
    return raw && (raw.participatesIngenia === true || raw.participo_fundacion_ingenia === true) ? 'si' : 'no';
  }

  // Normaliza los campos nuevos del formulario (Estado, Hora de
  // Finalización, Tipo de Jornada, Especialidades, Organizaciones
  // colaboradoras, Participantes) sin importar la fuente — cada una guarda
  // estos datos con su propia convención de nombres (camelCase para los
  // arreglos JSON, snake_case para las columnas de Coalición), y UCV ya
  // tenía su propio "status" (planned/confirmed/executing/closed/cancelled)
  // que hay que traducir para no pisarlo.
  function readEventExtra(source, raw) {
    raw = raw || {};
    const status = source === 'ucv' ? (UCV_STATUS_TO_SHARED[raw.status] || 'planned') : (raw.status || 'planned');
    const endTime = raw.endTime || raw.end_time || '';
    const jornadaType = raw.jornadaType || raw.jornada_type || '';
    const specialties = Array.isArray(raw.specialties) ? raw.specialties : [];
    const collaboratingOrgs = Array.isArray(raw.collaboratingOrgs) ? raw.collaboratingOrgs : (Array.isArray(raw.collaborating_orgs) ? raw.collaborating_orgs : []);
    const participants = Array.isArray(raw.participants) ? raw.participants : [];
    const minuta = raw.minuta || '';
    const pendientes = Array.isArray(raw.pendientes) ? raw.pendientes : [];
    const minutaFiles = Array.isArray(raw.minuta_files) ? raw.minuta_files : (Array.isArray(raw.minutaFiles) ? raw.minutaFiles : []);
    return { status: status, endTime: endTime, jornadaType: jornadaType, specialties: specialties, collaboratingOrgs: collaboratingOrgs, participants: participants, minuta: minuta, pendientes: pendientes, minutaFiles: minutaFiles };
  }

  // Fuentes que tienen su propia lista de contactos, para ofrecerlos en
  // "Participantes" junto con el roster compartido de Tareas de Equipo.
  // Coalición vive en una tabla real de Postgres; las demás son un arreglo
  // JSON en un board_state genérico.
  const ORG_CONTACTS_BOARD_KEY = { cmdlt: { table: 'ingenia_board_state', key: 'cmdlt-contacts-v1' }, ucv: { table: 'ucv_board_state', key: 'ucv-contacts-v1' } };

  async function loadOrgContacts(source) {
    if (state.orgContactsCache[source]) return state.orgContactsCache[source];
    let contacts = [];
    try {
      if (source === 'coalicion') {
        const res = await state.client.from('coalicion_contacts').select('id,name').is('archived_at', null);
        contacts = (res.data || []).map(function (c) { return { id: c.id, name: c.name }; });
      } else if (ORG_CONTACTS_BOARD_KEY[source]) {
        const cfg = ORG_CONTACTS_BOARD_KEY[source];
        const res = await state.client.from(cfg.table).select('value').eq('key', cfg.key).maybeSingle();
        const list = Array.isArray(res.data && res.data.value) ? res.data.value : [];
        contacts = list.map(function (c) { return { id: c.id, name: c.name }; });
      }
    } catch (_err) { contacts = []; }
    state.orgContactsCache[source] = contacts;
    return contacts;
  }

  function populateParticipantsList(checkedKeys) {
    const previouslyChecked = checkedKeys || Array.from(dom.eventParticipantsList.querySelectorAll('input:checked')).map(function (cb) { return cb.value; });
    const source = dom.eventSourceSelect.value;
    const orgContacts = state.orgContactsCache[source] || [];
    const items = state.teamMembers.map(function (m) {
      const key = 'team:' + m.id;
      const checked = previouslyChecked.indexOf(key) > -1 ? ' checked' : '';
      return '<label class="checkbox-chip"><input type="checkbox" class="event-participant-checkbox" value="' + safe(key) + '"' + checked + '>👤 ' + safe(m.name) + '</label>';
    }).concat(orgContacts.map(function (c) {
      const key = 'contact:' + c.id;
      const checked = previouslyChecked.indexOf(key) > -1 ? ' checked' : '';
      return '<label class="checkbox-chip"><input type="checkbox" class="event-participant-checkbox" value="' + safe(key) + '"' + checked + '>🤝 ' + safe(c.name) + '</label>';
    }));
    renderMarkup(dom.eventParticipantsList, items.length ? items.join('') : '<span style="font-size:12px;color:var(--color-neutral-600)">No hay participantes disponibles todavía.</span>');
  }

  // Recarga la lista de participantes para la organización actualmente
  // elegida — primero con lo que ya haya en caché (para no bloquear la
  // apertura del diálogo), y de nuevo cuando terminen de llegar sus
  // contactos propios (si los tiene).
  function refreshParticipantsList(checkedKeys) {
    populateParticipantsList(checkedKeys);
    const source = dom.eventSourceSelect.value;
    loadOrgContacts(source).then(function () {
      if (dom.eventSourceSelect.value === source) populateParticipantsList(checkedKeys);
    });
  }

  function readParticipants() {
    return Array.from(dom.eventParticipantsList.querySelectorAll('.event-participant-checkbox:checked')).map(function (cb) { return cb.value; });
  }

  function populateCollaboratorsList(checkedIds) {
    const primary = dom.eventSourceSelect.value;
    const previouslyChecked = checkedIds || Array.from(dom.eventCollaboratorsList.querySelectorAll('input:checked')).map(function (cb) { return cb.value; });
    const allOrgs = REAL_ORGS.map(function (key) { return { id: key, label: SOURCE_LABELS[key], emoji: FIXED_SOURCE_EMOJI[key] }; })
      .concat(state.customCalendars.map(function (c) { return { id: c.id, label: c.name, emoji: '🏷️' }; }));
    const options = allOrgs.filter(function (o) { return o.id !== primary; });
    renderMarkup(dom.eventCollaboratorsList, options.map(function (o) {
      const checked = previouslyChecked.indexOf(o.id) > -1 ? ' checked' : '';
      return '<label class="checkbox-chip"><input type="checkbox" class="event-collaborator-checkbox" value="' + safe(o.id) + '"' + checked + '>' + o.emoji + ' ' + safe(o.label) + '</label>';
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
    items.push('<label class="checkbox-chip"><input type="checkbox" id="field-event-specialty-other" class="event-specialty-checkbox" value="' + OTHER_SPECIALTY_VALUE + '"' + (hasCustom ? ' checked' : '') + ' onchange="window.ingeniaAction(event)">Otros</label>');
    renderMarkup(dom.eventSpecialtiesList, items.join(''));
    dom.eventCustomSpecialtyField.hidden = !hasCustom;
    if (checkedList) dom.eventForm.elements.custom_specialties.value = customChecked.join(', ');
  }

  function onJornadaTypeChange() {
    const isMedica = dom.eventJornadaTypeSelect.value === 'medica';
    dom.eventSpecialtiesField.hidden = !isMedica;
    if (isMedica) populateSpecialtiesList();
    dom.eventMeetingField.hidden = dom.eventJornadaTypeSelect.value !== 'reunion';
  }

  function onSpecialtyOtherChange() {
    const other = document.getElementById('field-event-specialty-other');
    dom.eventCustomSpecialtyField.hidden = !(other && other.checked);
  }

  function openEventDialog(existing, options) {
    hideError(dom.eventError);
    dom.eventForm.reset();
    state.editingEvent = existing || null;
    populateSourceSelect();
    dom.newCalendarField.hidden = true;
    dom.eventDialogTitle.textContent = existing ? 'Editar evento' : 'Agregar evento';
    dom.eventDelete.hidden = !existing;
    if (existing) {
      const extra = readEventExtra(existing.source, existing.raw);
      dom.eventForm.elements.source.value = existing.source;
      dom.eventForm.elements.title.value = existing.title || '';
      dom.eventForm.elements.event_date.value = existing.date || '';
      dom.eventForm.elements.start_time.value = existing.time ? existing.time.slice(0, 5) : '';
      dom.eventForm.elements.end_time.value = extra.endTime ? extra.endTime.slice(0, 5) : '';
      dom.eventForm.elements.location.value = existing.location || '';
      dom.eventForm.elements.status.value = extra.status;
      dom.eventForm.elements.notes.value = existing.notes || '';
      dom.eventForm.elements.participates_ingenia.value = readParticipatesIngenia(existing.raw);
      dom.eventForm.elements.jornada_type.value = extra.jornadaType;
      dom.eventSpecialtiesField.hidden = extra.jornadaType !== 'medica';
      if (extra.jornadaType === 'medica') populateSpecialtiesList(extra.specialties); else populateSpecialtiesList([]);
      populateCollaboratorsList(extra.collaboratingOrgs);
      refreshParticipantsList(extra.participants);
      dom.eventForm.elements.minuta.value = extra.minuta;
      dom.eventMeetingField.hidden = extra.jornadaType !== 'reunion';
      state.pendientesDraft = extra.pendientes.map(function (p) { return Object.assign({}, p); });
      renderPendientesList();
      state.minutaFilesDraft = extra.minutaFiles.map(function (f) { return Object.assign({}, f); });
      renderMinutaFilesList();
    } else {
      dom.eventForm.elements.event_date.value = state.selectedDay || new Date().toISOString().slice(0, 10);
      dom.eventForm.elements.participates_ingenia.value = 'no';
      dom.eventForm.elements.status.value = 'planned';
      dom.eventSpecialtiesField.hidden = true;
      populateSpecialtiesList([]);
      populateCollaboratorsList([]);
      refreshParticipantsList([]);
      const presetJornadaType = options && options.presetJornadaType;
      if (presetJornadaType) dom.eventForm.elements.jornada_type.value = presetJornadaType;
      dom.eventMeetingField.hidden = presetJornadaType !== 'reunion';
      state.pendientesDraft = [];
      renderPendientesList();
      state.minutaFilesDraft = [];
      renderMinutaFilesList();
    }
    dom.eventDialog.showModal();
    dom.eventForm.elements.title.focus();
  }

  function closeEventDialog() { dom.eventDialog.close(); state.editingEvent = null; }

  function refreshCalendarsAfterChange(eventDate) {
    if (eventDate) state.selectedDay = eventDate;
    renderCalendar();
  }

  function readSpecialties() {
    const canonical = Array.from(dom.eventSpecialtiesList.querySelectorAll('.event-specialty-checkbox:checked'))
      .map(function (cb) { return cb.value; })
      .filter(function (v) { return v !== OTHER_SPECIALTY_VALUE; });
    const customRaw = dom.eventForm.elements.custom_specialties.value.trim();
    const custom = customRaw ? customRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
    return canonical.concat(custom);
  }

  function readCollaboratingOrgs() {
    return Array.from(dom.eventCollaboratorsList.querySelectorAll('.event-collaborator-checkbox:checked')).map(function (cb) { return cb.value; });
  }

  // Sincroniza el texto de cada fila con el borrador antes de guardar —
  // el texto se lee en vivo del input (ver attachPendientesListeners) para
  // no perder lo escrito si la lista se re-renderiza mientras se edita.
  function readPendientes() {
    return state.pendientesDraft.filter(function (p) { return p.text && p.text.trim(); }).map(function (p) {
      return { id: p.id, text: p.text.trim(), done: !!p.done, taskId: p.taskId || null };
    });
  }

  function renderPendientesList() {
    const source = dom.eventForm.elements.source.value;
    const allowTasks = source && source !== NEW_CALENDAR_VALUE;
    if (!state.pendientesDraft.length) {
      renderMarkup(dom.eventPendientesList, '<p style="font-size:12px;color:var(--color-neutral-600)">Sin pendientes todavía.</p>');
      return;
    }
    renderMarkup(dom.eventPendientesList, state.pendientesDraft.map(function (p) {
      return '<div class="pendiente-row" data-pendiente-id="' + safe(p.id) + '">' +
        '<input type="checkbox" class="pendiente-done" data-id="' + safe(p.id) + '"' + (p.done ? ' checked' : '') + ' aria-label="Resuelto">' +
        '<input type="text" class="input pendiente-text" data-id="' + safe(p.id) + '" value="' + safe(p.text) + '" placeholder="Pendiente o acuerdo…">' +
        (p.taskId ? '<span class="pendiente-task-badge">✅ Tarea creada</span>' : (allowTasks ? '<button type="button" class="pendiente-create-task" data-id="' + safe(p.id) + '">+ Tarea</button>' : '')) +
        '<button type="button" class="pendiente-remove" data-id="' + safe(p.id) + '" aria-label="Eliminar pendiente">🗑️</button>' +
      '</div>';
    }).join(''));
    attachPendientesListeners();
  }

  function attachPendientesListeners() {
    dom.eventPendientesList.querySelectorAll('.pendiente-text').forEach(function (input) {
      input.addEventListener('input', function () {
        const item = state.pendientesDraft.find(function (p) { return p.id === input.dataset.id; });
        if (item) item.text = input.value;
      });
    });
    dom.eventPendientesList.querySelectorAll('.pendiente-done').forEach(function (cb) {
      cb.addEventListener('change', function () {
        const item = state.pendientesDraft.find(function (p) { return p.id === cb.dataset.id; });
        if (item) item.done = cb.checked;
      });
    });
    dom.eventPendientesList.querySelectorAll('.pendiente-create-task').forEach(function (btn) {
      btn.addEventListener('click', function () { createTaskFromPendiente(btn.dataset.id); });
    });
    dom.eventPendientesList.querySelectorAll('.pendiente-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.pendientesDraft = state.pendientesDraft.filter(function (p) { return p.id !== btn.dataset.id; });
        renderPendientesList();
      });
    });
  }

  function addPendiente() {
    state.pendientesDraft.push({ id: uid(), text: '', done: false, taskId: null });
    renderPendientesList();
    const inputs = dom.eventPendientesList.querySelectorAll('.pendiente-text');
    const last = inputs[inputs.length - 1];
    if (last) last.focus();
  }

  const MINUTA_FILES_BUCKET = 'reuniones-archivos';

  function renderMinutaFilesList() {
    if (!state.minutaFilesDraft.length) {
      renderMarkup(dom.eventMinutaFilesList, '<p style="font-size:12px;color:var(--color-neutral-600)">Sin archivos adjuntos todavía.</p>');
      return;
    }
    renderMarkup(dom.eventMinutaFilesList, state.minutaFilesDraft.map(function (f) {
      return '<div class="minuta-file-row" data-file-path="' + safe(f.path) + '">' +
        '<a href="' + safe(f.url) + '" target="_blank" rel="noopener">📎 ' + safe(f.name) + '</a>' +
        '<button type="button" class="minuta-file-remove" data-path="' + safe(f.path) + '" aria-label="Quitar archivo">🗑️</button>' +
      '</div>';
    }).join(''));
    dom.eventMinutaFilesList.querySelectorAll('.minuta-file-remove').forEach(function (btn) {
      btn.addEventListener('click', function () { removeMinutaFile(btn.dataset.path); });
    });
  }

  async function onMinutaFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    state.minutaFileUploading = true;
    dom.eventMinutaFileStatus.textContent = 'Subiendo "' + file.name + '"…';
    dom.eventMinutaFileStatus.hidden = false;
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]+/g, '_');
    const path = 'reuniones/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safeName;
    try {
      const upload = await state.client.storage.from(MINUTA_FILES_BUCKET).upload(path, file, { upsert: false });
      if (upload.error) throw upload.error;
      const publicUrl = state.client.storage.from(MINUTA_FILES_BUCKET).getPublicUrl(path).data.publicUrl;
      state.minutaFilesDraft.push({ name: file.name, path: path, url: publicUrl, size: file.size, uploaded_at: new Date().toISOString() });
      renderMinutaFilesList();
      dom.eventMinutaFileStatus.hidden = true;
    } catch (_err) {
      dom.eventMinutaFileStatus.textContent = 'No se pudo subir el archivo — revisa tu conexión.';
    }
    state.minutaFileUploading = false;
    e.target.value = '';
  }

  async function removeMinutaFile(path) {
    state.minutaFilesDraft = state.minutaFilesDraft.filter(function (f) { return f.path !== path; });
    renderMinutaFilesList();
    try { await state.client.storage.from(MINUTA_FILES_BUCKET).remove([path]); } catch (_err) { /* no crítico */ }
  }

  // Crea una tarea de equipo a partir de un pendiente de la minuta, sin
  // cerrar el diálogo del evento — el pendiente queda enlazado a esa tarea
  // (taskId) para no volver a crearla dos veces.
  async function createTaskFromPendiente(pendienteId) {
    const item = state.pendientesDraft.find(function (p) { return p.id === pendienteId; });
    if (!item) return;
    const textInput = dom.eventPendientesList.querySelector('.pendiente-text[data-id="' + pendienteId + '"]');
    const text = textInput ? textInput.value.trim() : (item.text || '').trim();
    if (!text) { toast('Escribe el pendiente antes de crear la tarea.', 'error'); return; }
    const source = dom.eventForm.elements.source.value;
    if (!source || source === NEW_CALENDAR_VALUE) return;
    const payload = {
      id: uid(), org: source, title: text,
      detail: 'Pendiente de la reunión: ' + (dom.eventForm.elements.title.value.trim() || 'Sin título'),
      status: 'pendiente', followupStatus: '', priority: 'media', responsable: [],
      dueDate: '', nextAction: '', created_at: new Date().toISOString()
    };
    const next = state.tasks.concat(payload);
    const ok = await writeBoardKey('ingenia_board_state', TEAM_TASKS_KEY, next);
    if (!ok) { toast('No se pudo crear la tarea — revisa tu conexión.', 'error'); return; }
    state.tasks = next;
    item.text = text;
    item.taskId = payload.id;
    renderPendientesList();
    refreshTaskBoards();
    toast('Tarea creada.', 'success');
  }

  async function onEventSubmit(e) {
    e.preventDefault();
    hideError(dom.eventError);
    let source = dom.eventForm.elements.source.value;
    const title = dom.eventForm.elements.title.value.trim();
    const eventDate = dom.eventForm.elements.event_date.value;
    const startTime = dom.eventForm.elements.start_time.value;
    const endTime = dom.eventForm.elements.end_time.value;
    const location = dom.eventForm.elements.location.value.trim();
    const status = dom.eventForm.elements.status.value;
    const notes = dom.eventForm.elements.notes.value.trim();
    const participatesIngenia = dom.eventForm.elements.participates_ingenia.value === 'si';
    const jornadaType = dom.eventJornadaTypeSelect.value;
    const specialties = jornadaType === 'medica' ? readSpecialties() : [];
    const collaboratingOrgs = readCollaboratingOrgs();
    const participants = readParticipants();
    const minuta = jornadaType === 'reunion' ? dom.eventForm.elements.minuta.value.trim() : '';
    const pendientes = jornadaType === 'reunion' ? readPendientes() : [];
    const minutaFiles = jornadaType === 'reunion' ? state.minutaFilesDraft : [];
    if (!title || !eventDate) { showError(dom.eventError, 'Nombre del evento y fecha son obligatorios.'); return; }
    if (state.minutaFileUploading) { showError(dom.eventError, 'Espera a que termine de subirse el archivo.'); return; }
    if (source === 'coalicion' && !location) { showError(dom.eventError, 'Coalición Venezuela necesita una ubicación.'); return; }

    let newCalendarName = '';
    if (source === NEW_CALENDAR_VALUE) {
      newCalendarName = dom.eventForm.elements.new_calendar_name.value.trim();
      if (!newCalendarName) { showError(dom.eventError, 'Escribe el nombre del nuevo calendario u organización.'); return; }
    }

    const submitBtn = dom.eventForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    let ok = false;
    const fields = {
      title: title, event_date: eventDate, start_time: startTime, end_time: endTime,
      location: location, status: status, notes: notes,
      participatesIngenia: participatesIngenia, jornadaType: jornadaType, specialties: specialties,
      collaboratingOrgs: collaboratingOrgs, participants: participants, minuta: minuta, pendientes: pendientes,
      minutaFiles: minutaFiles
    };
    let existing = state.editingEvent;

    if (existing && source !== NEW_CALENDAR_VALUE && source !== existing.source) {
      const moved = await deleteEventFromSource(existing);
      if (!moved) { submitBtn.disabled = false; showError(dom.eventError, 'No se pudo mover el evento de organización — revisa tu conexión.'); return; }
      existing = null;
    }

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
    refreshCalendarsAfterChange(eventDate);
  }

  async function deleteEventFromSource(existing) {
    if (existing.source === 'coalicion') return deleteCoalicionEvent(existing);
    if (existing.source === 'florangel') return deleteFromArrayKey('florangel_board_state', 'florangel-events-v1', existing.rawId);
    if (existing.source === 'ucv') return deleteUcvEvent(existing);
    if (existing.source === 'networking') return deleteFromArrayKey('ingenia_board_state', 'ingenia-networking-events-v1', existing.rawId);
    if (existing.source === 'otros') return deleteFromArrayKey('ingenia_board_state', 'ingenia-otros-events-v1', existing.rawId);
    return deleteFromArrayKey('ingenia_board_state', 'ingenia-custom-' + existing.source + '-events-v1', existing.rawId);
  }

  async function deleteEditingEvent() {
    const existing = state.editingEvent;
    if (!existing) return;
    const submitBtn = dom.eventForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const ok = await deleteEventFromSource(existing);
    submitBtn.disabled = false;
    if (!ok) { showError(dom.eventError, 'No se pudo eliminar — revisa tu conexión.'); return; }
    closeEventDialog();
    await loadAll();
    refreshCalendarsAfterChange(null);
  }

  async function deleteFromArrayKey(table, key, rawId) {
    const current = await readBoardKey(table, key, []);
    const next = current.filter(function (item) { return item.id !== rawId; });
    return writeBoardKey(table, key, next);
  }

  async function deleteUcvEvent(existing) {
    const current = await readBoardKey('ucv_board_state', 'ucv-journeys-v3', []);
    const next = current
      .map(function (j) {
        if (j.id !== existing.rawId) return j;
        const dates = (Array.isArray(j.dates) ? j.dates : []).filter(function (d) { return d !== existing.date; });
        return Object.assign({}, j, { dates: dates });
      })
      .filter(function (j) { return j.id !== existing.rawId || j.dates.length > 0; });
    return writeBoardKey('ucv_board_state', 'ucv-journeys-v3', next);
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

  // ---------- Tareas de Equipo (kanban por estado, etiquetadas por organización) ----------

  function renderTasksBoard(orgFilter, targetEl) {
    targetEl = targetEl || dom.tasksBoard;
    const responsableFilter = state.taskResponsableFilter || null;
    renderMarkup(targetEl, TASK_STATUSES.map(function (status) {
      const items = state.tasks.filter(function (t) {
        return (t.status || 'pendiente') === status.key && (!orgFilter || t.org === orgFilter) && (!responsableFilter || t.responsable.indexOf(responsableFilter) > -1);
      });
      return '<div class="kanban-column" data-status="' + status.key + '">' +
        '<div class="kanban-column-head"><h3>' + safe(status.label) + '</h3><span class="kanban-count">' + items.length + '</span></div>' +
        (items.length ? items.map(renderTaskCard).join('') : '<div class="kanban-empty">Sin tareas</div>') +
      '</div>';
    }).join(''));

    targetEl.querySelectorAll('.kanban-card').forEach(function (card) {
      card.addEventListener('dragstart', function () { state.dragTaskId = card.dataset.id; card.classList.add('dragging'); });
      card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
    });
    targetEl.querySelectorAll('.kanban-column').forEach(function (column) {
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

  // Vuelve a pintar el tablero general (respetando el filtro por
  // organización) y, si hay uno abierto, el tablero de esa organización —
  // para que ambos queden sincronizados.
  function refreshTaskBoards() {
    renderTasksBoard(state.taskOrgFilter || null, dom.tasksBoard);
    renderTasksKpis();
  }

  function renderTasksKpis() {
    const orgFilter = state.taskOrgFilter || null;
    const responsableFilter = state.taskResponsableFilter || null;
    const scoped = state.tasks.filter(function (t) {
      return (!orgFilter || t.org === orgFilter) && (!responsableFilter || t.responsable.indexOf(responsableFilter) > -1);
    });
    function count(statusKey) { return scoped.filter(function (t) { return (t.status || 'pendiente') === statusKey; }).length; }
    const cards = [
      { icon: '🧩', value: scoped.length, label: 'Tareas', cls: 'kpi-primary' },
      { icon: '○', value: count('pendiente'), label: 'Pendiente', cls: 'kpi-neutral' },
      { icon: '↻', value: count('en_proceso'), label: 'En proceso', cls: 'kpi-sky' },
      { icon: '✓', value: count('listo'), label: 'Listo', cls: 'kpi-good' },
      { icon: '⛔', value: count('bloqueada'), label: 'Bloqueada', cls: 'kpi-danger' }
    ];
    renderMarkup(dom.tasksKpiGrid, cards.map(function (c) {
      return '<article class="kpi-card ' + c.cls + '"><span class="kpi-icon" aria-hidden="true">' + c.icon + '</span><strong>' + c.value + '</strong><span class="kpi-label">' + safe(c.label) + '</span></article>';
    }).join(''));
  }

  function populateTasksOrgFilter() {
    const current = dom.tasksOrgFilter.value;
    const options = REAL_ORGS.map(function (key) {
      return '<option value="' + key + '">' + FIXED_SOURCE_EMOJI[key] + ' ' + safe(SOURCE_LABELS[key]) + '</option>';
    }).concat(state.customCalendars.map(function (c) {
      return '<option value="' + safe(c.id) + '">🏷️ ' + safe(c.name) + '</option>';
    }));
    renderMarkup(dom.tasksOrgFilter, ['<option value="">Todas las organizaciones</option>'].concat(options).join(''));
    dom.tasksOrgFilter.value = current || '';
    state.taskOrgFilter = dom.tasksOrgFilter.value;
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

  // ---------- Resumen / KPIs ----------

  function periodRange(period) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (period === 'year') return { start: y + '-01-01', end: y + '-12-31' };
    if (period === 'quarter') {
      const qStartMonth = Math.floor(m / 3) * 3;
      const start = new Date(Date.UTC(y, qStartMonth, 1));
      const end = new Date(Date.UTC(y, qStartMonth + 3, 0));
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }
    const start = new Date(Date.UTC(y, m, 1));
    const end = new Date(Date.UTC(y, m + 1, 0));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }

  // Solo cuenta jornadas (insumos/médica) — las reuniones quedan fuera de
  // estos indicadores a propósito, son un tipo de evento distinto.
  function computeJornadaStats(events) {
    const stats = { total: 0, ingenia: 0, insumos: 0, medica: 0, cancelled: 0, collab: 0, specialtiesCount: {}, byOrg: {} };
    events.forEach(function (e) {
      const extra = readEventExtra(e.source, e.raw);
      if (extra.jornadaType !== 'insumos' && extra.jornadaType !== 'medica') return;
      stats.total += 1;
      if (readParticipatesIngenia(e.raw) === 'si') stats.ingenia += 1;
      if (extra.jornadaType === 'insumos') stats.insumos += 1;
      if (extra.jornadaType === 'medica') stats.medica += 1;
      if (extra.status === 'cancelled') stats.cancelled += 1;
      if (extra.collaboratingOrgs.length > 0) stats.collab += 1;
      extra.specialties.forEach(function (s) { stats.specialtiesCount[s] = (stats.specialtiesCount[s] || 0) + 1; });
      stats.byOrg[e.source] = (stats.byOrg[e.source] || 0) + 1;
    });
    return stats;
  }

  // Franja persistente: siempre "este mes", todas las organizaciones —
  // igual sin importar qué filtro tenga abierto la pestaña Resumen.
  function renderKpiStrip() {
    const range = periodRange('month');
    const events = state.events.filter(function (e) { return e.date >= range.start && e.date <= range.end; });
    const stats = computeJornadaStats(events);
    const participacionPct = stats.total ? Math.round((stats.ingenia / stats.total) * 100) : 0;
    const canceladasPct = stats.total ? Math.round((stats.cancelled / stats.total) * 100) : 0;
    dom.kpiStripJornadas.textContent = String(stats.total);
    dom.kpiStripParticipacion.textContent = participacionPct + '%';
    dom.kpiStripCanceladas.textContent = canceladasPct + '%';
    dom.kpiStrip.hidden = false;
  }

  function setKpiPeriod(period) {
    state.kpiPeriod = period;
    document.querySelectorAll('#resumen-period-switcher [data-kpi-period]').forEach(function (btn) {
      if (btn.dataset.kpiPeriod === period) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    renderResumenView();
  }

  function populateResumenOrgFilter() {
    const current = dom.resumenOrgFilter.value;
    const options = REAL_ORGS.map(function (key) {
      return '<option value="' + key + '">' + FIXED_SOURCE_EMOJI[key] + ' ' + safe(SOURCE_LABELS[key]) + '</option>';
    }).concat(state.customCalendars.map(function (c) {
      return '<option value="' + safe(c.id) + '">🏷️ ' + safe(c.name) + '</option>';
    }));
    renderMarkup(dom.resumenOrgFilter, ['<option value="">Todas las organizaciones</option>'].concat(options).join(''));
    const stillExists = current === '' || REAL_ORGS.indexOf(current) > -1 || state.customCalendars.some(function (c) { return c.id === current; });
    dom.resumenOrgFilter.value = stillExists ? current : '';
    state.kpiOrgFilter = dom.resumenOrgFilter.value;
  }

  function renderResumenView() {
    const range = periodRange(state.kpiPeriod);
    const orgFilter = state.kpiOrgFilter || null;
    const events = state.events.filter(function (e) {
      return e.date >= range.start && e.date <= range.end && (!orgFilter || e.source === orgFilter);
    });
    const stats = computeJornadaStats(events);
    const participacionPct = stats.total ? Math.round((stats.ingenia / stats.total) * 100) : 0;
    const canceladasPct = stats.total ? Math.round((stats.cancelled / stats.total) * 100) : 0;
    const insumosPct = stats.total ? Math.round((stats.insumos / stats.total) * 100) : 0;
    const medicaPct = stats.total ? 100 - insumosPct : 0;
    const topSpecialty = Object.keys(stats.specialtiesCount).sort(function (a, b) {
      return stats.specialtiesCount[b] - stats.specialtiesCount[a];
    })[0] || null;

    const simpleCards = [
      { icon: '🗓️', value: stats.total, label: 'Jornadas realizadas', cls: 'kpi-primary' },
      { icon: '🤝', value: participacionPct + '%', label: 'Participación de Ingenia', cls: 'kpi-sky' },
      { icon: '❌', value: canceladasPct + '%', label: 'Tasa de cancelación', cls: stats.cancelled ? 'kpi-danger' : 'kpi-neutral' }
    ];
    let kpiMarkup = simpleCards.map(function (c) {
      return '<article class="kpi-card ' + c.cls + '"><span class="kpi-icon" aria-hidden="true">' + c.icon + '</span><strong>' + c.value + '</strong><span class="kpi-label">' + safe(c.label) + '</span></article>';
    }).join('');
    kpiMarkup += '<article class="kpi-card kpi-neutral">' +
      '<span class="kpi-label">💊 Insumos vs. 🩺 Médica</span>' +
      '<div class="resumen-split-bar"><span style="width:' + insumosPct + '%;background:var(--source-networking)"></span><span style="width:' + medicaPct + '%;background:var(--color-accent-300)"></span></div>' +
      '<span class="kpi-label" style="text-transform:none">Insumos · ' + stats.insumos + ' &nbsp; Médica · ' + stats.medica + '</span>' +
    '</article>';
    kpiMarkup += '<article class="kpi-card kpi-neutral">' +
      '<span class="kpi-icon" aria-hidden="true">🩺</span>' +
      '<strong style="font-size:20px">' + (topSpecialty ? safe(topSpecialty) : 'Sin datos') + '</strong>' +
      '<span class="kpi-label">Especialidad más cubierta</span>' +
      (topSpecialty ? '<span class="kpi-label" style="text-transform:none">' + stats.specialtiesCount[topSpecialty] + ' jornadas médicas</span>' : '') +
    '</article>';
    kpiMarkup += '<article class="kpi-card kpi-primary">' +
      '<span class="kpi-icon" aria-hidden="true">🔗</span>' +
      '<strong>' + stats.collab + '</strong>' +
      '<span class="kpi-label">Jornadas co-organizadas</span>' +
      '<span class="kpi-label" style="text-transform:none">con 2 o más organizaciones</span>' +
    '</article>';
    renderMarkup(dom.resumenKpiGrid, kpiMarkup);

    const orgEntries = Object.keys(stats.byOrg).map(function (key) {
      return { key: key, label: sourceInfo(key).label, color: sourceInfo(key).color, count: stats.byOrg[key] };
    }).sort(function (a, b) { return b.count - a.count; });
    const maxCount = orgEntries.length ? orgEntries[0].count : 0;
    if (!orgEntries.length) {
      renderMarkup(dom.resumenOrgBreakdown, '<div class="empty-state"><strong>Sin datos</strong><span>No hay jornadas registradas en este período.</span></div>');
    } else {
      renderMarkup(dom.resumenOrgBreakdown, orgEntries.map(function (o) {
        const pct = maxCount ? Math.round((o.count / maxCount) * 100) : 0;
        return '<div class="resumen-org-row">' +
          '<span class="resumen-org-name">' + safe(o.label) + '</span>' +
          '<span class="resumen-org-bar-track"><span class="resumen-org-bar-fill" style="width:' + pct + '%;background:' + safe(o.color) + '"></span></span>' +
          '<span class="resumen-org-count">' + o.count + '</span>' +
        '</div>';
      }).join(''));
    }

    const today = new Date().toISOString().slice(0, 10);
    const upcoming = events.filter(function (e) {
      const extra = readEventExtra(e.source, e.raw);
      return e.date >= today && (extra.jornadaType === 'insumos' || extra.jornadaType === 'medica');
    }).sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); }).slice(0, 8);
    if (!upcoming.length) {
      renderMarkup(dom.resumenUpcoming, '<div class="empty-state"><strong>Sin próximas jornadas</strong><span>No hay jornadas de insumos o médicas programadas en este período.</span></div>');
    } else {
      renderMarkup(dom.resumenUpcoming, upcoming.map(function (e) {
        const info = sourceInfo(e.source);
        const cs = sourceClassStyle(e.source);
        const extra = readEventExtra(e.source, e.raw);
        const typeLabel = JORNADA_TYPES[extra.jornadaType] || '';
        return '<button type="button" class="agenda-row" data-event-id="' + safe(e.id) + '" onclick="window.ingeniaAction(event)" style="width:100%;text-align:left;font:inherit;cursor:pointer">' +
          sourceDotHtml(e.source) +
          '<div>' +
            '<p class="agenda-row-title">' + safe(e.title) + (typeLabel ? ' — ' + safe(typeLabel) : '') + '</p>' +
            '<p class="agenda-row-meta">' + safe(formatDate(e.date)) + '</p>' +
            '<span class="agenda-row-source ' + cs.cls + '" ' + cs.style + '>' + safe(info.label) + '</span>' +
          '</div>' +
        '</button>';
      }).join(''));
    }
  }

  // ---------- Reuniones (minutas + pendientes) ----------

  function populateReunionesOrgFilter() {
    const current = dom.reunionesOrgFilter.value;
    const options = REAL_ORGS.map(function (key) {
      return '<option value="' + key + '">' + FIXED_SOURCE_EMOJI[key] + ' ' + safe(SOURCE_LABELS[key]) + '</option>';
    }).concat(state.customCalendars.map(function (c) {
      return '<option value="' + safe(c.id) + '">🏷️ ' + safe(c.name) + '</option>';
    }));
    renderMarkup(dom.reunionesOrgFilter, ['<option value="">Todas las organizaciones</option>'].concat(options).join(''));
    const stillExists = current === '' || REAL_ORGS.indexOf(current) > -1 || state.customCalendars.some(function (c) { return c.id === current; });
    dom.reunionesOrgFilter.value = stillExists ? current : '';
    state.reunionOrgFilter = dom.reunionesOrgFilter.value;
  }

  function reunionCardHtml(e) {
    const extra = readEventExtra(e.source, e.raw);
    const info = sourceInfo(e.source);
    const cs = sourceClassStyle(e.source);
    const pendientesTotal = extra.pendientes.length;
    const pendientesDone = extra.pendientes.filter(function (p) { return p.done; }).length;
    const minutaPreview = extra.minuta ? (extra.minuta.length > 140 ? extra.minuta.slice(0, 140) + '…' : extra.minuta) : '';
    return '<button type="button" class="reunion-card" data-event-id="' + safe(e.id) + '" onclick="window.ingeniaAction(event)">' +
      '<div class="reunion-card-head">' +
        '<span class="agenda-row-source ' + cs.cls + '" ' + cs.style + '>' + safe(info.label) + '</span>' +
        '<span class="reunion-card-date">' + safe(formatDate(e.date)) + '</span>' +
      '</div>' +
      '<p class="reunion-card-title">' + safe(e.title) + '</p>' +
      (minutaPreview ? '<p class="reunion-card-minuta">' + safe(minutaPreview) + '</p>' : '<p class="reunion-card-minuta reunion-card-empty">Sin minuta todavía</p>') +
      (pendientesTotal ? '<span class="reunion-card-pendientes">📋 ' + pendientesDone + '/' + pendientesTotal + ' pendientes resueltos</span>' : '') +
      (extra.minutaFiles.length ? '<span class="reunion-card-pendientes">📎 ' + extra.minutaFiles.length + ' archivo' + (extra.minutaFiles.length > 1 ? 's' : '') + ' adjunto' + (extra.minutaFiles.length > 1 ? 's' : '') + '</span>' : '') +
    '</button>';
  }

  function renderReunionesView() {
    const orgFilter = state.reunionOrgFilter || null;
    const reuniones = state.events.filter(function (e) {
      const extra = readEventExtra(e.source, e.raw);
      return extra.jornadaType === 'reunion' && (!orgFilter || e.source === orgFilter);
    }).sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    if (!reuniones.length) {
      renderMarkup(dom.reunionesList, '<div class="empty-state"><strong>Sin reuniones</strong><span>No hay reuniones registradas todavía — agrega una con el botón de arriba.</span></div>');
      return;
    }
    renderMarkup(dom.reunionesList, reuniones.map(reunionCardHtml).join(''));
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

  function contactOrgOptions() {
    return CONTACT_ORGS.map(function (key) {
      return { id: key, label: SOURCE_LABELS[key], emoji: FIXED_SOURCE_EMOJI[key] };
    }).concat(state.customCalendars.map(function (c) {
      return { id: c.id, label: c.name, emoji: '🏷️' };
    }));
  }

  function populateContactOrgFilter() {
    const current = dom.contactOrgFilter.value;
    const options = contactOrgOptions().map(function (o) {
      return '<option value="' + safe(o.id) + '">' + o.emoji + ' ' + safe(o.label) + '</option>';
    });
    renderMarkup(dom.contactOrgFilter, ['<option value="">Todas las organizaciones</option>'].concat(options).join(''));
    const stillExists = current === '' || contactOrgOptions().some(function (o) { return o.id === current; });
    dom.contactOrgFilter.value = stillExists ? current : '';
    state.contactOrgFilter = dom.contactOrgFilter.value;
  }

  function populateContactOrgSelect() {
    const current = dom.contactOrgSelect.value;
    renderMarkup(dom.contactOrgSelect, contactOrgOptions().map(function (o) {
      return '<option value="' + safe(o.id) + '">' + o.emoji + ' ' + safe(o.label) + '</option>';
    }).join(''));
    if (current) dom.contactOrgSelect.value = current;
  }

  function onContactOrgChange() {
    const org = dom.contactOrgSelect.value;
    dom.contactCoalicionFields.hidden = org !== 'coalicion';
    dom.contactUcvFields.hidden = org !== 'ucv';
    dom.contactRoleField.hidden = org === 'ucv';
    dom.contactNotesField.hidden = org === 'ucv';
    // UCV ya tiene su propio estado (texto libre, rico) en su dashboard —
    // este selector pending/contacted no aplica ahí, para no pisarlo.
    dom.contactStatusField.hidden = org === 'ucv';
    dom.contactNetworkingFields.hidden = org !== 'networking';
  }

  function handleContactSearch(e) {
    state.contactQuery = e.target.value;
    renderContacts();
  }

  function clearContactSearch() {
    state.contactQuery = '';
    dom.contactSearch.value = '';
    renderContacts();
    dom.contactSearch.focus();
  }

  function renderContacts() {
    const query = normalizeText(state.contactQuery);
    const orgFilter = state.contactOrgFilter || null;
    const statusFilter = state.contactStatusFilter || null;
    const contacts = state.contacts.filter(function (c) {
      if (statusFilter && (c.status || 'pending') !== statusFilter) return false;
      return (!orgFilter || c.source === orgFilter) && (!query || normalizeText([c.name, c.role].join(' ')).indexOf(query) > -1);
    });
    dom.contactResultCount.textContent = contacts.length + ' de ' + state.contacts.length + ' contactos';
    dom.contactSearchClear.hidden = !state.contactQuery;
    if (!contacts.length) {
      renderMarkup(dom.contactsList, '<div class="empty-state"><strong>' + safe(state.contacts.length ? '🔎 Sin coincidencias' : '🤝 Directorio vacío') + '</strong><span>' + safe(state.contacts.length ? 'Prueba otra búsqueda o limpia el filtro.' : 'Agrega los contactos de las organizaciones aliadas.') + '</span></div>');
      return;
    }
    renderMarkup(dom.contactsList, contacts.map(function (c) {
      const info = sourceInfo(c.source);
      const phone = c.phone ? safe(c.phone) : 'Por confirmar';
      const email = c.email ? safe(c.email) : 'Por confirmar';
      const status = contactStatusInfo(c);
      return '<article class="contact-card contact-card-compact" style="--affiliation-color:' + safe(info.color) + '" data-contact-detail-id="' + safe(c.id) + '" tabindex="0" role="button" aria-label="Ver detalle de ' + safe(c.name) + '" onclick="window.ingeniaAction(event)">' +
        '<div class="contact-card-header"><div class="contact-avatar" aria-hidden="true">' + safe(initials(c.name)) + '</div><div><h3>' + safe(c.name) + '</h3>' +
          '<div class="contact-chips"><span class="org-tag" style="--source-color:' + safe(info.color) + '">' + safe(info.label) + '</span><span class="contact-status-pill status-' + safe(status.key) + '">' + safe(status.emoji) + ' ' + safe(status.label) + '</span></div>' +
        '</div></div>' +
        '<div class="contact-mini-row">📱 ' + phone + '</div>' +
        '<div class="contact-mini-row">✉ ' + email + '</div>' +
      '</article>';
    }).join(''));
  }

  function openContactDialog(existing) {
    hideError(dom.contactError);
    dom.contactForm.reset();
    state.editingContact = existing || null;
    populateContactOrgSelect();
    renderMarkup(dom.contactUcvRoleSelect, UCV_ROLES.map(function (r) { return '<option value="' + safe(r.id) + '">' + r.label + '</option>'; }).join(''));
    renderMarkup(dom.contactUnitSelect, UCV_UNITS.map(function (u) { return '<option value="' + safe(u.id) + '">' + safe(u.label) + '</option>'; }).join(''));
    dom.contactDialogTitle.textContent = existing ? 'Editar contacto' : 'Agregar contacto';
    dom.contactDelete.hidden = !existing;
    const parsedPhone = splitPhone(existing ? existing.phone : '');
    populatePhoneCodeSelect(dom.contactPhoneCode, parsedPhone.code);
    dom.contactForm.elements.phone_number.value = parsedPhone.number;
    populateContactStatusSelect(dom.contactStatusSelect, existing ? existing.status : '');
    if (existing) {
      dom.contactOrgSelect.value = existing.source;
      dom.contactForm.elements.name.value = existing.name || '';
      dom.contactForm.elements.role.value = existing.role || '';
      dom.contactForm.elements.email.value = existing.email || '';
      dom.contactForm.elements.notes.value = existing.notes || '';
      if (existing.source === 'coalicion') {
        dom.contactForm.elements.belongs_to.value = (existing.raw && existing.raw.belongs_to) || COALICION_AFFILIATIONS[0];
        dom.contactForm.elements.national_id.value = (existing.raw && existing.raw.national_id) || '';
      }
      if (existing.source === 'ucv') {
        dom.contactUcvRoleSelect.value = (existing.raw && existing.raw.role) || UCV_ROLES[0].id;
        dom.contactUnitSelect.value = (existing.raw && existing.raw.unit) || UCV_UNITS[0].id;
      }
      if (existing.source === 'networking') {
        dom.contactSubdivisionSelect.value = (existing.raw && existing.raw.subdivision) || NETWORKING_SUBDIVISIONS[0];
      }
    } else {
      dom.contactSubdivisionSelect.value = NETWORKING_SUBDIVISIONS[0];
    }
    onContactOrgChange();
    dom.contactDialog.showModal();
    dom.contactForm.elements.name.focus();
  }

  function closeContactDialog() { dom.contactDialog.close(); state.editingContact = null; }

  async function onContactSubmit(e) {
    e.preventDefault();
    hideError(dom.contactError);
    const org = dom.contactOrgSelect.value;
    const name = dom.contactForm.elements.name.value.trim();
    if (!name) { showError(dom.contactError, 'El nombre es obligatorio.'); return; }
    const isCoalicion = org === 'coalicion';
    const phone = combinePhone(dom.contactPhoneCode.value, dom.contactForm.elements.phone_number.value);
    if (isCoalicion && !phone) { showError(dom.contactError, 'Coalición requiere un teléfono.'); return; }
    const fields = {
      name: name,
      role: dom.contactForm.elements.role.value.trim(),
      phone: phone,
      email: dom.contactForm.elements.email.value.trim(),
      notes: dom.contactForm.elements.notes.value.trim(),
      status: dom.contactStatusSelect.value || 'pending',
      belongsTo: dom.contactForm.elements.belongs_to.value,
      nationalId: dom.contactForm.elements.national_id.value.trim(),
      ucvRole: dom.contactForm.elements.ucv_role.value,
      unit: dom.contactForm.elements.unit.value,
      subdivision: dom.contactSubdivisionSelect.value
    };
    const existing = state.editingContact;
    if (existing && existing.source === 'coalicion' && org !== 'coalicion') {
      showError(dom.contactError, 'Un contacto de Coalición no se puede mover a otra organización.');
      return;
    }
    const submitBtn = dom.contactForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    let ok = false;
    if (existing && org !== existing.source) {
      const moved = await deleteContactFromSource(existing);
      if (!moved) { submitBtn.disabled = false; showError(dom.contactError, 'No se pudo mover el contacto de organización — revisa tu conexión.'); return; }
      ok = await saveContact(org, fields, null);
    } else {
      ok = await saveContact(org, fields, existing);
    }
    submitBtn.disabled = false;
    if (!ok) { showError(dom.contactError, 'No se pudo guardar — revisa tu conexión e intenta de nuevo.'); return; }
    closeContactDialog();
    await loadAll();
    toast('Contacto guardado.', 'success');
  }

  async function saveContact(org, fields, existing) {
    if (org === 'coalicion') return saveCoalicionContact(fields, existing);
    if (org === 'florangel') return saveIngeniaLikeContact('florangel_board_state', 'florangel-contacts-v1', fields, existing);
    if (org === 'cmdlt') return saveIngeniaLikeContact('ingenia_board_state', 'cmdlt-contacts-v1', fields, existing);
    if (org === 'ucv') return saveUcvContact(fields, existing);
    if (org === 'networking') return saveIngeniaLikeContact('ingenia_board_state', 'ingenia-networking-contacts-v1', fields, existing);
    return saveIngeniaLikeContact('ingenia_board_state', 'ingenia-custom-' + org + '-contacts-v1', fields, existing);
  }

  // UCV guarda mucho más que lo que este diálogo genérico edita (unit,
  // extraUnits, status, action, function) — se preserva todo lo que ya
  // tenía el contacto y solo se tocan los campos que sí ofrece este
  // formulario, igual que saveUcvEvent hace con las jornadas.
  async function saveUcvContact(fields, existing) {
    const current = await readBoardKey('ucv_board_state', 'ucv-contacts-v1', []);
    const base = existing ? (current.find(function (c) { return c.id === existing.rawId; }) || {}) : {};
    const payload = Object.assign({}, base, {
      id: existing ? existing.rawId : 'c' + Date.now(),
      name: fields.name, role: fields.ucvRole || base.role || UCV_ROLES[UCV_ROLES.length - 1].id,
      unit: fields.unit || base.unit || UCV_UNITS[0].id,
      email: fields.email || 'Por confirmar', phone: fields.phone || 'Por confirmar',
      status: base.status || 'Por confirmar', action: base.action || 'Por confirmar',
      function: base.function || '', extraUnits: Array.isArray(base.extraUnits) ? base.extraUnits : []
    });
    const next = existing
      ? current.map(function (c) { return c.id === existing.rawId ? payload : c; })
      : current.concat(payload);
    return writeBoardKey('ucv_board_state', 'ucv-contacts-v1', next);
  }

  async function saveCoalicionContact(fields, existing) {
    try {
      const res = await fetch(COALICION_EDITOR_URL, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save', entity: 'contact', id: existing ? existing.rawId : null,
          payload: {
            name: fields.name, role: fields.role, phone: fields.phone, email: fields.email,
            notes: fields.notes, status: fields.status, belongs_to: fields.belongsTo, national_id: fields.nationalId
          }
        })
      });
      return res.ok;
    } catch (_err) { return false; }
  }

  async function saveIngeniaLikeContact(table, key, fields, existing) {
    const current = await readBoardKey(table, key, []);
    const next = upsertById(current, existing, function (base) {
      return Object.assign({}, base, {
        id: existing ? existing.rawId : uid(), name: fields.name, role: fields.role,
        phone: fields.phone, email: fields.email, notes: fields.notes, status: fields.status || 'pending',
        subdivision: fields.subdivision || ''
      });
    });
    return writeBoardKey(table, key, next);
  }

  async function deleteContactFromSource(existing) {
    if (existing.source === 'coalicion') return deleteCoalicionContact(existing);
    if (existing.source === 'florangel') return deleteFromArrayKey('florangel_board_state', 'florangel-contacts-v1', existing.rawId);
    if (existing.source === 'cmdlt') return deleteFromArrayKey('ingenia_board_state', 'cmdlt-contacts-v1', existing.rawId);
    if (existing.source === 'networking') return deleteFromArrayKey('ingenia_board_state', 'ingenia-networking-contacts-v1', existing.rawId);
    if (existing.source === 'ucv') return deleteUcvContact(existing);
    return deleteFromArrayKey('ingenia_board_state', 'ingenia-custom-' + existing.source + '-contacts-v1', existing.rawId);
  }

  async function deleteCoalicionContact(existing) {
    try {
      const res = await fetch(COALICION_EDITOR_URL, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', entity: 'contact', id: existing.rawId })
      });
      return res.ok;
    } catch (_err) { return false; }
  }

  // Igual que deleteContact en Directorio y Agenda Relaciones UCV.dc.html:
  // también limpia las interacciones registradas para ese contacto, para
  // no dejar historial huérfano.
  async function deleteUcvContact(existing) {
    const ok = await deleteFromArrayKey('ucv_board_state', 'ucv-contacts-v1', existing.rawId);
    if (!ok) return false;
    const interactions = await readBoardKey('ucv_board_state', 'ucv-interactions-v2', []);
    const nextInteractions = interactions.filter(function (i) { return i.contact !== existing.rawId; });
    await writeBoardKey('ucv_board_state', 'ucv-interactions-v2', nextInteractions);
    return true;
  }

  async function deleteEditingContact() {
    const existing = state.editingContact;
    if (!existing) return;
    const submitBtn = dom.contactForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const ok = await deleteContactFromSource(existing);
    submitBtn.disabled = false;
    if (!ok) { showError(dom.contactError, 'No se pudo eliminar — revisa tu conexión.'); return; }
    closeContactDialog();
    await loadAll();
    toast('Contacto eliminado.', 'success');
  }

  function openContactDetail(c) {
    if (!c) return;
    state.viewingContact = c;
    const info = sourceInfo(c.source);
    const status = contactStatusInfo(c);
    dom.contactDetailTitle.textContent = c.name || 'Contacto';
    renderMarkup(dom.contactDetailBody,
      '<div class="contact-row"><span class="contact-row-label">🏷️ Organización</span><span class="contact-row-value">' + safe(info.label) + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">Rol</span><span class="contact-row-value">' + safe(c.role || 'Contacto') + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">◉ Teléfono</span><span class="contact-row-value">' + (c.phone ? '<a href="tel:' + safe(c.phone) + '">' + safe(c.phone) + '</a>' : 'Por confirmar') + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">✉ Correo</span><span class="contact-row-value">' + (c.email ? '<a href="mailto:' + safe(c.email) + '">' + safe(c.email) + '</a>' : 'Por confirmar') + '</span></div>' +
      '<div class="contact-row"><span class="contact-row-label">Estado</span><span class="contact-row-value">' + safe(status.emoji) + ' ' + safe(status.label) + '</span></div>' +
      (c.source === 'networking' && c.raw && c.raw.subdivision ? '<div class="contact-row"><span class="contact-row-label">🧩 Subdivisión</span><span class="contact-row-value">' + safe(c.raw.subdivision) + '</span></div>' : '') +
      (c.notes ? '<div class="contact-row"><span class="contact-row-label">↳ Notas</span><span class="contact-row-value">' + safe(c.notes) + '</span></div>' : '')
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
    if (!c) return;
    closeContactDetail();
    const ok = await deleteContactFromSource(c);
    if (!ok) { toast('No se pudo eliminar — revisa tu conexión.', 'error'); return; }
    await loadAll();
    toast('Contacto eliminado.', 'success');
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
    const info = sourceInfo(task.org);
    const moveButtons = [];
    if (statusIndex > 0) moveButtons.push('<button type="button" class="kanban-move-btn" data-action="move-task-status" data-id="' + safe(task.id) + '" data-status="' + TASK_STATUSES[statusIndex - 1].key + '" onclick="window.ingeniaAction(event)">← ' + safe(TASK_STATUSES[statusIndex - 1].label) + '</button>');
    if (statusIndex < TASK_STATUSES.length - 1) moveButtons.push('<button type="button" class="kanban-move-btn" data-action="move-task-status" data-id="' + safe(task.id) + '" data-status="' + TASK_STATUSES[statusIndex + 1].key + '" onclick="window.ingeniaAction(event)">' + safe(TASK_STATUSES[statusIndex + 1].label) + ' →</button>');
    const responsable = responsableNamesLabel(task.responsable);
    const detailText = taskDetailText(task);
    const followupLabel = taskFollowupLabel(task);
    return '<article class="kanban-card" draggable="true" data-id="' + safe(task.id) + '" style="--status-color:' + safe(status.color) + '">' +
      '<button type="button" style="all:unset;cursor:pointer" data-task-id="' + safe(task.id) + '" onclick="window.ingeniaAction(event)">' +
        '<span class="org-tag" style="--source-color:' + safe(info.color) + '">' + safe(info.label) + '</span>' +
        '<p class="kanban-card-title">' + safe(task.title) + '</p>' +
        (detailText ? '<p class="kanban-card-notes">' + safe(detailText) + '</p>' : '') +
        (responsable ? '<span class="responsable-tag">👤 ' + safe(responsable) + '</span>' : '') +
        (followupLabel ? '<span class="responsable-tag">↻ ' + safe(followupLabel) + '</span>' : '') +
        (task.dueDate ? '<span class="responsable-tag">⏰ ' + safe(formatDate(task.dueDate)) + '</span>' : '') +
      '</button>' +
      '<div class="kanban-card-actions">' + moveButtons.join('') + '</div>' +
    '</article>';
  }

  async function moveTaskStatus(id, status) {
    const task = findById(state.tasks, id);
    if (!task || task.status === status) return;
    const previous = task.status;
    task.status = status;
    refreshTaskBoards();
    const ok = await writeBoardKey('ingenia_board_state', TEAM_TASKS_KEY, state.tasks);
    if (!ok) { task.status = previous; refreshTaskBoards(); toast('No se pudo actualizar el estado — revisa tu conexión.', 'error'); }
  }

  function openTaskDialog(existing, lockedOrg) {
    hideError(dom.taskError);
    dom.taskForm.reset();
    state.editingTask = existing || null;
    const presetOrg = existing ? existing.org : lockedOrg;
    populateOrgSelect(presetOrg);
    dom.taskOrgSelect.disabled = !existing && !!lockedOrg;
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

  function closeTaskDialog() { dom.taskDialog.close(); dom.taskOrgSelect.disabled = false; state.editingTask = null; }

  async function onTaskSubmit(e) {
    e.preventDefault();
    hideError(dom.taskError);
    const org = dom.taskForm.elements.org.value;
    const title = dom.taskForm.elements.title.value.trim();
    if (!org || !title) { showError(dom.taskError, 'Organización y título son obligatorios.'); return; }
    let responsableIds = getSelectedResponsableIds();
    if (isNewResponsableChecked()) {
      const newName = dom.taskForm.elements.new_responsable_name.value.trim();
      if (!newName) { showError(dom.taskError, 'Escribe el nombre del nuevo responsable.'); return; }
      const created = await createTeamMember(newName);
      if (!created) { showError(dom.taskError, 'No se pudo guardar el responsable — revisa tu conexión.'); return; }
      responsableIds = responsableIds.concat([created.id]);
      populateTasksResponsableFilter();
    }
    const status = dom.taskForm.elements.status.value;
    const payload = {
      id: state.editingTask ? state.editingTask.id : uid(),
      org: org,
      title: title,
      detail: dom.taskDetail.value.trim(),
      status: status,
      followupStatus: status === 'en_proceso' ? dom.taskFollowupSelect.value : '',
      priority: dom.taskPrioritySelect.value,
      responsable: responsableIds,
      dueDate: dom.taskDueDate.value,
      nextAction: dom.taskNextAction.value.trim(),
      created_at: state.editingTask ? state.editingTask.created_at : new Date().toISOString()
    };
    const next = state.editingTask
      ? state.tasks.map(function (t) { return t.id === state.editingTask.id ? payload : t; })
      : state.tasks.concat(payload);
    const ok = await writeBoardKey('ingenia_board_state', TEAM_TASKS_KEY, next);
    if (!ok) { showError(dom.taskError, 'No se pudo guardar — revisa tu conexión.'); return; }
    state.tasks = next;
    refreshTaskBoards();
    closeTaskDialog();
    toast('Tarea guardada.', 'success');
  }

  async function deleteEditingTask() {
    if (!state.editingTask) return;
    const next = state.tasks.filter(function (t) { return t.id !== state.editingTask.id; });
    const ok = await writeBoardKey('ingenia_board_state', TEAM_TASKS_KEY, next);
    if (!ok) { toast('No se pudo eliminar — revisa tu conexión.', 'error'); return; }
    state.tasks = next;
    refreshTaskBoards();
    closeTaskDialog();
    toast('Tarea eliminada.', 'success');
  }

  // ---------- Organizaciones ----------

  function renderOrganizations() {
    const fixedCards = ORG_DIRECTORY.map(function (key) {
      return orgCardHtml(FIXED_SOURCE_EMOJI[key], SOURCE_LABELS[key], FIXED_SOURCE_COLOR[key], ORG_LINKS[key]);
    });
    const customCards = state.customCalendars.map(function (c) {
      return orgCardHtml('🏷️', c.name, c.color, './organizacion.html?org=' + encodeURIComponent(c.id));
    });
    renderMarkup(dom.organizationsGrid, fixedCards.concat(customCards).join(''));
  }

  // Las organizaciones con tablero propio en el sitio (UCV/Coalición/
  // Florangel) abren esa página; las creadas al vuelo abren su propio
  // tablero (Calendario + Tareas) en organizacion.html.
  function orgCardHtml(emoji, name, color, link) {
    return '<article class="org-card" style="--source-color:' + safe(color) + '">' +
      '<h3>' + emoji + ' ' + safe(name) + '</h3>' +
      '<a class="btn btn-secondary" href="' + safe(link) + '" target="_blank" rel="noopener noreferrer">Abrir tablero ↗</a>' +
    '</article>';
  }

  function openOrgDialog() {
    hideError(dom.orgError);
    dom.orgForm.reset();
    dom.orgDialog.showModal();
    dom.orgForm.elements.name.focus();
  }

  function closeOrgDialog() { dom.orgDialog.close(); }

  async function onOrgSubmit(e) {
    e.preventDefault();
    hideError(dom.orgError);
    const name = dom.orgForm.elements.name.value.trim();
    if (!name) { showError(dom.orgError, 'El nombre es obligatorio.'); return; }
    const created = await createCustomCalendar(name);
    if (!created) { showError(dom.orgError, 'No se pudo guardar — revisa tu conexión.'); return; }
    renderOrganizations();
    populateSourceSelect();
    populateTasksOrgFilter();
    closeOrgDialog();
    toast('Organización agregada.', 'success');
  }

  async function saveCoalicionEvent(fields, existing) {
    // El link de Maps ya no se edita desde este formulario — se conserva el
    // que tuviera el evento (si tenía uno de antes) sin tocarlo.
    const raw = existing && existing.raw;
    try {
      const res = await fetch(COALICION_EDITOR_URL, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save', entity: 'event', id: existing ? existing.rawId : null,
          payload: {
            title: fields.title, event_date: fields.event_date, start_time: fields.start_time || '',
            end_time: fields.end_time || '', location: fields.location,
            maps_url: (raw && raw.maps_url) || '', status: fields.status, notes: fields.notes,
            jornada_type: fields.jornadaType, specialties: fields.specialties,
            collaborating_orgs: fields.collaboratingOrgs, participants: fields.participants,
            participo_fundacion_ingenia: fields.participatesIngenia,
            minuta: fields.minuta, pendientes: fields.pendientes, minuta_files: fields.minutaFiles
          }
        })
      });
      return res.ok;
    } catch (_err) { return false; }
  }

  async function deleteCoalicionEvent(existing) {
    try {
      const res = await fetch(COALICION_EDITOR_URL, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', entity: 'event', id: existing.rawId })
      });
      return res.ok;
    } catch (_err) { return false; }
  }

  async function saveFlorangelEvent(fields, existing) {
    const current = await readBoardKey('florangel_board_state', 'florangel-events-v1', []);
    const next = upsertById(current, existing, function (base) {
      return Object.assign({}, base, {
        id: existing ? existing.rawId : uid(), title: fields.title, event_date: fields.event_date,
        start_time: fields.start_time, end_time: fields.end_time,
        location: fields.location, status: fields.status, notes: fields.notes,
        participatesIngenia: fields.participatesIngenia, jornadaType: fields.jornadaType,
        specialties: fields.specialties, collaboratingOrgs: fields.collaboratingOrgs, participants: fields.participants,
        minuta: fields.minuta, pendientes: fields.pendientes, minuta_files: fields.minutaFiles
      });
    });
    return writeBoardKey('florangel_board_state', 'florangel-events-v1', next);
  }

  async function saveUcvEvent(fields, existing) {
    const current = await readBoardKey('ucv_board_state', 'ucv-journeys-v3', []);
    const sharedStatus = SHARED_STATUS_TO_UCV[fields.status] || 'planned';
    if (existing) {
      // Las jornadas de UCV traen campos que este formulario no maneja
      // (eventType, voluntarios asignados, checks...) — se preservan tal
      // cual. "status" se traduce a los valores propios de UCV (ver
      // SHARED_STATUS_TO_UCV) para no romper su propio esquema. Si la
      // jornada tenía varias fechas, solo se reemplaza la de este evento.
      const next = current.map(function (j) {
        if (j.id !== existing.rawId) return j;
        const dates = Array.isArray(j.dates) ? j.dates.slice() : [];
        const idx = dates.indexOf(existing.date);
        if (idx > -1) dates[idx] = fields.event_date; else dates.push(fields.event_date);
        return Object.assign({}, j, {
          title: fields.title, dates: dates, time: fields.start_time || '', endTime: fields.end_time,
          location: fields.location, status: sharedStatus,
          notes: fields.notes, participatesIngenia: fields.participatesIngenia, jornadaType: fields.jornadaType,
          specialties: fields.specialties, collaboratingOrgs: fields.collaboratingOrgs, participants: fields.participants,
          minuta: fields.minuta, pendientes: fields.pendientes, minuta_files: fields.minutaFiles
        });
      });
      return writeBoardKey('ucv_board_state', 'ucv-journeys-v3', next);
    }
    const next = current.concat({
      id: uid(), title: fields.title, dates: [fields.event_date], time: fields.start_time || '',
      endTime: fields.end_time, location: fields.location, status: sharedStatus,
      eventType: 'other',
      owner: '', doctors: '', students: '', assignedVolunteers: [], checks: {}, notes: fields.notes,
      participatesIngenia: fields.participatesIngenia, jornadaType: fields.jornadaType,
      specialties: fields.specialties, collaboratingOrgs: fields.collaboratingOrgs, participants: fields.participants,
      minuta: fields.minuta, pendientes: fields.pendientes, minuta_files: fields.minutaFiles
    });
    return writeBoardKey('ucv_board_state', 'ucv-journeys-v3', next);
  }

  async function saveIngeniaEvent(key, fields, existing) {
    const current = await readBoardKey('ingenia_board_state', key, []);
    const next = upsertById(current, existing, function (base) {
      return Object.assign({}, base, {
        id: existing ? existing.rawId : uid(), title: fields.title, event_date: fields.event_date,
        start_time: fields.start_time, end_time: fields.end_time,
        location: fields.location, status: fields.status, notes: fields.notes,
        participatesIngenia: fields.participatesIngenia, jornadaType: fields.jornadaType,
        specialties: fields.specialties, collaboratingOrgs: fields.collaboratingOrgs, participants: fields.participants,
        minuta: fields.minuta, pendientes: fields.pendientes, minuta_files: fields.minutaFiles
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
