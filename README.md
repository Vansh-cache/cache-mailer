# Cachedigitech Mailer

Phase 1 internal bulk mailer. Three processes share one MySQL database: API, worker, and tracking.

## Run locally

The PC already has MySQL 8 on port 3306 (`MySQL80`). This project uses a second instance on `127.0.0.1:3307` so it does not touch that server. Docker could not start a database because the C: drive is nearly full and Docker's disk is read-only.

1. Start the project database (leave the window open):

```
powershell -File scripts/dev-db.ps1
```

2. From this folder, the first time: copy `apps/server/.env.example` to `apps/server/.env` and fill in every `<...>` value (the file explains how to generate `JWT_SECRET` and `ENCRYPTION_KEY`). Set `SEED_ADMIN_EMAIL` and a strong `SEED_ADMIN_PASSWORD` (14+ characters) for the one-time seed, then:

```
npm install
npm exec -w @cdt/server -- prisma migrate deploy
npm exec -w @cdt/server -- prisma db seed
```

3. Start the app:

```
npm run dev
```

4. Open http://localhost:5173

Bootstrap admin (seeded once): the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` values from `apps/server/.env`. There is no default password. After the first sign-in, change the password, remove `SEED_ADMIN_PASSWORD` from `.env`, and create real users under **Users**. There are no demo accounts.

## Production / SaaS deployment

Set `NODE_ENV=production`. The server then refuses to start unless:

- `JWT_SECRET` is random (32+ characters) and `ENCRYPTION_KEY` is a real 64-hex key, not a placeholder.
- `APP_URL`, `TRACKING_URL` and `MEDIA_URL` are public `https://` URLs.
- The `DATABASE_URL` password is at least 12 characters and not a known default.

Secrets live only in environment variables or `.env` (gitignored). Store them in your secret manager, never in the repository. MySQL must not be exposed publicly. `docker-compose.yml` binds it to `127.0.0.1` and reads its passwords from a root `.env`.

Images in emails: every image (uploads and external URLs) is attached inside the message as an inline image, converted to JPG/PNG/GIF and capped at 1200px wide. The campaign pre-send check blocks a launch if any image cannot be attached. A send whose image fails to load is retried instead of going out without it.

Microsoft 365 and Zoho stay empty until IT fills `MS_*` and `ZOHO_*` in `apps/server/.env`. Sending and CRM sync report that clearly instead of pretending to succeed.

Set the company address in Settings before a real send. The seeded address is a placeholder so the pre-send check stays honest.