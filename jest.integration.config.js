// Jest configuration for integration tests
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/integration-tests/**/*.test.ts'],
  testTimeout: 30000, // 30 seconds timeout for integration tests
  verbose: true,
  setupFilesAfterEnv: ['./src/integration-tests/setup.ts'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
};