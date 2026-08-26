---
version: alpha
colors:
  background: "#f5ead8"
  surface: "#ebddc5"
  text: "#201e1d"
  primary: "#c67139"
  secondary: "#7a8a5e"
  danger: "#a02525"
typography:
  display:
    fontFamily: "Caprasimo, system-ui, sans-serif"
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
rounded:
  small: "8px"
  medium: "16px"
  large: "28px"
spacing:
  small: "8.8px"
  medium: "17.6px"
  large: "26.4px"
components:
  task-card:
    backgroundColor: "#ffffff"
    borderRadius: "16px"
  kanban-column:
    backgroundColor: "#f9f4ed"
    borderRadius: "28px"
---

## Overview

The UCV operations dashboard is a warm field-control board for Fundacion Ingenia and CONEKTADOS. It should feel like a well-kept coordination notebook: approachable enough for volunteers, structured enough for institutional follow-up, and readable during fast operational meetings.

The memorable signature is the UCV relationship map flowing directly into a color-coded operational Kanban and calendar. The hierarchy explains who matters; the board explains what happens next; the calendar makes every event visible by date and internal-audit level. Avoid generic corporate blue dashboards and avoid decorative analytics that do not help coordinate an event.

## Colors

The existing Organic runtime stylesheet is canonical. Cream is the page ground, white and sand are working surfaces, terracotta is the primary action color, and sage signals confirmed or completed work. Red is reserved for overdue, blocked, or safety-critical information. Kanban colors always include text labels and icons so status never depends on color alone.

## Typography

Caprasimo is reserved for page and section headings. Figtree carries controls, task content, metadata, and long operational notes. Dense cards favor short sentences, clear verbs, and visible owners over decorative copy.

## Layout

The UCV application uses a wide responsive workspace with five peer views: operational board, calendar, hierarchy, contacts, and interactions. The Kanban scrolls horizontally on narrow screens rather than compressing cards below a usable width. The monthly calendar keeps seven readable columns and uses compact event chips. Filters and summary metrics wrap naturally.

Coalición Venezuela lives on a separate public, mobile-first route instead of becoming another UCV tab. It inherits the same Organic tokens and typography, but its information architecture is purpose-built for one field event: operational pulse, calendar, contacts, inventory, and beneficiary batches. Consultation opens without an account; editing and full contact details require the shared operational key. Its signature is the four-stage delivery route, which explains the group flow without storing beneficiary identities.

The built-in editing mode may reorder navigation views and the three primary board blocks. Reordering changes information placement, not the underlying visual hierarchy: color roles, typography families and semantic status treatments remain canonical.

## Elevation & Depth

Use the existing soft ink-tinted shadow tokens. Static nested content stays mostly flat; interactive cards and modal surfaces may use the small or medium elevation token.

## Shapes

Containers are generously rounded. Controls and compact status markers use pill geometry. The softness should support scanning without weakening the institutional tone.

## Components

Task cards show category, priority, owner, time horizon, next action, and movement controls. Event cards show type, date, time, location, status and completion out of five internal-audit checks; their status colors reuse the Organic palette. Calendar day cells open a focused list and the event editor. Each hierarchy unit shows an editable app-development status beside its title: En desarrollo, Desarrollo de la app resuelto or Sin desarrollar aún. Contact cards show only confirmed information; unknown details read "Por confirmar" and are never fabricated. Native select, date and time controls are accepted for this portable artifact; the browser owns their popup geometry.

The editing panel owns three density variants—compact, normal and large—for KPI cards, journey bubbles, contact bubbles and calendar event chips. It also owns a restrained three-step scale for the principal title. These are layout variants, not new design tokens.

The existing runtime CSS variables in `_ds/.../styles.css` remain the token source of truth. This file mirrors their accepted semantic roles and records the board-specific usage.

## Do's and Don'ts

- Do use concrete action verbs and visible ownership.
- Do preserve unanswered questions as explicit pending items.
- Do keep UCV and Florangel coordination linked without presenting Florangel as part of the UCV hierarchy.
- Do not invent names, emails, phone numbers, meeting dates, or institutional approvals.
- Do keep the Coalición Venezuela logistics front on its own public mobile route and link to it as a peer dashboard.
- Do not mix the Harvey logistics data into the UCV board.
- Do not place contact details, identity numbers, private addresses, or event records directly in public HTML or JavaScript.
- Do not use red for ordinary pending work.
