import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import pkg from 'pg';
const { Client } = pkg;
import { verifyDatabaseIsQA } from '../guards.ts';

dotenv.config();

const TARGET_DB = 'khairul_fresh_disposable_test';

async function runMigration() {
  const sqlHost = process.env.SQL_HOST;
  const user = process.env.SQL_ADMIN_USER;
  const password = process.env.SQL_ADMIN_PASSWORD;

  if (!sqlHost || !user || !password) {
    console.error('CRITICAL CONFIGURATION ERROR: SQL_HOST, SQL_ADMIN_USER, and SQL_ADMIN_PASSWORD must be set in environment variables.');
    process.exit(1);
  }

  // 1. Establish an explicit pre-migration validation connection before spawning Drizzle-Kit
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
    console.log('[MIGRATION RUNNER] Connecting to verify target instance identity...');
    await client.connect();
    
    // Authoritative check on database name and cluster identity
    await verifyDatabaseIsQA(client);
    console.log('[MIGRATION RUNNER] Identity verification succeeded. Proceeding to spawn Drizzle Kit.');
  } catch (error: any) {
    verificationError = error;
  } finally {
    try {
      await client.end();
      console.log('[MIGRATION RUNNER] Pre-migration verification client cleanly closed.');
    } catch (endError: any) {
      console.error('[MIGRATION RUNNER] Error closing verification client:', endError.message);
    }
  }

  if (verificationError) {
    console.error('[MIGRATION RUNNER ABORTED] Pre-migration safety check failed:', verificationError.message);
    process.exit(1);
  }

  let exitCode = 0;

  try {
    console.log('[MIGRATION RUNNER] Initiating Drizzle Kit schema push under verified configuration...');
    
    // 2. Execute Drizzle Kit push with drizzle.qa.config.ts
    // The internal config-level safety check in drizzle.qa.config.ts will execute immediately upon startup.
    execSync('npx drizzle-kit push --config=drizzle.qa.config.ts', {
      stdio: 'inherit',
    });
    
    console.log('[MIGRATION RUNNER] Schema push completed successfully!');
  } catch (error: any) {
    console.error('[MIGRATION RUNNER ABORTED] Process terminated due to failure:', error.message);
    exitCode = 1;
  }

  process.exit(exitCode);
}

runMigration();
