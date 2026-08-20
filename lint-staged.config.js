/** @type {import('lint-staged').Config} */
export default {
  '*.{ts,tsx}': ['eslint --fix', 'prettier --write'],
  '*.{js,jsx,mjs,cjs}': ['eslint --fix', 'prettier --write'],
  '*.{json,yaml,yml,md}': ['prettier --write'],
};
