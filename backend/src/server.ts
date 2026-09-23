import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { assertClickBootConfigValid } from "./modules/click/credentials.js";

async function main(): Promise<void> {
  await assertClickBootConfigValid();
  const app = await buildApp();
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`TezKassa backend listening on port ${env.PORT} (${env.NODE_ENV})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
