import cron from "node-cron";
import { logger } from "./lib/logger";
import { putSetting } from "./lib/settings";
import { runZohoSync } from "./modules/zoho";
import { aggregateActive, autoPause } from "./workers/aggregate";
import { backupDatabase } from "./workers/backup";
import { readMailboxes } from "./workers/reader";
import { startScheduled } from "./workers/schedule";
import { recoverStuck, sendLoop } from "./workers/send";
import { runDueSequences } from "./workers/sequences";

function guard(name: string, job: () => Promise<unknown>): () => void {
  return () => {
    job().catch((err) => logger.error({ err, name }, "job failed"));
  };
}

async function heartbeat(): Promise<void> {
  await putSetting("worker_heartbeat", new Date().toISOString());
}

cron.schedule("* * * * *", guard("schedule", startScheduled));
cron.schedule("* * * * *", guard("sequences", runDueSequences));
cron.schedule("* * * * *", guard("recover", recoverStuck));
cron.schedule("* * * * *", guard("aggregate", aggregateActive));
cron.schedule("* * * * *", guard("pause", autoPause));
cron.schedule("*/3 * * * *", guard("reader", readMailboxes));
cron.schedule("*/30 * * * *", guard("zoho", runZohoSync));
cron.schedule("15 2 * * *", guard("backup", backupDatabase));

setInterval(() => {
  sendLoop().catch((err) => logger.error({ err }, "send loop failed"));
}, 4000);
setInterval(() => {
  heartbeat().catch((err) => logger.error({ err }, "heartbeat failed"));
}, 30_000);

heartbeat()
  .then(() => logger.info("worker listening for jobs"))
  .catch((err) => logger.error({ err }, "worker failed to start"));
