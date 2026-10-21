# 06 — M5: Campaigns, MySQL queue, throttling, pause and resume

This is the send path. Treat duplicate sends as a release blocker.

## Wizard

- [x] Steps: details, mailbox, content, audience, review.
- [x] Fields: name, subject, preheader, template, team mailboxes, audience tags or segment, exclusions.
- [x] Send now and schedule (timezone-aware) both exist.
- [x] Statuses: Draft, Scheduled, Sending, Paused, Sent, Cancelled, Failed.
- [x] Pre-send checklist endpoint blocks send when it fails (see [11-campaign-pre-send.md](11-campaign-pre-send.md)).
- [x] Pause, resume, and cancel work. Duplicate is P1.

## Start sequence

- [x] Content is frozen into `html_snapshot` and `text_snapshot`.
- [x] Audience is tags or segment, minus exclusions, minus non-active contacts, minus `suppression_list`.
- [x] One `campaign_recipients` row per contact, with a random 32-char token.
- [x] Mailboxes are assigned round-robin or by remaining daily quota.
- [x] Unique `(campaign_id, contact_id)` rejects a second row for the same person.
- [ ] Scheduler starts campaigns where `status = scheduled` and `scheduled_at <= NOW()` (every minute).

## Worker loop (every few seconds, per active mailbox)

- [ ] Quota: sent today under daily limit, and sent in the last minute under per-minute limit.
- [ ] Claim uses `FOR UPDATE SKIP LOCKED`, then sets `processing` and `locked_until` (about 5 minutes).
- [ ] Suppression and contact status are checked again immediately before send.
- [ ] Personalize merge tags, rewrite links, add open pixel and footer.
- [ ] Success sets `sent` and `sent_at`. Temporary errors requeue with backoff (1m, 5m, 15m, 1h). Permanent errors set `failed`.
- [ ] HTTP 429 returns rows to `queued` and cools the mailbox.
- [ ] Optional random delay between sends (about 2–8 seconds) is P1.
- [ ] Rows stay queued overnight when the daily quota is used up. Campaign stays `sending` until every row is finished.
- [ ] Recovery job every minute re-queues `processing` rows whose `locked_until` has passed.
- [ ] Before retrying an expired processing row, the worker checks Sent Items so a crash after Graph success does not double-send.
- [ ] Worker crash is recovered by process restart plus the recovery job.

## Exit check

- [ ] Two worker processes claiming the same mailbox do not send the same recipient twice.
- [ ] A suppressed contact added after queue build is skipped at send time.
- [x] Pausing a campaign stops new claims. Resume continues the remaining rows.
- [ ] A full mailbox quota spreads the rest to the next day.
- [ ] Load trial: 10,000 queued rows with a simulated sender, zero duplicate `sent` rows.
