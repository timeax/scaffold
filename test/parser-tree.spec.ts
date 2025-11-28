// test/parser-tree.spec.ts
import {describe, it, expect} from 'vitest';
import {parseStructureAst} from '../src/ast';

describe('parseStructureAst tree shape', () => {
    it('builds a simple nested tree', () => {
        const text = [
            'src/',
            '  schema/',
            '    index.ts',
            '    field.ts',
        ].join('\n');

        const ast = parseStructureAst(text, {indentStep: 2, mode: 'loose'});

        expect(ast.rootNodes).toHaveLength(1);
        const src = ast.rootNodes[0];
        if (src.type !== 'dir') throw new Error('src should be dir');
        expect(src.name).toBe('src/');

        const schema = src.children[0];
        expect(schema.type).toBe('dir');
        expect(schema.name).toBe('schema/');

        const files = (schema as any).children;
        expect(files.map((n: any) => n.name)).toEqual(['index.ts', 'field.ts']);
    });

    it('normalizes over-indented children under same parent in loose mode', () => {
        const text = [
            'src/',
            '    index.ts',
            '',
            '    schema/',
            '        index.ts',
            '        field.ts',
        ].join('\n');

        const ast = parseStructureAst(text, {indentStep: 2, mode: 'loose'});

        const src = ast.rootNodes[0]!;
        if (src.type !== 'dir') throw new Error('src should be dir');

        const names = src.children.map((c) => c.name);
        expect(names).toEqual(['index.ts', 'schema/']);

        const schema = src.children[1]!;
        if (schema.type !== 'dir') throw new Error('schema should be dir');

        expect(schema.children.map((c) => c.name)).toEqual(['index.ts', 'field.ts']);
    });

    it('parses stub/include/exclude annotations onto nodes', () => {
        const text = [
            'src/ @stub:root',
            '  pages/ @stub:page @include:pages/** @exclude:pages/legacy/**',
            '    home.tsx',
        ].join('\n');

        const ast = parseStructureAst(text, {indentStep: 2, mode: 'loose'});

        const src = ast.rootNodes[0]!;
        if (src.type !== 'dir') throw new Error('src should be dir');
        expect(src.stub).toBe('root');

        const pages = src.children[0]!;
        if (pages.type !== 'dir') throw new Error('pages should be dir');
        expect(pages.stub).toBe('page');
        expect(pages.include).toEqual(['pages/**']);
        expect(pages.exclude).toEqual(['pages/legacy/**']);
    });

    it('escalates certain diagnostics in strict mode', () => {
        const text = [
            'src/',
            '    schema/',
            '   index.ts', // bad decrease (4 -> 3)
        ].join('\n');

        const loose = parseStructureAst(text, {indentStep: 2, mode: 'loose'});
        const strict = parseStructureAst(text, {indentStep: 2, mode: 'strict'});

        const looseDiag = loose.diagnostics.find((d) => d.code === 'indent-misaligned');
        const strictDiag = strict.diagnostics.find((d) => d.code === 'indent-misaligned');

        expect(looseDiag?.severity).toBe<'warning' | 'error'>('warning');
        expect(strictDiag?.severity).toBe<'warning' | 'error'>('error');
    });

    it('reports indent-tabs when tabs are used in indentation', () => {
        const text = [
            'src/',
            '\tschema/',
        ].join('\n');

        const ast = parseStructureAst(text, {indentStep: 2, mode: 'loose'});

        const diag = ast.diagnostics.find((d) => d.code === 'indent-tabs');
        expect(diag).toBeDefined();
        expect(diag?.line).toBe(2);
    });
});