import { verifyIntegrationTestSafety, VerificationContext, applyFailClosedPoolGuard } from './integration-guard.ts';

interface TestCase {
  name: string;
  context: VerificationContext;
  expectedSafe: boolean;
  expectedReasonSubstr: string;
}

const testCases: TestCase[] = [
  {
    name: "Reject missing opt-in flag",
    context: {
      activeDbName: 'khairul_fresh_disposable_test',
      activeUserName: 'ai_studio_app_user',
      envDbName: 'khairul_fresh_disposable_test',
      optInFlag: undefined
    },
    expectedSafe: false,
    expectedReasonSubstr: 'Explicit opt-in flag ALLOW_MUTATING_INTEGRATION_TESTS must be set to "true"'
  },
  {
    name: "Reject false/mismatched opt-in flag",
    context: {
      activeDbName: 'khairul_fresh_disposable_test',
      activeUserName: 'ai_studio_app_user',
      envDbName: 'khairul_fresh_disposable_test',
      optInFlag: 'false'
    },
    expectedSafe: false,
    expectedReasonSubstr: 'Explicit opt-in flag ALLOW_MUTATING_INTEGRATION_TESTS must be set to "true"'
  },
  {
    name: "Reject protected QA database",
    context: {
      activeDbName: 'khairul_fresh_qa',
      activeUserName: 'ai_studio_app_user',
      envDbName: 'khairul_fresh_qa',
      optInFlag: 'true'
    },
    expectedSafe: false,
    expectedReasonSubstr: 'is a protected database. Write-enabled integration tests are strictly prohibited'
  },
  {
    name: "Reject protected Development database",
    context: {
      activeDbName: 'cloud_sql_development_database',
      activeUserName: 'ai_studio_admin',
      envDbName: 'cloud_sql_development_database',
      optInFlag: 'true'
    },
    expectedSafe: false,
    expectedReasonSubstr: 'is a protected database. Write-enabled integration tests are strictly prohibited'
  },
  {
    name: "Reject database merely because it ends with _test",
    context: {
      activeDbName: 'some_arbitrary_unapproved_test',
      activeUserName: 'ai_studio_app_user',
      envDbName: 'some_arbitrary_unapproved_test',
      optInFlag: 'true'
    },
    expectedSafe: false,
    expectedReasonSubstr: 'ends with "_test" but is not in the explicitly approved disposable allowlist'
  },
  {
    name: "Reject unapproved database name (e.g. general name)",
    context: {
      activeDbName: 'khairul_fresh_unapproved_db',
      activeUserName: 'ai_studio_app_user',
      envDbName: 'khairul_fresh_unapproved_db',
      optInFlag: 'true'
    },
    expectedSafe: false,
    expectedReasonSubstr: 'is not on the explicitly approved disposable allowlist'
  },
  {
    name: "Reject when environment SQL_DB_NAME mismatch",
    context: {
      activeDbName: 'khairul_fresh_disposable_test',
      activeUserName: 'ai_studio_app_user',
      envDbName: 'khairul_fresh_qa', // Mismatched env database name
      optInFlag: 'true'
    },
    expectedSafe: false,
    expectedReasonSubstr: 'Environment SQL_DB_NAME ("khairul_fresh_qa") does not match actual connected database'
  },
  {
    name: "Pass with exact approved database, and correct opt-in",
    context: {
      activeDbName: 'khairul_fresh_disposable_test',
      activeUserName: 'ai_studio_app_user',
      envDbName: 'khairul_fresh_disposable_test',
      optInFlag: 'true'
    },
    expectedSafe: true,
    expectedReasonSubstr: 'VERIFICATION SUCCESS'
  }
];

// Helper to temporarily intercept process.exit for negative/failure mock tests
let mockExitCalledWith: number | null = null;
const originalExit = process.exit;

function setupMockExit() {
  mockExitCalledWith = null;
  (process as any).exit = (code?: number) => {
    mockExitCalledWith = code ?? 0;
  };
}

function restoreOriginalExit() {
  process.exit = originalExit;
}

async function runMockPoolTests() {
  console.log("\n=========================================================");
  console.log("RUNNING MOCK PG.POOL INTEGRATION GUARD UNIT TESTS");
  console.log("=========================================================");

  let mockFailures = 0;

  // Set up mock test environment variables
  process.env.ALLOW_MUTATING_INTEGRATION_TESTS = 'true';
  process.env.SQL_DB_NAME = 'khairul_fresh_disposable_test';

  // Test Case 1: Promise-based connection successful validation
  try {
    setupMockExit();
    
    let isReleased = false;
    let releasedWithDestroy = false;

    const fakeClient = {
      query: async (sqlStr: string) => {
        if (sqlStr.includes('current_database')) {
          return {
            rows: [{
              db_name: 'khairul_fresh_disposable_test',
              user_name: 'ai_studio_app_user'
            }]
          };
        }
        throw new Error('Unexpected query');
      },
      release: (destroy?: boolean) => {
        isReleased = true;
        releasedWithDestroy = !!destroy;
      },
      _safetyVerified: undefined
    };

    const fakePool = {
      connect: async () => fakeClient
    };

    applyFailClosedPoolGuard(fakePool);

    const client = await fakePool.connect();
    
    if (client && client._safetyVerified === true && mockExitCalledWith === null) {
      console.log("✅ [PASS] Promise-based valid connection succeeds and caches verification");
    } else {
      console.error("❌ [FAIL] Promise-based valid connection failed to verify or exited process");
      mockFailures++;
    }
  } catch (err: any) {
    console.error("❌ [FAIL] Promise-based valid connection threw error:", err.message);
    mockFailures++;
  } finally {
    restoreOriginalExit();
  }

  // Test Case 2: Promise-based connection failed validation (wrong DB name) -> Fail Closed
  try {
    setupMockExit();
    
    let isReleased = false;
    let releasedWithDestroy = false;

    const fakeClient = {
      query: async (sqlStr: string) => {
        return {
          rows: [{
            db_name: 'khairul_fresh_qa', // Protected, unauthorized target
            user_name: 'ai_studio_app_user'
          }]
        };
      },
      release: (destroy?: boolean) => {
        isReleased = true;
        releasedWithDestroy = !!destroy;
      },
      _safetyVerified: undefined
    };

    const fakePool = {
      connect: async () => fakeClient
    };

    applyFailClosedPoolGuard(fakePool);

    // Suppress console.error output during expected failure to keep logs clean
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      await fakePool.connect();
    } catch (e) {}

    console.error = originalConsoleError;

    if (mockExitCalledWith === 1 && isReleased && releasedWithDestroy) {
      console.log("✅ [PASS] Promise-based invalid database rejects, destroys client, and exits process safely");
    } else {
      console.error(`❌ [FAIL] Promise-based invalid database was not correctly destroyed. Exit: ${mockExitCalledWith}, Destroy: ${releasedWithDestroy}`);
      mockFailures++;
    }
  } catch (err: any) {
    console.error("❌ [FAIL] Promise-based invalid database exception:", err.message);
    mockFailures++;
  } finally {
    restoreOriginalExit();
  }

  // Test Case 3: Callback-based connection successful validation
  try {
    setupMockExit();
    
    const fakeClient = {
      query: async () => ({
        rows: [{
          db_name: 'khairul_fresh_disposable_test',
          user_name: 'ai_studio_app_user'
        }]
      }),
      release: () => {},
      _safetyVerified: undefined
    };

    const fakePool = {
      connect: (cb: any) => {
        cb(undefined, fakeClient, () => {});
      }
    };

    applyFailClosedPoolGuard(fakePool);

    await new Promise<void>((resolve) => {
      fakePool.connect((err: any, client: any, done: any) => {
        if (!err && client && client._safetyVerified === true && mockExitCalledWith === null) {
          console.log("✅ [PASS] Callback-based valid connection succeeds and caches verification");
        } else {
          console.error("❌ [FAIL] Callback-based valid connection failed");
          mockFailures++;
        }
        resolve();
      });
    });
  } catch (err: any) {
    console.error("❌ [FAIL] Callback-based valid connection exception:", err.message);
    mockFailures++;
  } finally {
    restoreOriginalExit();
  }

  // Test Case 4: Permission denied on database query -> Fail Closed
  try {
    setupMockExit();
    
    let isReleased = false;
    let releasedWithDestroy = false;

    const fakeClient = {
      query: async () => {
        throw new Error('permission denied or connection closed');
      },
      release: (destroy?: boolean) => {
        isReleased = true;
        releasedWithDestroy = !!destroy;
      },
      _safetyVerified: undefined
    };

    const fakePool = {
      connect: async () => fakeClient
    };

    applyFailClosedPoolGuard(fakePool);

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      await fakePool.connect();
    } catch (e) {}

    console.error = originalConsoleError;

    if (mockExitCalledWith === 1 && isReleased && releasedWithDestroy) {
      console.log("✅ [PASS] Permission denial on database query triggers immediate fail-closed destruction and process exit");
    } else {
      console.error(`❌ [FAIL] Permission denial failed to fail-closed correctly. Exit: ${mockExitCalledWith}, Destroy: ${releasedWithDestroy}`);
      mockFailures++;
    }
  } catch (err: any) {
    console.error("❌ [FAIL] Permission denial test threw unexpected error:", err.message);
    mockFailures++;
  } finally {
    restoreOriginalExit();
  }

  // Test Case 5: Concurrent checkouts of multiple clients
  try {
    setupMockExit();

    const client1 = {
      id: 1,
      query: async () => ({
        rows: [{
          db_name: 'khairul_fresh_disposable_test',
          user_name: 'ai_studio_app_user'
        }]
      }),
      release: () => {},
      _safetyVerified: undefined
    };

    const client2 = {
      id: 2,
      query: async () => ({
        rows: [{
          db_name: 'khairul_fresh_disposable_test',
          user_name: 'ai_studio_app_user'
        }]
      }),
      release: () => {},
      _safetyVerified: undefined
    };

    let clientIndex = 0;
    const fakePool = {
      connect: async () => {
        clientIndex++;
        return clientIndex === 1 ? client1 : client2;
      }
    };

    applyFailClosedPoolGuard(fakePool);

    const [c1, c2] = await Promise.all([fakePool.connect(), fakePool.connect()]);

    if (c1._safetyVerified === true && c2._safetyVerified === true && mockExitCalledWith === null) {
      console.log("✅ [PASS] Concurrent client acquisitions are isolated, guarded independently, and succeed");
    } else {
      console.error("❌ [FAIL] Concurrent client acquisitions failed safety verification or process exited");
      mockFailures++;
    }
  } catch (err: any) {
    console.error("❌ [FAIL] Concurrent client acquisitions threw exception:", err.message);
    mockFailures++;
  } finally {
    restoreOriginalExit();
  }

  return mockFailures;
}

function runTests() {
  console.log("=========================================================");
  console.log("RUNNING ISOLATED GUARD UNIT TESTS FOR INTEGRATION MATRIX");
  console.log("=========================================================\n");

  let failures = 0;

  for (const tc of testCases) {
    const result = verifyIntegrationTestSafety(tc.context);
    const passed = result.safe === tc.expectedSafe && result.reason.includes(tc.expectedReasonSubstr);
    
    if (passed) {
      console.log(`✅ [PASS] ${tc.name}`);
    } else {
      console.error(`❌ [FAIL] ${tc.name}`);
      console.error(`   Expected safe: ${tc.expectedSafe}, Got: ${result.safe}`);
      console.error(`   Expected reason containing: "${tc.expectedReasonSubstr}"`);
      console.error(`   Got reason: "${result.reason}"`);
      failures++;
    }
  }

  // Execute Mock pg.Pool Unit Tests
  runMockPoolTests().then((mockFailures) => {
    const totalFailures = failures + mockFailures;
    console.log("\n=========================================================");
    if (totalFailures === 0) {
      console.log(`🎉 ALL ISOLATED GUARD AND MOCK PG.POOL UNIT TESTS PASSED SUCCESSFULLY!`);
      process.exit(0);
    } else {
      console.error(`🔴 ${totalFailures} TOTAL UNIT TEST FAILURE(S) DETECTED.`);
      process.exit(1);
    }
  });
}

runTests();
