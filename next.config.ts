import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true, // Enable React's strict mode to help identify potential problems
      compiler: {
        removeConsole: false, // Allow console logs in production (temporary for debugging)
      },
};

export default nextConfig;
