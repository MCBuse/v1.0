module.exports = function (api) {
    api.cache(true);
    return {
        presets: [
            [
                'babel-preset-expo',
                {
                    reactCompiler: {
                        sources: (filename) => !filename.includes('node_modules'),
                    },
                },
            ],
        ],
        plugins: [
            [
                'module-resolver',
                {
                    root: ['./'],
                    alias: {
                        '@': './',
                    },
                },
            ],
            'react-native-reanimated/plugin',
        ],
    };
};
