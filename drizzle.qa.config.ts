import { defineConfig } from "drizzle-kit";
import { execSync } from "child_process";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const TARGET_DB = "khairul_fresh_disposable_test";

const sqlHost = process.env.SQL_HOST;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;

if (!sqlHost || !user || !password) {
  throw new Error("CRITICAL CONFIGURATION ERROR: SQL_HOST, SQL_ADMIN_USER, and SQL_ADMIN_PASSWORD must be set.");
}

// -----------------------------------------------------------------------------
// HONEST STATEMENT OF GUARANTEES (WHAT IS AND IS NOT GUARANTEED)
// -----------------------------------------------------------------------------
// [WHAT IS GUARANTEED]:
// 1. Drizzle Kit's config loader compiles and executes this configuration file 
//    before performing any migration or schema operations.
// 2. This config file synchronously triggers the verify-db-sync.ts verification 
//    script using execSync. This blocks Drizzle Kit config loader execution.
// 3. The verification script executes an async PG client check to verify the host,
//    database name, and stable physical cluster identifier.
// 4. If verification fails or is bypassed, the script exits with code 1, which 
//    causes execSync to throw an error, which aborts config loading with process.exit(1).
// 5. This avoids the use of "top-level await" inside this config file, ensuring 
//    100% compatibility with Drizzle Kit's CommonJS config-loader, while fully 
//    maintaining the fail-closed protection.
//
// [WHAT IS NOT GUARANTEED]:
// 1. A separate PostgreSQL connection is used to perform this check.
//    While it uses the exact same credentials and host config as Drizzle, it is technically 
//    a separate TCP connection. It cannot prove that the subsequent Drizzle Kit TCP socket 
//    will not be hijacked or intercepted at the network level, although this is highly 
//    improbable under standard Cloud SQL IAM and networking topology.
// 2. This guard cannot protect against out-of-band commands run with a different 
//    config file (e.g. drizzle.config.ts) or directly via raw CLI parameters bypassing this file.
// -----------------------------------------------------------------------------

try {
  // Execute synchronous verification to avoid top-level await and ensure Drizzle-Kit CommonJS loader compatibility
  execSync("npx tsx src/db/guards/verify-db-sync.ts", { stdio: "inherit" });
  console.log(`[DRIZZLE CONFIG SAFETY PASSED] Target database and cluster verified: ${TARGET_DB}`);
} catch (error: any) {
  console.error(`[DRIZZLE CONFIG SAFETY ABORT] Drizzle Kit loading aborted due to verification failure.`);
  process.exit(1); // Aborts the Drizzle Kit CLI execution immediately (fail-closed)
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/qa", // Isolated output directory for QA migration schema snapshots
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    host: sqlHost,
    user: user,
    password: password,
    database: TARGET_DB,
    ssl: false,
  },
  verbose: true,
});
