# System Design

**Project:** Cachedigitech Bulk Emailing Tool (Phase 1)
**Stack:** React + Tailwind + lucide-react, Node.js, MySQL 8 (also the queue), Microsoft Graph, Zoho CRM

---

## 1. Design Principles

1. **Everything in MySQL.** No Redis. The send queue is a table.
2. **Sender is swappable.** Microsoft Graph sits behind a `Sender` interface so Amazon SES can be added later.
3. **Never double-send.** Unique constraints and row locking guard every send.
4. **Fast public endpoints.** Tracking runs as its own lightweight process.
5. **Pre-aggregate analytics.** Dashboards read summary tables, not millions of raw events.
6. **Team isolation.** Every query is scoped by the user's team unless the user is Admin.

## 2. Modules

| Module | Responsibility |
|---|---|
| Auth & Users | Login, roles, teams, audit log |
| Contacts | Contacts, tags, segments, CSV import, suppression |
| Zoho Sync | Pull contacts/leads; later write back activity |
| Media | Image upload, resize, serve |
| Editor & Templates | Block JSON, MJML rendering, drafts, templates |
| Mailboxes | Microsoft 365 sender accounts, limits, health |
| Campaigns | Wizard, audience resolution, scheduling, controls |
| Send Worker | Claims queued rows, renders, sends via Graph |
| Tracking | Open pixel, click redirect, unsubscribe page |
| Mailbox Reader | Reads bounces (NDRs) and replies via Graph |
| Aggregator | Builds campaign statistics |
| Analytics API | Serves dashboards and reports |

## 3. Email Editor Design

### 3.1 Document model (stored as JSON)

```json
{
  "version": 1,
  "settings": {
    "outerBg": "#f4f4f4",
    "contentBg": "#ffffff",
    "width": 600,
    "fontFamily": "Arial, Helvetica, sans-serif",
    "baseFontSize": 16,
    "textColor": "#222222",
    "linkColor": "#0066ff"
  },
  "blocks": [
    { "id": "b1", "type": "text",
      "html": "<p>Hi {{first_name | there}},</p>",
      "style": { "fontSize": 16, "align": "left", "padding": "16px", "bg": "transparent" } },
    { "id": "b2", "type": "image",
      "src": "https://media.cachedigitech.com/u/abc123.png",
      "alt": "Banner", "width": "100%", "align": "center", "href": "https://example.com" },
    { "id": "b3", "type": "button",
      "label": "Book a demo", "href": "https://example.com/demo",
      "style": { "bg": "#0066ff", "color": "#ffffff", "fontSize": 16, "radius": 6, "align": "center" } },
    { "id": "b4", "type": "divider", "style": { "color": "#dddddd", "height": 1 } },
    { "id": "b5", "type": "spacer", "height": 24 }
  ]
}
```

### 3.2 Frontend behavior
- **Left panel:** block palette (Text, Image, Button, Divider, Spacer) with lucide icons.
- **Center canvas:** live preview of blocks; drag handle to reorder (dnd-kit); hover toolbar with move up/down, duplicate, delete.
- **Right panel:** settings of the selected block (size, colors, alignment, link) or global email settings.
- **Text block:** TipTap with bold, italic, underline, link, color, size, alignment, and a "Insert merge tag" dropdown.
- **State:** Zustand store with undo/redo history; autosave draft every 30 seconds.

### 3.3 Rendering pipeline (server)
```
Design JSON -> sanitize -> convert blocks to MJML -> MJML to HTML (inline CSS, tables)
            -> plain-text generated with html-to-text
            -> stored in templates.html / templates.text for preview
```
At **send time** a per-recipient step runs: replace merge tags (with fallbacks), rewrite links for tracking, append open pixel and footer.

## 4. Database Schema (MySQL 8)

```sql
CREATE TABLE teams (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE            -- 'Sales', 'Marketing'
);

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','marketing','sales') NOT NULL,
  team_id TINYINT UNSIGNED NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE sender_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  team_id TINYINT UNSIGNED NOT NULL,
  from_name VARCHAR(100) NOT NULL,
  from_email VARCHAR(190) NOT NULL UNIQUE,     -- the M365 mailbox address
  reply_to VARCHAR(190) NULL,
  provider ENUM('graph','ses') NOT NULL DEFAULT 'graph',
  daily_limit INT UNSIGNED NOT NULL DEFAULT 500,
  per_minute_limit INT UNSIGNED NOT NULL DEFAULT 20,
  status ENUM('active','paused','error') NOT NULL DEFAULT 'active',
  last_error TEXT NULL,
  inbox_delta_link TEXT NULL,                  -- Graph delta token for reading mail
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  company VARCHAR(190) NULL,
  job_title VARCHAR(150) NULL,
  status ENUM('active','unsubscribed','bounced') NOT NULL DEFAULT 'active',
  source VARCHAR(50) NULL,                     -- 'zoho','csv','manual'
  consent_note VARCHAR(255) NULL,
  zoho_id VARCHAR(40) NULL,
  zoho_module ENUM('contacts','leads') NULL,
  custom_fields JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_zoho (zoho_id)
);

CREATE TABLE tags (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE contact_tags (
  contact_id BIGINT UNSIGNED NOT NULL,
  tag_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (contact_id, tag_id),
  INDEX idx_tag (tag_id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE segments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  team_id TINYINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  rules JSON NOT NULL,                         -- filter definition
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(190) NOT NULL,
  url VARCHAR(500) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  team_id TINYINT UNSIGNED NULL,
  name VARCHAR(150) NOT NULL,
  kind ENUM('draft','template') NOT NULL DEFAULT 'template',
  visibility ENUM('team','shared') NOT NULL DEFAULT 'team',
  design_json JSON NOT NULL,
  html MEDIUMTEXT NULL,
  text_version MEDIUMTEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE campaigns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  team_id TINYINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  preheader VARCHAR(255) NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  html_snapshot MEDIUMTEXT NULL,               -- frozen copy at send time
  text_snapshot MEDIUMTEXT NULL,
  audience JSON NOT NULL,                      -- {tags:[], segmentId, excludeTags:[]}
  use_utm BOOLEAN NOT NULL DEFAULT TRUE,
  status ENUM('draft','scheduled','sending','paused','sent','cancelled','failed')
         NOT NULL DEFAULT 'draft',
  scheduled_at DATETIME NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status_sched (status, scheduled_at)
);

CREATE TABLE campaign_senders (               -- mailboxes used by a campaign
  campaign_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (campaign_id, sender_id)
);

-- Doubles as the job queue
CREATE TABLE campaign_recipients (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,          -- assigned mailbox
  token CHAR(32) NOT NULL UNIQUE,              -- random, used in tracking URLs
  status ENUM('queued','processing','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  skip_reason VARCHAR(50) NULL,                -- 'suppressed','invalid', ...
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_by VARCHAR(40) NULL,
  locked_until DATETIME NULL,
  internet_message_id VARCHAR(255) NULL,       -- for matching bounces/replies
  last_error VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  UNIQUE KEY uq_campaign_contact (campaign_id, contact_id),
  INDEX idx_queue (status, sender_id, next_attempt_at),
  INDEX idx_campaign_status (campaign_id, status),
  INDEX idx_msgid (internet_message_id)
);

CREATE TABLE links (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT UNSIGNED NOT NULL,
  original_url VARCHAR(2000) NOT NULL,
  url_hash CHAR(40) NOT NULL,
  UNIQUE KEY uq_campaign_link (campaign_id, url_hash)
);

CREATE TABLE events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  type ENUM('delivered','bounce_hard','bounce_soft','open','click',
            'unsubscribe','reply') NOT NULL,
  link_id BIGINT UNSIGNED NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  user_agent VARCHAR(300) NULL,
  ip_hash CHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_campaign_type_time (campaign_id, type, created_at),
  INDEX idx_recipient (recipient_id, type)
);

CREATE TABLE campaign_stats (                  -- written by the aggregator
  campaign_id BIGINT UNSIGNED PRIMARY KEY,
  total_recipients INT UNSIGNED NOT NULL DEFAULT 0,
  sent INT UNSIGNED NOT NULL DEFAULT 0,
  failed INT UNSIGNED NOT NULL DEFAULT 0,
  bounced_hard INT UNSIGNED NOT NULL DEFAULT 0,
  bounced_soft INT UNSIGNED NOT NULL DEFAULT 0,
  unique_opens INT UNSIGNED NOT NULL DEFAULT 0,
  total_opens INT UNSIGNED NOT NULL DEFAULT 0,
  unique_clicks INT UNSIGNED NOT NULL DEFAULT 0,
  total_clicks INT UNSIGNED NOT NULL DEFAULT 0,
  unsubscribes INT UNSIGNED NOT NULL DEFAULT 0,
  replies INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE campaign_stats_hourly (           -- for time-series charts
  campaign_id BIGINT UNSIGNED NOT NULL,
  hour_start DATETIME NOT NULL,
  opens INT UNSIGNED NOT NULL DEFAULT 0,
  clicks INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, hour_start)
);

CREATE TABLE suppression_list (
  email VARCHAR(190) PRIMARY KEY,
  reason ENUM('unsubscribed','hard_bounce','manual','zoho_optout') NOT NULL,
  campaign_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE zoho_sync_state (
  module ENUM('contacts','leads') PRIMARY KEY,
  last_modified_time DATETIME NULL,
  last_run_at DATETIME NULL,
  last_status VARCHAR(50) NULL,
  last_error TEXT NULL
);

CREATE TABLE integration_secrets (            -- encrypted values (AES-256-GCM)
  name VARCHAR(60) PRIMARY KEY,               -- 'zoho_refresh_token', ...
  value_encrypted BLOB NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE settings (
  k VARCHAR(60) PRIMARY KEY,
  v TEXT NOT NULL                             -- company address, footer, thresholds
);

CREATE TABLE audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(50) NULL,
  entity_id BIGINT UNSIGNED NULL,
  meta JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Microsoft app credentials (tenant ID, client ID, secret/certificate) are shared across all mailboxes and live in environment variables, not per mailbox.

## 5. Campaign Lifecycle

```
Draft -> (Send now | Schedule) -> Sending -> Sent
              |                     |
              |                  Paused <-> Sending
              +-> Cancelled         +-> Failed (auto-pause on high bounce rate)
```

### 5.1 Starting a campaign
1. User completes the wizard; pre-send checks pass.
2. Backend **freezes** the content: renders final HTML and plain text into `html_snapshot` / `text_snapshot`, so later template edits do not alter an in-flight campaign.
3. Audience is resolved: contacts matching tags/segment, **minus** exclusions, **minus** status not `active`, **minus** `suppression_list`.
4. One `campaign_recipients` row is inserted per contact with a random `token`. Mailboxes are assigned **round-robin** (or weighted by remaining daily quota). The unique `(campaign_id, contact_id)` key prevents duplicates.
5. Status becomes `sending`; the worker picks rows up automatically.

### 5.2 Scheduling
The worker's scheduler checks every minute for `status='scheduled' AND scheduled_at <= NOW()` and starts those campaigns using the steps above.

### 5.3 Multi-day spreading
Rows stay `queued`. Each mailbox only sends while it has quota left today (see 6.3); the next day the counter resets and sending resumes. The campaign stays in `sending` until all rows finish.

## 6. Send Worker

### 6.1 Loop (per mailbox)
```
every 2-5 seconds, for each active mailbox:
  1. check quota: sent_today < daily_limit AND sent_last_minute < per_minute_limit
  2. claim up to N queued rows (FOR UPDATE SKIP LOCKED), mark 'processing'
  3. for each row:
       a. re-check contact status and suppression list -> skip if blocked
       b. personalize: merge tags + fallbacks
       c. rewrite links to https://track.<domain>/c/<token>/<linkId>
       d. add open pixel https://track.<domain>/o/<token>.gif and footer unsubscribe link
       e. call Graph sendMail
       f. success -> status 'sent', sent_at = now
          temporary error -> attempts+1, status 'queued', next_attempt_at = backoff
          permanent error -> status 'failed', last_error saved
       g. wait a random delay (for example 2-8 seconds)
```

### 6.2 Safety mechanisms
- **Crash recovery:** a job runs every minute that resets `processing` rows whose `locked_until` has passed back to `queued`.
- **No double-send:** the row is claimed under a lock before sending; the status moves to `sent` immediately after Graph returns success. If the process dies in the tiny window between the Graph call and the DB update, the row could be retried. The risk is reduced by marking `internet_message_id` in advance and checking the mailbox's Sent Items (via Graph) before retrying any row that was `processing` when it expired. Treat this as a documented edge case.
- **Graph throttling:** on HTTP 429 the mailbox is cooled down for the `Retry-After` time; rows go back to `queued`.
- **Mailbox errors:** repeated authentication or permission errors set the mailbox `status='error'` and notify the Admin.
- **Auto-pause:** if hard bounces exceed the configured threshold (for example 5% after at least 100 sends), the campaign moves to `paused` and the Admin is emailed.

### 6.3 Quota calculation
```sql
SELECT COUNT(*) FROM campaign_recipients
 WHERE sender_id = ? AND status = 'sent' AND sent_at >= CURDATE();   -- today
```
Per-minute counts use `sent_at >= NOW() - INTERVAL 1 MINUTE`. Limits are set conservatively in the tool (below Microsoft's published limits) and should be confirmed with IT.

## 7. Graph Sending Call

```
POST https://graph.microsoft.com/v1.0/users/{from_email}/sendMail
Authorization: Bearer <app-only token>
{
  "message": {
    "subject": "...",
    "body": { "contentType": "HTML", "content": "<html>...</html>" },
    "toRecipients": [{ "emailAddress": { "address": "rahul@example.com" } }],
    "replyTo": [{ "emailAddress": { "address": "sales@cachedigitech.com" } }],
    "internetMessageHeaders": [
      { "name": "x-cdt-campaign", "value": "123" }
    ]
  },
  "saveToSentItems": true
}
```
- Tokens are cached and refreshed before expiry.
- The plain-text alternative is not supported by `sendMail` JSON body (single body only). If a multipart text/HTML message is required, send MIME content instead; decide this in the pilot.
- `List-Unsubscribe` headers: Graph only allows `x-` custom headers, so verify in the pilot whether MIME sending preserves standard headers; otherwise rely on the footer link.
- Message IDs are fetched from Sent Items or sent with a known identifier to support bounce and reply matching.

## 8. Tracking Service (public, separate process)

| Endpoint | Behavior |
|---|---|
| `GET /o/{token}.gif` | Look up recipient, insert `open` event, return a 1x1 transparent GIF with no-cache headers |
| `GET /c/{token}/{linkId}` | Look up link, insert `click` event, respond `302` to the original URL (with UTM params) |
| `GET /u/{token}` | Show unsubscribe confirmation page |
| `POST /u/{token}` | Set contact `unsubscribed`, add to `suppression_list`, insert `unsubscribe` event, show confirmation |

**Rules**
- Invalid tokens: for clicks, redirect to the company website (never an error page); for opens, still return the GIF.
- Only redirect to URLs stored in the `links` table (prevents open-redirect abuse).
- Per-IP rate limiting to resist abuse.
- **Bot filtering:** a click within roughly 10 seconds of `sent_at`, a known scanner user-agent, or a click on every link in the same second marks `is_bot = TRUE`. Opens from known proxy ranges (for example Apple Mail Privacy Protection) are flagged and shown as "approximate".
- Store a hash of the IP, not the raw IP, to reduce privacy exposure.

## 9. Mailbox Reader (bounces and replies)

Runs every 2-5 minutes per mailbox:
1. Call Graph inbox **delta query** using the stored `inbox_delta_link`.
2. For each new message:
   - **Bounce (NDR):** sender such as `postmaster@` / `MicrosoftExchange...`, subject like "Undeliverable". Extract the original recipient and the status code (5.x.x = hard, 4.x.x = soft). Match to `campaign_recipients` using the original message ID or recipient + time window. Insert `bounce_hard` or `bounce_soft`; for hard bounces set the contact `bounced` and add to suppression.
   - **Reply:** match using `In-Reply-To` / `References` headers against `internet_message_id`. Skip auto-replies (out-of-office) from the reply count. Insert `reply` event.
3. Save the new delta link.

## 10. Aggregator

Every minute (and shortly after each campaign finishes) recompute stats for campaigns that are `sending` or were active in the last 7 days:
```sql
-- Example: unique opens excluding bots
SELECT COUNT(DISTINCT recipient_id) FROM events
 WHERE campaign_id=? AND type='open' AND is_bot=FALSE;
```
Results are written to `campaign_stats` and `campaign_stats_hourly`. Older campaigns are recomputed only when new events arrive.

**Metric definitions**
| Metric | Formula |
|---|---|
| Delivered (estimated) | sent - hard bounces - soft bounces |
| Bounce rate | (hard + soft) / sent |
| Unique open rate | unique opens / delivered (approximate) |
| CTR | unique clicks / delivered |
| CTOR | unique clicks / unique opens |
| Unsubscribe rate | unsubscribes / delivered |
| Reply rate | replies / delivered |

Microsoft 365 does not provide delivery receipts, so "delivered" is an estimate (sent minus bounces).

## 11. Zoho Sync

1. Scheduled every 15-60 minutes (and via "Sync now").
2. Call Zoho Contacts and Leads with `Modified_Time` filter since `last_modified_time`, paged (up to 200 per request).
3. Upsert into `contacts` by `zoho_id` (fall back to email match).
4. Map fields using the configured field map; store extra fields in `custom_fields`.
5. If the Zoho record is opted out / has "Email Opt Out" enabled, mark the contact `unsubscribed` and add to suppression.
6. Update `zoho_sync_state`. On error: keep last good timestamp, store error, notify Admin.
7. **Phase 1.5 write-back:** push summarized activity (for example a note or custom field "Last campaign opened/clicked") and opt-out status back to Zoho.

## 12. API Endpoints (internal REST, JSON)

```
Auth        POST /api/auth/login | /logout          GET /api/auth/me
Users       GET/POST /api/users      PATCH /api/users/:id           (admin)
Contacts    GET/POST /api/contacts   PATCH/DELETE /api/contacts/:id
            POST /api/contacts/import      GET /api/contacts/export
            POST /api/contacts/:id/tags    DELETE /api/contacts/:id/tags/:tagId
Tags        GET/POST /api/tags
Segments    GET/POST /api/segments   PUT/DELETE /api/segments/:id
Zoho        POST /api/zoho/sync      GET /api/zoho/status
Media       POST /api/assets         GET /api/assets
Templates   GET/POST /api/templates  GET/PUT/DELETE /api/templates/:id
            POST /api/templates/:id/duplicate    POST /api/templates/preview
            POST /api/templates/:id/test-send
Mailboxes   GET/POST /api/senders    PATCH /api/senders/:id        (admin)
            POST /api/senders/:id/check     POST /api/senders/:id/test
Campaigns   GET/POST /api/campaigns          GET/PUT /api/campaigns/:id
            POST /api/campaigns/:id/precheck | send | schedule | pause | resume | cancel | duplicate
Analytics   GET /api/campaigns/:id/stats | timeline | links | recipients | export
            GET /api/analytics/overview
System      GET /api/system/health           (admin)

Public (tracking process, no auth)
            GET /o/:token.gif   GET /c/:token/:linkId   GET|POST /u/:token
```

## 13. Security Design

| Area | Control |
|---|---|
| Passwords | argon2/bcrypt hashing; minimum length; lockout after repeated failures |
| Sessions | JWT in httpOnly, Secure, SameSite cookie; CSRF protection on state-changing requests |
| Authorization | Role + team check in a central guard; every query scoped by team |
| Secrets | AES-256-GCM encryption for stored tokens; master key only in environment; never logged |
| Graph access | Scoped to specific mailboxes through Exchange RBAC / application access policy |
| Uploads | Type and size validation, re-encoding through `sharp`, random file names, no SVG/HTML |
| Rich text | Sanitized with `sanitize-html` before rendering |
| Public endpoints | Random 128-bit tokens, rate limiting, redirect whitelist |
| Transport | HTTPS only, HSTS |
| Server | Firewall, key-only SSH, MySQL on localhost, regular OS updates |
| Privacy | Consent/source stored; hashed IPs; delete-contact function; DPDP/GDPR readiness |
| Audit | Login, send, pause, delete, mailbox and settings changes logged |

## 14. Error Handling and Alerts

| Situation | Behavior |
|---|---|
| Graph 429/5xx | Retry with exponential backoff (1m, 5m, 15m, 1h; max attempts configurable) |
| Graph 401/403 | Mailbox set to `error`, Admin notified |
| Hard bounce spike | Campaign auto-paused, Admin notified |
| Zoho sync failure | Retry next cycle, Admin notified after repeated failures |
| Worker crash | PM2 restarts; stuck rows re-queued automatically |
| Database backup failure | Admin notified |

## 15. Testing Plan

- **Unit:** merge tags and fallbacks, link rewriting, audience resolution, quota math, bounce parsing.
- **Integration:** Graph send against a test mailbox, Zoho sync against sandbox, queue claim with multiple workers.
- **Email rendering:** check output in Outlook (desktop and web), Gmail, and mobile clients.
- **Load:** 10,000 queued recipients with simulated sender; tracking endpoint under burst.
- **Pilot:** 100-500 real, opted-in contacts; verify spam placement, unsubscribe, bounce handling, and analytics.
