# 08 — M7: Analytics dashboards

Dashboards read `campaign_stats` and `campaign_stats_hourly`, not the raw `events` table. Target: pages load in under 3 seconds. Events should show on the dashboard within about 5 minutes (aggregator runs every minute).

## Aggregator

- [ ] Every minute, recompute campaigns that are `sending` or were active in the last 7 days.
- [ ] Recompute older campaigns only when new events arrive.
- [ ] Unique opens and clicks exclude `is_bot = TRUE`.
- [ ] Hourly buckets are written for the time-series chart.

## Metrics

- [x] Delivered (estimated) = sent − hard bounces − soft bounces.
- [x] Bounce rate = (hard + soft) / sent.
- [x] Unique open rate = unique opens / delivered, labeled approximate.
- [x] CTR = unique clicks / delivered.
- [x] CTOR = unique clicks / unique opens.
- [x] Unsubscribe rate = unsubscribes / delivered.
- [x] Reply rate = replies / delivered.
- [x] UI shows unique and total opens, and unique and total clicks.

## Screens

- [ ] Campaign summary.
- [ ] Time-series chart of opens and clicks.
- [ ] Link-level report.
- [ ] Recipient-level report with filters.
- [ ] CSV export of reports (P1).
- [ ] Overview: campaign comparison, per-team and per-mailbox performance, contact growth (P1).
- [ ] Optional UTM parameters on tracked links, per campaign.
- [x] Team scoping: Marketing does not see Sales campaigns. Admin sees both.

## Exit check

- [ ] After a test campaign, stats match a manual count of non-bot events.
- [ ] Dashboard still loads quickly when `events` has a large seed (use the 10,000-row load set plus synthetic events).
