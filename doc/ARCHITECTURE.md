# Architecture

**Project:** Cachedigitech Bulk Emailing Tool (Phase 1)
**Deployment target:** Hostinger Cloud/VPS or on-prem Linux server (single server to start)

---

## 1. Architecture Style

A **modular monolith** deployed as **three Node.js processes** sharing one codebase and one MySQL database. This keeps operations simple (one server, no Redis, no message broker) while separating the parts that must not block each other.

| Process | Purpose | Public? |
|---|---|---|
| **API** | Serves the React app's REST API (auth, contacts, editor, campaigns, analytics) | Yes, behind login |
| **Worker** | Sends emails, reads mailboxes, syncs Zoho, aggregates stats, runs backups | No |
| **Tracking** | Open pixel, click redirect, unsubscribe pages | Yes, no login, own subdomain |

## 2. High-Level Diagram

```
                         ┌─────────────────────────────┐
                         │   Users (Sales / Marketing  │
                         │   / Admin) - browser        │
                         └──────────────┬──────────────┘
                                        │ HTTPS
                                        ▼
┌───────────────────────────────────────────────────────────────────┐
│                      SERVER (Hostinger VPS / on-prem)             │
│                                                                   │
│  ┌─────────────────────── Nginx (TLS, reverse proxy) ──────────┐  │
│  │ mailer.cachedigitech.com   -> React build (static) + /api   │  │
│  │ track.cachedigitech.com    -> Tracking process              │  │
│  │ media.cachedigitech.com    -> /var/www/media (static files) │  │
│  └──────┬───────────────────────────┬──────────────────┬───────┘  │
│         │                           │                  │          │
│   ┌─────▼─────┐              ┌──────▼──────┐     ┌─────▼──────┐   │
│   │  API      │              │  Tracking   │     │  Media     │   │
│   │ (Node.js) │              │  (Node.js)  │     │  files     │   │
│   └─────┬─────┘              └──────┬──────┘     └─────▲──────┘   │
│         │                           │                  │          │
│         │         ┌─────────────────▼───┐              │          │
│         └────────►│     MySQL 8         │◄─────┐       │          │
│                   │ app data + QUEUE    │      │       │          │
│                   │ + events + stats    │      │       │          │
│                   └─────────────────────┘      │       │          │
│                                                │       │          │
│                          ┌─────────────────────┴───┐   │          │
│                          │  WORKER (Node.js)       │   │          │
│                          │ - Send loop per mailbox │   │          │
│                          │ - Mailbox reader        │   │          │
│                          │ - Zoho sync             │   │          │
│                          │ - Aggregator            │   │          │
│                          │ - Backup / cleanup      │   │          │
│                          └───────┬───────────┬─────┘   │          │
│                                  │           │         │          │
└──────────────────────────────────┼───────────┼─────────┼──────────┘
                                   │           │         │
                    HTTPS (Graph)  │           │ HTTPS   │ upload
                                   ▼           ▼         │ (via API)
                    ┌──────────────────┐  ┌─────────────┐
                    │ Microsoft 365    │  │ Zoho CRM    │
                    │ Graph API        │  │ API         │
                    │ - sendMail       │  │ Contacts /  │
                    │ - read inbox     │  │ Leads       │
                    └────────┬─────────┘  └─────────────┘
                             │
                             ▼
                      Recipients' inboxes
                             │ open / click / unsubscribe
                             ▼
                  track.cachedigitech.com (Tracking process)
```

## 3. Component Responsibilities

### 3.1 Frontend (React + Tailwind + lucide-react)
- Single-page app built with Vite; static files served by Nginx.
- Pages: Login, Dashboard, Contacts, Segments & Tags, Templates, **Email Editor**, Campaign Wizard, Campaign Report, Mailboxes (admin), Users (admin), Settings, System Health.
- Talks only to `/api` over HTTPS with cookie authentication.
- Editor state lives in the browser (Zustand) and is saved as JSON through the API.

### 3.2 API process
- Authentication, role and team guards.
- CRUD for contacts, tags, segments, templates, campaigns, mailboxes, users.
- Image upload handling (validate, resize, store, return URL).
- Template rendering and preview (JSON -> MJML -> HTML).
- Campaign control actions: send, schedule, pause, resume, cancel.
- Analytics read endpoints (reads from `campaign_stats` tables).

### 3.3 Worker process
| Job | Frequency | Description |
|---|---|---|
| Scheduler tick | every minute | Start scheduled campaigns |
| Send loop | every few seconds, per mailbox | Claim queued rows, render, send via Graph |
| Stuck-job recovery | every minute | Re-queue expired `processing` rows |
| Mailbox reader | every 2-5 minutes | Read bounces and replies via Graph delta |
| Aggregator | every minute | Update campaign statistics |
| Zoho sync | every 15-60 minutes | Pull changed contacts/leads |
| Auto-pause check | every minute | Pause campaigns with bounce spikes |
| Backup / cleanup | nightly | Database dump, old log cleanup |

### 3.4 Tracking process
- Minimal dependencies and no login, so it stays fast and isolated from API problems.
- Writes events directly to MySQL (batched inserts under heavy load).
- If it goes down, emails are unaffected; only tracking for that period is lost.

### 3.5 MySQL
- Single source of truth for data **and** the send queue.
- Bound to localhost only.
- Nightly dump copied off-server.

### 3.6 Media storage
- Uploaded images stored on a dedicated directory/volume on the server.
- Nginx serves them at `media.cachedigitech.com` with long cache lifetimes.
- Accessed in code through a `StorageService` interface, so it can move to S3-compatible storage later.

### 3.7 Sender abstraction
```
interface Sender {
  send(mailbox, message): Promise<SendResult>
  checkConnection(mailbox): Promise<Status>
}

GraphSender   -> Microsoft Graph (Phase 1)
SesSender     -> Amazon SES (later, no other code changes)
```

## 4. Key Flows

### 4.1 Build and save an email
```
Editor (React) -> PUT /api/templates/:id {design_json}
API: validate -> sanitize -> render MJML -> store design_json + html + text
```

### 4.2 Send a campaign
```
User clicks Send
 -> API: precheck -> freeze HTML/text snapshot -> resolve audience
 -> insert campaign_recipients rows (status=queued, mailbox assigned, token generated)
 -> campaign status = sending

Worker (per mailbox):
 claim rows (SKIP LOCKED) -> check suppression -> personalize
 -> rewrite links + add pixel + footer -> Graph sendMail
 -> mark sent / retry / failed -> random delay -> next
```

### 4.3 Recipient interaction
```
Recipient opens email   -> GET track/o/{token}.gif -> event 'open'
Recipient clicks link   -> GET track/c/{token}/{linkId} -> event 'click' -> 302 to real URL
Recipient unsubscribes  -> POST track/u/{token} -> contact unsubscribed + suppression + event
```

### 4.4 Bounce and reply handling
```
Worker (mailbox reader): Graph inbox delta
 -> NDR found    -> parse recipient + status -> event 'bounce_*' -> suppress if hard
 -> Reply found  -> match In-Reply-To -> event 'reply'
```

### 4.5 Analytics
```
Events (raw) -> Aggregator -> campaign_stats + campaign_stats_hourly
React dashboard -> GET /api/campaigns/:id/stats -> reads summary tables
```

### 4.6 Zoho sync
```
Worker: GET Zoho Contacts/Leads modified since last run
 -> upsert contacts -> apply opt-out flags to suppression -> save sync state
```

## 5. Deployment Architecture

### 5.1 Single-server layout (start here)
```
Server: Ubuntu LTS (Hostinger VPS/Cloud or on-prem)
├── Nginx            (ports 80/443)
├── PM2
│   ├── mailer-api       (127.0.0.1:4000)
│   ├── mailer-worker    (no port)
│   └── mailer-tracking  (127.0.0.1:4100)
├── MySQL 8          (127.0.0.1:3306)
├── /var/www/mailer-web        (React build)
├── /var/www/cachedigitech-media (uploads)
└── /var/backups/mailer        (nightly dumps, then copied off-server)
```

### 5.2 Domains and DNS
| Hostname | Points to | Purpose |
|---|---|---|
| `mailer.cachedigitech.com` | Server IP | App and API |
| `track.cachedigitech.com` | Server IP | Tracking links |
| `media.cachedigitech.com` | Server IP | Image hosting |

Use a **subdomain or a separate domain** for tracking and, ideally, for sending. Tracking links in emails reflect on your sender reputation; shared or suspicious tracking domains hurt deliverability. Confirm SPF/DKIM/DMARC for the sending mailboxes' domain with IT.

### 5.3 Network and security
- Firewall: only 22 (restricted), 80, 443 open.
- MySQL not exposed publicly.
- Outbound calls only to `graph.microsoft.com`, `login.microsoftonline.com`, and Zoho API/accounts domains over HTTPS (port 443, so no outbound SMTP port issues).
- All secrets in `.env` with restricted file permissions.

### 5.4 Deployment procedure
1. `git pull` (or upload release) on the server.
2. Build React app, copy to `/var/www/mailer-web`.
3. Build server, run DB migrations.
4. `pm2 reload ecosystem.config.js`.
5. Check `/api/system/health`.
Rollback: restore previous release folder and `pm2 reload`; restore DB from backup only if a migration must be reverted.

### 5.5 Backups and recovery
| Item | Method | Frequency | Retention |
|---|---|---|---|
| MySQL | dump, compress, copy off-server | Nightly | 14-30 days |
| Uploads | rsync to off-server location | Nightly | 30 days |
| `.env` and configs | Encrypted copy kept by IT | On change | Latest + previous |
| Restore test | Restore into staging | Quarterly | n/a |

## 6. Scaling and Growth Path

| Stage | Trigger | Change |
|---|---|---|
| Stage 1 | Up to ~20k emails/day, few users | Single server as above |
| Stage 2 | CPU or DB contention | Move MySQL to its own server; more worker processes |
| Stage 3 | Microsoft 365 limits are the bottleneck | Add Amazon SES via `SesSender`; keep Graph for sales/low-volume mail and mailbox reading |
| Stage 4 | Event table very large | Partition `events` by month or move analytics to ClickHouse |
| Stage 5 | High availability needed | Second app server behind load balancer; MySQL replica; S3-compatible media storage |

## 7. Why This Architecture (Trade-offs)

| Decision | Reason | Trade-off |
|---|---|---|
| MySQL as queue instead of Redis | One less service to run and secure; durable by default; fine at this volume | Polling adds small latency; not suited for huge throughput |
| Three processes on one server | Isolation without complexity | Single point of failure until Stage 5 |
| Separate tracking process | Tracking traffic can't slow the app, and vice versa | One more process to monitor |
| Frozen campaign snapshot | Edits to a template can't change a running campaign | Slightly more storage |
| Pre-aggregated stats | Fast dashboards | Up to a minute of delay |
| Sender interface | Move to SES without a rewrite | Small abstraction overhead |
| Local disk for media | Simple, no extra cost | Must be backed up and can't scale across servers (fixed by S3 migration) |

## 8. Known Limitations to Communicate

1. **Microsoft 365 is not a bulk email platform.** Limits are low, throttling is possible, and there is no spam-complaint feedback. Keep volumes modest and lists clean.
2. **Delivered counts are estimates** (sent minus bounces), since M365 gives no delivery receipts through this flow.
3. **Open rates are approximate** because of Apple Mail Privacy Protection and security scanners; use clicks and replies as primary engagement signals.
4. **Header support via Graph is limited** (custom headers must start with `x-`), so the one-click `List-Unsubscribe` header needs verification in the pilot. The footer unsubscribe link is always present.
5. **Single server** means downtime during server failure or maintenance; backups and a documented restore procedure are required.
6. **Reputation risk:** a bad campaign can affect the domain used by your regular company email unless sending uses a separate domain or subdomain.
