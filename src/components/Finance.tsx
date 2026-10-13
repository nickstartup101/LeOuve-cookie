import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ArrowDownLeft,
  ArrowUpRight,
  DownloadCloud,
  Check,
  CheckCircle2,
  Calendar,
  Filter,
  Search,
  Plus,
  Trash2,
  AlertCircle,
  HelpCircle,
  Calculator,
  Building2,
  CreditCard,
  FileText,
  UploadCloud,
  X,
  TrendingUp,
  Clock,
  Layers
} from 'lucide-react';

// ==========================================
// 1. TYPE DEFINITIONS
// ==========================================

export type TransactionType = 'INCOME' | 'EXPENSE';
export type CostCategory = 'COGS' | 'OPEX' | 'CAPEX' | 'DIVIDEND' | 'SALES' | 'OTHER';

export interface FinanceTransaction {
  id: string;
  type: TransactionType;
  category: CostCategory;
  amountLAK: number;
  originalAmount?: number;
  currency?: 'LAK' | 'THB' | 'USD';
  exchangeRate?: number;
  date: string; // YYYY-MM-DD
  description: string;
  remark?: string;
  sourceBillId?: string;
  sourceItemId?: string;
  createdAt?: any;
}

export interface SupplierBillItem {
  id: string;
  name: string;
  category: 'COGS' | 'EQUIPMENT' | 'OPERATIONAL';
  quantity: number;
  unit: string;
  price: number;
  totalPrice: number;
  currency: 'LAK' | 'THB' | 'USD';
  exchangeRate: number;
}

export interface SupplierBill {
  id: string;
  supplierName: string;
  billDate: string;
  items: SupplierBillItem[];
}

export interface DebtRecord {
  id: string;
  type: 'AP' | 'AR'; // AP = ໜີ້ຕ້ອງສົ່ງ (Account Payable), AR = ໜີ້ຕ້ອງຮັບ (Account Receivable)
  counterparty: string; // ຊື່ລູກຄ້າ ຫຼື ຮ້ານຄ້າ
  amountLAK: number;
  dueDate: string;
  status: 'PENDING' | 'SETTLED';
  description: string;
  proofImageUrl?: string;
  createdAt?: any;
}

export const Finance: React.FC = () => {
  // ==========================================
  // 2. STATE MANAGEMENT
  // ==========================================
  const [activeTab, setActiveTab] = useState<'transactions' | 'overview' | 'debts' | 'breakeven'>('transactions');
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [supplierBills, setSupplierBills] = useState<SupplierBill[]>([]);
  const [debts, setDebts] = useState<DebtRecord[]>([]);

  // Modals
  const [isAddTxModalOpen, setIsAddTxModalOpen] = useState(false);
  const [isPullSupplierModalOpen, setIsPullSupplierModalOpen] = useState(false);
  const [isAddDebtModalOpen, setIsAddDebtModalOpen] = useState(false);

  // Custom In-App Confirm/Alert Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Transaction Filters
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Break-even planner state
  const [dailySalesTargetLAK, setDailySalesTargetLAK] = useState<number>(3500000);
  const [grossMarginPercent, setGrossMarginPercent] = useState<number>(65);
  const [fixedOpexMonthlyLAK, setFixedOpexMonthlyLAK] = useState<number>(18000000);
  const [targetPaybackMonths, setTargetPaybackMonths] = useState<number>(7);

  // Form State: ບັນທຶກທຸລະກຳໃໝ່
  const [txType, setTxType] = useState<TransactionType>('EXPENSE');
  const [txCategory, setTxCategory] = useState<CostCategory>('COGS');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txCurrency, setTxCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [txRate, setTxRate] = useState<number>(1);
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [txDesc, setTxDesc] = useState<string>('');
  const [txRemark, setTxRemark] = useState<string>('');

  // Form State: ບັນທຶກໜີ້ສິນ AP/AR
  const [debtType, setDebtType] = useState<'AP' | 'AR'>('AP');
  const [debtCounterparty, setDebtCounterparty] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDueDate, setDebtDueDate] = useState('');
  const [debtDesc, setDebtDesc] = useState('');
  const [debtProofImg, setDebtProofImg] = useState<string | null>(null);

  // ==========================================
  // 3. FIRESTORE REALTIME SYNC
  // ==========================================
  useEffect(() => {
    // ດຶງທຸລະກຳການເງິນ
    const qTx = query(collection(db, 'finance_transactions'), orderBy('date', 'desc'));
    const unsubTx = onSnapshot(qTx, (snap) => {
      const data: FinanceTransaction[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as FinanceTransaction));
      setTransactions(data);
    });

    // ດຶງໃບບິນຈາກ Supplier
    const qBills = query(collection(db, 'supplier_bills'), orderBy('billDate', 'desc'));
    const unsubBills = onSnapshot(qBills, (snap) => {
      const data: SupplierBill[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as SupplierBill));
      setSupplierBills(data);
    });

    // ດຶງຂໍ້ມູນໜີ້ສິນ AP/AR
    const qDebts = query(collection(db, 'debts_apar'), orderBy('dueDate', 'asc'));
    const unsubDebts = onSnapshot(qDebts, (snap) => {
      const data: DebtRecord[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as DebtRecord));
      setDebts(data);
    });

    return () => {
      unsubTx();
      unsubBills();
      unsubDebts();
    };
  }, []);

  // Update exchange rate ອັດຕະໂນມັດເມື່ອປ່ຽນສະກຸນເງິນໃນ Form
  useEffect(() => {
    if (txCurrency === 'THB') setTxRate(680);
    else if (txCurrency === 'USD') setTxRate(22000);
    else setTxRate(1);
  }, [txCurrency]);

  // ຮອງຮັບ Paste ຮູບໃບບິນຫຼັກຖານ (Ctrl+V) ສຳລັບ AP/AR
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isAddDebtModalOpen) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => setDebtProofImg(reader.result as string);
            reader.readAsDataURL(file);
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isAddDebtModalOpen]);

  // ==========================================
  // 4. COMPUTED: ALREADY SYNCED SUPPLIER ITEMS
  // ==========================================
  // Set ຂອງ sourceItemId ທີ່ເຄີຍຖືກດຶງເຂົ້າ Finance ແລ້ວ ເພື່ອປ້ອງກັນການດຶງຊ້ຳ
  const alreadySyncedItemIds = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(t => {
      if (t.sourceItemId) set.add(t.sourceItemId);
    });
    return set;
  }, [transactions]);

  // ==========================================
  // 5. COMPUTED: TRANSACTION HISTORY FILTERING
  // ==========================================
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // 1. ປະເພດ (ທັງໝົດ / ລາຍຮັບ / ລາຍຈ່າຍ)
      if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;

      // 2. ໝວດໝູ່
      if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;

      // 3. ວັນທີ Start - End
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;

      // 4. ຄົ້ນຫາຕາມ Description ຫຼື Remark
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = t.description.toLowerCase().includes(q);
        const matchRemark = t.remark?.toLowerCase().includes(q) || false;
        if (!matchDesc && !matchRemark) return false;
      }

      return true;
    });
  }, [transactions, typeFilter, categoryFilter, startDate, endDate, searchQuery]);

  // ສະຫຼຸບຕົວເລກຕາມ Filter ປະຈຸບັນ
  const filteredSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTransactions.forEach(t => {
      if (t.type === 'INCOME') income += t.amountLAK;
      else expense += t.amountLAK;
    });
    return {
      income,
      expense,
      net: income - expense,
      count: filteredTransactions.length
    };
  }, [filteredTransactions]);

  // Preset ເລືອກວັນທີໄວ
  const applyDatePreset = (preset: 'all' | 'today' | '7days' | 'thisMonth') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const past7 = new Date();
      past7.setDate(today.getDate() - 7);
      setStartDate(past7.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStr);
    }
  };

  // ==========================================
  // 6. COMPUTED: 4 COST GROUPS & BREAK-EVEN
  // ==========================================
  const totalCapexInvested = useMemo(() => {
    return transactions
      .filter(t => t.type === 'EXPENSE' && t.category === 'CAPEX')
      .reduce((sum, t) => sum + t.amountLAK, 0);
  }, [transactions]);

  const breakEvenAnalysis = useMemo(() => {
    const dailyGrossProfit = dailySalesTargetLAK * (grossMarginPercent / 100);
    const monthlyGrossProfit = dailyGrossProfit * 30;
    const monthlyNetProfit = monthlyGrossProfit - fixedOpexMonthlyLAK;
    const estimatedPaybackMonths = monthlyNetProfit > 0 
      ? Number((totalCapexInvested / monthlyNetProfit).toFixed(1)) 
      : 0;

    // ເພື່ອຄືນທຶນຕາມເປົ້າໝາຍ (targetPaybackMonths)
    const requiredMonthlyNetProfit = targetPaybackMonths > 0 ? totalCapexInvested / targetPaybackMonths : 0;
    const requiredMonthlyGrossProfit = requiredMonthlyNetProfit + fixedOpexMonthlyLAK;
    const requiredDailySalesLAK = grossMarginPercent > 0 
      ? Math.round((requiredMonthlyGrossProfit / 30) / (grossMarginPercent / 100))
      : 0;

    return {
      dailyGrossProfit,
      monthlyGrossProfit,
      monthlyNetProfit,
      estimatedPaybackMonths,
      requiredDailySalesLAK
    };
  }, [dailySalesTargetLAK, grossMarginPercent, fixedOpexMonthlyLAK, targetPaybackMonths, totalCapexInvested]);

  // ==========================================
  // 7. ACTIONS (HANDLERS)
  // ==========================================
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawNum = parseFloat(txAmount);
    if (isNaN(rawNum) || rawNum <= 0) return;

    const totalLAK = txCurrency === 'LAK' ? rawNum : rawNum * txRate;

    try {
      await addDoc(collection(db, 'finance_transactions'), {
        type: txType,
        category: txType === 'INCOME' ? 'SALES' : txCategory,
        amountLAK: totalLAK,
        originalAmount: rawNum,
        currency: txCurrency,
        exchangeRate: txRate,
        date: txDate,
        description: txDesc || (txType === 'INCOME' ? 'ຍອດຂາຍປະຈຳວັນ' : 'ລາຍຈ່າຍທົ່ວໄປ'),
        remark: txRemark.trim() || undefined,
        createdAt: serverTimestamp()
      });

      setIsAddTxModalOpen(false);
      setTxAmount('');
      setTxDesc('');
      setTxRemark('');
    } catch (err) {
      console.error('Error adding transaction:', err);
    }
  };

  const handleDeleteTransaction = (tx: FinanceTransaction) => {
    setConfirmModal({
      isOpen: true,
      title: 'ຢືນຢັນການລຶບທຸລະກຳ',
      message: `ທ່ານຕ້ອງການລຶບລາຍການ "${tx.description}" ຈຳນວນ ${tx.amountLAK.toLocaleString()} ₭ ແທ້ຫຼືບໍ່?`,
      onConfirm: async () => {
        await deleteDoc(doc(db, 'finance_transactions', tx.id));
        setConfirmModal(null);
      }
    });
  };

  const handleCreateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmt = parseFloat(debtAmount);
    if (!debtCounterparty || isNaN(rawAmt) || rawAmt <= 0) return;

    try {
      await addDoc(collection(db, 'debts_apar'), {
        type: debtType,
        counterparty: debtCounterparty,
        amountLAK: rawAmt,
        dueDate: debtDueDate || new Date().toISOString().split('T')[0],
        status: 'PENDING',
        description: debtDesc,
        proofImageUrl: debtProofImg || '',
        createdAt: serverTimestamp()
      });

      setIsAddDebtModalOpen(false);
      setDebtCounterparty('');
      setDebtAmount('');
      setDebtDesc('');
      setDebtProofImg(null);
    } catch (err) {
      console.error('Error adding debt:', err);
    }
  };

  const handleToggleDebtStatus = async (debt: DebtRecord) => {
    const nextStatus = debt.status === 'PENDING' ? 'SETTLED' : 'PENDING';
    await updateDoc(doc(db, 'debts_apar', debt.id), { status: nextStatus });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-sans p-6 space-y-6">
      
      {/* ==========================================
          HEADER & KPI METRICS
          ========================================== */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-neutral-800/80 pb-5">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-white tracking-wide">
            Finance & Cost Management
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            ຄຸ້ມຄອງ 4 ກຸ່ມຕົ້ນທຶນ (COGS, OPEX, CAPEX, DIVIDEND), ດຶງໃບບິນອັດຕະໂນມັດ, ແລະ ໜີ້ສິນ AP/AR
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* ປຸ່ມດຶງໃບບິນຈາກ Supplier */}
          <button
            onClick={() => setIsPullSupplierModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-amber-500/50 text-amber-300 text-xs font-medium flex items-center gap-2 transition-all shadow-sm"
          >
            <DownloadCloud className="w-4 h-4 text-amber-400" />
            <span>ດຶງຈາກ Supplier (Auto-Remark)</span>
          </button>

          {/* ປຸ່ມບັນທຶກທຸລະກຳເອງ */}
          <button
            onClick={() => setIsAddTxModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-medium flex items-center gap-2 transition-all shadow-md"
          >
            <Plus className="w-4 h-4 text-black" />
            <span>ບັນທຶກລາຍຮັບ-ລາຍຈ່າຍ</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: 4 ກຸ່ມຕົ້ນທຶນ & ລາຍຮັບ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 bg-[#141414] border border-neutral-800/80 rounded-2xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
            <span>ລາຍຮັບລວມ (Total Revenue)</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-serif text-xl font-bold text-emerald-400">
            {transactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amountLAK, 0).toLocaleString()} ₭
          </div>
        </div>

        <div className="p-4 bg-[#141414] border border-neutral-800/80 rounded-2xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
            <span>COGS (ວັດຖຸດິບ)</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-serif text-xl font-bold text-neutral-100">
            {transactions.filter(t => t.type === 'EXPENSE' && t.category === 'COGS').reduce((s, t) => s + t.amountLAK, 0).toLocaleString()} ₭
          </div>
        </div>

        <div className="p-4 bg-[#141414] border border-neutral-800/80 rounded-2xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
            <span>OPEX (ຄ່າໃຊ້ຈ່າຍບໍລິຫານ)</span>
            <Building2 className="w-4 h-4 text-sky-400" />
          </div>
          <div className="font-serif text-xl font-bold text-neutral-100">
            {transactions.filter(t => t.type === 'EXPENSE' && t.category === 'OPEX').reduce((s, t) => s + t.amountLAK, 0).toLocaleString()} ₭
          </div>
        </div>

        <div className="p-4 bg-[#141414] border border-neutral-800/80 rounded-2xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
            <span>CAPEX (ທຶນອຸປະກອນ & ຮຽນສູດ)</span>
            <CreditCard className="w-4 h-4 text-purple-400" />
          </div>
          <div className="font-serif text-xl font-bold text-purple-300">
            {totalCapexInvested.toLocaleString()} ₭
          </div>
        </div>
      </div>

      {/* ==========================================
          NAV TABS
          ========================================== */}
      <div className="flex items-center border-b border-neutral-800 gap-6 text-xs">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`pb-3 font-medium transition-all relative ${
            activeTab === 'transactions'
              ? 'text-white border-b-2 border-white'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          ປະຫວັດທຸລະກຳ & Filter ({transactions.length})
        </button>

        <button
          onClick={() => setActiveTab('debts')}
          className={`pb-3 font-medium transition-all relative ${
            activeTab === 'debts'
              ? 'text-white border-b-2 border-white'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          ລະບົບໜີ້ສິນ AP / AR ({debts.filter(d => d.status === 'PENDING').length} ຄົງຄ້າງ)
        </button>

        <button
          onClick={() => setActiveTab('breakeven')}
          className={`pb-3 font-medium transition-all relative ${
            activeTab === 'breakeven'
              ? 'text-white border-b-2 border-white'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          ແຜນຄືນທຶນ & Break-Even Planner
        </button>
      </div>

      {/* ==========================================
          TAB 1: TRANSACTION HISTORY & FILTER
          ========================================== */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-[#141414] border border-neutral-800 rounded-2xl p-4 space-y-4">
            
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Type Switcher: ທັງໝົດ | ລາຍຮັບ | ລາຍຈ່າຍ */}
              <div className="flex items-center bg-[#0a0a0a] border border-neutral-800 rounded-xl p-1 text-xs">
                <button
                  onClick={() => setTypeFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    typeFilter === 'ALL'
                      ? 'bg-neutral-800 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  ທັງໝົດ
                </button>
                <button
                  onClick={() => setTypeFilter('INCOME')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    typeFilter === 'INCOME'
                      ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/40'
                      : 'text-neutral-400 hover:text-emerald-400'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                  ລາຍຮັບ
                </button>
                <button
                  onClick={() => setTypeFilter('EXPENSE')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    typeFilter === 'EXPENSE'
                      ? 'bg-rose-950/70 text-rose-300 border border-rose-800/40'
                      : 'text-neutral-400 hover:text-rose-400'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
                  ລາຍຈ່າຍ
                </button>
              </div>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-[#0a0a0a] text-xs text-neutral-300 border border-neutral-800 rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="ALL">ທຸກໝວດໝູ່ຕົ້ນທຶນ</option>
                <option value="COGS">COGS (ວັດຖຸດິບ)</option>
                <option value="OPEX">OPEX (ຄ່າດຳເນີນງານ)</option>
                <option value="CAPEX">CAPEX (ຊື້ອຸປະກອນ/ຮຽນສູດ)</option>
                <option value="DIVIDEND">DIVIDEND (ເງິນປັນຜົນ)</option>
                <option value="SALES">SALES (ຍອດຂາຍ)</option>
              </select>

              {/* Quick Date Presets */}
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                <span className="text-neutral-500 mr-1">ໄລຍະ:</span>
                <button
                  onClick={() => applyDatePreset('all')}
                  className={`px-2 py-1 rounded-md border ${
                    !startDate && !endDate ? 'border-neutral-600 bg-neutral-800 text-white' : 'border-neutral-800 hover:bg-neutral-900'
                  }`}
                >
                  ຕະຫຼອດການ
                </button>
                <button
                  onClick={() => applyDatePreset('today')}
                  className="px-2 py-1 rounded-md border border-neutral-800 hover:bg-neutral-900"
                >
                  ມື້ນີ້
                </button>
                <button
                  onClick={() => applyDatePreset('7days')}
                  className="px-2 py-1 rounded-md border border-neutral-800 hover:bg-neutral-900"
                >
                  7 ວັນ
                </button>
                <button
                  onClick={() => applyDatePreset('thisMonth')}
                  className="px-2 py-1 rounded-md border border-neutral-800 hover:bg-neutral-900"
                >
                  ເດືອນນີ້
                </button>
              </div>
            </div>

            {/* Date Range & Keyword Search */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-800/60 text-xs">
              <div className="flex items-center gap-2 bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-1.5">
                <span className="text-neutral-500 text-[11px]">ຕັ້ງແຕ່ວັນທີ:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-neutral-200 focus:outline-none w-full"
                />
              </div>

              <div className="flex items-center gap-2 bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-1.5">
                <span className="text-neutral-500 text-[11px]">ຮອດວັນທີ:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-neutral-200 focus:outline-none w-full"
                />
              </div>

              <div className="flex items-center gap-2 bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-1.5">
                <Search className="w-3.5 h-3.5 text-neutral-500" />
                <input
                  type="text"
                  placeholder="ຄົ້ນຫາລາຍການ ຫຼື Remark..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-neutral-200 focus:outline-none w-full placeholder:text-neutral-600"
                />
              </div>
            </div>
          </div>

          {/* Real-time Filtered Summary Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 bg-[#121212] border border-neutral-800/80 rounded-xl">
              <span className="text-[11px] text-neutral-500 block mb-0.5">ລາຍຮັບລວມ (Filter)</span>
              <span className="text-base font-semibold text-emerald-400 font-mono">
                +{filteredSummary.income.toLocaleString()} ₭
              </span>
            </div>
            <div className="p-3.5 bg-[#121212] border border-neutral-800/80 rounded-xl">
              <span className="text-[11px] text-neutral-500 block mb-0.5">ລາຍຈ່າຍລວມ (Filter)</span>
              <span className="text-base font-semibold text-rose-400 font-mono">
                -{filteredSummary.expense.toLocaleString()} ₭
              </span>
            </div>
            <div className="p-3.5 bg-[#121212] border border-neutral-800/80 rounded-xl">
              <span className="text-[11px] text-neutral-500 block mb-0.5">ກຳໄລສຸດທິ ({filteredSummary.count} ລາຍການ)</span>
              <span className={`text-base font-semibold font-mono ${filteredSummary.net >= 0 ? 'text-white' : 'text-rose-400'}`}>
                {filteredSummary.net.toLocaleString()} ₭
              </span>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="border border-neutral-800 rounded-xl overflow-hidden bg-[#0c0c0c]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-[#141414] text-neutral-400 uppercase text-[10px] border-b border-neutral-800 tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">ວັນທີ</th>
                    <th className="py-2.5 px-3">ປະເພດ / ໝວດໝູ່</th>
                    <th className="py-2.5 px-3">ລາຍລະອຽດ & Remark ຕົ້ນທາງ</th>
                    <th className="py-2.5 px-3 text-right">ຈຳນວນເງິນ (LAK)</th>
                    <th className="py-2.5 px-3 text-center w-12">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-sans">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-neutral-500 text-xs">
                        ບໍ່ພົບລາຍການທຸລະກຳຕາມ Filter ທີ່ເລືອກ
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-neutral-900/40 transition-colors">
                        <td className="py-3 px-3 text-neutral-400 whitespace-nowrap font-mono text-[11px]">
                          {tx.date}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                tx.type === 'INCOME'
                                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50'
                                  : 'bg-rose-950/40 text-rose-400 border-rose-900/50'
                              }`}
                            >
                              {tx.type === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800">
                              {tx.category}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-neutral-200">{tx.description}</div>
                          {tx.remark && (
                            <div className="text-[11px] text-amber-400/90 mt-0.5 font-mono flex items-center gap-1">
                              <span>↳</span>
                              <span>{tx.remark}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <span
                            className={`font-mono font-medium text-sm ${
                              tx.type === 'INCOME' ? 'text-emerald-400' : 'text-neutral-200'
                            }`}
                          >
                            {tx.type === 'INCOME' ? '+' : '-'}
                            {tx.amountLAK.toLocaleString()} ₭
                          </span>
                          {tx.currency && tx.currency !== 'LAK' && tx.originalAmount && (
                            <div className="text-[10px] text-neutral-500 font-mono">
                              {tx.originalAmount.toLocaleString()} {tx.currency} (ເລດ {tx.exchangeRate})
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleDeleteTransaction(tx)}
                            className="p-1 rounded text-neutral-500 hover:text-rose-400 transition-colors"
                            title="ລຶບລາຍການ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          TAB 2: DEBTS (AP / AR)
          ========================================== */}
      {activeTab === 'debts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-200">
              ລາຍການໜີ້ສິນ AP (ໜີ້ຕ້ອງສົ່ງ) & AR (ໜີ້ຕ້ອງຮັບ)
            </h3>
            <button
              onClick={() => setIsAddDebtModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-xs text-white flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ເພີ່ມລາຍການໜີ້ສິນ</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AP Section */}
            <div className="border border-neutral-800 rounded-2xl p-4 bg-[#121212]/50 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4" /> ໜີ້ຕ້ອງສົ່ງ (AP - ຮ້ານເຮົາຕິດໜີ້ເຂົາ)
                </span>
                <span className="text-xs font-mono text-neutral-400">
                  {debts.filter(d => d.type === 'AP' && d.status === 'PENDING').reduce((s, d) => s + d.amountLAK, 0).toLocaleString()} ₭
                </span>
              </div>
              <div className="space-y-2">
                {debts.filter(d => d.type === 'AP').map(d => (
                  <div key={d.id} className="p-3 rounded-xl bg-[#0a0a0a] border border-neutral-800/80 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-white">{d.counterparty}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{d.description} • ກຳນົດ: {d.dueDate}</div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <span className="font-mono text-rose-300 font-semibold">{d.amountLAK.toLocaleString()} ₭</span>
                      <button
                        onClick={() => handleToggleDebtStatus(d)}
                        className={`px-2 py-1 rounded text-[10px] font-medium border ${
                          d.status === 'SETTLED'
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                            : 'bg-neutral-900 text-neutral-400 border-neutral-700'
                        }`}
                      >
                        {d.status === 'SETTLED' ? 'ຈ່າຍແລ້ວ' : 'ຄ້າງຈ່າຍ'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AR Section */}
            <div className="border border-neutral-800 rounded-2xl p-4 bg-[#121212]/50 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <ArrowDownLeft className="w-4 h-4" /> ໜີ້ຕ້ອງຮັບ (AR - ລູກຄ້າຕິດໜີ້ເຮົາ)
                </span>
                <span className="text-xs font-mono text-neutral-400">
                  {debts.filter(d => d.type === 'AR' && d.status === 'PENDING').reduce((s, d) => s + d.amountLAK, 0).toLocaleString()} ₭
                </span>
              </div>
              <div className="space-y-2">
                {debts.filter(d => d.type === 'AR').map(d => (
                  <div key={d.id} className="p-3 rounded-xl bg-[#0a0a0a] border border-neutral-800/80 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-white">{d.counterparty}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{d.description} • ກຳນົດ: {d.dueDate}</div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <span className="font-mono text-emerald-400 font-semibold">{d.amountLAK.toLocaleString()} ₭</span>
                      <button
                        onClick={() => handleToggleDebtStatus(d)}
                        className={`px-2 py-1 rounded text-[10px] font-medium border ${
                          d.status === 'SETTLED'
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                            : 'bg-neutral-900 text-neutral-400 border-neutral-700'
                        }`}
                      >
                        {d.status === 'SETTLED' ? 'ຮັບແລ້ວ' : 'ຄ້າງຮັບ'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          TAB 3: BREAK-EVEN & PAYBACK PLANNER
          ========================================== */}
      {activeTab === 'breakeven' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#141414] border border-neutral-800 rounded-2xl p-5 space-y-4">
            <h3 className="font-serif text-lg text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-amber-400" />
              ຕົວແປຄຳນວນຈຸດຄຸ້ມທຶນ & Payback Planner
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-400 block mb-1">ຍອດຂາຍເປົ້າໝາຍຕໍ່ວັນ (LAK/day)</label>
                <input
                  type="number"
                  value={dailySalesTargetLAK}
                  onChange={(e) => setDailySalesTargetLAK(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">ອັດຕາກຳໄລຂັ້ນຕົ້ນ Gross Margin (%)</label>
                <input
                  type="number"
                  value={grossMarginPercent}
                  onChange={(e) => setGrossMarginPercent(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">ຄ່າດຳເນີນງານຄົງທີ່ຕໍ່ເດືອນ Fixed OPEX (LAK/month)</label>
                <input
                  type="number"
                  value={fixedOpexMonthlyLAK}
                  onChange={(e) => setFixedOpexMonthlyLAK(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">ເປົ້າໝາຍເດືອນທີ່ຕ້ອງການຄືນທຶນ (Target Months)</label>
                <input
                  type="number"
                  value={targetPaybackMonths}
                  onChange={(e) => setTargetPaybackMonths(parseFloat(e.target.value) || 1)}
                  className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Results Card */}
          <div className="bg-[#121212] border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider text-amber-400 font-medium">ບົດວິເຄາະການເງິນ LE OUVE</span>
              <h4 className="font-serif text-xl text-white mt-1">ຜົນການປະເມີນໄລຍະເວລາຄືນທຶນ</h4>
              
              <div className="mt-5 space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-neutral-800/80">
                  <span className="text-neutral-400">ເງິນລົງທຶນ CAPEX ທັງໝົດ:</span>
                  <span className="font-mono text-purple-300 font-semibold">{totalCapexInvested.toLocaleString()} ₭</span>
                </div>
                <div className="flex justify-between py-2 border-b border-neutral-800/80">
                  <span className="text-neutral-400">ກຳໄລສຸດທິຄາດຄະເນຕໍ່ເດືອນ:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{breakEvenAnalysis.monthlyNetProfit.toLocaleString()} ₭</span>
                </div>
                <div className="flex justify-between py-2 border-b border-neutral-800/80">
                  <span className="text-neutral-400">ໄລຍະເວລາຄືນທຶນຕາມຍອດຂາຍປັດຈຸບັນ:</span>
                  <span className="font-mono text-white font-semibold">{breakEvenAnalysis.estimatedPaybackMonths} ເດືອນ</span>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 text-xs">
              <span className="text-amber-300 font-medium block mb-1">ເປົ້າໝາຍເພື່ອຄືນທຶນພາຍໃນ {targetPaybackMonths} ເດືອນ:</span>
              <p className="text-neutral-300 leading-relaxed">
                ຮ້ານຕ້ອງສ້າງຍອດຂາຍໃຫ້ໄດ້ຢ່າງໜ້ອຍ <strong className="text-white font-mono font-semibold">{breakEvenAnalysis.requiredDailySalesLAK.toLocaleString()} ₭ / ວັນ</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 1: PULL FROM SUPPLIER (ANTI-DUPLICATE + AUTO-REMARK)
          ========================================== */}
      {isPullSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden font-sans text-neutral-200">
            <div className="px-6 py-4 border-b border-neutral-800 bg-[#141414] flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl text-neutral-100 flex items-center gap-2">
                  <DownloadCloud className="w-5 h-5 text-amber-400" />
                  ດຶງລາຍຈ່າຍຈາກໃບບິນ Supplier ເຂົ້າ Finance
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  ລະບົບກວດສອບອັດຕະໂນມັດ • ລັອກລາຍການທີ່ເຄີຍດຶງແລ້ວເພື່ອປ້ອງກັນການລົງບັນຊີຊ້ຳກັນ
                </p>
              </div>
              <button onClick={() => setIsPullSupplierModalOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bill List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {supplierBills.length === 0 ? (
                <div className="py-12 text-center text-neutral-500 text-xs">
                  ບໍ່ພົບໃບບິນໃນລະບົບ Suppliers
                </div>
              ) : (
                supplierBills.map(bill => (
                  <div key={bill.id} className="border border-neutral-800 rounded-xl overflow-hidden bg-[#0a0a0a]">
                    <div className="px-4 py-2.5 bg-[#141414] border-b border-neutral-800 flex items-center justify-between text-xs">
                      <span className="font-medium text-white">{bill.supplierName}</span>
                      <span className="text-neutral-400">ວັນທີໃບບິນ: {bill.billDate}</span>
                    </div>

                    <div className="divide-y divide-neutral-900">
                      {bill.items.map(item => {
                        const isSynced = alreadySyncedItemIds.has(item.id);
                        const rate = item.exchangeRate || (item.currency === 'THB' ? 680 : 1);
                        const lakTotal = item.totalPrice * rate;

                        return (
                          <div
                            key={item.id}
                            className={`px-4 py-3 flex items-center justify-between text-xs transition-colors ${
                              isSynced ? 'bg-[#121212]/40 opacity-55' : 'hover:bg-neutral-900/40'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Indicator Icon */}
                              {isSynced ? (
                                <span className="w-4 h-4 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-emerald-400">
                                  <Check className="w-2.5 h-2.5" />
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    // ບັນທຶກເຂົ້າ Finance ທັນທີເມື່ອກົດນຳເຂົ້າ
                                    const finCategory: CostCategory = 
                                      item.category === 'EQUIPMENT' ? 'CAPEX' :
                                      item.category === 'OPERATIONAL' ? 'OPEX' : 'COGS';
                                    
                                    const remarkText = `[Auto-Sync] ດຶງຈາກ Supplier: ${bill.supplierName} | ລາຍການ: ${item.name} (${item.quantity} ${item.unit}) | ບິນວັນທີ: ${bill.billDate}`;

                                    await addDoc(collection(db, 'finance_transactions'), {
                                      type: 'EXPENSE',
                                      category: finCategory,
                                      amountLAK: lakTotal,
                                      originalAmount: item.totalPrice,
                                      currency: item.currency,
                                      exchangeRate: rate,
                                      date: bill.billDate,
                                      description: `ຄ່າ ${item.name} (${bill.supplierName})`,
                                      remark: remarkText,
                                      sourceBillId: bill.id,
                                      sourceItemId: item.id,
                                      createdAt: serverTimestamp()
                                    });
                                  }}
                                  className="px-2.5 py-1 bg-white hover:bg-neutral-200 text-black font-medium rounded-lg text-[11px] transition-all"
                                >
                                  + ດຶງເຂົ້າ Finance
                                </button>
                              )}

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-neutral-200">{item.name}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                                    {item.category === 'EQUIPMENT' ? 'CAPEX' : item.category}
                                  </span>
                                  {isSynced && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700 flex items-center gap-1 font-mono">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> ດຶງແລ້ວ (Synced)
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-neutral-500">
                                  {item.quantity} {item.unit} @ {item.price.toLocaleString()} {item.currency}
                                </span>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="font-mono text-neutral-200 font-medium">{lakTotal.toLocaleString()} ₭</span>
                              {item.currency !== 'LAK' && (
                                <div className="text-[10px] text-neutral-500 font-mono">
                                  {item.totalPrice.toLocaleString()} {item.currency} (ເລດ {rate})
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-neutral-800 bg-[#141414] flex justify-end">
              <button
                onClick={() => setIsPullSupplierModalOpen(false)}
                className="px-4 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-300 hover:text-white"
              >
                ປິດໜ້າຕ່າງ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 2: ADD TRANSACTION MANUAL
          ========================================== */}
      {isAddTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl w-full max-w-md p-6 shadow-2xl font-sans text-neutral-200 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="font-serif text-lg text-white">ບັນທຶກທຸລະກຳການເງິນ</h3>
              <button onClick={() => setIsAddTxModalOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-neutral-400 block mb-1">ປະເພດທຸລະກຳ</label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as TransactionType)}
                    className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="EXPENSE">ລາຍຈ່າຍ (Expense)</option>
                    <option value="INCOME">ລາຍຮັບ (Income)</option>
                  </select>
                </div>

                <div>
                  <label className="text-neutral-400 block mb-1">ໝວດໝູ່ຕົ້ນທຶນ</label>
                  <select
                    value={txCategory}
                    disabled={txType === 'INCOME'}
                    onChange={(e) => setTxCategory(e.target.value as CostCategory)}
                    className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none disabled:opacity-50"
                  >
                    <option value="COGS">COGS (ວັດຖຸດິບ)</option>
                    <option value="OPEX">OPEX (ຄ່າດຳເນີນງານ)</option>
                    <option value="CAPEX">CAPEX (ຊື້ອຸປະກອນ/ຮຽນສູດ)</option>
                    <option value="DIVIDEND">DIVIDEND (ເງິນປັນຜົນ)</option>
                    <option value="OTHER">OTHER (ອື່ນໆ)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">ຊື່ລາຍການ / ລາຍລະອຽດ</label>
                <input
                  type="text"
                  required
                  placeholder="ຕົວຢ່າງ: ຄ່າເນີຍ Anchor, ຄ່າໄຟຟ້າເດືອນ 10..."
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-neutral-400 block mb-1">ຈຳນວນເງິນ</label>
                  <input
                    type="number"
                    required
                    placeholder="0"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">ສະກຸນເງິນ</label>
                  <select
                    value={txCurrency}
                    onChange={(e) => setTxCurrency(e.target.value as any)}
                    className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="LAK">LAK</option>
                    <option value="THB">THB</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-neutral-400 block mb-1">ອັດຕາແລກປ່ຽນ</label>
                  <input
                    type="number"
                    value={txRate}
                    onChange={(e) => setTxRate(parseFloat(e.target.value) || 1)}
                    className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">ວັນທີ</label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Remark (ໝາຍເຫດເພີ່ມເຕີມ)</label>
                <input
                  type="text"
                  placeholder="ລະບຸແຫຼ່ງທີ່ມາ ຫຼື ເລກບິນອ້າງອີງ..."
                  value={txRemark}
                  onChange={(e) => setTxRemark(e.target.value)}
                  className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddTxModalOpen(false)}
                  className="px-4 py-2 bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-xl hover:text-white"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-white text-black font-medium rounded-xl hover:bg-neutral-200"
                >
                  ບັນທຶກ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 3: ADD DEBT (AP / AR)
          ========================================== */}
      {isAddDebtModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl w-full max-w-md p-6 shadow-2xl font-sans text-neutral-200 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="font-serif text-lg text-white">ບັນທຶກໜີ້ສິນ (AP / AR)</h3>
              <button onClick={() => setIsAddDebtModalOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDebt} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-neutral-400 block mb-1">ປະເພດໜີ້</label>
                  <select
                    value={debtType}
                    onChange={(e) => setDebtType(e.target.value as any)}
                    className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="AP">ໜີ້ຕ້ອງສົ່ງ (AP - ເຮົາຕິດໜີ້)</option>
                    <option value="AR">ໜີ້ຕ້ອງຮັບ (AR - ເຂົາຕິດໜີ້ເຮົາ)</option>
                  </select>
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">ຊື່ຄູ່ສັນຍາ / ລູກຄ້າ / ຮ້ານຄ້າ</label>
                  <input
                    type="text"
                    required
                    placeholder="ຕົວຢ່າງ: ຮ້ານຂາຍແກ້ວ, ລູກຄ້າ A"
                    value={debtCounterparty}
                    onChange={(e) => setDebtCounterparty(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-neutral-400 block mb-1">ຈຳນວນເງິນ (LAK)</label>
                  <input
                    type="number"
                    required
                    value={debtAmount}
                    onChange={(e) => setDebtAmount(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">ກຳນົດຊຳລະ (Due Date)</label>
                  <input
                    type="date"
                    required
                    value={debtDueDate}
                    onChange={(e) => setDebtDueDate(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">ລາຍລະອຽດ</label>
                <input
                  type="text"
                  placeholder="ໝາຍເຫດລາຍການ..."
                  value={debtDesc}
                  onChange={(e) => setDebtDesc(e.target.value)}
                  className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                />
              </div>

              {/* Paste Proof Box */}
              <div className="border border-dashed border-neutral-800 rounded-xl p-3 bg-[#0a0a0a] text-center">
                {debtProofImg ? (
                  <div className="relative">
                    <img src={debtProofImg} alt="Proof" className="max-h-24 mx-auto rounded" />
                    <button
                      type="button"
                      onClick={() => setDebtProofImg(null)}
                      className="absolute top-0 right-0 p-1 bg-black/70 rounded-full text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-neutral-500 py-1">
                    ກົດ <kbd className="px-1 py-0.5 bg-neutral-900 border border-neutral-800 rounded text-neutral-300">Ctrl + V</kbd> ເພື່ອວາງຮູບຫຼັກຖານໃບບິນ
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddDebtModalOpen(false)}
                  className="px-4 py-2 bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-xl hover:text-white"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-white text-black font-medium rounded-xl hover:bg-neutral-200"
                >
                  ບັນທຶກໜີ້ສິນ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 4: IN-APP CONFIRM MODAL (NO WINDOW.ALERT)
          ========================================== */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl font-sans text-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-center justify-center text-rose-400 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base text-white">{confirmModal.title}</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800/80">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 text-xs bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-lg hover:text-white"
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg transition-colors"
              >
                ຢືນຢັນລຶບ
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Finance;
