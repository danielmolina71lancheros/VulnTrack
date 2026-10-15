const security = require('./backend/node_modules/eslint-plugin-security');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/zap-reports/**',
    ],
  },
  {
    files: ['backend/src/**/*.js', 'frontend/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
    },
  },
];
