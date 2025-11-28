// src/schema/config.ts

import type {
    RegularHookConfig,
    RegularHookKind,
    StubConfig,
} from './hooks';
import type {StructureEntry} from './structure';

// src/schema/index.ts (or wherever ScaffoldConfig lives)

export type FormatMode = 'strict' | 'loose';

export interface FormatConfig {
    /**
     * Enable CLI-driven formatting.
     *
     * If false or omitted, formatting is only run when the user explicitly
     * passes `--format` on the CLI.
     */
    enabled?: boolean;

    /**
     * Default indent step for formatting.
     * Falls back to top-level `indentStep` or 2 if undefined.
     */
    indentStep?: number;

    /**
     * AST mode used by the formatter.
     * - 'loose' (default): try to repair mild indentation issues.
     * - 'strict': keep lines as-is and only normalize cosmetic whitespace.
     */
    mode?: FormatMode;

    /**
     * Sort non-comment entries lexicographically within their parent block.
     * Matches the simple "sortEntries" behaviour you already had.
     */
    sortEntries?: boolean;

    /**
     * When running `scaffold --watch`, if true then any changed structure file
     * is formatted after save and before the scaffold run.
     */
    formatOnWatch?: boolean;
}


/**
 * Configuration for a single structure group.
 *
 * Groups allow you to clearly separate different roots in a project,
 * such as "app", "routes", "resources/js", etc., each with its own
 * structure definition.
 */
export interface StructureGroupConfig {
    /**
     * Human-readable identifier for the group (e.g. "app", "routes", "frontend").
     * Used mainly for logging and, optionally, cache metadata.
     */
    name: string;

    /**
     * Root directory for this group, relative to the overall project root.
     *
     * Example: "app", "routes", "resources/js".
     *
     * All paths produced from this group's structure are resolved
     * relative to this directory.
     */
    root: string;

    /**
     * Optional inline structure entries for this group.
     * If present and non-empty, these take precedence over `structureFile`.
     */
    structure?: StructureEntry[];

    /**
     * Name of the structure file inside the scaffold directory for this group.
     *
     * Example: "app.txt", "routes.txt".
     *
     * If omitted, the default is `<name>.txt` within the scaffold directory.
     */
    structureFile?: string;
}

/**
 * Root configuration object for @timeax/scaffold.
 *
 * This is what you export from `scaffold/config.ts` in a consuming
 * project, or from any programmatic usage of the library.
 */
export interface ScaffoldConfig {
    /**
     * Absolute or relative project root (where files are created).
     *
     * If omitted, the engine will treat `process.cwd()` as the root.
     */
    root?: string;

    /**
     * Base directory where structures are applied and files/folders
     * are actually created.
     *
     * This is resolved relative to `root` (not CWD).
     *
     * Default: same as `root`.
     *
     * Examples:
     * - base: '.'       with root: '.'       → apply to <cwd>
     * - base: 'src'     with root: '.'       → apply to <cwd>/src
     * - base: '..'      with root: 'tools'   → apply to <cwd>/tools/..
     */
    base?: string;

    /**
     * Path to the scaffold cache file, relative to `root`.
     *
     * Default: ".scaffold-cache.json"
     */
    cacheFile?: string;

    /**
     * File size threshold (in bytes) above which deletions become
     * interactive (e.g. ask "are you sure?").
     *
     * Default is determined by the core engine (e.g. 128 KB).
     */
    sizePromptThreshold?: number;

    /**
     * Optional single-root structure (legacy or simple mode).
     *
     * If `groups` is defined and non-empty, this is ignored.
     * Paths are relative to `root` in this mode.
     */
    structure?: StructureEntry[];

    /**
     * Name of the single structure file in the scaffold directory
     * for legacy mode.
     *
     * If `groups` is empty and `structure` is not provided, this
     * file name is used (default: "structure.txt").
     */
    structureFile?: string;

    /**
     * Multiple structure groups (recommended).
     *
     * When provided and non-empty, the engine will iterate over each
     * group and apply its structure relative to each group's `root`.
     */
    groups?: StructureGroupConfig[];

    /**
     * Hook configuration for file lifecycle events.
     *
     * Each category (e.g. "preCreateFile") is an array of hook configs,
     * each with its own `include` / `exclude` / `files` filters.
     */
    hooks?: {
        [K in RegularHookKind]?: RegularHookConfig[];
    };

    /**
     * Stub definitions keyed by stub name.
     *
     * These are referenced from structure entries by `stub: name`.
     */
    stubs?: Record<string, StubConfig>;

    /**
     * When true, the CLI or consuming code may choose to start scaffold
     * in watch mode by default (implementation-specific).
     *
     * This flag itself does not start watch mode; it is a hint to the
     * runner / CLI.
     */
    watch?: boolean;


    /**
     * Number of spaces per indent level in structure files.
     * Default: 2.
     *
     * Examples:
     * - 2  → "··entry"
     * - 4  → "····entry"
     */
    indentStep?: number;

    /**
     * Formatting configuration for structure files.
     */
    format?: FormatConfig;
}

/**
 * Options when scanning an existing directory into a structure.txt tree.
 */
export interface ScanStructureOptions {
    /**
     * Glob patterns (relative to the scanned root) to ignore.
     */
    ignore?: string[];

    /**
     * Maximum depth to traverse (0 = only that dir).
     * Default: Infinity (no limit).
     */
    maxDepth?: number;
}

/**
 * Options when scanning based on the scaffold config/groups.
 */
export interface ScanFromConfigOptions extends ScanStructureOptions {
    /**
     * If provided, only scan these group names (by `StructureGroupConfig.name`).
     * If omitted, all groups are scanned (or single-root mode).
     */
    groups?: string[];

    /**
     * Optional override for scaffold directory; normally you can let
     * loadScaffoldConfig resolve this from "<cwd>/scaffold".
     */
    scaffoldDir?: string;
}