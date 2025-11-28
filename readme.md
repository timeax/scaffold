# Scaffold – `@timeax/scaffold`

A tiny, opinionated scaffolding tool that keeps your project structure in sync with a **declarative tree** (like `structure.txt`) – Prisma‑style.

* Define your desired folders/files in plain text.
* Group structures by area (e.g. `app`, `routes`, `resources/js`).
* Generate those files safely, with caching + hooks + stubs.
* Reverse‑engineer existing projects into `*.txt` structures.
* Watch for changes and re‑apply automatically.

> **Supported structure files:** `.tss`, `.stx`, `structure.txt` (and any `.txt` inside `.scaffold/`).

---

## Features

* **Prisma‑style scaffold directory**: all config and structures live under a hidden root, **`.scaffold/`**, by default.
* **Config‑driven groups**: declare multiple roots (e.g. `app`, `frontend`) with their own structure files.
* **Plain‑text structure files**: strict, easy‑to‑read tree syntax with indentation and annotations.
* **Safe apply**:

    * Creates missing files/directories.
    * Tracks what it created in a cache.
    * Only auto‑deletes files it previously created.
    * Interactive delete for “large” files.
* **Hooks**:

    * Regular hooks around file create/delete.
    * Stub hooks around content generation.
* **Stubs**: programmatic content generators for files (e.g. React pages, controllers, etc.).
* **Watch mode**: watch `.scaffold/` for changes and re‑run automatically.
* **Scanner**: generate `*.tss`/`structure.txt` from an existing codebase.
* **AST + formatter**: loose/strict parser with diagnostics, plus a smart formatter that can *fix* simple indentation mistakes.
* **VS Code extension**: syntax highlighting, formatting, diagnostics, folding, hover info, “go to file”, and code actions.

---

## Installation

```bash
npm install @timeax/scaffold --save-dev
# or
pnpm add -D @timeax/scaffold
yarn add -D @timeax/scaffold
```

The package exposes both a **CLI** (`scaffold`) and a **programmatic API**.

---

## Quick start

### 1. Initialize scaffold folder

```bash
npx scaffold init
# or if installed locally
pnpm scaffold init
```

This will create:

```txt
.scaffold/
  config.ts       # main ScaffoldConfig
  structure.txt   # example structure (single-root mode)
```

If you want a different directory name:

```bash
scaffold init --dir tools/.scaffold
```

> Use `--force` to overwrite existing config/structure files.

---

### 2. Define your structure

By default, `.scaffold/structure.txt` is used in single‑root mode.

Example:

```txt
src/
  index.ts

  schema/
    index.ts
    adapter.ts
    field.ts
    field-map.ts
    form.ts
    input-field.ts
    presets.ts
    variant.ts

index.ts
README.md
```

**Rules:**

* Indent with **2 spaces per level** by default (configurable via `indentStep`).
* Directories **must** end with `/`.
* Files **must not** end with `/`.
* You **cannot indent under a file** (files cannot have children) – in strict mode this is an error, in loose mode you get a diagnostic.
* You can’t “skip” levels (no jumping from depth 0 straight to depth 2 in one go).
* Lines starting with `#` or `//` are treated as comments.
* Inline comments are supported: `index.ts  # comment`, `index.ts  // comment`.

#### Annotations

You can attach metadata per line:

```txt
src/
  pages/ @stub:page
    home.tsx @include:pages/**
    about.tsx @exclude:pages/legacy/**
```

Supported inline annotations:

* `@stub:name` – attach a stub name for content generation.
* `@include:pattern,pattern2` – extra include filters for this entry.
* `@exclude:pattern,pattern2` – extra exclude filters for this entry.

These map onto the `StructureEntry` fields in TypeScript.

---

## Config: groups, base, and indent

In `.scaffold/config.ts` you can enable grouped mode and control the base root + indent step:

```ts
import type { ScaffoldConfig } from '@timeax/scaffold';

const config: ScaffoldConfig = {
  // Project root (defaults to cwd if omitted)
  base: '.',

  // Indent step in spaces (must match your `.tss`/`structure.txt`)
  indentStep: 2,

  // Optional: grouped mode
  groups: [
    { name: 'app',      root: 'app',          structureFile: 'app.txt' },
    { name: 'frontend', root: 'resources/js', structureFile: 'frontend.txt' },
  ],

  hooks: {},
  stubs: {},
};

export default config;
```

Then create per‑group structure files in `.scaffold/`:

```txt
# .scaffold/app.txt
App/Services/
  UserService.php

# .scaffold/frontend.txt
src/
  index.tsx
  pages/
    home.tsx
```

> When `groups` is defined and non‑empty, single‑root `structure`/`structureFile` is ignored.

---

## Running scaffold

```bash
# single run
scaffold

# or with explicit scaffold dir / config
scaffold --dir .scaffold --config .scaffold/config.ts
```

What happens:

* Config is loaded from `.scaffold/config.*` (Prisma‑style resolution).
* Structure(s) are resolved (grouped or single‑root).
* Files/directories missing on disk are created.
* New files are registered in a cache file (default: `.scaffold-cache.json` under project root).
* Any previously created files that are no longer in the structure are candidates for deletion:

    * Small files are deleted automatically.
    * Large files (configurable threshold) trigger an interactive prompt.

### Watch mode

```bash
scaffold --watch
```

* Watches:

    * `.scaffold/config.*`
    * `.scaffold/*.txt` / `.scaffold/*.tss` / `.scaffold/*.stx`
* Debounces rapid edits.
* Prevents overlapping runs.

---

## CLI commands

### `scaffold` (default)

```bash
scaffold [options]
```

Options:

* `-c, --config <path>` – override config file path.
* `-d, --dir <path>` – override scaffold directory (default: `./.scaffold`).
* `-w, --watch` – watch scaffold directory for changes.
* `--quiet` – silence logs.
* `--debug` – verbose debug logs.

---

### `scaffold init`

Initialize the scaffold directory + config + structure.

```bash
scaffold init [options]
```

Options:

* `-d, --dir <path>` – scaffold directory (default: `./.scaffold`, inherited from root options).
* `--force` – overwrite existing `config.ts` / `structure.txt`.

---

### `scaffold scan`

Generate `*.tss`/`structure.txt`‑style definitions from an existing project.

Two modes:

#### 1. Config‑aware mode (default if no `--root` / `--out`)

```bash
scaffold scan
scaffold scan --from-config
scaffold scan --from-config --groups app frontend
```

* Loads `.scaffold/config.ts`.
* For each `group` in config:

    * Scans `group.root` on disk.
    * Writes to `.scaffold/<group.structureFile || group.name + '.txt'>`.
* `--groups` filters which groups to scan.

#### 2. Manual mode (single root)

```bash
scaffold scan -r src
scaffold scan -r src -o .scaffold/src.txt
```

Options:

* `-r, --root <path>` – directory to scan.
* `-o, --out <path>` – output file (otherwise prints to stdout).
* `--ignore <patterns...>` – extra globs to ignore (in addition to defaults like `node_modules/**`, `.git/**`, etc.).

---

### `scaffold structures`

Ensure that all structure files declared in your config exist.

```bash
scaffold structures
```

What it does:

* Loads `.scaffold/config.*`.
* Determines which structure files are expected:

    * **Grouped mode** (`config.groups` defined): each group gets `group.structureFile || \`${group.name}.txt``.
    * **Single-root mode** (no groups): uses `config.structureFile || 'structure.txt'`.
* For each expected structure file:

    * If it **already exists** → it is left untouched.
    * If it is **missing** → it is created with a small header comment.

Examples:

```bash
# With grouped config:
# groups: [
#   { name: 'app', root: 'app', structureFile: 'app.txt' },
#   { name: 'frontend', root: 'resources/js', structureFile: 'frontend.txt' },
# ]
scaffold structures
# => ensures .scaffold/app.txt and .scaffold/frontend.txt exist

# With single-root config:
# structureFile: 'structure.txt'
scaffold structures
# => ensures .scaffold/structure.txt exists
```

This is useful right after setting up or editing `.scaffold/config.ts` so that all declared structure files are present and ready to edit.

---

## TypeScript API

You can also use the core functions programmatically.

```ts
import { runOnce } from '@timeax/scaffold';

await runOnce(process.cwd(), {
  // optional overrides
  configPath: '.scaffold/config.ts',
  scaffoldDir: '.scaffold',
});
```

Scanner:

```ts
import {
  scanDirectoryToStructureText,
  scanProjectFromConfig,
  writeScannedStructuresFromConfig,
} from '@timeax/scaffold';

// low-level
const text = scanDirectoryToStructureText('src');

// config-aware (groups)
const results = await scanProjectFromConfig(process.cwd(), {
  groups: ['app', 'frontend'],
});

// write group structure files to .scaffold/
await writeScannedStructuresFromConfig(process.cwd(), {
  groups: ['app'],
});
```

---

## AST & Formatter

`@timeax/scaffold` exposes an AST parser and formatter from a dedicated subpath:

```ts
import { parseStructureAst, formatStructureText } from '@timeax/scaffold/ast';
```

### `parseStructureAst(text, options)`

Parses a structure file into a loose or strict AST with diagnostics:

```ts
const ast = parseStructureAst(text, {
  indentStep: 2,     // must match your structure files
  mode: 'loose',     // 'loose' | 'strict'
});
```

Return shape (simplified):

```ts
interface StructureAstNode {
  type: 'dir' | 'file';
  name: string;
  path?: string;         // normalized POSIX path (no trailing slash for files)
  line?: number;         // 1-based source line
  indentLevel?: number;  // 0,1,2,...
  stub?: string;
  include?: string[];
  exclude?: string[];
  children?: StructureAstNode[];
}

interface StructureDiagnostic {
  code:
    | 'indent-misaligned'
    | 'indent-skip-level'
    | 'child-of-file-loose'
    | 'path-colon'
    | 'unknown';
  message: string;
  line: number;      // 1-based
  severity: 'info' | 'warning' | 'error';
}

interface StructureAst {
  rootNodes: StructureAstNode[];
  indentStep: number;
  mode: 'loose' | 'strict';
  diagnostics: StructureDiagnostic[];
}
```

**Loose mode** tries to recover from small mistakes (over‑indent, under‑indent) and reports them as diagnostics instead of throwing.

**Strict mode** is closer to the CLI parser and may reject invalid indentation entirely.

Typical diagnostics:

* `indent-misaligned` – indent is not a multiple of `indentStep`.
* `indent-skip-level` – you jumped more than one level at once.
* `child-of-file-loose` – a line is indented under a file.
* `path-colon` – path token contains a colon (`:`), which is reserved for annotations.

### `formatStructureText(text, options)`

Smart formatter that:

* Normalizes line endings and trailing whitespace.
* Re‑indents entries to canonical multiples of `indentStep`.
* Fixes common over‑indent/under‑indent issues in **loose mode**.
* Preserves:

    * Blank lines.
    * Full‑line comments (`#`, `//`).
    * Inline comments and annotations (keeps them attached to their entries).

```ts
const { text: formatted, ast, diagnostics } = formatStructureText(input, {
  indentStep: 2,
  mode: 'loose',      // 'loose' is recommended for editor integrations
});
```

`formatStructureText` reuses the same AST model and diagnostics, so you can:

* Run it in an editor (e.g. VS Code) for formatting.
* Show the diagnostics in a side panel or gutter.
* Still feed the formatted text back into the strict CLI parser later.

---

## Hooks & Stubs (high‑level overview)

### Regular hooks

Regular hooks run around file lifecycle events:

```ts
import type { ScaffoldConfig } from '@timeax/scaffold';

const config: ScaffoldConfig = {
  // ...
  hooks: {
    preCreateFile: [
      {
        include: ['**/*.tsx'],
        async fn(ctx) {
          console.log('About to create', ctx.targetPath);
        },
      },
    ],
    postCreateFile: [],
    preDeleteFile: [],
    postDeleteFile: [],
  },
};
```

Hook kinds:

* `preCreateFile`
* `postCreateFile`
* `preDeleteFile`
* `postDeleteFile`

Each receives a `HookContext` with fields like:

* `projectRoot`
* `targetPath` (project‑relative, POSIX)
* `absolutePath`
* `isDirectory`
* `stubName?`
* `group?`

### Stubs

Stubs generate file contents and can have their own pre/post hooks:

```ts
import type { ScaffoldConfig } from '@timeax/scaffold';

const config: ScaffoldConfig = {
  // ...
  stubs: {
    page: {
      name: 'page',
      async getContent(ctx) {
        const name = ctx.targetPath.split('/').pop();
        return `export default function ${name}() {
  return <div>${name}</div>;
}`;
      },
      hooks: {
        preStub: [
          {
            include: ['**/*.tsx'],
            fn(ctx) {
              console.log('Rendering page stub for', ctx.targetPath);
            },
          },
        ],
        postStub: [],
      },
    },
  },
};
```

In a structure file:

```txt
src/
  pages/ @stub:page
    home.tsx
    about.tsx
```

Any file in `pages/` without an explicit stub inherits `@stub:page` from the parent directory.

---

## Cache & Safety

* Cache file (default): `.scaffold-cache.json` under project root (configurable via `cacheFile`).
* Every file created by scaffold is recorded with:

    * project‑relative path
    * created time
    * size at creation
    * stub name (if any)
    * group metadata
* On each run, scaffold compares the **desired structure** vs. **cached entries**:

    * If a cached file is no longer in the structure and still exists → deletion candidate.
    * If its size exceeds `sizePromptThreshold` (configurable) and the CLI is interactive → prompt the user.
    * If the user chooses “keep”, the file is left on disk and removed from the cache (user now owns it).

This keeps scaffolding **idempotent** and avoids reckless deletes.

---

## VS Code Extension

There is a companion VS Code extension that makes editing scaffold files much nicer.

### Language & files

* Registers a `scaffold-structure` language.
* Treats as scaffold structure files:

    * `.tss`
    * `.stx`
    * `structure.txt`
    * Any `.txt` inside `.scaffold/` (configurable in the extension’s `package.json`).

### Syntax highlighting

* Tree‑like syntax with clear highlighting for:

    * Directories vs files.
    * Annotations (`@stub:`, `@include:`, `@exclude:`).
    * Comments and inline comments.

### Formatting

* Command: **“Scaffold: Format structure”** (`timeax-scaffold.formatStructure`).
* Uses `formatStructureText` from `@timeax/scaffold/ast`:

    * Normalizes indentation to `indentStep`.
    * Fixes simple over/under‑indents in loose mode.
    * Preserves blank lines and comments.

You can wire this as the default formatter for `scaffold-structure` files via your VS Code settings.

### Sorting

* Command: **“Scaffold: Sort entries”** (`timeax-scaffold.sortEntries`).
* Sorts non‑comment lines lexicographically while preserving comment/blank line positions.

### Diagnostics

* Live diagnostics (squiggles) using `parseStructureAst`:

    * `indent-misaligned`, `indent-skip-level`, `child-of-file-loose`, `path-colon`, etc.
* Diagnostics update on open and on change.

### Folding

* Folding regions for directories based on AST:

    * Collapse an entire subtree under a dir.

### Hover

* Hovering an entry shows:

    * Kind (dir/file).
    * Effective `path`.
    * Stub / include / exclude.
    * Resolved absolute path based on `base` + group root.

### “Go to file”

* Command: **“Scaffold: Go to file”** (`timeax-scaffold.openTargetFile`).
* On a file line:

    * Resolves the project base (from `.scaffold/config.*`, `base`, and group `root`).
    * Opens the target file if it exists.
    * If it doesn’t exist, you can create it on the spot.

### Code actions

Source actions exposed in the light‑bulb menu for structure files:

* **“Scaffold: Ensure structure files exist (scaffold structures)”**

    * Runs `npx scaffold structures` in a workspace terminal.
* **“Scaffold: Apply structure to project (scaffold)”**

    * Runs `npx scaffold` in a workspace terminal.

### Status bar integration

* Status bar item (left side) shows current scaffold context:

    * `Scaffold: frontend (resources/js)` when editing `.scaffold/frontend.txt`.
    * `Scaffold: single root` when in single‑root mode.
* Tooltip shows the resolved base root path.

---

## Roadmap / Ideas

Some things this package is intentionally designed to grow into:

* Richer annotations in `*.tss` (e.g. per‑entry hooks, metadata aliases).
* Stub groups (one logical stub creating multiple files at once).
* Built‑in templates for common stacks (Laravel + Inertia, Next.js, etc.).
* Better diff/dry‑run UX (show what will change without touching disk).
* Deeper editor integrations (per‑group commands, quick‑fixes for diagnostics, etc.).

PRs and ideas are welcome ✨
