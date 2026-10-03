const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo root directory
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo preserving defaults
config.watchFolders = [...(config.watchFolders || []), monorepoRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
  ...(config.resolver.nodeModulesPaths || []),
];

// 3. Force Metro to resolve monorepo packages directly
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@kairo/core': path.resolve(monorepoRoot, 'packages/core/src'),
  '@kairo/api': path.resolve(monorepoRoot, 'packages/api/src'),
  '@kairo/platform': path.resolve(monorepoRoot, 'packages/platform/src'),
};

module.exports = config;
