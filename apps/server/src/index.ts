import { buildApi } from "./app";
import { config } from "./config";
import { logger } from "./lib/logger";

buildApi().listen(config.apiPort, "127.0.0.1", () => {
  logger.info({ port: config.apiPort }, "api listening");
});
