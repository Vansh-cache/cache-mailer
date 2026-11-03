import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import pinoHttp from "pino-http";
import { config } from "./config";
import { logger } from "./lib/logger";
import { loadUser, requireAuth } from "./middleware/auth";
import { ensureCsrf, requireCsrf } from "./middleware/csrf";
import { errorHandler } from "./middleware/error";
import { analyticsRouter } from "./modules/analytics";
import { segmentsRouter, tagsRouter } from "./modules/audience";
import { authRouter } from "./modules/auth";
import { campaignsRouter } from "./modules/campaigns";
import { contactsRouter, suppressionRouter } from "./modules/contacts";
import { mediaRouter } from "./modules/media";
import { sendersRouter } from "./modules/senders";
import { settingsRouter, systemRouter } from "./modules/system";
import { templatesRouter } from "./modules/templates";
import { teamsRouter, usersRouter } from "./modules/users";
import { growthRouter } from "./modules/growth";
import { zohoRouter } from "./modules/zoho";
import { loadAssetImage } from "./storage/assets";

export function buildApi() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  const origins = config.nodeEnv === "production"
    ? [config.appUrl]
    : [config.appUrl, "http://localhost:5173", "http://127.0.0.1:5173"];
  app.use(cors({ origin: origins, credentials: true }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    // Mail clients and the web app load /media images from other origins.
    res.setHeader("Cross-Origin-Resource-Policy", req.path.startsWith("/media/") ? "cross-origin" : "same-origin");
    if (config.nodeEnv === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }));
  app.use(pinoHttp({ logger }));
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use("/media", express.static(config.uploadDir, { maxAge: "7d", dotfiles: "deny", index: false }));
  app.get("/media/:file", async (req, res, next) => {
    try {
      const file = req.params.file;
      const image = /^[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|gif|webp)$/i.test(file) ? await loadAssetImage(file) : null;
      if (!image) {
        res.status(404).end();
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=604800");
      res.type(image.mime).send(image.content);
    } catch (error) {
      next(error);
    }
  });
  app.use(ensureCsrf);
  app.use("/api", requireCsrf);
  app.use("/api", loadUser);
  app.use("/api/auth", authRouter);
  app.use("/api/teams", requireAuth, teamsRouter);
  app.use("/api/users", requireAuth, usersRouter);
  app.use("/api/contacts", requireAuth, contactsRouter);
  app.use("/api/suppression", requireAuth, suppressionRouter);
  app.use("/api/tags", requireAuth, tagsRouter);
  app.use("/api/segments", requireAuth, segmentsRouter);
  app.use("/api/zoho", requireAuth, zohoRouter);
  app.use("/api/assets", requireAuth, mediaRouter);
  app.use("/api/templates", requireAuth, templatesRouter);
  app.use("/api/senders", requireAuth, sendersRouter);
  app.use("/api/campaigns", requireAuth, campaignsRouter);
  app.use("/api/analytics", requireAuth, analyticsRouter);
  app.use("/api/growth", requireAuth, growthRouter);
  app.use("/api/system", requireAuth, systemRouter);
  app.use("/api/settings", requireAuth, settingsRouter);
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: "That file is too large" });
      return;
    }
    errorHandler(err, req, res, next);
  });
  return app;
}
