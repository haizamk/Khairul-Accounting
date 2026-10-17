const { Client } = require('pg');

async function main() {
  const sqlHost = process.env.SQL_HOST;
  const user = process.env.SQL_ADMIN_USER;
  const password = process.env.SQL_ADMIN_PASSWORD;

  if (!sqlHost || !user || !password) {
    console.error('ERROR: SQL_HOST, SQL_ADMIN_USER, and SQL_ADMIN_PASSWORD must be present in the environment.');
    process.exit(1);
  }

  // We will try connecting to 'postgres' first, then fallback to SQL_DB_NAME
  const databasesToTry = ['postgres', process.env.SQL_DB_NAME].filter(Boolean);
  let client;
  let connectedDb = '';

  for (const dbName of databasesToTry) {
    try {
      console.log(`Attempting admin connection to database "${dbName}"...`);
      client = new Client({
        host: sqlHost,
        user: user,
        password: password,
        database: dbName,
        ssl: false,
        connectionTimeoutMillis: 5000,
      });
      await client.connect();
      connectedDb = dbName;
      console.log(`Connected successfully to database "${dbName}" as "${user}".`);
      break;
    } catch (err) {
      console.warn(`Connection to database "${dbName}" failed:`, err.message);
      if (client) {
        try { await client.end(); } catch (_) {}
      }
      client = null;
    }
  }

  if (!client) {
    console.error('CRITICAL: Failed to establish administrative connection to any default database.');
    process.exit(1);
  }

  try {
    const targetDbName = 'khairul_fresh_disposable_test';

    // Check if the database exists
    console.log(`Checking if database "${targetDbName}" already exists...`);
    const checkRes = await client.query(
      'SELECT d.datname, r.rolname as owner FROM pg_database d JOIN pg_roles r ON d.datdba = r.oid WHERE d.datname = $1',
      [targetDbName]
    );

    if (checkRes.rows.length > 0) {
      const existing = checkRes.rows[0];
      console.log(`\n========================================================================`);
      console.log(`ℹ️  DATABASE ALREADY EXISTS:`);
      console.log(`   Database Name: ${existing.datname}`);
      console.log(`   Owner:         ${existing.owner}`);
      console.log(`   Status:        Preserving existing database (did not recreate/reset).`);
      console.log(`========================================================================\n`);
      return;
    }

    console.log(`Database "${targetDbName}" does not exist. Creating it with owner "${user}"...`);
    // Create database cannot be run with parameterized queries, so we interpolate safely (targetDbName is hardcoded and safe)
    await client.query(`CREATE DATABASE khairul_fresh_disposable_test OWNER "${user}"`);
    console.log(`Database "${targetDbName}" created successfully.`);

    // Verification step
    console.log(`Running read-only administrative verification...`);
    const verifyRes = await client.query(
      'SELECT d.datname, r.rolname as owner FROM pg_database d JOIN pg_roles r ON d.datdba = r.oid WHERE d.datname = $1',
      [targetDbName]
    );

    if (verifyRes.rows.length > 0) {
      const verified = verifyRes.rows[0];
      console.log(`\n========================================================================`);
      console.log(`✅ DATABASE PROVISIONING VERIFIED SUCCESSFULLY:`);
      console.log(`   Database Name: ${verified.datname}`);
      console.log(`   Owner:         ${verified.owner}`);
      console.log(`   Status:        Database is ready.`);
      console.log(`========================================================================\n`);
    } else {
      throw new Error(`Verification query returned no rows for "${targetDbName}". Creation might have failed.`);
    }

  } catch (err) {
    console.error('CRITICAL: Database provisioning failed:', err.message);
    process.exit(1);
  } finally {
    try {
      await client.end();
      console.log('Administrative connection closed cleanly.');
    } catch (err) {
      console.error('Error closing administrative connection:', err.message);
    }
  }
}

main();
