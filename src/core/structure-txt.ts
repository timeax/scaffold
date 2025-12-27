// src/core/structure-txt.ts

import type {StructureEntry, DirEntry, FileEntry} from '../schema';
import {toPosixPath} from '../util/fs-utils';
import {mapThrough} from "../ast";

interface ParsedLine {
    lineNo: number;
    indentSpaces: number;
    rawPath: string;
    stub?: string;
    include?: string[];
    exclude?: string[];
}

/**
 * Strip inline comments from a content segment.
 *
 * Supports:
 *   - "index.ts  # comment"
 *   - "index.ts  // comment"
 *
 * Rules:
 * - We assume leading indentation has already been removed.
 * - Leading '#' or '//' (full-line comments) are handled BEFORE this function.
 * - A comment starts at the first '#' or '//' that is
 *   preceded by whitespace (space or tab).
 */
function stripInlineComment(content: string): string {
    const cutIndex = mapThrough(content);
    if (cutIndex === -1) {
        return content.trimEnd();
    }

    return content.slice(0, cutIndex).trimEnd();
}

/**
 * Parse a single non-empty, non-comment line into a ParsedLine.
 * Supports inline annotations:
 * - @stub:name
 * - @include:pattern,pattern2
 * - @exclude:pattern,pattern2
 */
function parseLine(line: string, lineNo: number, fileName: string): ParsedLine | null {
    const match = line.match(/^(\s*)(.*)$/);
    if (!match) return null;

    const indentSpaces = match[1].length;
    let rest = match[2];

    // If line (after indent) is empty, skip
    if (!rest.trim()) return null;

    // Full-line comments after indent
    const trimmedRest = rest.trimStart();
    if (trimmedRest.startsWith('#') || trimmedRest.startsWith('//')) {
        return null;
    }

    // Strip inline comments (# or //) before parsing tokens
    const stripped = stripInlineComment(rest);
    const trimmed = stripped.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(/\s+/);
    if (!parts.length) return null;

    const pathToken = parts[0];

    // 🚫 Reserve ":" for annotations only – paths may not contain it.
    if (pathToken.includes(':')) {
        throw new Error(
            `${fileName}: ":" is reserved for annotations (@stub:, @include:, etc). ` +
            `Invalid path "${pathToken}" on line ${lineNo}.`,
        );
    }

    let stub: string | undefined;
    const include: string[] = [];
    const exclude: string[] = [];

    for (const token of parts.slice(1)) {
        if (token.startsWith('@stub:')) {
            stub = token.slice('@stub:'.length);
        } else if (token.startsWith('@include:')) {
            const val = token.slice('@include:'.length);
            if (val) {
                include.push(
                    ...val
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                );
            }
        } else if (token.startsWith('@exclude:')) {
            const val = token.slice('@exclude:'.length);
            if (val) {
                exclude.push(
                    ...val
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                );
            }
        }
    }

    return {
        lineNo,
        indentSpaces,
        rawPath: pathToken,
        stub,
        include: include.length ? include : undefined,
        exclude: exclude.length ? exclude : undefined,
    };
}

/**
 * Convert a structure.txt content into a nested StructureEntry[].
 *
 * Rules:
 * - Indentation is **indentStep** spaces per level (default: 2).
 * - Indent must be a multiple of indentStep.
 * - You cannot "skip" levels (no jumping from level 0 to 2 directly).
 * - **Only directories can have children**:
 *   - If you indent under a file, an error is thrown.
 * - Folders must end with "/" in the txt; paths are normalized to POSIX.
 */
export function parseStructureText(
    fileName: string,
    text: string,
    indentStep = 2,
): StructureEntry[] {
    const lines = text.split(/\r?\n/);
    const parsed: ParsedLine[] = [];

    for (let i = 0; i < lines.length; i++) {
        const lineNo = i + 1;
        const p = parseLine(lines[i], lineNo, fileName);
        if (p) parsed.push(p);
    }

    const rootEntries: StructureEntry[] = [];

    type StackItem = {
        level: number;
        entry: DirEntry | FileEntry;
        isDir: boolean;
    };

    const stack: StackItem[] = [];

    for (const p of parsed) {
        const {indentSpaces, lineNo} = p;

        if (indentSpaces % indentStep !== 0) {
            throw new Error(
                `${fileName}: Invalid indent on line ${lineNo}. ` +
                `Indent must be multiples of ${indentStep} spaces.`,
            );
        }

        const level = indentSpaces / indentStep;

        // Determine parent level and enforce no skipping
        if (level > stack.length) {
            // e.g. current stack depth 1, but line level=3 is invalid
            if (level !== stack.length + 1) {
                throw new Error(
                    `${fileName}: Invalid indentation on line ${lineNo}. ` +
                    `You cannot jump more than one level at a time. ` +
                    `Previous depth: ${stack.length}, this line depth: ${level}.`,
                );
            }
        }

        // If this line is indented (level > 0), parent must exist and must be dir
        if (level > 0) {
            const parent = stack[level - 1]; // parent level is (level - 1)
            if (!parent) {
                throw new Error(
                    `${fileName}: Indented entry without a parent on line ${lineNo}.`,
                );
            }
            if (!parent.isDir) {
                throw new Error(
                    `${fileName}: Cannot indent under a file on line ${lineNo}. ` +
                    `Files cannot have children. Parent: "${parent.entry.path}".`,
                );
            }
        }

        const isDir = p.rawPath.endsWith('/');
        const clean = p.rawPath.replace(/\/$/, '');
        const basePath = toPosixPath(clean);

        // Pop stack until we are at the correct depth
        while (stack.length > level) {
            stack.pop();
        }

        const parent = stack[stack.length - 1]?.entry as DirEntry | undefined;
        const parentPath = parent ? parent.path.replace(/\/$/, '') : '';

        const fullPath = parentPath
            ? `${parentPath}/${basePath}${isDir ? '/' : ''}`
            : `${basePath}${isDir ? '/' : ''}`;

        if (isDir) {
            const dirEntry: DirEntry = {
                type: 'dir',
                path: fullPath,
                children: [],
                ...(p.stub ? {stub: p.stub} : {}),
                ...(p.include ? {include: p.include} : {}),
                ...(p.exclude ? {exclude: p.exclude} : {}),
            };

            if (parent && parent.type === 'dir') {
                parent.children = parent.children ?? [];
                parent.children.push(dirEntry);
            } else if (!parent) {
                rootEntries.push(dirEntry);
            }

            stack.push({level, entry: dirEntry, isDir: true});
        } else {
            const fileEntry: FileEntry = {
                type: 'file',
                path: fullPath,
                ...(p.stub ? {stub: p.stub} : {}),
                ...(p.include ? {include: p.include} : {}),
                ...(p.exclude ? {exclude: p.exclude} : {}),
            };

            if (parent && parent.type === 'dir') {
                parent.children = parent.children ?? [];
                parent.children.push(fileEntry);
            } else if (!parent) {
                rootEntries.push(fileEntry);
            }

            // We still push files into the stack at this level so that
            // bad indentation under them can be detected and rejected.
            stack.push({level, entry: fileEntry, isDir: false});
        }
    }

    return rootEntries;
}