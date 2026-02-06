module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'drivers/**/*.ts',
    'app.ts',
    '!**/*.d.ts'
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 }
  },
  moduleNameMapper: {
    '^homey$': '<rootDir>/test/unit/mocks/homey.mock'
  }
};
