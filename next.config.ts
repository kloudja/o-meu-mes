import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }];
  },
  serverExternalPackages: ['@node-rs/argon2', '@zxcvbn-ts/language-common'],
  agentRules:false,
  distDir:process.env.OMEUMES_BUILD_DIR||'.next',
};
export default config;
