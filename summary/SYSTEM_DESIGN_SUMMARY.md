# System design summary

Source: `doc/SYSTEM_DESIGN.md`.

## Rules

Everything important is in MySQL. The sender is swappable. Unique keys and row locks prevent double-sends. Tracking is a separate fast process. Dashboards read summary tables. Queries are team-scoped unless the user is Admin.

## Email document

JSON with settings (backgrounds, width, font, colors) and blocks: text, image, button, divider, spacer. Merge tags live in the text HTML, with a fallback after `|`. The server sanitizes, converts to MJML, then to HTML and plain text. At send time only: personalize, rewrite links, add pixel and footer.

## Tables that matter

- `users`, `teams` — role and team wall
- `contacts`, `tags`, `segments`, `suppression_list` — audience
- `sender_accounts` — mailbox, limits, status, Graph delta link
- `templates` — design JSON plus rendered HTML and text
- `campaigns`, `campaign_senders` — frozen snapshot, audience JSON, status
- `campaign_recipients` — queue and send record, unique per campaign and contact, tracking token
- `links`, `events` — click targets and raw events (`is_bot`, hashed IP)
- `campaign_stats`, `campaign_stats_hourly` — what the UI reads
- `integration_secrets`, `settings`, `audit_log`, `zoho_sync_state`

Graph app credentials are environment variables, shared by every mailbox.

## Campaign states

Draft → Scheduled or Sending → Sent. Sending can pause and resume. High bounces move it to Paused (treated as a failed/auto-pause outcome). Cancel is available before completion.

Start: precheck, freeze content, drop suppressed and inactive contacts, insert one queued row per person, assign mailboxes, set Sending.

Quota for a mailbox is the count of `sent` rows since midnight, and since one minute ago.

## Tracking

| Route | Result |
|---|---|
| `GET /o/{token}.gif` | open event + transparent GIF |
| `GET /c/{token}/{linkId}` | click event + 302 to the stored URL |
| `GET` then `POST /u/{token}` | confirm, then unsubscribe and suppress |

Clicks only redirect to URLs already in `links`.

## Bounces and replies

Delta-read the inbox. NDRs become hard (5.x.x, suppress) or soft (4.x.x). Replies match `In-Reply-To` and skip out-of-office.

## Stats formulas

Delivered = sent − hard − soft. Bounce rate = bounces / sent. Open rate, CTR, unsubscribe rate, and reply rate use delivered as the denominator. CTOR = unique clicks / unique opens. Opens are approximate. Delivered is an estimate because M365 does not give delivery receipts here.

## Zoho

Every 15–60 minutes, pull records changed since the saved timestamp, upsert by Zoho id or email, copy opt-out into suppression. Phase 1.5 writes a summary back to the CRM record.

## API groups

Auth, users, contacts (import/export/tags), tags, segments, Zoho sync, assets, templates (preview, test send, duplicate), senders (check, test), campaigns (precheck, send, schedule, pause, resume, cancel, duplicate), analytics, system health. Public tracking routes are on the other process.

## Alerts

429/5xx retry with backoff. 401/403 marks the mailbox Error and emails Admin. Bounce spikes pause the campaign. Repeated Zoho failures and backup failures email Admin. PM2 restarts a dead worker.
