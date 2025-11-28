// src/util/fs-utils.ts

import fs from 'fs';
import path from 'path';

/**
 * Convert any path to a POSIX-style path with forward slashes.
 */
export function toPosixPath(p: string): string {
   return p.replace(/\\/g, '/');
}

/**
 * Ensure a directory exists (like mkdir -p).
 * Returns the absolute path of the directory.
 */
export function ensureDirSync(dirPath: string): string {
   if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
   }
   return dirPath;
}

/**
 * Synchronous check for file or directory existence.
 */
export function existsSync(targetPath: string): boolean {
   return fs.existsSync(targetPath);
}

/**
 * Read a file as UTF-8, returning null if it doesn't exist
 * or if an error occurs (no exceptions thrown).
 */
export function readFileSafeSync(filePath: string): string | null {
   try {
      return fs.readFileSync(filePath, 'utf8');
   } catch {
      return null;
   }
}

/**
 * Write a UTF-8 file, creating parent directories if needed.
 */
export function writeFileSafeSync(filePath: string, contents: string): void {
   const dir = path.dirname(filePath);
   ensureDirSync(dir);
   fs.writeFileSync(filePath, contents, 'utf8');
}

/**
 * Remove a file if it exists. Does nothing on error.
 */
export function removeFileSafeSync(filePath: string): void {
   try {
      if (fs.existsSync(filePath)) {
         fs.unlinkSync(filePath);
      }
   } catch {
      // ignore
   }
}

/**
 * Get file stats if they exist, otherwise null.
 */
export function statSafeSync(targetPath: string): fs.Stats | null {
   try {
      return fs.statSync(targetPath);
   } catch {
      return null;
   }
}

/**
 * Resolve an absolute path from projectRoot + relative path,
 * and assert it stays within the project root.
 *
 * Throws if the resolved path escapes the project root.
 */
export function resolveProjectPath(projectRoot: string, relPath: string): string {
   const absRoot = path.resolve(projectRoot);
   const absTarget = path.resolve(absRoot, relPath);

   // Normalise for safety check
   const rootWithSep = absRoot.endsWith(path.sep) ? absRoot : absRoot + path.sep;
   if (!absTarget.startsWith(rootWithSep) && absTarget !== absRoot) {
      throw new Error(
         `Attempted to resolve path outside project root: ` +
         `root="${absRoot}", target="${absTarget}"`,
      );
   }

   return absTarget;
}

/**
 * Convert an absolute path back to a project-relative path.
 * Throws if the path is not under projectRoot.
 */
export function toProjectRelativePath(projectRoot: string, absolutePath: string): string {
   const absRoot = path.resolve(projectRoot);
   const absTarget = path.resolve(absolutePath);

   const rootWithSep = absRoot.endsWith(path.sep) ? absRoot : absRoot + path.sep;
   if (!absTarget.startsWith(rootWithSep) && absTarget !== absRoot) {
      throw new Error(
         `Path "${absTarget}" is not inside project root "${absRoot}".`,
      );
   }

   const rel = path.relative(absRoot, absTarget);
   return toPosixPath(rel);
}

/**
 * Check if `target` is inside (or equal to) `base` directory.
 */
export function isSubPath(base: string, target: string): boolean {
   const absBase = path.resolve(base);
   const absTarget = path.resolve(target);

   const baseWithSep = absBase.endsWith(path.sep) ? absBase : absBase + path.sep;
   return absTarget === absBase || absTarget.startsWith(baseWithSep);
}