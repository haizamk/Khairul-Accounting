import pkg from "pg";
const { Client } = pkg;
import * as dotenv from "dotenv";

dotenv.config();

const TARGET_DB = "khairul_fresh_disposable_test";
const EXPECTED_CLUSTER_ID = "7694290932178173970";

async function verify() {
  const sqlHost = process.env.SQL_HOST;
  const user = process.env.SQL_ADMIN_USER;
  const password = process.env.SQL_ADMIN_PASSWORD;

  if (!sqlHost || !user || !password) {
    console.error("CRITICAL CONFIGURATION ERROR: SQL_HOST, SQL_ADMIN_USER, and SQL_ADMIN_PASSWORD must be set.");
    process.exit(1);
  }

  const client = new Client({
    host: sqlHost,
    user: user,
    password: password,
    database: TARGET_DB,
    ssl: false,
    connectionTimeoutMillis: 5000,
  });

  let verificationError: Error | undefined;

  try {
    await client.connect();
    const res = await client.query(
      "SELECT current_database() as db_name, system_identifier FROM pg_control_system()"
    );

    const actualDb = res.rows[0]?.db_name;
    const clusterId = res.rows[0]?.system_identifier;

    if (actualDb !== TARGET_DB) {
      throw new Error(`Connected database name "${actualDb}" does not match target "${TARGET_DB}".`);
    }
    if (!clusterId || String(clusterId) !== EXPECTED_CLUSTER_ID) {
      throw new Error(`Connected cluster ID "${clusterId}" does not match expected "${EXPECTED_CLUSTER_ID}".`);
    }
  } catch (error: any) {
    // Capture error and do not call process.exit immediately to ensure finally runs
    verificationError = error;
  } finally {
    try {
      await client.end();
    } catch (endError: any) {
      console.error("Failed to close verification client connection in finally:", endError.message);
    }
  }

  if (verificationError) {
    console.error(`[VERIFICATION ABORT] Identity verification failed:`, verificationError.message);
    process.exit(1);
  }

  console.log(`[VERIFICATION SUCCESS] Database ${TARGET_DB} on cluster ${EXPECTED_CLUSTER_ID} verified successfully.`);
  process.exit(0);
}

verify();
