const { getDefaultConfig } = require("expo/metro-config");

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
        sourceExts: [...resolver.sourceExts, "svg"],
    };

    return config;
})();