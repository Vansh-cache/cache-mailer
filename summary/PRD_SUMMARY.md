# PRD summary

Source: `doc/PRD.md` (v1.1, draft).

## Goal

Give Marketing and Sales a tool they can run without engineering help: good-looking emails, several Microsoft 365 mailboxes, Zoho contacts, and campaign stats. Keep it on company infrastructure at low cost.

## Must do

- Email and password login, three roles, team walls, audit of important actions.
- Contacts with tags, segments, CSV import, suppression, and statuses Active / Unsubscribed / Bounced.
- Zoho read sync (scheduled and manual).
- Block editor, merge tags, preview, test send, mandatory unsubscribe footer and company address.
- Many mailboxes, each with from-name, reply-to, daily and per-minute limits.
- Send now or schedule, throttle, spread across days, pause, resume, cancel, retry without double-sends, auto-pause on bounce spikes.
- Track opens, clicks, unsubscribes, bounces (from mailbox NDRs), and replies.
- Dashboards for a campaign and for the whole team.

## Explicitly later

Multi-step cold sequences, unified inbox, lead scoring, referral loops, asset gating, sending millions per month.

## Quality bar

| Area | Bar |
|---|---|
| Dashboards | Under 3 seconds, from pre-aggregated stats |
| Sends | Survive restarts, no duplicates, idempotent events |
| Volume | About 5k–20k emails/day, with a path to SES |
| Security | HTTPS, encrypted secrets, hashed passwords, RBAC, rate limits |
| Compliance | Unsubscribe on every mail, consent stored, DPDP and GDPR where it applies |
| Ops | Business-hours reliability, daily database backups |

## Company must provide

Entra ID app with Graph `Mail.Send` and mailbox read, locked to specific mailboxes. Zoho API client and region. A VPS or on-prem server, three DNS names, TLS, SPF/DKIM/DMARC review, consent policy, footer and address.

## Main risks

M365 throttling, damage to the main domain’s reputation, no spam-complaint feedback, weak support for the `List-Unsubscribe` header, inaccurate opens, and a single server. Mitigations: per-mailbox limits, a separate sending domain, clean lists, footer unsubscribe, treat clicks and replies as the real signal, daily backups.

## Milestones

M1 auth and database → M2 contacts and Zoho read → M3 mailboxes → M4 editor → M5 queue and send → M6 tracking → M7 analytics → M8 harden and pilot.

## Still open

Daily volume, sending domain, mailbox counts, opt-in proof, host choice, whether write-back is launch or 1.5, and whether Zoho Campaigns was rejected and why.
