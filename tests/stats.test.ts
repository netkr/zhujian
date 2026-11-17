import { describe, expect, it } from 'vitest';
import { defaultExpenseTemplates } from '../src/domain/categories';
import {
  drilldownForTrend,
  drilldownRangeLabel,
  filterByDrilldown,
  filterByRange,
  getFrequentTemplates,
  getRecentCategories,
  getSummary,
  groupByCategory,
  groupByDay,
  groupByTrend,
} from '../src/domain/stats';
import type { LedgerRecord } from '../src/domain/types';

// TZ 固定为 Asia/Shanghai（见 vitest.config.ts）。
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

let id = 0;
function rec(type: LedgerRecord['type'], amount: number, primary: string, secondary: string, date: string, note = ''): LedgerRecord {
  id += 1;
  return { id, type, amount, primary, secondary, note, date, account: '本地账户' };
}

const r1 = rec('expense', 100, '餐饮食品', '正餐', at(2026, 3, 5));
const r2 = rec('expense', 50, '餐饮食品', '正餐', at(2026, 3, 5));
const r3 = rec('income', 8000, '工资薪酬', '工资', at(2026, 3, 1));
const r4 = rec('expense', 30, '交通出行', '公交地铁', at(2025, 2, 20));
const r5 = rec('income', 200, '红包礼金', '红包', at(2025, 12, 31));
const all = [r1, r2, r3, r4, r5];

describe('getSummary', () => {
  it('sums income and expense separately', () => {
    expect(getSummary([r1, r2, r3])).toEqual({ income: 8000, expense: 150 });
    expect(getSummary([])).toEqual({ income: 0, expense: 0 });
  });
});

describe('groupByCategory', () => {
  it('aggregates by primary, counts rows and sorts by amount desc', () => {
    expect(groupByCategory([r1, r2, r4])).toEqual([
      { label: '餐饮食品', amount: 150, count: 2 },
      { label: '交通出行', amount: 30, count: 1 },
    ]);
  });

  it('falls back to 其他 when primary is empty', () => {
    expect(groupByCategory([rec('expense', 5, '', 'x', at(2026, 3, 1))])).toEqual([{ label: '其他', amount: 5, count: 1 }]);
  });
});

describe('groupByDay / groupByTrend', () => {
  it('groups by day of month, sorted ascending', () => {
    expect(groupByDay([r1, r2])).toEqual([{ label: '5日', amount: 150 }]);
  });

  it('month range = per-day within the month', () => {
    expect(groupByTrend([r1, r2], new Date(2026, 2, 1), 'month')).toEqual([{ label: '5日', amount: 150 }]);
  });

  it('year range = per-month', () => {
    expect(groupByTrend([r1, r3], new Date(2026, 2, 1), 'year')).toEqual([
      { label: '3月', amount: 8100 },
    ]);
  });

  it('all range = per-year', () => {
    expect(groupByTrend([r4, r3], new Date(2026, 2, 1), 'all')).toEqual([
      { label: '2025', amount: 30 },
      { label: '2026', amount: 8000 },
    ]);
  });
});

describe('filterByRange', () => {
  const month = new Date(2026, 2, 1);
  it('month / year / all', () => {
    expect(filterByRange(all, month, 'month').map((r) => r.id)).toEqual([r1.id, r2.id, r3.id]);
    expect(filterByRange(all, month, 'year').map((r) => r.id)).toEqual([r1.id, r2.id, r3.id]);
    expect(filterByRange(all, month, 'all')).toHaveLength(5);
  });
});

describe('filterByDrilldown', () => {
  it('returns all records for null filter', () => {
    expect(filterByDrilldown(all, null)).toHaveLength(5);
  });

  it('filters by type + range + primary', () => {
    const filtered = filterByDrilldown(all, { type: 'expense', range: 'month', anchor: at(2026, 3, 1), primary: '餐饮食品', label: 'x' });
    expect(filtered.map((r) => r.id)).toEqual([r1.id, r2.id]);
  });

  it('filters by day when provided', () => {
    const filtered = filterByDrilldown(all, { type: 'expense', range: 'month', anchor: at(2026, 3, 1), day: at(2026, 3, 5), label: 'x' });
    expect(filtered.map((r) => r.id)).toEqual([r1.id, r2.id]);
  });
});

describe('getRecentCategories', () => {
  it('dedupes, sorts by date desc, ignores unknown categories, caps at 4', () => {
    const records = [
      rec('expense', 1, '餐饮食品', '正餐', at(2026, 3, 1)),
      rec('expense', 1, '餐饮食品', '正餐', at(2026, 3, 9)),
      rec('expense', 1, '餐饮食品', '零食', at(2026, 3, 10)),
      rec('expense', 1, '交通出行', '公交地铁', at(2026, 3, 11)),
      rec('expense', 1, '不存在的分类', 'x', at(2026, 3, 12)),
      rec('expense', 1, '宠物', '食品', at(2026, 3, 13)),
      rec('expense', 1, '医疗健康', '药品', at(2026, 3, 14)),
    ];
    const recent = getRecentCategories(records, defaultExpenseTemplates, 'expense');
    expect(recent).toEqual([
      { primary: '医疗健康', secondary: '药品' },
      { primary: '宠物', secondary: '食品' },
      { primary: '交通出行', secondary: '公交地铁' },
      { primary: '餐饮食品', secondary: '零食' },
    ]);
  });
});

describe('getFrequentTemplates', () => {
  it('orders by count then template order and keeps selected category visible', () => {
    const records = [
      rec('expense', 1, '交通出行', '公交地铁', at(2026, 3, 1)),
      rec('expense', 1, '交通出行', '公交地铁', at(2026, 3, 2)),
      rec('expense', 1, '宠物', '食品', at(2026, 3, 3)),
      rec('income', 1, '工资薪酬', '工资', at(2026, 3, 4)),
    ];
    const frequent = getFrequentTemplates(records, defaultExpenseTemplates, 'expense', '医疗健康');
    expect(frequent).toHaveLength(4);
    expect(frequent[0].primary).toBe('交通出行');
    expect(frequent[1].primary).toBe('宠物');
    // selected category must be present even with zero count
    expect(frequent.some((t) => t.primary === '医疗健康')).toBe(true);
  });
});

describe('drilldown labels / anchors', () => {
  it('drilldownRangeLabel', () => {
    expect(drilldownRangeLabel(new Date(2026, 2, 1), 'month')).toBe('2026年03月');
    expect(drilldownRangeLabel(new Date(2026, 2, 1), 'year')).toBe('2026年');
    expect(drilldownRangeLabel(new Date(2026, 2, 1), 'all')).toBe('全部时间');
  });

  it('month day label', () => {
    const f = drilldownForTrend('5日', 'expense', 'month', new Date(2026, 2, 1));
    expect(f.range).toBe('month');
    expect(f.label).toBe('2026年3月5日 · 支出');
    expect(new Date(f.anchor).getDate()).toBe(5);
    expect(f.day).toBe(f.anchor);
  });

  it('year month label', () => {
    const f = drilldownForTrend('3月', 'income', 'year', new Date(2026, 2, 1));
    expect(f.range).toBe('month');
    expect(f.label).toBe('2026年03月 · 收入');
    expect(new Date(f.anchor).getMonth()).toBe(2);
  });

  it('all year label', () => {
    const f = drilldownForTrend('2026', 'expense', 'all', new Date(2026, 2, 1));
    expect(f.range).toBe('year');
    expect(f.label).toBe('2026年 · 支出');
    expect(new Date(f.anchor).getFullYear()).toBe(2026);
  });
});
