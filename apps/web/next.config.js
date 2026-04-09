/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    // Find the existing rule that handles SVG as static files
    const fileLoaderRule = config.module.rules.find((rule) =>
      rule.test?.test?.('.svg'),
    );

    config.module.rules.push(
      // Keep SVGs imported with `?url` as static files (for <img src="...?url">)
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/,
      },
      // Transform all other .svg imports into React components via SVGR
      {
        test: /\.svg$/i,
        issuer: fileLoaderRule?.issuer,
        resourceQuery: { not: [...(fileLoaderRule?.resourceQuery?.not ?? []), /url/] },
        use: ['@svgr/webpack'],
      },
    );

    // Exclude .svg from the default file loader (now handled above)
    if (fileLoaderRule) fileLoaderRule.exclude = /\.svg$/i;

    return config;
  },
};

export default nextConfig;
