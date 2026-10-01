// Adapted from Obytes: only retained UI dependencies and no mutating checks/reporters.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.ts?(x)'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|tailwind-merge|tailwind-variants|uniwind))'
  ]
};
