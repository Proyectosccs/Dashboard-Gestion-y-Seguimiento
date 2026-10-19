// Voluntarios de conektados para las jerarquías (ADRA y Coalición). Usa la misma
// función lite-resultados (recurso "voluntarios") que la pestaña Voluntarios del
// calendario. Cada página trae la lista una sola vez y la guarda en memoria.
(function () {
  const SUPABASE_URL = 'https://hcylkagvwfncdaaizutn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';
  const LITE_FUNCTION_URL = SUPABASE_URL + '/functions/v1/lite-resultados';
  const NOTES_KEY = 'ingenia-volunteer-notes-v1';

  let loading = null;
  let byId = {};

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalize(v) {
    const centro = v.centro || {};
    return {
      id: String(v.afiliacionId), name: v.nombre || '', cedula: v.cedula || '',
      phone: v.telefono || '', email: v.correo || '', tipo: v.tipoVoluntario || '',
      centroNombre: centro.nombre || '', nivel: v.nivel || '', aplicacion: v.aplicacion || '',
      funcion: v.funcion || '', venceEn: v.venceEn || '', desde: v.desde || '',
      revocadaEn: v.revocadaEn || '', active: !v.revocadaEn
    };
  }

  // Trae todos los voluntarios (activos y desafiliados). Si falla, la promesa
  // se rechaza y la próxima llamada vuelve a intentarlo.
  function load() {
    if (!loading) {
      loading = fetch(LITE_FUNCTION_URL, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'voluntarios', params: {} })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (!response.ok) throw new Error((body.error || 'operation unavailable') + ' [HTTP ' + response.status + ']');
          const list = (body.data && Array.isArray(body.data.voluntarios) ? body.data.voluntarios : []).map(normalize);
          byId = {};
          list.forEach(function (v) { byId[v.id] = v; });
          return list;
        });
      }).catch(function (err) {
        loading = null;
        throw err;
      });
    }
    return loading;
  }

  // Voluntarios activos cuyo centro cumple la expresión (ej. /adra/i).
  function forCentro(list, match) {
    return list.filter(function (v) { return v.active && match.test(v.centroNombre); });
  }

  // Una fila con el mismo aspecto que un contacto: nombre y tipo, sin teléfono.
  // Al hacer clic llama a window[handler] con el evento; esa función debe
  // llamar a openDetailById si trae data-volunteer-id.
  function rowHtml(v, handler) {
    return '<button type="button" class="hierarchy-contact-row" data-volunteer-id="' + esc(v.id) + '" onclick="window.' + handler + '(event)">' +
      '<span class="hierarchy-contact-info">' +
        '<span class="hierarchy-contact-name">' + esc(v.name || 'Sin nombre') + '</span>' +
        (v.funcion ? '<span class="hierarchy-contact-role">' + esc(v.funcion) + '</span>' : '') +
      '</span>' +
    '</button>';
  }

  function fmtDate(value) {
    if (!value) return '';
    const parts = String(value).slice(0, 10).split('-');
    return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : String(value);
  }

  const DIALOG_CSS = '' +
    '#cvol-dialog{width:min(560px,calc(100vw - 28px));border:0;border-radius:24px;padding:0;background:#fff;color:#2d2620;box-shadow:0 20px 50px rgba(0,0,0,.25)}' +
    '#cvol-dialog::backdrop{background:rgba(32,30,29,.5)}' +
    '#cvol-dialog .cvol-head{padding:20px 22px 6px}' +
    '#cvol-dialog .cvol-eyebrow{margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a6d3b}' +
    '#cvol-dialog h2{margin:0;font-size:24px}' +
    '#cvol-dialog .cvol-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;padding:8px 22px 16px}' +
    '#cvol-dialog .cvol-row{display:flex;flex-direction:column;gap:2px;min-width:0}' +
    '#cvol-dialog .cvol-row span{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#8a6d3b}' +
    '#cvol-dialog .cvol-row strong{font-size:14px;font-weight:600;overflow-wrap:anywhere}' +
    '#cvol-dialog .cvol-note{grid-column:1/-1;font-size:13px;white-space:pre-wrap}' +
    '#cvol-dialog .cvol-foot{display:flex;justify-content:flex-end;padding:12px 22px 18px;border-top:1px solid #eee}' +
    '#cvol-dialog .cvol-close{padding:9px 18px;border-radius:999px;border:1px solid #bbb;background:#fff;font:inherit;cursor:pointer}' +
    '@media (max-width:480px){#cvol-dialog .cvol-body{grid-template-columns:1fr}}';

  function ensureDialog() {
    let dialog = document.getElementById('cvol-dialog');
    if (dialog) return dialog;
    const style = document.createElement('style');
    style.textContent = DIALOG_CSS;
    document.head.appendChild(style);
    dialog = document.createElement('dialog');
    dialog.id = 'cvol-dialog';
    dialog.setAttribute('aria-labelledby', 'cvol-title');
    dialog.innerHTML = '<div class="cvol-head"><p class="cvol-eyebrow">🙋 Voluntario</p><h2 id="cvol-title"></h2></div>' +
      '<div class="cvol-body"></div><div class="cvol-foot"><button type="button" class="cvol-close">Cerrar</button></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('.cvol-close').addEventListener('click', function () { dialog.close(); });
    return dialog;
  }

  // Observaciones guardadas en el dashboard (solo lectura aquí).
  function loadNote(id) {
    return fetch(SUPABASE_URL + '/rest/v1/ingenia_board_state?key=eq.' + NOTES_KEY + '&select=value', {
      headers: { apikey: SUPABASE_KEY }
    }).then(function (response) {
      return response.json();
    }).then(function (rows) {
      const value = rows && rows[0] && rows[0].value;
      return value && typeof value === 'object' && value[id] ? String(value[id]) : '';
    });
  }

  function openDetailById(id) {
    const v = byId[id];
    if (!v) return;
    const dialog = ensureDialog();
    dialog.querySelector('#cvol-title').textContent = v.name || 'Voluntario';
    const rows = [
      ['Organización', v.centroNombre], ['Tipo', v.tipo], ['Nivel', v.nivel], ['Aplicación', v.aplicacion],
      ['Función', v.funcion], ['Cédula', v.cedula], ['Teléfono', v.phone], ['Correo', v.email],
      ['Desde', fmtDate(v.desde)], ['Vence', fmtDate(v.venceEn)],
      ['Estado', v.active ? 'Activo' : 'Desafiliado el ' + fmtDate(v.revocadaEn)]
    ];
    const body = dialog.querySelector('.cvol-body');
    body.innerHTML = rows.filter(function (r) { return r[1]; }).map(function (r) {
      return '<div class="cvol-row"><span>' + esc(r[0]) + '</span><strong>' + esc(r[1]) + '</strong></div>';
    }).join('') + '<div class="cvol-row cvol-note"><span>Observaciones</span><strong id="cvol-note">Cargando…</strong></div>';
    dialog.showModal();
    loadNote(id).then(function (text) {
      const el = dialog.querySelector('#cvol-note');
      if (el) el.textContent = text || 'Sin observaciones';
    }).catch(function () {
      const el = dialog.querySelector('#cvol-note');
      if (el) el.textContent = 'No se pudieron cargar las observaciones';
    });
  }

  window.ConektadosVoluntarios = {
    load: load,
    forCentro: forCentro,
    rowHtml: rowHtml,
    openDetailById: openDetailById
  };
})();
