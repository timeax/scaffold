// src/core/runner.ts

import path from 'path';
import {loadScaffoldConfig} from './config-loader';
import {
    resolveGroupStructure,
    resolveSingleStructure,
} from './resolve-structure';
import {CacheManager} from './cache-manager';
import {HookRunner} from './hook-runner';
import {applyStructure, type InteractiveDeleteParams} from './apply-structure';
import type {Logger} from '../util/logger';
import {defaultLogger} from '../util/logger';
import {formatStructureFilesFromConfig} from "./format";

export interface RunOptions {
    /**
     * Optional interactive delete callback; if omitted, deletions
     * above the size threshold will be skipped (kept + removed from cache).
     */
    interactiveDelete?: (
        params: InteractiveDeleteParams,
    ) => Promise<'delete' | 'keep'>;

    /**
     * Optional logger override.
     */
    logger?: Logger;

    /**
     * Optional overrides (e.g. allow CLI to point at a different scaffold dir).
     */
    scaffoldDir?: string;
    configPath?: string;
    /**
     * If true, force formatting even if config.format?.enabled === false.
     * This is what `--format` will use.
     */
    format?: boolean;
}

/**
 * Run scaffold once for the current working directory.
 */
export async function runOnce(cwd: string, options: RunOptions = {}): Promise<void> {
    const logger = options.logger ?? defaultLogger.child('[runner]');
    const {config, scaffoldDir, projectRoot} = await loadScaffoldConfig(cwd, {
        scaffoldDir: options.scaffoldDir,
        configPath: options.configPath,
    });

    await formatStructureFilesFromConfig(projectRoot, scaffoldDir, config, {force: options.format})

    const cachePath = config.cacheFile ?? '.scaffold-cache.json';
    const cache = new CacheManager(projectRoot, cachePath);
    cache.load();

    const hooks = new HookRunner(config);

    // Grouped mode
    if (config.groups && config.groups.length > 0) {
        for (const group of config.groups) {
            const groupRootAbs = path.resolve(projectRoot, group.root);
            const structure = resolveGroupStructure(scaffoldDir, group, config);

            const groupLogger = logger.child(`[group:${group.name}]`);

            // eslint-disable-next-line no-await-in-loop
            await applyStructure({
                config,
                projectRoot,
                baseDir: groupRootAbs,
                structure,
                cache,
                hooks,
                groupName: group.name,
                groupRoot: group.root,
                interactiveDelete: options.interactiveDelete,
                logger: groupLogger,
            });
        }
    } else {
        // Single-root mode
        const structure = resolveSingleStructure(scaffoldDir, config);
        const baseLogger = logger.child('[group:default]');

        await applyStructure({
            config,
            projectRoot,
            baseDir: projectRoot,
            structure,
            cache,
            hooks,
            groupName: 'default',
            groupRoot: '.',
            interactiveDelete: options.interactiveDelete,
            logger: baseLogger,
        });
    }

    cache.save();
}