// src/core/apply-structure.ts

import fs from 'fs';
import path from 'path';
import type {
   ScaffoldConfig,
   StructureEntry,
   FileEntry,
   DirEntry,
   HookContext,
} from '../schema';
import { CacheManager } from './cache-manager';
import { HookRunner } from './hook-runner';
import {
   ensureDirSync,
   statSafeSync,
   toProjectRelativePath,
   toPosixPath,
} from '../util/fs-utils';
import type { Logger } from '../util/logger';
import { defaultLogger } from '../util/logger';

export interface InteractiveDeleteParams {
   absolutePath: string;
   relativePath: string; // project-root relative, POSIX
   size: number;
   createdByStub?: string;
   groupName?: string;
}

export interface ApplyOptions {
   config: ScaffoldConfig;

   /**
    * Global project root for this run.
    */
   projectRoot: string;

   /**
    * Absolute directory where this structure group should be applied.
    * For grouped mode, this is projectRoot + group.root.
    * For single mode, this will simply be projectRoot.
    */
   baseDir: string;

   /**
    * Which structure entries to apply (already resolved from txt or inline).
    */
   structure: StructureEntry[];

   cache: CacheManager;
   hooks: HookRunner;

   /**
    * Optional group metadata (only set for groups).
    */
   groupName?: string;
   groupRoot?: string;

   /**
    * Optional override for deletion threshold.
    * Falls back to config.sizePromptThreshold or internal default.
    */
   sizePromptThreshold?: number;

   /**
    * Optional interactive delete callback.
    * Should ask the user and return 'delete' or 'keep'.
    */
   interactiveDelete?: (
      params: InteractiveDeleteParams,
   ) => Promise<'delete' | 'keep'>;

   /**
    * Optional logger; defaults to defaultLogger.child('[apply]').
    */
   logger?: Logger;
}

export async function applyStructure(opts: ApplyOptions): Promise<void> {
   const {
      config,
      projectRoot,
      baseDir,
      structure,
      cache,
      hooks,
      groupName,
      groupRoot,
      sizePromptThreshold,
      interactiveDelete,
   } = opts;

   const logger =
      opts.logger ?? defaultLogger.child(groupName ? `[apply:${groupName}]` : '[apply]');

   const desiredPaths = new Set<string>(); // project-root relative, POSIX

   const threshold = sizePromptThreshold ?? config.sizePromptThreshold ?? 128 * 1024;

   async function walk(entry: StructureEntry, inheritedStub?: string): Promise<void> {
      const effectiveStub = entry.stub ?? inheritedStub;
      if (entry.type === 'dir') {
         await handleDir(entry as DirEntry, effectiveStub);
      } else {
         await handleFile(entry as FileEntry, effectiveStub);
      }
   }

   async function handleDir(entry: DirEntry, inheritedStub?: string): Promise<void> {
      const relFromBase = entry.path.replace(/^[./]+/, '');
      const absDir = path.resolve(baseDir, relFromBase);
      const relFromRoot = toPosixPath(
         toProjectRelativePath(projectRoot, absDir),
      );

      desiredPaths.add(relFromRoot);

      ensureDirSync(absDir);

      const nextStub = entry.stub ?? inheritedStub;

      if (entry.children) {
         for (const child of entry.children) {
            // eslint-disable-next-line no-await-in-loop
            await walk(child, nextStub);
         }
      }
   }

   async function handleFile(entry: FileEntry, inheritedStub?: string): Promise<void> {
      const relFromBase = entry.path.replace(/^[./]+/, '');
      const absFile = path.resolve(baseDir, relFromBase);
      const relFromRoot = toPosixPath(
         toProjectRelativePath(projectRoot, absFile),
      );

      desiredPaths.add(relFromRoot);

      const stubName = entry.stub ?? inheritedStub;

      const ctx: HookContext = {
         projectRoot,
         targetPath: relFromRoot,
         absolutePath: absFile,
         isDirectory: false,
         stubName,
      };

      // If file already exists, do not overwrite; just ensure hooks
      if (fs.existsSync(absFile)) {
         return;
      }

      await hooks.runRegular('preCreateFile', ctx);

      const dir = path.dirname(absFile);
      ensureDirSync(dir);

      if (stubName) {
         await hooks.runStub('preStub', ctx);
      }

      let content = '';
      const stubContent = await hooks.renderStubContent(ctx);
      if (typeof stubContent === 'string') {
         content = stubContent;
      }

      fs.writeFileSync(absFile, content, 'utf8');
      const stats = fs.statSync(absFile);

      cache.set({
         path: relFromRoot,
         createdAt: new Date().toISOString(),
         sizeAtCreate: stats.size,
         createdByStub: stubName,
         groupName,
         groupRoot,
      });

      logger.info(`created ${relFromRoot}`);

      if (stubName) {
         await hooks.runStub('postStub', ctx);
      }

      await hooks.runRegular('postCreateFile', ctx);
   }

   // 1) Create/update from structure
   for (const entry of structure) {
      // eslint-disable-next-line no-await-in-loop
      await walk(entry);
   }

   // 2) Handle deletions: any cached path not in desiredPaths
   for (const cachedPath of cache.allPaths()) {
      if (desiredPaths.has(cachedPath)) continue;

      const abs = path.resolve(projectRoot, cachedPath);
      const stats = statSafeSync(abs);

      if (!stats) {
         cache.delete(cachedPath);
         continue;
      }

      // Only handle files here; dirs are not tracked in cache.
      if (!stats.isFile()) {
         cache.delete(cachedPath);
         continue;
      }

      const entry = cache.get(cachedPath);
      const ctx: HookContext = {
         projectRoot,
         targetPath: cachedPath,
         absolutePath: abs,
         isDirectory: false,
         stubName: entry?.createdByStub,
      };

      await hooks.runRegular('preDeleteFile', ctx);

      let shouldDelete = true;
      if (stats.size > threshold && interactiveDelete) {
         const res = await interactiveDelete({
            absolutePath: abs,
            relativePath: cachedPath,
            size: stats.size,
            createdByStub: entry?.createdByStub,
            groupName: entry?.groupName,
         });

         if (res === 'keep') {
            shouldDelete = false;
            cache.delete(cachedPath); // user takes ownership
            logger.info(`keeping ${cachedPath} (removed from cache)`);
         }
      }

      if (shouldDelete) {
         try {
            fs.unlinkSync(abs);
            logger.info(`deleted ${cachedPath}`);
         } catch (err) {
            logger.warn(`failed to delete ${cachedPath}`, err);
         }

         cache.delete(cachedPath);
         await hooks.runRegular('postDeleteFile', ctx);
      }
   }
}