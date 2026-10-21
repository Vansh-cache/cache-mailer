# Product Requirements Document (PRD)

**Project:** Cachedigitech Bulk Emailing Tool (Phase 1)
**Version:** 1.1
**Audience:** Marketing team, Sales team, IT, Management
**Status:** Draft for review

---

## 1. Overview

Cachedigitech's marketing and sales teams need an internal tool to send bulk emails to contacts stored in Zoho CRM, using the company's existing Microsoft 365 mailboxes, and to see how each campaign performed.

Phase 1 delivers the loop:

**Import/sync contacts -> Design email -> Send campaign -> Track events -> View analytics**

Cold outreach sequences, a master inbox, and a visual workflow engine are **out of scope** for Phase 1 and planned for later phases.

## 2. Goals and Non-Goals

### Goals
- Let non-technical users build good-looking emails with a drag-and-drop editor.
- Send campaigns through multiple Microsoft 365 mailboxes (Sales and Marketing teams).
- Track delivery, bounces, opens, clicks, unsubscribes, and replies.
- Keep contacts in sync with Zoho CRM.
- Run on company-controlled infrastructure (on-prem or Hostinger Cloud/VPS) with low running cost.

### Non-Goals (Phase 1)
- Multi-step cold email sequences and branching automation.
- Unified master inbox UI.
- Lead scoring, referral loops, asset gating.
- Replacing Zoho CRM.
- Sending millions of emails per month (Microsoft 365 is not built for that; see Risks).

## 3. Users and Roles

| Role | Description | Key permissions |
|---|---|---|
| **Admin** | IT / tool owner | Manage users, teams, mailboxes, settings; view everything |
| **Marketing** | Marketing team member | Use Marketing mailboxes; create templates; send campaigns; view Marketing analytics |
| **Sales** | Sales team member | Use Sales mailboxes; create templates; send campaigns; view Sales analytics |

Each user belongs to one team. Users can only use mailboxes and see data belonging to their team. Admins see all teams.

## 4. Functional Requirements

### 4.1 Authentication and Access
- FR-1: Email + password login (secure hashing), session expiry, password reset by Admin.
- FR-2: Role-based access (Admin, Marketing, Sales) enforced on every API call.
- FR-3: Audit log of key actions (login, send, delete, mailbox changes).

### 4.2 Contacts and Audience
- FR-4: Store contacts with email, first name, last name, company, job title, status, and custom fields.
- FR-5: Sync contacts and leads from Zoho CRM (read, scheduled + manual).
- FR-6: CSV import with column mapping, duplicate detection, and email validation.
- FR-7: Tags and saved segments (filter rules such as tag = Lead AND company contains "Tech").
- FR-8: Suppression list (unsubscribed, hard-bounced) that is checked immediately before every send.
- FR-9: Contact statuses: Active, Unsubscribed, Bounced.
- FR-10: Export contacts and per-contact email activity.

### 4.3 Email Editor and Templates
- FR-11: Block-based editor with **text, image, button, divider, spacer** blocks (columns optional).
- FR-12: **Reorder blocks** by drag-and-drop.
- FR-13: Text formatting: bold, italic, underline, font size, text color, alignment, inline links.
- FR-14: Email-level styling: background color, content background, content width, default font.
- FR-15: Button block: label, link, button color, text color, size, alignment.
- FR-16: Image upload, with alt text, width, alignment, optional link.
- FR-17: Merge tags with fallbacks, e.g. `{{first_name | there}}`.
- FR-18: Save as draft or template; duplicate, rename, delete; visibility Team-only or Shared.
- FR-19: Preview (desktop/mobile) and send a test email to self.
- FR-20: Auto-generated plain-text version; mandatory footer with unsubscribe link and company address.

### 4.4 Mailboxes (Sender Accounts)
- FR-21: Admin can add **multiple Microsoft 365 mailboxes**, each assigned to a team (Sales or Marketing).
- FR-22: Each mailbox has from name, from email, reply-to, daily limit, per-minute limit, and status (Active/Paused/Error).
- FR-23: "Send test" and "Check connection" actions per mailbox.
- FR-24: A campaign can use one mailbox or rotate across several mailboxes of the same team.

### 4.5 Campaigns and Sending
- FR-25: Create campaign: name, subject, preheader, mailbox(es), template, audience (tags/segment), exclusions.
- FR-26: Send now or schedule.
- FR-27: Throttled sending that respects each mailbox's limits; large campaigns spread over multiple days automatically.
- FR-28: Pre-send checklist (unsubscribe link present, links valid, mailbox connected, audience count confirmed).
- FR-29: Pause, resume, cancel, duplicate a campaign.
- FR-30: Campaign statuses: Draft, Scheduled, Sending, Paused, Sent, Cancelled, Failed.
- FR-31: Automatic retry for temporary failures, with no double-sends.
- FR-32: Auto-pause when bounce rate crosses a configurable threshold.

### 4.6 Tracking
- FR-33: Open tracking (pixel), click tracking (link rewriting), unsubscribe endpoint.
- FR-34: Bounce detection by reading non-delivery reports from sender mailboxes via Graph.
- FR-35: Reply detection by reading replies in sender mailboxes via Graph.
- FR-36: Filter likely bot activity (security scanners' instant clicks, Apple Mail prefetch opens).

### 4.7 Analytics
- FR-37: Campaign metrics: sent, delivered (estimated), bounce rate, unique/total opens, unique/total clicks, CTR, CTOR, unsubscribe rate, reply rate.
- FR-38: Time-series chart of opens and clicks.
- FR-39: Link-level report and recipient-level report (filter and export CSV).
- FR-40: Overall dashboard: campaign comparison, per-team and per-mailbox performance, contact growth.
- FR-41: Automatic UTM parameters on links (optional per campaign).

### 4.8 Zoho Write-back (Phase 1.5)
- FR-42: Push opens, clicks, bounces, and unsubscribes back to the Zoho contact/lead record.

## 5. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | Dashboards load in under 3 seconds via pre-aggregated stats |
| Reliability | Send jobs survive restarts; no duplicate sends; events processed idempotently |
| Scalability | Designed for roughly 5,000-20,000 emails per day across mailboxes; clear upgrade path to Amazon SES for more |
| Security | HTTPS everywhere; encrypted credentials; hashed passwords; RBAC; rate-limited public endpoints |
| Compliance | Unsubscribe in every email; consent/source stored per contact; DPDP Act (and GDPR where relevant) |
| Availability | Business-hours reliability; daily database backups |
| Usability | Non-technical users can send a campaign without help after a short walkthrough |
| Browser support | Latest Chrome, Edge, Firefox, Safari (desktop first, responsive) |

## 6. Constraints and Assumptions

- Emails are sent through **Microsoft Graph API** (`sendMail`) from Microsoft 365 mailboxes.
- Database is **MySQL 8**; **no Redis** (the job queue is MySQL-backed).
- Hosting is **on-prem or Hostinger Cloud/VPS** (needs root access and long-running processes; basic shared hosting is not suitable).
- Frontend is **React + Tailwind CSS + lucide-react**.
- Contacts originate from Zoho CRM and are opted-in or have a legitimate business relationship.
- Microsoft 365 sending limits apply and may change; they must be verified for the company tenant.

## 7. Dependencies (Needed from the Company)

| Need | Owner |
|---|---|
| Entra ID (Azure AD) app registration with Graph `Mail.Send` and `Mail.ReadWrite`/`Mail.Read` application permissions, admin consent | IT / M365 admin |
| Restriction of the app to specific mailboxes only | IT / M365 admin |
| Dedicated or shared mailboxes for Sales and Marketing sending | IT |
| Zoho CRM API client, integration user, data center region (.in/.com) | Zoho admin |
| Server (Hostinger VPS/Cloud or on-prem), domain, HTTPS certificate | IT |
| Subdomain for tracking (e.g. `track.cachedigitech.com`) | IT |
| SPF/DKIM/DMARC review for the sending domain | IT |
| Contact consent policy and existing unsubscribe list | Marketing / Legal |
| Brand assets, footer text, company address | Marketing |

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Microsoft 365 daily/per-minute sending limits | Large campaigns slow or blocked | Per-mailbox limits in the tool, multiple mailboxes, multi-day spreading; swappable sender for SES later |
| Bulk sending harms the main domain reputation | Normal company email goes to spam | Use dedicated sending mailboxes, ideally on a separate domain/subdomain; keep lists clean; auto-pause on bounces |
| No spam-complaint feedback from M365 | Blind spot on reputation | Monitor unsubscribe and bounce rates; honor unsubscribes instantly; send only to relevant contacts |
| Graph limits custom headers (only `x-` headers) | One-click List-Unsubscribe header may not be settable | Visible unsubscribe link in footer; test header options in the pilot; fall back to SMTP AUTH (OAuth) for sending if required |
| Open tracking inaccuracy | Misleading analytics | Treat clicks/replies as primary signals; label opens as approximate |
| Single-server deployment | Downtime if the server fails | Daily backups, documented restore, monitoring |
| Microsoft policy on bulk use | Mailbox throttled or flagged | Confirm acceptable use with IT; start with a pilot |

## 9. Success Metrics

- A marketer can build and send a campaign in under 15 minutes.
- 99% of queued emails are processed without manual intervention.
- Zero duplicate sends.
- Hard bounce rate under 2% and unsubscribe rate under 0.5% per campaign after list cleanup.
- Analytics dashboard reflects events within 5 minutes.

## 10. Milestones

| Milestone | Deliverable |
|---|---|
| M1 | Setup, auth, roles, teams, database |
| M2 | Contacts, CSV import, tags, suppression, Zoho read sync |
| M3 | Mailbox management and Graph integration with test send |
| M4 | Email editor, templates, preview, image upload |
| M5 | Campaigns, MySQL queue, throttling, pause/resume |
| M6 | Tracking service, bounce and reply reader |
| M7 | Analytics dashboards |
| M8 | Hardening, security review, pilot with real contacts |

## 11. Open Questions

1. Expected emails per day and per month?
2. Will sending use a separate domain/subdomain, or the main company domain?
3. Number of sending mailboxes for Sales and for Marketing?
4. Are contacts all opted-in? Is there an existing unsubscribe list?
5. Hostinger VPS/Cloud or on-prem: which plan or server is approved?
6. Is Zoho write-back required at launch or can it follow in Phase 1.5?
7. Is Zoho Campaigns ruled out? If so, why (cost, features, control)?
