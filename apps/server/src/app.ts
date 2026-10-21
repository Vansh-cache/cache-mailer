import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
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

export function buildApi() {
  const app = express();
  app.set("trust proxy", 1);
  const origins = config.nodeEnv === "production"
    ? [config.appUrl]
    : [config.appUrl, "http://localhost:5173", "http://127.0.0.1:5173"];
  app.use(cors({ origin: origins, credentials: true }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(pinoHttp({ logger }));
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use("/media", express.static(config.uploadDir, { maxAge: "7d" }));
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
