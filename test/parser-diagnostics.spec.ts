// test/parser-diagnostics.spec.ts

import { describe, it, expect } from 'vitest';
import { parseStructureAst } from '../src/ast';

describe('parseStructureAst diagnostics', () => {
    it('reports indent-skip-level when jumping multiple levels', () => {
        const text = [
            'src/',
            '        index.ts', // 8 spaces, with indentStep=2 this is a big jump
        ].join('\n');

        const ast = parseStructureAst(text, { indentStep: 2, mode: 'loose' });

        const codes = ast.diagnostics.map((d) => d.code);
        expect(codes).toContain('indent-skip-level');
    });

    it('reports indent-misaligned when decreasing indent by a non-multiple', () => {
        // Here the *third* line has LESS indent than the second, and not a clean multiple.
        // 0 spaces -> 4 spaces -> 3 spaces
        const text = [
            'src/',
            '    schema/',
            '   index.ts', // 3 spaces: decrease from 4 by 1 → not multiple of 2
        ].join('\n');

        const ast = parseStructureAst(text, { indentStep: 2, mode: 'loose' });

        const diag = ast.diagnostics.find((d) => d.code === 'indent-misaligned');
        expect(diag).toBeDefined();
        expect(diag?.line).toBe(3);
    });

    it('reports path-colon when a path token contains ":"', () => {
        const text = [
            'src/',
            '  api:v1/', // invalid: colon in path token
        ].join('\n');

        const ast = parseStructureAst(text, { indentStep: 2, mode: 'loose' });

        const diag = ast.diagnostics.find((d) => d.code === 'path-colon');
        expect(diag).toBeDefined();
        expect(diag?.line).toBe(2);
    });

    it('reports child-of-file-loose when an entry is indented under a file', () => {
        const text = [
            'index.ts',
            '  child.ts',
        ].join('\n');

        const ast = parseStructureAst(text, { indentStep: 2, mode: 'loose' });

        const diag = ast.diagnostics.find(
            (d) => d.code === 'child-of-file-loose' || d.code === 'child-of-file',
        );

        expect(diag).toBeDefined();
        expect(diag?.line).toBe(2);
    });

    it('does NOT treat comments or blanks as entries (no diagnostics for them)', () => {
        const text = [
            '# comment',
            '',
            '   // another comment',
            'src/',
        ].join('\n');

        const ast = parseStructureAst(text, { indentStep: 2, mode: 'loose' });

        // Should parse fine, with no indent-related diagnostics on comment lines
        const indentDiags = ast.diagnostics.filter(
            (d) =>
                d.code === 'indent-skip-level' ||
                d.code === 'indent-misaligned' ||
                d.code === 'indent-tabs',
        );

        expect(indentDiags.length).toBe(0);
        expect(ast.rootNodes.length).toBe(1);
        expect(ast.rootNodes[0].name).toBe('src/');
    });
});