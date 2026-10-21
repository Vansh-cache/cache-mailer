# 03 — M2: Contacts, CSV, tags, suppression, Zoho read sync

P0: F-2.1–F-2.5, F-2.7, F-2.8, F-3.1–F-3.3. P1 still in Phase 1: segments, activity, export, consent, delete, field mapping, Zoho opt-out into suppression.

## Contacts

- [x] Contact stores email, first name, last name, company, job title, status, source, consent note, custom fields JSON.
- [x] Status is Active, Unsubscribed, or Bounced.
- [x] List supports search, filter, and pagination.
- [x] CSV import maps columns, detects duplicates, and validates email syntax.
- [x] Tags can be added, removed, and applied in bulk.
- [x] Saved segments store rule JSON (example: tag is Lead AND company contains a value).
- [x] Suppression list reasons: unsubscribed, hard bounce, manual, Zoho opt-out.
- [x] Export of contacts and per-contact activity works.
- [x] Delete-contact removes the person’s data on request.

## Zoho pull

- [ ] OAuth refresh token is stored in `integration_secrets` with AES-256-GCM.
- [ ] Worker pulls Contacts and Leads every 15–60 minutes using `Modified_Time` since `zoho_sync_state.last_modified_time`.
- [ ] Requests are paged (up to 200).
- [ ] Upsert is by `zoho_id`, then by email.
- [ ] Extra fields land in `custom_fields`.
- [ ] Email Opt Out marks the contact unsubscribed and adds the email to suppression.
- [ ] On error, the last good timestamp is kept, the error is stored, and Admin is notified after repeated failures.
- [ ] `POST /api/zoho/sync` and `GET /api/zoho/status` work.
- [ ] First run uses sandbox or dummy records.

## Exit check

- [x] A CSV with one bad email and one duplicate imports cleanly.
- [x] A suppressed address cannot be selected as an active recipient.
- [ ] Manual sync and a scheduled sync both update `zoho_sync_state`.
