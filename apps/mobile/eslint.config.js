// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactCompiler = require('eslint-plugin-react-compiler');

module.exports = defineConfig([
  expoConfig,
  reactCompiler.configs.recommended,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    // react-hooks v7 (eslint-config-expo 57) promotes these to errors; the flagged
    // code is intentional (countdowns, one-shot session reads, web hydration).
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
