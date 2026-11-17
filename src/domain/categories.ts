// 分类体系：内置模板、分组与图标映射。无 RN / Expo 依赖。

import type { CategoryTemplate, DbCategory, EntryType, IconName } from './types';

export const defaultExpenseTemplates: CategoryTemplate[] = [
  { primary: '餐饮食品', icon: 'food', children: ['正餐', '买菜', '水果', '零食', '饮料咖啡', '烟酒茶'] },
  { primary: '居住物业', icon: 'home', children: ['房租', '水电燃气', '物业费', '搬家中介', '家庭维修'] },
  { primary: '交通出行', icon: 'traffic', children: ['公交地铁', '打车租车', '长途交通', '油费', '停车过路', '保养', '车险车贷', '罚款'] },
  { primary: '旅行度假', icon: 'travel', children: ['住宿', '旅游活动', '景点门票', '签证换汇', '购物'] },
  { primary: '日用家居', icon: 'household', children: ['日常用品', '家具家电', '保洁', '维修杂项', '生活支出'] },
  { primary: '数码通讯', icon: 'phone', children: ['手机电脑', '数码配件', '软件会员', '话费', '宽带网络', '快递邮寄'] },
  { primary: '服饰美容', icon: 'clothes', children: ['衣服鞋帽', '箱包', '饰品', '理发', '护肤洗护'] },
  { primary: '医疗健康', icon: 'medical', children: ['药品', '就医', '体检保健', '运动健身'] },
  { primary: '学习工作', icon: 'work', children: ['培训考试', '书籍资料', '办公用品', '职业服务', 'AI工具'] },
  { primary: '娱乐休闲', icon: 'leisure', children: ['游戏', '影视演出', '玩乐', '聚会娱乐', '博彩彩票'] },
  { primary: '人情社交', icon: 'social', children: ['送礼', '红包随礼', '请客', '慈善捐助', '婚丧礼金'] },
  { primary: '宠物', icon: 'pet', children: ['食品', '用品', '医疗', '服务'] },
  { primary: '财务税费', icon: 'finance', children: ['银行手续费', '保险', '社保税费', '罚金'] },
  { primary: '投资理财', icon: 'investment', children: ['基金股票', '理财产品', '申购', '亏损'] },
  { primary: '经营业务', icon: 'business', children: ['进货采购', '设备', '软件', '办公', '业务杂费'] },
  { primary: '其他支出', icon: 'misc', children: ['丢失损失', '杂项'] },
];

export const defaultIncomeTemplates: CategoryTemplate[] = [
  { primary: '工资薪酬', icon: 'briefcase', children: ['工资', '劳务报酬'] },
  { primary: '奖金补贴', icon: 'coin', children: ['年终奖', '绩效奖金', '津贴补助'] },
  { primary: '经营收入', icon: 'shop', children: ['商品销售', '服务收入', '经营回款'] },
  { primary: '投资理财收入', icon: 'investment', children: ['利息', '分红', '理财收益'] },
  { primary: '红包礼金', icon: 'gift', children: ['红包', '生日礼金', '婚礼礼金', '家庭赠与', '生活费'] },
  { primary: '退款赔偿', icon: 'refund', children: ['消费退款', '房租退款', '个税退税', '保险理赔', '赔偿金'] },
  { primary: '资产处置', icon: 'asset', children: ['二手出售', '资产变现'] },
  { primary: '借款回款', icon: 'loan', children: ['借款收回'] },
  { primary: '其他收入', icon: 'incomeMisc', children: ['其他'] },
];

export function groupCategories(categories: DbCategory[], type: EntryType): CategoryTemplate[] {
  const map = new Map<string, CategoryTemplate>();
  categories.filter((item) => item.type === type).forEach((item) => {
    if (!map.has(item.primary)) {
      map.set(item.primary, { primary: item.primary, icon: item.icon, children: [] });
    }
    const current = map.get(item.primary);
    if (current && !current.children.includes(item.secondary)) {
      current.children.push(item.secondary);
    }
  });
  return Array.from(map.values());
}

export function categoryIcon(primary: string, type: EntryType = 'expense'): IconName {
  const name = categoryIconMap[primary];
  if (name) return name;
  return type === 'income' ? 'coin' : 'tag';
}

const categoryIconMap: Record<string, IconName> = {
  餐饮: 'food',
  食品酒水: 'food',
  餐饮食品: 'food',
  交通: 'traffic',
  行车交通: 'traffic',
  交通出行: 'traffic',
  旅行度假: 'travel',
  娱乐: 'leisure',
  休闲娱乐: 'leisure',
  娱乐休闲: 'leisure',
  学习办公: 'work',
  工作学习: 'work',
  学习工作: 'work',
  购物: 'clothes',
  衣服饰品: 'clothes',
  服饰美容: 'clothes',
  生活缴费: 'home',
  居家物业: 'home',
  居住物业: 'home',
  日用家居: 'household',
  交流通讯: 'phone',
  数码通讯: 'phone',
  养娃成本: 'child',
  医疗: 'medical',
  医疗保健: 'medical',
  医疗健康: 'medical',
  宠物消费: 'pet',
  宠物: 'pet',
  风险管理: 'risk',
  投资理财: 'investment',
  人情往来: 'social',
  人情社交: 'social',
  金融保险: 'bank',
  财务税费: 'finance',
  经营业务: 'business',
  其他杂项: 'misc',
  其他支出: 'misc',
  职业收入: 'briefcase',
  工资薪酬: 'briefcase',
  奖金补贴: 'coin',
  经营收入: 'shop',
  投资理财收入: 'investment',
  红包礼金: 'gift',
  退款赔偿: 'refund',
  资产处置: 'asset',
  借款回款: 'loan',
  其他收入: 'incomeMisc',
};
