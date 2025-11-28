// test/format.spec.ts

import {describe, it, expect} from 'vitest';
import {formatStructureText} from '../src/ast';

describe('formatStructureText', () => {
    it('formats a simple tree with canonical indentation', () => {
        const input = [
            'src/',
            '    index.ts',
            '',
            '    schema/',
            '        index.ts',
            '        field.ts',
        ].join('\n');

        const {text} = formatStructureText(input, {indentStep: 2});

        expect(text).toBe(
            [
                'src/',
                '  index.ts',
                '',
                '  schema/',
                '    index.ts',
                '    field.ts',
            ].join('\n'),
        );
    });

    it('preserves blank lines and comments', () => {
        const input = [
            '# root comment',
            'src/   # src dir',
            '',
            '    index.ts  // main entry',
            '',
            '    schema/  # schema section',
            '        index.ts',
        ].join('\n');

        const {text} = formatStructureText(input, {indentStep: 2});

        expect(text).toBe(
            [
                '# root comment',
                'src/ # src dir',
                '',
                '  index.ts // main entry',
                '',
                '  schema/ # schema section',
                '    index.ts',
            ].join('\n'),
        );
    });

    it('fixes over-indented children in loose mode', () => {
        const input = [
            'src/',
            '        schema/', // 8 spaces (depth 4 if step=2), but no intermediate levels
            '            index.ts',
        ].join('\n');

        const {text, ast} = formatStructureText(input, {
            indentStep: 2,
            mode: 'loose',
        });

        // In loose mode, this should become src/ (depth 0) and schema/ (depth 1)
        expect(text).toBe(
            [
                'src/',
                '  schema/',
                '    index.ts',
            ].join('\n'),
        );

        // And there should be at least one warning about the indent jump.
        const hasIndentWarning = ast.diagnostics.some(
            (d) => d.code && d.code.includes('indent-skip-level'),
        );
        expect(hasIndentWarning).toBe(true);
    });

    it('keeps inline comments attached to their entries', () => {
        const input = [
            'src/',
            '  index.ts    # comment one',
            '  schema/   @stub:schema   // comment two',
            '    index.ts',
        ].join('\n');

        const {text} = formatStructureText(input, {indentStep: 2});

        expect(text).toBe(
            [
                'src/',
                '  index.ts # comment one',
                '  schema/ @stub:schema // comment two',
                '    index.ts',
            ].join('\n'),
        );
    });
});