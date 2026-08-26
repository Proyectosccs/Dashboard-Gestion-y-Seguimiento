# UX contract — Control operativo UCV

## Scope

This repository contains two parallel coordination surfaces for Fundación Ingenia / CONEKTADOS:

- The public UCV coordination artifact with its operational board, event calendar, hierarchy, contacts, and interaction history.
- The public, mobile-first Coalición Venezuela event dashboard with summary, calendar, privacy-aware contacts, inventory, and beneficiary batches.

The two surfaces share visual tokens and link to one another, but never share event records or private logistics data.

## Canonical UI map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Native browser select | This UX contract | Native | Keyboard selection and narrow viewport. |
| Date | Native browser date input | This UX contract | Native `YYYY-MM-DD` | Date entry and focus behavior. |
| Form | Screen-owned controlled fields | This UX contract | Task / event / interaction editor | Create/edit task, event and interaction. |
| Scrollbar | Global application stylesheet | `DESIGN.md` + runtime CSS | Horizontal board / modal | Board horizontal scroll and modal scroll. |
| CRUD | Screen-owned local state | This UX contract | Task and event create/edit; task movement | Add, edit, move left/right, reload. |
| Calendar | Screen-owned month grid | This UX contract | Previous / next / today; day detail | Add event, navigate months, open a day, reload. |
| App status | Hierarchy unit select | This UX contract | Developing / resolved / not started | Change status, reload. |
| Personalization | Screen-owned editing dialog | This UX contract | Text, density, navigation order, board order | Edit draft, cancel, save, reload. |
| Edit access | Hashed operational key via Supabase Edge Function | `supabase/functions/coalicion-editor/index.ts` | Public consultation / editing active | Invalid key, activate, lock and changed-key recovery. |
| Authorization | Supabase grants + RLS + server-side key verification | SQL + Edge Function | Public read / key-gated write | Direct REST write rejection and server validation. |
| Shared CRUD | Supabase tables + key-gated Edge Function | SQL + Edge Function | Contact / event / inventory / batch | Create, edit, reload, realtime refresh and server failure. |

## Behavior

- The operational board is the default view.
- Every saved event appears automatically in the monthly calendar and in “Próximos eventos”.
- Clicking a calendar day opens its events and allows creating a new one with that date preselected.
- Every event requires a type selected from the maintained event taxonomy.
- Each event tracks communication, team, materials, volunteers/training, and prior data as five explicit internal-audit checks.
- App development is not part of the event audit; it is edited independently for every hierarchy unit.
- Calendar status always includes a text label: Por confirmar, En preparación, Confirmada or Completada.
- “Guardar tarea” saves locally and closes the editor.
- “Cancelar” closes without committing the draft.
- Status movement is available through visible left/right buttons; dragging is not required.
- Unknown information is displayed as “Por confirmar”.
- Local persistence is best-effort through `localStorage`; when storage is unavailable, the current session remains usable.
- Contact interactions persist locally after save.
- “Modo edición” opens a draft: Cancelar discards it and Guardar diseño commits it locally.
- Editable copy includes the principal title and subtitle plus the presentation, audit, upcoming-events and calendar headings.
- Bubble/card density has compact, normal and large variants and applies consistently to KPI, event, contact and calendar-event surfaces.
- Navigation and board sections are reordered with visible arrow buttons so pointer, touch and keyboard users have the same capability.
- “Restablecer borrador” restores the original layout inside the editor; it is not committed until “Guardar diseño”.
- The board never invents institutional approvals, contact details, dates, or responsibilities.

## Coalición Venezuela behavior and privacy

- The route is `evento-coalicion-venezuela.html`; the UCV route remains the repository default.
- The HTML and JavaScript contain no real contact, identity, address, inventory, or batch data.
- The dashboard opens directly without an account and supports narrow mobile viewports.
- Events, inventory and aggregate batches are publicly readable. Column-level grants expose only the contact name and role to public requests.
- Cédula, phone, email and contact notes are returned only through the Edge Function after the edit key is verified server-side.
- Editing is activated with one shared operational key. Supabase stores only a bcrypt hash; the real key is never committed to GitHub.
- Direct anonymous insert or update requests are denied. All writes pass through the allowlisted Edge Function and the internal `coalicion_save_record` RPC, which verifies the key again on every mutation.
- The key remains only in page memory and is cleared when editing is locked or the page reloads.
- Events, contacts, inventory, and lots wait for server confirmation before reporting a successful save.
- Failed saves keep the form and entered values available for correction or retry.
- Forms use app-owned validation and protect unsaved changes inside the editor.
- Contact search is local to the currently visible dataset, has an explicit clear control, and never places the query, key or private fields in the URL.
- Beneficiary batches store aggregate quantity, leader, arrival window, status, and notes. They do not store beneficiary identities or medical information.
- No hard-delete UI is provided in the first release. Records support an `archived_at` lifecycle for a future, explicitly governed archive flow.
- Date and time controls remain native; platform-owned picker presentation is accepted for this portable Spanish-language artifact.
- Route titles follow `{Vista} — Evento Coalición Venezuela` and never include personal data.

## Accessibility and locale

- Interface language is Spanish.
- Controls use native buttons, inputs, labels, and selects.
- All icon-only buttons have accessible names.
- Focus is visibly indicated.
- Status and priority use text and symbols in addition to color.
- Horizontal scrolling is retained for the Kanban on narrow screens.
- Reduced-motion preferences remove nonessential motion.
