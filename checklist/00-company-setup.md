# 00 — Company setup (before any code runs)

Owners are from the PRD dependency table. Close the open questions before M3 and the pilot.

## Decisions

- [ ] Expected emails per day and per month are written down (design target is about 5,000–20,000 per day).
- [ ] Sending domain is chosen: a separate domain or subdomain, or the main company domain (separate is safer).
- [ ] Number of Sales mailboxes and Marketing mailboxes is agreed.
- [ ] Contacts are confirmed opted-in, or a legitimate-business-relationship rule is written by Legal.
- [ ] An existing unsubscribe list is collected, or Marketing confirms there is none.
- [ ] Host is chosen: Hostinger VPS/Cloud with root access, or an on-prem Ubuntu server. Shared hosting is not usable.
- [ ] Zoho write-back is marked launch (Phase 1) or follow-up (Phase 1.5). Default in the docs is Phase 1.5.
- [ ] Zoho Campaigns is ruled out or kept as a comparison, with the reason recorded.

## IT — Microsoft 365

- [ ] One Entra ID app registration exists.
- [ ] Auth is client credentials (certificate or client secret).
- [ ] Application permissions granted and admin-consented: `Mail.Send`, and `Mail.Read` or `Mail.ReadWrite`.
- [ ] The app is restricted to the chosen mailboxes only (Exchange RBAC for Applications, or Application Access Policy).
- [ ] Dedicated or shared mailboxes exist for Sales and for Marketing.
- [ ] Current tenant limits are verified: recipients per day, messages per minute, external recipient limits.
- [ ] SPF, DKIM, and DMARC for the sending domain are reviewed.
- [ ] Tenant ID, client ID, and secret or certificate are stored for `.env` (not in git).

## IT — Zoho

- [ ] Zoho CRM API client exists (self client or server-based).
- [ ] Data center is known (`.in`, `.com`, or `.eu`) and the accounts and API URLs match it.
- [ ] Scopes include `ZohoCRM.modules.contacts.READ` and `ZohoCRM.modules.leads.READ`.
- [ ] `.UPDATE` or notes scopes are added only if write-back is in scope.
- [ ] A sandbox or a small dummy record set is available for the first sync.
- [ ] Refresh token will be stored encrypted, not in git.

## IT — Server and DNS

- [ ] Ubuntu 22.04 or 24.04 LTS server with root access.
- [ ] Domain and HTTPS plan: `mailer.cachedigitech.com`, `track.cachedigitech.com`, `media.cachedigitech.com`.
- [ ] DNS A records for those three hostnames point at the server.
- [ ] Firewall plan: 22 (restricted by IP), 80, 443 only. MySQL stays on localhost.
- [ ] Off-server location for nightly MySQL dumps and media backups (14–30 days).

## Marketing and Legal

- [ ] Brand assets, footer text, and company postal address are ready (mandatory in every email).
- [ ] Consent and source policy is written.
- [ ] Default daily and per-minute mailbox limits are set below Microsoft’s published limits (tool defaults in the schema: 500/day, 20/minute — confirm with IT before use).
- [ ] Bounce auto-pause threshold is agreed (design example: 5% hard bounces after at least 100 sends).
