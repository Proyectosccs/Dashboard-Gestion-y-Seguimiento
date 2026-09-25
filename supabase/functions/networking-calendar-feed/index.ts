// Feed .ics de solo lectura para suscribirse desde Google Calendar (u otro
// cliente de calendario) al mismo calendario unificado que muestra
// calendario-fundacion-ingenia.html — une las 6 fuentes (Coalición,
// Florangel, UCV, Networking, Otros, CMDLT) más cualquier calendario
// personalizado, igual que loadAll() en el cliente.
//
// GET /functions/v1/networking-calendar-feed?token=<FEED_TOKEN>
//
// El token no es un mecanismo de seguridad fuerte (no hay datos sensibles
// en estos eventos), es solo para que la URL no quede indexable/adivinable
// por cualquiera. Se compara contra el secreto FEED_TOKEN configurado en el
// proyecto de Supabase (Edge Functions → Secrets).

const FALLBACK_ANON_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';

const SOURCE_LABELS: Record<string, string> = {
  coalicion: 'Coalición Venezuela',
  florangel: 'Dra Florangel',
  ucv: 'UCV',
  cmdlt: 'Centro Médico Docente de La Trinidad',
  networking: 'Networking Fund. Ingenia',
  otros: 'Otros'
};

function getEnv(name: string): string {
  return Deno.env.get(name) || '';
}

function restHeaders() {
  const anonKey = getEnv('SUPABASE_ANON_KEY') || FALLBACK_ANON_KEY;
  return { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
}

async function restGet(path: string): Promise<unknown> {
  const projectUrl = getEnv('SUPABASE_URL');
  const res = await fetch(`${projectUrl}/rest/v1/${path}`, { headers: restHeaders() });
  if (!res.ok) return [];
  return res.json();
}

type FeedEvent = {
  id: string;
  source: string;
  title: string;
  date: string;
  time: string | null;
  location: string;
  notes: string;
};

async function collectEvents(): Promise<FeedEvent[]> {
  const events: FeedEvent[] = [];

  const coalicionRows = await restGet(
    'coalicion_events?select=id,title,event_date,start_time,location,notes&archived_at=is.null'
  ) as Array<Record<string, unknown>>;
  (Array.isArray(coalicionRows) ? coalicionRows : []).forEach((e) => {
    if (!e.event_date) return;
    events.push({
      id: 'coalicion-' + e.id, source: 'coalicion', title: String(e.title || 'Evento'),
      date: String(e.event_date), time: (e.start_time as string) || null,
      location: String(e.location || ''), notes: String(e.notes || '')
    });
  });

  const florangelRow = await restGet('florangel_board_state?select=value&key=eq.florangel-events-v1') as Array<{ value: unknown }>;
  const florangelEvents = Array.isArray(florangelRow[0]?.value) ? florangelRow[0].value as Array<Record<string, unknown>> : [];
  florangelEvents.forEach((e) => {
    if (!e.event_date) return;
    events.push({
      id: 'florangel-' + e.id, source: 'florangel', title: String(e.title || 'Evento'),
      date: String(e.event_date), time: (e.start_time as string) || null,
      location: String(e.location || ''), notes: String(e.notes || '')
    });
  });

  const ucvRow = await restGet('ucv_board_state?select=value&key=eq.ucv-journeys-v3') as Array<{ value: unknown }>;
  const journeys = Array.isArray(ucvRow[0]?.value) ? ucvRow[0].value as Array<Record<string, unknown>> : [];
  journeys.forEach((j) => {
    const dates = Array.isArray(j.dates) ? j.dates as string[] : (j.date ? [String(j.date)] : []);
    dates.forEach((d) => {
      events.push({
        id: 'ucv-' + (j.id || d) + '-' + d, source: 'ucv', title: String(j.title || 'Evento por confirmar'),
        date: d, time: null, location: String(j.location || ''), notes: String(j.notes || '')
      });
    });
  });

  const ingeniaKeys = ['ingenia-networking-events-v1', 'ingenia-otros-events-v1', 'ingenia-custom-cmdlt-events-v1', 'ingenia-custom-calendars-v1'];
  const ingeniaRows = await restGet(
    `ingenia_board_state?select=key,value&key=in.(${ingeniaKeys.join(',')})`
  ) as Array<{ key: string; value: unknown }>;
  const findRow = (key: string) => ingeniaRows.find((r) => r.key === key);
  const sourceByKey: Record<string, string> = {
    'ingenia-networking-events-v1': 'networking',
    'ingenia-otros-events-v1': 'otros',
    'ingenia-custom-cmdlt-events-v1': 'cmdlt'
  };
  Object.keys(sourceByKey).forEach((key) => {
    const row = findRow(key);
    const items = Array.isArray(row?.value) ? row!.value as Array<Record<string, unknown>> : [];
    items.forEach((e) => {
      if (!e.event_date) return;
      events.push({
        id: sourceByKey[key] + '-' + e.id, source: sourceByKey[key], title: String(e.title || 'Evento'),
        date: String(e.event_date), time: (e.start_time as string) || null,
        location: String(e.location || ''), notes: String(e.notes || '')
      });
    });
  });

  const customCalendars = Array.isArray(findRow('ingenia-custom-calendars-v1')?.value)
    ? findRow('ingenia-custom-calendars-v1')!.value as Array<Record<string, unknown>>
    : [];
  if (customCalendars.length) {
    const customKeys = customCalendars.map((c) => `ingenia-custom-${c.id}-events-v1`);
    const customRows = await restGet(
      `ingenia_board_state?select=key,value&key=in.(${customKeys.join(',')})`
    ) as Array<{ key: string; value: unknown }>;
    customCalendars.forEach((c) => {
      const row = customRows.find((r) => r.key === `ingenia-custom-${c.id}-events-v1`);
      const items = Array.isArray(row?.value) ? row!.value as Array<Record<string, unknown>> : [];
      items.forEach((e) => {
        if (!e.event_date) return;
        events.push({
          id: c.id + '-' + e.id, source: String(c.name || 'Otros'), title: String(e.title || 'Evento'),
          date: String(e.event_date), time: (e.start_time as string) || null,
          location: String(e.location || ''), notes: String(e.notes || '')
        });
      });
    });
  }

  return events;
}

// Escapa texto según RFC 5545 (\, ; , y saltos de línea).
function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Pliega líneas a 75 octetos, como exige el estándar (evita que algunos
// clientes de calendario trunquen o rechacen eventos con texto largo).
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let result = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length) {
    result += '\r\n ' + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return result;
}

function buildIcs(events: FeedEvent[]): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fundacion Ingenia//Networking Calendar//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Networking Fundación Ingenia',
    'X-WR-TIMEZONE:America/Caracas'
  ];

  events.forEach((e) => {
    const dateCompact = e.date.replace(/-/g, '');
    const sourceLabel = SOURCE_LABELS[e.source] || e.source;
    const summary = icsEscape(`${e.title} — ${sourceLabel}`);
    const descriptionParts = [e.notes, `Organización: ${sourceLabel}`].filter(Boolean);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}@networking.fundacioningenia`);
    lines.push(`DTSTAMP:${stamp}`);
    if (e.time) {
      const timeCompact = e.time.replace(/:/g, '').padEnd(6, '0').slice(0, 6);
      lines.push(`DTSTART;TZID=America/Caracas:${dateCompact}T${timeCompact}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
    }
    lines.push(`SUMMARY:${summary}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (descriptionParts.length) lines.push(`DESCRIPTION:${icsEscape(descriptionParts.join('\\n'))}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });

  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const expectedToken = getEnv('FEED_TOKEN');
  if (!expectedToken || token !== expectedToken) {
    return new Response('not found', { status: 404 });
  }

  try {
    const events = await collectEvents();
    const ics = buildIcs(events);
    return new Response(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=900'
      }
    });
  } catch (_err) {
    return new Response('internal error', { status: 500 });
  }
});
