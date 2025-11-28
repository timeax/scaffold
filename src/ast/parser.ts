// src/ast/parser.ts

import {toPosixPath} from '../util/fs-utils';

export type AstMode = 'strict' | 'loose';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface Diagnostic {
    line: number; // 1-based
    column?: number; // 1-based (optional)
    message: string;
    severity: DiagnosticSeverity;
    code?: string;
}

/**
 * How a physical line in the text was classified.
 */
export type LineKind = 'blank' | 'comment' | 'entry';

export interface StructureAstLine {
    index: number; // 0-based
    lineNo: number; // 1-based
    raw: string;
    kind: LineKind;
    indentSpaces: number;
    content: string; // after leading whitespace (includes path+annotations+inline comment)
}

/**
 * AST node base for structure entries.
 */
interface AstNodeBase {
    type: 'dir' | 'file';
    /** The last segment name, e.g. "schema/" or "index.ts". */
    name: string;
    /** Depth level (0 = root, 1 = child of root, etc.). */
    depth: number;
    /** 1-based source line number. */
    line: number;
    /** Normalized POSIX path from root, e.g. "src/schema/index.ts" or "src/schema/". */
    path: string;
    /** Stub annotation, if any. */
    stub?: string;
    /** Include glob patterns, if any. */
    include?: string[];
    /** Exclude glob patterns, if any. */
    exclude?: string[];
    /** Parent node; null for roots. */
    parent: DirNode | null;
}

export interface DirNode extends AstNodeBase {
    type: 'dir';
    children: AstNode[];
}

export interface FileNode extends AstNodeBase {
    type: 'file';
    children?: undefined;
}

export type AstNode = DirNode | FileNode;

export interface AstOptions {
    /**
     * Spaces per indent level.
     * Default: 2.
     */
    indentStep?: number;

    /**
     * Parser mode:
     * - "strict": mismatched indentation / impossible structures are errors.
     * - "loose" : tries to recover from bad indentation, demotes some issues to warnings.
     *
     * Default: "loose".
     */
    mode?: AstMode;
}

/**
 * Full AST result: nodes + per-line meta + diagnostics.
 */
export interface StructureAst {
    /** Root-level nodes (depth 0). */
    rootNodes: AstNode[];
    /** All lines as seen in the source file. */
    lines: StructureAstLine[];
    /** Collected diagnostics (errors + warnings + infos). */
    diagnostics: Diagnostic[];
    /** Resolved options used by the parser. */
    options: Required<AstOptions>;
}

/**
 * Main entry: parse a structure text into an AST tree with diagnostics.
 *
 * - Does NOT throw on parse errors.
 * - Always returns something (even if diagnostics contain errors).
 * - In "loose" mode, attempts to repair:
 *   - odd/misaligned indentation → snapped via relative depth rules with warnings.
 *   - large indent jumps → treated as "one level deeper" with warnings.
 *   - children under files → attached to nearest viable ancestor with warnings.
 */
export function parseStructureAst(
    text: string,
    opts: AstOptions = {},
): StructureAst {
    const indentStep = opts.indentStep ?? 2;
    const mode: AstMode = opts.mode ?? 'loose';

    const diagnostics: Diagnostic[] = [];
    const lines: StructureAstLine[] = [];

    const rawLines = text.split(/\r?\n/);

    // First pass: classify + measure indentation.
    for (let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i];
        const lineNo = i + 1;

        const m = raw.match(/^(\s*)(.*)$/);
        const indentRaw = m ? m[1] : '';
        const content = m ? m[2] : '';

        const {indentSpaces, hasTabs} = measureIndent(indentRaw, indentStep);

        if (hasTabs) {
            diagnostics.push({
                line: lineNo,
                message:
                    'Tabs detected in indentation. Consider using spaces only for consistent levels.',
                severity: mode === 'strict' ? 'warning' : 'info',
                code: 'indent-tabs',
            });
        }

        const trimmed = content.trim();
        let kind: LineKind;
        if (!trimmed) {
            kind = 'blank';
        } else if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
            kind = 'comment';
        } else {
            kind = 'entry';
        }

        lines.push({
            index: i,
            lineNo,
            raw,
            kind,
            indentSpaces,
            content,
        });
    }

    const rootNodes: AstNode[] = [];
    const stack: AstNode[] = []; // nodes by depth index (0 = level 0, 1 = level 1, ...)

    const depthCtx: DepthContext = {
        lastIndentSpaces: null,
        lastDepth: null,
        lastWasFile: false,
    };

    for (const line of lines) {
        if (line.kind !== 'entry') continue;

        const {entry, depth, diags} = parseEntryLine(
            line,
            indentStep,
            mode,
            depthCtx,
        );
        diagnostics.push(...diags);

        if (!entry) {
            continue;
        }

        attachNode(entry, depth, line, rootNodes, stack, diagnostics, mode);
        depthCtx.lastWasFile = !entry.isDir;
    }

    return {
        rootNodes,
        lines,
        diagnostics,
        options: {
            indentStep,
            mode,
        },
    };
}

// ---------------------------------------------------------------------------
// Internal: indentation measurement & depth fixing (relative model)
// ---------------------------------------------------------------------------

function measureIndent(rawIndent: string, indentStep: number): {
    indentSpaces: number;
    hasTabs: boolean;
} {
    let spaces = 0;
    let hasTabs = false;

    for (const ch of rawIndent) {
        if (ch === ' ') {
            spaces += 1;
        } else if (ch === '\t') {
            hasTabs = true;
            // Treat tab as one level to avoid chaos. This is arbitrary but stable-ish.
            spaces += indentStep;
        }
    }

    return {indentSpaces: spaces, hasTabs};
}

interface DepthContext {
    lastIndentSpaces: number | null;
    lastDepth: number | null;
    lastWasFile: boolean;
}

/**
 * Compute logical depth using a relative algorithm:
 *
 * First entry line:
 *   - depth = 0
 *
 * For each subsequent entry line:
 *   Let prevSpaces = lastIndentSpaces, prevDepth = lastDepth.
 *
 *   - if spaces > prevSpaces:
 *       - if spaces > prevSpaces + indentStep → warn about a "skip"
 *       - depth = prevDepth + 1
 *
 *   - else if spaces === prevSpaces:
 *       - depth = prevDepth
 *
 *   - else (spaces < prevSpaces):
 *       - diff = prevSpaces - spaces
 *       - steps = round(diff / indentStep)
 *       - if diff is not a clean multiple → warn about misalignment
 *       - depth = max(prevDepth - steps, 0)
 */
function computeDepth(
    line: StructureAstLine,
    indentStep: number,
    mode: AstMode,
    ctx: DepthContext,
    diagnostics: Diagnostic[],
): number {
    let spaces = line.indentSpaces;
    if (spaces < 0) spaces = 0;

    let depth: number;

    if (ctx.lastIndentSpaces == null || ctx.lastDepth == null) {
        // First entry line: treat as root.
        depth = 0;
    } else {
        const prevSpaces = ctx.lastIndentSpaces;
        const prevDepth = ctx.lastDepth;

        if (spaces > prevSpaces) {
            const diff = spaces - prevSpaces;

            // NEW: indenting under a file → child-of-file-loose
            if (ctx.lastWasFile) {
                diagnostics.push({
                    line: line.lineNo,
                    message:
                        'Entry appears indented under a file; treating it as a sibling of the file instead of a child.',
                    severity: mode === 'strict' ? 'error' : 'warning',
                    code: 'child-of-file-loose',
                });

                // Treat as sibling of the file, not a child:
                depth = prevDepth;
            } else {
                if (diff > indentStep) {
                    diagnostics.push({
                        line: line.lineNo,
                        message: `Indentation jumps from ${prevSpaces} to ${spaces} spaces; treating as one level deeper.`,
                        severity: mode === 'strict' ? 'error' : 'warning',
                        code: 'indent-skip-level',
                    });
                }
                depth = prevDepth + 1;
            }
        } else if (spaces === prevSpaces) {
            depth = prevDepth;
        } else {
            const diff = prevSpaces - spaces;
            const steps = Math.round(diff / indentStep);

            if (diff % indentStep !== 0) {
                diagnostics.push({
                    line: line.lineNo,
                    message: `Indentation decreases from ${prevSpaces} to ${spaces} spaces, which is not a multiple of indent step (${indentStep}).`,
                    severity: mode === 'strict' ? 'error' : 'warning',
                    code: 'indent-misaligned',
                });
            }

            depth = Math.max(prevDepth - steps, 0);
        }
    }

    ctx.lastIndentSpaces = spaces;
    ctx.lastDepth = depth;

    return depth;
}

// ---------------------------------------------------------------------------
// Internal: entry line parsing (path + annotations)
// ---------------------------------------------------------------------------

interface ParsedEntry {
    segmentName: string;
    isDir: boolean;
    stub?: string;
    include?: string[];
    exclude?: string[];
}

/**
 * Parse a single entry line into a ParsedEntry + depth.
 */
function parseEntryLine(
    line: StructureAstLine,
    indentStep: number,
    mode: AstMode,
    ctx: DepthContext,
): {
    entry: ParsedEntry | null;
    depth: number;
    diags: Diagnostic[];
} {
    const diags: Diagnostic[] = [];
    const depth = computeDepth(line, indentStep, mode, ctx, diags);

    // Extract before inline comment
    const {contentWithoutComment} = extractInlineCommentParts(line.content);
    const trimmed = contentWithoutComment.trim();
    if (!trimmed) {
        // Structural line that became empty after stripping inline comment; treat as no-op.
        return {entry: null, depth, diags};
    }

    const parts = trimmed.split(/\s+/);
    const pathToken = parts[0];
    const annotationTokens = parts.slice(1);

    // Path sanity checks
    if (pathToken.includes(':')) {
        diags.push({
            line: line.lineNo,
            message:
                'Path token contains ":" which is reserved for annotations. This is likely a mistake.',
            severity: mode === 'strict' ? 'error' : 'warning',
            code: 'path-colon',
        });
    }

    const isDir = pathToken.endsWith('/');
    const segmentName = pathToken;

    let stub: string | undefined;
    const include: string[] = [];
    const exclude: string[] = [];

    for (const token of annotationTokens) {
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
        } else if (token.startsWith('@')) {
            diags.push({
                line: line.lineNo,
                message: `Unknown annotation token "${token}".`,
                severity: 'info',
                code: 'unknown-annotation',
            });
        }
    }

    const entry: ParsedEntry = {
        segmentName,
        isDir,
        stub,
        include: include.length ? include : undefined,
        exclude: exclude.length ? exclude : undefined,
    };

    return {entry, depth, diags};
}

export function mapThrough(content: string) {
    let cutIndex = -1;
    const len = content.length;

    for (let i = 0; i < len; i++) {
        const ch = content[i];
        const prev = i > 0 ? content[i - 1] : '';

        // Inline "# ..."
        if (ch === '#') {
            if (i === 0) {
                // full-line comment; not our case (we only call this for "entry" lines)
                continue;
            }
            if (prev === ' ' || prev === '\t') {
                cutIndex = i;
                break;
            }
        }

        // Inline "// ..."
        if (
            ch === '/' &&
            i + 1 < len &&
            content[i + 1] === '/' &&
            (prev === ' ' || prev === '\t')
        ) {
            cutIndex = i;
            break;
        }
    }

    return cutIndex;
}

/**
 * Extracts the inline comment portion (if any) from the content area (no leading indent).
 */
export function extractInlineCommentParts(content: string): {
    contentWithoutComment: string;
    inlineComment: string | null;
} {
    const cutIndex = mapThrough(content);

    if (cutIndex === -1) {
        return {
            contentWithoutComment: content,
            inlineComment: null,
        };
    }

    return {
        contentWithoutComment: content.slice(0, cutIndex),
        inlineComment: content.slice(cutIndex),
    };
}

// ---------------------------------------------------------------------------
// Internal: tree construction
// ---------------------------------------------------------------------------

function attachNode(
    entry: ParsedEntry,
    depth: number,
    line: StructureAstLine,
    rootNodes: AstNode[],
    stack: AstNode[],
    diagnostics: Diagnostic[],
    mode: AstMode,
): void {
    const lineNo = line.lineNo;

    // Pop stack until we’re at or above the desired depth.
    while (stack.length > depth) {
        stack.pop();
    }

    let parent: DirNode | null = null;
    if (depth > 0) {
        const candidate = stack[depth - 1];
        if (!candidate) {
            // Indented but no parent; in strict mode error, in loose mode, treat as root.
            diagnostics.push({
                line: lineNo,
                message: `Entry has indent depth ${depth} but no parent at depth ${
                    depth - 1
                }. Treating as root.`,
                severity: mode === 'strict' ? 'error' : 'warning',
                code: 'missing-parent',
            });
        } else if (candidate.type === 'file') {
            // Child under file, impossible by design.
            if (mode === 'strict') {
                diagnostics.push({
                    line: lineNo,
                    message: `Cannot attach child under file "${candidate.path}".`,
                    severity: 'error',
                    code: 'child-of-file',
                });
                // Force it to root to at least keep the node.
            } else {
                diagnostics.push({
                    line: lineNo,
                    message: `Entry appears under file "${candidate.path}". Attaching as sibling at depth ${
                        candidate.depth
                    }.`,
                    severity: 'warning',
                    code: 'child-of-file-loose',
                });
                // Treat as sibling at candidate's depth.
                while (stack.length > candidate.depth) {
                    stack.pop();
                }
            }
        } else {
            parent = candidate as DirNode;
        }
    }

    const parentPath = parent ? parent.path.replace(/\/$/, '') : '';
    const normalizedSegment = toPosixPath(entry.segmentName.replace(/\/+$/, ''));
    const fullPath = parentPath
        ? `${parentPath}/${normalizedSegment}${entry.isDir ? '/' : ''}`
        : `${normalizedSegment}${entry.isDir ? '/' : ''}`;

    const baseNode: AstNodeBase = {
        type: entry.isDir ? 'dir' : 'file',
        name: entry.segmentName,
        depth,
        line: lineNo,
        path: fullPath,
        parent,
        ...(entry.stub ? {stub: entry.stub} : {}),
        ...(entry.include ? {include: entry.include} : {}),
        ...(entry.exclude ? {exclude: entry.exclude} : {}),
    };

    if (entry.isDir) {
        const dirNode: DirNode = {
            ...baseNode,
            type: 'dir',
            children: [],
        };

        if (parent) {
            parent.children.push(dirNode);
        } else {
            rootNodes.push(dirNode);
        }

        // Ensure stack[depth] is this dir.
        while (stack.length > depth) {
            stack.pop();
        }
        stack[depth] = dirNode;
    } else {
        const fileNode: FileNode = {
            ...baseNode,
            type: 'file',
        };

        if (parent) {
            parent.children.push(fileNode);
        } else {
            rootNodes.push(fileNode);
        }

        // Files themselves are NOT placed on the stack to prevent children,
        // but attachNode will repair children-under-file in loose mode.
    }
}