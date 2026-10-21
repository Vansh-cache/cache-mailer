# 11 — Campaign pre-send checklist

Run this for every campaign before Send or Schedule. The product should enforce the same checks in `POST /api/campaigns/:id/precheck`.

## Content

- [ ] Subject and preheader are filled in.
- [ ] Preview checked on desktop and mobile.
- [ ] Test email received by the sender.
- [ ] Merge tags resolve, including fallbacks for empty names.
- [ ] Unsubscribe link is in the HTML and in the plain-text version.
- [ ] Company address is in the footer.
- [ ] Links are real https URLs, and each one was clicked in the test email.
- [ ] Images load from the media hostname and have alt text.

## Audience and mailbox

- [ ] Audience count is shown and confirmed by the sender.
- [ ] Exclusions are applied.
- [ ] Suppressed, unsubscribed, and bounced contacts are excluded.
- [ ] Chosen mailboxes are Active, on the same team as the campaign, and connection check passed today.
- [ ] Daily remaining quota can cover this send, or the sender accepts a multi-day spread.
- [ ] Reply-to is a mailbox someone actually reads.

## Compliance

- [ ] Recipients are opted-in or covered by the written legitimate-interest rule.
- [ ] This list is not a purchased or scraped list.
- [ ] UTM choice (on or off) is intentional.

## After you press send

- [ ] Status moves to Sending (or Scheduled).
- [ ] First recipients show Sent within a few minutes.
- [ ] A sample open or click appears after you open the test copy.
- [ ] If hard bounces climb toward the pause threshold, stop and fix the list. Do not resume blindly.
