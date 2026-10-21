# 04 — M3: Mailboxes and Microsoft Graph

P0: F-7.1–F-7.6. Confirm company setup items for Entra ID before this milestone.

## Mailbox records

- [x] Admin can add multiple Microsoft 365 mailboxes.
- [x] Each mailbox is assigned to Sales or Marketing.
- [x] Fields: from name, from email, reply-to, daily limit, per-minute limit, status (Active, Paused, Error).
- [x] Provider is `graph` now. The `Sender` interface is in place so `ses` can be added later without rewriting campaigns.
- [x] Shared Graph app credentials stay in environment variables, not per mailbox.
- [ ] Non-admin users cannot add or edit mailboxes outside their team, and cannot see the other team’s mailboxes.

## Graph

- [ ] App-only token is cached and refreshed before expiry (`@azure/msal-node` or equivalent).
- [ ] `checkConnection` calls Graph for that mailbox and reports status.
- [ ] Test send uses `POST /users/{from_email}/sendMail` and saves to Sent Items.
- [ ] HTTP 429 honors `Retry-After` and cools that mailbox down.
- [ ] HTTP 401/403 sets mailbox status to Error and notifies Admin.
- [ ] Custom headers used by the app start with `x-` (Graph restriction).
- [ ] Pause and resume change mailbox status and stop or allow the send loop.

## Exit check

- [ ] Connection check succeeds for one Sales mailbox and one Marketing mailbox.
- [ ] A test email arrives in a controlled inbox.
- [ ] A mailbox in Error is skipped by the worker.
- [ ] The app cannot read a mailbox that was excluded by the Exchange access policy.
