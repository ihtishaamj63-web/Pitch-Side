const base = require('./jest.config.cjs');

module.exports = {
  ...base,
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  globalSetup: '<rootDir>/tests/integration/globalSetup.ts',
  setupFiles: ['<rootDir>/tests/integration/envSetup.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
};
