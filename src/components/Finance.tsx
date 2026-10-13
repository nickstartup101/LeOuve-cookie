import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, addDoc, onSnapshot, 
  deleteDoc, doc, serverTimestamp, updateDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  DollarSign, TrendingUp, Wallet, CreditCard, 
  Plus, Trash2, Edit2, Calendar, Clock,
  Download, QrCode, Building2,
  HandCoins, Receipt, Upload, Eye, Target, Sliders, Calculator, Sparkles, X, ZoomIn, CheckCircle2
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip 
} from 'recharts';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';

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
  const [recipes, setRecipes] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [posBills, setPosBills] = useState<any[]>([]);

  // Time Filter
  const [timeFilter, setTimeFilter] = useState<'all' | 'monthly'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  // 📝 Form State: ບັນທຶກລາຍການໃໝ່ (ເລືອກວັນທີ & ເວລາໄດ້)
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState('ຊື້ເຄື່ອງເຂົ້າຮ້ານ (ຕົ້ນທຶນວັດຖຸດິບ COGS)');
  const [expenseBucket, setExpenseBucket] = useState<ExpenseBucket>('cogs');
  const [source, setSource] = useState<'cash' | 'onepay' | 'ldb'>('onepay');
  const [description, setDescription] = useState('');
  const [receiptImage, setReceiptImage] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd')); // 🌟 ວັນທີ
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));       // 🌟 ເວລາ
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✏️ Edit Transaction State (ແກ້ໄຂທຸລະກຳທີ່ບັນທຶກໄປແລ້ວ)
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [editAmountDisplay, setEditAmountDisplay] = useState('');

  // Debts Form (AP/AR)
  const [debtType, setDebtType] = useState<'payable' | 'receivable'>('payable');
  const [debtPerson, setDebtPerson] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDueDate, setDebtDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [debtReceiptImage, setDebtReceiptImage] = useState('');
  const [debtRemark, setDebtRemark] = useState('');

  // 🎯 Break-Even Simulator
  const [targetMonths, setTargetMonths] = useState<number>(7);
  const [investmentGoal, setInvestmentGoal] = useState<number>(40000000);
  const [monthlyOpex, setMonthlyOpex] = useState<number>(12000000);
  const [unitSellingPrice, setUnitSellingPrice] = useState<number>(25000);
  const [unitVariableCost, setUnitVariableCost] = useState<number>(11000);

  // 📥 Drawer ດຶງໃບບິນ Supplier (ເລືອກຕາມວັນທີ, Default = ວັນປັດຈຸບັນ)
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [importFilterDate, setImportFilterDate] = useState<string>(format(new Date(), 'yyyy-MM-dd')); // 🌟 Default = Today
  const [selectedSupplierItems, setSelectedSupplierItems] = useState<{ [id: string]: boolean }>({});

  // Image & POS Virtual Bill Viewers
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewingPosBill, setViewingPosBill] = useState<any | null>(null);

  // 🔄 Realtime Subscriptions
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

    const unsubBills = onSnapshot(collection(db, 'pos_bills'), snap => {
      setPosBills(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error("POS bills load error:", err));

    return () => { unsubTx(); unsubSp(); unsubPr(); unsubDebts(); unsubBills(); };
  }, []);

  // 📋 ຮອງຮັບ Paste ຮູບ (Ctrl+V) ທັງໃນຟອມບັນທຶກ ແລະ ແກ້ໄຂ
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const base64 = await compressImage(file);
            if (editingTx) {
              setEditingTx((prev: any) => ({ ...prev, receiptImage: base64 }));
            } else if (subView === 'transactions') {
              setReceiptImage(base64);
            } else if (subView === 'debts') {
              setDebtReceiptImage(base64);
            }
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [editingTx, subView]);

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

  // Break-even
  const salesPlannerFormula = useMemo(() => {
    const marginPerUnit = Math.max(0, unitSellingPrice - unitVariableCost);
    const marginPercent = unitSellingPrice > 0 ? (marginPerUnit / unitSellingPrice) * 100 : 0;
    const dailyBETOpex = marginPerUnit > 0 ? Math.ceil(monthlyOpex / (marginPerUnit * 30)) : 0;
    const safeMonths = Math.max(1, targetMonths);
    const monthlyRecoveryQuota = investmentGoal / safeMonths;
    const totalGrossProfitNeededMonthly = monthlyOpex + monthlyRecoveryQuota;
    const targetMonthlyPieces = marginPerUnit > 0 ? Math.ceil(totalGrossProfitNeededMonthly / marginPerUnit) : 0;
    const targetDailyPieces = Math.ceil(targetMonthlyPieces / 30);
    const targetDailyRevenue = targetDailyPieces * unitSellingPrice;
    const totalPiecesToRecoverAll = marginPerUnit > 0 ? Math.ceil(investmentGoal / marginPerUnit) : 0;

    return {
      marginPerUnit,
      marginPercent,
      dailyBETOpex,
      monthlyRecoveryQuota,
      targetDailyPieces,
      targetDailyRevenue,
      totalPiecesToRecoverAll
    };
  }, [targetMonths, investmentGoal, monthlyOpex, unitSellingPrice, unitVariableCost]);

  // 📝 ບັນທຶກລາຍການໃໝ່
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
        date, // 🌟 ວັນທີທີ່ເລືອກ
        time, // 🌟 ເວລາທີ່ເລືອກ
        createdAt: serverTimestamp()
      });
      setAmount('');
      setDescription('');
      setReceiptImage('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✏️ ເປີດ Modal ແກ້ໄຂທຸລະກຳ
  const handleOpenEditTx = (tx: any) => {
    setEditingTx({
      ...tx,
      amountInput: tx.amount,
      expenseBucket: tx.expenseBucket || (tx.type === 'income' ? null : 'opex'),
      source: tx.source || 'onepay',
      receiptImage: tx.receiptImage || ''
    });
    setEditAmountDisplay(Number(tx.amount).toLocaleString());
  };

  // 💾 ບັນທຶກການແກ້ໄຂທຸລະກຳ
  const handleSaveEditedTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;

    const rawAmt = Number(String(editingTx.amountInput).replace(/,/g, ''));
    if (!rawAmt) return;

    await updateDoc(doc(db, 'transactions', editingTx.id), {
      type: editingTx.type,
      amount: rawAmt,
      category: editingTx.category,
      expenseBucket: editingTx.type === 'expense' ? editingTx.expenseBucket : null,
      source: editingTx.source,
      description: (editingTx.description || '').trim(),
      date: editingTx.date,
      time: editingTx.time || '12:00',
      receiptImage: editingTx.receiptImage || '',
      updatedAt: serverTimestamp()
    });

    setEditingTx(null);
  };

  // 📥 ດຶງໃບບິນ SUPPLIER ຕາມວັນທີທີ່ເລືອກ
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
        expenseBucket: bucket, // ✨ COGS vs CAPEX ອັດຕະໂນມັດ
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

  // 🔍 ກັ່ນຕອງໃບບິນ Supplier ຕາມວັນທີທີ່ເລືອກໃນ Modal (Default = Today)
  const filteredSupplierPricesForImport = useMemo(() => {
    if (importFilterDate === 'all') return supplierPrices;
    return supplierPrices.filter(sp => sp.date === importFilterDate);
  }, [supplierPrices, importFilterDate]);

  // ກວດສອບວ່າທຸລະກຳນີ້ເປັນບິນ POS ຫຼືບໍ່
  const handleCheckAndOpenPosBill = (tx: any) => {
    // ຄົ້ນຫາບິນ POS ທີ່ກົງກັບເລກບິນ ຫຼື ວັນທີ
    const matchedBill = posBills.find(b => 
      (tx.description && tx.description.includes(b.billNo)) || 
      (b.date === tx.date && Number(b.totalRevenue) === Number(tx.amount))
    );

    if (matchedBill) {
      setViewingPosBill(matchedBill);
    } else if (tx.receiptImage) {
      setPreviewImage(tx.receiptImage);
    } else {
      alert("ລາຍການນີ້ບໍ່ມີຮູບໃບບິນ ຫຼື ບໍ່ພົບຂໍ້ມູນບິນ POS ຕົ້ນສະບັບ");
    }
  };

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

      {/* Sub Tabs */}
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
          <span>ສູດຄຳນວນເປົ້າໝາຍຍອດຂາຍ & ຄືນທຶນ</span>
        </button>
      </div>

      {/* VIEW 1: TRANSACTIONS */}
      {subView === 'transactions' && (
        <>
          {/* Summary Cards */}
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
            
            {/* 📝 Form ບັນທຶກລາຍການໃໝ່ (ມີຊ່ອງເລືອກວັນທີ & ເວລາ) */}
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
                          <button key={b.id} type="button" onClick={() => setExpenseBucket(b.id as any)} className={`p-2 rounded-xl text-xs font-bold border text-left cursor-pointer ${expenseBucket === b.id ? 'border-[#052659] dark:border-white bg-[#052659]/5 dark:bg-white/5 font-black' : 'border-slate-200 dark:border-neutral-800 text-slate-400'}`}>
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
                        <button key={s} type="button" onClick={() => setSource(s as any)} className={`py-2 text-xs font-bold rounded-xl border uppercase cursor-pointer ${source === s ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 border-transparent' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 🌟 ຊ່ອງເລືອກວັນທີ & ເວລາ (ເລືອກວັນທີຍ້ອນຫຼັງໄດ້) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label-xs block mb-1">ວັນທີ</label>
                      <input 
                        type="date" 
                        required 
                        value={date} 
                        onChange={e => setDate(e.target.value)} 
                        className="crystal-input w-full !text-xs font-mono font-bold" 
                      />
                    </div>
                    <div>
                      <label className="label-xs block mb-1">ເວລາ</label>
                      <input 
                        type="time" 
                        required 
                        value={time} 
                        onChange={e => setTime(e.target.value)} 
                        className="crystal-input w-full !text-xs font-mono font-bold" 
                      />
                    </div>
                  </div>

                  {/* 📸 ຊ່ອງອັບໂຫຼດຮູບໃບບິນ (Drag/Drop & Ctrl+V) */}
                  <div>
                    <label className="label-xs flex justify-between mb-1">
                      <span>ຮູບໃບບິນ (Receipt Attachment)</span>
                      <span className="text-emerald-500 font-bold text-[9px]">Ctrl+V ວາງໄດ້</span>
                    </label>
                    <div 
                      onDragOver={e => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const files = e.dataTransfer.files;
                        if (files.length > 0 && files[0].type.startsWith('image/')) {
                          setReceiptImage(await compressImage(files[0]));
                        }
                      }}
                      className="border border-dashed border-slate-200 dark:border-neutral-700 rounded-xl p-2.5 relative flex items-center justify-between hover:bg-slate-50 dark:hover:bg-neutral-800/40 transition-colors cursor-pointer"
                    >
                      <input type="file" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) setReceiptImage(await compressImage(file));
                      }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                      {receiptImage ? (
                        <div className="flex items-center gap-2 w-full justify-between">
                          <img src={receiptImage} alt="Receipt" className="w-9 h-9 rounded-lg object-cover border border-neutral-700" />
                          <span className="text-xs text-emerald-500 font-bold">ອັບໂຫຼດຮູບແລ້ວ ✓</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setReceiptImage(''); }} className="text-rose-500 p-1">✕</button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 mx-auto flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> ຄລິກ, ລາກວາງ ຫຼື ກົດ Ctrl+V</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ລາຍລະອຽດ / ໝາຍເຫດ</label>
                    <input type="text" placeholder="ລາຍລະອຽດ..." value={description} onChange={e => setDescription(e.target.value)} className="crystal-input w-full !text-xs" />
                  </div>

                  <button type="submit" disabled={isSubmitting} className="crystal-button w-full h-11">
                    {isSubmitting ? 'Saving...' : 'ບັນທຶກລາຍການ'}
                  </button>
                </form>
              </div>
            </div>

            {/* Table with Edit Button & POS Bill Viewer */}
            <div className="lg:col-span-8">
              <div className="high-density-card p-5 overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-serif text-slate-800 dark:text-white">ປະຫວັດທຸລະກຳ</h3>
                  <span className="text-[10px] text-slate-400">ກົດໄອຄອນສໍເພື່ອແກ້ໄຂ • ກົດໄອຄອນຕາເພື່ອເບິ່ງຮູບ/ບິນ POS</span>
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
                      {filteredTransactions.map(t => {
                        const isPosBill = t.description && t.description.includes('POS');

                        return (
                          <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                            <td className="p-3 font-mono text-slate-400 whitespace-nowrap">{t.date}</td>
                            <td className="p-3">
                              <span className="font-bold text-slate-800 dark:text-white block">{t.description || t.category}</span>
                              <span className="text-[10px] text-slate-400 font-mono uppercase">{t.source}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span 
                                onClick={() => handleOpenEditTx(t)}
                                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase cursor-pointer hover:scale-105 transition-transform inline-flex items-center gap-1 ${
                                  t.expenseBucket === 'capex' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                  t.expenseBucket === 'cogs' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                  t.expenseBucket === 'dividend' ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' :
                                  'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                }`}
                                title="ຄລິກເພື່ອປ່ຽນປະເພດ (OPEX ➔ CAPEX)"
                              >
                                {t.expenseBucket ? t.expenseBucket.toUpperCase() : (t.type === 'income' ? 'INCOME' : 'OPEX')} ✏️
                              </span>
                            </td>
                            <td className={`p-3 text-right font-mono font-bold whitespace-nowrap ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {t.type === 'income' ? '+' : '-'}{Number(t.amount).toLocaleString()} ₭
                            </td>
                            
                            {/* 🌟 ຊ່ອງໃບບິນ: ກົດເບິ່ງຮູບໃບບິນ ຫຼື ບິນ POS ໄດ້ທັນທີ! */}
                            <td className="p-3 text-center">
                              {t.receiptImage || isPosBill ? (
                                <button 
                                  onClick={() => handleCheckAndOpenPosBill(t)} 
                                  className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 cursor-pointer"
                                  title={isPosBill ? "ກົດເບິ່ງບິນ POS ຕົວຈິງ" : "ກົດເບິ່ງຮູບໃບບິນ"}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              ) : <span className="text-slate-500">-</span>}
                            </td>

                            {/* 🛠️ ປຸ່ມແກ້ໄຂ (Edit2) ແລະ ປຸ່ມລຶບ (Trash2) */}
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button 
                                  onClick={() => handleOpenEditTx(t)} 
                                  className="p-1 text-slate-400 hover:text-sky-500 rounded-lg cursor-pointer"
                                  title="ແກ້ໄຂທຸລະກຳ"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => deleteDoc(doc(db, 'transactions', t.id))} 
                                  className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                                  title="ລຶບ"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
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
                <form onSubmit={async (e) => {
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
                  alert("ບັນທຶກໜີ້ສິນສຳເລັດ!");
                }} className="space-y-3">
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

                  {/* 📸 Debt Receipt Upload */}
                  <div>
                    <label className="label-xs flex justify-between mb-1"><span>ຮູບຫຼັກຖານໜີ້ສິນ (Ctrl+V)</span></label>
                    <div className="border border-dashed border-slate-200 dark:border-neutral-700 rounded-xl p-2 relative flex items-center justify-between">
                      <input type="file" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) setDebtReceiptImage(await compressImage(file));
                      }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                      {debtReceiptImage ? (
                        <div className="flex items-center gap-2 w-full justify-between">
                          <img src={debtReceiptImage} alt="Receipt" className="w-8 h-8 rounded-lg object-cover" />
                          <span className="text-[10px] text-emerald-500 font-bold">ອັບໂຫຼດຮູບແລ້ວ ✓</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setDebtReceiptImage(''); }} className="text-rose-500 p-1">✕</button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 mx-auto flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> ວາງຮູບຫຼັກຖານ</span>
                      )}
                    </div>
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
                        <th className="p-3 text-center">ໃບບິນ</th>
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
                              {d.receiptImage ? (
                                <button onClick={() => setPreviewImage(d.receiptImage)} className="p-1 rounded bg-emerald-500/10 text-emerald-500">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              ) : '-'}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => updateDoc(doc(db, 'debts', d.id), { status: d.status === 'settled' ? 'pending' : 'settled' })}
                                className={`px-2.5 py-1 rounded-xl text-[9px] font-bold cursor-pointer ${d.status === 'settled' ? 'bg-emerald-500 text-white' : 'bg-amber-500/10 text-amber-500'}`}
                              >
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

      {/* VIEW 3: BREAK-EVEN SIMULATOR */}
      {subView === 'breakeven' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="high-density-card p-6 space-y-1 bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/30">
              <span className="label-xs !text-amber-600 dark:text-amber-400 flex justify-between">
                <span>ເປົ້າໝາຍຂາຍຕໍ່ວັນ (ຄືນທຶນໃນ {targetMonths} ເດືອນ)</span>
                <Target className="w-4 h-4 text-amber-500" />
              </span>
              <h2 className="text-3xl font-serif font-bold text-amber-600 dark:text-amber-400 mt-2 font-mono">
                {salesPlannerFormula.targetDailyPieces.toLocaleString()} <span className="text-xs font-sans font-normal opacity-80">ກ້ອນ / ວັນ</span>
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-neutral-400 block font-light pt-1">
                ຍອດຂາຍ: <b className="text-slate-800 dark:text-white font-mono">{Math.round(salesPlannerFormula.targetDailyRevenue).toLocaleString()} ₭/ວັນ</b>
              </span>
            </div>

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

            <div className="high-density-card p-6 space-y-1">
              <span className="label-xs flex justify-between">
                <span>ຈຳນວນກ້ອນທັງໝົດເພື່ອຄືນ 40 ລ້ານ</span>
                <Sparkles className="w-4 h-4 text-emerald-500" />
              </span>
              <h2 className="text-3xl font-serif font-bold text-emerald-500 mt-2 font-mono">
                {salesPlannerFormula.totalPiecesToRecoverAll.toLocaleString()} <span className="text-xs font-sans font-normal opacity-70">ກ້ອນ</span>
              </h2>
            </div>

            <div className="high-density-card p-6 space-y-1">
              <span className="label-xs flex justify-between">
                <span>ເງິນຄືນທຶນທີ່ຕ້ອງຕັດ/ເດືອນ</span>
                <Clock className="w-4 h-4 text-purple-500" />
              </span>
              <h2 className="text-3xl font-serif font-bold text-purple-500 mt-2 font-mono">
                {Math.round(salesPlannerFormula.monthlyRecoveryQuota).toLocaleString()} <span className="text-xs font-sans font-normal opacity-70">₭</span>
              </h2>
            </div>
          </div>
        </div>
      )}

      {/* 📥 MODAL ດຶງໃບບິນ SUPPLIER ຕາມວັນທີ (DEFAULT = ວັນປັດຈຸບັນ) */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsSupplierModalOpen(false)}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-2xl w-full space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-serif text-slate-800 dark:text-white">ດຶງລາຍການຈາກໃບບິນ Supplier ມາລົງບັນຊີ (COGS & CAPEX)</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ເລືອກວັນທີເພື່ອດຶງສະເພາະໃບບິນຂອງວັນນັ້ນ (ເລີ່ມຕົ້ນດ້ວຍວັນປັດຈຸບັນ)</p>
              </div>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {/* 🌟 ຊ່ອງເລືອກວັນທີຂອງໃບບິນ SUPPLIER (DEFAULT = TODAY) */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1c1c1c] border border-slate-200/60 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-500" />
                <span className="text-xs font-bold text-slate-700 dark:text-neutral-200">ເລືອກວັນທີໃບບິນ:</span>
                <input
                  type="date"
                  value={importFilterDate === 'all' ? '' : importFilterDate}
                  onChange={e => setImportFilterDate(e.target.value || 'all')}
                  className="crystal-input !py-1 !text-xs font-mono font-bold"
                />
              </div>

              <div className="flex gap-1.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setImportFilterDate(format(new Date(), 'yyyy-MM-dd'))}
                  className={`px-3 py-1 rounded-xl cursor-pointer ${importFilterDate === format(new Date(), 'yyyy-MM-dd') ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-neutral-200 dark:bg-neutral-800 text-slate-400'}`}
                >
                  ມື້ນີ້
                </button>
                <button
                  type="button"
                  onClick={() => setImportFilterDate('all')}
                  className={`px-3 py-1 rounded-xl cursor-pointer ${importFilterDate === 'all' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-neutral-200 dark:bg-neutral-800 text-slate-400'}`}
                >
                  ທັງໝົດ
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {filteredSupplierPricesForImport.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <p className="text-xs text-slate-400">ບໍ່ພົບໃບບິນ Supplier ໃນວັນທີ {importFilterDate === 'all' ? 'ໃດໆ' : importFilterDate}</p>
                  <button onClick={() => setImportFilterDate('all')} className="text-xs font-bold text-sky-500 hover:underline">
                    ກົດເພື່ອສະແດງໃບບິນທຸກວັນທີ
                  </button>
                </div>
              ) : (
                filteredSupplierPricesForImport.map(sp => {
                  const pr = products.find(p => p.id === sp.productId);
                  const catType = pr?.categoryType || (pr?.isDurable ? 'EQUIPMENT' : 'COGS');
                  const total = sp.totalPriceLAK || (sp.currency === 'LAK' ? sp.priceOriginal : sp.priceOriginal * sp.exchangeRate);
                  const isChecked = !!selectedSupplierItems[sp.id];

                  return (
                    <div 
                      key={sp.id} 
                      onClick={() => setSelectedSupplierItems(prev => ({ ...prev, [sp.id]: !prev[sp.id] }))}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${isChecked ? 'bg-emerald-500/10 border-emerald-500' : 'bg-slate-50 dark:bg-[#1a1a1a] border-slate-200/50 dark:border-neutral-800'}`}
                    >
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => {}} 
                          className="w-4 h-4 rounded text-emerald-500" 
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                              catType === 'EQUIPMENT' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {catType === 'EQUIPMENT' ? 'CAPEX (ອຸປະກອນ)' : 'COGS (ວັດຖຸດິບ)'}
                            </span>
                            <span className="text-xs font-bold text-slate-800 dark:text-white">{pr?.name || 'Item'}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{sp.date} • {sp.supplier} • {sp.quantity}ແພັກ</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-500">+{Math.round(total).toLocaleString()} ₭</span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-neutral-800">
              <span className="text-xs text-slate-400">ເລືອກແລ້ວ: {Object.values(selectedSupplierItems).filter(Boolean).length} ລາຍການ</span>
              <button onClick={handleConfirmImportSupplierItems} className="crystal-button !py-2.5 !px-6">ດຶງເຂົ້າບັນຊີທັນທີ</button>
            </div>
          </div>
        </div>
      )}

      {/* ✏️ MODAL ແກ້ໄຂທຸລະກຳ (EDIT TRANSACTION MODAL) */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setEditingTx(null)}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
              <h3 className="text-base font-serif text-slate-800 dark:text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-sky-500" />
                <span>ແກ້ໄຂທຸລະກຳການເງິນ</span>
              </h3>
              <button onClick={() => setEditingTx(null)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            <form onSubmit={handleSaveEditedTx} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                <button type="button" onClick={() => setEditingTx({ ...editingTx, type: 'income' })} className={`py-2 text-xs font-bold rounded-xl ${editingTx.type === 'income' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}>+ ລາຍຮັບ</button>
                <button type="button" onClick={() => setEditingTx({ ...editingTx, type: 'expense' })} className={`py-2 text-xs font-bold rounded-xl ${editingTx.type === 'expense' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}>- ລາຍຈ່າຍ</button>
              </div>

              <div>
                <label className="label-xs block mb-1">ຈຳນວນເງິນ (LAK)</label>
                <input
                  type="text"
                  required
                  value={editAmountDisplay}
                  onChange={e => {
                    const raw = e.target.value.replace(/,/g, '');
                    setEditAmountDisplay(raw ? Number(raw).toLocaleString() : '');
                    setEditingTx({ ...editingTx, amountInput: Number(raw) || 0 });
                  }}
                  className="crystal-input w-full font-mono text-base font-bold"
                />
              </div>

              {editingTx.type === 'expense' && (
                <div>
                  <label className="label-xs block mb-1">ກຸ່ມຕົ້ນທຶນ (Bucket)</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'cogs', name: 'COGS ວັດຖຸດິບ' },
                      { id: 'opex', name: 'OPEX ດຳເນີນງານ' },
                      { id: 'capex', name: 'CAPEX ອຸປະກອນ/ສູດ' },
                      { id: 'dividend', name: 'ປັນຜົນ' }
                    ].map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setEditingTx({ ...editingTx, expenseBucket: b.id })}
                        className={`p-2 rounded-xl text-xs font-bold border text-left ${editingTx.expenseBucket === b.id ? 'border-[#052659] dark:border-white bg-[#052659]/5 dark:bg-white/5 font-black' : 'border-slate-200 dark:border-neutral-800 text-slate-400'}`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-xs block mb-1">ວັນທີ</label>
                  <input
                    type="date"
                    required
                    value={editingTx.date}
                    onChange={e => setEditingTx({ ...editingTx, date: e.target.value })}
                    className="crystal-input w-full !text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="label-xs block mb-1">ເວລາ</label>
                  <input
                    type="time"
                    required
                    value={editingTx.time || '12:00'}
                    onChange={e => setEditingTx({ ...editingTx, time: e.target.value })}
                    className="crystal-input w-full !text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="label-xs block mb-1">ຊ່ອງທາງຊຳລະ</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['cash', 'onepay', 'ldb'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setEditingTx({ ...editingTx, source: s })}
                      className={`py-2 text-xs font-bold rounded-xl border uppercase ${editingTx.source === s ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 border-transparent' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label-xs block mb-1">ລາຍລະອຽດ</label>
                <input
                  type="text"
                  value={editingTx.description || ''}
                  onChange={e => setEditingTx({ ...editingTx, description: e.target.value })}
                  className="crystal-input w-full !text-xs"
                />
              </div>

              {/* ຮູບໃບບິນ */}
              <div>
                <label className="label-xs flex justify-between mb-1">
                  <span>ຮູບໃບບິນ (Ctrl+V)</span>
                </label>
                <div className="border border-dashed border-slate-300 dark:border-neutral-700 rounded-xl p-2 relative flex items-center justify-between">
                  <input type="file" accept="image/*" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setEditingTx({ ...editingTx, receiptImage: await compressImage(file) });
                  }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  {editingTx.receiptImage ? (
                    <div className="flex items-center gap-2 w-full justify-between">
                      <img src={editingTx.receiptImage} alt="Receipt" className="w-8 h-8 rounded-lg object-cover border border-neutral-700" />
                      <span className="text-[10px] text-emerald-500 font-bold">ອັບໂຫຼດແລ້ວ ✓</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setEditingTx({ ...editingTx, receiptImage: '' }); }} className="text-rose-500 p-1">✕</button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 mx-auto flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> ຄລິກ ຫຼື ວາງຮູບ (Ctrl+V)</span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
                <button type="button" onClick={() => setEditingTx(null)} className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-400">ຍົກເລີກ</button>
                <button type="submit" className="crystal-button">ບັນທຶກການແກ້ໄຂ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🌟 VIRTUAL POS RECEIPT VIEWER FOR SALES BILLS */}
      {viewingPosBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setViewingPosBill(null)}>
          <div 
            className="bg-[#faf7f0] text-slate-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative border-t-8 border-dashed border-[#052659] max-h-[92vh] overflow-y-auto"
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setViewingPosBill(null)} className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-200/60 hover:bg-slate-300 text-slate-600 cursor-pointer">
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-3">
              <h2 className="text-xl font-serif font-black uppercase text-slate-900 tracking-tight">LE OUVE WORKSPACE</h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-none">Bakery & Cafe Architecture</p>
              <div className="pt-2 text-[10px] text-slate-600 text-left space-y-0.5 font-mono">
                <div className="flex justify-between"><span>BILL: {viewingPosBill.billNo}</span><span>{viewingPosBill.date} {viewingPosBill.time}</span></div>
                <div className="flex justify-between font-bold text-slate-900"><span>CUSTOMER: {viewingPosBill.customerName}</span><span className="uppercase">{viewingPosBill.paymentMethod}</span></div>
              </div>
            </div>

            {/* Line items with photos */}
            <div className="py-3 space-y-2 border-b border-dashed border-slate-300">
              {viewingPosBill.items?.map((it: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 py-1">
                  {it.recipeImage && <img src={it.recipeImage} alt={it.menuName} className="w-8 h-8 rounded-lg object-cover border border-slate-300 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">{it.menuName}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{it.soldQty} × {Number(it.sellingPrice).toLocaleString()}</p>
                  </div>
                  <span className="text-xs font-mono font-black text-slate-900">{it.lineRevenue?.toLocaleString()} ₭</span>
                </div>
              ))}
            </div>

            <div className="py-3 flex justify-between text-sm font-black text-slate-900">
              <span>ຍອດລວມ (TOTAL):</span>
              <span>{Number(viewingPosBill.totalRevenue).toLocaleString()} ₭</span>
            </div>

            <div className="pt-2 flex gap-2">
              <button onClick={() => window.print()} className="flex-1 py-2 rounded-xl bg-slate-900 text-white font-sans text-xs font-bold cursor-pointer">Print Receipt</button>
              <button onClick={() => setViewingPosBill(null)} className="px-4 py-2 rounded-xl bg-slate-200 text-slate-700 font-sans text-xs font-bold cursor-pointer">ປິດ</button>
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
