import { defineConfig } from 'vitest/config';
import { cloudflarePool } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    pool: cloudflarePool({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  },
});
