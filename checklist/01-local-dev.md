# 01 — Local development environment

Target layout from the tech stack:

```
apps/web/          React + Vite + Tailwind
apps/server/       Node.js TypeScript (API, worker, tracking)
ecosystem.config.js
```

The company MySQL 8 service already uses port 3306. This project runs a second MySQL 8 instance on `127.0.0.1:3307` with its own data directory (`data/mysql`), started by `scripts/dev-db.ps1`. Docker could not pull an image because the C: drive Docker disk is full.

## Install

- [x] Node.js LTS is installed.
- [x] MySQL 8.0+ is installed locally (InnoDB, `utf8mb4`, `utf8mb4_unicode_ci`). MariaDB 10.6+ is an alternative because it supports `SKIP LOCKED`.
- [x] Database `bulk_mailer` exists and is bound to `127.0.0.1` only.
- [x] A local uploads directory exists (stand-in for `/var/www/cachedigitech-media`).

## Environment file (never commit)

- [x] `.env` exists and is gitignored.
- [x] `NODE_ENV`, `APP_URL`, `TRACKING_URL`, `MEDIA_URL` are set (local URLs are fine).
- [x] `DATABASE_URL` points at the local database (`127.0.0.1:3307`).
- [x] `JWT_SECRET` is set.
- [x] `ENCRYPTION_KEY` is a 32-byte key for AES-256-GCM.
- [ ] `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` (or certificate path) are set before mailbox work.
- [ ] `ZOHO_ACCOUNTS_URL`, `ZOHO_API_URL`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` are set before sync work.
- [x] `UPLOAD_DIR` points at the local uploads folder.

## Three processes

- [x] API listens on `127.0.0.1:4000`.
- [x] Tracking listens on `127.0.0.1:4100`.
- [x] Worker has no HTTP port and stays running (scheduler, send loop, readers).
- [x] React dev server talks only to `/api` with cookie auth.
- [x] `GET /api/system/health` returns ok when MySQL is up and the worker heartbeat is fresh.

## Local smoke (after M1 exists)

- [x] Migrations apply on an empty database.
- [x] Seed creates Sales and Marketing teams plus one Admin user.
- [x] Login sets an httpOnly, Secure, SameSite cookie.
- [ ] Stopping the worker and starting it again does not duplicate work.
