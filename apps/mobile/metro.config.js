const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

// This app lives in a pnpm workspace, so Metro has to watch the repository
// root and resolve modules from both node_modules trees. Without this the
// bundler cannot follow the symlink to a workspace package such as
// @repo/shared.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

module.exports = (() => {
    const config = getDefaultConfig(projectRoot);

    config.watchFolders = [workspaceRoot];

    const { transformer, resolver } = config;

    config.resolver.extraNodeModules = {
  react: require.resolve('react'),
  'react-native': require.resolve('react-native'),
};

    config.transformer = {
        ...transformer,
        babelTransformerPath: require.resolve("react-native-svg-transformer/expo"),
        // Convert hardcoded white fills → currentColor so the Icon `color` prop works.
        svgoConfig: {
            plugins: [
                {
                    name: 'convertColors',
                    params: { currentColor: /^(white|#fff|#ffffff|#FFF|#FFFFFF)$/ },
                },
            ],
        },
    };
    config.resolver = {
        ...resolver,
        nodeModulesPaths: [
            path.resolve(projectRoot, "node_modules"),
            path.resolve(workspaceRoot, "node_modules"),
        ],
        unstable_enableSymlinks: true,
        assetExts: [...resolver?.assetExts?.filter((ext) => ext !== "svg"), 'lottie'],
        sourceExts: [...resolver.sourceExts, "svg"],
    };

    return config;
})();