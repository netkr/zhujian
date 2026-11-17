// 数据层：建表、迁移、分类写路径与读取。
//
// 这里刻意不依赖 expo-sqlite，只声明一个最小接口 `SqlDatabase`。
// expo-sqlite 的 SQLiteDatabase 结构上满足该接口，因此 App.tsx 无需改动调用方式；
// 测试侧用 node:sqlite 实现同一接口即可在普通 Node 环境里跑迁移与建表。

import { defaultExpenseTemplates, defaultIncomeTemplates } from './categories';
import type { AppSettings, CategoryTemplate, DbCategory, EntryType, ImportLog, LedgerRecord } from './types';

export type SqlBindValue = string | number | null | boolean | Uint8Array;

export type SqlRunResult = {
  lastInsertRowId: number;
  changes: number;
};

export type SqlDatabase = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlBindValue[]): Promise<SqlRunResult>;
  getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

export const DEFAULT_CATEGORIES_SEEDED_KEY = 'defaultCategoriesSeeded';

export const defaultSettings: AppSettings = {
  startEntry: 'flow',
  lockMode: '5min',
  passcodeEnabled: false,
  biometricEnabled: false,
};

export type DbCategoryRow = {
  id: number;
  type: string;
  primary_name: string;
  secondary_name: string;
  icon: string;
  sort_order: number;
  is_builtin: number;
};

export type DbRecordRow = {
  id: number;
  type: string;
  amount: number;
  primary_name: string;
  secondary_name: string;
  note: string | null;
  date: string;
  account: string | null;
};

type DbImportLogRow = {
  id: number;
  file_name: string;
  imported_count: number;
  skipped_count: number;
  created_at: string;
  message: string | null;
};

export async function initDatabase(db: SqlDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      amount REAL NOT NULL,
      primary_name TEXT NOT NULL,
      secondary_name TEXT NOT NULL,
      note TEXT,
      date TEXT NOT NULL,
      account TEXT NOT NULL DEFAULT '本地账户',
      import_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      primary_name TEXT NOT NULL,
      secondary_name TEXT NOT NULL,
      icon TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      imported_count INTEGER NOT NULL,
      skipped_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      message TEXT
    );
    CREATE TABLE IF NOT EXISTS category_overrides (
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      primary_name TEXT NOT NULL,
      secondary_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (type, primary_name, secondary_name)
    );
    CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);
    CREATE INDEX IF NOT EXISTS idx_records_type_date ON records(type, date);
    CREATE INDEX IF NOT EXISTS idx_categories_type_primary ON categories(type, primary_name);
  `);
  await ensureRecordImportKeyColumn(db);
  await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_records_import_key ON records(import_key) WHERE import_key IS NOT NULL;');
  await ensureDefaultCategories(db);
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db.runAsync(
      'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      key,
      String(value),
      new Date().toISOString(),
    );
  }
}

type CategoryRenameV1Rule = {
  type: EntryType;
  primary: string;
  from: string;
  to: string;
};

// One-time rename/merge migration. Category names are stored as plain text in
// records/categories/category_overrides, so changing the templates alone would
// leave old and new names coexisting and split the statistics.
const categoryRenameV1Rules: CategoryRenameV1Rule[] = [
  { type: 'expense', primary: '餐饮食品', from: '正餐早午晚餐', to: '正餐' },
  { type: 'expense', primary: '交通出行', from: '高铁长途交通', to: '长途交通' },
  { type: 'expense', primary: '交通出行', from: '交通罚款', to: '罚款' },
  { type: 'expense', primary: '交通出行', from: '汽车油费', to: '油费' },
  { type: 'expense', primary: '交通出行', from: '汽车保养', to: '保养' },
  { type: 'expense', primary: '数码通讯', from: '手机话费', to: '话费' },
  { type: 'expense', primary: '娱乐休闲', from: '休闲玩乐', to: '玩乐' },
  { type: 'expense', primary: '宠物', from: '宠物食品', to: '食品' },
  { type: 'expense', primary: '宠物', from: '宠物用品', to: '用品' },
  { type: 'expense', primary: '宠物', from: '宠物医疗', to: '医疗' },
  { type: 'expense', primary: '宠物', from: '宠物服务', to: '服务' },
  { type: 'expense', primary: '投资理财', from: '投资申购', to: '申购' },
  { type: 'expense', primary: '投资理财', from: '投资亏损', to: '亏损' },
  { type: 'expense', primary: '经营业务', from: '经营设备', to: '设备' },
  { type: 'expense', primary: '经营业务', from: '经营软件', to: '软件' },
  { type: 'expense', primary: '经营业务', from: '经营办公', to: '办公' },
  { type: 'expense', primary: '服饰美容', from: '理发美容', to: '理发' },
  { type: 'expense', primary: '医疗健康', from: '就医治疗', to: '就医' },
  { type: 'expense', primary: '日用家居', from: '清洁保洁', to: '保洁' },
  { type: 'expense', primary: '旅行度假', from: '旅行购物', to: '购物' },
  { type: 'expense', primary: '其他支出', from: '无法判断的杂项', to: '杂项' },
  { type: 'expense', primary: '财务税费', from: '非交通类罚金', to: '罚金' },
  { type: 'income', primary: '其他收入', from: '无法明确归类的收入', to: '其他' },
  { type: 'income', primary: '工资薪酬', from: '兼职劳务', to: '劳务报酬' },
  { type: 'income', primary: '借款回款', from: '他人还款', to: '借款收回' },
  { type: 'income', primary: '资产处置', from: '闲鱼卖出', to: '二手出售' },
  { type: 'income', primary: '投资理财收入', from: '基金收益', to: '理财收益' },
];

export async function migrateCategoryNamesV1(db: SqlDatabase) {
  const markerKey = 'categoryRenameV1';
  const marker = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ? LIMIT 1',
    markerKey,
  );
  if (marker) return;
  const now = new Date().toISOString();
  for (const rule of categoryRenameV1Rules) {
    await db.runAsync(
      'UPDATE records SET secondary_name = ? WHERE type = ? AND primary_name = ? AND secondary_name = ?',
      rule.to,
      rule.type,
      rule.primary,
      rule.from,
    );
    // Soft-delete the old category row instead of renaming it; the new name is
    // rebuilt by reconcileBuiltinCategories right after this migration.
    await db.runAsync(
      'UPDATE categories SET is_deleted = 1, updated_at = ? WHERE type = ? AND primary_name = ? AND secondary_name = ?',
      now,
      rule.type,
      rule.primary,
      rule.from,
    );
    // Carry the user's deletion intent over to the new name. UPDATE OR IGNORE
    // avoids a PK conflict when an override for the new name already exists,
    // then the residual old-name override is removed.
    await db.runAsync(
      'UPDATE OR IGNORE category_overrides SET secondary_name = ? WHERE type = ? AND primary_name = ? AND secondary_name = ?',
      rule.to,
      rule.type,
      rule.primary,
      rule.from,
    );
    await db.runAsync(
      'DELETE FROM category_overrides WHERE type = ? AND primary_name = ? AND secondary_name = ?',
      rule.type,
      rule.primary,
      rule.from,
    );
  }
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    markerKey,
    'true',
    now,
  );
}

export async function ensureDefaultCategories(db: SqlDatabase) {
  await migrateCategoryNamesV1(db);
  await preserveLegacyCustomizedBuiltins(db);
  await reconcileBuiltinCategories(db);
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    DEFAULT_CATEGORIES_SEEDED_KEY,
    'true',
    new Date().toISOString(),
  );
}

export async function preserveLegacyCustomizedBuiltins(db: SqlDatabase) {
  const rows = await db.getAllAsync<{ id: number; type: string; primary_name: string; secondary_name: string }>(
    'SELECT id, type, primary_name, secondary_name FROM categories WHERE is_builtin = 1 AND is_deleted = 0',
  );
  for (const row of rows) {
    const templates = row.type === 'income' ? defaultIncomeTemplates : defaultExpenseTemplates;
    const isCurrentTemplate = templates.some((template) => template.primary === row.primary_name && template.children.includes(row.secondary_name));
    if (!isCurrentTemplate) {
      await db.runAsync('UPDATE categories SET is_builtin = 0, updated_at = ? WHERE id = ?', new Date().toISOString(), row.id);
    }
  }
}

export async function reconcileBuiltinCategories(db: SqlDatabase) {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE categories SET is_deleted = 1, updated_at = ? WHERE is_builtin = 1', now);
  await upsertBuiltinTemplates(db, 'expense', defaultExpenseTemplates);
  await upsertBuiltinTemplates(db, 'income', defaultIncomeTemplates);
}

export async function upsertBuiltinTemplates(db: SqlDatabase, type: EntryType, templates: CategoryTemplate[]) {
  let order = 1;
  const now = new Date().toISOString();
  for (const template of templates) {
    for (const child of template.children) {
      const suppressed = await db.getFirstAsync<{ secondary_name: string }>(
        'SELECT secondary_name FROM category_overrides WHERE type = ? AND primary_name = ? AND secondary_name = ? LIMIT 1',
        type,
        template.primary,
        child,
      );
      if (suppressed) {
        order += 1;
        continue;
      }
      const found = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM categories WHERE type = ? AND primary_name = ? AND secondary_name = ? ORDER BY id ASC LIMIT 1',
        type,
        template.primary,
        child,
      );
      if (found) {
        await db.runAsync(
          // Keep the user's existing order. Built-in reconciliation only refreshes
          // template metadata and restores a category when it was not suppressed.
          'UPDATE categories SET icon = ?, is_builtin = 1, is_deleted = 0, updated_at = ? WHERE id = ?',
          template.icon,
          now,
          found.id,
        );
        order++;
      } else {
        await db.runAsync(
          'INSERT INTO categories (type, primary_name, secondary_name, icon, sort_order, is_builtin, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)',
          type,
          template.primary,
          child,
          template.icon,
          order++,
          now,
          now,
        );
      }
    }
  }
}

export async function ensureRecordImportKeyColumn(db: SqlDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(records)');
  if (!columns.some((column) => column.name === 'import_key')) {
    await db.execAsync('ALTER TABLE records ADD COLUMN import_key TEXT');
  }
}

export async function suppressBuiltinPrimary(db: SqlDatabase, type: EntryType, primary: string) {
  const rows = await db.getAllAsync<{ primary_name: string; secondary_name: string }>(
    'SELECT primary_name, secondary_name FROM categories WHERE type = ? AND primary_name = ? AND is_builtin = 1',
    type,
    primary,
  );
  for (const row of rows) {
    await db.runAsync(
      'INSERT OR IGNORE INTO category_overrides (type, primary_name, secondary_name, created_at) VALUES (?, ?, ?, ?)',
      type,
      row.primary_name,
      row.secondary_name,
      new Date().toISOString(),
    );
  }
}

export async function suppressBuiltinSecondary(db: SqlDatabase, type: EntryType, primary: string, secondary: string) {
  const row = await db.getFirstAsync<{ primary_name: string; secondary_name: string }>(
    'SELECT primary_name, secondary_name FROM categories WHERE type = ? AND primary_name = ? AND secondary_name = ? AND is_builtin = 1 LIMIT 1',
    type,
    primary,
    secondary,
  );
  if (!row) return;
  await db.runAsync(
    'INSERT OR IGNORE INTO category_overrides (type, primary_name, secondary_name, created_at) VALUES (?, ?, ?, ?)',
    type,
    row.primary_name,
    row.secondary_name,
    new Date().toISOString(),
  );
}

export async function fetchRecords(db: SqlDatabase): Promise<LedgerRecord[]> {
  const rows = await db.getAllAsync<DbRecordRow>('SELECT * FROM records ORDER BY date DESC, id DESC');
  return rows.map((row) => ({
    id: row.id,
    type: row.type === 'income' ? 'income' : 'expense',
    amount: Number(row.amount) || 0,
    primary: row.primary_name,
    secondary: row.secondary_name,
    note: row.note ?? '',
    date: row.date,
    account: row.account ?? '本地账户',
  }));
}

export async function fetchCategories(db: SqlDatabase): Promise<DbCategory[]> {
  const rows = await db.getAllAsync<DbCategoryRow>('SELECT * FROM categories WHERE is_deleted = 0 ORDER BY type ASC, sort_order ASC, id ASC');
  return rows.map((row) => ({
    id: row.id,
    type: row.type === 'income' ? 'income' : 'expense',
    primary: row.primary_name,
    secondary: row.secondary_name,
    icon: row.icon,
    sortOrder: row.sort_order,
    isBuiltin: row.is_builtin,
  }));
}

export async function fetchSettings(db: SqlDatabase): Promise<AppSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const raw = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    startEntry: raw.startEntry === 'add' ? 'add' : 'flow',
    lockMode: raw.lockMode === 'immediate' ? 'immediate' : '5min',
    passcodeEnabled: raw.passcodeEnabled === 'true',
    biometricEnabled: raw.biometricEnabled === 'true',
  };
}

export async function fetchImportLogs(db: SqlDatabase): Promise<ImportLog[]> {
  const rows = await db.getAllAsync<DbImportLogRow>('SELECT * FROM import_logs ORDER BY id DESC LIMIT 20');
  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    importedCount: row.imported_count,
    skippedCount: row.skipped_count,
    createdAt: row.created_at,
    message: row.message ?? '',
  }));
}

export async function nextCategoryOrder(db: SqlDatabase, type: EntryType, primary: string) {
  const row = await db.getFirstAsync<{ max_order: number | null }>(
    'SELECT MAX(sort_order) AS max_order FROM categories WHERE type = ? AND primary_name = ?',
    type,
    primary,
  );
  return (row?.max_order ?? 0) + 1;
}

export async function ensureCategory(db: SqlDatabase, type: EntryType, primary: string, secondary: string, icon: string) {
  const found = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM categories WHERE type = ? AND primary_name = ? AND secondary_name = ? AND is_deleted = 0',
    type,
    primary,
    secondary,
  );
  if (found) return found.id;
  const order = await nextCategoryOrder(db, type, primary);
  await db.runAsync(
    'INSERT INTO categories (type, primary_name, secondary_name, icon, sort_order, is_builtin, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)',
    type,
    primary,
    secondary,
    icon,
    order,
    new Date().toISOString(),
    new Date().toISOString(),
  );
}
