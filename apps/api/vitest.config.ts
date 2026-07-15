import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],

    // Runs before any test module is imported. `config/env.ts` validates the
    // environment at import time and exits the process if it is incomplete, so
    // the variables have to exist before the module graph is evaluated —
    // `test.env` is applied too late for that.
    setupFiles: ['./src/tests/setup.ts'],

    // The integration suite shares one database. Running files in parallel would
    // let one suite's cleanup delete another's fixtures mid-assertion.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
