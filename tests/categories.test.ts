import { describe, expect, it } from 'vitest';
import { categoryIcon, defaultExpenseTemplates, defaultIncomeTemplates, groupCategories } from '../src/domain/categories';
import type { DbCategory } from '../src/domain/types';

function cat(primary: string, secondary: string, type: DbCategory['type'] = 'expense'): DbCategory {
  return { id: 0, type, primary, secondary, icon: 'tag', sortOrder: 0, isBuiltin: 1 };
}

describe('groupCategories', () => {
  it('groups by primary in first-seen order and dedupes children', () => {
    const grouped = groupCategories(
      [cat('餐饮食品', '正餐'), cat('交通出行', '公交地铁'), cat('餐饮食品', '零食'), cat('餐饮食品', '正餐'), cat('工资薪酬', '工资', 'income')],
      'expense',
    );
    expect(grouped).toEqual([
      { primary: '餐饮食品', icon: 'tag', children: ['正餐', '零食'] },
      { primary: '交通出行', icon: 'tag', children: ['公交地铁'] },
    ]);
  });

  it('keeps the icon from the first row of a primary', () => {
    const grouped = groupCategories([{ ...cat('宠物', '食品'), icon: 'pet' }, { ...cat('宠物', '用品'), icon: 'ignored' }], 'expense');
    expect(grouped).toEqual([{ primary: '宠物', icon: 'pet', children: ['食品', '用品'] }]);
  });

  it('returns an empty list when no rows match the type', () => {
    expect(groupCategories([cat('工资薪酬', '工资', 'income')], 'expense')).toEqual([]);
  });
});

describe('categoryIcon', () => {
  it('maps known primaries', () => {
    expect(categoryIcon('餐饮食品')).toBe('food');
    expect(categoryIcon('交通出行')).toBe('traffic');
    expect(categoryIcon('工资薪酬')).toBe('briefcase');
  });

  it('falls back by entry type', () => {
    expect(categoryIcon('某个未知分类')).toBe('tag');
    expect(categoryIcon('某个未知分类', 'income')).toBe('coin');
  });
});

describe('内置模板不变量', () => {
  it('expense fallback target exists（导入未识别时回落到 其他支出/最后一个二级）', () => {
    const other = defaultExpenseTemplates.find((t) => t.primary === '其他支出');
    expect(other?.children).toEqual(['丢失损失', '杂项']);
  });

  it('income fallback target exists', () => {
    const other = defaultIncomeTemplates.find((t) => t.primary === '其他收入');
    expect(other?.children).toEqual(['其他']);
  });
});
