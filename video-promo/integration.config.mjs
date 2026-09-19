// Configure the actual repository entry, aliases and display-only adapters here.
// repoDir defaults to plan.repo, set by init_project.py --repo in every style.
import path from 'node:path';
const repo = '/Users/zyongzhu/Workbase/Thirdspace-creator';
export default {
  repoDir: repo,
  // CreatorOS frontend uses `@/` → frontend/src. Product components resolve their
  // own node_modules from frontend/node_modules (pnpm workspace) upward.
  aliases: {'@': path.join(repo, 'frontend/src')},
  // Extra bare imports to leave external must be resolvable from the video project.
  // CJS cannot synchronously load dependencies with top-level await. Marking them
  // external alone still fails at runtime. Use a compatible synchronous entry,
  // or adapt the video build/loader to asynchronous ESM or browser mounting.
  external: [],
  // Plain CSS/CSS modules work out of the box. Compile Tailwind separately into
  // src/product.css using the repository's installed Tailwind version and theme.
  loaders: {},
};
