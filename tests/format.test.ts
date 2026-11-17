import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addYears,
  evaluateAmount,
  formatDate,
  formatDateTime,
  formatFileDate,
  formatMonth,
  formatShortDate,
  money,
  rangeTitle,
  recordsToCsv,
  sameDay,
  sameMonth,
  sameWeek,
  shortMoney,
  startOfMonth,
  trendTitle,
  trimAmount,
} from '../src/domain/format';
import type { LedgerRecord } from '../src/domain/types';

// 注意：本项目测试通过 vitest.config.ts 固定 TZ=Asia/Shanghai，日期断言依赖该时区。

function record(partial: Partial<LedgerRecord>): LedgerRecord {
  return {
    id: 1,
    type: 'expense',
    amount: 0,
    primary: '餐饮食品',
    secondary: '正餐',
    note: '',
    date: new Date(2026, 2, 5, 12, 0, 0).toISOString(),
    account: '本地账户',
    ...partial,
  };
}

describe('date math', () => {
  it('startOfMonth / addMonths clamp to month end', () => {
    const start = startOfMonth(new Date(2026, 2, 15, 9, 30));
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 2, 1]);

    const jan31 = new Date(2026, 0, 31, 8, 15, 20);
    const feb = addMonths(jan31, 1);
    expect([feb.getFullYear(), feb.getMonth(), feb.getDate()]).toEqual([2026, 1, 28]);

    const mar15 = addMonths(new Date(2026, 2, 15), 1);
    expect([mar15.getFullYear(), mar15.getMonth(), mar15.getDate()]).toEqual([2026, 3, 15]);
  });

  it('addMonths keeps time of day', () => {
    const next = addMonths(new Date(2026, 2, 15, 8, 15, 20), 1);
    expect([next.getHours(), next.getMinutes(), next.getSeconds()]).toEqual([8, 15, 20]);
  });

  it('addYears clamps leap day', () => {
    const next = addYears(new Date(2024, 1, 29), 1);
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2025, 1, 28]);
  });

  it('addDays crosses month boundary', () => {
    const prev = addDays(new Date(2026, 2, 1), -1);
    expect([prev.getFullYear(), prev.getMonth(), prev.getDate()]).toEqual([2026, 1, 28]);
  });

  it('sameDay / sameMonth / sameWeek', () => {
    const day = new Date(2026, 2, 5, 0, 0, 0);
    expect(sameDay(new Date(2026, 2, 5, 23, 59).toISOString(), day)).toBe(true);
    expect(sameDay(new Date(2026, 2, 6, 0, 0).toISOString(), day)).toBe(false);
    expect(sameMonth(new Date(2026, 2, 28).toISOString(), day)).toBe(true);
    expect(sameMonth(new Date(2026, 3, 1).toISOString(), day)).toBe(false);
    // 2026-03-05 是周四，本周为 03-02(周一) ~ 03-09(周一前)
    expect(sameWeek(new Date(2026, 2, 2, 0, 0).toISOString(), day)).toBe(true);
    expect(sameWeek(new Date(2026, 2, 8, 23, 59).toISOString(), day)).toBe(true);
    expect(sameWeek(new Date(2026, 2, 1, 23, 59).toISOString(), day)).toBe(false);
    expect(sameWeek(new Date(2026, 2, 9, 0, 0).toISOString(), day)).toBe(false);
  });
});

describe('formatting', () => {
  it('formatMonth / formatDate / formatShortDate', () => {
    expect(formatMonth(new Date(2026, 2, 5))).toBe('2026年03月');
    expect(formatDate(new Date(2026, 2, 5))).toBe('2026年3月5日');
    expect(formatShortDate(new Date(2026, 2, 5, 12).toISOString())).toBe('3月5日');
  });

  it('formatDateTime renders local time (TZ=Asia/Shanghai)', () => {
    expect(formatDateTime('2026-03-05T04:30:00.000Z')).toBe('2026-03-05 12:30');
  });

  it('formatFileDate pads all components', () => {
    expect(formatFileDate(new Date(2026, 2, 5, 9, 8, 7))).toBe('20260305-090807');
  });

  it('money / shortMoney / trimAmount', () => {
    expect(money(1234.5)).toBe('¥1,234.50');
    expect(money(-5)).toBe('-¥5.00');
    expect(money(0)).toBe('¥0.00');
    expect(shortMoney(12345)).toBe('1.2万');
    expect(shortMoney(1234)).toBe('1.2千');
    expect(shortMoney(999)).toBe('999');
    expect(trimAmount(25.5)).toBe('25.5');
    expect(trimAmount(25)).toBe('25');
    expect(trimAmount(25.05)).toBe('25.05');
  });

  it('rangeTitle / trendTitle', () => {
    expect(rangeTitle('month')).toBe('月度');
    expect(rangeTitle('year')).toBe('年度');
    expect(rangeTitle('all')).toBe('全部');
    expect(trendTitle('month', '支出')).toBe('每日支出趋势');
    expect(trendTitle('year', '收入')).toBe('每月收入趋势');
    expect(trendTitle('all', '支出')).toBe('年度支出趋势');
  });
});

describe('evaluateAmount (keypad expression)', () => {
  it('sums and subtracts tokens, rounding to cents', () => {
    expect(evaluateAmount('12+3.5-2')).toBe(13.5);
    expect(evaluateAmount('0.1+0.2')).toBe(0.3);
    expect(evaluateAmount('5')).toBe(5);
  });

  it('returns 0 for empty or garbage input', () => {
    expect(evaluateAmount('')).toBe(0);
    expect(evaluateAmount('abc')).toBe(0);
    expect(evaluateAmount('+')).toBe(0);
  });
});

describe('recordsToCsv', () => {
  it('locks column order, date format and value layout', () => {
    const csv = recordsToCsv([
      record({ type: 'expense', amount: 25.5, primary: '餐饮食品', secondary: '正餐', note: '午饭' }),
      record({ type: 'income', amount: 8000, primary: '工资薪酬', secondary: '工资', note: '' }),
    ]);
    expect(csv.split('\n')).toEqual([
      '日期,交易类型,一级分类,二级分类,账户,金额,备注',
      '2026-03-05 12:00,支出,餐饮食品,正餐,本地账户,25.50,午饭',
      '2026-03-05 12:00,收入,工资薪酬,工资,本地账户,8000.00,',
    ]);
  });

  it('escapes commas, quotes and newlines', () => {
    const csv = recordsToCsv([record({ note: '含,逗号"引号"\n换行' })]);
    expect(csv.split('\n')[0]).toBe('日期,交易类型,一级分类,二级分类,账户,金额,备注');
    expect(csv).toContain('"含,逗号""引号""\n换行"');
  });
});
