# 09 — M8: Hardening, security review, pilot

## Security

- [ ] HTTPS only, HSTS, on app, tracking, and media hostnames.
- [x] Passwords hashed. Secrets encrypted. Secrets never logged.
- [ ] Graph app cannot access mailboxes outside the Exchange policy.
- [ ] Uploads rejected unless they are a real image of an allowed type. SVG and HTML uploads fail.
- [x] Rich text is sanitized before MJML.
- [x] Public tracking cannot be used as an open redirect.
- [x] Login and public endpoints are rate-limited.
- [ ] MySQL is not reachable from the network.
- [ ] SSH is key-only. Password login is off. fail2ban is on. Firewall is 22 (restricted), 80, 443.
- [ ] Audit log covers login, send, pause, delete, mailbox changes, and settings changes.
- [ ] Delete-contact works. Consent or source is stored on contacts.

## Backups

- [ ] Nightly `mysqldump`, compressed, copied off the server, kept 14–30 days.
- [ ] Uploads rsynced off-server nightly, 30 days.
- [ ] `.env` encrypted copy held by IT (current and previous).
- [ ] Backup failure emails Admin.
- [ ] One restore has been done on a staging database before production send.

## Tests

- [x] Unit: merge tags and fallbacks, link rewriting, audience resolution, quota math, bounce parsing.
- [ ] Integration: Graph send to a test mailbox, Zoho sandbox sync, queue claim with two workers.
- [ ] Rendering: Outlook desktop, Outlook web, Gmail, mobile.
- [ ] Load: 10,000 queued recipients, simulated sender. Tracking burst on the public process.

## Pilot

- [ ] 100–500 real, opted-in contacts.
- [ ] Dedicated sending mailbox, not someone’s primary daily mailbox.
- [ ] Spam placement checked.
- [ ] Unsubscribe, hard bounce, and analytics verified on the pilot.
- [ ] Hard bounce rate and unsubscribe rate reviewed against the goals (under 2% hard bounce and under 0.5% unsubscribe after list cleanup).
- [ ] Header test for `List-Unsubscribe` recorded.
- [ ] IT has confirmed bulk use of these mailboxes is acceptable.

## Release gates from the PRD

- [ ] A marketer can build and send a campaign in under 15 minutes.
- [ ] 99% of queued emails finish without manual fixes.
- [ ] Zero duplicate sends in the pilot.
- [ ] Dashboard matches events within 5 minutes.
