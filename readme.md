# @timeax/scaffold

A tiny, opinionated scaffolding tool that keeps your project structure in sync with a **declarative tree** (like `structure.txt`) – Prisma‑style.

* Define your desired folders/files in plain text.
* Group structures by area (e.g. `app`, `routes`, `resources/js`).
* Generate those files safely, with caching + hooks + stubs.
* Reverse‑engineer existing projects into `*.txt` structures.
* Watch for changes and re‑apply automatically.

> **Supported structure files:** `.tss`, `.stx`, `structure.txt`, and any `.txt` files inside `.scaffold/`.

---

## Features

* **Prisma‑style scaffold directory**: all config and structure lives under `.scaffold/` by default.
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
* **Scanner**: generate `structure.txt` (or per‑group `*.txt`) from an existing codebase.
* **VS Code integration** (via a companion extension):

  * Syntax highlighting for `.tss`, `.stx`, `structure.txt`, and `.scaffold/**/*.txt`.
  * Inline diagnostics using the same parser as the CLI.
  * “Go to file” from a structure line.
  * Simple formatting and sorting commands.

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
scaffold init --dir tools/scaffold
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

* Indent with **2 spaces per level** (strict by default; configurable).
* Directories **must** end with `/`.
* Files **must not** end with `/`.
* You **cannot indent under a file** (files cannot have children).
* You can’t “skip” levels (no jumping from depth 0 to depth 2 in one go).
* Lines starting with `#` or `//` (after indentation) are comments.
* Inline comments are supported:

  * `index.ts  # comment`
  * `index.ts  // comment`

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

> `:` is reserved for annotations (e.g. `@stub:page`). Paths themselves must **not** contain `:`.

---

### 3. Configure groups (optional but recommended)

In `.scaffold/config.ts` you can enable grouped mode:

```ts
import type { ScaffoldConfig } from '@timeax/scaffold';

const config: ScaffoldConfig = {
  base: '.', // project root (optional, defaults to cwd)

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

> When `groups` is defined and non‑empty, single‑root `structure` / `structureFile` is ignored.

---

### 4. Run scaffold

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
* New files are registered in `.scaffold-cache.json` (under project root by default).
* Any previously created files that are no longer in the structure are candidates for deletion:

  * Small files are deleted automatically.
  * Large files (configurable threshold) trigger an interactive prompt.

### Watch mode

```bash
scaffold --watch
```

* Watches:

  * `.scaffold/config.*`
  * `.scaffold/*.txt`
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

Generate `structure.txt`‑style definitions from an existing project.

Two modes:

#### 1. Config‑aware mode (default if no `--root` / `--out` given)

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

  * **Grouped mode** (`config.groups` defined): each group gets `group.structureFile || `${group.name}.txt``.
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

## Hooks & stubs (high‑level overview)

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

## Cache & safety

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

## Roadmap / Ideas

Some things this package is intentionally designed to grow into:

* Richer annotations in `*.txt` (e.g. per‑entry hooks, metadata aliases).
* Stub groups (one logical stub creating multiple files).
* Built‑in templates for common stacks (Laravel + Inertia, Next.js, etc.).
* Better diff/dry‑run UX (show what will change without touching disk).
* Deeper VS Code integration:

  * Tree-aware sorting.
  * Visual tree editor.
  * Code actions / quick fixes for common mistakes.

PRs and ideas are welcome ✨

---

## VS Code extension

There is an official VS Code companion extension for `@timeax/scaffold` that makes working with your structure files much nicer.

### Language support

The extension adds a custom language **Scaffold Structure** and:

* Highlights:

  * Directories (lines ending with `/`)
  * Files
  * Inline annotations like `@stub:name`, `@include:pattern`, `@exclude:pattern`
  * Comments using `#` or `//` (full-line and inline)
* Treats the following files as scaffold structures:

  * `*.tss`
  * `*.stx`
  * `structure.txt`
  * Any `.txt` file inside your `.scaffold/` directory

The syntax rules match the CLI parser:

* Indent is in fixed steps (configurable via `indentStep`).
* Only directories can have children.
* `:` is reserved for annotations and not allowed inside path names.

### Editor commands

The extension contributes several commands (available via the Command Palette and context menus when editing a scaffold structure file):

* **Scaffold: Go to file**

  * Reads the path on the current line and opens the corresponding file in your project.
  * Respects `.scaffold/config.*`:

    * Uses `base`/`root` to resolve paths.
    * If the current structure file belongs to a `group`, it resolves relative to that group’s `root`.
  * If the file doesn’t exist, it can prompt to create it and open it immediately.

* **Scaffold: Format structure file**

  * Normalizes line endings and trims trailing whitespace.
  * Designed to be safe even on partially-invalid files.
  * Future versions may use the full AST from `@timeax/scaffold` to enforce indentation and ordering.

* **Scaffold: Sort entries**

  * Naive helper that sorts non-comment lines lexicographically while keeping comment/blank lines in place.
  * Useful for quick cleanups of small structure files.

* **Scaffold: Open config**

  * Opens `.scaffold/config.*` for the current workspace (searching common extensions like `config.ts`, `config.mts`, etc.).

* **Scaffold: Open .scaffold folder**

  * Reveals the `.scaffold/` directory in the VS Code Explorer.

### Live validation (diagnostics)

Whenever you open or edit a scaffold structure file:

* The extension calls `parseStructureText` from `@timeax/scaffold` under the hood.
* If parsing fails, the error message (e.g. invalid indentation, children under a file, bad path, etc.) is shown as an editor diagnostic (squiggly underline) on the relevant line.

This means your editor and the CLI always agree on what is valid, since they share the same parser and rules.

> The extension is optional, but highly recommended if you edit `*.tss` / `*.stx` or `structure.txt` files frequently.
