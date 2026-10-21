# Project summary

**Cachedigitech Bulk Emailing Tool, Phase 1.** Internal app for Marketing and Sales. It sends campaigns from Microsoft 365 mailboxes to contacts that come from Zoho CRM, and it shows what happened.

## Loop

Import or sync contacts → design the email → send the campaign → track events → view analytics.

## Users

| Role | Can do |
|---|---|
| Admin | Users, teams, mailboxes, settings, all data |
| Marketing | Marketing mailboxes, templates, campaigns, Marketing analytics |
| Sales | Sales mailboxes, templates, campaigns, Sales analytics |

One user, one team. Admins see every team.

## Shape

One codebase, three Node.js processes, one MySQL 8 database. No Redis. The queue is a table (`campaign_recipients`) claimed with `FOR UPDATE SKIP LOCKED`.

| Process | Job |
|---|---|
| API | Login, CRUD, uploads, campaign controls, analytics reads |
| Worker | Send, read bounces and replies, Zoho sync, stats, backups |
| Tracking | Open pixel, click redirect, unsubscribe page |

Frontend is React (Vite), Tailwind CSS, and lucide-react. Emails are block JSON rendered to MJML on the server, then sent with Microsoft Graph `sendMail`.

## Hosts

- `mailer.cachedigitech.com` — app and API
- `track.cachedigitech.com` — tracking
- `media.cachedigitech.com` — images

Server is Ubuntu on Hostinger VPS/Cloud or on-prem, with Nginx and PM2. Shared hosting cannot run the worker.

## Scale and limits

Designed for roughly 5,000–20,000 emails per day. Microsoft 365 limits are the real ceiling. Amazon SES can be added later behind the same `Sender` interface.

## Not in Phase 1

Cold sequences, master inbox, visual workflows, lead scoring, replacing Zoho, public API. Zoho write-back of opens and clicks is Phase 1.5.

## Done when

A marketer sends a campaign in under 15 minutes, 99% of queued mail needs no manual fix, there are zero duplicate sends, and the dashboard matches events within 5 minutes.
