// src/schema/hooks.ts

/**
 * Lifecycle stages for non-stub (regular) hooks.
 *
 * These hooks are called around file operations (create/delete).
 */
export type RegularHookKind =
   | 'preCreateFile'
   | 'postCreateFile'
   | 'preDeleteFile'
   | 'postDeleteFile';

/**
 * Lifecycle stages for stub-related hooks.
 *
 * These hooks are called around stub resolution for file content.
 */
export type StubHookKind = 'preStub' | 'postStub';

/**
 * Context object passed to all hooks (both regular and stub).
 */
export interface HookContext {
   /**
    * Absolute path to the group root / project root that this
    * scaffold run is targeting.
    */
   projectRoot: string;

   /**
    * Path of the file or directory relative to the project root
    * used for this run (or group root, if grouped).
    *
    * Example: "src/index.ts", "Http/Controllers/Controller.php".
    */
   targetPath: string;

   /**
    * Absolute path to the file or directory on disk.
    */
   absolutePath: string;

   /**
    * Whether the target is a directory.
    * (For now, most hooks will be for files, but this is future-proofing.)
    */
   isDirectory: boolean;

   /**
    * The stub name associated with the file (if any).
    *
    * For regular hooks, this can be used to detect which stub
    * produced a given file.
    */
   stubName?: string;

   fileName: string;
   dirName: string;
   extension?: string;
   /**
    * Plural form of the file name (without extension), if applicable.
    */
   pluralFileName: string;
}

/**
 * Common filter options used by both regular and stub hooks.
 *
 * Filters are evaluated against the `targetPath`.
 */
export interface HookFilter {
   /**
    * Glob patterns which must match for the hook to run.
    * If provided, at least one pattern must match.
    */
   include?: string[];

   /**
    * Glob patterns which, if any match, will prevent the hook
    * from running.
    */
   exclude?: string[];

   /**
    * Additional patterns or explicit file paths, treated similarly
    * to `include` — mainly a convenience alias.
    */
   files?: string[];
}

/**
 * Function signature for regular hooks.
 */
export type RegularHookFn = (ctx: HookContext) => void | Promise<void>;

/**
 * Function signature for stub hooks.
 */
export type StubHookFn = (ctx: HookContext) => void | Promise<void>;

/**
 * Configuration for a regular hook instance.
 *
 * Each hook category (e.g. `preCreateFile`) can have an array
 * of these, each with its own filter.
 */
export interface RegularHookConfig extends HookFilter {
   fn: RegularHookFn;
}

/**
 * Configuration for a stub hook instance.
 *
 * Each stub can have its own `preStub` / `postStub` hook arrays,
 * each with independent filters.
 */
export interface StubHookConfig extends HookFilter {
   fn: StubHookFn;
}

/**
 * Stub configuration, defining how file content is generated
 * and which stub-specific hooks apply.
 */
export interface StubConfig {
   /**
    * Unique name of this stub within the config.
    * This is referenced from structure entries via `stub: name`.
    */
   name: string;

   /**
    * Content generator for files that use this stub.
    *
    * If omitted, the scaffold engine may default to an empty file.
    */
   getContent?: (ctx: HookContext) => string | Promise<string>;

   /**
    * Stub-specific hooks called for files that reference this stub.
    */
   hooks?: {
      preStub?: StubHookConfig[];
      postStub?: StubHookConfig[];
   };
}