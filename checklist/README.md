# Run checklist — Cachedigitech Bulk Emailing Tool

Use this folder to stand up and operate Phase 1. Source docs live in `doc/`. Short versions live in `summary/`.

Work top to bottom. Do not start a later milestone until the previous one is checked off.

## Order

| Step | File | Done when |
|---|---|---|
| 0 | [00-company-setup.md](00-company-setup.md) | IT, Zoho, and Marketing have handed over access and decisions |
| 1 | [01-local-dev.md](01-local-dev.md) | API, worker, tracking, and the React app run on your machine |
| 2 | [02-m1-auth-teams-database.md](02-m1-auth-teams-database.md) | Login, roles, teams, and MySQL schema work |
| 3 | [03-m2-contacts-zoho.md](03-m2-contacts-zoho.md) | CSV import, tags, suppression, and Zoho read sync work |
| 4 | [04-m3-mailboxes-graph.md](04-m3-mailboxes-graph.md) | A Microsoft 365 mailbox can check connection and send a test |
| 5 | [05-m4-editor-templates.md](05-m4-editor-templates.md) | An email can be designed, previewed, and test-sent |
| 6 | [06-m5-campaigns-sending.md](06-m5-campaigns-sending.md) | A throttled campaign sends with no duplicates |
| 7 | [07-m6-tracking.md](07-m6-tracking.md) | Opens, clicks, unsubscribes, bounces, and replies are recorded |
| 8 | [08-m7-analytics.md](08-m7-analytics.md) | Campaign and overview dashboards load from summary tables |
| 9 | [09-m8-hardening-pilot.md](09-m8-hardening-pilot.md) | Security review and a 100–500 contact pilot pass |
| 10 | [10-production-run.md](10-production-run.md) | The server is deployed and the daily runbook is in use |
| 11 | [11-campaign-pre-send.md](11-campaign-pre-send.md) | Every real campaign passes this list before send |

## What Phase 1 is

Import or sync contacts, design an email, send a campaign through Microsoft 365, track events, view analytics.

Out of scope now: cold sequences, a master inbox, a visual workflow builder, lead scoring, and replacing Zoho CRM.

## Processes you must keep running

| Process | Port | Public |
|---|---|---|
| API (`mailer-api`) | `127.0.0.1:4000` | Behind login, via Nginx |
| Worker (`mailer-worker`) | none | No |
| Tracking (`mailer-tracking`) | `127.0.0.1:4100` | Yes, on the tracking subdomain, no login |
| MySQL 8 | `127.0.0.1:3306` | No |
| Nginx | 80 / 443 | Yes |

There is no Redis. The send queue is the `campaign_recipients` table.
