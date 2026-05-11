const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const workspaceRoot = path.resolve(__dirname, "../..");

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
    const config = getDefaultConfig(__dirname);

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
        assetExts: [...resolver?.assetExts?.filter((ext) => ext !== "svg"), 'lottie'],
        blockList: blockList(config, [
            path.join(workspaceRoot, "apps", "api", "node_modules"),
            path.join(workspaceRoot, "apps", "web", "node_modules"),
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
