// src/core/cache-manager.ts

import fs from 'fs';
import path from 'path';
import { ensureDirSync, toPosixPath } from '../util/fs-utils';
import { defaultLogger } from '../util/logger';

const logger = defaultLogger.child('[cache]');

export interface CacheEntry {
   /**
    * Path relative to the *project root* (global root), POSIX style.
    */
   path: string;

   createdAt: string;
   sizeAtCreate: number;
   createdByStub?: string;
   groupName?: string;
   groupRoot?: string;
}

export interface CacheFile {
   version: 1;
   entries: Record<string, CacheEntry>;
}

const DEFAULT_CACHE: CacheFile = {
   version: 1,
   entries: {},
};

export class CacheManager {
   private cache: CacheFile = DEFAULT_CACHE;

   constructor(
      private readonly projectRoot: string,
      private readonly cacheFileRelPath: string,
   ) { }

   private get cachePathAbs(): string {
      return path.resolve(this.projectRoot, this.cacheFileRelPath);
   }

   load(): void {
      const cachePath = this.cachePathAbs;
      if (!fs.existsSync(cachePath)) {
         this.cache = { ...DEFAULT_CACHE, entries: {} };
         return;
      }

      try {
         const raw = fs.readFileSync(cachePath, 'utf8');
         const parsed = JSON.parse(raw) as CacheFile;
         if (parsed.version === 1 && parsed.entries) {
            this.cache = parsed;
         } else {
            logger.warn('Cache file version mismatch or invalid, resetting cache.');
            this.cache = { ...DEFAULT_CACHE, entries: {} };
         }
      } catch (err) {
         logger.warn('Failed to read cache file, resetting cache.', err);
         this.cache = { ...DEFAULT_CACHE, entries: {} };
      }
   }

   save(): void {
      const cachePath = this.cachePathAbs;
      const dir = path.dirname(cachePath);
      ensureDirSync(dir);
      fs.writeFileSync(cachePath, JSON.stringify(this.cache, null, 2), 'utf8');
   }

   get(relPath: string): CacheEntry | undefined {
      const key = toPosixPath(relPath);
      return this.cache.entries[key];
   }

   set(entry: CacheEntry): void {
      const key = toPosixPath(entry.path);
      this.cache.entries[key] = {
         ...entry,
         path: key,
      };
   }

   delete(relPath: string): void {
      const key = toPosixPath(relPath);
      delete this.cache.entries[key];
   }

   allPaths(): string[] {
      return Object.keys(this.cache.entries);
   }

   allEntries(): CacheEntry[] {
      return Object.values(this.cache.entries);
   }
}