// 日期运算、金额与文本格式化、CSV 生成。无 RN / Expo 依赖。

import type { LedgerRecord, Range } from './types';

export function sameMonth(date: string | Date, month: Date) {
  const target = new Date(date);
  return target.getFullYear() === month.getFullYear() && target.getMonth() === month.getMonth();
}

export function sameDay(date: string | Date, day: Date) {
  const target = new Date(date);
  return target.getFullYear() === day.getFullYear() && target.getMonth() === day.getMonth() && target.getDate() === day.getDate();
}

export function sameWeek(date: string | Date, day: Date) {
  const target = new Date(date);
  const start = new Date(day);
  start.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return target >= start && target < end;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function addMonths(date: Date, months: number) {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  return new Date(year, month, Math.min(date.getDate(), lastDayOfMonth(year, month)), date.getHours(), date.getMinutes(), date.getSeconds());
}

export function addYears(date: Date, years: number) {
  const year = date.getFullYear() + years;
  const month = date.getMonth();
  return new Date(year, month, Math.min(date.getDate(), lastDayOfMonth(year, month)), date.getHours(), date.getMinutes(), date.getSeconds());
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

export function formatMonth(date: Date) {
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`;
}

export function formatDate(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatShortDate(date: string) {
  const target = new Date(date);
  return `${target.getMonth() + 1}月${target.getDate()}日`;
}

export function formatDateTime(date: string) {
  const target = new Date(date);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')} ${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
}

export function formatFileDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
}

export function money(amount: number) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}¥${Math.abs(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortMoney(amount: number) {
  if (amount >= 10000) return `${Math.round(amount / 1000) / 10}万`;
  if (amount >= 1000) return `${Math.round(amount / 100) / 10}千`;
  return `${Math.round(amount)}`;
}

export function trimAmount(amount: number) {
  return amount.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export function rangeTitle(range: Range) {
  if (range === 'year') return '年度';
  if (range === 'all') return '全部';
  return '月度';
}

export function trendTitle(range: Range, label: string) {
  if (range === 'year') return `每月${label}趋势`;
  if (range === 'all') return `年度${label}趋势`;
  return `每日${label}趋势`;
}

export function evaluateAmount(input: string) {
  if (!input) return 0;
  const tokens = input.match(/(\d+(?:\.\d+)?|[+-])/g);
  if (!tokens?.length) return 0;
  let total = Number(tokens[0]) || 0;
  for (let index = 1; index < tokens.length - 1; index += 2) {
    const operator = tokens[index];
    const value = Number(tokens[index + 1]) || 0;
    total = operator === '-' ? total - value : total + value;
  }
  return Math.round(total * 100) / 100;
}

export function csvEscape(value: string | number) {
  const raw = String(value ?? '');
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

// 由 exportRecordsCsv 抽出：把流水行渲染成 CSV 文本。原实现直接读库，
// 抽出后可在无数据库环境下锁定导出格式（列顺序、转义、日期格式）。
export function recordsToCsv(records: LedgerRecord[]): string {
  const header = ['日期', '交易类型', '一级分类', '二级分类', '账户', '金额', '备注'];
  const lines = records.map((record) => [
    formatDateTime(record.date),
    record.type === 'income' ? '收入' : '支出',
    record.primary,
    record.secondary,
    record.account,
    record.amount.toFixed(2),
    record.note,
  ]);
  return [header, ...lines].map((row) => row.map(csvEscape).join(',')).join('\n');
}
