import { Router } from "express";
import multer from "multer";
import { prisma } from "../db";
import { AppError } from "../errors";
import { audit } from "../lib/audit";
import { send } from "../http";
import { wrap } from "../middleware/error";
import { saveImage } from "../storage/local";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const mediaRouter = Router();

mediaRouter.get(
  "/",
  wrap(async (_req, res) => {
    const assets = await prisma.asset.findMany({ orderBy: { id: "desc" }, take: 100 });
    send(res, 200, { assets });
  }),
);

mediaRouter.post(
  "/",
  upload.single("file"),
  wrap(async (req, res) => {
    if (!req.file) throw new AppError(400, "Choose an image");
    try {
      const saved = await saveImage(req.file.buffer);
      const asset = await prisma.asset.create({
        data: { fileName: saved.fileName, url: saved.url, sizeBytes: saved.sizeBytes, uploadedBy: req.user!.id },
      });
      await audit(req.user!.id, "asset.upload", "asset", asset.id);
      send(res, 201, { asset });
    } catch (error) {
      throw new AppError(400, error instanceof Error ? error.message : "Upload failed");
    }
  }),
);
