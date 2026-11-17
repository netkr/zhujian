// 表格导入解析：CSV/XLSX 行映射、分类识别、去重键与导入键。无 RN / Expo 依赖。
// 注意：读取文件（FileSystem / XLSX）的部分留在 App.tsx，本模块只处理已读入的行。

import { defaultExpenseTemplates, defaultIncomeTemplates } from './categories';
import type { CategoryTemplate, EntryType, ParsedImportRecord } from './types';

export function mapImportObject(row: Record<string, unknown>): ParsedImportRecord {
  const normalized = new Map<string, unknown>();
  Object.entries(row).forEach(([key, value]) => normalized.set(normalizeHeader(key), value));
  const typeField = pickField(normalized, ['交易类型', '收支类型', '账目类型', '类型', '收支', '收入支出', '方向', 'type', '工作表', 'sheet']);
  const incomeField = pickField(normalized, ['收入金额', '收入', '流入', '入账', '收款', '贷方', 'credit']);
  const expenseField = pickField(normalized, ['支出金额', '支出', '流出', '出账', '付款', '借方', 'debit']);
  const genericAmountField = pickField(normalized, ['金额', '交易金额', '发生金额', '账目金额', 'money', 'amount']);
  const categoryField = pickField(normalized, ['完整分类', '收支分类', '账目分类', '项目分类', '分类名称', '分类', '类别', 'category']);
  const primaryField = pickField(normalized, ['一级分类', '一级类别', '主分类', '父分类', '大类', '分类1', 'category1', 'primary']);
  const secondaryField = pickField(normalized, ['二级分类', '二级类别', '子分类', '小类', '分类2', 'category2', 'secondary']);
  const typeRaw = cellString(typeField.value);
  const incomeAmount = parseAmount(cellString(incomeField.value));
  const expenseAmount = parseAmount(cellString(expenseField.value));
  const amountRaw = cellString(genericAmountField.value || incomeField.value || expenseField.value);
  const signedAmount = parseAmount(amountRaw);
  const categoryRaw = cellString(categoryField.value);
  const primaryRaw = cellString(primaryField.value);
  const secondaryRaw = cellString(secondaryField.value);
  const type = inferImportType({
    typeRaw,
    signedAmount,
    incomeAmount,
    expenseAmount,
    categoryText: [categoryRaw, primaryRaw, secondaryRaw].join(' '),
  });
  const { primary, secondary, matched: categoryMatched } = resolveImportCategory(type, primaryRaw, secondaryRaw, categoryRaw);
  const rawCategoryText = [primaryRaw, secondaryRaw, categoryRaw].map((value) => value.trim()).filter(Boolean).join(' ');
  const date = parseImportDate(pickValue(normalized, ['日期', '时间', '交易时间', '记账时间', '创建时间', '发生时间', 'date'])) ?? '';
  return {
    type,
    amount: Math.abs(incomeAmount || expenseAmount || signedAmount),
    primary,
    secondary,
    categoryUnmatched: !categoryMatched && rawCategoryText ? rawCategoryText : undefined,
    note: cellString(pickValue(normalized, ['备注', '说明', 'note', '商户', '商家', '项目', '摘要'])),
    account: cellString(pickValue(normalized, ['账户', '支出账户', '收入账户', '付款账户', '收款账户', 'account'])) || '本地账户',
    date,
  };
}

export function pickValue(map: Map<string, unknown>, keys: string[]) {
  return pickField(map, keys).value;
}

export function pickField(map: Map<string, unknown>, keys: string[]) {
  const normalizedKeys = keys.map(normalizeHeader);
  for (const key of keys) {
    const value = map.get(normalizeHeader(key));
    if (hasImportValue(value)) return { key: normalizeHeader(key), value };
  }
  for (const [header, value] of map.entries()) {
    if (!hasImportValue(value)) continue;
    // Only accept a source header that contains a requested alias. The reverse
    // match makes the generic "金额" column look like "收入金额" or "支出金额".
    if (normalizedKeys.some((key) => header.includes(key))) {
      return { key: header, value };
    }
  }
  return { key: '', value: '' };
}

export function hasImportValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function normalizeHeader(value: string) {
  return value.replace(/[\s_\-—:：/\\｜|,，.。()（）\[\]【】]/g, '').toLowerCase();
}

export function cellString(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '').trim();
}

export function parseAmount(value: string) {
  const clean = value.replace(/[¥￥,\s+]/g, '').replace(/^\((.*)\)$/, '-$1');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inferImportType({
  typeRaw,
  signedAmount,
  incomeAmount,
  expenseAmount,
  categoryText,
}: {
  typeRaw: string;
  signedAmount: number;
  incomeAmount: number;
  expenseAmount: number;
  categoryText: string;
}): EntryType {
  const normalizedType = normalizeHeader(typeRaw);
  const normalizedCategory = normalizeHeader(categoryText);
  const incomeWords = ['收入', '收款', '入账', '进账', '流入', '贷方', '工资', '奖金', '利息收入', '投资收入', '兼职收入', '经营所得'];
  const expenseWords = ['支出', '付款', '消费', '出账', '流出', '借方'];
  const explicitIncome = incomeWords.some((word) => normalizedType.includes(normalizeHeader(word)));
  const explicitExpense = expenseWords.some((word) => normalizedType.includes(normalizeHeader(word)));
  if (incomeAmount > 0 && !expenseAmount) return 'income';
  if (expenseAmount > 0 && !incomeAmount) return 'expense';
  if (explicitIncome && !explicitExpense) return 'income';
  if (explicitExpense && !explicitIncome) return 'expense';
  if (incomeWords.some((word) => normalizedCategory.includes(normalizeHeader(word)))) return 'income';
  if (signedAmount < 0) return 'expense';
  if (signedAmount > 0) return 'income';
  return 'expense';
}

export function resolveImportCategory(type: EntryType, primaryRaw: string, secondaryRaw: string, categoryRaw: string) {
  const templates = type === 'income' ? defaultIncomeTemplates : defaultExpenseTemplates;
  const fallback = templates.find((template) => template.primary === (type === 'income' ? '其他收入' : '其他支出')) ?? templates[0];
  const split = categoryRaw
    .split(/[>＞\/\\｜|,，;；\-—]/)
    .map(cleanCategoryName)
    .filter(Boolean)
    .filter((item) => !['收入', '支出', '转账', '收支'].includes(item));
  // Legacy exports often use a broad primary category such as "其他收入".
  // Prefer the more specific secondary category before falling back to it.
  const primaryCandidate = cleanCategoryName(primaryRaw);
  const specificCandidates = [secondaryRaw, ...split]
    .map(cleanCategoryName)
    .filter((candidate) => Boolean(candidate) && candidate !== primaryCandidate);

  for (const candidate of specificCandidates) {
    const matched = findCategoryByAnyName(templates, candidate);
    if (matched) return { ...matched, matched: true };
  }

  const alias = findImportCategoryAlias(type, [...specificCandidates, primaryCandidate].filter(Boolean).join(' '));
  if (alias) return { ...alias, matched: true };

  if (primaryCandidate) {
    const matched = findCategoryByAnyName(templates, primaryCandidate);
    if (matched) return { ...matched, matched: true };
  }

  return {
    primary: fallback.primary,
    secondary: fallback.children[fallback.children.length - 1],
    matched: false,
  };
}

export function findImportCategoryAlias(type: EntryType, raw: string) {
  const normalized = normalizeHeader(raw);
  const aliases = type === 'income'
    ? [
        { words: ['工资收入', '薪资', '薪水', 'salary'], primary: '工资薪酬', secondary: '工资' },
        { words: ['兼职', '副业'], primary: '工资薪酬', secondary: '劳务报酬' },
        { words: ['劳务'], primary: '工资薪酬', secondary: '劳务报酬' },
        { words: ['年终奖'], primary: '奖金补贴', secondary: '年终奖' },
        { words: ['绩效', '奖金', '加班'], primary: '奖金补贴', secondary: '绩效奖金' },
        { words: ['津贴', '补助'], primary: '奖金补贴', secondary: '津贴补助' },
        { words: ['商品销售', '卖货'], primary: '经营收入', secondary: '商品销售' },
        { words: ['服务收入'], primary: '经营收入', secondary: '服务收入' },
        { words: ['经营', '经营所得', '生意', '回款'], primary: '经营收入', secondary: '经营回款' },
        { words: ['利息', '分红', '基金收益', '投资收益', '理财收益'], primary: '投资理财收入', secondary: '利息' },
        { words: ['红包'], primary: '红包礼金', secondary: '红包' },
        { words: ['礼金收入'], primary: '红包礼金', secondary: '婚礼礼金' },
        { words: ['生日礼金'], primary: '红包礼金', secondary: '生日礼金' },
        { words: ['婚礼礼金', '礼金'], primary: '红包礼金', secondary: '婚礼礼金' },
        { words: ['赠与'], primary: '红包礼金', secondary: '家庭赠与' },
        { words: ['生活费'], primary: '红包礼金', secondary: '生活费' },
        { words: ['消费退款'], primary: '退款赔偿', secondary: '消费退款' },
        { words: ['房租退款'], primary: '退款赔偿', secondary: '房租退款' },
        { words: ['退税'], primary: '退款赔偿', secondary: '个税退税' },
        { words: ['理赔'], primary: '退款赔偿', secondary: '保险理赔' },
        { words: ['赔偿'], primary: '退款赔偿', secondary: '赔偿金' },
        { words: ['闲鱼'], primary: '资产处置', secondary: '二手出售' },
        { words: ['二手'], primary: '资产处置', secondary: '二手出售' },
        { words: ['变现'], primary: '资产处置', secondary: '资产变现' },
        { words: ['他人还款'], primary: '借款回款', secondary: '借款收回' },
        { words: ['借款收回', '收回借款'], primary: '借款回款', secondary: '借款收回' },
        { words: ['麻将收入', '赌球收入', '信用卡还款', '意外来钱'], primary: '其他收入', secondary: '其他' },
        { words: ['股息'], primary: '投资理财收入', secondary: '分红' },
      ]
    : [
        { words: ['餐饮', '食品酒水', '吃喝', '美食', '食物', '早午晚餐'], primary: '餐饮食品', secondary: '正餐' },
        { words: ['烟酒', '茶'], primary: '餐饮食品', secondary: '烟酒茶' },
        { words: ['水果'], primary: '餐饮食品', secondary: '水果' },
        { words: ['零食'], primary: '餐饮食品', secondary: '零食' },
        { words: ['咖啡', '饮料', '甜品'], primary: '餐饮食品', secondary: '饮料咖啡' },
        { words: ['菜市场', '买菜'], primary: '餐饮食品', secondary: '买菜' },
        { words: ['公交', '地铁', '公共交通'], primary: '交通出行', secondary: '公交地铁' },
        { words: ['打车', '出租车', '网约车', '租车'], primary: '交通出行', secondary: '打车租车' },
        { words: ['高铁', '长途交通', '火车', '机票'], primary: '交通出行', secondary: '长途交通' },
        { words: ['加油', '油费'], primary: '交通出行', secondary: '油费' },
        { words: ['停车', '过路', '过路费'], primary: '交通出行', secondary: '停车过路' },
        { words: ['保养'], primary: '交通出行', secondary: '保养' },
        { words: ['车险', '车贷'], primary: '交通出行', secondary: '车险车贷' },
        { words: ['交通罚款'], primary: '交通出行', secondary: '罚款' },
        { words: ['交通', '出行'], primary: '交通出行', secondary: '公交地铁' },
        { words: ['住宿', '酒店'], primary: '旅行度假', secondary: '住宿' },
        { words: ['门票', '景点'], primary: '旅行度假', secondary: '景点门票' },
        { words: ['签证', '换汇'], primary: '旅行度假', secondary: '签证换汇' },
        { words: ['旅游', '旅行', '度假'], primary: '旅行度假', secondary: '旅游活动' },
        { words: ['旅游购物'], primary: '旅行度假', secondary: '购物' },
        { words: ['家具', '家电'], primary: '日用家居', secondary: '家具家电' },
        { words: ['清洁', '保洁'], primary: '日用家居', secondary: '保洁' },
        { words: ['维修保养', '家庭维修'], primary: '日用家居', secondary: '维修杂项' },
        { words: ['日常用品', '家居'], primary: '日用家居', secondary: '日常用品' },
        { words: ['手机', '电脑'], primary: '数码通讯', secondary: '手机电脑' },
        { words: ['数码装备', '数码配件'], primary: '数码通讯', secondary: '数码配件' },
        { words: ['数码'], primary: '数码通讯', secondary: '数码配件' },
        { words: ['会员', '软件'], primary: '数码通讯', secondary: '软件会员' },
        { words: ['话费', '手机费', '座机费'], primary: '数码通讯', secondary: '话费' },
        { words: ['宽带', '网络', '上网费'], primary: '数码通讯', secondary: '宽带网络' },
        { words: ['快递', '邮寄'], primary: '数码通讯', secondary: '快递邮寄' },
        { words: ['衣服', '服饰', '鞋帽', '衣服裤子'], primary: '服饰美容', secondary: '衣服鞋帽' },
        { words: ['箱包', '鞋帽包包'], primary: '服饰美容', secondary: '箱包' },
        { words: ['饰品', '化妆'], primary: '服饰美容', secondary: '饰品' },
        { words: ['理发', '美容'], primary: '服饰美容', secondary: '理发' },
        { words: ['护肤', '洗护'], primary: '服饰美容', secondary: '护肤洗护' },
        { words: ['药品', '药品费'], primary: '医疗健康', secondary: '药品' },
        { words: ['就医', '治疗', '医院', '治疗费'], primary: '医疗健康', secondary: '就医' },
        { words: ['体检', '保健', '保健费'], primary: '医疗健康', secondary: '体检保健' },
        { words: ['健身', '运动'], primary: '医疗健康', secondary: '运动健身' },
        { words: ['培训', '考试', '课程', '培训进修'], primary: '学习工作', secondary: '培训考试' },
        { words: ['书籍', '资料', '书报杂志'], primary: '学习工作', secondary: '书籍资料' },
        { words: ['办公'], primary: '学习工作', secondary: '办公用品' },
        { words: ['职业', '工作'], primary: '学习工作', secondary: '职业服务' },
        { words: ['ai', '人工智能'], primary: '学习工作', secondary: 'AI工具' },
        { words: ['游戏', '电子游戏'], primary: '娱乐休闲', secondary: '游戏' },
        { words: ['电影', '影视', '演出'], primary: '娱乐休闲', secondary: '影视演出' },
        { words: ['聚会', '腐败聚会'], primary: '娱乐休闲', secondary: '聚会娱乐' },
        { words: ['博彩', '彩票', '麻将'], primary: '娱乐休闲', secondary: '博彩彩票' },
        { words: ['娱乐', '休闲'], primary: '娱乐休闲', secondary: '玩乐' },
        { words: ['送礼请客'], primary: '人情社交', secondary: '请客' },
        { words: ['送礼', '孝敬家长'], primary: '人情社交', secondary: '送礼' },
        { words: ['红包随礼', '随礼'], primary: '人情社交', secondary: '红包随礼' },
        { words: ['请客', '送礼请客'], primary: '人情社交', secondary: '请客' },
        { words: ['慈善', '捐助'], primary: '人情社交', secondary: '慈善捐助' },
        { words: ['婚丧', '礼金'], primary: '人情社交', secondary: '婚丧礼金' },
        { words: ['宠物食品'], primary: '宠物', secondary: '食品' },
        { words: ['宠物用品'], primary: '宠物', secondary: '用品' },
        { words: ['宠物医疗'], primary: '宠物', secondary: '医疗' },
        { words: ['宠物', '宠物宝贝'], primary: '宠物', secondary: '服务' },
        { words: ['手续费', '银行手续'], primary: '财务税费', secondary: '银行手续费' },
        { words: ['保险'], primary: '财务税费', secondary: '保险' },
        { words: ['社保', '税费'], primary: '财务税费', secondary: '社保税费' },
        { words: ['罚金'], primary: '财务税费', secondary: '罚金' },
        { words: ['基金', '股票'], primary: '投资理财', secondary: '基金股票' },
        { words: ['理财'], primary: '投资理财', secondary: '理财产品' },
        { words: ['申购'], primary: '投资理财', secondary: '申购' },
        { words: ['投资亏损'], primary: '投资理财', secondary: '亏损' },
        { words: ['进货', '采购'], primary: '经营业务', secondary: '进货采购' },
        { words: ['经营设备'], primary: '经营业务', secondary: '设备' },
        { words: ['经营软件'], primary: '经营业务', secondary: '软件' },
        { words: ['经营办公'], primary: '经营业务', secondary: '办公' },
        { words: ['房租', '房租费', '租金', '租房', '房屋租金', '住房'], primary: '居住物业', secondary: '房租' },
        { words: ['水电', '水电费', '水费', '电费', '燃气', '燃气费', '天然气', '暖气费', '取暖费'], primary: '居住物业', secondary: '水电燃气' },
        { words: ['物业费', '物业管理', '物业管理费', '小区物业'], primary: '居住物业', secondary: '物业费' },
        { words: ['搬家', '搬家公司', '房屋中介', '房产中介', '中介费'], primary: '居住物业', secondary: '搬家中介' },
        { words: ['房屋维修', '家电维修', '管道疏通', '开锁', '防水补漏'], primary: '居住物业', secondary: '家庭维修' },
        { words: ['居家', '日用百货', '日用品', '生活用品'], primary: '日用家居', secondary: '日常用品' },
        { words: ['家政', '保洁服务', '家庭保洁'], primary: '日用家居', secondary: '保洁' },
        { words: ['购物', '网购', '电商'], primary: '日用家居', secondary: '日常用品' },
        { words: ['育儿', '母婴', '奶粉', '尿不湿', '儿童用品'], primary: '日用家居', secondary: '日常用品' },
        { words: ['通讯', '通讯费', '通信费', '手机话费', '话费充值'], primary: '数码通讯', secondary: '话费' },
        { words: ['宽带费', '网费', '网络费'], primary: '数码通讯', secondary: '宽带网络' },
        { words: ['快递费', '物流', '运费'], primary: '数码通讯', secondary: '快递邮寄' },
        { words: ['人情往来', '份子钱', '人情'], primary: '人情社交', secondary: '红包随礼' },
        { words: ['聚餐', '饭局', '招待'], primary: '人情社交', secondary: '请客' },
        { words: ['捐赠', '公益'], primary: '人情社交', secondary: '慈善捐助' },
        { words: ['学习', '教育培训', '学费', '培训班', '培训费'], primary: '学习工作', secondary: '培训考试' },
        { words: ['图书', '买书', '学习资料'], primary: '学习工作', secondary: '书籍资料' },
        { words: ['服装', '衣物'], primary: '服饰美容', secondary: '衣服鞋帽' },
        { words: ['美妆', '化妆品', '护肤品'], primary: '服饰美容', secondary: '护肤洗护' },
        { words: ['金融', '理财产品'], primary: '投资理财', secondary: '理财产品' },
        { words: ['银行手续费'], primary: '财务税费', secondary: '银行手续费' },
        { words: ['公积金', '个税', '纳税'], primary: '财务税费', secondary: '社保税费' },
        { words: ['保险费'], primary: '财务税费', secondary: '保险' },
        { words: ['宠物粮', '猫粮', '狗粮'], primary: '宠物', secondary: '食品' },
        { words: ['猫砂'], primary: '宠物', secondary: '用品' },
        { words: ['宠物医院', '宠物看病'], primary: '宠物', secondary: '医疗' },
        { words: ['宠物服务', '宠物寄养', '宠物美容'], primary: '宠物', secondary: '服务' },
        { words: ['医疗', '医疗健康', '看病', '门诊', '住院', '挂号费'], primary: '医疗健康', secondary: '就医' },
        { words: ['买药', '药费', '药店'], primary: '医疗健康', secondary: '药品' },
        { words: ['健身房', '运动健身'], primary: '医疗健康', secondary: '运动健身' },
        { words: ['保健品'], primary: '医疗健康', secondary: '体检保健' },
        { words: ['生活支出', '生活开销'], primary: '日用家居', secondary: '生活支出' },
      ];
  return aliases.find((item) => item.words.some((word) => normalized.includes(normalizeHeader(word)))) ?? null;
}

export function cleanCategoryName(value: string) {
  return value.replace(/\s+/g, '').replace(/^[-—>＞/\\｜|]+|[-—>＞/\\｜|]+$/g, '').trim();
}

export function findCategoryByAnyName(templates: CategoryTemplate[], value: string) {
  if (!value) return null;
  for (const template of templates) {
    if (template.primary === value) return { primary: template.primary, secondary: template.children[0] };
    const secondary = template.children.find((child) => child === value);
    if (secondary) return { primary: template.primary, secondary };
  }
  return null;
}

export function findPrimaryBySecondary(templates: CategoryTemplate[], secondary: string) {
  return templates.find((template) => template.children.includes(secondary))?.primary;
}

export function parseImportDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Math.round((value - 25569) * 86400 * 1000)).toISOString();
  }
  const raw = cellString(value);
  if (!raw) return null;
  const clean = raw
    .replace(/[年月]/g, '-')
    .replace(/[日]/g, '')
    .replace(/\//g, '-')
    .replace(/\./g, '-')
    .trim();
  const localMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (localMatch) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = localMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).toISOString();
  }
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function csvToObjects(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (rows[0]?.[0]?.toLowerCase().startsWith('sep=')) rows.shift();
  const headerIndex = findHeaderRow(rows);
  const headers = rows[headerIndex] ?? [];
  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

export function findHeaderRow(rows: string[][]) {
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 20).forEach((row, index) => {
    const joined = normalizeHeader(row.join('|'));
    const score = [
      '日期',
      '时间',
      '金额',
      '收入',
      '支出',
      '交易类型',
      '分类',
      '一级分类',
      '二级分类',
      '备注',
    ].reduce((sum, key) => sum + (joined.includes(normalizeHeader(key)) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

export function makeImportKey(index: number, record: ParsedImportRecord) {
  const source = [
    index,
    record.type,
    record.amount.toFixed(2),
    record.primary,
    record.secondary,
    record.note,
    record.date,
    record.account,
  ].join('\u241F');
  let hash = 2166136261;
  for (let offset = 0; offset < source.length; offset += 1) {
    hash ^= source.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(36)}`;
}

// 由 importTable 内联逻辑抽出（App.tsx 原 normalizeDupKey）：7 个业务列完全相同即视为重复。
// 归一化口径：金额 Number(x).toFixed(2)；note/account 的 NULL 统一按空串比较。
export function makeDedupKey(
  type: string,
  amount: number,
  primary: string,
  secondary: string,
  note: string | null,
  date: string,
  account: string | null,
): string {
  return [type, Number(amount).toFixed(2), primary, secondary, note ?? '', date, account ?? ''].join('\u241F');
}
