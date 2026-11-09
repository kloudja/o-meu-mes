import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/integration/**/*.test.ts'],environment:'node',testTimeout:45000,hookTimeout:45000,fileParallelism:false}});
