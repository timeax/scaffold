// src/core/scan-structure.ts

import fs from 'fs';
import path from 'path';
import { minimatch } from 'minimatch';

import {
   ScanStructureOptions,
   ScanFromConfigOptions,
   StructureGroupConfig,
   ScaffoldConfig,
} from '../schema';
import { toPosixPath, ensureDirSync } from '../util/fs-utils';
import { loadScaffoldConfig } from './config-loader';
import { defaultLogger } from '../util/logger';

const logger = defaultLogger.child('[scan]');

const DEFAULT_IGNORE: string[] = [
   'node_modules/**',
   '.git/**',
   'dist/**',
   'build/**',
   '.turbo/**',
   '.next/**',
   'coverage/**',
];

/**
 * Generate a structure.txt-style tree from an existing directory.
 *
 * Indenting:
 * - 2 spaces per level.
 * - Directories suffixed with "/".
 * - No stub/include/exclude annotations are guessed (plain tree).
 */
export function scanDirectoryToStructureText(
   rootDir: string,
   options: ScanStructureOptions = {},
): string {
   const absRoot = path.resolve(rootDir);
   const lines: string[] = [];

   const ignorePatterns = options.ignore ?? DEFAULT_IGNORE;
   const maxDepth = options.maxDepth ?? Infinity;

   function isIgnored(absPath: string): boolean {
      const rel = toPosixPath(path.relative(absRoot, absPath));
      if (!rel || rel === '.') return false;
      return ignorePatterns.some((pattern) =>
         minimatch(rel, pattern, { dot: true }),
      );
   }

   function walk(currentAbs: string, depth: number) {
      if (depth > maxDepth) return;

      let dirents: fs.Dirent[];
      try {
         dirents = fs.readdirSync(currentAbs, { withFileTypes: true });
      } catch {
         return;
      }

      // Sort: directories first, then files, both alphabetically
      dirents.sort((a, b) => {
         if (a.isDirectory() && !b.isDirectory()) return -1;
         if (!a.isDirectory() && b.isDirectory()) return 1;
         return a.name.localeCompare(b.name);
      });

      for (const dirent of dirents) {
         const name = dirent.name;
         const absPath = path.join(currentAbs, name);

         if (isIgnored(absPath)) continue;

         const indent = '  '.repeat(depth);
         if (dirent.isDirectory()) {
            lines.push(`${indent}${name}/`);
            walk(absPath, depth + 1);
         } else if (dirent.isFile()) {
            lines.push(`${indent}${name}`);
         }
         // symlinks etc. are skipped for now
      }
   }

   walk(absRoot, 0);
   return lines.join('\n');
}

/**
 * Result of scanning based on the scaffold config.
 *
 * You can use `structureFilePath` + `text` to write out group structure files.
 */
export interface ScanFromConfigResult {
   groupName: string;
   groupRoot: string;
   structureFileName: string;
   structureFilePath: string;
   text: string;
}

/**
 * Scan the project using the scaffold config and its groups.
 *
 * - If `config.groups` exists and is non-empty:
 *   - scans each group's `root` (relative to projectRoot)
 *   - produces text suitable for that group's structure file
 * - Otherwise:
 *   - scans the single `projectRoot` and produces text for a single structure file.
 *
 * NOTE: This function does NOT write files; it just returns what should be written.
 * The CLI (or caller) decides whether/where to save.
 */
export async function scanProjectFromConfig(
   cwd: string,
   options: ScanFromConfigOptions = {},
): Promise<ScanFromConfigResult[]> {
   const { config, scaffoldDir, projectRoot } = await loadScaffoldConfig(cwd, {
      scaffoldDir: options.scaffoldDir,
   });

   const ignorePatterns = options.ignore ?? DEFAULT_IGNORE;
   const maxDepth = options.maxDepth ?? Infinity;
   const onlyGroups = options.groups;

   const results: ScanFromConfigResult[] = [];

   function scanGroup(
      cfg: ScaffoldConfig,
      group: StructureGroupConfig,
   ): ScanFromConfigResult {
      const rootAbs = path.resolve(projectRoot, group.root);
      const text = scanDirectoryToStructureText(rootAbs, {
         ignore: ignorePatterns,
         maxDepth,
      });

      const structureFileName = group.structureFile ?? `${group.name}.txt`;
      const structureFilePath = path.join(scaffoldDir, structureFileName);

      return {
         groupName: group.name,
         groupRoot: group.root,
         structureFileName,
         structureFilePath,
         text,
      };
   }

   if (config.groups && config.groups.length > 0) {
      logger.debug(
         `Scanning project from config with ${config.groups.length} group(s).`,
      );

      for (const group of config.groups) {
         if (onlyGroups && !onlyGroups.includes(group.name)) {
            continue;
         }
         const result = scanGroup(config, group);
         results.push(result);
      }
   } else {
      // Single-root mode: scan the whole projectRoot
      logger.debug('Scanning project in single-root mode (no groups).');

      const text = scanDirectoryToStructureText(projectRoot, {
         ignore: ignorePatterns,
         maxDepth,
      });

      const structureFileName = config.structureFile ?? 'structure.txt';
      const structureFilePath = path.join(scaffoldDir, structureFileName);

      results.push({
         groupName: 'default',
         groupRoot: '.',
         structureFileName,
         structureFilePath,
         text,
      });
   }

   return results;
}

/**
 * Convenience helper: write scan results to their structure files.
 *
 * This will ensure the scaffold directory exists and overwrite existing
 * structure files.
 */
export async function writeScannedStructuresFromConfig(
   cwd: string,
   options: ScanFromConfigOptions = {},
): Promise<void> {
   const { scaffoldDir } = await loadScaffoldConfig(cwd, {
      scaffoldDir: options.scaffoldDir,
   });

   ensureDirSync(scaffoldDir);

   const results = await scanProjectFromConfig(cwd, options);

   for (const result of results) {
      fs.writeFileSync(result.structureFilePath, result.text, 'utf8');
      logger.info(
         `Wrote structure for group "${result.groupName}" to ${result.structureFilePath}`,
      );
   }
}



export interface EnsureStructuresResult {
   created: string[];
   existing: string[];
}

/**
 * Ensure all structure files declared in the config exist.
 *
 * - Grouped mode: one file per group (group.structureFile || `${group.name}.txt`)
 * - Single-root mode: config.structureFile || "structure.txt"
 *
 * Existing files are left untouched. Only missing files are created with
 * a small header comment.
 */
export async function ensureStructureFilesFromConfig(
   cwd: string,
   options: { scaffoldDirOverride?: string } = {},
): Promise<EnsureStructuresResult> {
   const { config, scaffoldDir } = await loadScaffoldConfig(cwd, {
      scaffoldDir: options.scaffoldDirOverride,
   });

   ensureDirSync(scaffoldDir);

   const created: string[] = [];
   const existing: string[] = [];

   const seen = new Set<string>();

   const ensureFile = (fileName: string) => {
      if (!fileName) return;

      const filePath = path.join(scaffoldDir, fileName);
      const key = path.resolve(filePath);

      if (seen.has(key)) return;
      seen.add(key);

      if (fs.existsSync(filePath)) {
         existing.push(filePath);
         return;
      }

      const header =
         `# ${fileName}\n` +
         `# Structure file for @timeax/scaffold\n` +
         `# Define your desired folders/files here.\n`;

      fs.writeFileSync(filePath, header, 'utf8');
      created.push(filePath);
   };

   if (config.groups && config.groups.length > 0) {
      for (const group of config.groups) {
         const fileName = group.structureFile ?? `${group.name}.txt`;
         ensureFile(fileName);
      }
   } else {
      const fileName = config.structureFile ?? 'structure.txt';
      ensureFile(fileName);
   }

   logger.debug(
      `ensureStructureFilesFromConfig: created=${created.length}, existing=${existing.length}`,
   );

   return { created, existing };
}