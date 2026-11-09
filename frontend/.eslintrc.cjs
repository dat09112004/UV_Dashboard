module.exports = {
  env: { browser: true, es2021: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  settings: { react: { version: 'detect' } },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: { 'react/react-in-jsx-scope': 'off', 'react/prop-types': 'off' }
};
