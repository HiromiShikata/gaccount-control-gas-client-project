module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' },
          target: 'es2019',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
};
