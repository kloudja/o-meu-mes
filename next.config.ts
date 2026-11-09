import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  agentRules:false,
  distDir:process.env.OMEUMES_BUILD_DIR||'.next',
};
export default config;
