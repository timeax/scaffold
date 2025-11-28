// src/ast/format.ts

import {
    parseStructureAst,
    type AstMode,
    type StructureAst,
    type AstNode, extractInlineCommentParts,
} from './parser';
import {FormatConfig} from "../schema";

export interface FormatOptions extends FormatConfig {
    /**
     * Spaces per indent level for re-printing entries.
     * Defaults to 2.
     */
    indentStep?: number;

    /**
     * Parser mode to use for the AST.
     * - "loose": attempt to repair mis-indents / bad parents (default).
     * - "strict": report issues as errors, less repair.
     */
    mode?: AstMode;

    /**
     * Normalize newlines to the dominant style in the original text (LF vs. CRLF).
     * Defaults to true.
     */
    normalizeNewlines?: boolean;

    /**
     * Trim trailing whitespace on non-entry lines (comments / blanks).
     * Defaults to true.
     */
    trimTrailingWhitespace?: boolean;

    /**
     * Whether to normalize annotation ordering and spacing:
     *   name @stub:... @include:... @exclude:...
     * Defaults to true.
     */
    normalizeAnnotations?: boolean;
}

export interface FormatResult {
    /** Formatted text. */
    text: string;
    /** Underlying AST that was used. */
    ast: StructureAst;
}

/**
 * Smart formatter for scaffold structure files.
 *
 * - Uses the loose AST parser (parseStructureAst) to understand structure.
 * - Auto-fixes indentation based on tree depth (indentStep).
 * - Keeps **all** blank lines and full-line comments in place.
 * - Preserves inline comments (# / //) on entry lines.
 * - Canonicalizes annotation order (stub → include → exclude) if enabled.
 *
 * It does **not** throw on invalid input:
 * - parseStructureAst always returns an AST + diagnostics.
 * - If something is catastrophically off (entry/node counts mismatch),
 *   it falls back to a minimal normalization pass.
 */
export function formatStructureText(
    text: string,
    options: FormatOptions = {},
): FormatResult {
    const indentStep = options.indentStep ?? 2;
    const mode: AstMode = options.mode ?? 'loose';
    const normalizeNewlines =
        options.normalizeNewlines === undefined ? true : options.normalizeNewlines;
    const trimTrailingWhitespace =
        options.trimTrailingWhitespace === undefined
            ? true
            : options.trimTrailingWhitespace;
    const normalizeAnnotations =
        options.normalizeAnnotations === undefined
            ? true
            : options.normalizeAnnotations;

    // 1. Parse to our "smart" AST (non-throwing).
    const ast = parseStructureAst(text, {
        indentStep,
        mode,
    });

    const rawLines = text.split(/\r?\n/);
    const lineCount = rawLines.length;

    // Sanity check: AST lines length should match raw lines length.
    if (ast.lines.length !== lineCount) {
        return {
            text: basicNormalize(text, {normalizeNewlines, trimTrailingWhitespace}),
            ast,
        };
    }

    // 2. Collect entry line indices and inline comments from the original text.
    const entryLineIndexes: number[] = [];
    const inlineComments: (string | null)[] = [];

    for (let i = 0; i < lineCount; i++) {
        const lineMeta = ast.lines[i];
        if (lineMeta.kind === 'entry') {
            entryLineIndexes.push(i);
            const {inlineComment} = extractInlineCommentParts(lineMeta.content);
            inlineComments.push(inlineComment);
        }
    }

    // 3. Flatten AST nodes in depth-first order to get an ordered node list.
    const flattened: { node: AstNode; level: number }[] = [];
    flattenAstNodes(ast.rootNodes, 0, flattened);

    if (flattened.length !== entryLineIndexes.length) {
        // If counts don't match, something is inconsistent – do not risk corruption.
        return {
            text: basicNormalize(text, {normalizeNewlines, trimTrailingWhitespace}),
            ast,
        };
    }

    // 4. Build canonical entry lines from AST nodes.
    const canonicalEntryLines: string[] = flattened.map(({node, level}) =>
        formatAstNodeLine(node, level, indentStep, normalizeAnnotations),
    );

    // 5. Merge canonical entry lines + inline comments back into original structure.
    const resultLines: string[] = [];
    let entryIdx = 0;

    for (let i = 0; i < lineCount; i++) {
        const lineMeta = ast.lines[i];
        const originalLine = rawLines[i];

        if (lineMeta.kind === 'entry') {
            const base = canonicalEntryLines[entryIdx].replace(/[ \t]+$/g, '');
            const inline = inlineComments[entryIdx];
            entryIdx++;

            if (inline) {
                // Always ensure a single space before the inline comment marker.
                resultLines.push(base + ' ' + inline);
            } else {
                resultLines.push(base);
            }
        } else {
            let out = originalLine;
            if (trimTrailingWhitespace) {
                out = out.replace(/[ \t]+$/g, '');
            }
            resultLines.push(out);
        }
    }

    const eol = normalizeNewlines ? detectPreferredEol(text) : getRawEol(text);
    return {
        text: resultLines.join(eol),
        ast,
    };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fallback: basic normalization when we can't safely map AST ↔ text.
 */
function basicNormalize(
    text: string,
    opts: { normalizeNewlines: boolean; trimTrailingWhitespace: boolean },
): string {
    const lines = text.split(/\r?\n/);
    const normalizedLines = opts.trimTrailingWhitespace
        ? lines.map((line) => line.replace(/[ \t]+$/g, ''))
        : lines;

    const eol = opts.normalizeNewlines ? detectPreferredEol(text) : getRawEol(text);
    return normalizedLines.join(eol);
}

/**
 * Detect whether the file is more likely LF or CRLF and reuse that.
 * If mixed or no clear signal, default to "\n".
 */
function detectPreferredEol(text: string): string {
    const crlfCount = (text.match(/\r\n/g) || []).length;
    const lfCount = (text.match(/(?<!\r)\n/g) || []).length;

    if (crlfCount === 0 && lfCount === 0) {
        return '\n';
    }

    if (crlfCount > lfCount) {
        return '\r\n';
    }

    return '\n';
}

/**
 * If you really want the raw style, detect only CRLF vs. LF.
 */
function getRawEol(text: string): string {
    return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Flatten AST nodes into a depth-first list while tracking indent level.
 */
function flattenAstNodes(
    nodes: AstNode[],
    level: number,
    out: { node: AstNode; level: number }[],
): void {
    for (const node of nodes) {
        out.push({node, level});
        if (node.type === 'dir' && node.children && node.children.length) {
            flattenAstNodes(node.children, level + 1, out);
        }
    }
}

/**
 * Format a single AST node into one canonical line.
 *
 * - Uses `level * indentStep` spaces as indentation.
 * - Uses the node's `name` as provided by the parser (e.g. "src/" or "index.ts").
 * - Annotations are printed in a stable order if normalizeAnnotations is true:
 *   @stub:..., @include:..., @exclude:...
 */
function formatAstNodeLine(
    node: AstNode,
    level: number,
    indentStep: number,
    normalizeAnnotations: boolean,
): string {
    const indent = ' '.repeat(indentStep * level);
    const baseName = node.name;

    if (!normalizeAnnotations) {
        return indent + baseName;
    }

    const tokens: string[] = [];

    if (node.stub) {
        tokens.push(`@stub:${node.stub}`);
    }
    if (node.include && node.include.length > 0) {
        tokens.push(`@include:${node.include.join(',')}`);
    }
    if (node.exclude && node.exclude.length > 0) {
        tokens.push(`@exclude:${node.exclude.join(',')}`);
    }

    const annotations = tokens.length ? ' ' + tokens.join(' ') : '';
    return indent + baseName + annotations;
}