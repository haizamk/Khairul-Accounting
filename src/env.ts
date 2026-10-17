import * as dotenv from 'dotenv';
import fs from 'fs';

// Load environment configuration explicitly according to DOTENV_CONFIG_PATH or default .env
const envFile = process.env.DOTENV_CONFIG_PATH || '.env';
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
} else {
  dotenv.config({ override: true });
}

// Fail-closed guard for dedicated disposable test mode
if (process.env.REQUIRE_DISPOSABLE_DB === 'true') {
  const activeDb = process.env.SQL_DB_NAME;
  const PERMITTED_DB = 'khairul_fresh_disposable_test';

  if (!activeDb || activeDb !== PERMITTED_DB) {
    console.error(`[FATAL ERROR] Dedicated disposable test environment requested, but SQL_DB_NAME is "${activeDb}". Active database MUST be "${PERMITTED_DB}". Shutting down.`);
    process.exit(1);
  }

  console.log(`[DISPOSABLE TEST MODE ACTIVE] Confirmed target database: "${activeDb}".`);
}
