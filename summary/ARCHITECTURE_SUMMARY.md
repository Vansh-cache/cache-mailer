# Architecture summary

Source: `doc/ARCHITECTURE.md`.

## Style

Modular monolith. Three Node processes share one codebase and one MySQL database so the team runs one server and no Redis or message broker.

```
Browser --HTTPS--> Nginx
  mailer.*  -> React static + API :4000
  track.*   -> Tracking :4100
  media.*   -> image files

API and Tracking and Worker --> MySQL (data + queue + events + stats)
Worker --> Microsoft Graph (send and read) and Zoho CRM
Recipients --> track.* for open, click, unsubscribe
```

## Who does what

- **Web:** Vite SPA. Pages for login, dashboard, contacts, segments and tags, templates, editor, campaign wizard, report, mailboxes, users, settings, health. Editor state is Zustand, saved as JSON.
- **API:** Auth and team guards, CRUD, image upload, MJML render, campaign commands, stats reads.
- **Worker:** every minute start schedules, recover locks, aggregate stats, check bounce auto-pause; every few seconds send per mailbox; every 2–5 minutes read mail; every 15–60 minutes Zoho; nightly backup.
- **Tracking:** tiny, no login, writes events. A tracking outage does not stop sending.
- **MySQL:** localhost only, nightly dump copied off-server.
- **Media:** local disk behind `StorageService`, long-cache Nginx.
- **Sender:** `GraphSender` now, `SesSender` later, same interface.

## Send flow

Precheck → freeze HTML and text → resolve audience → insert queued recipient rows with tokens → status Sending. Worker claims rows, checks suppression, personalizes, rewrites links, calls `sendMail`, marks sent or retry.

## Deploy

Ubuntu, Nginx, PM2 (`mailer-api`, `mailer-worker`, `mailer-tracking`), MySQL, `/var/www/mailer-web`, `/var/www/cachedigitech-media`, `/var/backups/mailer`. Firewall 22/80/443. Outbound HTTPS only to Microsoft and Zoho.

Release: build web, build server, migrate, `pm2 reload`, check health. Roll back the release folder first. Restore the database only to undo a migration.

## Growth

| Stage | Change |
|---|---|
| 1 | One server, up to ~20k emails/day |
| 2 | MySQL on its own machine, more workers |
| 3 | Add SES when M365 is the bottleneck |
| 4 | Partition events or move analytics to ClickHouse |
| 5 | Second app server, replica, object storage |

## Trade-offs worth remembering

MySQL queue is durable and simple, and it is not a high-throughput broker. One server is a single failure point. Frozen snapshots stop template edits from changing a live campaign. Stats can lag about a minute. Delivered counts are sent minus bounces. Opens are approximate.
