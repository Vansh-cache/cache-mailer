# 10 — Production deploy and daily run

Single server to start: Ubuntu LTS, Nginx, PM2, MySQL 8.

## First deploy

- [ ] DNS: `mailer`, `track`, and `media` hostnames point at the server.
- [ ] Certbot certificates cover all three names and auto-renew.
- [ ] Nginx: app host serves the React build and proxies `/api` to `127.0.0.1:4000`.
- [ ] Nginx: track host proxies to `127.0.0.1:4100`.
- [ ] Nginx: media host serves `/var/www/cachedigitech-media` with a long cache lifetime.
- [ ] PM2 ecosystem runs `mailer-api`, `mailer-worker`, and `mailer-tracking`, with restart on crash.
- [ ] MySQL listens on `127.0.0.1:3306` only.
- [ ] Migrations have been applied.
- [ ] Admin user exists. Company address and footer are saved.
- [ ] `GET /api/system/health` is monitored (UptimeRobot or equivalent).

## Each release

- [ ] Pull or upload the release.
- [ ] Build the React app into `/var/www/mailer-web`.
- [ ] Build the server and run migrations.
- [ ] `pm2 reload ecosystem.config.js`.
- [ ] Hit `/api/system/health`.
- [ ] Rollback path is the previous release folder plus `pm2 reload`. Restore the database only when a migration must be undone.

## Daily

- [ ] Worker is online in PM2. Queue size is not stuck on `processing`.
- [ ] No mailbox is in Error.
- [ ] Last Zoho sync status is success, or the error is understood.
- [ ] Last backup file exists off-server and is from last night.
- [ ] Bounce and unsubscribe rates on active campaigns are inside the agreed thresholds.

## When something fails

| Situation | What to do |
|---|---|
| Worker down | PM2 restarts it. Confirm stuck rows return to `queued` within a minute. |
| Graph 429 | Leave the mailbox cooling. Do not raise limits to push through. |
| Graph 401/403 | Mailbox is Error. Fix consent or the access policy, then set it Active. |
| Bounce spike | Campaign should already be Paused. Clean the list before resume. |
| Zoho sync error | Next cycle retries. Fix credentials if it repeats. |
| Backup failed | Treat as urgent. Run a manual dump and copy it off-server. |
| Server loss | Restore MySQL and uploads on a new host, restore `.env`, point DNS, start PM2. |

## Do not do this in production

- [ ] Do not point MySQL at a public interface.
- [ ] Do not commit `.env` or mailbox secrets.
- [ ] Do not send from the company’s main personal mailboxes.
- [ ] Do not disable the suppression check to “finish” a campaign.
- [ ] Do not serve tracking from the main company website hostname.
