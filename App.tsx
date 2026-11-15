import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  AppState,
  BackHandler,
  Easing,
  FlatList,
  Modal,
  Pressable,
  PressableProps,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import * as XLSX from 'xlsx';

type Tab = 'flow' | 'report' | 'add' | 'mine';
type EntryType = 'expense' | 'income';
type Range = 'month' | 'year' | 'all';
type SubPage = 'categories' | 'import' | 'security' | 'records' | 'assets' | null;
type LockMode = 'immediate' | '5min';
type LedgerDrilldownFilter = {
  type: EntryType;
  range: Range;
  anchor: string;
  label: string;
  primary?: string;
  day?: string;
};
type IconName =
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

type LedgerRecord = {
  id: number;
  type: EntryType;
  amount: number;
  primary: string;
  secondary: string;
  note: string;
  date: string;
  account: string;
};

type DbCategory = {
  id: number;
  type: EntryType;
  primary: string;
  secondary: string;
  icon: string;
  sortOrder: number;
  isBuiltin: number;
};

type CategoryTemplate = {
  primary: string;
  icon: string;
  children: string[];
};

type ImportLog = {
  id: number;
  fileName: string;
  importedCount: number;
  skippedCount: number;
  createdAt: string;
  message: string;
};

type AppSettings = {
  startEntry: Tab;
  lockMode: LockMode;
  passcodeEnabled: boolean;
  biometricEnabled: boolean;
};

type Palette = {
  background: string;
  card: string;
  softCard: string;
  text: string;
  muted: string;
  primary: string;
  secondary: string;
  border: string;
  input: string;
  danger: string;
  nav: string;
  navActive: string;
  navText: string;
  // 置于品牌填充色（primary/secondary）之上的前景色，保证对比度
  onFill: string;
  // 分类图（环形图/图例）的分类色板，随主题亮暗调整
  chartExpense: string[];
  chartIncome: string[];
};

const DB_NAME = 'zhujian.db';
const PASSCODE_KEY = 'zhujian.passcode';
const DEFAULT_CATEGORIES_SEEDED_KEY = 'defaultCategoriesSeeded';
const MotionPreferencesContext = React.createContext(false);

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => subscription.remove();
  }, []);

  return reducedMotion;
}

function MotionPressable({
  style,
  disabled,
  motionScale = 0.97,
  android_ripple,
  ...props
}: PressableProps & { motionScale?: number }) {
  const reducedMotion = React.useContext(MotionPreferencesContext);

  return (
    <Pressable
      {...props}
      disabled={disabled}
      android_ripple={android_ripple ?? { color: 'rgba(107,138,111,0.14)', foreground: true }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && !disabled && { opacity: 0.86 },
        state.pressed && !disabled && !reducedMotion && { transform: [{ scale: motionScale }] },
      ]}
    />
  );
}

const light: Palette = {
  background: '#F7F3EB',
  card: '#FFFDF8',
  softCard: '#EFE8DE',
  text: '#171717',
  muted: '#60646C',
  primary: '#4F6B53',
  secondary: '#A8562F',
  border: '#DED8CE',
  input: '#F4EFE7',
  danger: '#B55B4D',
  nav: '#FFFDF8',
  navActive: '#EFE8DE',
  navText: '#4F4A43',
  onFill: '#FFFFFF',
  chartExpense: ['#6B8A6F', '#CD6F47', '#5A7B8C', '#9C8A4D', '#8A7B96', '#4F8A80', '#9C5F63', '#8B6E7E'],
  chartIncome: ['#CD6F47', '#D98A62', '#C2744E', '#E0A37E', '#A65C3E', '#C39C86', '#D7B092', '#8A5F43'],
};

const dark: Palette = {
  background: '#1D1E11',
  card: '#2A2E20',
  softCard: '#4C311F',
  text: '#F6F0E7',
  muted: '#A6A39A',
  primary: '#9DBFA3',
  secondary: '#E0895C',
  border: '#5A656F',
  input: '#2A2E20',
  danger: '#CE9F8C',
  nav: '#1D1E11',
  navActive: '#4C311F',
  navText: '#F6F0E7',
  onFill: '#17211A',
  chartExpense: ['#95AD98', '#D78B6B', '#8CA7B5', '#C1B281', '#A296AB', '#87BAB2', '#B88A8D', '#AC96A2'],
  chartIncome: ['#D78B6B', '#DA8E67', '#CF9173', '#DA9267', '#CC8E76', '#C09881', '#CC9B75', '#C19A80'],
};

const defaultExpenseTemplates: CategoryTemplate[] = [
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

const defaultIncomeTemplates: CategoryTemplate[] = [
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

const defaultSettings: AppSettings = {
  startEntry: 'flow',
  lockMode: '5min',
  passcodeEnabled: false,
  biometricEnabled: false,
};

export default function App() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? dark : light;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const reducedMotion = useReducedMotion();
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentOffset = useRef(new Animated.Value(0)).current;
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('flow');
  const [subPage, setSubPage] = useState<SubPage>(null);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerDrilldownFilter | null>(null);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [assetHidden, setAssetHidden] = useState(true);
  const [selectedType, setSelectedType] = useState<EntryType>('expense');
  const [selectedPrimary, setSelectedPrimary] = useState('');
  const [selectedSecondary, setSelectedSecondary] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [reportType, setReportType] = useState<EntryType>('expense');
  const [reportRange, setReportRange] = useState<Range>('month');
  const [statusText, setStatusText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const lastBackgroundAt = useRef<number | null>(null);
  const biometricAuthenticating = useRef(false);
  const biometricUnlockedAt = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      contentOpacity.setValue(1);
      contentOffset.setValue(0);
      return;
    }
    contentOpacity.setValue(0.72);
    contentOffset.setValue(8);
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentOffset, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOffset, contentOpacity, reducedMotion, subPage, tab]);

  const loadAll = useCallback(async (database: SQLite.SQLiteDatabase) => {
    const nextRecords = await fetchRecords(database);
    const nextCategories = await fetchCategories(database);
    const nextSettings = await fetchSettings(database);
    const nextLogs = await fetchImportLogs(database);
    setRecords(nextRecords);
    setCategories(nextCategories);
    setSettings(nextSettings);
    setImportLogs(nextLogs);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await initDatabase(database);
      await loadAll(database);
      const hardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      const nextSettings = await fetchSettings(database);
      if (!mounted) return;
      setBiometricAvailable(Boolean(hardware && enrolled));
      setDb(database);
      setTab(nextSettings.startEntry);
      setReady(true);
      if (nextSettings.passcodeEnabled || nextSettings.biometricEnabled) {
        setLocked(true);
      }
    }
    bootstrap().catch((error) => {
      setStatusText(`启动失败：${error instanceof Error ? error.message : String(error)}`);
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [loadAll]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        if (biometricAuthenticating.current) return;
        lastBackgroundAt.current = Date.now();
        return;
      }
      if (state === 'active' && (settings.passcodeEnabled || settings.biometricEnabled)) {
        if (biometricAuthenticating.current) return;
        if (biometricUnlockedAt.current && Date.now() - biometricUnlockedAt.current < 1500) return;
        const elapsed = Date.now() - (lastBackgroundAt.current ?? 0);
        if (settings.lockMode === 'immediate' || elapsed >= 5 * 60 * 1000) {
          setLocked(true);
        }
      }
    });
    return () => subscription.remove();
  }, [settings]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (locked) return true;
      if (subPage) {
        setSubPage(null);
        return true;
      }
      if (tab !== 'flow') {
        setTab('flow');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [locked, subPage, tab]);

  const expenseTemplates = useMemo(() => groupCategories(categories, 'expense'), [categories]);
  const incomeTemplates = useMemo(() => groupCategories(categories, 'income'), [categories]);
  const templates = selectedType === 'expense' ? expenseTemplates : incomeTemplates;

  useEffect(() => {
    if (!templates.length) return;
    const primaryExists = templates.some((template) => template.primary === selectedPrimary);
    const nextPrimary = primaryExists ? selectedPrimary : templates[0].primary;
    const nextTemplate = templates.find((template) => template.primary === nextPrimary) ?? templates[0];
    const secondaryExists = nextTemplate.children.includes(selectedSecondary);
    setSelectedPrimary(nextPrimary);
    setSelectedSecondary(secondaryExists ? selectedSecondary : nextTemplate.children[0] ?? '');
  }, [selectedPrimary, selectedSecondary, templates]);

  const monthRecords = useMemo(
    () => records.filter((record) => sameMonth(record.date, month)),
    [records, month],
  );
  const summary = useMemo(() => getSummary(monthRecords), [monthRecords]);

  const pushAmountKey = (key: string) => {
    if (key === 'C') {
      setAmountInput('');
      return;
    }
    if (key === '⌫') {
      setAmountInput((value) => value.slice(0, -1));
      return;
    }
    if (key === '.' && amountInput.includes('.')) return;
    if ((key === '+' || key === '-') && (!amountInput || ['+', '-', '.'].includes(amountInput.at(-1) ?? ''))) return;
    setAmountInput((value) => value + key);
  };

  const setEntryType = (type: EntryType) => {
    const nextTemplates = type === 'expense' ? expenseTemplates : incomeTemplates;
    const recent = getRecentCategories(records, nextTemplates, type)[0];
    setSelectedType(type);
    setSelectedPrimary(recent?.primary ?? nextTemplates[0]?.primary ?? '');
    setSelectedSecondary(recent?.secondary ?? nextTemplates[0]?.children[0] ?? '');
  };

  const startNewRecord = (type?: EntryType) => {
    setEditingRecordId(null);
    setAmountInput('');
    setNote('');
    setSelectedDate(new Date());
    if (type) {
      const nextTemplates = type === 'expense' ? expenseTemplates : incomeTemplates;
      const recent = getRecentCategories(records, nextTemplates, type)[0];
      setSelectedType(type);
      setSelectedPrimary(recent?.primary ?? nextTemplates[0]?.primary ?? '');
      setSelectedSecondary(recent?.secondary ?? nextTemplates[0]?.children[0] ?? '');
    }
  };

  const editRecord = (record: LedgerRecord) => {
    setEditingRecordId(record.id);
    setSelectedType(record.type);
    setSelectedPrimary(record.primary);
    setSelectedSecondary(record.secondary);
    setSelectedDate(new Date(record.date));
    setAmountInput(trimAmount(record.amount));
    setNote(record.note);
    setSubPage(null);
    setTab('add');
  };

  const saveRecord = async (again: boolean) => {
    if (!db || isSaving) return;
    const amount = evaluateAmount(amountInput);
    if (!amount || amount <= 0) {
      Alert.alert('金额无效', '请输入大于 0 的金额。');
      return;
    }
    const editingRecord = editingRecordId
      ? records.find((item) => item.id === editingRecordId)
      : null;
    const secondaryUntouchedInEdit = editingRecord
      ? selectedSecondary === editingRecord.secondary
      : false;
    if (!selectedSecondary && !secondaryUntouchedInEdit) {
      Alert.alert('缺少二级分类', '请选择二级分类。');
      return;
    }
    const date = new Date(selectedDate);
    const now = new Date().toISOString();
    setIsSaving(true);
    try {
      if (editingRecordId) {
        await db.runAsync(
          `UPDATE records
           SET type = ?, amount = ?, primary_name = ?, secondary_name = ?, note = ?, date = ?, updated_at = ?
           WHERE id = ?`,
          selectedType,
          amount,
          selectedPrimary,
          selectedSecondary,
          note.trim(),
          date.toISOString(),
          now,
          editingRecordId,
        );
      } else {
        await db.runAsync(
          `INSERT INTO records (type, amount, primary_name, secondary_name, note, date, account, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          selectedType,
          amount,
          selectedPrimary,
          selectedSecondary,
          note.trim(),
          date.toISOString(),
          '本地账户',
          now,
          now,
        );
      }
      await loadAll(db);
      const wasEditing = Boolean(editingRecordId);
      setEditingRecordId(null);
      setAmountInput('');
      setNote('');
      setStatusText(wasEditing ? '流水已更新。' : again ? '已保存，可继续记下一笔。' : '流水已保存。');
      if (!again) {
        setMonth(startOfMonth(new Date(date)));
        setTab('flow');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setStatusText(`保存失败：${message}`);
      Alert.alert('保存失败', message);
    } finally {
      setIsSaving(false);
    }
  };

  const removeRecord = async (recordId: number) => {
    if (!db) return;
    try {
      await db.runAsync('DELETE FROM records WHERE id = ?', recordId);
      await loadAll(db);
      setEditingRecordId(null);
      setAmountInput('');
      setNote('');
      setStatusText('流水已删除。');
      setTab('flow');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setStatusText(`删除失败：${message}`);
      Alert.alert('删除失败', message);
    }
  };

  const requestDeleteRecord = () => {
    if (!editingRecordId) return;
    Alert.alert('删除流水', '删除后无法恢复，确定继续吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { void removeRecord(editingRecordId); } },
    ]);
  };

  const updateSetting = async (key: keyof AppSettings, value: string | boolean) => {
    if (!db) return;
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      key,
      String(value),
      new Date().toISOString(),
    );
    await loadAll(db);
  };

  const enablePasscode = async (passcode: string) => {
    if (!/^\d{4}$/.test(passcode)) {
      Alert.alert('密码格式不正确', '请输入 4 位数字密码。');
      return;
    }
    await SecureStore.setItemAsync(PASSCODE_KEY, passcode);
    await updateSetting('passcodeEnabled', true);
    setStatusText('数字密码已开启。');
  };

  const disablePasscode = async () => {
    await SecureStore.deleteItemAsync(PASSCODE_KEY);
    await updateSetting('passcodeEnabled', false);
    setStatusText('数字密码已关闭。');
  };

  const unlockWithPasscode = async (passcode: string) => {
    const stored = await SecureStore.getItemAsync(PASSCODE_KEY);
    if (stored && stored === passcode) {
      setLocked(false);
      lastBackgroundAt.current = Date.now();
      return true;
    }
    return false;
  };

  const unlockWithBiometric = async () => {
    if (!settings.biometricEnabled) return false;
    biometricAuthenticating.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: '解锁竹简',
        cancelLabel: '取消',
        fallbackLabel: '使用密码',
      });
      if (result.success) {
        const now = Date.now();
        setLocked(false);
        lastBackgroundAt.current = now;
        biometricUnlockedAt.current = now;
        return true;
      }
      return false;
    } finally {
      biometricAuthenticating.current = false;
    }
  };

  const addPrimaryCategory = async (type: EntryType, name: string) => {
    if (!db) return;
    const clean = name.trim();
    if (!clean) return;
    const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM categories WHERE type = ? AND primary_name = ? AND is_deleted = 0 LIMIT 1', type, clean);
    if (existing) {
      Alert.alert('分类已存在', '请使用不同的一级分类名称。');
      return;
    }
    await ensureCategory(db, type, clean, '其他', categoryIcon(clean, type));
    await loadAll(db);
  };

  const addSecondaryCategory = async (type: EntryType, primary: string, secondary: string) => {
    if (!db) return;
    const clean = secondary.trim();
    if (!clean) return;
    await ensureCategory(db, type, primary, clean, categoryIcon(primary, type));
    await loadAll(db);
  };

  const renamePrimary = async (type: EntryType, oldName: string, nextName: string) => {
    if (!db) return;
    const clean = nextName.trim();
    if (!clean || oldName === clean) return;
    const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM categories WHERE type = ? AND primary_name = ? AND primary_name != ? AND is_deleted = 0 LIMIT 1', type, clean, oldName);
    if (existing) {
      Alert.alert('分类已存在', '不能与已有一级分类合并，请使用不同的名称。');
      return;
    }
    await db.withTransactionAsync(async () => {
      await suppressBuiltinPrimary(db, type, oldName);
      await db.runAsync('UPDATE categories SET primary_name = ?, is_builtin = 0, updated_at = ? WHERE type = ? AND primary_name = ?', clean, new Date().toISOString(), type, oldName);
      await db.runAsync('UPDATE records SET primary_name = ?, updated_at = ? WHERE type = ? AND primary_name = ?', clean, new Date().toISOString(), type, oldName);
    });
    await loadAll(db);
  };

  const renameSecondary = async (type: EntryType, primary: string, oldName: string, nextName: string) => {
    if (!db) return;
    const clean = nextName.trim();
    if (!clean || oldName === clean) return;
    const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM categories WHERE type = ? AND primary_name = ? AND secondary_name = ? AND secondary_name != ? AND is_deleted = 0 LIMIT 1', type, primary, clean, oldName);
    if (existing) {
      Alert.alert('分类已存在', '请使用不同的二级分类名称。');
      return;
    }
    await db.withTransactionAsync(async () => {
      await suppressBuiltinSecondary(db, type, primary, oldName);
      await db.runAsync(
        'UPDATE categories SET secondary_name = ?, is_builtin = 0, updated_at = ? WHERE type = ? AND primary_name = ? AND secondary_name = ?',
        clean,
        new Date().toISOString(),
        type,
        primary,
        oldName,
      );
      await db.runAsync(
        'UPDATE records SET secondary_name = ?, updated_at = ? WHERE type = ? AND primary_name = ? AND secondary_name = ?',
        clean,
        new Date().toISOString(),
        type,
        primary,
        oldName,
      );
    });
    await loadAll(db);
  };

  const deletePrimary = async (type: EntryType, primary: string) => {
    if (!db) return;
    const used = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM records WHERE type = ? AND primary_name = ?', type, primary);
    if ((used?.count ?? 0) > 0) {
      Alert.alert('不能删除', '这个一级分类已有流水记录。可以先改名，历史流水不会丢失。');
      return;
    }
    await db.withTransactionAsync(async () => {
      await suppressBuiltinPrimary(db, type, primary);
      await db.runAsync('UPDATE categories SET is_builtin = 0, is_deleted = 1, updated_at = ? WHERE type = ? AND primary_name = ?', new Date().toISOString(), type, primary);
    });
    await loadAll(db);
  };

  const deleteSecondary = async (type: EntryType, primary: string, secondary: string) => {
    if (!db) return;
    const used = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM records WHERE type = ? AND primary_name = ? AND secondary_name = ?',
      type,
      primary,
      secondary,
    );
    if ((used?.count ?? 0) > 0) {
      Alert.alert('不能删除', '这个二级分类已有流水记录。可以先改名，历史流水不会丢失。');
      return;
    }
    await db.withTransactionAsync(async () => {
      await suppressBuiltinSecondary(db, type, primary, secondary);
      await db.runAsync(
        'UPDATE categories SET is_builtin = 0, is_deleted = 1, updated_at = ? WHERE type = ? AND primary_name = ? AND secondary_name = ?',
        new Date().toISOString(),
        type,
        primary,
        secondary,
      );
    });
    await loadAll(db);
  };

  const moveSecondary = async (type: EntryType, primary: string, secondary: string, direction: -1 | 1) => {
    if (!db) return;
    const rows = await db.getAllAsync<DbCategoryRow>(
      'SELECT * FROM categories WHERE type = ? AND primary_name = ? AND is_deleted = 0 ORDER BY sort_order ASC, id ASC',
      type,
      primary,
    );
    const index = rows.findIndex((row) => row.secondary_name === secondary);
    const other = rows[index + direction];
    const current = rows[index];
    if (!current || !other) return;
    await db.runAsync('UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?', other.sort_order, new Date().toISOString(), current.id);
    await db.runAsync('UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?', current.sort_order, new Date().toISOString(), other.id);
    await loadAll(db);
  };

  const importTable = async () => {
    if (!db) return;
    try {
      setStatusText('正在打开系统文件选择器...');
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) {
        setStatusText('已取消选择。');
        return;
      }
      const asset = result.assets[0];
      setStatusText(`正在导入：${asset.name}`);
      const backupPath = await createCsvBackup(db);
      const parsed = await parsePickedTable(asset.uri, asset.name);
      let imported = 0;
      let invalid = 0;
      let duplicates = 0;
      const unmatched: string[] = [];
      await db.withTransactionAsync(async () => {
        // 内容查重（与 import_key/行序无关）：7 个业务列完全相同即视为重复。
        // 归一化：金额 Number(x).toFixed(2)（与导出口径一致）；库侧 note/secondary/account 的 NULL 统一按空串比较。
        const normalizeDupKey = (
          type: string,
          amount: number,
          primary: string,
          secondary: string,
          note: string | null,
          date: string,
          account: string | null,
        ) => [type, Number(amount).toFixed(2), primary, secondary, note ?? '', date, account ?? ''].join('\u241F');
        const existingKeys = new Set<string>();
        const existingRows = await db.getAllAsync<DbRecordRow>(
          'SELECT type, amount, primary_name, secondary_name, note, date, account FROM records',
        );
        for (const row of existingRows) {
          existingKeys.add(normalizeDupKey(row.type, row.amount, row.primary_name, row.secondary_name, row.note, row.date, row.account));
        }
        for (const [index, item] of parsed.entries()) {
          if (!item.amount || !item.date) {
            invalid += 1;
            continue;
          }
          const now = new Date().toISOString();
          const dupKey = normalizeDupKey(item.type, Math.abs(item.amount), item.primary, item.secondary, item.note, item.date, item.account || '本地账户');
          if (existingKeys.has(dupKey)) {
            duplicates += 1;
            continue;
          }
          const result = await db.runAsync(
            `INSERT OR IGNORE INTO records (type, amount, primary_name, secondary_name, note, date, account, import_key, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            item.type,
            Math.abs(item.amount),
            item.primary,
            item.secondary,
            item.note,
            item.date,
            item.account || '本地账户',
            makeImportKey(index, item),
            now,
            now,
          );
          if (result.changes > 0) {
            imported += 1;
            existingKeys.add(dupKey);
            if (item.categoryUnmatched) unmatched.push(item.categoryUnmatched);
          } else {
            duplicates += 1;
          }
        }
        await db.runAsync(
          'INSERT INTO import_logs (file_name, imported_count, skipped_count, created_at, message) VALUES (?, ?, ?, ?, ?)',
          asset.name,
          imported,
          invalid + duplicates,
          new Date().toISOString(),
          `备份：${backupPath}；重复 ${duplicates} 行；无效 ${invalid} 行`,
        );
      });
      await loadAll(db);
      const unmatchedNote = unmatched.length
        ? `；另 ${unmatched.length} 行分类未识别，已归入「其他支出/其他收入」：${unmatched.slice(0, 5).join('、')}${unmatched.length > 5 ? ' 等' : ''}`
        : '';
      setStatusText(`导入完成：${imported} 笔，重复 ${duplicates} 行，无效 ${invalid} 行${unmatchedNote}。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusText(`导入失败：${message}`);
    }
  };

  const exportCsv = async () => {
    if (!db) return;
    try {
      const csv = await exportRecordsCsv(db);
      const path = `${FileSystem.documentDirectory}zhujian-export-${formatFileDate(new Date())}.csv`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      setStatusText(`已导出 CSV：${path}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: '导出竹简 CSV' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusText(`导出失败：${message}`);
    }
  };

  const screen = () => {
    if (subPage === 'categories') {
      return (
        <CategoryManagerScreen
          styles={styles}
          categories={categories}
          onAddPrimary={addPrimaryCategory}
          onAddSecondary={addSecondaryCategory}
          onRenamePrimary={renamePrimary}
          onRenameSecondary={renameSecondary}
          onDeletePrimary={deletePrimary}
          onDeleteSecondary={deleteSecondary}
          onMoveSecondary={moveSecondary}
        />
      );
    }
    if (subPage === 'import') {
      return (
        <ImportExportScreen
          styles={styles}
          statusText={statusText}
          logs={importLogs}
          onImport={importTable}
          onExport={exportCsv}
        />
      );
    }
    if (subPage === 'security') {
      return (
        <SecurityScreen
          styles={styles}
          settings={settings}
          biometricAvailable={biometricAvailable}
          onLockMode={(value) => updateSetting('lockMode', value)}
          onEnablePasscode={enablePasscode}
          onDisablePasscode={disablePasscode}
          onToggleBiometric={() => updateSetting('biometricEnabled', !settings.biometricEnabled)}
        />
      );
    }
    if (subPage === 'records') {
      return (
        <LedgerScreen
          styles={styles}
          records={records}
          drilldownFilter={ledgerFilter}
          onClearDrilldown={() => setLedgerFilter(null)}
          onEditRecord={editRecord}
        />
      );
    }
    if (subPage === 'assets') {
      return (
        <AssetsScreen
          styles={styles}
          records={records}
          hidden={assetHidden}
          onToggle={() => setAssetHidden((value) => !value)}
        />
      );
    }
    switch (tab) {
      case 'flow':
        return (
          <FlowScreen
            palette={palette}
            styles={styles}
            month={month}
            monthRecords={monthRecords}
            summary={summary}
            statusText={statusText}
            onPrev={() => setMonth(addMonths(month, -1))}
            onNext={() => setMonth(addMonths(month, 1))}
            onCurrent={() => setMonth(startOfMonth(new Date()))}
            onEditRecord={editRecord}
            onOpenAll={() => {
              setLedgerFilter(null);
              setSubPage('records');
            }}
          />
        );
      case 'report':
        return (
          <ReportScreen
            palette={palette}
            styles={styles}
            month={month}
            records={records}
            reportType={reportType}
            reportRange={reportRange}
            onReportType={setReportType}
            onReportRange={setReportRange}
            onPrev={() => setMonth(addMonths(month, reportRange === 'year' ? -12 : -1))}
            onNext={() => setMonth(addMonths(month, reportRange === 'year' ? 12 : 1))}
            onOpenLedger={(filter) => {
              setLedgerFilter(filter);
              setTab('flow');
              setSubPage('records');
            }}
          />
        );
      case 'add':
        return (
          <AddScreen
            palette={palette}
            styles={styles}
            type={selectedType}
            templates={templates}
            records={records}
            amountInput={amountInput}
            selectedPrimary={selectedPrimary}
            selectedSecondary={selectedSecondary}
            selectedDate={selectedDate}
            note={note}
            editing={Boolean(editingRecordId)}
            saving={isSaving}
            statusText={statusText}
            onType={setEntryType}
            onCategoryShortcut={(primary, secondary) => {
              setSelectedPrimary(primary);
              setSelectedSecondary(secondary);
            }}
            onPrimary={(template) => {
              setSelectedPrimary(template.primary);
              setSelectedSecondary(template.children[0] ?? '');
            }}
            onSecondary={setSelectedSecondary}
            onDate={setSelectedDate}
            onNote={setNote}
            onKey={pushAmountKey}
            onSave={() => saveRecord(false)}
            onAgain={() => saveRecord(true)}
            onDelete={requestDeleteRecord}
          />
        );
      case 'mine':
        return (
          <MineScreen
            styles={styles}
            settings={settings}
            statusText={statusText}
            onStartEntry={(value) => updateSetting('startEntry', value)}
            onOpenCategories={() => setSubPage('categories')}
            onOpenImport={() => setSubPage('import')}
            onOpenSecurity={() => setSubPage('security')}
            onOpenLedger={() => setSubPage('assets')}
          />
        );
    }
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingScreen}>
          <Text style={styles.heroTitle}>竹简</Text>
          <Text style={styles.subtitle}>正在准备本地账本...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (locked) {
    return (
      <MotionPreferencesContext.Provider value={reducedMotion}>
        <LockScreen
          styles={styles}
          settings={settings}
          biometricAvailable={biometricAvailable}
          onUnlockPasscode={unlockWithPasscode}
          onUnlockBiometric={unlockWithBiometric}
        />
      </MotionPreferencesContext.Provider>
    );
  }

  return (
    <MotionPreferencesContext.Provider value={reducedMotion}>
      <SafeAreaView style={styles.safe}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <View style={styles.appShell}>
          <Animated.View style={[styles.content, { opacity: contentOpacity, transform: [{ translateY: contentOffset }] }]}>{screen()}</Animated.View>
          <BottomNav
            palette={palette}
            styles={styles}
            active={tab}
            onTab={(next) => {
              setSubPage(null);
              setLedgerFilter(null);
              if (next === 'add' && tab !== 'add' && !amountInput.trim() && !note.trim() && !editingRecordId) startNewRecord();
              setTab(next);
            }}
          />
        </View>
      </SafeAreaView>
    </MotionPreferencesContext.Provider>
  );
}

function FlowScreen({
  palette,
  styles,
  month,
  monthRecords,
  summary,
  statusText,
  onPrev,
  onNext,
  onCurrent,
  onEditRecord,
  onOpenAll,
}: {
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
  month: Date;
  monthRecords: LedgerRecord[];
  summary: ReturnType<typeof getSummary>;
  statusText: string;
  onPrev: () => void;
  onNext: () => void;
  onCurrent: () => void;
  onEditRecord: (record: LedgerRecord) => void;
  onOpenAll: () => void;
}) {
  const [query, setQuery] = useState('');
  const keyword = query.trim().toLowerCase();
  const matchedRecords = keyword
    ? monthRecords.filter((record) => [record.primary, record.secondary, record.note, record.date, record.account].join(' ').toLowerCase().includes(keyword))
    : monthRecords;
  const visibleRecords = keyword ? matchedRecords : matchedRecords.slice(0, 8);
  const scopedRecords = keyword ? matchedRecords : monthRecords;
  const scopedSummary = keyword ? getSummary(scopedRecords) : summary;
  const daily = groupByDay(scopedRecords.filter((record) => record.type === 'expense'));
  const categories = groupByCategory(scopedRecords.filter((record) => record.type === 'expense'));
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageBody}>
      <View style={styles.heroHeader}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.heroTitle} numberOfLines={1}>日常账本</Text>
          <Text style={styles.subtitle} numberOfLines={1}>本机账本</Text>
        </View>
        <MonthPills styles={styles} label={formatMonth(month)} onPrev={onPrev} onNext={onNext} onCurrent={onCurrent} />
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="搜索分类、备注或账户"
        placeholderTextColor={styles.placeholderColor.color}
        style={styles.ledgerSearch}
      />
      {statusText ? <Text style={styles.bodyText}>{statusText}</Text> : null}
      <SummaryPanel palette={palette} styles={styles} title="当月支出" summary={scopedSummary} count={scopedRecords.length} />
      <Card styles={styles}>
        <Text style={styles.sectionTitle}>周期概览</Text>
        <PeriodRow styles={styles} title="今天" records={scopedRecords.filter((record) => sameDay(record.date, new Date()))} />
        <PeriodRow styles={styles} title="本周" records={scopedRecords.filter((record) => sameWeek(record.date, new Date()))} />
      </Card>
      <Card styles={styles}>
        <Text style={styles.sectionTitle}>当月每日支出</Text>
        {daily.length ? <BarChart styles={styles} data={daily} /> : <Text style={styles.bodyText}>当月暂无支出。</Text>}
      </Card>
      <Card styles={styles}>
        <Text style={styles.sectionTitle}>支出分类</Text>
        {categories.length ? categories.map((item, index) => <CategoryRow key={item.label} styles={styles} item={item} index={index} colors={palette.chartExpense} />) : <Text style={styles.bodyText}>暂无分类统计。</Text>}
      </Card>
      <View style={styles.listTitleRow}>
        <Text style={styles.sectionTitle}>最近流水</Text>
        <MotionPressable accessibilityRole="button" accessibilityLabel="查看全部流水" hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} onPress={onOpenAll}><Text style={styles.linkText}>查看全部</Text></MotionPressable>
      </View>
      {visibleRecords.length
        ? visibleRecords.map((record) => <RecordRow key={record.id} styles={styles} record={record} onPress={() => onEditRecord(record)} />)
        : keyword
          ? <EmptyCard styles={styles} title="没有匹配的流水" body="换个关键词再试试。" />
          : <EmptyCard styles={styles} title="还没有流水" body="当月暂无流水。历史表格会按月份归档。" />}
    </ScrollView>
  );
}

function LedgerScreen({
  styles,
  records,
  drilldownFilter,
  onClearDrilldown,
  onEditRecord,
}: {
  styles: ReturnType<typeof createStyles>;
  records: LedgerRecord[];
  drilldownFilter: LedgerDrilldownFilter | null;
  onClearDrilldown: () => void;
  onEditRecord: (record: LedgerRecord) => void;
}) {
  const [type, setType] = useState<'all' | EntryType>('all');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return filterByDrilldown(records, drilldownFilter).filter((record) => {
      const activeType = drilldownFilter?.type ?? type;
      if (activeType !== 'all' && record.type !== activeType) return false;
      if (!keyword) return true;
      return [record.primary, record.secondary, record.note, record.date, record.account]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [drilldownFilter, query, records, type]);
  return (
    <View style={styles.page}>
      <View style={styles.ledgerHeader}>
        <Text style={styles.heroTitle}>{drilldownFilter ? '筛选流水' : '全部流水'}</Text>
        {drilldownFilter ? (
          <View style={styles.ledgerFilterRow}>
            <Text style={styles.ledgerFilterText} numberOfLines={1}>报表筛选：{drilldownFilter.label}</Text>
            <MotionPressable onPress={onClearDrilldown} accessibilityRole="button" accessibilityLabel="清除报表筛选">
              <Text style={styles.ledgerFilterClear}>清除</Text>
            </MotionPressable>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>共 {records.length} 笔，点击记录可修改或删除</Text>
            <PillGroup
              styles={styles}
              wide
              options={[['all', '全部'], ['expense', '支出'], ['income', '收入']]}
              value={type}
              onChange={(value) => setType(value as 'all' | EntryType)}
            />
          </>
        )}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索分类、备注或日期"
          placeholderTextColor={styles.placeholderColor.color}
          style={styles.ledgerSearch}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <RecordRow styles={styles} record={item} onPress={() => onEditRecord(item)} />}
        ItemSeparatorComponent={() => <View style={styles.ledgerSeparator} />}
        contentContainerStyle={styles.ledgerList}
        ListEmptyComponent={<EmptyCard styles={styles} title="没有匹配的流水" body="调整筛选条件或搜索关键词。" />}
      />
    </View>
  );
}

function ReportScreen({
  palette,
  styles,
  month,
  records,
  reportType,
  reportRange,
  onReportType,
  onReportRange,
  onPrev,
  onNext,
  onOpenLedger,
}: {
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
  month: Date;
  records: LedgerRecord[];
  reportType: EntryType;
  reportRange: Range;
  onReportType: (type: EntryType) => void;
  onReportRange: (range: Range) => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenLedger: (filter: LedgerDrilldownFilter) => void;
}) {
  const periodRecords = filterByRange(records, month, reportRange);
  const typedRecords = periodRecords.filter((record) => record.type === reportType);
  const summary = getSummary(periodRecords);
  const categories = groupByCategory(typedRecords);
  const bars = groupByTrend(typedRecords, month, reportRange);
  const label = reportType === 'expense' ? '支出' : '收入';
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageBody}>
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.heroTitle}>报表</Text>
          <Text style={styles.subtitle}>本机账本</Text>
        </View>
        <PillGroup
          styles={styles}
          options={[
            ['month', '月度'],
            ['year', '年度'],
            ['all', '全部'],
          ]}
          value={reportRange}
          onChange={(value) => onReportRange(value as Range)}
        />
      </View>
      <SummaryPanel
        palette={palette}
        styles={styles}
        title={`${rangeTitle(reportRange)}${label}`}
        summary={summary}
        count={typedRecords.length}
        focus={reportType}
      />
      <PillGroup
        styles={styles}
        wide
        options={[
          ['expense', '支出'],
          ['income', '收入'],
        ]}
        value={reportType}
        onChange={(value) => onReportType(value as EntryType)}
      />
      {reportRange !== 'all' ? <MonthSwitch styles={styles} label={reportRange === 'year' ? `${month.getFullYear()}年` : formatMonth(month)} onPrev={onPrev} onNext={onNext} /> : null}
      <Card styles={styles}>
        <Text style={styles.sectionTitle}>{trendTitle(reportRange, label)}</Text>
        {bars.length ? (
          <BarChart
            styles={styles}
            data={bars}
            color={reportType === 'income' ? palette.secondary : palette.primary}
            onPress={(item) => onOpenLedger(drilldownForTrend(item.label, reportType, reportRange, month))}
          />
        ) : <Text style={styles.bodyText}>暂无趋势数据。</Text>}
      </Card>
      <Card styles={styles}>
        <Text style={styles.sectionTitle}>{label}分类分析</Text>
        {categories.length ? (
          <CategoryAnalysis
            styles={styles}
            palette={palette}
            categories={categories}
            tone={reportType}
            onSelectCategory={(primary) => onOpenLedger({
              type: reportType,
              range: reportRange,
              anchor: month.toISOString(),
              primary,
              label: `${drilldownRangeLabel(month, reportRange)} · ${primary}`,
            })}
          />
        ) : <Text style={styles.bodyText}>暂无分类占比。</Text>}
      </Card>
    </ScrollView>
  );
}

function AddScreen({
  palette,
  styles,
  type,
  templates,
  records,
  amountInput,
  selectedPrimary,
  selectedSecondary,
  selectedDate,
  note,
  editing,
  saving,
  statusText,
  onType,
  onCategoryShortcut,
  onPrimary,
  onSecondary,
  onDate,
  onNote,
  onKey,
  onSave,
  onAgain,
  onDelete,
}: {
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
  type: EntryType;
  templates: CategoryTemplate[];
  records: LedgerRecord[];
  amountInput: string;
  selectedPrimary: string;
  selectedSecondary: string;
  selectedDate: Date;
  note: string;
  editing: boolean;
  saving: boolean;
  statusText: string;
  onType: (type: EntryType) => void;
  onCategoryShortcut: (primary: string, secondary: string) => void;
  onPrimary: (template: CategoryTemplate) => void;
  onSecondary: (secondary: string) => void;
  onDate: (date: Date) => void;
  onNote: (value: string) => void;
  onKey: (key: string) => void;
  onSave: () => void;
  onAgain: () => void;
  onDelete: () => void;
}) {
  const canSave = Boolean(evaluateAmount(amountInput));
  const amountRoundingHint = /\d\.\d{3,}/.test(amountInput);
  const activeTemplate = templates.find((template) => template.primary === selectedPrimary) ?? templates[0];
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(editing);
  const addScrollRef = useRef<ScrollView | null>(null);
  const pendingDetailsAutoScroll = useRef(false);
  const frequentTemplates = useMemo(() => getFrequentTemplates(records, templates, type, selectedPrimary), [records, selectedPrimary, templates, type]);
  const recentCategories = useMemo(() => getRecentCategories(records, templates, type), [records, templates, type]);
  const visibleTemplates = showAllCategories ? templates : frequentTemplates;
  return (
    <View style={styles.addScreen}>
      <ScrollView
        ref={addScrollRef}
        style={styles.page}
        contentContainerStyle={[styles.pageBody, styles.addPageBody]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!pendingDetailsAutoScroll.current) return;
          pendingDetailsAutoScroll.current = false;
          addScrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        <Text style={styles.heroTitle}>{editing ? '修改流水' : '记一笔'}</Text>
        {statusText ? <Text style={styles.bodyText}>{statusText}</Text> : null}
        <PillGroup
          styles={styles}
          wide
          options={[
            ['expense', '支出'],
            ['income', '收入'],
          ]}
          value={type}
          onChange={(value) => onType(value as EntryType)}
        />
        {recentCategories.length ? (
          <View style={styles.recentCategorySection}>
            <Text style={styles.sectionCaption}>最近用过</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentCategoryRail}>
              {recentCategories.map((item) => {
                const active = selectedPrimary === item.primary && selectedSecondary === item.secondary;
                return (
                  <MotionPressable
                    key={`${item.primary}/${item.secondary}`}
                    accessibilityRole="button"
                    accessibilityLabel={`选择${item.primary}，${item.secondary}`}
                    style={[
                      styles.recentCategoryChip,
                      active && (type === 'income' ? styles.recentCategoryChipIncomeActive : styles.recentCategoryChipExpenseActive),
                    ]}
                    onPress={() => onCategoryShortcut(item.primary, item.secondary)}
                  >
                    <Text style={[styles.recentCategoryPrimary, active && styles.recentCategoryTextActive]} numberOfLines={1}>{item.primary}</Text>
                    <Text style={[styles.recentCategorySecondary, active && styles.recentCategoryTextActive]} numberOfLines={1}>{item.secondary}</Text>
                  </MotionPressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        <View style={styles.categorySectionHeader}>
          <View style={styles.categorySectionHeading}>
            <Text style={styles.sectionCaption}>{showAllCategories ? '全部分类' : '常用分类'}</Text>
            {!showAllCategories && activeTemplate ? (
              <Text style={styles.selectedCategorySummary} numberOfLines={1}>
                {activeTemplate.primary} · {selectedSecondary}
              </Text>
            ) : null}
          </View>
          {templates.length > frequentTemplates.length ? (
            <MotionPressable accessibilityRole="button" accessibilityLabel={showAllCategories ? '收起全部分类' : '展开全部分类'} hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} onPress={() => setShowAllCategories((value) => !value)}>
              <Text style={styles.linkText}>{showAllCategories ? '收起' : '全部分类'}</Text>
            </MotionPressable>
          ) : null}
        </View>
        <View style={styles.categoryGrid}>
          {visibleTemplates.map((template) => (
            <MotionPressable key={template.primary} accessibilityRole="button" accessibilityLabel={`选择${template.primary}分类`} accessibilityState={{ selected: selectedPrimary === template.primary }} style={styles.categoryGridItem} onPress={() => onPrimary(template)}>
              <View
                style={[
                  styles.categoryCircle,
                  selectedPrimary === template.primary && (type === 'income' ? styles.categoryCircleActiveIncome : styles.categoryCircleActiveExpense),
                ]}
              >
                <AppIcon name={categoryIcon(template.primary, type)} color={selectedPrimary === template.primary ? (type === 'income' ? palette.secondary : palette.primary) : palette.navText} size={28} />
              </View>
              <Text numberOfLines={1} style={[styles.categoryLabel, selectedPrimary === template.primary && styles.categoryLabelActive]}>{template.primary}</Text>
            </MotionPressable>
          ))}
        </View>
        {activeTemplate ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.secondaryBox}>
            {activeTemplate.children.map((child) => (
              <MotionPressable
                key={child}
                accessibilityRole="button"
                accessibilityLabel={`选择${child}`}
                accessibilityState={{ selected: selectedSecondary === child }}
                hitSlop={{ top: 7, bottom: 7 }}
                style={[
                  styles.secondaryChip,
                  selectedSecondary === child && (type === 'income' ? styles.secondaryChipActiveIncome : styles.secondaryChipActive),
                ]}
                onPress={() => onSecondary(child)}
              >
                <Text style={[styles.secondaryText, selectedSecondary === child && styles.secondaryTextActive]}>{child}</Text>
              </MotionPressable>
            ))}
          </ScrollView>
        ) : null}
        <MotionPressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showMoreDetails }}
          style={styles.addMoreToggle}
          onPress={() => {
            const next = !showMoreDetails;
            if (next) pendingDetailsAutoScroll.current = true;
            setShowMoreDetails(next);
          }}
        >
          <View style={styles.addMoreCopy}>
            <Text style={styles.addMoreTitle}>备注与日期</Text>
            <Text style={styles.addMoreHint}>
              {sameDay(selectedDate, new Date()) ? '今天' : formatDate(selectedDate)} · 可选
            </Text>
          </View>
          <Text style={styles.addMoreAction}>{showMoreDetails ? '收起' : '添加'}</Text>
        </MotionPressable>
        {showMoreDetails ? (
          <View style={styles.addDetailsCard}>
            <TextInput
              value={note}
              onChangeText={onNote}
              placeholder="填写备注"
              placeholderTextColor={palette.muted}
              style={styles.noteInput}
            />
            <DateControls styles={styles} selectedDate={selectedDate} onDate={onDate} />
          </View>
        ) : null}
        {editing ? (
          <MotionPressable accessibilityRole="button" accessibilityLabel="删除当前流水" style={styles.dangerFullButton} onPress={onDelete}>
            <Text style={styles.dangerFullButtonText}>删除流水</Text>
          </MotionPressable>
        ) : null}
      </ScrollView>
      <View style={styles.addKeypadDock}>
        <Text style={[styles.amountLarge, type === 'income' && styles.amountIncome]}>¥ {amountInput || '0.00'}</Text>
        {amountRoundingHint ? <Text style={styles.subtitle}>实际记入 ¥ {trimAmount(evaluateAmount(amountInput))}</Text> : null}
        <Keypad styles={styles} type={type} canSave={canSave} saving={saving} onKey={onKey} onSave={onSave} onAgain={onAgain} />
      </View>
    </View>
  );
}

function AssetsScreen({
  styles,
  records,
  hidden,
  onToggle,
}: {
  styles: ReturnType<typeof createStyles>;
  records: LedgerRecord[];
  hidden: boolean;
  onToggle: () => void;
}) {
  const summary = getSummary(records);
  const top = groupByCategory(records.filter((record) => record.type === 'expense'))[0];
  const latest = records[0];
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageBody}>
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.heroTitle}>资产</Text>
          <Text style={styles.subtitle}>本地账户 · 全部流水统计</Text>
        </View>
        <MotionPressable accessibilityRole="button" accessibilityLabel={hidden ? '显示账户金额' : '隐藏账户金额'} style={styles.actionButton} onPress={onToggle}>
          <Text style={styles.actionButtonText}>{hidden ? '显示金额' : '隐藏金额'}</Text>
        </MotionPressable>
      </View>
      <View style={styles.assetCard}>
        <Text style={styles.assetTitle}>账户概览</Text>
        <Text style={styles.assetSub}>本地账户 · CNY</Text>
        <Text style={styles.assetBalance}>{hidden ? '****' : money(summary.income - summary.expense)}</Text>
        <View style={styles.assetGrid}>
          <AssetMetric styles={styles} label="收入" value={hidden ? '****' : money(summary.income)} />
          <AssetMetric styles={styles} label="支出" value={hidden ? '****' : money(summary.expense)} />
          <AssetMetric styles={styles} label="流水数" value={`${records.length} 笔`} />
          <AssetMetric styles={styles} label="最近记录" value={latest ? formatShortDate(latest.date) : '暂无'} />
          <AssetMetric styles={styles} label="最高支出分类" value={top ? `${top.label} · ${hidden ? '****' : money(top.amount)}` : '暂无'} full />
        </View>
      </View>
    </ScrollView>
  );
}

function MineScreen({
  styles,
  settings,
  statusText,
  onStartEntry,
  onOpenCategories,
  onOpenImport,
  onOpenSecurity,
  onOpenLedger,
}: {
  styles: ReturnType<typeof createStyles>;
  settings: AppSettings;
  statusText: string;
  onStartEntry: (tab: Tab) => void;
  onOpenCategories: () => void;
  onOpenImport: () => void;
  onOpenSecurity: () => void;
  onOpenLedger: () => void;
}) {
  const lockSummary = `数字密码${settings.passcodeEnabled ? '已开启' : '未开启'}，指纹锁${settings.biometricEnabled ? '已开启' : '未开启'}，${settings.lockMode === 'immediate' ? '每次进入验证' : '离开 5 分钟后验证'}。`;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageBody}>
      <Text style={styles.heroTitle}>我的</Text>
      <Text style={styles.subtitle}>本机数据、账本和隐私设置</Text>
      <SettingsGroup styles={styles} title="账本">
        <SettingsRow styles={styles} icon="ledger" title="本地账本" body="单账本离线模式，所有流水只保存在本机；点开查看资产统计。" action="打开" onPress={onOpenLedger} />
        <SettingsRow styles={styles} icon="tag" title="分类管理" body="自定义支出/收入的一级和二级分类模板。" action="打开" onPress={onOpenCategories} />
      </SettingsGroup>
      <SettingsGroup styles={styles} title="启动">
        <SettingsInfo styles={styles} icon="rocket" title="启动入口" body={`进入 App 后默认打开${settings.startEntry === 'add' ? '记一笔' : '主页'}。`} />
        <PillGroup
          styles={styles}
          wide
          options={[
            ['flow', '主页'],
            ['add', '记一笔'],
          ]}
          value={settings.startEntry}
          onChange={(value) => onStartEntry(value as Tab)}
        />
      </SettingsGroup>
      <SettingsGroup styles={styles} title="数据">
        <SettingsRow styles={styles} icon="download" title="数据导入" body="导入 CSV/XLSX、导出 CSV 和查看导入记录。" action="打开" onPress={onOpenImport} />
      </SettingsGroup>
      <SettingsGroup styles={styles} title="安全">
        <SettingsRow styles={styles} icon="lock" title="本地锁" body={lockSummary} action="设置" onPress={onOpenSecurity} />
      </SettingsGroup>
      <SettingsGroup styles={styles} title="关于">
        <SettingsInfo styles={styles} icon="privacy" title="离线隐私边界" body="本应用不申请联网权限，不上传流水数据。文件导入通过系统文件选择器完成。" />
        {statusText ? <Text style={styles.bodyText}>{statusText}</Text> : null}
      </SettingsGroup>
    </ScrollView>
  );
}

function SecurityScreen({
  styles,
  settings,
  biometricAvailable,
  onLockMode,
  onEnablePasscode,
  onDisablePasscode,
  onToggleBiometric,
}: {
  styles: ReturnType<typeof createStyles>;
  settings: AppSettings;
  biometricAvailable: boolean;
  onLockMode: (mode: LockMode) => void;
  onEnablePasscode: (passcode: string) => Promise<void>;
  onDisablePasscode: () => void;
  onToggleBiometric: () => void;
}) {
  const [passcode, setPasscode] = useState('');
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageBody}>
      <Text style={styles.heroTitle}>本地锁</Text>
      <Text style={styles.subtitle}>本地密码和系统指纹只用于进入 App 时验证</Text>
      <Card styles={styles}>
        <View style={styles.securityStatusGrid}>
          <SecurityStatus styles={styles} label="数字密码" value={settings.passcodeEnabled ? '已开启' : '未开启'} active={settings.passcodeEnabled} />
          <SecurityStatus styles={styles} label="指纹锁" value={settings.biometricEnabled ? '已开启' : '未开启'} active={settings.biometricEnabled} />
          <SecurityStatus styles={styles} label="验证时机" value={settings.lockMode === 'immediate' ? '每次进入' : '5 分钟后'} active />
        </View>
        <View style={styles.securityPasscodeRow}>
          <TextInput
            value={passcode}
            onChangeText={(value) => setPasscode(value.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            placeholder="4 位数字密码"
            placeholderTextColor={styles.placeholderColor.color}
            style={styles.securityInput}
          />
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel={settings.passcodeEnabled ? '更新数字密码' : '开启数字密码'}
            style={styles.securityPrimaryButton}
            onPress={async () => {
              await onEnablePasscode(passcode);
              if (/^\d{4}$/.test(passcode)) setPasscode('');
            }}
          >
            <Text style={styles.securityPrimaryText}>{settings.passcodeEnabled ? '更新' : '开启'}</Text>
          </MotionPressable>
        </View>
        <View style={styles.securityModeGroup}>
          {[
            ['5min', '5 分钟后'],
            ['immediate', '每次进入'],
          ].map(([value, label]) => (
            <MotionPressable key={value} accessibilityRole="button" accessibilityLabel={`${label}自动锁定`} accessibilityState={{ selected: settings.lockMode === value }} style={[styles.securityModeButton, settings.lockMode === value && styles.securityModeActive]} onPress={() => onLockMode(value as LockMode)}>
              <Text style={[styles.securityModeText, settings.lockMode === value && styles.securityModeTextActive]}>{label}</Text>
            </MotionPressable>
          ))}
        </View>
        <View style={styles.securityActions}>
          <MotionPressable accessibilityRole="button" accessibilityLabel={settings.biometricEnabled ? '关闭指纹锁' : '开启指纹锁'} disabled={!biometricAvailable} style={[styles.securityActionButton, !biometricAvailable && styles.keyDisabled]} onPress={onToggleBiometric}>
            <Text style={styles.securityActionText}>{settings.biometricEnabled ? '关闭指纹锁' : '开启指纹锁'}</Text>
          </MotionPressable>
          <MotionPressable accessibilityRole="button" accessibilityLabel="关闭数字锁" disabled={!settings.passcodeEnabled} style={[styles.securityActionButton, !settings.passcodeEnabled && styles.keyDisabled]} onPress={onDisablePasscode}>
            <Text style={[styles.securityActionText, settings.passcodeEnabled && styles.dangerText]}>关闭数字锁</Text>
          </MotionPressable>
        </View>
        {!biometricAvailable ? <Text style={styles.bodyText}>当前设备未检测到可用的系统生物识别。</Text> : null}
      </Card>
    </ScrollView>
  );
}

function CategoryManagerScreen({
  styles,
  categories,
  onAddPrimary,
  onAddSecondary,
  onRenamePrimary,
  onRenameSecondary,
  onDeletePrimary,
  onDeleteSecondary,
  onMoveSecondary,
}: {
  styles: ReturnType<typeof createStyles>;
  categories: DbCategory[];
  onAddPrimary: (type: EntryType, name: string) => void;
  onAddSecondary: (type: EntryType, primary: string, secondary: string) => void;
  onRenamePrimary: (type: EntryType, oldName: string, nextName: string) => void;
  onRenameSecondary: (type: EntryType, primary: string, oldName: string, nextName: string) => void;
  onDeletePrimary: (type: EntryType, primary: string) => void;
  onDeleteSecondary: (type: EntryType, primary: string, secondary: string) => void;
  onMoveSecondary: (type: EntryType, primary: string, secondary: string, direction: -1 | 1) => void;
}) {
  const [type, setType] = useState<EntryType>('expense');
  const templates = groupCategories(categories, type);
  const [selected, setSelected] = useState('');
  const [newPrimary, setNewPrimary] = useState('');
  const [newSecondary, setNewSecondary] = useState('');
  const [primaryName, setPrimaryName] = useState('');
  const [editingSecondary, setEditingSecondary] = useState('');
  const [secondaryName, setSecondaryName] = useState('');
  const active = templates.find((item) => item.primary === selected) ?? templates[0];

  useEffect(() => {
    if (!templates.length) return;
    if (!templates.some((template) => template.primary === selected)) {
      setSelected(templates[0].primary);
      setPrimaryName(templates[0].primary);
    }
  }, [selected, templates]);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageBody}>
      <Text style={styles.heroTitle}>分类管理</Text>
      <Text style={styles.subtitle}>自定义记一笔的一级和二级分类</Text>
      <PillGroup
        styles={styles}
        wide
        options={[
          ['expense', '支出'],
          ['income', '收入'],
        ]}
        value={type}
        onChange={(value) => {
          const nextType = value as EntryType;
          const nextTemplates = groupCategories(categories, nextType);
          setType(nextType);
          setSelected(nextTemplates[0]?.primary ?? '');
          setPrimaryName(nextTemplates[0]?.primary ?? '');
        }}
      />
      <Card styles={styles}>
        <Text style={styles.sectionTitle}>当前管理：{type === 'expense' ? '支出分类' : '收入分类'}</Text>
        <Text style={styles.bodyText}>历史流水引用的分类不会被误删；需要调整时可以改名。</Text>
      </Card>
      <View style={styles.inlineForm}>
        <TextInput value={newPrimary} onChangeText={setNewPrimary} placeholder="新建一级分类" placeholderTextColor={styles.placeholderColor.color} style={styles.inlineInput} />
        <MotionPressable accessibilityRole="button" accessibilityLabel="新增一级分类" style={styles.inlineButton} onPress={() => { onAddPrimary(type, newPrimary); setNewPrimary(''); }}>
          <Text style={styles.inlineButtonText}>新增</Text>
        </MotionPressable>
      </View>
      {templates.map((template) => (
        <View key={template.primary} style={[styles.manageCard, selected === template.primary && styles.manageCardActive]}>
          <MotionPressable accessibilityRole="button" accessibilityLabel={`选择${template.primary}`} accessibilityState={{ selected: selected === template.primary }} style={styles.manageHead} onPress={() => { setSelected(template.primary); setPrimaryName(template.primary); }}>
            <View style={styles.recordIcon}><AppIcon name={categoryIcon(template.primary, type)} color={type === 'income' ? styles.incomeText.color : styles.expenseText.color} size={22} /></View>
            <View style={styles.recordMain}>
              <Text style={styles.recordTitle}>{template.primary}</Text>
              <Text style={styles.recordSub}>{template.children.length} 个二级分类 · {template.children.slice(0, 3).join('、')}</Text>
            </View>
            <Text style={styles.linkText}>{selected === template.primary ? '已选' : '选择'}</Text>
          </MotionPressable>
          {selected === template.primary ? (
            <View style={styles.manageBody}>
              <View style={styles.inlineForm}>
                <TextInput value={primaryName} onChangeText={setPrimaryName} placeholder="一级分类名称" placeholderTextColor={styles.placeholderColor.color} style={styles.inlineInput} />
                <MotionPressable accessibilityRole="button" accessibilityLabel={`重命名一级分类${template.primary}`} style={styles.inlineButton} onPress={() => onRenamePrimary(type, template.primary, primaryName)}>
                  <Text style={styles.inlineButtonText}>改名</Text>
                </MotionPressable>
              </View>
              <View style={styles.inlineForm}>
                <TextInput value={newSecondary} onChangeText={setNewSecondary} placeholder="新建二级分类" placeholderTextColor={styles.placeholderColor.color} style={styles.inlineInput} />
                <MotionPressable accessibilityRole="button" accessibilityLabel={`为${template.primary}新增二级分类`} style={styles.inlineButton} onPress={() => { onAddSecondary(type, template.primary, newSecondary); setNewSecondary(''); }}>
                  <Text style={styles.inlineButtonText}>新增</Text>
                </MotionPressable>
              </View>
              <MotionPressable accessibilityRole="button" accessibilityLabel={`删除一级分类${template.primary}`} style={styles.outlineFullButton} onPress={() => onDeletePrimary(type, template.primary)}>
                <Text style={[styles.outlineFullButtonText, styles.dangerText]}>删除一级分类</Text>
              </MotionPressable>
              {active.children.map((child) => (
                <View key={child} style={styles.secondaryRow}>
                  {editingSecondary === child ? (
                    <TextInput value={secondaryName} onChangeText={setSecondaryName} style={styles.secondaryInput} />
                  ) : (
                    <Text style={styles.secondaryRowTitle}>{child}</Text>
                  )}
                  <Text accessibilityRole="button" accessibilityLabel={`上移${child}`} style={styles.secondaryRowAction} onPress={() => onMoveSecondary(type, template.primary, child, -1)}>↑</Text>
                  <Text accessibilityRole="button" accessibilityLabel={`下移${child}`} style={styles.secondaryRowAction} onPress={() => onMoveSecondary(type, template.primary, child, 1)}>↓</Text>
                  {editingSecondary === child ? (
                    <Text accessibilityRole="button" accessibilityLabel="保存名称修改" style={styles.secondaryRowAction} onPress={() => { onRenameSecondary(type, template.primary, child, secondaryName); setEditingSecondary(''); }}>存</Text>
                  ) : (
                    <Text accessibilityRole="button" accessibilityLabel={`重命名${child}`} style={styles.secondaryRowAction} onPress={() => { setEditingSecondary(child); setSecondaryName(child); }}>改</Text>
                  )}
                  <Text accessibilityRole="button" accessibilityLabel={`删除二级分类${child}`} style={[styles.secondaryRowAction, styles.dangerText]} onPress={() => onDeleteSecondary(type, template.primary, child)}>删</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function ImportExportScreen({
  styles,
  statusText,
  logs,
  onImport,
  onExport,
}: {
  styles: ReturnType<typeof createStyles>;
  statusText: string;
  logs: ImportLog[];
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageBody}>
      <Text style={styles.heroTitle}>数据</Text>
      <Text style={styles.subtitle}>离线表格导入、CSV 导出和本地备份</Text>
      <Card styles={styles}>
        <Text style={styles.sectionTitle}>导入离线表格</Text>
        <Text style={styles.bodyText}>支持 CSV 和 XLSX。使用 Android 系统文件选择器，不申请全盘文件权限。</Text>
        <Text style={styles.bodyText}>必要字段：日期、金额；交易类型、分类、备注可选。导入前会自动生成 CSV 备份，并跳过同一表格中的已导入行。</Text>
        <MotionPressable accessibilityRole="button" accessibilityLabel="选择表格文件" style={styles.fullButton} onPress={onImport}>
          <Text style={styles.fullButtonText}>选择表格</Text>
        </MotionPressable>
      </Card>
      <Card styles={styles}>
        <Text style={styles.sectionTitle}>导出 CSV</Text>
        <Text style={styles.bodyText}>导出全部本地流水，字段包含日期、交易类型、一级分类、二级分类、账户、金额、备注。</Text>
        <MotionPressable accessibilityRole="button" accessibilityLabel="导出全部流水" style={styles.outlineFullButton} onPress={onExport}>
          <Text style={styles.outlineFullButtonText}>导出全部流水</Text>
        </MotionPressable>
      </Card>
      <Card styles={styles}>
        <Text style={styles.sectionTitle}>导入记录</Text>
        {statusText ? <Text style={styles.bodyText}>{statusText}</Text> : null}
        {logs.length ? logs.map((log) => (
          <View key={log.id} style={styles.logRow}>
            <Text style={styles.recordTitle}>{log.fileName}</Text>
            <Text style={styles.recordSub}>{formatDateTime(log.createdAt)} · 导入 {log.importedCount} · 跳过 {log.skippedCount}</Text>
            <Text style={styles.recordSub}>{log.message}</Text>
          </View>
        )) : <Text style={styles.bodyText}>暂无导入记录。</Text>}
      </Card>
    </ScrollView>
  );
}

function LockScreen({
  styles,
  settings,
  biometricAvailable,
  onUnlockPasscode,
  onUnlockBiometric,
}: {
  styles: ReturnType<typeof createStyles>;
  settings: AppSettings;
  biometricAvailable: boolean;
  onUnlockPasscode: (passcode: string) => Promise<boolean>;
  onUnlockBiometric: () => Promise<boolean>;
}) {
  const [passcode, setPasscode] = useState('');
  const [message, setMessage] = useState('请输入密码解锁');
  const tryUnlock = async (nextValue: string) => {
    if (nextValue.length !== 4) return;
    const ok = await onUnlockPasscode(nextValue);
    if (!ok) {
      setMessage('密码不正确');
      setPasscode('');
    }
  };
  useEffect(() => {
    if (settings.biometricEnabled && biometricAvailable) {
      onUnlockBiometric();
    }
  }, [biometricAvailable, settings.biometricEnabled]);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.lockScreen}>
        <Text style={styles.heroTitle}>竹简</Text>
        <Text style={styles.subtitle}>{message}</Text>
        <View style={styles.passDots}>
          {[0, 1, 2, 3].map((index) => <View key={index} style={[styles.passDot, index < passcode.length && styles.passDotFilled]} />)}
        </View>
        <View style={styles.lockKeypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '指纹'].map((key) => (
            <MotionPressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={key === '⌫' ? '删除' : key === '指纹' ? '指纹解锁' : `数字 ${key}`}
              style={styles.lockKey}
              onPress={async () => {
                if (key === '⌫') {
                  setPasscode((value) => value.slice(0, -1));
                  return;
                }
                if (key === '指纹') {
                  if (!settings.biometricEnabled || !biometricAvailable) {
                    setMessage('当前未开启或不可用');
                    return;
                  }
                  const ok = await onUnlockBiometric();
                  if (!ok) setMessage('指纹验证未通过');
                  return;
                }
                const next = `${passcode}${key}`.slice(0, 4);
                setPasscode(next);
                tryUnlock(next);
              }}
            >
              <Text style={styles.keyText}>{key}</Text>
            </MotionPressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

function SummaryPanel({
  palette,
  styles,
  title,
  summary,
  count,
  focus = 'expense',
  expenseColor,
}: {
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
  title: string;
  summary: ReturnType<typeof getSummary>;
  count: number;
  focus?: EntryType;
  expenseColor?: string;
}) {
  const amount = focus === 'income' ? summary.income : summary.expense;
  const balance = summary.income - summary.expense;
  const total = Math.max(summary.income + summary.expense, 1);
  const effectiveExpenseColor = expenseColor ?? styles.expenseText.color;
  return (
    <View style={styles.summaryBlock}>
      <View style={styles.summaryTop}>
        <View>
          <Text style={styles.summaryLabel}>{title}</Text>
          <Text style={[styles.summaryAmount, { color: focus === 'income' ? styles.summaryAmountIncome.color : effectiveExpenseColor }]}>{money(amount)}</Text>
        </View>
        <View style={styles.summaryCount}>
          <Text style={styles.summaryCountLabel}>流水</Text>
          <Text style={styles.summaryCountValue}>{count} 笔</Text>
        </View>
      </View>
      <View style={styles.splitTrack}>
        <View style={[styles.splitIncome, { flex: Math.max(summary.income / total, 0.03), backgroundColor: palette.secondary }]} />
        <View style={[styles.splitExpense, { flex: Math.max(summary.expense / total, 0.03), backgroundColor: effectiveExpenseColor }]} />
      </View>
      <View style={styles.metricRow}>
        <MiniMetric styles={styles} label="收入" value={money(summary.income)} tone="income" />
        <MiniMetric styles={styles} label="支出" value={money(summary.expense)} tone="expense" color={effectiveExpenseColor} />
        <MiniMetric styles={styles} label="结余" value={money(balance)} tone={balance < 0 ? 'expense' : 'income'} color={balance < 0 ? effectiveExpenseColor : undefined} />
      </View>
    </View>
  );
}

function BottomNav({ palette, styles, active, onTab }: { palette: Palette; styles: ReturnType<typeof createStyles>; active: Tab; onTab: (tab: Tab) => void }) {
  const tabs: Array<[Tab, string]> = [
    ['add', '记一笔'],
    ['flow', '流水'],
    ['report', '报表'],
    ['mine', '我的'],
  ];
  return (
    <View style={styles.navBar}>
      {tabs.map(([key, label]) => (
        <MotionPressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={8}
          style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
          onPress={() => onTab(key)}
        >
          <View style={[styles.navIconWrap, active === key && styles.navIconActive]}>
            <TabGlyph palette={palette} tab={key} active={active === key} />
          </View>
          <Text style={[styles.navLabel, active === key && styles.navLabelActive]}>{label}</Text>
        </MotionPressable>
      ))}
    </View>
  );
}

function TabGlyph({ palette, tab, active }: { palette: Palette; tab: Tab; active: boolean }) {
  const color = active ? palette.primary : palette.navText;
  if (tab === 'flow') {
    return <AppIcon name="ledger" color={color} size={24} />;
  }
  const common = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {tab === 'report' ? (
        <>
          <Path {...common} d="M4 4.5v15h16" />
          <Line {...common} x1={9} y1={19.5} x2={9} y2={14} />
          <Line {...common} x1={13.5} y1={19.5} x2={13.5} y2={10} />
          <Line {...common} x1={18} y1={19.5} x2={18} y2={6} />
        </>
      ) : tab === 'add' ? (
        <>
          <Circle {...common} cx={12} cy={12} r={8.5} />
          <Line {...common} x1={12} y1={8} x2={12} y2={16} />
          <Line {...common} x1={8} y1={12} x2={16} y2={12} />
        </>
      ) : (
        <>
          <Circle {...common} cx={12} cy={8} r={3.5} />
          <Path {...common} d="M5.5 19.5c1-3.6 3.4-5.6 6.5-5.6s5.5 2 6.5 5.6" />
        </>
      )}
    </Svg>
  );
}

function AppIcon({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) {
  const common = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'food' ? (
        <>
          <Path {...common} d="M5 10h14" />
          <Path {...common} d="M7 10c0 5 2 8 5 8s5-3 5-8" />
          <Path {...common} d="M9 7V4" />
          <Path {...common} d="M12 7V3" />
          <Path {...common} d="M15 7V4" />
        </>
      ) : name === 'traffic' ? (
        <>
          <Path {...common} d="M5 15h14l-1.5-5h-11L5 15Z" />
          <Circle {...common} cx={8} cy={17} r={1.5} />
          <Circle {...common} cx={16} cy={17} r={1.5} />
          <Path {...common} d="M8 10l1.5-3h5L16 10" />
        </>
      ) : name === 'travel' ? (
        <>
          <Path {...common} d="M5 19h14" />
          <Path {...common} d="M7 19V8h10v11" />
          <Path {...common} d="M9 8V5h6v3" />
          <Path {...common} d="M9 12h6" />
          <Path {...common} d="M12 10v5" />
        </>
      ) : name === 'leisure' ? (
        <>
          <Rect {...common} x={4} y={9} width={16} height={8} rx={4} />
          <Line {...common} x1={8} y1={13} x2={11} y2={13} />
          <Line {...common} x1={9.5} y1={11.5} x2={9.5} y2={14.5} />
          <Circle {...common} cx={15.5} cy={12} r={0.5} />
          <Circle {...common} cx={17} cy={14} r={0.5} />
        </>
      ) : name === 'work' ? (
        <>
          <Path {...common} d="M6 5h9a3 3 0 0 1 3 3v11H9a3 3 0 0 0-3 2V5Z" />
          <Path {...common} d="M6 5a3 3 0 0 1 3-2h9v16" />
          <Line {...common} x1={10} y1={9} x2={15} y2={9} />
          <Line {...common} x1={10} y1={13} x2={15} y2={13} />
        </>
      ) : name === 'clothes' ? (
        <Path {...common} d="M8 4l4 2 4-2 4 4-3 3v8H7v-8L4 8l4-4Z" />
      ) : name === 'home' ? (
        <>
          <Path {...common} d="M4 11l8-7 8 7" />
          <Path {...common} d="M6.5 10.5V20h11v-9.5" />
          <Path {...common} d="M10 20v-5h4v5" />
        </>
      ) : name === 'household' ? (
        <>
          <Rect {...common} x={5} y={7} width={14} height={12} rx={2} />
          <Line {...common} x1={5} y1={12} x2={19} y2={12} />
          <Line {...common} x1={9} y1={12} x2={9} y2={19} />
          <Line {...common} x1={15} y1={12} x2={15} y2={19} />
        </>
      ) : name === 'phone' ? (
        <>
          <Rect {...common} x={7} y={3} width={10} height={18} rx={2.5} />
          <Line {...common} x1={10} y1={6} x2={14} y2={6} />
          <Circle {...common} cx={12} cy={17.5} r={0.5} />
        </>
      ) : name === 'child' ? (
        <>
          <Circle {...common} cx={12} cy={8} r={3} />
          <Path {...common} d="M6 19c1.2-3 3.2-5 6-5s4.8 2 6 5" />
          <Path {...common} d="M9 9c1 1 2 1.4 3 1.4S14 10 15 9" />
        </>
      ) : name === 'medical' ? (
        <>
          <Rect {...common} x={5} y={7} width={14} height={12} rx={2} />
          <Path {...common} d="M9 7V5h6v2" />
          <Line {...common} x1={12} y1={11} x2={12} y2={16} />
          <Line {...common} x1={9.5} y1={13.5} x2={14.5} y2={13.5} />
        </>
      ) : name === 'pet' ? (
        <>
          <Circle {...common} cx={8} cy={8} r={1.5} />
          <Circle {...common} cx={12} cy={6.5} r={1.5} />
          <Circle {...common} cx={16} cy={8} r={1.5} />
          <Path {...common} d="M7.5 15c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5c0 2-1.4 3.5-4.5 3.5S7.5 17 7.5 15Z" />
        </>
      ) : name === 'risk' ? (
        <>
          <Path {...common} d="M12 4l8 14H4L12 4Z" />
          <Line {...common} x1={12} y1={9} x2={12} y2={13} />
          <Circle {...common} cx={12} cy={16} r={0.5} />
        </>
      ) : name === 'finance' ? (
        <>
          <Rect {...common} x={4} y={6} width={16} height={13} rx={2} />
          <Line {...common} x1={4} y1={10} x2={20} y2={10} />
          <Line {...common} x1={8} y1={14} x2={12} y2={14} />
          <Line {...common} x1={8} y1={17} x2={15} y2={17} />
        </>
      ) : name === 'investment' ? (
        <>
          <Path {...common} d="M5 19V5" />
          <Path {...common} d="M5 19h14" />
          <Polyline {...common} points="7 15 10 11 13 13 18 7" />
          <Polyline {...common} points="15 7 18 7 18 10" />
        </>
      ) : name === 'business' ? (
        <>
          <Path {...common} d="M5 9h14l-1 10H6L5 9Z" />
          <Path {...common} d="M7 9l1-4h8l1 4" />
          <Line {...common} x1={9} y1={13} x2={15} y2={13} />
          <Line {...common} x1={12} y1={10} x2={12} y2={16} />
        </>
      ) : name === 'social' ? (
        <>
          <Circle {...common} cx={9} cy={8} r={2.5} />
          <Circle {...common} cx={16} cy={9} r={2} />
          <Path {...common} d="M4.5 18c.8-3 2.4-5 4.5-5s3.7 2 4.5 5" />
          <Path {...common} d="M13 17c.7-2 1.8-3.3 3.2-3.3S18.8 15 19.5 17" />
        </>
      ) : name === 'bank' ? (
        <>
          <Path {...common} d="M4 10h16" />
          <Path {...common} d="M5 10l7-5 7 5" />
          <Line {...common} x1={7} y1={10} x2={7} y2={18} />
          <Line {...common} x1={12} y1={10} x2={12} y2={18} />
          <Line {...common} x1={17} y1={10} x2={17} y2={18} />
          <Path {...common} d="M4 18h16" />
        </>
      ) : name === 'briefcase' ? (
        <>
          <Rect {...common} x={4} y={8} width={16} height={11} rx={2} />
          <Path {...common} d="M9 8V5h6v3" />
          <Path {...common} d="M4 12h16" />
        </>
      ) : name === 'gift' ? (
        <>
          <Rect {...common} x={4} y={9} width={16} height={11} rx={2} />
          <Path {...common} d="M4 13h16" />
          <Path {...common} d="M12 9v11" />
          <Path {...common} d="M9 9c-2 0-3-1-3-2.2C6 5.7 7 5 8 5c1.7 0 3 2 4 4" />
          <Path {...common} d="M15 9c2 0 3-1 3-2.2C18 5.7 17 5 16 5c-1.7 0-3 2-4 4" />
        </>
      ) : name === 'luck' ? (
        <>
          <Circle {...common} cx={12} cy={12} r={7} />
          <Path {...common} d="M8 12h8" />
          <Path {...common} d="M10 9h4l-2 6-2-6Z" />
        </>
      ) : name === 'refund' ? (
        <>
          <Circle {...common} cx={12} cy={12} r={7} />
          <Polyline {...common} points="10 8 6 12 10 16" />
          <Path {...common} d="M7 12h7a3 3 0 0 1 0 6" />
        </>
      ) : name === 'asset' ? (
        <>
          <Path {...common} d="M6 7h12v12H6z" />
          <Path {...common} d="M9 7V5h6v2" />
          <Circle {...common} cx={12} cy={13} r={2.5} />
          <Line {...common} x1={12} y1={11.5} x2={12} y2={14.5} />
        </>
      ) : name === 'loan' ? (
        <>
          <Path {...common} d="M4 12h12" />
          <Polyline {...common} points="12 8 16 12 12 16" />
          <Circle {...common} cx={18} cy={17} r={2} />
          <Line {...common} x1={18} y1={15} x2={18} y2={19} />
        </>
      ) : name === 'incomeMisc' ? (
        <>
          <Circle {...common} cx={12} cy={12} r={8} />
          <Path {...common} d="M12 7v5" />
          <Circle {...common} cx={12} cy={16} r={0.6} />
        </>
      ) : name === 'shop' ? (
        <>
          <Path {...common} d="M6 9h12l-1 11H7L6 9Z" />
          <Path {...common} d="M9 9a3 3 0 0 1 6 0" />
        </>
      ) : name === 'misc' ? (
        <>
          <Circle {...common} cx={7} cy={12} r={1} />
          <Circle {...common} cx={12} cy={12} r={1} />
          <Circle {...common} cx={17} cy={12} r={1} />
          <Circle {...common} cx={12} cy={12} r={8} />
        </>
      ) : name === 'coin' ? (
        <>
          <Circle {...common} cx={12} cy={12} r={7} />
          <Path {...common} d="M9 10h4a2 2 0 0 1 0 4H9" />
          <Line {...common} x1={11} y1={8} x2={11} y2={16} />
        </>
      ) : name === 'tag' ? (
        <>
          <Path {...common} d="M5 5h7l7 7-7 7-7-7V5Z" />
          <Circle {...common} cx={9} cy={9} r={1} />
        </>
      ) : name === 'ledger' ? (
        <>
          <Rect {...common} x={5} y={4} width={14} height={16} rx={2} />
          <Line {...common} x1={9} y1={4} x2={9} y2={20} />
          <Line {...common} x1={12} y1={9} x2={16} y2={9} />
          <Line {...common} x1={12} y1={13} x2={16} y2={13} />
        </>
      ) : name === 'download' ? (
        <>
          <Path {...common} d="M5 18h14" />
          <Path {...common} d="M12 4v10" />
          <Polyline {...common} points="8 11 12 15 16 11" />
          <Rect {...common} x={4} y={6} width={16} height={14} rx={2} />
        </>
      ) : name === 'lock' ? (
        <>
          <Rect {...common} x={5} y={10} width={14} height={10} rx={2} />
          <Path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      ) : name === 'privacy' ? (
        <>
          <Path {...common} d="M12 4l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V7l7-3Z" />
          <Path {...common} d="M9 12l2 2 4-5" />
        </>
      ) : (
        <>
          <Path {...common} d="M5 14l7-9 7 9" />
          <Path {...common} d="M8 14h8v6H8z" />
          <Path {...common} d="M12 14v6" />
        </>
      )}
    </Svg>
  );
}

function PillGroup({
  styles,
  options,
  value,
  onChange,
  wide = false,
}: {
  styles: ReturnType<typeof createStyles>;
  options: Array<[string, string]>;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <View style={[styles.pillGroup, wide && styles.pillGroupWide]}>
      {options.map(([key, label]) => (
        <MotionPressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: value === key }}
          onPress={() => onChange(key)}
          hitSlop={wide ? undefined : { top: 6, bottom: 6 }}
          style={[
            styles.pill,
            wide && styles.pillWide,
            value === key && styles.pillActive,
            value === key && key === 'expense' && styles.pillActiveExpense,
            value === key && key === 'income' && styles.pillActiveIncome,
          ]}
        >
          <Text style={[styles.pillText, value === key && styles.pillTextActive, value === key && (key === 'expense' || key === 'income') && styles.pillTextToneActive]}>{label}</Text>
        </MotionPressable>
      ))}
    </View>
  );
}

function MonthPills({ styles, label, onPrev, onNext, onCurrent }: { styles: ReturnType<typeof createStyles>; label: string; onPrev: () => void; onNext: () => void; onCurrent: () => void }) {
  return (
    <View style={styles.pillGroup}>
      <MotionPressable accessibilityRole="button" accessibilityLabel="切换到上个月" hitSlop={{ top: 6, bottom: 6 }} onPress={onPrev} style={styles.pill}><Text style={styles.pillText}>上月</Text></MotionPressable>
      <MotionPressable accessibilityRole="button" accessibilityLabel="回到本月" hitSlop={{ top: 6, bottom: 6 }} onPress={onCurrent} style={[styles.pill, styles.pillActive]}><Text style={styles.pillTextActive}>{label.slice(5)}</Text></MotionPressable>
      <MotionPressable accessibilityRole="button" accessibilityLabel="切换到下个月" hitSlop={{ top: 6, bottom: 6 }} onPress={onNext} style={styles.pill}><Text style={styles.pillText}>下月</Text></MotionPressable>
    </View>
  );
}

function MonthSwitch({ styles, label, onPrev, onNext }: { styles: ReturnType<typeof createStyles>; label: string; onPrev: () => void; onNext: () => void }) {
  return (
    <View style={styles.monthSwitch}>
      <MotionPressable accessibilityRole="button" accessibilityLabel="切换到上个月" onPress={onPrev} style={styles.monthButton}><Text style={styles.monthButtonText}>上月</Text></MotionPressable>
      <Text style={styles.monthCenter}>{label}</Text>
      <MotionPressable accessibilityRole="button" accessibilityLabel="切换到下个月" onPress={onNext} style={styles.monthButton}><Text style={styles.monthButtonText}>下月</Text></MotionPressable>
    </View>
  );
}

function DateControls({ styles, selectedDate, onDate }: { styles: ReturnType<typeof createStyles>; selectedDate: Date; onDate: (date: Date) => void }) {
  const [visible, setVisible] = useState(false);
  const reducedMotion = React.useContext(MotionPreferencesContext);
  const selectDate = (date: Date) => {
    onDate(date);
    setVisible(false);
  };
  const openSystemPicker = () => {
    DateTimePickerAndroid.open({
      value: selectedDate,
      mode: 'date',
      is24Hour: true,
      onChange: (event, value) => {
        if (event.type === 'set' && value) onDate(value);
      },
    });
  };
  const isToday = sameDay(selectedDate.toISOString(), new Date());
  return (
    <>
      <MotionPressable accessibilityRole="button" accessibilityLabel="调整记账日期" style={styles.dateEntry} onPress={() => setVisible(true)}>
        <View style={styles.dateEntryMain}>
          <Text style={styles.dateEntryLabel}>日期</Text>
          <Text style={styles.dateEntryValue}>{isToday ? `今天 · ${formatDate(selectedDate)}` : formatDate(selectedDate)}</Text>
        </View>
        <Text style={styles.dateEntryAction}>调整</Text>
      </MotionPressable>
      <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setVisible(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭日期选择" style={styles.dateSheetBackdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.dateSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.dateSheetHeader}>
              <Text style={styles.dateSheetTitle}>选择日期</Text>
              <MotionPressable accessibilityRole="button" accessibilityLabel="关闭日期选择" hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} onPress={() => setVisible(false)}><Text style={styles.dateSheetClose}>关闭</Text></MotionPressable>
            </View>
            <Text style={styles.dateSheetValue}>{formatDate(selectedDate)}</Text>
            <View style={styles.dateQuickGrid}>
              <MotionPressable style={styles.dateQuickButton} accessibilityRole="button" accessibilityLabel="日期回退一天" onPress={() => selectDate(addDays(selectedDate, -1))}><Text style={styles.dateQuickText}>昨天</Text></MotionPressable>
              <MotionPressable style={styles.dateQuickButton} accessibilityRole="button" accessibilityLabel="回到今天" onPress={() => selectDate(new Date())}><Text style={styles.dateQuickText}>今天</Text></MotionPressable>
              <MotionPressable style={styles.dateQuickButton} accessibilityRole="button" accessibilityLabel="日期前进一天" onPress={() => selectDate(addDays(selectedDate, 1))}><Text style={styles.dateQuickText}>明天</Text></MotionPressable>
              <MotionPressable style={styles.dateQuickButton} accessibilityRole="button" accessibilityLabel="日期回退一个月" onPress={() => selectDate(addMonths(selectedDate, -1))}><Text style={styles.dateQuickText}>-1月</Text></MotionPressable>
              <MotionPressable style={styles.dateQuickButton} accessibilityRole="button" accessibilityLabel="日期前进一个月" onPress={() => selectDate(addMonths(selectedDate, 1))}><Text style={styles.dateQuickText}>+1月</Text></MotionPressable>
              <MotionPressable style={styles.dateQuickButton} accessibilityRole="button" accessibilityLabel="日期回退一年" onPress={() => selectDate(addYears(selectedDate, -1))}><Text style={styles.dateQuickText}>-1年</Text></MotionPressable>
              <MotionPressable style={styles.dateQuickButton} accessibilityRole="button" accessibilityLabel="日期前进一年" onPress={() => selectDate(addYears(selectedDate, 1))}><Text style={styles.dateQuickText}>+1年</Text></MotionPressable>
            </View>
            <MotionPressable accessibilityRole="button" accessibilityLabel="打开系统日历" style={styles.dateCalendarButton} onPress={openSystemPicker}>
              <Text style={styles.dateCalendarButtonText}>打开系统日历</Text>
            </MotionPressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Keypad({
  styles,
  type,
  canSave,
  saving,
  onKey,
  onSave,
  onAgain,
}: {
  styles: ReturnType<typeof createStyles>;
  type: EntryType;
  canSave: boolean;
  saving: boolean;
  onKey: (key: string) => void;
  onSave: () => void;
  onAgain: () => void;
}) {
  const rows = [
    ['1', '2', '3', '⌫'],
    ['4', '5', '6', '+'],
    ['7', '8', '9', '-'],
    ['再记', '0', '.', '完成'],
  ];
  return (
    <View style={styles.keypad}>
      {rows.map((row) => (
        <View key={row.join('')} style={styles.keyRow}>
          {row.map((key) => {
            const action = key === '完成';
            const again = key === '再记';
            return (
              <MotionPressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={action ? '保存' : again ? '再记一笔' : key === '⌫' ? '删除' : key === '+' ? '加号' : key === '-' ? '减号' : key === '.' ? '小数点' : `数字 ${key}`}
                disabled={(action || again) && (!canSave || saving)}
                style={[styles.keyButton, action && (type === 'income' ? styles.keyPrimaryIncome : styles.keyPrimary), (action || again) && (!canSave || saving) && styles.keyDisabled]}
                onPress={action ? onSave : again ? onAgain : () => onKey(key)}
              >
                <Text style={[styles.keyText, action && styles.keyPrimaryText, (action || again) && (!canSave || saving) && styles.keyDisabledText]}>{action && saving ? '保存中' : key}</Text>
              </MotionPressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Card({ styles, children }: { styles: ReturnType<typeof createStyles>; children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function EmptyCard({ styles, title, body }: { styles: ReturnType<typeof createStyles>; title: string; body: string }) {
  return (
    <Card styles={styles}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.bodyText}>{body}</Text>
    </Card>
  );
}

function PeriodRow({ styles, title, records }: { styles: ReturnType<typeof createStyles>; title: string; records: LedgerRecord[] }) {
  const summary = getSummary(records);
  return (
    <View style={styles.periodRow}>
      <Text style={styles.periodTitle}>{title}</Text>
      <View style={styles.periodValues}>
        <View style={styles.periodAmountRow}>
          <Text style={styles.incomeText}>收入</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={[styles.incomeText, styles.periodAmountValue]}>{money(summary.income)}</Text>
        </View>
        <View style={styles.periodAmountRow}>
          <Text style={styles.expenseText}>支出</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={[styles.expenseText, styles.periodAmountValue]}>{money(summary.expense)}</Text>
        </View>
      </View>
    </View>
  );
}

function RecordRow({ styles, record, onPress }: { styles: ReturnType<typeof createStyles>; record: LedgerRecord; onPress?: () => void }) {
  return (
    <MotionPressable accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={onPress ? `编辑${record.secondary || record.primary}流水` : undefined} style={({ pressed }) => [styles.recordRow, onPress && pressed && styles.navItemPressed]} onPress={onPress}>
      <View style={styles.recordIcon}><AppIcon name={categoryIcon(record.primary, record.type)} color={record.type === 'income' ? styles.incomeText.color : styles.expenseText.color} size={22} /></View>
      <View style={styles.recordMain}>
        <Text style={styles.recordTitle}>{record.secondary || record.primary}</Text>
        <Text style={styles.recordSub}>{formatDateTime(record.date)}</Text>
        {record.note ? <Text style={styles.recordSub}>{record.primary} / {record.note}</Text> : null}
      </View>
      <Text style={record.type === 'income' ? styles.recordIncome : styles.recordExpense}>{record.type === 'income' ? '+' : '-'}{money(record.amount)}</Text>
    </MotionPressable>
  );
}

function BarChart({
  styles,
  data,
  color,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  data: Array<{ label: string; amount: number }>;
  color?: string;
  onPress?: (item: { label: string; amount: number }) => void;
}) {
  const max = Math.max(...data.map((item) => item.amount), 1);
  const chartWidth = Math.max(280, data.length * 34);
  return (
    <View>
      <View style={styles.chartHeader}>
        <Text style={styles.bodyText}>最高 {data.find((item) => item.amount === max)?.label}</Text>
        <Text style={styles.chartTotal}>合计 {money(data.reduce((sum, item) => sum + item.amount, 0))}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.barViewport}>
        <View style={[styles.barArea, { width: chartWidth }]}>
          {data.map((item) => (
            <MotionPressable
              key={item.label}
              accessibilityRole={onPress ? "button" : undefined}
              accessibilityLabel={onPress ? `查看${item.label}流水` : undefined}
              onPress={() => onPress?.(item)}
              hitSlop={onPress ? { top: 10, bottom: 10, left: 9, right: 9 } : undefined}
              style={({ pressed }) => [styles.barCol, onPress && styles.barColPressable, pressed && onPress && styles.barColPressed]}
            >
              {item.amount > 0 ? <Text numberOfLines={1} style={styles.barValue}>{shortMoney(item.amount)}</Text> : null}
              <View style={[styles.bar, { height: Math.max(item.amount > 0 ? 6 : 3, 104 * Math.sqrt(item.amount / max)), backgroundColor: color ?? styles.expenseText.color }]} />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.barLabel}>{item.label}</Text>
            </MotionPressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function CategoryAnalysis({
  styles,
  palette,
  categories,
  tone,
  onSelectCategory,
}: {
  styles: ReturnType<typeof createStyles>;
  palette: Palette;
  categories: Array<{ label: string; amount: number; count: number }>;
  tone: EntryType;
  onSelectCategory?: (primary: string) => void;
}) {
  const total = Math.max(categories.reduce((sum, item) => sum + item.amount, 0), 1);
  const colors = tone === 'income' ? palette.chartIncome : palette.chartExpense;
  return (
    <View style={styles.analysisWrap}>
      <DonutChart styles={styles} categories={categories} total={total} colors={colors} />
      <View style={styles.analysisList}>
        {categories.slice(0, 8).map((item, index) => (
          <CategoryRow key={item.label} styles={styles} item={item} total={total} index={index} colors={colors} onPress={() => onSelectCategory?.(item.label)} />
        ))}
      </View>
    </View>
  );
}

function DonutChart({ styles, categories, total, colors }: { styles: ReturnType<typeof createStyles>; categories: Array<{ label: string; amount: number; count: number }>; total: number; colors: string[] }) {
  const size = 168;
  const stroke = 24;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} stroke={styles.donutTrack.color} fill="none" />
        {categories.map((item, index) => {
          const length = Math.max(0.01, (item.amount / total) * circumference);
          const dashOffset = -offset;
          offset += length;
          return (
            <Circle
              key={item.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={colors[index % colors.length]}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              rotation="-90"
              origin={`${size / 2}, ${size / 2}`}
            />
          );
        })}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutLabel}>合计</Text>
        <Text style={styles.donutAmount}>{money(total)}</Text>
      </View>
    </View>
  );
}

function CategoryRow({
  styles,
  item,
  total,
  index = 0,
  colors,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  item: { label: string; amount: number; count: number };
  total?: number;
  index?: number;
  colors: string[];
  onPress?: () => void;
}) {
  const color = colors[index % colors.length];
  const percent = total ? Math.round((item.amount / total) * 100) : 0;
  return (
    <MotionPressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `查看${item.label}流水` : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.categoryStatRow, onPress && styles.categoryStatRowPressable, pressed && onPress && styles.categoryStatRowPressed]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.categoryStatMain}>
        <Text style={styles.categoryStatName}>{item.label}</Text>
        <Text style={styles.categoryStatSub}>{item.count} 笔{total ? ` · ${percent}%` : ''}</Text>
        {total ? <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(percent, 2)}%`, backgroundColor: color }]} /></View> : null}
      </View>
      <Text style={styles.categoryAmount}>{money(item.amount)}</Text>
    </MotionPressable>
  );
}

function MiniMetric({ styles, label, value, tone, color }: { styles: ReturnType<typeof createStyles>; label: string; value: string; tone: 'income' | 'expense'; color?: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={[tone === 'income' ? styles.incomeText : styles.expenseText, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function AssetMetric({ styles, label, value, full = false }: { styles: ReturnType<typeof createStyles>; label: string; value: string; full?: boolean }) {
  return (
    <View style={[styles.assetMetric, full && styles.assetMetricFull]}>
      <Text style={styles.assetMetricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.assetMetricValue}>{value}</Text>
    </View>
  );
}

function SettingsGroup({ styles, title, children }: { styles: ReturnType<typeof createStyles>; title: string; children: React.ReactNode }) {
  return (
    <Card styles={styles}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </Card>
  );
}

function SecurityStatus({ styles, label, value, active }: { styles: ReturnType<typeof createStyles>; label: string; value: string; active: boolean }) {
  return (
    <View style={styles.securityStatusCard}>
      <Text style={styles.securityStatusLabel}>{label}</Text>
      <Text style={[styles.securityStatusValue, active && styles.securityStatusActive]}>{value}</Text>
    </View>
  );
}

function SettingsInfo({ styles, icon, title, body }: { styles: ReturnType<typeof createStyles>; icon: IconName; title: string; body: string }) {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsIcon}><AppIcon name={icon} color={styles.expenseText.color} size={22} /></View>
      <View style={styles.settingsMain}>
        <Text style={styles.settingsTitle}>{title}</Text>
        <Text style={styles.bodyText}>{body}</Text>
      </View>
    </View>
  );
}

function SettingsRow({ styles, icon, title, body, action, onPress }: { styles: ReturnType<typeof createStyles>; icon: IconName; title: string; body: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsIcon}><AppIcon name={icon} color={styles.expenseText.color} size={22} /></View>
      <View style={styles.settingsMain}>
        <Text style={styles.settingsTitle}>{title}</Text>
        <Text style={styles.bodyText}>{body}</Text>
      </View>
      <MotionPressable accessibilityRole="button" accessibilityLabel={`${action}${title}`} style={styles.smallButton} onPress={onPress}><Text style={styles.smallButtonText}>{action}</Text></MotionPressable>
    </View>
  );
}

type DbCategoryRow = {
  id: number;
  type: string;
  primary_name: string;
  secondary_name: string;
  icon: string;
  sort_order: number;
  is_builtin: number;
};

type DbRecordRow = {
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

async function initDatabase(db: SQLite.SQLiteDatabase) {
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

async function migrateCategoryNamesV1(db: SQLite.SQLiteDatabase) {
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

async function ensureDefaultCategories(db: SQLite.SQLiteDatabase) {
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

async function preserveLegacyCustomizedBuiltins(db: SQLite.SQLiteDatabase) {
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

async function reconcileBuiltinCategories(db: SQLite.SQLiteDatabase) {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE categories SET is_deleted = 1, updated_at = ? WHERE is_builtin = 1', now);
  await upsertBuiltinTemplates(db, 'expense', defaultExpenseTemplates);
  await upsertBuiltinTemplates(db, 'income', defaultIncomeTemplates);
}

async function upsertBuiltinTemplates(db: SQLite.SQLiteDatabase, type: EntryType, templates: CategoryTemplate[]) {
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

async function ensureRecordImportKeyColumn(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(records)');
  if (!columns.some((column) => column.name === 'import_key')) {
    await db.execAsync('ALTER TABLE records ADD COLUMN import_key TEXT');
  }
}

async function suppressBuiltinPrimary(db: SQLite.SQLiteDatabase, type: EntryType, primary: string) {
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

async function suppressBuiltinSecondary(db: SQLite.SQLiteDatabase, type: EntryType, primary: string, secondary: string) {
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

async function fetchRecords(db: SQLite.SQLiteDatabase): Promise<LedgerRecord[]> {
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

async function fetchCategories(db: SQLite.SQLiteDatabase): Promise<DbCategory[]> {
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

async function fetchSettings(db: SQLite.SQLiteDatabase): Promise<AppSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const raw = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    startEntry: raw.startEntry === 'add' ? 'add' : 'flow',
    lockMode: raw.lockMode === 'immediate' ? 'immediate' : '5min',
    passcodeEnabled: raw.passcodeEnabled === 'true',
    biometricEnabled: raw.biometricEnabled === 'true',
  };
}

async function fetchImportLogs(db: SQLite.SQLiteDatabase): Promise<ImportLog[]> {
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

async function nextCategoryOrder(db: SQLite.SQLiteDatabase, type: EntryType, primary: string) {
  const row = await db.getFirstAsync<{ max_order: number | null }>(
    'SELECT MAX(sort_order) AS max_order FROM categories WHERE type = ? AND primary_name = ?',
    type,
    primary,
  );
  return (row?.max_order ?? 0) + 1;
}

async function ensureCategory(db: SQLite.SQLiteDatabase, type: EntryType, primary: string, secondary: string, icon: string) {
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

function groupCategories(categories: DbCategory[], type: EntryType): CategoryTemplate[] {
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

type ParsedImportRecord = {
  type: EntryType;
  amount: number;
  primary: string;
  secondary: string;
  note: string;
  date: string;
  account: string;
  categoryUnmatched?: string;
};

function makeImportKey(index: number, record: ParsedImportRecord) {
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

async function parsePickedTable(uri: string, name: string): Promise<ParsedImportRecord[]> {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const workbook = XLSX.read(base64, { type: 'base64', cellDates: true });
    const rows = workbook.SheetNames.flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils
        .sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
        .map((row) => ({ ...row, 工作表: sheetName }));
    });
    return rows.map(mapImportObject);
  }
  const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  return csvToObjects(text).map(mapImportObject);
}

function mapImportObject(row: Record<string, unknown>): ParsedImportRecord {
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

function pickValue(map: Map<string, unknown>, keys: string[]) {
  return pickField(map, keys).value;
}

function pickField(map: Map<string, unknown>, keys: string[]) {
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

function hasImportValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function normalizeHeader(value: string) {
  return value.replace(/[\s_\-—:：/\\｜|,，.。()（）\[\]【】]/g, '').toLowerCase();
}

function cellString(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '').trim();
}

function parseAmount(value: string) {
  const clean = value.replace(/[¥￥,\s+]/g, '').replace(/^\((.*)\)$/, '-$1');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferImportType({
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

function resolveImportCategory(type: EntryType, primaryRaw: string, secondaryRaw: string, categoryRaw: string) {
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

function findImportCategoryAlias(type: EntryType, raw: string) {
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

function cleanCategoryName(value: string) {
  return value.replace(/\s+/g, '').replace(/^[-—>＞/\\｜|]+|[-—>＞/\\｜|]+$/g, '').trim();
}

function findCategoryByAnyName(templates: CategoryTemplate[], value: string) {
  if (!value) return null;
  for (const template of templates) {
    if (template.primary === value) return { primary: template.primary, secondary: template.children[0] };
    const secondary = template.children.find((child) => child === value);
    if (secondary) return { primary: template.primary, secondary };
  }
  return null;
}

function findPrimaryBySecondary(templates: CategoryTemplate[], secondary: string) {
  return templates.find((template) => template.children.includes(secondary))?.primary;
}

function parseImportDate(value: unknown) {
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

function csvToObjects(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (rows[0]?.[0]?.toLowerCase().startsWith('sep=')) rows.shift();
  const headerIndex = findHeaderRow(rows);
  const headers = rows[headerIndex] ?? [];
  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function findHeaderRow(rows: string[][]) {
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

function parseCsv(text: string) {
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

async function createCsvBackup(db: SQLite.SQLiteDatabase) {
  const dir = `${FileSystem.documentDirectory}backups/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const path = `${dir}backup-before-import-${formatFileDate(new Date())}.csv`;
  const csv = await exportRecordsCsv(db);
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}

async function exportRecordsCsv(db: SQLite.SQLiteDatabase) {
  const records = await fetchRecords(db);
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

function csvEscape(value: string | number) {
  const raw = String(value ?? '');
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

// 设计 token：集中管理 createStyles 可安全收敛的样式常量（仅做差 ≤2 的取值归一，几何约束值保留字面量）。
const RADIUS = {
  sm: 8, // 小控件圆角：按钮、输入框、胶囊组
  md: 10, // 中圆角：筛选条、图标底、次级按钮
  lg: 12, // 卡片圆角
  xl: 20, // 大圆角：弹层与大面积容器
  full: 9999, // 圆形/胶囊（半径取元素高度一半的等价写法）
} as const;

const FONT = {
  xs: 12, // 辅助说明与徽标文字
  sm: 14, // 次要正文与标签
  md: 16, // 正文
  lg: 20, // 区块标题
  xl: 22, // 弹层与页面大标题
  xxl: 32, // 特大标题数字
  display: 36, // 大号数值（资产余额、记一笔金额）
  huge: 42, // 特大金额（当月支出）
} as const;

const SPACE = {
  xxs: 4, // 微间距：图标与文字间隙、紧凑内距
  xs: 8, // 控件内间距
  sm: 12, // 卡片内边距与相邻组件间距
  md: 16, // 页面级水平边距
  lg: 20, // 弹层内边距
  xl: 24, // 页面上下留白
  xxl: 28, // 大区块间距与留白
  pageTop: 36, // 页面顶部留白（避开状态栏）
} as const;

function createStyles(p: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: p.background },
    appShell: { flex: 1, backgroundColor: p.background },
    content: { flex: 1 },
    loadingScreen: { flex: 1, justifyContent: 'center', padding: SPACE.xl, gap: SPACE.sm },
    page: { flex: 1 },
    pageBody: { paddingHorizontal: SPACE.md, paddingTop: SPACE.pageTop, paddingBottom: SPACE.xl, gap: SPACE.md },
    addScreen: { flex: 1, backgroundColor: p.background },
    addPageBody: { paddingTop: SPACE.xl, paddingBottom: SPACE.md, gap: SPACE.xs },
    ledgerHeader: { paddingHorizontal: SPACE.md, paddingTop: SPACE.pageTop, paddingBottom: SPACE.sm, gap: SPACE.sm },
    ledgerFilterRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, backgroundColor: p.softCard, borderRadius: RADIUS.md, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.sm },
    ledgerFilterText: { flex: 1, color: p.text, fontSize: FONT.sm, fontWeight: '600' },
    ledgerFilterClear: { color: p.primary, fontSize: FONT.sm, fontWeight: '700' },
    ledgerSearch: { height: 46, backgroundColor: p.card, borderWidth: 1, borderColor: p.border, borderRadius: RADIUS.md, paddingHorizontal: SPACE.sm, color: p.text, fontSize: FONT.md },
    ledgerList: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.xxl },
    ledgerSeparator: { height: 10 },
    heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm },
    heroTitle: { color: p.text, fontSize: FONT.xxl, fontWeight: '700', letterSpacing: -0.5 },
    subtitle: { color: p.muted, fontSize: FONT.md, marginTop: SPACE.xxs },
    card: { backgroundColor: p.card, borderRadius: RADIUS.lg, padding: SPACE.md, gap: SPACE.sm, borderWidth: 1, borderColor: p.border },
    sectionTitle: { color: p.text, fontSize: FONT.lg, fontWeight: '700', letterSpacing: -0.2 },
    bodyText: { color: p.text, fontSize: FONT.md, lineHeight: 25 },
    placeholderColor: { color: p.muted },
    summaryBlock: { gap: SPACE.md },
    summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    summaryLabel: { color: p.muted, fontSize: FONT.md, fontWeight: '600' },
    summaryAmount: { fontSize: FONT.huge, fontWeight: '700', marginTop: SPACE.xs, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    summaryAmountIncome: { color: p.secondary },
    summaryCount: { alignItems: 'flex-end' },
    summaryCountLabel: { color: p.muted, fontWeight: '700' },
    summaryCountValue: { color: p.text, fontSize: FONT.lg, fontWeight: '700', marginTop: SPACE.xxs, fontVariant: ['tabular-nums'] },
    splitTrack: { height: 8, borderRadius: RADIUS.sm, overflow: 'hidden', flexDirection: 'row', backgroundColor: p.softCard, gap: SPACE.xxs },
    splitIncome: { borderRadius: RADIUS.sm },
    splitExpense: { borderRadius: RADIUS.sm },
    metricRow: { flexDirection: 'row', gap: SPACE.xs },
    miniMetric: { flex: 1, backgroundColor: p.background, borderRadius: RADIUS.sm, padding: SPACE.sm, gap: SPACE.xxs },
    metricLabel: { color: p.muted, fontSize: FONT.sm, fontWeight: '600' },
    incomeText: { color: p.secondary, fontSize: FONT.md, fontWeight: '600', fontVariant: ['tabular-nums'] },
    expenseText: { color: p.primary, fontSize: FONT.md, fontWeight: '600', fontVariant: ['tabular-nums'] },
    pillGroup: { flexDirection: 'row', backgroundColor: p.card, borderRadius: RADIUS.lg, padding: SPACE.xxs, gap: SPACE.xxs, borderWidth: 1, borderColor: p.border },
    pillGroupWide: { width: '100%' },
    pill: { paddingVertical: SPACE.xs, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.sm },
    pillWide: { flex: 1, alignItems: 'center', paddingVertical: SPACE.sm },
    pillActive: { backgroundColor: p.background },
    pillActiveExpense: { backgroundColor: p.primary },
    pillActiveIncome: { backgroundColor: p.secondary },
    pillText: { color: p.muted, fontSize: FONT.md, fontWeight: '600' },
    pillTextActive: { color: p.text, fontSize: FONT.md, fontWeight: '700' },
    pillTextToneActive: { color: p.onFill },
    periodRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.xs },
    periodTitle: { flex: 1, color: p.text, fontSize: FONT.lg, fontWeight: '700' },
    periodValues: { width: '50%', gap: SPACE.xxs },
    periodAmountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.xs },
    periodAmountValue: { flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.sm },
    chartTotal: { color: p.text, fontSize: FONT.sm, fontWeight: '700', fontVariant: ['tabular-nums'] },
    barViewport: { marginHorizontal: -SPACE.xxs },
    barArea: { height: 172, flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.xs, paddingTop: SPACE.xl, paddingHorizontal: SPACE.xxs, borderBottomWidth: 1, borderBottomColor: p.border },
    barCol: { flex: 1, minWidth: 26, alignItems: 'center', gap: SPACE.xxs },
    barColPressable: { borderRadius: RADIUS.sm },
    barColPressed: { opacity: 0.62 },
    bar: { width: 16, borderRadius: RADIUS.sm, backgroundColor: p.primary },
    barValue: { color: p.text, fontSize: FONT.xs, fontWeight: '700', fontVariant: ['tabular-nums'] },
    barLabel: { color: p.muted, fontSize: FONT.xs },
    categoryStatRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.xs },
    categoryStatRowPressable: { borderRadius: RADIUS.sm },
    categoryStatRowPressed: { opacity: 0.62 },
    dot: { width: 9, height: 9, borderRadius: RADIUS.md },
    categoryStatMain: { flex: 1, gap: SPACE.xxs },
    categoryStatName: { color: p.text, fontSize: FONT.md, fontWeight: '700' },
    categoryStatSub: { color: p.muted, fontSize: FONT.sm },
    categoryAmount: { color: p.text, fontSize: FONT.sm, fontWeight: '700', fontVariant: ['tabular-nums'] },
    progressTrack: { height: 5, borderRadius: RADIUS.full, backgroundColor: p.border, overflow: 'hidden' },
    progressFill: { height: 5, borderRadius: RADIUS.full },
    listTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    linkText: { color: p.primary, fontSize: FONT.md, fontWeight: '700' },
    recordRow: { backgroundColor: p.card, borderRadius: RADIUS.lg, padding: SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: 1, borderColor: p.border },
    recordIcon: { width: 42, height: 42, borderRadius: RADIUS.full, backgroundColor: p.background, alignItems: 'center', justifyContent: 'center' },
    recordMain: { flex: 1, gap: SPACE.xxs },
    recordTitle: { color: p.text, fontSize: FONT.md, fontWeight: '700' },
    recordSub: { color: p.muted, fontSize: FONT.sm },
    recordIncome: { color: p.secondary, fontWeight: '700', fontSize: FONT.md, fontVariant: ['tabular-nums'] },
    recordExpense: { color: p.primary, fontWeight: '700', fontSize: FONT.md, fontVariant: ['tabular-nums'] },
    monthSwitch: { flexDirection: 'row', gap: SPACE.xs, alignItems: 'center' },
    monthButton: { flex: 1, height: 44, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center', backgroundColor: p.card },
    monthButtonText: { color: p.text, fontWeight: '600', fontSize: FONT.md },
    monthCenter: { flex: 1.2, color: p.text, fontWeight: '700', fontSize: FONT.md, textAlign: 'center' },
    analysisWrap: { gap: SPACE.md },
    donutWrap: { alignSelf: 'center', width: 168, height: 168, alignItems: 'center', justifyContent: 'center' },
    donutTrack: { color: p.border },
    donutCenter: { position: 'absolute', width: 104, height: 104, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', backgroundColor: p.card },
    donutLabel: { color: p.muted, fontSize: FONT.sm },
    donutAmount: { color: p.text, fontWeight: '700', fontSize: FONT.md, fontVariant: ['tabular-nums'] },
    analysisList: { gap: SPACE.xxs },
    categorySectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SPACE.xxs },
    categorySectionHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
    selectedCategorySummary: { flexShrink: 1, color: p.text, fontSize: FONT.xs, fontWeight: '600' },
    recentCategorySection: { gap: SPACE.xs, paddingTop: SPACE.xxs },
    recentCategoryRail: { gap: SPACE.xs, paddingRight: SPACE.md },
    recentCategoryChip: { minWidth: 88, maxWidth: 142, borderRadius: RADIUS.md, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs, gap: SPACE.xxs, backgroundColor: p.card, borderWidth: 1, borderColor: p.border },
    recentCategoryChipExpenseActive: { backgroundColor: p.primary, borderColor: p.primary },
    recentCategoryChipIncomeActive: { backgroundColor: p.secondary, borderColor: p.secondary },
    recentCategoryPrimary: { color: p.text, fontSize: FONT.xs, fontWeight: '600' },
    recentCategorySecondary: { color: p.muted, fontSize: FONT.sm, fontWeight: '700' },
    recentCategoryTextActive: { color: p.onFill },
    sectionCaption: { color: p.muted, fontSize: FONT.sm, fontWeight: '700' },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: SPACE.sm, paddingVertical: 1 },
    categoryGridItem: { width: '25%', alignItems: 'center', gap: SPACE.xxs },
    categoryCircle: { width: 48, height: 48, borderRadius: RADIUS.lg, backgroundColor: p.card, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center' },
    categoryCircleActiveExpense: { borderWidth: 2, borderColor: p.primary, backgroundColor: p.card },
    categoryCircleActiveIncome: { borderWidth: 2, borderColor: p.secondary, backgroundColor: p.card },
    categoryLabel: { color: p.text, fontWeight: '600', fontSize: FONT.sm, textAlign: 'center' },
    categoryLabelActive: { fontWeight: '700' },
    secondaryBox: { flexDirection: 'row', gap: SPACE.xs, backgroundColor: p.background, borderRadius: RADIUS.lg, padding: SPACE.xs },
    secondaryChip: { borderWidth: 1, borderColor: p.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs },
    secondaryChipActive: { backgroundColor: p.primary, borderColor: p.primary },
    secondaryChipActiveIncome: { backgroundColor: p.secondary, borderColor: p.secondary },
    secondaryText: { color: p.text, fontWeight: '700' },
    secondaryTextActive: { color: p.onFill },
    dateEntry: { minHeight: 42, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: p.border, backgroundColor: p.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dateEntryMain: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
    dateEntryLabel: { color: p.muted, fontSize: FONT.sm, fontWeight: '700' },
    dateEntryValue: { color: p.text, fontSize: FONT.sm, fontWeight: '700' },
    dateEntryAction: { color: p.primary, fontSize: FONT.sm, fontWeight: '700' },
    dateSheetBackdrop: { flex: 1, backgroundColor: 'rgba(20,20,20,0.34)', justifyContent: 'flex-end' },
    dateSheet: { backgroundColor: p.card, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg, paddingBottom: SPACE.xxl, gap: SPACE.md },
    dateSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dateSheetTitle: { color: p.text, fontSize: FONT.xl, fontWeight: '700' },
    dateSheetClose: { color: p.primary, fontSize: FONT.md, fontWeight: '700' },
    dateSheetValue: { color: p.text, fontSize: FONT.md, fontWeight: '700' },
    dateQuickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs },
    dateQuickButton: { width: '30%', height: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: p.border, backgroundColor: p.background, alignItems: 'center', justifyContent: 'center' },
    dateQuickText: { color: p.text, fontSize: FONT.sm, fontWeight: '700' },
    dateCalendarButton: { height: 48, borderRadius: RADIUS.md, backgroundColor: p.primary, alignItems: 'center', justifyContent: 'center' },
    dateCalendarButtonText: { color: p.onFill, fontSize: FONT.md, fontWeight: '700' },
    addDetailsCard: { backgroundColor: p.card, borderRadius: RADIUS.lg, padding: SPACE.sm, gap: SPACE.xs, borderWidth: 1, borderColor: p.border },
    addMoreToggle: { minHeight: 46, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs, borderRadius: RADIUS.md, backgroundColor: p.card, borderWidth: 1, borderColor: p.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    addMoreCopy: { gap: SPACE.xxs },
    addMoreTitle: { color: p.text, fontSize: FONT.sm, fontWeight: '700' },
    addMoreHint: { color: p.muted, fontSize: FONT.xs },
    addMoreAction: { color: p.primary, fontSize: FONT.sm, fontWeight: '700' },
    addKeypadDock: { backgroundColor: p.background, borderTopWidth: 1, borderTopColor: p.border, paddingHorizontal: SPACE.md, paddingTop: SPACE.xs, paddingBottom: SPACE.xs, gap: SPACE.xs },
    amountLarge: { color: p.primary, fontSize: FONT.display, fontWeight: '700', letterSpacing: -0.4 },
    amountIncome: { color: p.secondary },
    noteInput: { backgroundColor: p.input, borderWidth: 1, borderColor: p.border, borderRadius: RADIUS.sm, minHeight: 42, paddingHorizontal: SPACE.sm, color: p.text, fontSize: FONT.md },
    keypad: { gap: SPACE.xs },
    keyRow: { flexDirection: 'row', gap: SPACE.xs },
    keyButton: { flex: 1, height: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center', backgroundColor: p.card },
    keyPrimary: { backgroundColor: p.primary, borderColor: p.primary },
    keyPrimaryIncome: { backgroundColor: p.secondary, borderColor: p.secondary },
    keyDisabled: { backgroundColor: p.border, opacity: 0.45 },
    keyText: { color: p.text, fontWeight: '700', fontSize: FONT.xl },
    keyPrimaryText: { color: p.onFill },
    keyDisabledText: { color: p.muted },
    assetCard: { backgroundColor: p.primary, borderRadius: RADIUS.lg, padding: SPACE.md, gap: SPACE.md },
    assetTitle: { color: p.onFill, fontSize: FONT.xl, fontWeight: '700' },
    assetSub: { color: p.onFill, opacity: 0.85, fontSize: FONT.md },
    assetBalance: { color: p.onFill, fontSize: FONT.display, fontWeight: '700', marginVertical: SPACE.xs, fontVariant: ['tabular-nums'] },
    assetGrid: { backgroundColor: `${p.onFill}24`, borderRadius: RADIUS.lg, padding: SPACE.md, flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
    assetMetric: { width: '47%', gap: SPACE.xxs },
    assetMetricFull: { width: '100%' },
    assetMetricLabel: { color: p.onFill, opacity: 0.9, fontSize: FONT.sm },
    assetMetricValue: { color: p.onFill, fontSize: FONT.md, fontWeight: '700', fontVariant: ['tabular-nums'] },
    actionButton: { backgroundColor: p.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
    actionButtonText: { color: p.onFill, fontWeight: '700', fontSize: FONT.sm },
    settingsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.sm },
    settingsIcon: { width: 42, height: 42, borderRadius: RADIUS.lg, backgroundColor: p.card, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center' },
    settingsMain: { flex: 1, gap: SPACE.xxs },
    settingsTitle: { color: p.text, fontSize: FONT.md, fontWeight: '700' },
    securityStatusGrid: { flexDirection: 'row', gap: SPACE.xs },
    securityStatusCard: { flex: 1, borderRadius: RADIUS.md, backgroundColor: p.background, padding: SPACE.sm, gap: SPACE.xxs },
    securityStatusLabel: { color: p.muted, fontSize: FONT.xs, fontWeight: '700' },
    securityStatusValue: { color: p.text, fontSize: FONT.sm, fontWeight: '700' },
    securityStatusActive: { color: p.primary },
    securityPasscodeRow: { flexDirection: 'row', gap: SPACE.xs, alignItems: 'center' },
    securityInput: { flex: 1, height: 48, backgroundColor: p.input, borderWidth: 1, borderColor: p.border, borderRadius: RADIUS.md, paddingHorizontal: SPACE.sm, color: p.text, fontSize: FONT.md },
    securityPrimaryButton: { width: 78, height: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primary },
    securityPrimaryText: { color: p.onFill, fontWeight: '700', fontSize: FONT.sm },
    securityModeGroup: { flexDirection: 'row', borderWidth: 1, borderColor: p.border, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: p.card },
    securityModeButton: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
    securityModeActive: { backgroundColor: p.navActive },
    securityModeText: { color: p.muted, fontSize: FONT.sm, fontWeight: '700' },
    securityModeTextActive: { color: p.text },
    securityActions: { flexDirection: 'row', gap: SPACE.xs },
    securityActionButton: { flex: 1, height: 46, borderRadius: RADIUS.md, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center', backgroundColor: p.card },
    securityActionText: { color: p.text, fontWeight: '700', fontSize: FONT.sm },
    smallButton: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: p.border, paddingHorizontal: SPACE.md, height: 44, justifyContent: 'center' },
    smallButtonText: { color: p.text, fontWeight: '700' },
    fullButton: { backgroundColor: p.primary, borderRadius: RADIUS.lg, height: 50, alignItems: 'center', justifyContent: 'center' },
    fullButtonText: { color: p.onFill, fontWeight: '700', fontSize: FONT.md },
    outlineFullButton: { borderWidth: 1, borderColor: p.border, borderRadius: RADIUS.lg, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: p.card },
    outlineFullButtonText: { color: p.text, fontWeight: '700', fontSize: FONT.md },
    dangerFullButton: { height: 48, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: p.danger, alignItems: 'center', justifyContent: 'center', backgroundColor: p.card },
    dangerFullButtonText: { color: p.danger, fontWeight: '700', fontSize: FONT.md },
    manageCard: { backgroundColor: p.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: p.border, padding: SPACE.md, gap: SPACE.sm },
    manageCardActive: { borderColor: p.primary },
    manageHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
    manageBody: { gap: SPACE.sm },
    dangerText: { color: p.danger },
    secondaryRow: { backgroundColor: p.background, borderRadius: RADIUS.md, padding: SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
    secondaryRowTitle: { flex: 1, color: p.text, fontWeight: '700', fontSize: FONT.md },
    secondaryRowAction: { color: p.primary, fontWeight: '700', fontSize: FONT.md },
    secondaryInput: { flex: 1, color: p.text, fontSize: FONT.md, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: p.border },
    inlineForm: { flexDirection: 'row', gap: SPACE.xs, alignItems: 'center' },
    inlineInput: { flex: 1, minHeight: 46, backgroundColor: p.card, borderColor: p.border, borderWidth: 1, borderRadius: RADIUS.sm, color: p.text, paddingHorizontal: SPACE.sm, fontSize: FONT.md },
    inlineButton: { height: 46, paddingHorizontal: SPACE.md, backgroundColor: p.primary, borderRadius: RADIUS.sm, justifyContent: 'center' },
    inlineButtonText: { color: p.onFill, fontWeight: '700' },
    logRow: { paddingVertical: SPACE.xs, borderBottomWidth: 1, borderBottomColor: p.border, gap: SPACE.xxs },
    lockScreen: { flex: 1, padding: SPACE.xxl, justifyContent: 'center', gap: SPACE.xxl },
    passDots: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.md },
    passDot: { width: 14, height: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: p.border },
    passDotFilled: { backgroundColor: p.primary, borderColor: p.primary },
    lockKeypad: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
    lockKey: { width: '30.5%', height: 62, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center', backgroundColor: p.card },
    navBar: { height: 96, flexDirection: 'row', backgroundColor: p.nav, borderTopWidth: 1, borderTopColor: p.border, paddingTop: SPACE.xs, paddingBottom: SPACE.sm, paddingHorizontal: SPACE.xs },
    navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.xs },
    navItemPressed: { opacity: 0.72 },
    navIconWrap: { width: 56, height: 42, borderRadius: RADIUS.xl, alignItems: 'center', justifyContent: 'center' },
    navIconActive: { backgroundColor: p.navActive },
    navLabel: { color: p.navText, fontSize: FONT.sm, fontWeight: '700' },
    navLabelActive: { color: p.primary },
  });
}

function getSummary(records: LedgerRecord[]) {
  return records.reduce(
    (summary, record) => {
      if (record.type === 'income') summary.income += record.amount;
      else summary.expense += record.amount;
      return summary;
    },
    { income: 0, expense: 0 },
  );
}

function groupByDay(records: LedgerRecord[]) {
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

function groupByTrend(records: LedgerRecord[], month: Date, range: Range) {
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

function groupByCategory(records: LedgerRecord[]) {
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

function getFrequentTemplates(records: LedgerRecord[], templates: CategoryTemplate[], type: EntryType, selectedPrimary: string) {
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

function getRecentCategories(records: LedgerRecord[], templates: CategoryTemplate[], type: EntryType) {
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

function filterByRange(records: LedgerRecord[], month: Date, range: Range) {
  if (range === 'all') return records;
  if (range === 'year') return records.filter((record) => new Date(record.date).getFullYear() === month.getFullYear());
  return records.filter((record) => sameMonth(record.date, month));
}

function filterByDrilldown(records: LedgerRecord[], filter: LedgerDrilldownFilter | null) {
  if (!filter) return records;
  return filterByRange(records, new Date(filter.anchor), filter.range).filter((record) => {
    if (record.type !== filter.type) return false;
    if (filter.primary && record.primary !== filter.primary) return false;
    return !filter.day || sameDay(record.date, new Date(filter.day));
  });
}

function drilldownRangeLabel(month: Date, range: Range) {
  if (range === 'year') return `${month.getFullYear()}年`;
  if (range === 'all') return '全部时间';
  return formatMonth(month);
}

function drilldownForTrend(label: string, type: EntryType, range: Range, month: Date): LedgerDrilldownFilter {
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

function sameMonth(date: string | Date, month: Date) {
  const target = new Date(date);
  return target.getFullYear() === month.getFullYear() && target.getMonth() === month.getMonth();
}

function sameDay(date: string | Date, day: Date) {
  const target = new Date(date);
  return target.getFullYear() === day.getFullYear() && target.getMonth() === day.getMonth() && target.getDate() === day.getDate();
}

function sameWeek(date: string | Date, day: Date) {
  const target = new Date(date);
  const start = new Date(day);
  start.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return target >= start && target < end;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function addMonths(date: Date, months: number) {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  return new Date(year, month, Math.min(date.getDate(), lastDayOfMonth(year, month)), date.getHours(), date.getMinutes(), date.getSeconds());
}

function addYears(date: Date, years: number) {
  const year = date.getFullYear() + years;
  const month = date.getMonth();
  return new Date(year, month, Math.min(date.getDate(), lastDayOfMonth(year, month)), date.getHours(), date.getMinutes(), date.getSeconds());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function formatMonth(date: Date) {
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatShortDate(date: string) {
  const target = new Date(date);
  return `${target.getMonth() + 1}月${target.getDate()}日`;
}

function formatDateTime(date: string) {
  const target = new Date(date);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')} ${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
}

function formatFileDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
}

function money(amount: number) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}¥${Math.abs(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortMoney(amount: number) {
  if (amount >= 10000) return `${Math.round(amount / 1000) / 10}万`;
  if (amount >= 1000) return `${Math.round(amount / 100) / 10}千`;
  return `${Math.round(amount)}`;
}

function trimAmount(amount: number) {
  return amount.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function rangeTitle(range: Range) {
  if (range === 'year') return '年度';
  if (range === 'all') return '全部';
  return '月度';
}

function trendTitle(range: Range, label: string) {
  if (range === 'year') return `每月${label}趋势`;
  if (range === 'all') return `年度${label}趋势`;
  return `每日${label}趋势`;
}

function evaluateAmount(input: string) {
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

function categoryIcon(primary: string, type: EntryType = 'expense'): IconName {
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
