/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile workspace packages
  transpilePackages: ['@tetherdesk/crypto', '@tetherdesk/protocol'],
  
  // Configure webpack to resolve workspace dependencies
  webpack: (config) => {
    // Ensure monorepo workspace packages are resolved correctly
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    
    return config;
  },
};

export default nextConfig;
