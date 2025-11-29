// src/core/watcher.ts

import path from 'path';
import chokidar from 'chokidar';
import { runOnce, type RunOptions } from './runner';
import { defaultLogger, type Logger } from '../util/logger';
import { SCAFFOLD_ROOT_DIR } from '..';

export interface WatchOptions extends RunOptions {
    /**
     * Debounce delay in milliseconds between detected changes
     * and a scaffold re-run.
     *
     * Default: 150 ms
     */
    debounceMs?: number;

    /**
     * Optional logger; falls back to defaultLogger.child('[watch]').
     */
    logger?: Logger;
}

/**
 * Watch the scaffold directory and re-run scaffold on changes.
 *
 * This watches the entire .scaffold folder and then filters events
 * in-process to:
 *   - config.* files
 *   - *.txt / *.tss / *.stx
 *
 * Any `format` options in RunOptions are passed straight through to `runOnce`,
 * so formatting from config / CLI is applied on each re-run.
 */
export function watchScaffold(cwd: string, options: WatchOptions = {}): void {
    const logger = options.logger ?? defaultLogger.child('[watch]');

    const scaffoldDir = options.scaffoldDir
        ? path.resolve(cwd, options.scaffoldDir)
        : path.resolve(cwd, SCAFFOLD_ROOT_DIR);

    const debounceMs = options.debounceMs ?? 150;

    logger.info(`Watching scaffold directory: ${scaffoldDir}`);

    let timer: NodeJS.Timeout | undefined;
    let running = false;
    let pending = false;

    async function run() {
        if (running) {
            pending = true;
            return;
        }
        running = true;
        try {
            logger.info('Change detected → running scaffold...');
            await runOnce(cwd, {
                ...options,
                // we already resolved scaffoldDir for watcher; pass it down
                scaffoldDir,
            });
            logger.info('Scaffold run completed');
        } catch (err) {
            logger.error('Scaffold run failed:', err);
        } finally {
            running = false;
            if (pending) {
                pending = false;
                timer = setTimeout(run, debounceMs);
            }
        }
    }

    function scheduleRun() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(run, debounceMs);
    }

    // Only react to config.* and structure files inside scaffoldDir
    function isInteresting(filePath: string): boolean {
        const rel = path.relative(scaffoldDir, filePath);
        // Outside .scaffold or in parent → ignore
        if (rel.startsWith('..')) return false;

        const base = path.basename(filePath).toLowerCase();
        // config.ts / config.js / config.mts / etc.
        if (base.startsWith('config.')) return true;

        const ext = path.extname(base);
        return ext === '.txt' || ext === '.tss' || ext === '.stx';
    }

    const watcher = chokidar.watch(scaffoldDir, {
        ignoreInitial: false,
        persistent: true,
    });

    watcher
        .on('all', (event, filePath) => {
            if (!isInteresting(filePath)) return;
            logger.debug(`Event ${event} on ${filePath}`);
            scheduleRun();
        })
        .on('error', (error) => {
            logger.error('Watcher error:', error);
        });

    // Initial run
    scheduleRun();
}