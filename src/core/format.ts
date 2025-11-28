// src/core/format.ts
import fs from 'fs';
import path from 'path';
import {formatStructureText} from '../ast';
import type {ScaffoldConfig, FormatConfig} from '../schema';
import {SCAFFOLD_ROOT_DIR} from '..';

interface FormatFromConfigOptions {
    /**
     * If true, force formatting even if config.format?.enabled === false.
     * This is what `--format` will use.
     */
    force?: boolean;
}

/**
 * Return the list of structure files we expect for this config.
 * (mirrors your scan / structures logic: groups vs single-root).
 */
export function getStructureFilesFromConfig(
    projectRoot: string,
    scaffoldDir: string,
    config: ScaffoldConfig,
): string[] {
    const baseDir = path.resolve(projectRoot, scaffoldDir || SCAFFOLD_ROOT_DIR);

    const files: string[] = [];

    if (config.groups && config.groups.length > 0) {
        for (const group of config.groups) {
            const structureFile =
                group.structureFile && group.structureFile.trim().length
                    ? group.structureFile
                    : `${group.name}.txt`;

            files.push(path.join(baseDir, structureFile));
        }
    } else {
        const structureFile = config.structureFile || 'structure.txt';
        files.push(path.join(baseDir, structureFile));
    }

    return files;
}

/**
 * Format all existing structure files according to config.format.
 */
export async function formatStructureFilesFromConfig(
    projectRoot: string,
    scaffoldDir: string,
    config: ScaffoldConfig,
    opts: FormatFromConfigOptions = {},
): Promise<void> {
    const formatCfg: FormatConfig | undefined = config.format;
    const enabled = !!(formatCfg?.enabled || opts.force);

    if (!enabled) return;

    const files = getStructureFilesFromConfig(projectRoot, scaffoldDir, config);

    const indentStep =
        formatCfg?.indentStep ?? config.indentStep ?? 2;

    const mode = formatCfg?.mode ?? 'loose';
    const sortEntries = !!formatCfg?.sortEntries;

    for (const filePath of files) {
        let text: string;
        try {
            text = fs.readFileSync(filePath, 'utf8');
        } catch {
            // Missing file is fine; we don't create it here.
            continue;
        }

        const {text: formatted} = formatStructureText(text, {
            indentStep,
            mode,
            sortEntries,
        });

        if (formatted !== text) {
            fs.writeFileSync(filePath, formatted, 'utf8');
        }
    }
}