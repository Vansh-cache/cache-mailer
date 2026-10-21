# Tech stack summary

Source: `doc/TECH_STACK.md`. MySQL replaces any earlier PostgreSQL idea. There is no Redis.

## Choices

| Layer | Choice |
|---|---|
| UI | React 18, Vite, TypeScript, Tailwind, lucide-react |
| UI libs | React Router, TanStack Query, React Hook Form, Zod, dnd-kit, TipTap, react-colorful, Recharts, TanStack Table, react-hot-toast, Zustand |
| API | Node.js LTS, TypeScript, NestJS (preferred) or Express |
| Data | MySQL 8, Prisma or Knex + mysql2. Raw SQL for the queue claim |
| Auth | JWT in an httpOnly cookie, argon2 or bcrypt |
| Send | Microsoft Graph `sendMail`, app-only client credentials |
| Read mail | Graph inbox delta |
| CRM | Zoho CRM REST v6+, OAuth, company data-center host |
| Mail HTML | MJML, html-to-text, sanitize-html |
| Files | multer, sharp, local disk, Nginx |
| Jobs | node-cron in the worker |
| Logs | pino |
| Processes | PM2 or systemd |
| Proxy | Nginx, Let’s Encrypt |
| Tests | Jest, Supertest |

If the custom editor slips, GrapesJS or Unlayer is the fallback. The custom editor is the plan.

## Queue

`campaign_recipients` is the job table. Claim with `SELECT ... FOR UPDATE SKIP LOCKED`, set `processing` and `locked_until`, commit, send. A minute job re-queues expired locks. Volume is fine because M365 throttles first.

## Graph rules

One app registration. Permissions: `Mail.Send` plus `Mail.Read` or `Mail.ReadWrite`, admin consent, then restrict the app to the sending mailboxes. Honor 429 and `Retry-After`. Custom headers must start with `x-`, so standard `List-Unsubscribe` may not work. Footer link is mandatory. Verify tenant send limits with IT.

## Zoho rules

Store the refresh token encrypted. Use `zohoapis.in` or the matching region. Incremental sync on `Modified_Time`. Start in a sandbox.

## Images

5 MB, JPG/PNG/GIF/WebP, random names, no SVG, served from `media.cachedigitech.com`.

## Env vars to expect

`APP_URL`, `TRACKING_URL`, `MEDIA_URL`, database settings, `JWT_SECRET`, `ENCRYPTION_KEY`, `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, Zoho account and API URLs plus client id and secret, `UPLOAD_DIR`.

## Repo sketch

`apps/web` and `apps/server` (`modules`, `workers`, `tracking`, `providers`, `storage`, `db`), plus `ecosystem.config.js`.
