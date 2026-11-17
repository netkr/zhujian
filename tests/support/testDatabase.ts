// 测试用数据库适配层：用 Node 自带的 node:sqlite 实现 src/domain/db.ts 的 SqlDatabase 接口。
// 仅用于测试；不参与 App 运行。
import { DatabaseSync } from 'node:sqlite';
import type { SqlBindValue, SqlDatabase } from '../../src/domain/db';

export function createTestDatabase(): SqlDatabase & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');

  return {
    raw,
    async execAsync(source: string) {
      raw.exec(source);
    },
    async runAsync(source: string, ...params: SqlBindValue[]) {
      const result = raw.prepare(source).run(...(params as never[]));
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    async getAllAsync<T>(source: string, ...params: SqlBindValue[]) {
      return raw.prepare(source).all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(source: string, ...params: SqlBindValue[]) {
      const row = raw.prepare(source).get(...(params as never[]));
      return (row ?? null) as T | null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
