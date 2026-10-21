# 07 — M6: Tracking, bounces, and replies

Tracking is its own process. If it is down, sending still works. Events for that window are lost.

## Public endpoints (no login)

- [x] `GET /o/{token}.gif` inserts an open and returns a 1×1 GIF with no-cache headers. Unknown tokens still return the GIF.
- [x] `GET /c/{token}/{linkId}` inserts a click and responds 302 to the URL stored in `links`. Unknown or foreign URLs never redirect to user input.
- [x] `GET /u/{token}` shows a confirmation page. `POST /u/{token}` sets the contact unsubscribed, adds suppression, inserts an unsubscribe event, and confirms.
- [x] Tokens are 128-bit random values. Public routes are rate-limited per IP.
- [x] IP is stored as a hash, not the raw address.
- [ ] Tracking hostname is the dedicated subdomain (`track.cachedigitech.com`), not the app host.
- [ ] Bot rule: click within about 10 seconds of `sent_at`, a known scanner user-agent, or every link clicked in the same second sets `is_bot`.
- [ ] Apple Mail prefetch opens are flagged as approximate (P2 / 1.5 if not in the first pilot).

## Mailbox reader (every 2–5 minutes)

- [ ] Inbox delta query uses `sender_accounts.inbox_delta_link`.
- [ ] NDR detection: postmaster or Exchange sender, “Undeliverable” style subject.
- [ ] Status 5.x.x is hard bounce: contact becomes Bounced and is suppressed.
- [ ] Status 4.x.x is soft bounce: event only, no automatic suppression.
- [ ] Match uses `internet_message_id`, or recipient plus a time window.
- [ ] Replies match `In-Reply-To` or `References`. Out-of-office is excluded from the reply count.
- [ ] New delta link is saved after each run.

## List-Unsubscribe (pilot test, not a blocker)

- [x] Footer unsubscribe is always present.
- [ ] Pilot records whether Graph `sendMail` or a MIME body can set a real `List-Unsubscribe` header. If not, stay on the footer link.

## Exit check

- [ ] Open, click, and unsubscribe from a test message show up in `events` within a minute.
- [x] Unsubscribe blocks the next send to that address.
- [ ] A hard-bounce sample message suppresses the contact.
- [ ] A reply on the test thread creates a reply event and an out-of-office does not.
