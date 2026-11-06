import { buildApi } from "./app";
import { config } from "./config";
import { logger } from "./lib/logger";

buildApi().listen(config.apiPort, config.bindHost, () => {
  logger.info({ host: config.bindHost, port: config.apiPort, web: Boolean(config.webDistDir) }, "api listening");
});
