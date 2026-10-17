import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema.ts';
import { seedDatabase } from './seed.ts';
import { verifyDatabaseIsQA } from './guards.ts';
import * as dotenv from 'dotenv';

dotenv.config();

const TARGET_DB = 'khairul_fresh_disposable_test';
const EXPECTED_CLUSTER_ID = '7694290932178173970';

async function runSeeder() {
  const sqlHost = process.env.SQL_HOST;
  const user = process.env.SQL_USER;
  const password = process.env.SQL_PASSWORD;

  let qaPool: pkg.Pool | undefined;
  let client: pkg.PoolClient | undefined;
  let exitCode = 0;

  try {
    if (!sqlHost || !user || !password) {
      throw new Error('CRITICAL CONFIGURATION ERROR: SQL_HOST, SQL_USER, and SQL_PASSWORD must be set in environment variables.');
    }

    // Dedicated localized pool strictly bound to the target QA database and runtime user
    qaPool = new Pool({
      host: sqlHost,
      user: user,
      password: password,
      database: TARGET_DB,
      max: 2,
      connectionTimeoutMillis: 5000,
    });

    qaPool.on('error', (err) => {
      console.error('Unexpected error on QA seed pool:', err);
    });

    // 1. Establish isolated verification connection
    client = await qaPool.connect();
    
    // 2. Perform exhaustive database and cluster identity check before starting migrations/seeding
    await verifyDatabaseIsQA(client);

    // Release verification client back to pool
    client.release();
    client = undefined;

    // 3. Initialize localized transaction-aware database instance
    const qaDb = drizzle(qaPool, { schema });

    console.log('[SAFETY SEED CHECK PASSED] Starting transaction-bound seed...');
    await qaDb.transaction(async (tx) => {
      // 4. Verify inside the transaction block itself to guarantee the active session target database name and cluster identifier match
      const res = await tx.execute(sql`SELECT current_database() as db_name, system_identifier FROM pg_control_system()`);
      const row = res.rows[0];
      const actualDb = row?.db_name;
      const clusterId = row?.system_identifier;

      if (actualDb !== TARGET_DB) {
        throw new Error(`TRANSACTION SAFETY ABORT: Active database "${actualDb}" does not match target "${TARGET_DB}".`);
      }
      if (!clusterId || String(clusterId) !== EXPECTED_CLUSTER_ID) {
        throw new Error(`TRANSACTION SAFETY ABORT: Active cluster ID "${clusterId}" does not match expected "${EXPECTED_CLUSTER_ID}".`);
      }

      console.log(`[TRANSACTION SAFETY PASSED] Verified connection context within active transaction: ${actualDb} (${clusterId})`);
      
      // Execute the actual database seeding
      await seedDatabase(tx);
    });

    console.log('Database seeding executed successfully!');
  } catch (err: any) {
    console.error('Seed execution aborted due to failure:', err.message);
    exitCode = 1;
  } finally {
    // 5. Guaranteed resource cleanup
    if (client) {
      try {
        client.release();
        console.log('Verification client connection safely released.');
      } catch (e: any) {
        console.error('Error releasing client in finally:', e.message);
      }
    }
    if (qaPool) {
      try {
        await qaPool.end();
        console.log('QA seeder database connection pool cleanly terminated.');
      } catch (e: any) {
        console.error('Error closing database pool in finally:', e.message);
        exitCode = 1;
      }
    }
  }

  process.exit(exitCode);
}

runSeeder();
