import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startWorkers } from "./workers/index.js";
import { logger } from "./lib/logger.js";

async function main() {
  const app = await buildApp();

  // Start background workers (non-fatal — API works without them)
  try {
    await startWorkers();
    logger.info("Background workers started");
  } catch (err) {
    logger.warn({ err }, "Workers failed to start — API will run without background jobs. Upgrade Redis to 5+ for full functionality.");
  }

  // Start server
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(`Server running at http://${env.HOST}:${env.PORT}`);
}

main().catch((err) => {
  logger.fatal(err, "Failed to start server");
  process.exit(1);
});
