# Cachedigitech Mailer

Phase 1 internal bulk mailer. Three processes share one MySQL database: API, worker, and tracking.

## Run locally

The PC already has MySQL 8 on port 3306 (`MySQL80`). This project uses a second instance on `127.0.0.1:3307` so it does not touch that server. Docker could not start a database because the C: drive is nearly full and Docker's disk is read-only.

1. Start the project database (leave the window open):

```
powershell -File scripts/dev-db.ps1
```

2. From this folder, the first time:

```
npm install
npm exec -w @cdt/server -- prisma migrate dev
npm exec -w @cdt/server -- prisma db seed
```

3. Start the app:

```
npm run dev
```

4. Open http://localhost:5173

Bootstrap admin (seeded once, from `apps/server/.env`): `admin@mailer.com` with the `SEED_ADMIN_PASSWORD` value (default `Qwe@123` — change it after the first sign-in). There are no demo accounts: sign in as this admin and create real users under **Users**.

Microsoft 365 and Zoho stay empty until IT fills `MS_*` and `ZOHO_*` in `apps/server/.env`. Sending and CRM sync report that clearly instead of pretending to succeed.

Set the company address in Settings before a real send. The seeded address is a placeholder so the pre-send check stays honest.

These are already running in this session: MySQL on 3307, API on 4000, the worker, tracking on 4100, and the site on http://127.0.0.1:5173.
