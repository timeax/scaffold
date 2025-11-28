// vitest.config.ts
import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        // adjust these to your actual structure
        include: ['test/**/*.spec.ts', 'tests/**/*.spec.ts'],
    },
});