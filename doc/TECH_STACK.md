# Tech Stack

**Project:** Cachedigitech Bulk Emailing Tool
**Deployment:** On-prem server or Hostinger Cloud/VPS
**Updated:** MySQL instead of PostgreSQL, no Redis, Hostinger-based storage, Microsoft Graph for sending

---

## 1. Summary

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React (Vite) + Tailwind CSS + lucide-react | SPA served as static files by Nginx |
| Backend | Node.js (LTS) with TypeScript, using NestJS or Express | One codebase, three processes: API, worker, tracking |
| Database | MySQL 8.0+ (InnoDB, utf8mb4) | Also acts as the job queue |
| Queue | MySQL table using `SELECT ... FOR UPDATE SKIP LOCKED` | Replaces Redis |
| Scheduler | `node-cron` inside the worker process | Zoho sync, mailbox reader, aggregator, backups |
| Email sending | Microsoft Graph API (`sendMail`) | App-only (client credentials), multiple mailboxes |
| Bounce/reply reading | Microsoft Graph Mail read (delta queries) | Parses NDRs and replies |
| CRM | Zoho CRM REST API v6+ (OAuth 2.0) | Use the company's data center domain (.in/.com/.eu) |
| File storage | Hostinger VPS disk (dedicated uploads volume) served by Nginx | Abstracted so it can move to S3-compatible storage |
| Web server / proxy | Nginx + Let's Encrypt (Certbot) | HTTPS for app and tracking subdomain |
| Process manager | PM2 (or systemd) | Auto-restart, logs, cluster mode |
| Email rendering | MJML (server side) | Block JSON to email-safe HTML |
| Hosting | Hostinger VPS/Cloud (root access) or on-prem Linux server | Ubuntu 22.04/24.04 LTS |

> **Hosting note:** Basic Hostinger shared/web hosting is **not** suitable. The tool needs long-running background workers, Nginx control, and MySQL tuning, so choose a **VPS or Cloud plan with root access**. Verify the current plans and specs on Hostinger's site.

## 2. Frontend

| Item | Choice | Purpose |
|---|---|---|
| Framework | React 18+ with Vite | Fast dev and build |
| Language | TypeScript | Fewer bugs in editor and forms |
| Styling | Tailwind CSS | Utility-first styling |
| Icons | lucide-react | Consistent icon set |
| Routing | React Router | Pages and protected routes |
| Server state | TanStack Query | API caching, loading and error states |
| Forms | React Hook Form + Zod | Validation |
| Drag-and-drop | dnd-kit | Reordering email blocks |
| Rich text | TipTap (ProseMirror) | Text block formatting and links |
| Color picker | react-colorful | Background and text colors |
| Charts | Recharts | Analytics charts |
| Tables | TanStack Table | Contact and recipient tables |
| Notifications | react-hot-toast | Success/error messages |
| Local UI state | Zustand | Editor state, undo/redo |

**Editor alternative:** if the custom editor takes too long, embed **GrapesJS** or **Unlayer (react-email-editor)** instead. The custom approach (dnd-kit + TipTap + MJML) is recommended because it matches the Tailwind/lucide stack and gives full control.

## 3. Backend

| Item | Choice | Purpose |
|---|---|---|
| Runtime | Node.js LTS | Server runtime |
| Framework | NestJS (preferred) or Express | Structure, validation, guards |
| ORM / query | Prisma or Knex (with mysql2) | Migrations and queries; raw SQL for the queue claim query |
| Auth | JWT in httpOnly cookie, bcrypt/argon2 password hashing | Sessions |
| Validation | Zod or class-validator | Request validation |
| Graph client | `@azure/msal-node` + `@microsoft/microsoft-graph-client` (or plain HTTPS) | Token acquisition and Graph calls |
| Email rendering | `mjml`, `html-to-text` | HTML and plain-text output |
| HTML sanitizing | `sanitize-html` | Clean rich text before render |
| CSV | `csv-parse`, `csv-stringify` | Import and export |
| Image processing | `sharp` | Resize and compress uploads |
| File uploads | `multer` | Multipart handling |
| Scheduler | `node-cron` | Periodic jobs |
| Logging | `pino` | Structured logs |
| Rate limiting | `@nestjs/throttler` or `express-rate-limit` (in memory) | Protect login and public endpoints |
| Encryption | Node `crypto` (AES-256-GCM) | Encrypt stored secrets |
| Testing | Jest, Supertest | Unit and API tests |

## 4. Database (MySQL)

- **Version:** MySQL 8.0 or later (needed for `SKIP LOCKED`). MariaDB 10.6+ also supports it.
- **Engine and charset:** InnoDB, `utf8mb4`, collation `utf8mb4_unicode_ci`.
- **Used for:** application data, the send queue, raw events, and aggregated stats.
- **Event growth:** index `events` by `(campaign_id, type, created_at)` and `(recipient_id)`; keep dashboards on `campaign_stats` (pre-aggregated); archive or partition events older than 12-18 months.
- **Backups:** nightly `mysqldump` (or `mysqlbackup`) with 14-30 day retention, copied **off the server** (a second Hostinger location, company storage, or cloud bucket). Test restores quarterly.
- **Access:** bind MySQL to localhost, no public port.

## 5. Queue Design Without Redis

The `campaign_recipients` table doubles as the job table. Workers claim rows using:

```sql
START TRANSACTION;
SELECT id FROM campaign_recipients
 WHERE status = 'queued' AND next_attempt_at <= NOW() AND sender_id = ?
 ORDER BY id LIMIT 10
 FOR UPDATE SKIP LOCKED;
UPDATE campaign_recipients
   SET status='processing', locked_by=?, locked_until = NOW() + INTERVAL 5 MINUTE
 WHERE id IN (...);
COMMIT;
```

This is safe with multiple worker processes, survives restarts (a recovery job re-queues rows whose `locked_until` has passed), and removes the need for Redis. At Phase 1 volumes (thousands of emails per day), MySQL handles this easily because Microsoft 365 limits are the real bottleneck.

## 6. Microsoft 365 / Graph Setup

| Item | Detail |
|---|---|
| Registration | One app registration in Entra ID (Azure AD) |
| Auth flow | Client credentials (app-only) with certificate or client secret |
| Permissions (application) | `Mail.Send` (send), `Mail.ReadWrite` or `Mail.Read` (bounces/replies); admin consent required |
| Scope restriction | Limit the app to chosen mailboxes only, using **RBAC for Applications in Exchange Online** (or the legacy Application Access Policy). Without this, the app could access every mailbox |
| Send endpoint | `POST /users/{mailbox}/sendMail` |
| Read endpoint | `GET /users/{mailbox}/mailFolders/inbox/messages/delta` |
| Mailboxes | Dedicated or shared mailboxes for Sales and Marketing; each stored as a row in `sender_accounts` |
| Throttling | Honor HTTP 429 and `Retry-After`; apply per-mailbox limits in the tool |
| Verify | Current Exchange Online limits (recipients/day, messages/minute, external recipient limits) for your tenant |

**Known caveat:** Graph `sendMail` only accepts custom internet message headers that start with `x-`, so the standard one-click `List-Unsubscribe` header may not be settable. The footer unsubscribe link is always included. Test header behavior during the pilot; if needed, fall back to SMTP AUTH with OAuth for sending while keeping Graph for reading.

## 7. Zoho CRM

| Item | Detail |
|---|---|
| Auth | OAuth 2.0 (self client or server-based client), refresh token stored encrypted |
| Data center | Use the matching domain (`zohoapis.in`, `.com`, `.eu`, etc.) |
| Scopes | `ZohoCRM.modules.contacts.READ`, `ZohoCRM.modules.leads.READ`; add `.UPDATE` or notes scopes for write-back |
| Sync method | Scheduled incremental pull using `Modified_Time`, paginated |
| Test | Use a Zoho sandbox or a small set of dummy records first |

## 8. File Storage

- **Phase 1:** images saved to a dedicated directory/volume on the server (for example `/var/www/cachedigitech-media/`), served by Nginx at `https://media.cachedigitech.com/...` with long cache headers.
- Backed up together with the database.
- Access through a `StorageService` interface (`save`, `getUrl`, `delete`) so switching to an S3-compatible bucket later requires changing one class.
- Limits: 5 MB per image; JPG, PNG, GIF, WebP only; files renamed to random names; SVG disallowed.

## 9. Infrastructure and DevOps

| Item | Choice |
|---|---|
| OS | Ubuntu LTS |
| Reverse proxy | Nginx |
| TLS | Let's Encrypt via Certbot (auto-renew) |
| Process management | PM2 with ecosystem file (api, worker, tracking) |
| Firewall | UFW: allow 22 (restrict by IP), 80, 443 only |
| SSH | Key-based only, disable password login, fail2ban |
| Version control | Git (company GitHub/GitLab/Azure DevOps) |
| CI/CD | GitHub Actions or simple deploy script (build, upload, migrate, `pm2 reload`) |
| Monitoring | UptimeRobot or similar for HTTPS health check; PM2 logs; optional Grafana/Prometheus later |
| Environments | `dev` (local), `staging` (small VPS or same VPS with separate DB), `production` |
| Secrets | `.env` file with strict permissions, outside the repository |

## 10. Suggested Project Structure

```
bulk-mailer/
├── apps/
│   ├── web/                  # React + Vite + Tailwind
│   │   └── src/
│   │       ├── pages/        # Contacts, Editor, Campaigns, Analytics, Settings
│   │       ├── components/   # UI + editor blocks
│   │       ├── lib/          # api client, utils
│   │       └── store/        # Zustand stores
│   └── server/               # Node.js (TypeScript)
│       └── src/
│           ├── modules/      # auth, contacts, templates, campaigns, senders, analytics, zoho
│           ├── workers/      # send worker, mailbox reader, aggregator, zoho sync
│           ├── tracking/     # public open/click/unsubscribe endpoints
│           ├── providers/    # graph.sender.ts, (ses.sender.ts later)
│           ├── storage/      # local.storage.ts
│           └── db/           # migrations, seeds
├── docs/                     # PRD, FEATURES, SYSTEM_DESIGN, ARCHITECTURE, TECH_STACK
└── ecosystem.config.js       # PM2 processes
```

## 11. Key Environment Variables

```
NODE_ENV=production
APP_URL=https://mailer.cachedigitech.com
TRACKING_URL=https://track.cachedigitech.com
MEDIA_URL=https://media.cachedigitech.com
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=bulk_mailer
DB_USER=...
DB_PASSWORD=...
JWT_SECRET=...
ENCRYPTION_KEY=...            # 32-byte key for AES-256-GCM
MS_TENANT_ID=...
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...          # or certificate path
ZOHO_ACCOUNTS_URL=https://accounts.zoho.in
ZOHO_API_URL=https://www.zohoapis.in
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
UPLOAD_DIR=/var/www/cachedigitech-media
```

## 12. Upgrade Path

| When | Change |
|---|---|
| Volume outgrows M365 limits | Add `ses.sender.ts` (Amazon SES) behind the same sender interface |
| Event table becomes very large | Partition by month or move events to ClickHouse |
| Need high availability | Separate DB server, second app server behind a load balancer, replicas |
| Need more storage | Switch `StorageService` to S3-compatible object storage |
| Queue pressure | Add more worker processes; consider Redis/BullMQ only if MySQL becomes the bottleneck |
