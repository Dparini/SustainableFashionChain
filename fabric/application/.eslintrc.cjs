module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022 },
  rules: { 'no-undef': 'error', 'no-dupe-args': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error' },
  overrides: [{ files: ['test/**/*.js'], env: { jest: true } }],
};
