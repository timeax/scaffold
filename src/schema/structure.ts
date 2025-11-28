// src/schema/structure.ts

/**
 * Common options that can be applied to both files and directories
 * in the scaffold structure.
 *
 * These options are *declarative* — they do not enforce behavior by
 * themselves; they are consumed by the core engine.
 */
export interface BaseEntryOptions {
   /**
    * Glob patterns relative to the group root or project root
    * (depending on how the engine is called).
    *
    * If provided, at least one pattern must match the entry path
    * for the entry to be considered.
    */
   include?: string[];

   /**
    * Glob patterns relative to the group root or project root.
    *
    * If any pattern matches the entry path, the entry will be ignored.
    */
   exclude?: string[];

   /**
    * Name of the stub to use when creating this file or directory’s
    * content. For directories, this can act as an “inherited” stub
    * for child files if the engine chooses to support that behavior.
    */
   stub?: string;
}

/**
 * A single file entry in the structure tree.
 *
 * Paths are always stored as POSIX-style forward-slash paths
 * relative to the group root / project root.
 */
export interface FileEntry extends BaseEntryOptions {
   type: 'file';

   /**
    * File path (e.g. "src/index.ts", "Models/User.php").
    * Paths should never end with a trailing slash.
    */
   path: string;
}

/**
 * A directory entry in the structure tree.
 *
 * Paths should *logically* represent directories and may end
 * with a trailing slash for readability (the engine can normalize).
 */
export interface DirEntry extends BaseEntryOptions {
   type: 'dir';

   /**
    * Directory path (e.g. "src/", "src/schema/", "Models/").
    * It is recommended (but not strictly required) that directory
    * paths end with a trailing slash.
    */
   path: string;

   /**
    * Nested structure entries for files and subdirectories.
    */
   children?: StructureEntry[];
}

/**
 * A single node in the structure tree:
 * either a file or a directory.
 */
export type StructureEntry = FileEntry | DirEntry;
