const path = require('path');

// Monorepo root directory
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

module.exports = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@kairo/core': path.resolve(monorepoRoot, 'packages/core/src'),
      '@kairo/api': path.resolve(monorepoRoot, 'packages/api/src'),
      '@kairo/platform': path.resolve(monorepoRoot, 'packages/platform/src'),
    },
  },
};
