import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { config } from "../config";
import { logger } from "../lib/logger";
import { notifyAdmins } from "../lib/notify";

const exec = promisify(execFile);

export async function backupDatabase(): Promise<void> {
  const url = new URL(config.databaseUrl);
  const file = path.join(config.backupDir, `mailer-${new Date().toISOString().slice(0, 10)}.sql`);
  try {
    await exec("mysqldump", [
      "-h",
      url.hostname,
      "-P",
      url.port || "3306",
      "-u",
      decodeURIComponent(url.username),
      `--password=${decodeURIComponent(url.password)}`,
      url.pathname.replace(/^\//, ""),
      `--result-file=${file}`,
    ]);
    const names = await fs.promises.readdir(config.backupDir);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const name of names) {
      const full = path.join(config.backupDir, name);
      const stat = await fs.promises.stat(full);
      if (stat.isFile() && stat.mtimeMs < cutoff) await fs.promises.unlink(full);
    }
    logger.info({ file }, "database backup written");
  } catch (error) {
    logger.error({ err: error }, "database backup failed");
    await notifyAdmins("Database backup failed", error instanceof Error ? error.message : "mysqldump failed");
  }
}
