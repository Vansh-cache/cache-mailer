# Features summary

Source: `doc/FEATURES.md`. P0 is required for launch. P1 should ship in Phase 1 if time allows. P2 and “Later” wait.

## Launch (P0)

- Login, Admin / Marketing / Sales, team-scoped data, admin user management.
- Contact list, core fields, CSV import with validation and duplicates, tags, suppression, contact status.
- Zoho OAuth, scheduled pull of Contacts and Leads, Sync now.
- Block editor: text, image, button, links, drag reorder, duplicate and delete, email chrome (background, width), merge tags with fallbacks, desktop/mobile preview, test send, plain text, mandatory footer.
- Save draft and template, library, duplicate / rename / delete.
- Image upload with public cacheable URLs.
- Multiple Graph mailboxes, team assignment, from-name and reply-to, limits, connection check, test send, pause mailbox.
- Campaign wizard, audience and exclusions, subject and preheader, send now, schedule, throttling across days, pre-send checklist, pause / resume / cancel.
- MySQL queue, personalization, suppression check at send time, retry, idempotent sends, Graph 429 handling, stuck-job recovery.
- Open pixel, click redirects, unsubscribe page, hard/soft bounce reader, tracking on its own subdomain.
- Campaign stats and rates, unique vs total, time series, link report, recipient report.
- Company settings and footer, encrypted credentials, daily database backup.

## Should have in Phase 1 (P1)

Audit log, segments, contact timeline, CSV export, consent record, delete-on-request, Zoho field mapping, Zoho opt-out into suppression, move up/down, divider and spacer, undo/redo, template visibility and starter templates, image library and compression, mailbox rotation and health, duplicate campaign, bounce auto-pause, UTM tags, random send delay, reply detection, bot-click filtering, preference page, report export, overview dashboard, team and mailbox performance, health page, admin error email.

Zoho write-back of activity is P1 but **Phase 1.5**, not launch.

## Later

Microsoft SSO, MX checks, column layouts, raw HTML block, social icons, template version history, Amazon SES sender, subject A/B tests, recurring campaigns, Apple Mail open flagging, device breakdown, deliverability alerts.

Cold sequences, branching workflows, master inbox, lead scoring, a public API, and webhooks are out of scope.
