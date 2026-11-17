// 领域类型：无 RN / Expo 依赖，可被 Node 环境直接 import 与测试。

export type EntryType = 'expense' | 'income';

export type Range = 'month' | 'year' | 'all';

export type LedgerDrilldownFilter = {
  type: EntryType;
  range: Range;
  anchor: string;
  label: string;
  primary?: string;
  day?: string;
};

export type IconName =
  | 'food'
  | 'traffic'
  | 'leisure'
  | 'work'
  | 'clothes'
  | 'home'
  | 'phone'
  | 'child'
  | 'medical'
  | 'pet'
  | 'risk'
  | 'social'
  | 'bank'
  | 'misc'
  | 'briefcase'
  | 'coin'
  | 'gift'
  | 'luck'
  | 'shop'
  | 'tag'
  | 'ledger'
  | 'download'
  | 'lock'
  | 'privacy'
  | 'rocket'
  | 'travel'
  | 'household'
  | 'finance'
  | 'investment'
  | 'business'
  | 'refund'
  | 'asset'
  | 'loan'
  | 'incomeMisc';

export type LedgerRecord = {
  id: number;
  type: EntryType;
  amount: number;
  primary: string;
  secondary: string;
  note: string;
  date: string;
  account: string;
};

export type DbCategory = {
  id: number;
  type: EntryType;
  primary: string;
  secondary: string;
  icon: string;
  sortOrder: number;
  isBuiltin: number;
};

export type CategoryTemplate = {
  primary: string;
  icon: string;
  children: string[];
};

export type ParsedImportRecord = {
  type: EntryType;
  amount: number;
  primary: string;
  secondary: string;
  note: string;
  date: string;
  account: string;
  categoryUnmatched?: string;
};

export type ImportLog = {
  id: number;
  fileName: string;
  importedCount: number;
  skippedCount: number;
  createdAt: string;
  message: string;
};

export type AppSettings = {
  startEntry: 'flow' | 'report' | 'add' | 'mine';
  lockMode: 'immediate' | '5min';
  passcodeEnabled: boolean;
  biometricEnabled: boolean;
};
