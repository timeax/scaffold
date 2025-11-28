// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        cli: 'src/cli/main.ts',
        ast: 'src/ast/index.ts',
    },
    outDir: 'dist',
    format: ['esm', 'cjs'],
    // Only generate dts for index + ast (not CLI)
    dts: {
        entry: {
            index: 'src/index.ts',
            ast: 'src/ast/index.ts',
        },
    },
    sourcemap: true,
    clean: true,
    target: 'node18',
    platform: 'node',
    treeshake: true,
    splitting: false,
    outExtension({ format }) {
        return {
            js: format === 'esm' ? '.mjs' : '.cjs',
        };
    },
});