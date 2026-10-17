import pkg from 'pg';

const TARGET_DB = 'khairul_fresh_disposable_test';
const EXPECTED_CLUSTER_ID = '7694290932178173970';

// Dedicated authoritative guard to verify the active connection target and cluster
export async function verifyDatabaseIsQA(poolOrClient: pkg.Pool | pkg.Client) {
  const isPool = poolOrClient instanceof pkg.Pool;
  const connection = isPool ? await (poolOrClient as pkg.Pool).connect() : (poolOrClient as pkg.Client);

  try {
    // Query cluster-level system identifier and active database name
    const res = await connection.query(
      'SELECT current_database() as db_name, current_user as user_name, system_identifier FROM pg_control_system()'
    );

    const actualDb = res.rows[0]?.db_name;
    const actualUser = res.rows[0]?.user_name;
    const clusterId = res.rows[0]?.system_identifier;

    // 1. Enforce strict matching on database name
    if (actualDb !== TARGET_DB) {
      throw new Error(`SAFETY ABORT: Target database is "${actualDb}", but "${TARGET_DB}" is required.`);
    }

    // 2. Enforce strict matching on physical cluster system identifier
    if (!clusterId || String(clusterId) !== EXPECTED_CLUSTER_ID) {
      throw new Error(`SAFETY ABORT: Cluster identifier "${clusterId}" does not match expected QA cluster "${EXPECTED_CLUSTER_ID}".`);
    }

    console.log(`[SAFETY CHECK PASSED] Successfully verified target environment:
      - Database: ${actualDb}
      - Cluster ID: ${clusterId}
      - Active User: ${actualUser}`);
  } catch (error: any) {
    console.error('[SAFETY CHECK FAILED] Guard verification failed:', error.message);
    throw error;
  } finally {
    // Release the checked-out connection client if it came from a pool
    if (isPool && connection && 'release' in connection) {
      try {
        (connection as any).release();
      } catch (err: any) {
        console.error('Failed to release connection client:', err.message);
      }
    }
  }
}
