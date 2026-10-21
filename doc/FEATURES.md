# Features List

**Project:** Cachedigitech Bulk Emailing Tool
**Priority:** P0 = must have for launch, P1 = should have, P2 = nice to have / later

---

## 1. Authentication and Users

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-1.1 | Email/password login with secure hashing | P0 | 1 |
| F-1.2 | Roles: Admin, Marketing, Sales | P0 | 1 |
| F-1.3 | Teams (Sales, Marketing) and team-scoped data | P0 | 1 |
| F-1.4 | Admin creates, disables, and resets users | P0 | 1 |
| F-1.5 | Audit log | P1 | 1 |
| F-1.6 | Microsoft SSO login (Entra ID) | P2 | Later |

## 2. Contacts and Audience

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-2.1 | Contact list with search, filter, pagination | P0 | 1 |
| F-2.2 | Contact fields: email, name, company, job title, custom fields | P0 | 1 |
| F-2.3 | CSV import with column mapping and duplicate handling | P0 | 1 |
| F-2.4 | Email syntax validation on import | P0 | 1 |
| F-2.5 | Tags (add/remove, bulk apply) | P0 | 1 |
| F-2.6 | Saved segments (rule-based filters) | P1 | 1 |
| F-2.7 | Suppression list (unsubscribed, bounced) | P0 | 1 |
| F-2.8 | Contact status: Active / Unsubscribed / Bounced | P0 | 1 |
| F-2.9 | Per-contact activity timeline | P1 | 1 |
| F-2.10 | Export contacts to CSV | P1 | 1 |
| F-2.11 | Consent/source record per contact | P1 | 1 |
| F-2.12 | Delete contact and data on request | P1 | 1 |
| F-2.13 | MX/domain check for emails | P2 | Later |

## 3. Zoho CRM Integration

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-3.1 | OAuth connection to Zoho CRM | P0 | 1 |
| F-3.2 | Scheduled pull of Contacts and Leads | P0 | 1 |
| F-3.3 | Manual "Sync now" button with sync status | P0 | 1 |
| F-3.4 | Field mapping (Zoho field to tool field) | P1 | 1 |
| F-3.5 | Write back opens, clicks, bounces, unsubscribes | P1 | 1.5 |
| F-3.6 | Sync Zoho unsubscribe/opt-out flags into suppression list | P1 | 1 |

## 4. Email Editor

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-4.1 | Block-based editor | P0 | 1 |
| F-4.2 | Text block with rich formatting (bold, italic, underline, size, color, alignment) | P0 | 1 |
| F-4.3 | Image block (upload, alt text, width, alignment, link) | P0 | 1 |
| F-4.4 | Button block (label, link, colors, size, alignment) | P0 | 1 |
| F-4.5 | Links inside text | P0 | 1 |
| F-4.6 | Drag-and-drop reordering of blocks | P0 | 1 |
| F-4.7 | Up/down buttons as accessible alternative to drag | P1 | 1 |
| F-4.8 | Divider and spacer blocks | P1 | 1 |
| F-4.9 | Email background color, content background, width | P0 | 1 |
| F-4.10 | Duplicate and delete block | P0 | 1 |
| F-4.11 | Undo/redo | P1 | 1 |
| F-4.12 | Merge tags with fallback values | P0 | 1 |
| F-4.13 | Desktop/mobile preview | P0 | 1 |
| F-4.14 | Send test email | P0 | 1 |
| F-4.15 | Auto plain-text version | P0 | 1 |
| F-4.16 | Mandatory footer (unsubscribe + address) | P0 | 1 |
| F-4.17 | Two/three column block | P2 | 1.5 |
| F-4.18 | Raw HTML block | P2 | 1.5 |
| F-4.19 | Social icons block | P2 | 1.5 |

## 5. Templates and Saved Emails

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-5.1 | Save email as draft | P0 | 1 |
| F-5.2 | Save as reusable template | P0 | 1 |
| F-5.3 | Template library with search | P0 | 1 |
| F-5.4 | Duplicate, rename, delete template | P0 | 1 |
| F-5.5 | Visibility: Team-only or Shared across teams | P1 | 1 |
| F-5.6 | Starter templates (newsletter, announcement, plain personal) | P1 | 1 |
| F-5.7 | Version history | P2 | Later |

## 6. Media Library

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-6.1 | Image upload (JPG, PNG, GIF, WebP) with size limit | P0 | 1 |
| F-6.2 | Image library to reuse uploads | P1 | 1 |
| F-6.3 | Auto-resize/compress large images | P1 | 1 |
| F-6.4 | Public, cacheable image URLs | P0 | 1 |

## 7. Mailboxes (Microsoft 365 Senders)

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-7.1 | Add multiple mailboxes (Graph) | P0 | 1 |
| F-7.2 | Assign each mailbox to Sales or Marketing | P0 | 1 |
| F-7.3 | From name, reply-to, signature settings | P0 | 1 |
| F-7.4 | Per-mailbox daily and per-minute limits | P0 | 1 |
| F-7.5 | Connection check and test send | P0 | 1 |
| F-7.6 | Pause/resume a mailbox | P0 | 1 |
| F-7.7 | Rotate across multiple mailboxes in a campaign | P1 | 1 |
| F-7.8 | Mailbox health view (sent today, bounce rate, errors) | P1 | 1 |
| F-7.9 | Swappable sender provider (Amazon SES later) | P1 | Later |

## 8. Campaigns

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-8.1 | Create campaign wizard (details, mailbox, content, audience, review) | P0 | 1 |
| F-8.2 | Audience by tag/segment with exclusions | P0 | 1 |
| F-8.3 | Subject and preheader text | P0 | 1 |
| F-8.4 | Send now | P0 | 1 |
| F-8.5 | Schedule for later (timezone aware) | P0 | 1 |
| F-8.6 | Throttled, multi-day sending based on mailbox limits | P0 | 1 |
| F-8.7 | Pre-send checklist | P0 | 1 |
| F-8.8 | Pause / resume / cancel | P0 | 1 |
| F-8.9 | Duplicate campaign | P1 | 1 |
| F-8.10 | Auto-pause on high bounce rate | P1 | 1 |
| F-8.11 | Automatic UTM tagging | P1 | 1 |
| F-8.12 | Subject-line A/B test | P2 | Later |
| F-8.13 | Recurring campaigns | P2 | Later |

## 9. Sending Engine

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-9.1 | MySQL-backed job queue (no Redis) | P0 | 1 |
| F-9.2 | Per-recipient personalization at send time | P0 | 1 |
| F-9.3 | Suppression check just before each send | P0 | 1 |
| F-9.4 | Retry with backoff for temporary errors | P0 | 1 |
| F-9.5 | Idempotent sends (no duplicates) | P0 | 1 |
| F-9.6 | Handle Graph throttling (HTTP 429, Retry-After) | P0 | 1 |
| F-9.7 | Random delay between sends | P1 | 1 |
| F-9.8 | Recovery of stuck jobs after crash | P0 | 1 |

## 10. Tracking and Compliance

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-10.1 | Open tracking pixel | P0 | 1 |
| F-10.2 | Click tracking via redirect links | P0 | 1 |
| F-10.3 | Public unsubscribe page, instant effect | P0 | 1 |
| F-10.4 | Preference page (unsubscribe from all) | P1 | 1 |
| F-10.5 | Bounce (NDR) reader with hard/soft classification | P0 | 1 |
| F-10.6 | Reply detection | P1 | 1 |
| F-10.7 | Bot/scanner click filtering | P1 | 1 |
| F-10.8 | Apple Mail prefetch open flagging | P2 | 1.5 |
| F-10.9 | List-Unsubscribe header (if supported by chosen send method) | P1 | Pilot test |
| F-10.10 | Tracking on a dedicated subdomain | P0 | 1 |

## 11. Analytics and Reporting

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-11.1 | Campaign summary: sent, delivered, bounced, opened, clicked, unsubscribed, replied | P0 | 1 |
| F-11.2 | Rates: bounce, open, CTR, CTOR, unsubscribe, reply | P0 | 1 |
| F-11.3 | Unique vs total opens and clicks | P0 | 1 |
| F-11.4 | Time-series chart | P0 | 1 |
| F-11.5 | Link-level click report | P0 | 1 |
| F-11.6 | Recipient-level report with filters | P0 | 1 |
| F-11.7 | CSV export of reports | P1 | 1 |
| F-11.8 | Overall dashboard with campaign comparison | P1 | 1 |
| F-11.9 | Per-team and per-mailbox performance | P1 | 1 |
| F-11.10 | Device and email client breakdown | P2 | 1.5 |
| F-11.11 | Deliverability health alerts | P1 | 1.5 |

## 12. Administration and Operations

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-12.1 | Settings: company name, address, default footer | P0 | 1 |
| F-12.2 | Encrypted storage of mailbox and Zoho credentials | P0 | 1 |
| F-12.3 | System health page (queue size, last sync, worker status) | P1 | 1 |
| F-12.4 | Automated daily database backup | P0 | 1 |
| F-12.5 | Error notifications to Admin by email | P1 | 1 |

## 13. Planned for Later Phases (Out of Scope Now)

- Cold outreach sequences with delays
- Behavioral branching and visual workflow builder
- Unified master inbox
- Lead scoring and referral/asset gating
- Public REST API and webhooks for third parties
- Amazon SES / other providers as sending routes
