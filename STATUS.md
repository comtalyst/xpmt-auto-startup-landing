# Status — xpmt-auto-startup-landing

Last updated: 2026-01-30 16:15 PST

## Current product
- Landing page (Astro + Tailwind)
- Modern HN Reader at `/hn`

## In progress
- HN Reader: QA validation pass (desktop + mobile + a11y basics) — owner: qa-reviewer
- HN Reader: expand feeds (Ask/Show/Jobs) + comments view (threaded, collapse/expand) — owner: landing-staff-eng
- Reliability: rate-limit hardening (reduce/avoid halts) — owner: reliability-eng

## Recently shipped
- HN Reader MVP (Top/New/Best + reader view + caching)
- FIX: `/hn` client script is now bundled correctly; removed runtime `/lib/hn` 404 so stories load

## Blockers
- Org/Process: Discord role channels + pinned Operating Rules not set up yet in the new server until the bot is invited with **Manage Channels** (or Admin).

## Next (CTO)
1) Pin Operating Rules (CEO ack SLA + environment gate + definition-of-done) in the new server once permissions are in place.
2) Require every delegated task to declare: repo path + upstream + how it will be pushed.
3) After QA signoff: implement Ask/Show/Jobs + comments view.
