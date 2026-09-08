import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Main-process code only for now. The renderer would need jsdom plus a
    // stubbed window.electronAPI; these targets are pure and cover the logic
    // behind the findings that actually shipped as bugs.
    include: ['electron/**/*.test.ts'],
    environment: 'node',
  },
});
