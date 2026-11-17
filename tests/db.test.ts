import { describe, expect, it } from 'vitest';
import { defaultExpenseTemplates, defaultIncomeTemplates } from '../src/domain/categories';
import {
  ensureCategory,
  ensureDefaultCategories,
  ensureRecordImportKeyColumn,
  fetchCategories,
  fetchImportLogs,
  fetchRecords,
  fetchSettings,
  initDatabase,
  migrateCategoryNamesV1,
  preserveLegacyCustomizedBuiltins,
  reconcileBuiltinCategories,
  suppressBuiltinPrimary,
  suppressBuiltinSecondary,
} from '../src/domain/db';
import type { SqlDatabase } from '../src/domain/db';
import { createTestDatabase } from './support/testDatabase';

// 覆盖数据层：建表/索引、老库升级、迁移链、分类写路径、读取映射。
// 走 node:sqlite（见 tests/support/testDatabase.ts），与设备上的 expo-sqlite 是不同引擎，
// 因此这里验证的是 SQL 逻辑，不是设备引擎行为。

const INSERT_RECORD =
  'INSERT INTO records (type, amount, primary_name, secondary_name, note, date, account, import_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
const INSERT_CATEGORY =
  'INSERT INTO categories (type, primary_name, secondary_name, icon, sort_order, is_builtin, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

const builtinCategoryCount =
  defaultExpenseTemplates.reduce((n, t) => n + t.children.length, 0) +
  defaultIncomeTemplates.reduce((n, t) => n + t.children.length, 0);

async function count(db: SqlDatabase, sql: string, ...params: Array<string | number | null>) {
  const row = await db.getFirstAsync<{ c: number }>(sql, ...params);
  return row?.c ?? 0;
}

async function objectNames(db: SqlDatabase, type: 'table' | 'index') {
  const rows = await db.getAllAsync<{ name: string }>('SELECT name FROM sqlite_master WHERE type = ?', type);
  return rows.map((row) => row.name);
}

async function columnNames(db: SqlDatabase, table: string) {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((row) => row.name);
}

const LEGACY_RECORDS_TABLE = `
  CREATE TABLE records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
    amount REAL NOT NULL,
    primary_name TEXT NOT NULL,
    secondary_name TEXT NOT NULL,
    note TEXT,
    date TEXT NOT NULL,
    account TEXT NOT NULL DEFAULT '本地账户',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`;

describe('initDatabase — 建表 / 索引 / 播种', () => {
  it('creates all tables and indexes', async () => {
    const db = createTestDatabase();
    await initDatabase(db);

    expect(await objectNames(db, 'table')).toEqual(
      expect.arrayContaining(['records', 'categories', 'settings', 'import_logs', 'category_overrides']),
    );
    expect(await objectNames(db, 'index')).toEqual(
      expect.arrayContaining(['idx_records_date', 'idx_records_type_date', 'idx_categories_type_primary', 'idx_records_import_key']),
    );
  });

  it('seeds built-in categories and default settings', async () => {
    const db = createTestDatabase();
    await initDatabase(db);

    expect(await count(db, 'SELECT COUNT(*) AS c FROM categories WHERE is_deleted = 0')).toBe(builtinCategoryCount);
    expect(await count(db, "SELECT COUNT(*) AS c FROM categories WHERE type = 'expense' AND is_builtin = 1")).toBe(
      defaultExpenseTemplates.reduce((n, t) => n + t.children.length, 0),
    );

    expect(await fetchSettings(db)).toEqual({
      startEntry: 'flow',
      lockMode: '5min',
      passcodeEnabled: false,
      biometricEnabled: false,
    });
  });

  it('is idempotent', async () => {
    const db = createTestDatabase();
    await initDatabase(db);
    const before = await count(db, 'SELECT COUNT(*) AS c FROM categories');
    await initDatabase(db);
    expect(await count(db, 'SELECT COUNT(*) AS c FROM categories')).toBe(before);
  });

  it('enforces the type CHECK constraint', async () => {
    const db = createTestDatabase();
    await initDatabase(db);
    await expect(db.runAsync(INSERT_RECORD, 'bogus', 1, 'a', 'b', '', '2026-01-01', '本地账户', null, 'x', 'x')).rejects.toThrow();
  });

  it('partial unique index on import_key: allows many NULLs, blocks duplicate non-null', async () => {
    const db = createTestDatabase();
    await initDatabase(db);

    await db.runAsync(INSERT_RECORD, 'expense', 1, 'a', 'b', '', '2026-01-01', '本地账户', null, 'x', 'x');
    await db.runAsync(INSERT_RECORD, 'expense', 1, 'a', 'b', '', '2026-01-01', '本地账户', null, 'x', 'x');
    expect(await count(db, 'SELECT COUNT(*) AS c FROM records')).toBe(2);

    await db.runAsync(INSERT_RECORD, 'expense', 1, 'a', 'b', '', '2026-01-01', '本地账户', 'k1', 'x', 'x');
    const ignored = await db.runAsync(
      INSERT_RECORD.replace('INSERT INTO', 'INSERT OR IGNORE INTO'),
      'expense',
      1,
      'a',
      'b',
      '',
      '2026-01-01',
      '本地账户',
      'k1',
      'x',
      'x',
    );
    expect(ignored.changes).toBe(0);
  });
});

describe('老库升级', () => {
  it('ensureRecordImportKeyColumn adds the missing column, idempotently', async () => {
    const db = createTestDatabase();
    await db.execAsync(LEGACY_RECORDS_TABLE);
    expect(await columnNames(db, 'records')).not.toContain('import_key');

    await ensureRecordImportKeyColumn(db);
    expect(await columnNames(db, 'records')).toContain('import_key');

    await ensureRecordImportKeyColumn(db);
    expect(await columnNames(db, 'records')).toContain('import_key');
  });

  it('initDatabase upgrades a legacy records table and builds the unique index', async () => {
    const db = createTestDatabase();
    await db.execAsync(LEGACY_RECORDS_TABLE);

    await initDatabase(db);

    expect(await columnNames(db, 'records')).toContain('import_key');
    expect(await objectNames(db, 'index')).toContain('idx_records_import_key');
    expect(await count(db, 'SELECT COUNT(*) AS c FROM categories WHERE is_deleted = 0')).toBe(builtinCategoryCount);
  });
});

describe('migrateCategoryNamesV1 — 一次性分类改名迁移', () => {
  async function seedOldName(db: SqlDatabase) {
    await db.runAsync("DELETE FROM settings WHERE key = 'categoryRenameV1'");
    await db.runAsync(INSERT_CATEGORY, 'expense', '餐饮食品', '正餐早午晚餐', 'food', 1, 1, 0, 'x', 'x');
    await db.runAsync(INSERT_RECORD, 'expense', 1, '餐饮食品', '正餐早午晚餐', '', '2026-01-01', '本地账户', null, 'x', 'x');
    await db.runAsync(
      "INSERT OR IGNORE INTO category_overrides (type, primary_name, secondary_name, created_at) VALUES ('expense', '餐饮食品', '正餐早午晚餐', 'x')",
    );
  }

  it('renames records, soft-deletes the old category and carries the override', async () => {
    const db = createTestDatabase();
    await initDatabase(db);
    await seedOldName(db);

    await migrateCategoryNamesV1(db);

    const record = await db.getFirstAsync<{ secondary_name: string }>(
      "SELECT secondary_name FROM records WHERE primary_name = '餐饮食品'",
    );
    expect(record?.secondary_name).toBe('正餐');

    const oldCategory = await db.getFirstAsync<{ is_deleted: number }>(
      "SELECT is_deleted FROM categories WHERE secondary_name = '正餐早午晚餐'",
    );
    expect(oldCategory?.is_deleted).toBe(1);

    expect(
      await count(db, "SELECT COUNT(*) AS c FROM category_overrides WHERE type = 'expense' AND primary_name = '餐饮食品'"),
    ).toBe(1);
    const override = await db.getFirstAsync<{ secondary_name: string }>(
      "SELECT secondary_name FROM category_overrides WHERE type = 'expense' AND primary_name = '餐饮食品'",
    );
    expect(override?.secondary_name).toBe('正餐');

    const marker = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'categoryRenameV1'");
    expect(marker?.value).toBe('true');
  });

  it('is guarded by the marker (second run is a no-op)', async () => {
    const db = createTestDatabase();
    await initDatabase(db);
    await seedOldName(db);
    await migrateCategoryNamesV1(db);

    // 迁移后再插入同样的旧名行，第二次运行不应再改动它
    const inserted = await db.runAsync(INSERT_CATEGORY, 'expense', '餐饮食品', '正餐早午晚餐', 'food', 99, 1, 0, 'x', 'x');
    await migrateCategoryNamesV1(db);

    const resurrected = await db.getFirstAsync<{ secondary_name: string; is_deleted: number }>(
      'SELECT secondary_name, is_deleted FROM categories WHERE id = ?',
      inserted.lastInsertRowId,
    );
    expect(resurrected?.secondary_name).toBe('正餐早午晚餐');
    expect(resurrected?.is_deleted).toBe(0);
  });
});

describe('内置分类协调', () => {
  it('preserveLegacyCustomizedBuiltins demotes builtins that are no longer in the templates', async () => {
    const db = createTestDatabase();
    await initDatabase(db);

    await db.runAsync(INSERT_CATEGORY, 'expense', '餐饮食品', '老二级', 'food', 99, 1, 0, 'x', 'x');
    await preserveLegacyCustomizedBuiltins(db);

    expect(
      (await db.getFirstAsync<{ is_builtin: number }>("SELECT is_builtin FROM categories WHERE secondary_name = '老二级'"))?.is_builtin,
    ).toBe(0);
    expect(
      (
        await db.getFirstAsync<{ is_builtin: number }>(
          "SELECT is_builtin FROM categories WHERE primary_name = '餐饮食品' AND secondary_name = '正餐'",
        )
      )?.is_builtin,
    ).toBe(1);
  });

  it('reconcileBuiltinCategories restores non-suppressed builtins and keeps suppressed ones deleted', async () => {
    const db = createTestDatabase();
    await initDatabase(db);
    await suppressBuiltinSecondary(db, 'expense', '餐饮食品', '零食');

    await reconcileBuiltinCategories(db);

    const suppressed = await db.getFirstAsync<{ is_deleted: number }>(
      "SELECT is_deleted FROM categories WHERE type = 'expense' AND primary_name = '餐饮食品' AND secondary_name = '零食'",
    );
    expect(suppressed?.is_deleted).toBe(1);

    const restored = await db.getFirstAsync<{ is_builtin: number; is_deleted: number }>(
      "SELECT is_builtin, is_deleted FROM categories WHERE type = 'expense' AND primary_name = '餐饮食品' AND secondary_name = '正餐'",
    );
    expect(restored?.is_builtin).toBe(1);
    expect(restored?.is_deleted).toBe(0);
  });

  it('ensureDefaultCategories seeds every template pair and sets the marker', async () => {
    const db = createTestDatabase();
    await initDatabase(db);

    const marker = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'defaultCategoriesSeeded'");
    expect(marker?.value).toBe('true');

    for (const template of [...defaultExpenseTemplates, ...defaultIncomeTemplates]) {
      for (const child of template.children) {
        const row = await db.getFirstAsync<{ is_builtin: number; is_deleted: number }>(
          'SELECT is_builtin, is_deleted FROM categories WHERE primary_name = ? AND secondary_name = ?',
          template.primary,
          child,
        );
        expect(row, `缺少内置分类 ${template.primary}/${child}`).not.toBeNull();
        expect(row?.is_builtin, `${template.primary}/${child} 应为内置`).toBe(1);
        expect(row?.is_deleted, `${template.primary}/${child} 不应被删除`).toBe(0);
      }
    }
  });
});

describe('分类写路径', () => {
  it('ensureCategory inserts a non-builtin category with the next sort_order and dedupes by (type, primary, secondary)', async () => {
    const db = createTestDatabase();
    await initDatabase(db);

    const inserted = await ensureCategory(db, 'expense', '我的分类', '子A', 'tag');
    const existing = await ensureCategory(db, 'expense', '我的分类', '子A', 'tag');

    // 现状：插入分支没有返回值，已存在时返回 id
    expect(inserted).toBeUndefined();
    expect(typeof existing).toBe('number');
    expect(await count(db, "SELECT COUNT(*) AS c FROM categories WHERE primary_name = '我的分类'")).toBe(1);

    await ensureCategory(db, 'expense', '我的分类', '子B', 'tag');
    const rows = await db.getAllAsync<{ secondary_name: string; sort_order: number; is_builtin: number }>(
      "SELECT secondary_name, sort_order, is_builtin FROM categories WHERE primary_name = '我的分类' ORDER BY sort_order ASC",
    );
    expect(rows.map((row) => row.secondary_name)).toEqual(['子A', '子B']);
    expect(rows.map((row) => row.sort_order)).toEqual([1, 2]);
    expect(rows[0].is_builtin).toBe(0);
  });

  it('suppressBuiltinSecondary records an override once and ignores non-builtin categories', async () => {
    const db = createTestDatabase();
    await initDatabase(db);

    await suppressBuiltinSecondary(db, 'expense', '餐饮食品', '零食');
    await suppressBuiltinSecondary(db, 'expense', '餐饮食品', '零食');
    expect(await count(db, "SELECT COUNT(*) AS c FROM category_overrides WHERE secondary_name = '零食'")).toBe(1);

    await ensureCategory(db, 'expense', '我的分类', '子A', 'tag');
    await suppressBuiltinSecondary(db, 'expense', '我的分类', '子A');
    expect(await count(db, "SELECT COUNT(*) AS c FROM category_overrides WHERE primary_name = '我的分类'")).toBe(0);
  });

  it('suppressBuiltinPrimary records one override per child', async () => {
    const db = createTestDatabase();
    await initDatabase(db);
    await suppressBuiltinPrimary(db, 'expense', '餐饮食品');

    const expected = defaultExpenseTemplates.find((t) => t.primary === '餐饮食品')?.children.length ?? 0;
    expect(await count(db, "SELECT COUNT(*) AS c FROM category_overrides WHERE primary_name = '餐饮食品'")).toBe(expected);
  });
});

describe('读取映射', () => {
  it('fetchRecords maps rows and applies defaults / ordering', async () => {
    const db = createTestDatabase();
    await initDatabase(db);
    await db.runAsync(
      "INSERT INTO records (type, amount, primary_name, secondary_name, note, date, created_at, updated_at) VALUES ('income', 5, '工资薪酬', '工资', NULL, '2026-03-01T00:00:00.000Z', 'x', 'x')",
    );
    await db.runAsync(
      "INSERT INTO records (type, amount, primary_name, secondary_name, note, date, created_at, updated_at) VALUES ('expense', 9, '餐饮食品', '正餐', '午饭', '2026-04-01T00:00:00.000Z', 'x', 'x')",
    );

    const records = await fetchRecords(db);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      id: expect.any(Number),
      type: 'expense',
      amount: 9,
      primary: '餐饮食品',
      secondary: '正餐',
      note: '午饭',
      date: '2026-04-01T00:00:00.000Z',
      account: '本地账户',
    });
    expect(records[1].note).toBe('');
    expect(records[1].account).toBe('本地账户');
  });

  it('fetchCategories hides soft-deleted rows and orders by type', async () => {
    const db = createTestDatabase();
    await initDatabase(db);
    await db.runAsync("UPDATE categories SET is_deleted = 1 WHERE primary_name = '餐饮食品' AND secondary_name = '零食'");

    const categories = await fetchCategories(db);
    expect(categories.some((c) => c.secondary === '零食')).toBe(false);
    expect(categories[0].type).toBe('expense');
    expect(categories.length).toBe(builtinCategoryCount - 1);
  });

  it('fetchSettings only recognises "add" for startEntry and falls back to defaults', async () => {
    const db = createTestDatabase();
    await db.execAsync('CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL);');

    expect(await fetchSettings(db)).toEqual({
      startEntry: 'flow',
      lockMode: '5min',
      passcodeEnabled: false,
      biometricEnabled: false,
    });

    await db.runAsync("INSERT INTO settings (key, value, updated_at) VALUES ('startEntry', 'report', 'x')");
    expect((await fetchSettings(db)).startEntry).toBe('flow');

    await db.runAsync("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('startEntry', 'add', 'x')");
    await db.runAsync("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('lockMode', 'immediate', 'x')");
    await db.runAsync("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('passcodeEnabled', 'true', 'x')");
    expect(await fetchSettings(db)).toEqual({
      startEntry: 'add',
      lockMode: 'immediate',
      passcodeEnabled: true,
      biometricEnabled: false,
    });
  });

  it('fetchImportLogs returns the newest 20 with message defaulted', async () => {
    const db = createTestDatabase();
    await initDatabase(db);
    for (let i = 1; i <= 25; i += 1) {
      await db.runAsync(
        'INSERT INTO import_logs (file_name, imported_count, skipped_count, created_at, message) VALUES (?, ?, ?, ?, ?)',
        `f${i}`,
        i,
        0,
        'x',
        null,
      );
    }

    const logs = await fetchImportLogs(db);
    expect(logs).toHaveLength(20);
    expect(logs[0].fileName).toBe('f25');
    expect(logs[19].fileName).toBe('f6');
    expect(logs[0].message).toBe('');
  });
});
