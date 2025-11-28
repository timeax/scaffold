// tsup.config.ts
import {defineConfig} from 'tsup';

export default defineConfig([
    {
        entry: ['src/index.ts'],
        outDir: 'dist',
        format: ['esm', 'cjs'],
        dts: true,
        sourcemap: true,
        clean: true,
        target: 'node18',
        platform: 'node',
        treeshake: true,
        splitting: false, // small lib, keep it simple
        outExtension({format}) {
            return {
                // ESM → .mjs, CJS → .cjs
                js: format === 'esm' ? '.mjs' : '.cjs',
            };
        },
    },

    // CLI build (scaffold command)
    {
        entry: {
            cli: 'src/cli/main.ts',
        },
        outDir: 'dist',
        format: ['esm', 'cjs'],
        dts: false,
        sourcemap: true,
        clean: false, // don't blow away the lib build
        target: 'node18',
        platform: 'node',
        treeshake: true,
        splitting: false,
        outExtension({format}) {
            return {
                js: format === 'esm' ? '.mjs' : '.cjs',
            };
        },
        banner: {
            js: '#!/usr/bin/env node',
        },
    },
    {
        entry: {
            ast: "src/ast/index.ts",
        },
        outDir: "dist",
        format: ['esm', 'cjs'],
        dts: true,
        sourcemap: true,
        clean: false,
        target: 'node18',
        platform: 'node',
        treeshake: true,
        splitting: false,
        outExtension({format}) {
            return {
                js: format === 'esm' ? '.mjs' : '.cjs',
            };
        },
    }
]);