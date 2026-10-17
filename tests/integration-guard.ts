import { sql } from 'drizzle-orm';

const APPROVED_DISPOSABLE_DB_NAMES = [
  'khairul_fresh_disposable_test' // Explicitly approved exact disposable database name
];

const PROTECTED_DATABASES = [
  'khairul_fresh_qa',
  'cloud_sql_development_database'
];

export interface VerificationContext {
  activeDbName: string | undefined;
  activeUserName: string | undefined;
  envDbName: string | undefined;
  optInFlag: string | undefined;
}

export function verifyIntegrationTestSafety(ctx: VerificationContext): { safe: boolean; reason: string } {
  // 1. Validate opt-in flag
  if (ctx.optInFlag !== 'true') {
    return {
      safe: false,
      reason: 'SAFETY BLOCK: Explicit opt-in flag ALLOW_MUTATING_INTEGRATION_TESTS must be set to "true".'
    };
  }

  // 2. Validate configured env db name vs active connection db name
  if (!ctx.envDbName) {
    return {
      safe: false,
      reason: 'SAFETY BLOCK: Configured SQL_DB_NAME is missing or empty.'
    };
  }

  if (!ctx.activeDbName) {
    return {
      safe: false,
      reason: 'SAFETY BLOCK: Connected database name could not be retrieved.'
    };
  }

  if (ctx.envDbName !== ctx.activeDbName) {
    return {
      safe: false,
      reason: `SAFETY BLOCK: Environment SQL_DB_NAME ("${ctx.envDbName}") does not match actual connected database ("${ctx.activeDbName}").`
    };
  }

  if (!ctx.activeUserName) {
    return {
      safe: false,
      reason: 'SAFETY BLOCK: Connected database user could not be retrieved.'
    };
  }

  // 3. Reject protected databases
  if (PROTECTED_DATABASES.includes(ctx.activeDbName)) {
    return {
      safe: false,
      reason: `SAFETY BLOCK: Connected database "${ctx.activeDbName}" is a protected database. Write-enabled integration tests are strictly prohibited.`
    };
  }

  // 4. Do not authorize databases merely because they end with "_test"
  if (ctx.activeDbName.endsWith('_test') && !APPROVED_DISPOSABLE_DB_NAMES.includes(ctx.activeDbName)) {
    return {
      safe: false,
      reason: `SAFETY BLOCK: Database "${ctx.activeDbName}" ends with "_test" but is not in the explicitly approved disposable allowlist.`
    };
  }

  // 5. Require exact approved disposable database name
  if (!APPROVED_DISPOSABLE_DB_NAMES.includes(ctx.activeDbName)) {
    return {
      safe: false,
      reason: `SAFETY BLOCK: Connected database "${ctx.activeDbName}" is not on the explicitly approved disposable allowlist. Currently approved: ${JSON.stringify(APPROVED_DISPOSABLE_DB_NAMES)}.`
    };
  }

  return { safe: true, reason: 'VERIFICATION SUCCESS: All safety checks passed. Target environment is verified as an approved disposable database.' };
}

import { createPool } from '../src/db/index.ts';

let isGuardApplied = false;

// Async function to verify a specific client connection
export async function verifyClientAsync(client: any): Promise<void> {
  let dbCheck: any;
  try {
    // Perform identity query on the actual checked-out client connection
    dbCheck = await client.query('SELECT current_database() as db_name, current_user as user_name');
  } catch (err: any) {
    // If we cannot verify, we must immediately fail closed and block execution
    console.error(`\n========================================================================`);
    console.error(`🔴 CRITICAL INTEGRATION TEST SAFETY EXCEPTION:`);
    console.error(`   Failed to query connection identity.`);
    console.error(`   Details: ${err.message}`);
    console.error(`   FAIL-CLOSED triggered.`);
    console.error(`========================================================================\n`);
    throw new Error(`SAFETY EXCEPTION: Failed to query connection identity. Permission denied or connection error.`);
  }

  const activeDbName = dbCheck.rows[0]?.db_name;
  const activeUserName = dbCheck.rows[0]?.user_name;

  const optInFlag = process.env.ALLOW_MUTATING_INTEGRATION_TESTS;
  const envDbName = process.env.SQL_DB_NAME;

  const result = verifyIntegrationTestSafety({
    activeDbName,
    activeUserName,
    envDbName,
    optInFlag
  });

  if (!result.safe) {
    console.error(`\n========================================================================`);
    console.error(`🔴 CRITICAL INTEGRATION TEST SAFETY BREACH DETECTED:`);
    console.error(`   Reason: ${result.reason}`);
    console.error(`   Connected DB: ${activeDbName}`);
    console.error(`   Connected User: ${activeUserName}`);
    console.error(`========================================================================\n`);
    throw new Error(`SAFETY BREACH: ${result.reason}`);
  }

  console.log(`\n[SAFETY CHECK PASSED] Physical connection verified successfully:
    - Database: ${activeDbName} (Approved Disposable)
    - User: ${activeUserName}`);
}

// Intercepts and overrides the pool's connect method to perform fail-closed verification
export function applyFailClosedPoolGuard(pool: any) {
  if (pool._isGuardApplied) return;
  pool._isGuardApplied = true;

  const originalConnect = pool.connect;

  pool.connect = function (cb?: any) {
    if (cb) {
      // Callback-based contract used by node-postgres
      return originalConnect.call(this, (err: any, client: any, done: any) => {
        if (err) {
          return cb(err, undefined, done);
        }

        if (client._safetyVerified) {
          return cb(undefined, client, done);
        }

        // Validate client connection asynchronously before passing to the callback
        verifyClientAsync(client)
          .then(() => {
            client._safetyVerified = true;
            cb(undefined, client, done);
          })
          .catch((validationErr) => {
            // Destroy the client to prevent reuse or leakage
            if (done) {
              try { done(true); } catch (e) {}
            } else if (client.release) {
              try { client.release(true); } catch (e) {}
            } else if (client.end) {
              try { client.end(); } catch (e) {}
            }
            cb(validationErr, undefined, () => {});
            process.exit(1); // Halt execution immediately after destruction
          });
      });
    } else {
      // Promise-based contract used by Drizzle ORM and async/await pools
      return (async () => {
        const client = await originalConnect.call(pool);
        if (client._safetyVerified) {
          return client;
        }

        try {
          await verifyClientAsync(client);
          client._safetyVerified = true;
          return client;
        } catch (validationErr) {
          // Destroy the client to prevent reuse or leakage
          if (client.release) {
            try { client.release(true); } catch (e) {}
          } else if (client.end) {
            try { client.end(); } catch (e) {}
          }
          process.exit(1); // Halt execution immediately after destruction
          throw validationErr;
        }
      })();
    }
  };
}

// Full async verification that runs on the actual active DB connection
export async function enforceConnectionSafety(db: any) {
  try {
    const pool = createPool();
    
    if (!isGuardApplied) {
      applyFailClosedPoolGuard(pool);
      isGuardApplied = true;
    }

    // Run a pre-flight query on Drizzle db to ensure connection and initial validation triggers
    await db.execute(sql`SELECT 1 as ping`);
  } catch (err: any) {
    console.error(`\n========================================================================`);
    console.error(`🔴 CRITICAL INTEGRATION TEST SAFETY EXCEPTION:`);
    console.error(`   Failed to execute database connection identity verification.`);
    console.error(`   Details: ${err.message}`);
    console.error(`   FAIL-CLOSED triggered.`);
    console.error(`========================================================================\n`);
    process.exit(1);
  }
}
