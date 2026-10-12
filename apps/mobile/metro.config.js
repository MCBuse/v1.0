const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

// This app lives in a pnpm workspace, so Metro has to watch the repository
// root and resolve modules from both node_modules trees. Without this the
// bundler cannot follow the symlink to a workspace package such as
// @repo/shared.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const escapePathForRegex = (filePath) =>
    filePath.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");

const blockList = (config, paths) => [
    ...(Array.isArray(config.resolver.blockList)
        ? config.resolver.blockList
        : [config.resolver.blockList].filter(Boolean)),
    ...paths.map(
        (filePath) =>
            new RegExp(`${escapePathForRegex(filePath)}(?:[/\\\\].*)?$`),
    ),
];

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
        assetExts: [...resolver?.assetExts?.filter((ext) => ext !== "svg"), 'lottie', 'wasm'],
        blockList: blockList(config, [
            path.join(workspaceRoot, "apps", "api", "node_modules"),
            path.join(workspaceRoot, "apps", "portal", "node_modules"),
            path.join(workspaceRoot, "apps", "issuers-dashboard", "node_modules"),
            path.join(workspaceRoot, "apps", "admin-dashboard", "node_modules"),
            path.join(workspaceRoot, "packages", "eslint-config", "node_modules"),
            path.join(workspaceRoot, "packages", "shared", "node_modules"),
            path.join(workspaceRoot, "packages", "typescript-config", "node_modules"),
            path.join(workspaceRoot, "packages", "ui", "node_modules"),
        ]),
        sourceExts: [...resolver.sourceExts, "svg"],
    };

    // Privy ships `jose` with broken package.exports; force the browser build.
    const upstreamResolveRequest = config.resolver.resolveRequest;
    config.resolver.resolveRequest = (context, moduleName, platform) => {
        if (moduleName === 'jose') {
            return context.resolveRequest(
                { ...context, unstable_conditionNames: ['browser'] },
                moduleName,
                platform,
            );
        }
        return (upstreamResolveRequest || context.resolveRequest)(context, moduleName, platform);
    };

    return config;
})();
