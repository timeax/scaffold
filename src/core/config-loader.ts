// src/core/config-loader.ts

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { transform } from 'esbuild';

import { SCAFFOLD_ROOT_DIR, type ScaffoldConfig } from '../schema';
import { defaultLogger } from '../util/logger';
import { ensureDirSync } from '../util/fs-utils';

const logger = defaultLogger.child('[config]');


export interface LoadScaffoldConfigOptions {
   /**
    * Optional explicit scaffold directory path (absolute or relative to cwd).
    * If provided, this overrides config.root for locating the scaffold folder.
    */
   scaffoldDir?: string;

   /**
    * Optional explicit config file path (absolute or relative to cwd).
    * If not provided, we look for config.* inside the scaffoldDir.
    */
   configPath?: string;
}

export interface LoadScaffoldConfigResult {
   /**
    * Parsed scaffold configuration.
    */
   config: ScaffoldConfig;

   /**
    * Absolute path to the scaffold directory (where config & *.txt live).
    */
   scaffoldDir: string;

   /**
    * Effective project root BASE where structures are applied.
    * This is derived from config.root + config.base.
    */
   projectRoot: string;
}

/**
 * Load scaffold configuration based on CWD + optional overrides + config.root/base.
 *
 * Resolution rules:
 * - configRoot:
 *   - Start from cwd.
 *   - Apply config.root (if defined) as a path relative to cwd.
 * - scaffoldDir:
 *   - If options.scaffoldDir is provided → use it as-is (resolved from cwd).
 *   - Else → <configRoot>/scaffold.
 * - projectRoot (base):
 *   - If config.base is defined → resolve relative to configRoot.
 *   - Else → configRoot.
 */
export async function loadScaffoldConfig(
   cwd: string,
   options: LoadScaffoldConfigOptions = {},
): Promise<LoadScaffoldConfigResult> {
   const absCwd = path.resolve(cwd);

   // First pass: figure out an initial scaffold dir just to locate config.*
   const initialScaffoldDir = options.scaffoldDir
      ? path.resolve(absCwd, options.scaffoldDir)
      : path.join(absCwd, SCAFFOLD_ROOT_DIR);

   const configPath =
      options.configPath ?? resolveConfigPath(initialScaffoldDir);

   // Import config (supports .ts/.tsx via esbuild)
   const config = await importConfig(configPath);

   // Now compute configRoot (where scaffold/ lives by default)
   let configRoot = absCwd;
   if (config.root) {
      configRoot = path.resolve(absCwd, config.root);
   }

   // Final scaffoldDir (can still be overridden by CLI)
   const scaffoldDir = options.scaffoldDir
      ? path.resolve(absCwd, options.scaffoldDir)
      : path.join(configRoot, SCAFFOLD_ROOT_DIR);

   // projectRoot (base) is relative to configRoot
   const baseRoot = config.base
      ? path.resolve(configRoot, config.base)
      : configRoot;

   logger.debug(
      `Loaded config: configRoot=${configRoot}, baseRoot=${baseRoot}, scaffoldDir=${scaffoldDir}`,
   );

   return {
      config,
      scaffoldDir,
      projectRoot: baseRoot,
   };
}

function resolveConfigPath(scaffoldDir: string): string {
   const candidates = [
      'config.ts',
      'config.mts',
      'config.mjs',
      'config.js',
      'config.cjs',
   ];

   for (const file of candidates) {
      const full = path.join(scaffoldDir, file);
      if (fs.existsSync(full)) {
         return full;
      }
   }

   throw new Error(
      `Could not find scaffold config in ${scaffoldDir}. Looked for: ${candidates.join(
         ', ',
      )}`,
   );
}

/**
 * Import a ScaffoldConfig from the given path.
 * - For .ts/.tsx we transpile with esbuild to ESM and load from a temp file.
 * - For .js/.mjs/.cjs we import directly.
 */
async function importConfig(configPath: string): Promise<ScaffoldConfig> {
   const ext = path.extname(configPath).toLowerCase();

   if (ext === '.ts' || ext === '.tsx') {
      return importTsConfig(configPath);
   }

   const url = pathToFileURL(configPath).href;
   const mod = await import(url);
   return (mod.default ?? mod) as ScaffoldConfig;
}

/**
 * Transpile a TS config file to ESM with esbuild and import the compiled file.
 * We cache based on (path + mtime) so changes invalidate the temp.
 */
async function importTsConfig(configPath: string): Promise<ScaffoldConfig> {
   const source = fs.readFileSync(configPath, 'utf8');
   const stat = fs.statSync(configPath);

   const hash = crypto
      .createHash('sha1')
      .update(configPath)
      .update(String(stat.mtimeMs))
      .digest('hex');

   const tmpDir = path.join(os.tmpdir(), 'timeax-scaffold-config');
   ensureDirSync(tmpDir);

   const tmpFile = path.join(tmpDir, `${hash}.mjs`);

   if (!fs.existsSync(tmpFile)) {
      const result = await transform(source, {
         loader: 'ts',
         format: 'esm',
         sourcemap: 'inline',
         target: 'ESNext',
         tsconfigRaw: {
            compilerOptions: {

            },
         },
      });

      fs.writeFileSync(tmpFile, result.code, 'utf8');
   }

   const url = pathToFileURL(tmpFile).href;
   const mod = await import(url);
   return (mod.default ?? mod) as ScaffoldConfig;
}