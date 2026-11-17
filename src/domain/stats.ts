// 统计聚合与报表筛选口径：月度/年度/全部范围的汇总、分组与下钻。无 RN / Expo 依赖。

import { formatDate, formatMonth, sameDay, sameMonth } from './format';
import type { CategoryTemplate, EntryType, LedgerDrilldownFilter, LedgerRecord, Range } from './types';

export function getSummary(records: LedgerRecord[]) {
  return records.reduce(
    (summary, record) => {
      if (record.type === 'income') summary.income += record.amount;
      else summary.expense += record.amount;
      return summary;
    },
    { income: 0, expense: 0 },
  );
}

export function groupByDay(records: LedgerRecord[]) {
  const map = new Map<number, number>();
  records.forEach((record) => {
    const date = new Date(record.date);
    const day = date.getDate();
    map.set(day, (map.get(day) ?? 0) + record.amount);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([day, amount]) => ({ label: `${day}日`, amount }));
}

export function groupByTrend(records: LedgerRecord[], month: Date, range: Range) {
  if (range === 'year') {
    const map = new Map<number, number>();
    records.forEach((record) => {
      const date = new Date(record.date);
      const monthIndex = date.getMonth() + 1;
      map.set(monthIndex, (map.get(monthIndex) ?? 0) + record.amount);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([monthIndex, amount]) => ({ label: `${monthIndex}月`, amount }));
  }
  if (range === 'all') {
    const map = new Map<number, number>();
    records.forEach((record) => {
      const date = new Date(record.date);
      const year = date.getFullYear();
      map.set(year, (map.get(year) ?? 0) + record.amount);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, amount]) => ({ label: `${year}`, amount }));
  }
  return groupByDay(records.filter((record) => sameMonth(record.date, month)));
}

export function groupByCategory(records: LedgerRecord[]) {
  const map = new Map<string, { label: string; amount: number; count: number }>();
  records.forEach((record) => {
    const key = record.primary || '其他';
    const current = map.get(key) ?? { label: key, amount: 0, count: 0 };
    current.amount += record.amount;
    current.count += 1;
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

export function getFrequentTemplates(records: LedgerRecord[], templates: CategoryTemplate[], type: EntryType, selectedPrimary: string) {
  const counts = new Map<string, number>();
  records.filter((record) => record.type === type).forEach((record) => {
    counts.set(record.primary, (counts.get(record.primary) ?? 0) + 1);
  });
  const ordered = templates
    .map((template, index) => ({ template, index, count: counts.get(template.primary) ?? 0 }))
    .sort((left, right) => right.count - left.count || left.index - right.index)
    .map((item) => item.template);
  const frequent = ordered.slice(0, 4);
  const selected = templates.find((template) => template.primary === selectedPrimary);
  if (selected && !frequent.some((template) => template.primary === selected.primary)) {
    return [...frequent.slice(0, 3), selected];
  }
  return frequent;
}

export function getRecentCategories(records: LedgerRecord[], templates: CategoryTemplate[], type: EntryType) {
  const available = new Map(templates.map((template) => [template.primary, new Set(template.children)]));
  const seen = new Set<string>();
  const recent: Array<{ primary: string; secondary: string }> = [];
  [...records]
    .filter((record) => record.type === type)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .forEach((record) => {
      const children = available.get(record.primary);
      const key = `${record.primary}/${record.secondary}`;
      if (!children?.has(record.secondary) || seen.has(key)) return;
      seen.add(key);
      recent.push({ primary: record.primary, secondary: record.secondary });
    });
  return recent.slice(0, 4);
}

export function filterByRange(records: LedgerRecord[], month: Date, range: Range) {
  if (range === 'all') return records;
  if (range === 'year') return records.filter((record) => new Date(record.date).getFullYear() === month.getFullYear());
  return records.filter((record) => sameMonth(record.date, month));
}

export function filterByDrilldown(records: LedgerRecord[], filter: LedgerDrilldownFilter | null) {
  if (!filter) return records;
  return filterByRange(records, new Date(filter.anchor), filter.range).filter((record) => {
    if (record.type !== filter.type) return false;
    if (filter.primary && record.primary !== filter.primary) return false;
    return !filter.day || sameDay(record.date, new Date(filter.day));
  });
}

export function drilldownRangeLabel(month: Date, range: Range) {
  if (range === 'year') return `${month.getFullYear()}年`;
  if (range === 'all') return '全部时间';
  return formatMonth(month);
}

export function drilldownForTrend(label: string, type: EntryType, range: Range, month: Date): LedgerDrilldownFilter {
  const number = Number(label.replace(/[^\d]/g, ''));
  if (range === 'year') {
    const anchor = new Date(month.getFullYear(), Math.max(number - 1, 0), 1);
    return { type, range: 'month', anchor: anchor.toISOString(), label: `${formatMonth(anchor)} · ${type === 'expense' ? '支出' : '收入'}` };
  }
  if (range === 'all') {
    const anchor = new Date(number, 0, 1);
    return { type, range: 'year', anchor: anchor.toISOString(), label: `${number}年 · ${type === 'expense' ? '支出' : '收入'}` };
  }
  const anchor = new Date(month.getFullYear(), month.getMonth(), Math.max(number, 1));
  return { type, range: 'month', anchor: anchor.toISOString(), day: anchor.toISOString(), label: `${formatDate(anchor)} · ${type === 'expense' ? '支出' : '收入'}` };
}
