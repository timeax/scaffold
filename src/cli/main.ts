#!/usr/bin/env node
// noinspection RequiredAttributes

import readline from "readline";
import path from "path";
import fs from "fs";
import { Command } from "commander";
import { runOnce, type RunOptions } from "../core/runner";
import { watchScaffold } from "../core/watcher";
import {
  ensureStructureFilesFromConfig,
  scanDirectoryToStructureText,
  writeScannedStructuresFromConfig,
} from "../core/scan-structure";
import { initScaffold } from "../core/init-scaffold";
import { defaultLogger, type Logger } from "../util/logger";
import { ensureDirSync } from "../util/fs-utils";
import { SCAFFOLD_ROOT_DIR } from "../schema";

interface BaseCliOptions {
  config?: string;
  dir?: string;
  watch?: boolean;
  quiet?: boolean;
  debug?: boolean;
}

interface ScanCliOptions {
  root?: string;
  out?: string;
  ignore?: string[];
  fromConfig?: boolean;
  groups?: string[];
  maxDepth?: number;
}

interface InitCliOptions {
  force?: boolean;
}

interface StructuresCliOptions {} // reserved for future options

/**
 * Create a logger with the appropriate level from CLI flags.
 */
function createCliLogger(opts: { quiet?: boolean; debug?: boolean }): Logger {
  if (opts.quiet) {
    defaultLogger.setLevel("silent");
  } else if (opts.debug) {
    defaultLogger.setLevel("debug");
  }
  return defaultLogger.child("[cli]");
}

function askYesNo(question: string): Promise<"delete" | "keep"> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      const val = answer.trim().toLowerCase();
      if (val === "y" || val === "yes") {
        resolve("delete");
      } else {
        resolve("keep");
      }
    });
  });
}

async function handleRunCommand(cwd: string, baseOpts: BaseCliOptions) {
  const logger = createCliLogger(baseOpts);

  const configPath = baseOpts.config
    ? path.resolve(cwd, baseOpts.config)
    : undefined;

  // NOTE: scaffoldDir is optional – if omitted, runOnce/loadScaffoldConfig
  // will default to SCAFFOLD_ROOT_DIR.
  const scaffoldDir = baseOpts.dir
    ? path.resolve(cwd, baseOpts.dir)
    : undefined;

  const resolvedScaffoldDir =
    scaffoldDir ?? path.resolve(cwd, SCAFFOLD_ROOT_DIR);

  logger.debug(
    `Starting scaffold (cwd=${cwd}, config=${configPath ?? "auto"}, dir=${resolvedScaffoldDir}, watch=${baseOpts.watch ? "yes" : "no"})`,
  );

  const runnerOptions: RunOptions = {
    configPath,
    scaffoldDir,
    logger,
    interactiveDelete: async ({
      relativePath,
      size,
      createdByStub,
      groupName,
    }) => {
      const sizeKb = (size / 1024).toFixed(1);
      const stubInfo = createdByStub ? ` (stub: ${createdByStub})` : "";
      const groupInfo = groupName ? ` [group: ${groupName}]` : "";
      const question = `File "${relativePath}"${groupInfo} is ~${sizeKb}KB and no longer in structure${stubInfo}. Delete it?`;

      return askYesNo(question);
    },
  };

  if (baseOpts.watch) {
    // Watch mode – this will not return
    watchScaffold(cwd, runnerOptions);
  } else {
    await runOnce(cwd, runnerOptions);
  }
}

async function handleScanCommand(
  cwd: string,
  scanOpts: ScanCliOptions,
  baseOpts: BaseCliOptions,
) {
  const logger = createCliLogger(baseOpts);

  const useConfigMode =
    scanOpts.fromConfig || (!scanOpts.root && !scanOpts.out);

  if (useConfigMode) {
    logger.info("Scanning project using scaffold config/groups...");
    await writeScannedStructuresFromConfig(cwd, {
      ignore: scanOpts.ignore,
      groups: scanOpts.groups,
      scaffoldDir: baseOpts.dir,
      maxDepth: scanOpts.maxDepth
    });
    return;
  }

  // Manual single-root mode
  const rootDir = path.resolve(cwd, scanOpts.root ?? ".");
  const ignore = scanOpts.ignore ?? [];

  logger.info(`Scanning directory for structure: ${rootDir}`);
  const text = scanDirectoryToStructureText(rootDir, {
    ignore,
  });

  if (scanOpts.out) {
    const outPath = path.resolve(cwd, scanOpts.out);
    const dir = path.dirname(outPath);
    ensureDirSync(dir);
    fs.writeFileSync(outPath, text, "utf8");
    logger.info(`Wrote structure to ${outPath}`);
  } else {
    process.stdout.write(text + "\n");
  }
}

async function handleInitCommand(
  cwd: string,
  initOpts: InitCliOptions,
  baseOpts: BaseCliOptions,
) {
  const logger = createCliLogger(baseOpts);

  const scaffoldDirRel = baseOpts.dir ?? SCAFFOLD_ROOT_DIR;

  logger.info(`Initializing scaffold directory at "${scaffoldDirRel}"...`);

  const result = await initScaffold(cwd, {
    scaffoldDir: scaffoldDirRel,
    force: initOpts.force,
  });

  logger.info(
    `Done. Config: ${result.configPath}, Structure: ${result.structurePath}`,
  );
}

async function handleStructuresCommand(cwd: string, baseOpts: BaseCliOptions) {
  const logger = createCliLogger(baseOpts);

  logger.info("Ensuring structure files declared in config exist...");

  const { created, existing } = await ensureStructureFilesFromConfig(cwd, {
    scaffoldDirOverride: baseOpts.dir,
  });

  if (created.length === 0) {
    logger.info("All structure files already exist. Nothing to do.");
  } else {
    for (const filePath of created) {
      logger.info(`Created structure file: ${filePath}`);
    }
  }

  existing.forEach((p) => logger.debug(`Structure file already exists: ${p}`));
}

async function main() {
  const cwd = process.cwd();

  const program = new Command();

  program
    .name("scaffold")
    .description("@timeax/scaffold – structure-based project scaffolding")
    // global-ish options used by base + scan + init + structures
    .option("-c, --config <path>", "Path to scaffold config file")
    .option(
      "-d, --dir <path>",
      `Path to scaffold directory (default: ./${SCAFFOLD_ROOT_DIR})`,
    )
    .option("-w, --watch", "Watch scaffold directory for changes")
    .option("--quiet", "Silence logs")
    .option("--debug", "Enable debug logging");

  // scan subcommand
  program
    .command("scan")
    .description(
      "Generate structure.txt-style output (config-aware by default, or manual root/out)",
    )
    .option(
      "--from-config",
      `Scan based on scaffold config/groups and write structure files into ${SCAFFOLD_ROOT_DIR}/ (default if no root/out specified)`,
    )
    .option("-r, --root <path>", "Root directory to scan (manual mode)")
    .option("-o, --out <path>", "Output file path (manual mode)")
    .option("-d, --depth <number>", "Max directory depth to scan (default: infinity, 0 = only scan root dir")
    .option(
      "--ignore <patterns...>",
      "Additional glob patterns to ignore (relative to root)",
    )
    .option(
      "--groups <names...>",
      "Limit config-based scanning to specific groups (by name)",
    )
    .action(async (scanOpts: ScanCliOptions, cmd: Command) => {
      const baseOpts = cmd.parent?.opts<BaseCliOptions>() ?? {};
      await handleScanCommand(cwd, scanOpts, baseOpts);
    });

  // init subcommand
  program
    .command("init")
    .description(
      `Initialize ${SCAFFOLD_ROOT_DIR} folder and config/structure files`,
    )
    .option(
      "--force",
      "Overwrite existing config/structure files if they already exist",
    )
    .action(async (initOpts: InitCliOptions, cmd: Command) => {
      const baseOpts = cmd.parent?.opts<BaseCliOptions>() ?? {};
      await handleInitCommand(cwd, initOpts, baseOpts);
    });

  // structures subcommand
  program
    .command("structures")
    .description(
      "Create missing structure files specified in the config (does not overwrite existing files)",
    )
    .action(async (_opts: StructuresCliOptions, cmd: Command) => {
      const baseOpts = cmd.parent?.opts<BaseCliOptions>() ?? {};
      await handleStructuresCommand(cwd, baseOpts);
    });

  // Base command: run scaffold once or in watch mode
  program.action(async (opts: BaseCliOptions) => {
    await handleRunCommand(cwd, opts);
  });

  await program.parseAsync(process.argv);
}

// Run and handle errors
main().catch((err) => {
  defaultLogger.error(err);
  process.exit(1);
});
