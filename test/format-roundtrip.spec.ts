// test/format-roundtrip.spec.ts
import {describe, it, expect} from 'vitest';
import {formatStructureText} from '../src/ast';

describe('formatStructureText roundtrip', () => {
    it('is idempotent for a valid tree', () => {
        const input = [
            'src/',
            '  index.ts # entry',
            '',
            '  schema/',
            '    index.ts',
        ].join('\n');

        const first = formatStructureText(input, {indentStep: 2});
        const second = formatStructureText(first.text, {indentStep: 2});

        expect(second.text).toBe(first.text);
    });
});