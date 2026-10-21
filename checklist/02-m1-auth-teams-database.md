# 02 — M1: Setup, auth, roles, teams, database

Milestone from the PRD. Features: F-1.1 through F-1.4 (F-1.5 audit log is P1, still in Phase 1).

## Schema

- [x] All tables from `doc/SYSTEM_DESIGN.md` section 4 are migrated: teams, users, sender_accounts, contacts, tags, contact_tags, segments, assets, templates, campaigns, campaign_senders, campaign_recipients, links, events, campaign_stats, campaign_stats_hourly, suppression_list, zoho_sync_state, integration_secrets, settings, audit_log.
- [x] `campaign_recipients` has `UNIQUE (campaign_id, contact_id)` and index `(status, sender_id, next_attempt_at)`.
- [x] Queue claim uses `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction.

## Auth and roles

- [x] Email and password login uses argon2 or bcrypt.
- [x] Password minimum length and lockout after repeated failures are enforced.
- [x] Roles are Admin, Marketing, and Sales.
- [x] Each user belongs to one team. Admin may have a null team and can see all teams.
- [x] Marketing users can use only Marketing mailboxes and Marketing data.
- [x] Sales users can use only Sales mailboxes and Sales data.
- [x] Role and team checks run on every API call, in one central guard.
- [x] Session expires. Logout clears the cookie.
- [x] CSRF protection is on state-changing requests.
- [x] Admin can create, disable, and reset a user’s password.
- [x] Login, and later send, delete, and mailbox changes, write to `audit_log`.

## Settings shell

- [x] `settings` can store company name, address, and default footer (used by the mandatory footer in M4).

## Exit check

- [x] An Admin, a Marketing user, and a Sales user can log in.
- [x] A Sales user cannot read Marketing data.
- [x] Health endpoint is admin-only.
