import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { prisma } from "../db";
import { logger } from "../lib/logger";
import { detectImage } from "./local";

export type StoredImage = { content: Buffer; mime: string };

// Disk is the fast path; the database copy keeps images alive when the
// upload folder is lost, moved, or not shared between server and worker.
export async function loadAssetImage(fileName: string): Promise<StoredImage | null> {
  const filePath = path.join(config.uploadDir, fileName);
  const fromDisk = await fs.promises.readFile(filePath).catch(() => null);
  const asset = await prisma.asset
    .findFirst({ where: { fileName }, select: { id: true, mimeType: true, data: !fromDisk } })
    .catch((err) => {
      logger.warn({ err, fileName }, "asset db lookup failed");
      return null;
    });

  if (fromDisk) {
    const detected = detectImage(fromDisk);
    if (!detected) return null;
    if (asset && !asset.mimeType) {
      await prisma.asset
        .update({ where: { id: asset.id }, data: { data: fromDisk, mimeType: detected.mime } })
        .catch((err) => logger.warn({ err, fileName }, "asset db backfill failed"));
    }
    return { content: fromDisk, mime: detected.mime };
  }

  if (!asset?.data) return null;
  const content = Buffer.from(asset.data);
  const detected = detectImage(content);
  if (!detected) return null;
  await fs.promises
    .mkdir(config.uploadDir, { recursive: true })
    .then(() => fs.promises.writeFile(filePath, content))
    .catch((err) => logger.warn({ err, fileName }, "asset disk restore failed"));
  return { content, mime: detected.mime };
}

export async function syncTemplateAssets(templateId: bigint, fileNames: Iterable<string>): Promise<void> {
  const names = [...new Set(fileNames)];
  const assets = names.length
    ? await prisma.asset.findMany({ where: { fileName: { in: names } }, select: { id: true, fileName: true, mimeType: true } })
    : [];
  const assetIds = assets.map((asset) => asset.id);
  await prisma.$transaction([
    prisma.templateAsset.deleteMany({ where: { templateId, assetId: { notIn: assetIds } } }),
    prisma.templateAsset.createMany({
      data: assetIds.map((assetId) => ({ templateId, assetId })),
      skipDuplicates: true,
    }),
  ]);
  for (const asset of assets) {
    if (!asset.mimeType) await loadAssetImage(asset.fileName);
  }
}
