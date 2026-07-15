/**
 * Test environment.
 *
 * This runs in the worker BEFORE any test module is imported, which matters:
 * `config/env.ts` validates the environment at import time and calls
 * `process.exit(1)` if it is incomplete. Setting these in `test.env` is too late —
 * the module graph is already being evaluated by then.
 *
 * That strictness is deliberate production behaviour (a server must never boot
 * with a missing JWT secret), so the tests satisfy it rather than disable it.
 */
// The logger silences itself when NODE_ENV=test, so LOG_LEVEL is deliberately
// left alone — 'silent' is not a valid pino level and the env schema rejects it.
process.env.NODE_ENV = 'test';

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-32-chars-and-different-too';

// Cost 10 rather than the production 12: the suite hashes dozens of passwords and
// what is under test is the behaviour, not the work factor.
process.env.BCRYPT_ROUNDS ??= '10';

// A placeholder so the unit suite — which never opens a connection — can import
// modules that transitively pull in the config. The integration suite requires a
// real DATABASE_URL and skips itself without one.
process.env.DATABASE_URL ??=
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';
