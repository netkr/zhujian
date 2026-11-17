import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  csvToObjects,
  makeDedupKey,
  makeImportKey,
  mapImportObject,
  normalizeHeader,
  parseAmount,
  parseCsv,
  parseImportDate,
} from '../src/domain/import';
import type { ParsedImportRecord } from '../src/domain/types';

// TZ 固定为 Asia/Shanghai（见 vitest.config.ts），因此夹具中的 ISO 日期可复现。

type ImportCase = { name: string; row: Record<string, unknown>; expected: ParsedImportRecord };
type CsvCase = { name: string; text: string; rows: string[][]; objects: Array<Record<string, string>> };

function load<T>(file: string): T[] {
  return JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')) as T[];
}

const importCases = load<ImportCase>('import-cases.json');
const csvCases = load<CsvCase>('csv-cases.json');

describe('mapImportObject — golden fixtures（锁定当前行为）', () => {
  it('covers a representative set of table shapes', () => {
    expect(importCases.length).toBeGreaterThanOrEqual(15);
  });

  for (const testcase of importCases) {
    it(testcase.name, () => {
      expect(mapImportObject(testcase.row)).toEqual(testcase.expected);
    });
  }
});

describe('parseCsv / csvToObjects — golden fixtures', () => {
  for (const testcase of csvCases) {
    it(`${testcase.name} (parseCsv)`, () => {
      expect(parseCsv(testcase.text)).toEqual(testcase.rows);
    });
    it(`${testcase.name} (csvToObjects)`, () => {
      expect(csvToObjects(testcase.text)).toEqual(testcase.objects);
    });
  }
});

describe('parseAmount', () => {
  it('strips currency symbols, commas, spaces and plus signs', () => {
    expect(parseAmount('¥1,234.50')).toBe(1234.5);
    expect(parseAmount('+1 000')).toBe(1000);
    expect(parseAmount('  88 ')).toBe(88);
  });

  it('treats parenthesised numbers as negative', () => {
    expect(parseAmount('(123.45)')).toBe(-123.45);
  });

  it('returns 0 for empty / non-numeric', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('abc')).toBe(0);
    expect(parseAmount('-')).toBe(0);
  });
});

describe('normalizeHeader', () => {
  it('removes spaces and separators, lowercases', () => {
    expect(normalizeHeader(' 交易 金额 ')).toBe('交易金额');
    expect(normalizeHeader('A-B_C')).toBe('abc');
    expect(normalizeHeader('（收入）')).toBe('收入');
    expect(normalizeHeader('日期/时间')).toBe('日期时间');
  });
});

describe('parseImportDate', () => {
  it('parses Chinese and slash/dot dates to local-time ISO', () => {
    expect(parseImportDate('2026年3月5日')).toBe(new Date(2026, 2, 5).toISOString());
    expect(parseImportDate('2026/03/05')).toBe(new Date(2026, 2, 5).toISOString());
    expect(parseImportDate('2026.03.05')).toBe(new Date(2026, 2, 5).toISOString());
  });

  it('parses date-time', () => {
    expect(parseImportDate('2026-03-01 12:30')).toBe(new Date(2026, 2, 1, 12, 30).toISOString());
  });

  it('parses Excel serial numbers', () => {
    expect(parseImportDate(45000)).toBe('2023-03-15T00:00:00.000Z');
  });

  it('passes Date through and rejects empty / invalid', () => {
    expect(parseImportDate(new Date(2026, 2, 5))).toBe(new Date(2026, 2, 5).toISOString());
    expect(parseImportDate('')).toBeNull();
    expect(parseImportDate('abc')).toBeNull();
  });
});

describe('makeDedupKey', () => {
  it('normalises amount to 2 decimals and null/empty to the same key', () => {
    const a = makeDedupKey('expense', 1, '餐饮', '正餐', null, '2026-01-01', null);
    const b = makeDedupKey('expense', 1.0, '餐饮', '正餐', '', '2026-01-01', '');
    expect(a).toBe(b);
  });

  it('differs when any business column differs', () => {
    const base = makeDedupKey('expense', 1, '餐饮', '正餐', 'x', '2026-01-01', '本地账户');
    expect(makeDedupKey('income', 1, '餐饮', '正餐', 'x', '2026-01-01', '本地账户')).not.toBe(base);
    expect(makeDedupKey('expense', 1.01, '餐饮', '正餐', 'x', '2026-01-01', '本地账户')).not.toBe(base);
    expect(makeDedupKey('expense', 1, '餐饮', '零食', 'x', '2026-01-01', '本地账户')).not.toBe(base);
  });
});

describe('makeImportKey', () => {
  const base: ParsedImportRecord = { type: 'expense', amount: 1.5, primary: '餐饮', secondary: '正餐', note: '', date: '2026-01-01', account: '本地账户' };

  it('is deterministic and prefixed', () => {
    expect(makeImportKey(0, base)).toBe(makeImportKey(0, base));
    expect(makeImportKey(0, base)).toMatch(/^v1-/);
  });

  it('changes with row index or amount', () => {
    expect(makeImportKey(0, base)).not.toBe(makeImportKey(1, base));
    expect(makeImportKey(0, base)).not.toBe(makeImportKey(0, { ...base, amount: 1.51 }));
  });
});
