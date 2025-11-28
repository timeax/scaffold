// src/core/watcher.ts

import path from 'path';
import chokidar from 'chokidar';
import {runOnce, type RunOptions} from './runner';
import {defaultLogger, type Logger} from '../util/logger';
import {SCAFFOLD_ROOT_DIR} from '..';

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
 * This watches:
 * - .scaffold/config.* files
 * - .scaffold/*.txt / *.tss / *.stx files (structures)
 *
 * CLI can call this when `--watch` is enabled.
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
            logger.info('Scaffold run completed.');
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

    const watcher = chokidar.watch(
        [
            // config files (ts/js/etc.)
            path.join(scaffoldDir, 'config.*'),

            // structure files: plain txt + our custom extensions
            path.join(scaffoldDir, '*.txt'),
            path.join(scaffoldDir, '*.tss'),
            path.join(scaffoldDir, '*.stx'),
        ],
        {
            ignoreInitial: false,
        },
    );

    watcher
        .on('add', (filePath) => {
            logger.debug(`File added: ${filePath}`);
            scheduleRun();
        })
        .on('change', (filePath) => {
            logger.debug(`File changed: ${filePath}`);
            scheduleRun();
        })
        .on('unlink', (filePath) => {
            logger.debug(`File removed: ${filePath}`);
            scheduleRun();
        })
        .on('error', (error) => {
            logger.error('Watcher error:', error);
        });

    // Initial run
    scheduleRun();
}