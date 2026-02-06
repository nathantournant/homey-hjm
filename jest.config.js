module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'app.ts',
    'drivers/**/*.ts',
    '!**/*.d.ts'
  ],
  coverageThreshold: {
    global: { branches: 60, functions: 75, lines: 75, statements: 75 }
  },
  moduleNameMapper: {
    '^homey$': '<rootDir>/test/unit/mocks/homey.mock'
  }
};
