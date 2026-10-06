import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, addDoc, onSnapshot, 
  deleteDoc, doc, serverTimestamp, getDocs, updateDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  DollarSign, TrendingUp, Wallet, CreditCard, 
  Plus, Trash2, ArrowUpRight, ArrowDownRight,
  Download, QrCode, Building2,
  HandCoins, Receipt, Upload, Eye, Target, Sliders, Calculator, Sparkles, CheckCircle2, Clock
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip 
} from 'recharts';
import { format } from 'date-fns';

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

export type ExpenseBucket = 'cogs' | 'opex' | 'capex' | 'dividend';

export default function Finance({ userSettings }: { userSettings?: any }) {
  const { i18n } = useTranslation();
  const [subView, setSubView] = useState<'transactions' | 'debts' | 'breakeven'>('transactions');

  const [transactions, setTransactions] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);

  // Time Filter
  const [timeFilter, setTimeFilter] = useState<'all' | 'monthly'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  // Transactions Form
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState('ຂາຍເຄື່ອງດື່ມ & ກາເຟ (Coffee & Drinks)');
  const [expenseBucket, setExpenseBucket] = useState<ExpenseBucket>('cogs');
  const [source, setSource] = useState<'cash' | 'onepay' | 'ldb'>('onepay');
  const [description, setDescription] = useState('');
  const [receiptImage, setReceiptImage] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Bucket (ປ່ຽນ 40 ລ້ານ ເປັນ CAPEX)
  const [editingBucketTx, setEditingBucketTx] = useState<any | null>(null);

  // Debts Form (AP/AR)
  const [debtType, setDebtType] = useState<'payable' | 'receivable'>('payable');
  const [debtPerson, setDebtPerson] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDueDate, setDebtDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [debtReceiptImage, setDebtReceiptImage] = useState('');
  const [debtRemark, setDebtRemark] = useState('');

  // 🎯 SALES TARGET & PAYBACK FORMULA PLANNER STATE
  const [targetMonths, setTargetMonths] = useState<number>(7);         // 🌟 ເປົ້າໝາຍຄືນທຶນ: 7 ເດືອນ
  const [investmentGoal, setInvestmentGoal] = useState<number>(40000000); // ເງິນລົງທຶນ: 40 ລ້ານ
  const [monthlyOpex, setMonthlyOpex] = useState<number>(12000000);       // ຄ່າເຊົ່າ-ເງິນເດືອນ: 12 ລ້ານ/ເດືອນ
  const [unitSellingPrice, setUnitSellingPrice] = useState<number>(25000); // ລາຄາຂາຍ/ກ້ອນ: 25,000 ₭
  const [unitVariableCost, setUnitVariableCost] = useState<number>(11000); // ຕົ້ນທຶນວັດຖຸດິບ/ກ້ອນ: 11,000 ₭

  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [selectedSupplierItems, setSelectedSupplierItems] = useState<{ [id: string]: boolean }>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Firestore Listeners with Client-Side Safe Sorting (ບໍ່ມີ Error Index)
  useEffect(() => {
    const unsubTx = onSnapshot(collection(db, 'transactions'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`));
      setTransactions(data);
    }, err => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    const unsubSp = onSnapshot(collection(db, 'supplierPrices'), snap => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'supplierPrices'));

    const unsubPr = onSnapshot(collection(db, 'products'), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'products'));

    const unsubDebts = onSnapshot(collection(db, 'debts'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0));
      setDebts(data);
    }, err => console.error("Debts load error:", err));

    return () => { unsubTx(); unsubSp(); unsubPr(); unsubDebts(); };
  }, []);

  const filteredTransactions = useMemo(() => {
    if (timeFilter === 'monthly') {
      return transactions.filter(t => t.date && String(t.date).startsWith(selectedMonth));
    }
    return transactions;
  }, [transactions, timeFilter, selectedMonth]);

  const metrics = useMemo(() => {
    let totalIncome = 0, totalExpense = 0, cogsTotal = 0, opexTotal = 0, capexTotal = 0, dividendTotal = 0;
    filteredTransactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        totalIncome += amt;
      } else {
        totalExpense += amt;
        const b = (t.expenseBucket || 'cogs') as ExpenseBucket;
        if (b === 'cogs') cogsTotal += amt;
        else if (b === 'opex') opexTotal += amt;
        else if (b === 'capex') capexTotal += amt;
        else if (b === 'dividend') dividendTotal += amt;
      }
    });

    return { totalIncome, totalExpense, cogsTotal, opexTotal, capexTotal, dividendTotal };
  }, [filteredTransactions]);

  const debtMetrics = useMemo(() => {
    const list = Array.isArray(debts) ? debts : [];
    const totalPayable = list.filter(d => d && d.type === 'payable' && d.status !== 'settled').reduce((sum, d) => sum + (Number(d?.amount) || 0), 0);
    const totalReceivable = list.filter(d => d && d.type === 'receivable' && d.status !== 'settled').reduce((sum, d) => sum + (Number(d?.amount) || 0), 0);
    return { totalPayable, totalReceivable };
  }, [debts]);

  // 🎯 FORMULA CALCULATIONS: ສູດຄິດໄລ່ເປົ້າໝາຍຍອດຂາຍ & ໄລຍະເວລາຄືນທຶນ
  const salesPlannerFormula = useMemo(() => {
    // 1. ກຳໄລສ່ວນເກີນຕໍ່ກ້ອນ (Contribution Margin)
    const marginPerUnit = Math.max(0, unitSellingPrice - unitVariableCost);
    const marginPercent = unitSellingPrice > 0 ? (marginPerUnit / unitSellingPrice) * 100 : 0;

    // 2. ຈຸດຄຸ້ມທຶນລາຍວັນເພື່ອລອດ OPEX (Daily BEP for OPEX)
    const dailyBETOpex = marginPerUnit > 0 ? Math.ceil(monthlyOpex / (marginPerUnit * 30)) : 0;
    const monthlyBETOpex = dailyBETOpex * 30;

    // 3. ເປົ້າໝາຍກຳໄລທີ່ຕ້ອງເກັບຕໍ່ເດືອນເພື່ອຄືນທຶນພາຍໃນ T ເດືອນ
    const safeMonths = Math.max(1, targetMonths);
    const monthlyRecoveryQuota = investmentGoal / safeMonths;

    // 4. ກຳໄລລວມທີ່ຕ້ອງເຮັດໃຫ້ໄດ້ຕໍ່ເດືອນ (OPEX + ເງິນຄືນທຶນ)
    const totalGrossProfitNeededMonthly = monthlyOpex + monthlyRecoveryQuota;

    // 5. ຈຳນວນກ້ອນທີ່ຕ້ອງຂາຍຕໍ່ເດືອນ & ຕໍ່ວັນ ເພື່ອຄືນທຶນໃນ T ເດືອນ (🌟 ສູດຫຼັກ!)
    const targetMonthlyPieces = marginPerUnit > 0 ? Math.ceil(totalGrossProfitNeededMonthly / marginPerUnit) : 0;
    const targetDailyPieces = Math.ceil(targetMonthlyPieces / 30);
    const targetDailyRevenue = targetDailyPieces * unitSellingPrice;
    const targetMonthlyRevenue = targetMonthlyPieces * unitSellingPrice;

    // 6. ຈຳນວນກ້ອນທັງໝົດທີ່ຕ້ອງຂາຍຕະຫຼອດຊີວິດເພື່ອຄືນທຶນ 40 ລ້ານ
    const totalPiecesToRecoverAll = marginPerUnit > 0 ? Math.ceil(investmentGoal / marginPerUnit) : 0;

    // 7. Month-by-Month Payback Timeline (1 ຫາ T ເດືອນ)
    const timeline = Array.from({ length: Math.min(12, safeMonths) }, (_, i) => {
      const monthNum = i + 1;
      const accumulatedRecovered = Math.min(investmentGoal, monthNum * monthlyRecoveryQuota);
      const percentDone = Math.min(100, (accumulatedRecovered / investmentGoal) * 100);
      return {
        month: `ເດືອນ ${monthNum}`,
        accumulatedRecovered,
        percentDone
      };
    });

    return {
      marginPerUnit,
      marginPercent,
      dailyBETOpex,
      monthlyBETOpex,
      monthlyRecoveryQuota,
      targetDailyPieces,
      targetMonthlyPieces,
      targetDailyRevenue,
      targetMonthlyRevenue,
      totalPiecesToRecoverAll,
      timeline
    };
  }, [targetMonths, investmentGoal, monthlyOpex, unitSellingPrice, unitVariableCost]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmt = Number(amount.replace(/,/g, ''));
    if (!rawAmt) return;

    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'transactions'), {
        type,
        amount: rawAmt,
        category,
        expenseBucket: type === 'expense' ? expenseBucket : null,
        source,
        description: description.trim(),
        receiptImage,
        date,
        time,
        createdAt: serverTimestamp()
      });
      setAmount('');
      setDescription('');
      setReceiptImage('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmt = Number(debtAmount.replace(/,/g, ''));
    if (!rawAmt || !debtPerson.trim()) return;

    await addDoc(collection(db, 'debts'), {
      type: debtType,
      person: debtPerson.trim(),
      amount: rawAmt,
      dueDate: debtDueDate,
      receiptImage: debtReceiptImage,
      remark: debtRemark.trim(),
      status: 'pending',
      createdAt: serverTimestamp()
    });
    setDebtPerson('');
    setDebtAmount('');
    setDebtReceiptImage('');
    setDebtRemark('');
  };

  const handleConfirmImportSupplierItems = async () => {
    const selectedIds = Object.keys(selectedSupplierItems).filter(id => selectedSupplierItems[id]);
    if (selectedIds.length === 0) return;

    const itemsToImport = supplierPrices.filter(sp => selectedIds.includes(sp.id));
    const promises = itemsToImport.map(sp => {
      const prod = products.find(p => p.id === sp.productId);
      const catType = prod?.categoryType || (prod?.isDurable ? 'EQUIPMENT' : 'COGS');

      let bucket: ExpenseBucket = 'cogs';
      let categoryName = 'ຊື້ເຄື່ອງເຂົ້າຮ້ານ (ຕົ້ນທຶນວັດຖຸດິບ COGS)';

      if (catType === 'EQUIPMENT') {
        bucket = 'capex';
        categoryName = 'ການບໍລິຫານຈັດການ: ອຸປະກອນຄົງທີ່ (Equipment & Machines)';
      } else if (catType === 'OPERATIONAL') {
        bucket = 'opex';
        categoryName = 'ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ: ເຄື່ອງໃຊ້ສິ້ນເປືອງ (Consumables)';
      }

      const totalLAK = sp.totalPriceLAK || (sp.currency === 'LAK' ? sp.priceOriginal : sp.priceOriginal * sp.exchangeRate);

      return addDoc(collection(db, 'transactions'), {
        type: 'expense',
        amount: totalLAK,
        category: categoryName,
        expenseBucket: bucket,
        source: 'onepay',
        description: `ຊື້ ${prod?.name || 'ສິນຄ້າ'} ຈາກ ${sp.supplier} (${sp.quantity}ແພັກ)`,
        receiptImage: sp.receiptImage || '',
        date: sp.date || format(new Date(), 'yyyy-MM-dd'),
        time: sp.time || '12:00',
        createdAt: serverTimestamp()
      });
    });

    await Promise.all(promises);
    setSelectedSupplierItems({});
    setIsSupplierModalOpen(false);
  };

  const handleUpdateBucket = async (txId: string, newBucket: ExpenseBucket) => {
    let newCategory = 'ຄ່າຮຽນສູດ & R&D ເມນູໃໝ່ (CAPEX)';
    if (newBucket === 'cogs') newCategory = 'ຊື້ເຄື່ອງເຂົ້າຮ້ານ (ຕົ້ນທຶນວັດຖຸດິບ COGS)';
    else if (newBucket === 'opex') newCategory = 'ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ (OPEX)';
    else if (newBucket === 'dividend') newCategory = 'ປັນຜົນຫຸ້ນສ່ວນ (Dividend)';

    await updateDoc(doc(db, 'transactions', txId), {
      expenseBucket: newBucket,
      category: newCategory
    });
    setEditingBucketTx(null);
  };

  const groupedSupplierPricesByDate = useMemo(() => {
    const groups: { [dateStr: string]: any[] } = {};
    supplierPrices.forEach(sp => {
      const d = sp.date || 'No Date';
      if (!groups[d]) groups[d] = [];
      groups[d].push(sp);
    });
    return groups;
  }, [supplierPrices]);

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-xs">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Corporate Finance
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-800 dark:text-white mt-1">
            Financial Ledger & Sales Target Planning
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {timeFilter === 'monthly' ? `ສະແດງຂໍ້ມູນປະຈຳເດືອນ: ${selectedMonth}` : 'ສະແດງຂໍ້ມູນການເງິນສະສົມທັງໝົດ (All-Time)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl border border-slate-200 dark:border-neutral-800">
            <button onClick={() => setTimeFilter('all')} className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${timeFilter === 'all' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 shadow-xs' : 'text-slate-400'}`}>ທັງໝົດ</button>
            <button onClick={() => setTimeFilter('monthly')} className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${timeFilter === 'monthly' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 shadow-xs' : 'text-slate-400'}`}>ລາຍເດືອນ</button>
          </div>

          {timeFilter === 'monthly' && (
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="crystal-input !py-1.5 !text-xs font-mono font-bold" />
          )}

          {subView === 'transactions' && (
            <button onClick={() => setIsSupplierModalOpen(true)} className="crystal-button !py-2.5 !px-4 flex items-center gap-2 cursor-pointer">
              <Receipt className="w-4 h-4" />
              <span>ດຶງຈາກໃບບິນ Supplier</span>
            </button>
          )}
        </div>
      </div>

      {/* 3 Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSubView('transactions')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subView === 'transactions' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          ບັນຊີລາຍຮັບ-ລາຍຈ່າຍ (Ledger)
        </button>
        <button
          onClick={() => setSubView('debts')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${subView === 'debts' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          <HandCoins className="w-3.5 h-3.5" />
          <span>ໜີ້ຕ້ອງສົ່ງ & ໜີ້ຕ້ອງຮັບ (AP / AR)</span>
        </button>
        <button
          onClick={() => setSubView('breakeven')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${subView === 'breakeven' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          <Target className="w-3.5 h-3.5 text-amber-500" />
          <span>🎯 ສູດຄຳນວນເປົ້າໝາຍຍອດຂາຍ & ຄືນທຶນ (Payback Planner)</span>
        </button>
      </div>

      {/* VIEW 1: TRANSACTIONS */}
      {subView === 'transactions' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="high-density-card p-5 space-y-1">
              <span className="label-xs flex justify-between"><span>ລາຍຮັບລວມ</span><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span></span>
              <h2 className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">+{metrics.totalIncome.toLocaleString()} ₭</h2>
            </div>
            <div className="high-density-card p-5 space-y-1">
              <span className="label-xs flex justify-between"><span>COGS ຕົ້ນທຶນວັດຖຸດິບ</span><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span></span>
              <h2 className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-2">-{metrics.cogsTotal.toLocaleString()} ₭</h2>
            </div>
            <div className="high-density-card p-5 space-y-1">
              <span className="label-xs flex justify-between"><span>OPEX ດຳເນີນງານ</span><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span></span>
              <h2 className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-2">-{metrics.opexTotal.toLocaleString()} ₭</h2>
            </div>
            <div className="high-density-card p-5 space-y-1">
              <span className="label-xs flex justify-between"><span>CAPEX & ອຸປະກອນ/ສູດ</span><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span></span>
              <h2 className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400 mt-2">-{metrics.capexTotal.toLocaleString()} ₭</h2>
            </div>
            <div className="high-density-card p-5 space-y-1">
              <span className="label-xs flex justify-between"><span>ປັນຜົນ (Dividend)</span><span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span></span>
              <h2 className="text-xl font-bold font-mono text-pink-600 dark:text-pink-400 mt-2">-{metrics.dividendTotal.toLocaleString()} ₭</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4">
              <div className="high-density-card p-6 space-y-4 sticky top-20">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white border-b border-slate-100 dark:border-neutral-800 pb-3">ບັນທຶກລາຍການໃໝ່</h3>
                <form onSubmit={handleAddTransaction} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                    <button type="button" onClick={() => setType('income')} className={`py-2 text-xs font-bold rounded-xl cursor-pointer ${type === 'income' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}>+ ລາຍຮັບ</button>
                    <button type="button" onClick={() => setType('expense')} className={`py-2 text-xs font-bold rounded-xl cursor-pointer ${type === 'expense' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}>- ລາຍຈ່າຍ</button>
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ຈຳນວນເງິນ (LAK)</label>
                    <input type="text" required placeholder="0" value={amount} onChange={e => setAmount(Number(e.target.value.replace(/,/g, '') || 0).toLocaleString())} className="crystal-input w-full font-mono text-lg font-bold" />
                  </div>

                  {type === 'expense' && (
                    <div>
                      <label className="label-xs block mb-1">ກຸ່ມຕົ້ນທຶນ</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'cogs', name: 'COGS ວັດຖຸດິບ' },
                          { id: 'opex', name: 'OPEX ດຳເນີນງານ' },
                          { id: 'capex', name: 'CAPEX ອຸປະກອນ/ສູດ' },
                          { id: 'dividend', name: 'ປັນຜົນ' }
                        ].map(b => (
                          <button key={b.id} type="button" onClick={() => setExpenseBucket(b.id as any)} className={`p-2 rounded-xl text-xs font-bold border text-left ${expenseBucket === b.id ? 'border-[#052659] dark:border-white bg-[#052659]/5 dark:bg-white/5 font-black' : 'border-slate-200 dark:border-neutral-800 text-slate-400'}`}>
                            {b.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label-xs block mb-1">ຊ່ອງທາງຊຳລະ</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['cash', 'onepay', 'ldb'].map(s => (
                        <button key={s} type="button" onClick={() => setSource(s as any)} className={`py-2 text-xs font-bold rounded-xl border uppercase ${source === s ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 border-transparent' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label-xs flex justify-between mb-1"><span>ຮູບໃບບິນ (Ctrl+V)</span></label>
                    <div className="border border-dashed border-slate-200 dark:border-neutral-700 rounded-xl p-2.5 relative flex items-center justify-between hover:bg-slate-50 dark:hover:bg-neutral-800/40">
                      <input type="file" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) setReceiptImage(await compressImage(file));
                      }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                      {receiptImage ? (
                        <div className="flex items-center gap-2 w-full justify-between">
                          <img src={receiptImage} alt="Receipt" className="w-8 h-8 rounded-lg object-cover border border-neutral-700" />
                          <span className="text-[10px] text-emerald-500 font-bold">ອັບໂຫຼດຮູບແລ້ວ ✓</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setReceiptImage(''); }} className="text-rose-500 p-1">✕</button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 mx-auto flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> ຄລິກ ຫຼື ວາງຮູບ (Ctrl+V)</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ລາຍລະອຽດ</label>
                    <input type="text" placeholder="ລາຍລະອຽດ..." value={description} onChange={e => setDescription(e.target.value)} className="crystal-input w-full !text-xs" />
                  </div>

                  <button type="submit" disabled={isSubmitting} className="crystal-button w-full h-11">
                    {isSubmitting ? 'Saving...' : 'ບັນທຶກລາຍການ'}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="high-density-card p-5 overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-serif text-slate-800 dark:text-white">ປະຫວັດທຸລະກຳ</h3>
                  <span className="text-[10px] text-slate-400">ຄລິກປ້າຍກຸ່ມຕົ້ນທຶນເພື່ອປ່ຽນ OPEX ➔ CAPEX ໄດ້</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
                      <tr>
                        <th className="p-3">ວັນທີ</th>
                        <th className="p-3">ລາຍລະອຽດ</th>
                        <th className="p-3">ກຸ່ມຕົ້ນທຶນ</th>
                        <th className="p-3 text-right">ຈຳນວນເງິນ</th>
                        <th className="p-3 text-center">ໃບບິນ</th>
                        <th className="p-3 text-center">ຈັດການ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                      {filteredTransactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                          <td className="p-3 font-mono text-slate-400 whitespace-nowrap">{t.date}</td>
                          <td className="p-3">
                            <span className="font-bold text-slate-800 dark:text-white block">{t.description || t.category}</span>
                            <span className="text-[10px] text-slate-400 font-mono uppercase">{t.source}</span>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span 
                              onClick={() => setEditingBucketTx(t)}
                              className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase cursor-pointer hover:scale-105 transition-transform inline-flex items-center gap-1 ${
                                t.expenseBucket === 'capex' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                t.expenseBucket === 'cogs' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                t.expenseBucket === 'dividend' ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' :
                                'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              }`}
                            >
                              {t.expenseBucket ? t.expenseBucket.toUpperCase() : (t.type === 'income' ? 'INCOME' : 'OPEX')} ✏️
                            </span>
                          </td>
                          <td className={`p-3 text-right font-mono font-bold whitespace-nowrap ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {t.type === 'income' ? '+' : '-'}{Number(t.amount).toLocaleString()} ₭
                          </td>
                          <td className="p-3 text-center">
                            {t.receiptImage ? (
                              <button onClick={() => setPreviewImage(t.receiptImage)} className="p-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 cursor-pointer">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            ) : <span className="text-slate-500">-</span>}
                          </td>
                          <td className="p-3 text-center">
                            <button onClick={() => deleteDoc(doc(db, 'transactions', t.id))} className="text-slate-400 hover:text-rose-500 cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* VIEW 2: DEBTS (AP / AR) */}
      {subView === 'debts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="high-density-card p-6">
              <span className="label-xs text-rose-500">ໜີ້ຕ້ອງສົ່ງທັງໝົດ (AP - ຕິດໜີ້ເພິ່ນ)</span>
              <h2 className="text-2xl font-serif font-bold text-rose-600 dark:text-rose-400 mt-2">{(debtMetrics?.totalPayable || 0).toLocaleString()} ₭</h2>
            </div>
            <div className="high-density-card p-6">
              <span className="label-xs text-emerald-500">ໜີ້ຕ້ອງຮັບທັງໝົດ (AR - ລູກຄ້າຕິດໜີ້)</span>
              <h2 className="text-2xl font-serif font-bold text-emerald-600 dark:text-emerald-400 mt-2">{(debtMetrics?.totalReceivable || 0).toLocaleString()} ₭</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4">
              <div className="high-density-card p-6 space-y-4">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white">ບັນທຶກໜີ້ສິນ (AP/AR)</h3>
                <form onSubmit={handleAddDebt} className="space-y-3">
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                    <button type="button" onClick={() => setDebtType('payable')} className={`py-2 text-xs font-bold rounded-xl ${debtType === 'payable' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}>ໜີ້ຕ້ອງສົ່ງ (AP)</button>
                    <button type="button" onClick={() => setDebtType('receivable')} className={`py-2 text-xs font-bold rounded-xl ${debtType === 'receivable' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}>ໜີ້ຕ້ອງຮັບ (AR)</button>
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ຊື່ຄູ່ຄ້າ / ບຸກຄົນ</label>
                    <input type="text" required placeholder="ເຊັ່ນ: ຮ້ານ LATDA..." value={debtPerson} onChange={e => setDebtPerson(e.target.value)} className="crystal-input w-full !text-xs font-bold" />
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ຈຳນວນເງິນ (LAK)</label>
                    <input type="text" required placeholder="0" value={debtAmount} onChange={e => setDebtAmount(Number(e.target.value.replace(/,/g, '') || 0).toLocaleString())} className="crystal-input w-full font-mono text-base font-bold" />
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ກຳນົດຊຳລະ</label>
                    <input type="date" required value={debtDueDate} onChange={e => setDebtDueDate(e.target.value)} className="crystal-input w-full !text-xs font-mono" />
                  </div>

                  <button type="submit" className="crystal-button w-full h-11">ບັນທຶກໜີ້ສິນ</button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="high-density-card p-5 overflow-hidden">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white mb-4">ລາຍການໜີ້ສິນທັງໝົດ</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
                      <tr>
                        <th className="p-3">ປະເພດ</th>
                        <th className="p-3">ຊື່ຄູ່ຄ້າ</th>
                        <th className="p-3">ກຳນົດຊຳລະ</th>
                        <th className="p-3 text-right">ຈຳນວນເງິນ</th>
                        <th className="p-3 text-center">ສະຖານະ</th>
                        <th className="p-3 text-center">ລຶບ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                      {(debts || []).map(d => {
                        if (!d) return null;
                        return (
                          <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${d.type === 'payable' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                {d.type === 'payable' ? 'ໜີ້ຕ້ອງສົ່ງ' : 'ໜີ້ຕ້ອງຮັບ'}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-slate-800 dark:text-white">{d.person || 'General'}</td>
                            <td className="p-3 font-mono text-slate-400">{d.dueDate || '-'}</td>
                            <td className="p-3 text-right font-mono font-bold">{Number(d.amount || 0).toLocaleString()} ₭</td>
                            <td className="p-3 text-center">
                              <button onClick={() => updateDoc(doc(db, 'debts', d.id), { status: d.status === 'settled' ? 'pending' : 'settled' })} className={`px-2.5 py-1 rounded-xl text-[9px] font-bold ${d.status === 'settled' ? 'bg-emerald-500 text-white' : 'bg-amber-500/10 text-amber-500'}`}>
                                {d.status === 'settled' ? 'ຊຳລະແລ້ວ ✓' : 'ຄ້າງຊຳລະ'}
                              </button>
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => deleteDoc(doc(db, 'debts', d.id))} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🎯 VIEW 3: SALES TARGET & PAYBACK FORMULA PLANNER (ສູດຄິດໄລ່ເປົ້າໝາຍຍອດຂາຍຕົວຈິງ) */}
      {subView === 'breakeven' && (
        <div className="space-y-6">
          
          {/* 🌟 4 ANSWER CARDS: ສະຫຼຸບຄຳຕອບເປົ້າໝາຍຍອດຂາຍ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Card 1: ຕ້ອງຂາຍມື້ລະຈັກກ້ອນເພື່ອຄືນທຶນໃນ T ເດືອນ (ຄຳຕອບຫຼັກ!) */}
            <div className="high-density-card p-6 space-y-1 bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/30">
              <span className="label-xs !text-amber-600 dark:text-amber-400 flex justify-between">
                <span>ເປົ້າໝາຍຂາຍຕໍ່ວັນ (ຄືນທຶນໃນ {targetMonths} ເດືອນ)</span>
                <Target className="w-4 h-4 text-amber-500" />
              </span>
              <h2 className="text-3xl font-serif font-bold text-amber-600 dark:text-amber-400 mt-2 font-mono">
                {salesPlannerFormula.targetDailyPieces.toLocaleString()} <span className="text-xs font-sans font-normal opacity-80">ກ້ອນ / ວັນ</span>
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-neutral-400 block font-light pt-1">
                ຍອດຂາຍທີ່ຕ້ອງໄດ້: <b className="text-slate-800 dark:text-white font-mono">{Math.round(salesPlannerFormula.targetDailyRevenue).toLocaleString()} ₭ / ວັນ</b>
              </span>
            </div>

            {/* Card 2: ຂາຍຂັ້ນຕ່ຳຕໍ່ວັນເພື່ອລອດ OPEX (ຄ່າເຊົ່າ & ເງິນເດືອນ) */}
            <div className="high-density-card p-6 space-y-1">
              <span className="label-xs flex justify-between">
                <span>ຂາຍຂັ້ນຕ່ຳເພື່ອລອດ (BEP OPEX)</span>
                <Calculator className="w-4 h-4 text-sky-500" />
              </span>
              <h2 className="text-3xl font-serif font-bold text-slate-800 dark:text-white mt-2 font-mono">
                {salesPlannerFormula.dailyBETOpex.toLocaleString()} <span className="text-xs font-sans font-normal opacity-70">ກ້ອນ / ວັນ</span>
              </h2>
              <span className="text-[11px] text-slate-400 block font-light pt-1">
                ກວມຄ່າເຊົ່າ & ເງິນເດືອນ {monthlyOpex.toLocaleString()} ₭/ເດືອນ
              </span>
            </div>

            {/* Card 3: ຈຳນວນກ້ອນທັງໝົດທີ່ຕ້ອງຂາຍເພື່ອຄືນ 40 ລ້ານ */}
            <div className="high-density-card p-6 space-y-1">
              <span className="label-xs flex justify-between">
                <span>ຈຳນວນກ້ອນທັງໝົດເພື່ອຄືນທຶນ</span>
                <Sparkles className="w-4 h-4 text-emerald-500" />
              </span>
              <h2 className="text-3xl font-serif font-bold text-emerald-500 mt-2 font-mono">
                {salesPlannerFormula.totalPiecesToRecoverAll.toLocaleString()} <span className="text-xs font-sans font-normal opacity-70">ກ້ອນ</span>
              </h2>
              <span className="text-[11px] text-slate-400 block font-light pt-1">
                ກຳໄລສ່ວນເກີນ: <b className="text-emerald-500 font-mono">+{salesPlannerFormula.marginPerUnit.toLocaleString()} ₭ / ກ້ອນ</b> ({salesPlannerFormula.marginPercent.toFixed(0)}%)
              </span>
            </div>

            {/* Card 4: ກຳໄລສຸດທິທີ່ຕ້ອງເກັບຕໍ່ເດືອນ */}
            <div className="high-density-card p-6 space-y-1">
              <span className="label-xs flex justify-between">
                <span>ເງິນຄືນທຶນທີ່ຕ້ອງຕັດ/ເດືອນ</span>
                <Clock className="w-4 h-4 text-purple-500" />
              </span>
              <h2 className="text-3xl font-serif font-bold text-purple-500 mt-2 font-mono">
                {Math.round(salesPlannerFormula.monthlyRecoveryQuota).toLocaleString()} <span className="text-xs font-sans font-normal opacity-70">₭</span>
              </h2>
              <span className="text-[11px] text-slate-400 block font-light pt-1">
                {investmentGoal.toLocaleString()} ₭ ÷ {targetMonths} ເດືອນ
              </span>
            </div>

          </div>

          {/* 🎛️ CONTROLS & FORMULA PARAMETERS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Control Panel (6 cols) */}
            <div className="lg:col-span-6 high-density-card p-6 space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-500" />
                  <span>ປັບຕົວເລກເປົ້າໝາຍ & ເວລາຄືນທຶນ</span>
                </h3>
              </div>

              {/* 🌟 ປຸ່ມກົດເລືອກເປົ້າໝາຍດ່ວນ: 3 ເດືອນ, 6 ເດືອນ, 7 ເດືອນ, 12 ເດືອນ */}
              <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/60 dark:border-neutral-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-700 dark:text-neutral-200">ເປົ້າໝາຍຢາກຄືນທຶນພາຍໃນ:</span>
                  <span className="font-mono font-black text-amber-500 bg-amber-500/10 px-3 py-1 rounded-xl text-sm border border-amber-500/20">
                    {targetMonths} ເດືອນ
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[3, 6, 7, 9, 12, 18, 24].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTargetMonths(m)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                        targetMonths === m 
                          ? 'bg-amber-500 text-white shadow-sm' 
                          : 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 hover:border-amber-500'
                      }`}
                    >
                      {m} ເດືອນ
                    </button>
                  ))}
                </div>

                <input
                  type="range"
                  min="1"
                  max="24"
                  value={targetMonths}
                  onChange={e => setTargetMonths(parseInt(e.target.value) || 1)}
                  className="w-full h-2 bg-neutral-200 dark:bg-neutral-800 rounded-lg cursor-pointer accent-amber-500 mt-2"
                />
              </div>

              {/* ເງິນລົງທຶນ (40 ລ້ານ) */}
              <div className="space-y-1">
                <label className="label-xs flex justify-between">
                  <span>1. ເງິນລົງທຶນທີ່ຕ້ອງການຄືນທຶນ (CAPEX / ຄ່າຮຽນສູດ)</span>
                  <span className="text-[10px] text-slate-400">ເງິນຕົ້ນ</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={investmentGoal ? investmentGoal.toLocaleString() : ''}
                    onChange={e => setInvestmentGoal(Number(e.target.value.replace(/,/g, '')) || 0)}
                    className="crystal-input w-full font-mono font-bold text-sm pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">₭</span>
                </div>
              </div>

              {/* ຄ່າເຊົ່າ & ເງິນເດືອນ (12 ລ້ານ) */}
              <div className="space-y-1">
                <label className="label-xs flex justify-between">
                  <span>2. ຄ່າໃຊ້ຈ່າຍຄົງທີ່ຕໍ່ເດືອນ (Fixed Monthly OPEX)</span>
                  <span className="text-[10px] text-slate-400">ຄ່າເຊົ່າ, ເງິນເດືອນ, ນ້ຳ-ໄຟ</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={monthlyOpex ? monthlyOpex.toLocaleString() : ''}
                    onChange={e => setMonthlyOpex(Number(e.target.value.replace(/,/g, '')) || 0)}
                    className="crystal-input w-full font-mono font-bold text-sm pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">₭</span>
                </div>
              </div>

              {/* ລາຄາຂາຍ & ຕົ້ນທຶນວັດຖຸດິບ */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="label-xs block mb-0.5">3. ລາຄາຂາຍ/ກ້ອນ</label>
                  <input
                    type="text"
                    value={unitSellingPrice ? unitSellingPrice.toLocaleString() : ''}
                    onChange={e => setUnitSellingPrice(Number(e.target.value.replace(/,/g, '')) || 0)}
                    className="crystal-input w-full font-mono font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="label-xs block mb-0.5">4. ຕົ້ນທຶນວັດຖຸດິບ/ກ້ອນ</label>
                  <input
                    type="text"
                    value={unitVariableCost ? unitVariableCost.toLocaleString() : ''}
                    onChange={e => setUnitVariableCost(Number(e.target.value.replace(/,/g, '')) || 0)}
                    className="crystal-input w-full font-mono font-bold text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Right Summary Timeline & Analysis (6 cols) */}
            <div className="lg:col-span-6 high-density-card p-6 flex flex-col justify-between space-y-5">
              <div>
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
                  <h3 className="text-sm font-serif text-slate-800 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    <span>ແຜນການຄືນທຶນລາຍເດືອນ (Payback Timeline)</span>
                  </h3>
                  <span className="text-xs font-mono text-emerald-500 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-lg">
                    {targetMonths} ເດືອນຄືນທຶນ 100%
                  </span>
                </div>

                {/* Timeline Progress Cards */}
                <div className="space-y-2.5 pt-3 max-h-64 overflow-y-auto pr-1">
                  {salesPlannerFormula.timeline.map((t, idx) => (
                    <div key={idx} className="p-3 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/60 dark:border-neutral-800 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-800 dark:text-white font-mono">{t.month}:</span>
                        <span className="font-mono font-bold text-emerald-500">
                          ສະສົມໄດ້ {Math.round(t.accumulatedRecovered).toLocaleString()} ₭ ({t.percentDone.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${t.percentDone}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 💡 Plain-Language Actionable Advice */}
              <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-xs space-y-1.5 leading-relaxed text-sky-900 dark:text-sky-200">
                <span className="font-bold block flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ບົດສະຫຼຸບເປົ້າໝາຍການຂາຍ:</span>
                </span>
                <p>
                  • ຖ້າທ່ານຕ້ອງການ **ຄືນທຶນ 40 ລ້ານພາຍໃນ {targetMonths} ເດືອນ**: ທ່ານຕ້ອງຕັ້ງເປົ້າຂາຍໃຫ້ໄດ້ຢ່າງໜ້ອຍ <b className="text-amber-500 font-mono text-sm">{salesPlannerFormula.targetDailyPieces} ກ້ອນ / ວັນ</b> (ຍອດຂາຍປະມານ <b className="font-mono">{Math.round(salesPlannerFormula.targetDailyRevenue).toLocaleString()} ₭/ວັນ</b>).
                </p>
                <p>
                  • ໃນ {salesPlannerFormula.targetDailyPieces} ກ້ອນນັ້ນ: **29 ກ້ອນທຳອິດ** ຈະໄປກວມເອົາຄ່າເຊົ່າ ແລະ ເງິນເດືອນ, ສ່ວນ **14 ກ້ອນທີ່ເຫຼືອ** ຈະກາຍເປັນເງິນກຳໄລສຸດທິເດືອນລະ <b className="font-mono text-emerald-500">{Math.round(salesPlannerFormula.monthlyRecoveryQuota).toLocaleString()} ₭</b> ມາຕັດຄືນຄ່າສູດ 40 ລ້ານໃຫ້ຄົບຖ້ວນໃນເດືອນທີ {targetMonths}!
                </p>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Modal ດຶງໃບບິນ Supplier */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsSupplierModalOpen(false)}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-2xl w-full space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-serif text-slate-800 dark:text-white">ດຶງລາຍການຈາກໃບບິນ Supplier ມາລົງບັນຊີ (COGS & CAPEX)</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ລະບົບຈະກວດສອບອັດຕະໂນມັດ ຖ້າເປັນອຸປະກອນຈະແລ່ນເຂົ້າ CAPEX, ຖ້າເປັນວັດຖຸດິບຈະເຂົ້າ COGS</p>
              </div>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-4">
              {Object.keys(groupedSupplierPricesByDate).length === 0 ? (
                <p className="text-center py-8 text-xs text-slate-400">ຍັງບໍ່ມີລາຍການຊື້ຈາກ Supplier</p>
              ) : (
                Object.keys(groupedSupplierPricesByDate).map(dateKey => (
                  <div key={dateKey} className="space-y-2 border border-slate-200/80 dark:border-neutral-800 rounded-2xl p-4">
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800/80 pb-2">
                      <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">📅 ວັນທີ: {dateKey}</span>
                      <span className="text-[10px] text-slate-400">{groupedSupplierPricesByDate[dateKey].length} ລາຍການ</span>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {groupedSupplierPricesByDate[dateKey].map(sp => {
                        const pr = products.find(p => p.id === sp.productId);
                        const catType = pr?.categoryType || (pr?.isDurable ? 'EQUIPMENT' : 'COGS');
                        const total = sp.totalPriceLAK || (sp.currency === 'LAK' ? sp.priceOriginal : sp.priceOriginal * sp.exchangeRate);
                        const isChecked = !!selectedSupplierItems[sp.id];

                        return (
                          <div 
                            key={sp.id} 
                            onClick={() => setSelectedSupplierItems(prev => ({ ...prev, [sp.id]: !prev[sp.id] }))}
                            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isChecked ? 'bg-emerald-500/10 border-emerald-500' : 'bg-slate-50 dark:bg-[#1a1a1a] border-slate-200/50 dark:border-neutral-800'}`}
                          >
                            <div className="flex items-center gap-3">
                              <input 
                                type="checkbox" 
                                checked={isChecked} 
                                onChange={() => {}} 
                                className="w-4 h-4 rounded text-emerald-500" 
                              />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                    catType === 'EQUIPMENT' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  }`}>
                                    {catType === 'EQUIPMENT' ? 'CAPEX (ອຸປະກອນ)' : 'COGS (ວັດຖຸດິບ)'}
                                  </span>
                                  <span className="text-xs font-bold text-slate-800 dark:text-white">{pr?.name || 'Item'}</span>
                                </div>
                                <span className="text-[10px] text-slate-400">{sp.supplier} • {sp.quantity}ແພັກ</span>
                              </div>
                            </div>
                            <span className="text-xs font-mono font-bold text-emerald-500">+{Math.round(total).toLocaleString()} ₭</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-neutral-800">
              <span className="text-xs text-slate-400">ເລືອກແລ້ວ: {Object.values(selectedSupplierItems).filter(Boolean).length} ລາຍການ</span>
              <button onClick={handleConfirmImportSupplierItems} className="crystal-button !py-2.5 !px-6">ດຶງເຂົ້າບັນຊີທັນທີ</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ປ່ຽນປະເພດຕົ້ນທຶນ (40M OPEX -> CAPEX) */}
      {editingBucketTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setEditingBucketTx(null)}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-serif text-slate-800 dark:text-white">ປ່ຽນປະເພດຕົ້ນທຶນ</h3>
            <p className="text-xs text-slate-400 leading-normal">
              ເລືອກກຸ່ມຕົ້ນທຶນໃໝ່ສຳລັບລາຍການ "{editingBucketTx.description || editingBucketTx.category}" ({Number(editingBucketTx.amount).toLocaleString()} ₭):
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={() => handleUpdateBucket(editingBucketTx.id, 'capex')} className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500 text-purple-400 font-bold text-xs text-left cursor-pointer">
                CAPEX (ຄ່າສູດ & ອຸປະກອນ)
              </button>
              <button onClick={() => handleUpdateBucket(editingBucketTx.id, 'cogs')} className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500 text-amber-400 font-bold text-xs text-left cursor-pointer">
                COGS ວັດຖຸດິບ
              </button>
              <button onClick={() => handleUpdateBucket(editingBucketTx.id, 'opex')} className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500 text-blue-400 font-bold text-xs text-left cursor-pointer">
                OPEX ດຳເນີນງານ
              </button>
              <button onClick={() => handleUpdateBucket(editingBucketTx.id, 'dividend')} className="p-3 rounded-2xl bg-pink-500/10 border border-pink-500 text-pink-400 font-bold text-xs text-left cursor-pointer">
                ປັນຜົນ (Dividend)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Image Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-xl max-h-[85vh] bg-[#141414] rounded-3xl p-3 border border-neutral-800" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white cursor-pointer">✕</button>
            <img src={previewImage} alt="Receipt" className="w-full h-auto max-h-[80vh] object-contain rounded-2xl" />
          </div>
        </div>
      )}

    </div>
  );
}
