// Function entries deliberately ignore the filename list lint-staged would
// otherwise append: each workspace's own eslint config globs its whole
// src/**, and running that in full (rather than per-changed-file) is both
// simpler and avoids ESLint 9 flat config's cwd-based config discovery,
// which doesn't cascade the way the old .eslintrc did in a monorepo.
export default {
  'apps/api/**/*.ts': () => 'npm run lint --workspace=@app/api',
  'apps/web/**/*.{ts,tsx}': () => 'npm run lint --workspace=@app/web',
  '*.{ts,tsx,js,jsx,mjs,cjs,json,md,yml,yaml,css}': 'prettier --write',
};
