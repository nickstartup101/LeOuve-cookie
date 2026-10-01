import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  deleteDoc, doc, serverTimestamp, setDoc, getDocs, where 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  DollarSign, TrendingUp, TrendingDown, Wallet, CreditCard, 
  Plus, Trash2, ArrowUpRight, ArrowDownRight,
  Lock, Download, QrCode, Building2, Activity, AlertTriangle,
  CheckCircle2, PieChart, Sparkles, ShieldAlert, Layers
} from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';

export type ExpenseBucket = 'cogs' | 'opex' | 'capex' | 'dividend';

export default function Finance({ userSettings }: { userSettings?: any }) {
  const { i18n } = useTranslation();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState('ຂາຍເຄື່ອງດື່ມ & ກາເຟ (Coffee & Drinks)');
  const [expenseBucket, setExpenseBucket] = useState<ExpenseBucket>('cogs');
  const [source, setSource] = useState<'cash' | 'onepay' | 'ldb'>('onepay');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters & PIN
  const [filterBucket, setFilterBucket] = useState<'all' | 'income' | ExpenseBucket>('all');
  const [isUnlocked, setIsUnlocked] = useState(!userSettings?.financialPin);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'), orderBy('time', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(docs);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'transactions');
    });

    return () => unsubscribe();
  }, []);

  const handleAmountChange = (val: string) => {
    const raw = val.replace(/,/g, '');
    if (raw === '' || !isNaN(Number(raw))) {
      setAmount(raw ? Number(raw).toLocaleString() : '');
    }
  };

  // Recalculate daily summary with bucket tracking
  const recalculateSummary = async (dateStr: string) => {
    try {
      const q = query(collection(db, 'transactions'), where('date', '==', dateStr));
      const snap = await getDocs(q);
      const txs = snap.docs.map(d => d.data());

      let income = 0, expenses = 0, cashIn = 0, cashOut = 0;
      let onepayIn = 0, onepayOut = 0, ldbIn = 0, ldbOut = 0;
      let cogs = 0, opex = 0, capex = 0, dividend = 0;

      txs.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') {
          income += amt;
          if (t.source === 'cash') cashIn += amt;
          else if (t.source === 'ldb') ldbIn += amt;
          else onepayIn += amt;
        } else {
          expenses += amt;
          if (t.source === 'cash') cashOut += amt;
          else if (t.source === 'ldb') ldbOut += amt;
          else onepayOut += amt;

          const b = t.expenseBucket as ExpenseBucket;
          if (b === 'cogs') cogs += amt;
          else if (b === 'opex') opex += amt;
          else if (b === 'capex') capex += amt;
          else if (b === 'dividend') dividend += amt;
        }
      });

      await setDoc(doc(db, 'dailySummaries', dateStr), {
        date: dateStr,
        income,
        expenses,
        cogs,
        opex,
        capex,
        dividend,
        cashIncome: cashIn,
        cashExpenses: cashOut,
        onepayIncome: onepayIn,
        onepayExpenses: onepayOut,
        ldbIncome: ldbIn,
        ldbExpenses: ldbOut,
        finalBalance: income - expenses,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmt = Number(amount.replace(/,/g, ''));
    if (!rawAmt || rawAmt <= 0) {
      alert("ກະລຸນາໃສ່ຈຳນວນເງິນທີ່ຖືກຕ້ອງ");
      return;
    }

    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'transactions'), {
        type,
        amount: rawAmt,
        category,
        expenseBucket: type === 'expense' ? expenseBucket : null,
        source,
        description: description.trim(),
        date,
        time,
        createdAt: serverTimestamp(),
        userId: auth.currentUser?.uid || 'admin',
        userEmail: auth.currentUser?.email || 'admin@leouve.com'
      });

      await recalculateSummary(date);
      setAmount('');
      setDescription('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'transactions');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, txDate: string) => {
    if (!confirm("ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບລາຍການນີ້?")) return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
      await recalculateSummary(txDate);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'transactions');
    }
  };

  // 📊 FINANCIAL METRICS & BUCKET BREAKDOWN
  const metrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let cogsTotal = 0;
    let opexTotal = 0;
    let capexTotal = 0;
    let dividendTotal = 0;
    let cashBalance = 0;
    let onepayBalance = 0;
    let ldbBalance = 0;

    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        totalIncome += amt;
        if (t.source === 'cash') cashBalance += amt;
        else if (t.source === 'ldb') ldbBalance += amt;
        else onepayBalance += amt;
      } else {
        totalExpense += amt;
        if (t.source === 'cash') cashBalance -= amt;
        else if (t.source === 'ldb') ldbBalance -= amt;
        else onepayBalance -= amt;

        // Categorize into buckets (with legacy fallback)
        let b = t.expenseBucket as ExpenseBucket;
        if (!b) {
          const cat = (t.category || '').toLowerCase();
          if (cat.includes('raw') || cat.includes('ວັດຖຸດິບ') || cat.includes('ເຂົ້າຮ້ານ') || cat.includes('bean') || cat.includes('milk')) b = 'cogs';
          else if (cat.includes('ອຸປະກອນ') || cat.includes('ສູດ') || cat.includes('asset') || cat.includes('capex')) b = 'capex';
          else if (cat.includes('ປັນຜົນ') || cat.includes('dividend')) b = 'dividend';
          else b = 'opex';
        }

        if (b === 'cogs') cogsTotal += amt;
        else if (b === 'opex') opexTotal += amt;
        else if (b === 'capex') capexTotal += amt;
        else if (b === 'dividend') dividendTotal += amt;
      }
    });

    const grossProfit = totalIncome - cogsTotal;
    const grossMargin = totalIncome > 0 ? (grossProfit / totalIncome) * 100 : 0;
    const netProfit = totalIncome - (cogsTotal + opexTotal + capexTotal);
    const netMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
    const totalOperatingCost = cogsTotal + opexTotal;
    const roi = totalOperatingCost > 0 ? (netProfit / totalOperatingCost) * 100 : 0;

    return {
      totalIncome,
      totalExpense,
      cogsTotal,
      opexTotal,
      capexTotal,
      dividendTotal,
      grossProfit,
      grossMargin,
      netProfit,
      netMargin,
      roi,
      cashBalance,
      onepayBalance,
      ldbBalance
    };
  }, [transactions]);

  // 🩺 FINANCIAL HEALTH & INTELLIGENT INSIGHTS ENGINE
  const healthInsights = useMemo(() => {
    const { totalIncome, totalExpense, cogsTotal, opexTotal, capexTotal, dividendTotal, grossMargin, netMargin } = metrics;
    
    if (totalExpense === 0 && totalIncome === 0) {
      return {
        score: 100,
        status: 'Neutral',
        statusColor: 'text-neutral-400',
        badgeBg: 'bg-neutral-500/10 border-neutral-500/20 text-neutral-400',
        dominantName: 'ຍັງບໍ່ມີຂໍ້ມູນ',
        dominantPercent: 0,
        messages: ['ຍັງບໍ່ມີລາຍການບັນທຶກການເງິນ. ເລີ່ມບັນທຶກລາຍຮັບ-ລາຍຈ່າຍເພື່ອວິເຄາະ.'],
        breakdown: []
      };
    }

    // Expense Share Percentages
    const cogsShare = totalExpense > 0 ? (cogsTotal / totalExpense) * 100 : 0;
    const opexShare = totalExpense > 0 ? (opexTotal / totalExpense) * 100 : 0;
    const capexShare = totalExpense > 0 ? (capexTotal / totalExpense) * 100 : 0;
    const divShare = totalExpense > 0 ? (dividendTotal / totalExpense) * 100 : 0;

    const buckets = [
      { name: 'COGS (ຕົ້ນທຶນວັດຖຸດິບ)', amount: cogsTotal, share: cogsShare, key: 'cogs', color: 'bg-amber-500' },
      { name: 'OPEX (ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ)', amount: opexTotal, share: opexShare, key: 'opex', color: 'bg-blue-500' },
      { name: 'CAPEX (ອຸປະກອນ & ຄ່າສູດ)', amount: capexTotal, share: capexShare, key: 'capex', color: 'bg-purple-500' },
      { name: 'DIVIDEND (ປັນຜົນ)', amount: dividendTotal, share: divShare, key: 'dividend', color: 'bg-emerald-500' }
    ].sort((a, b) => b.amount - a.amount);

    const dominant = buckets[0];

    // Compute Health Score (0 - 100)
    let score = 70; // baseline
    const messages: { type: 'alert' | 'warn' | 'success' | 'info'; text: string }[] = [];

    // 1. Evaluate COGS Ratio to Revenue (Cafe Benchmark: 28% - 35%)
    const cogsToRev = totalIncome > 0 ? (cogsTotal / totalIncome) * 100 : 100;
    if (totalIncome > 0) {
      if (cogsToRev > 42) {
        score -= 20;
        messages.push({
          type: 'alert',
          text: `ຕົ້ນທຶນວັດຖຸດິບ (COGS) ສູງເຖິງ ${cogsToRev.toFixed(1)}% ຂອງລາຍຮັບ (ເກນມາດຕະຖານບໍ່ຄວນເກີນ 35%). ຄວນກວດສອບການຮົ່ວໄຫຼຂອງວັດຖຸດິບ ຫຼື ປຽບທຽບລາຄາ Supplier ໃໝ່.`
        });
      } else if (cogsToRev <= 35) {
        score += 15;
        messages.push({
          type: 'success',
          text: `ຕົ້ນທຶນວັດຖຸດິບ (COGS) ຄວບຄຸມໄດ້ດີຫຼາຍ (${cogsToRev.toFixed(1)}% ຂອງລາຍຮັບ). ຊ່ວຍຮັກສາ Gross Margin ໃຫ້ສູງ.`
        });
      }
    }

    // 2. Evaluate OPEX Ratio to Revenue (Salaries, Rent, Utilities: Benchmark < 35%)
    const opexToRev = totalIncome > 0 ? (opexTotal / totalIncome) * 100 : 100;
    if (totalIncome > 0) {
      if (opexToRev > 45) {
        score -= 20;
        messages.push({
          type: 'warn',
          text: `ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ (OPEX) ເຊັ່ນ ຄ່າເຊົ່າ, ຄ່າໄຟ ແລະ ເງິນເດືອນ ກວມເອົາ ${opexToRev.toFixed(1)}% ຂອງລາຍຮັບ ເຊິ່ງເລີ່ມກົດດັນກຳໄລສຸດທິ.`
        });
      }
    }

    // 3. Evaluate Net Margin
    if (totalIncome > 0) {
      if (netMargin < 0) {
        score -= 25;
        messages.push({
          type: 'alert',
          text: `ທຸລະກິດພວມຂາດທຶນສູນເສຍກະແສເງິນສົດ Net Margin ຕິດລົບ (${netMargin.toFixed(1)}%). ຄວນເລັ່ງເພີ່ມຍອດຂາຍ ຫຼື ຕັດລາຍຈ່າຍ OPEX ທັນທີ.`
        });
      } else if (netMargin >= 20) {
        score += 15;
        messages.push({
          type: 'success',
          text: `ອັດຕາກຳໄລສຸດທິ (Net Margin) ສູງເຖິງ ${netMargin.toFixed(1)}% ສະແດງເຖິງການບໍລິຫານຈັດການທີ່ເຂັ້ມແຂງ!`
        });
      }
    }

    // 4. Evaluate Dividend impact
    if (dividendTotal > 0 && netMargin < 15) {
      messages.push({
        type: 'warn',
        text: `ມີການຈ່າຍປັນຜົນ ${dividendTotal.toLocaleString()} ₭ ໃນຂະນະທີ່ກຳໄລສຸດທິຍັງຕ່ຳ. ແນະນຳໃຫ້ເກັບກຳໄລສະສົມໄວ້ເປັນກະແສເງິນສົດສຳຮອງ.`
      });
    }

    score = Math.max(10, Math.min(100, score));

    let status = 'ແຂງແຮງດີເລີດ (Excellent)';
    let statusColor = 'text-emerald-500';
    let badgeBg = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';

    if (score < 45) {
      status = 'ຂັ້ນວິກິດ (Critical)';
      statusColor = 'text-rose-500';
      badgeBg = 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse';
    } else if (score < 70) {
      status = 'ຄວນເຝົ້າລະວັງ (Caution)';
      statusColor = 'text-amber-500';
      badgeBg = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    }

    return {
      score,
      status,
      statusColor,
      badgeBg,
      dominantName: dominant.name,
      dominantPercent: dominant.share,
      messages,
      breakdown: buckets
    };
  }, [metrics]);

  const handleExportExcel = () => {
    const data = transactions.map(t => ({
      "ວັນທີ (Date)": t.date,
      "ເວລາ (Time)": t.time,
      "ປະເພດ (Type)": t.type === 'income' ? 'ລາຍຮັບ (Income)' : 'ລາຍຈ່າຍ (Expense)',
      "ກຸ່ມຕົ້ນທຶນ (Bucket)": t.expenseBucket ? t.expenseBucket.toUpperCase() : '-',
      "ໝວດໝູ່ (Category)": t.category,
      "ຈຳນວນເງິນ (Amount)": t.amount,
      "ຊ່ອງທາງ (Source)": t.source === 'cash' ? 'ເງິນສົດ (Cash)' : t.source === 'ldb' ? 'LDB Trust' : 'BCEL OnePay',
      "ລາຍລະອຽດ (Remark)": t.description || ''
    }));

    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Finance Transactions");
    writeFile(wb, `LeOuve_Finance_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (userSettings?.financialPin && !isUnlocked) {
    return (
      <div className="max-w-md mx-auto py-16 px-6 font-sans">
        <div className="glass-card p-8 text-center space-y-6">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-3xl mx-auto flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase text-slate-800 dark:text-white">Le Ouve Security Protection</h3>
            <p className="text-xs text-slate-400 mt-1">ກະລຸນາໃສ່ລະຫັດ PIN ການເງິນເພື່ອເຂົ້າເຖິງ</p>
          </div>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (enteredPin === userSettings.financialPin) {
              setIsUnlocked(true);
              setPinError(false);
            } else {
              setPinError(true);
            }
          }} className="space-y-4">
            <input
              type="password"
              maxLength={6}
              autoFocus
              placeholder="••••"
              value={enteredPin}
              onChange={e => setEnteredPin(e.target.value.replace(/\D/g, ''))}
              className="w-full text-center text-2xl tracking-[0.4em] font-mono font-black py-3 rounded-2xl border border-slate-200 dark:border-neutral-800 dark:bg-black/30"
            />
            {pinError && <p className="text-[11px] text-rose-500 font-bold">ລະຫັດ PIN ບໍ່ຖືກຕ້ອງ!</p>}
            <button type="submit" className="crystal-button w-full">ປົດລັອກ</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* 🚀 1. HEADER & TOP CONTROLS */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200 dark:border-neutral-800 shadow-sm">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Corporate Finance
          </span>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white mt-1">
            {i18n.language === 'la' ? 'ການເງິນ & ຕົ້ນທຶນ COGS, OPEX, ປັນຜົນ' : 'Financial Ledger & Cost Accounting'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ແຍກລາຍຈ່າຍຕາມມາດຕະຖານທຸລະກິດ Cafe ເພື່ອຄິດໄລ່ ROI, Gross Margin & EBITDA
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="crystal-button !py-2.5 !px-4 flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* 🩺 2. FINANCIAL HEALTH & SMART INSIGHT BENTO BOX */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Bento: Health Score & Dominant Expense Bucket (5 cols) */}
        <div className="lg:col-span-5 high-density-card p-6 flex flex-col justify-between space-y-6 border-l-4 border-l-sky-500">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <span className="label-xs flex items-center gap-1.5 text-sky-500">
                  <Activity className="w-3.5 h-3.5" />
                  <span>Financial Health Index</span>
                </span>
                <h3 className="text-lg font-black text-slate-800 dark:text-white mt-1">
                  ສຸຂະພາບການເງິນຂອງຮ້ານ
                </h3>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${healthInsights.badgeBg}`}>
                {healthInsights.status}
              </span>
            </div>

            {/* Health Score Progress */}
            <div className="mt-5 space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-[11px] text-slate-400 font-bold">Health Score:</span>
                <span className={`text-3xl font-black font-mono ${healthInsights.statusColor}`}>
                  {healthInsights.score}<span className="text-sm opacity-60">/100</span>
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    healthInsights.score >= 70 ? 'bg-emerald-500' : healthInsights.score >= 45 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${healthInsights.score}%` }}
                />
              </div>
            </div>

            {/* Largest Expense Highlight Banner */}
            <div className="mt-5 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/60 dark:border-neutral-800">
              <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">
                ລາຍຈ່າຍກວມອັດຕາສ່ວນສູງສຸດ (Dominant Expense):
              </span>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs font-black text-slate-800 dark:text-white truncate">
                  {healthInsights.dominantName}
                </span>
                <span className="text-xs font-mono font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded">
                  {healthInsights.dominantPercent.toFixed(1)}% ຂອງລາຍຈ່າຍ
                </span>
              </div>
            </div>
          </div>

          {/* Breakdown Mini Bar */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">ໂຄງສ້າງການໃຊ້ຈ່າຍເງິນ:</span>
            <div className="space-y-1.5">
              {healthInsights.breakdown.map((b) => (
                <div key={b.key} className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
                    <span className={`w-2 h-2 rounded-full ${b.color}`} />
                    <span>{b.name}</span>
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {Math.round(b.amount).toLocaleString()} ₭ ({b.share.toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Bento: AI Diagnostics & Real-time Actionable Advice (7 cols) */}
        <div className="lg:col-span-7 high-density-card p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-neutral-800 pb-3">
              <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white">
                ບົດວິເຄາະ & ຄຳແນະນຳປັບປຸງຕົ້ນທຶນ (Cost Optimization Insights)
              </h3>
            </div>

            <div className="mt-4 space-y-3">
              {healthInsights.messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`p-3.5 rounded-2xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                    msg.type === 'alert' ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300' :
                    msg.type === 'warn' ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300' :
                    msg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300' :
                    'bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300'
                  }`}
                >
                  {msg.type === 'alert' && <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />}
                  {msg.type === 'warn' && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                  {msg.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
                  <span>{msg.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Metrics Bar: Gross Margin & ROI */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-neutral-800 text-center font-mono">
            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#1c1c1c]">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Gross Margin %</span>
              <span className="text-base font-black text-indigo-500">{metrics.grossMargin.toFixed(1)}%</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#1c1c1c]">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Net Margin %</span>
              <span className={`text-base font-black ${metrics.netMargin >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {metrics.netMargin.toFixed(1)}%
              </span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#1c1c1c]">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Est. ROI %</span>
              <span className={`text-base font-black ${metrics.roi >= 0 ? 'text-purple-500' : 'text-rose-500'}`}>
                {metrics.roi.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* 💵 3. COST ACCOUNTING CARDS: Revenue, COGS, OPEX, CAPEX, ປັນຜົນ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="high-density-card p-4 border-l-4 border-l-emerald-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>ລາຍຮັບລວມ (Revenue)</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          </span>
          <h2 className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
            +{metrics.totalIncome.toLocaleString()} ₭
          </h2>
          <span className="text-[9px] text-slate-400 font-bold uppercase mt-1 block">ຍອດຂາຍທັງໝົດ</span>
        </div>

        <div className="high-density-card p-4 border-l-4 border-l-amber-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>COGS (ຕົ້ນທຶນວັດຖຸດິບ)</span>
            <ArrowDownRight className="w-4 h-4 text-amber-500" />
          </span>
          <h2 className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">
            -{metrics.cogsTotal.toLocaleString()} ₭
          </h2>
          <span className="text-[9px] text-amber-500 font-bold uppercase mt-1 block">
            {metrics.totalIncome > 0 ? `${((metrics.cogsTotal / metrics.totalIncome) * 100).toFixed(1)}% ຂອງລາຍຮັບ` : 'ຊື້ເຄື່ອງເຂົ້າຮ້ານ'}
          </span>
        </div>

        <div className="high-density-card p-4 border-l-4 border-l-blue-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>OPEX (ດຳເນີນງານ)</span>
            <ArrowDownRight className="w-4 h-4 text-blue-500" />
          </span>
          <h2 className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1 font-mono">
            -{metrics.opexTotal.toLocaleString()} ₭
          </h2>
          <span className="text-[9px] text-blue-500 font-bold uppercase mt-1 block">ເງິນເດືອນ, ຄ່າເຊົ່າ, ນ້ຳ-ໄຟ</span>
        </div>

        <div className="high-density-card p-4 border-l-4 border-l-purple-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>CAPEX (ອຸປະກອນ & ສູດ)</span>
            <ArrowDownRight className="w-4 h-4 text-purple-500" />
          </span>
          <h2 className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1 font-mono">
            -{metrics.capexTotal.toLocaleString()} ₭
          </h2>
          <span className="text-[9px] text-purple-500 font-bold uppercase mt-1 block">ເຄື່ອງຈັກ & ພັດທະນາສູດ</span>
        </div>

        <div className="high-density-card p-4 border-l-4 border-l-pink-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>ປັນຜົນ (Dividend)</span>
            <ArrowDownRight className="w-4 h-4 text-pink-500" />
          </span>
          <h2 className="text-xl font-black text-pink-600 dark:text-pink-400 mt-1 font-mono">
            -{metrics.dividendTotal.toLocaleString()} ₭
          </h2>
          <span className="text-[9px] text-pink-500 font-bold uppercase mt-1 block">ປັນຜົນຫຸ້ນສ່ວນ</span>
        </div>
      </div>

      {/* 💳 4. CASHFLOW ACCOUNT BALANCES (Cash, OnePay, LDB) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="high-density-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[9px] font-black uppercase text-slate-400 block">ເງິນສົດໃນລິ້ນຊັກ (Cash)</span>
              <span className="text-lg font-black text-slate-800 dark:text-white font-mono">
                {metrics.cashBalance.toLocaleString()} ₭
              </span>
            </div>
          </div>
        </div>

        <div className="high-density-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-red-500/10 text-red-500">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[9px] font-black uppercase text-slate-400 block">BCEL OnePay</span>
              <span className="text-lg font-black text-slate-800 dark:text-white font-mono">
                {metrics.onepayBalance.toLocaleString()} ₭
              </span>
            </div>
          </div>
        </div>

        <div className="high-density-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[9px] font-black uppercase text-slate-400 block">LDB Trust</span>
              <span className="text-lg font-black text-slate-800 dark:text-white font-mono">
                {metrics.ldbBalance.toLocaleString()} ₭
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ✍️ 5. ENTRY FORM & TRANSACTIONS LIST */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Form Panel (4 cols) */}
        <div className="lg:col-span-4">
          <div className="high-density-card p-6 space-y-5 sticky top-20">
            <div className="border-b border-slate-100 dark:border-neutral-800 pb-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-500" />
                <span>ບັນທຶກທຸລະກຳການເງິນ</span>
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">ເລືອກປະເພດລາຍຈ່າຍຕາມກຸ່ມຕົ້ນທຶນ</p>
            </div>

            <form onSubmit={handleAddTransaction} className="space-y-4">
              
              {/* Type Switch */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => { setType('income'); setCategory('ຂາຍເຄື່ອງດື່ມ & ກາເຟ (Coffee & Drinks)'); }}
                  className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${type === 'income' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500'}`}
                >
                  + ລາຍຮັບ (Income)
                </button>
                <button
                  type="button"
                  onClick={() => { setType('expense'); setExpenseBucket('cogs'); setCategory('ຊື້ເຄື່ອງເຂົ້າຮ້ານ (ຕົ້ນທຶນວັດຖຸດິບ COGS)'); }}
                  className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${type === 'expense' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-500'}`}
                >
                  - ລາຍຈ່າຍ (Expense)
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="label-xs block mb-1">ຈຳນວນເງິນ (ກີບ / LAK)</label>
                <input
                  type="text"
                  required
                  placeholder="0"
                  value={amount}
                  onChange={e => handleAmountChange(e.target.value)}
                  className="crystal-input w-full font-mono text-lg font-black text-slate-800 dark:text-white"
                />
              </div>

              {/* If Expense: Select Expense Bucket First */}
              {type === 'expense' && (
                <div>
                  <label className="label-xs block mb-1">ກຸ່ມຕົ້ນທຶນ (Cost Structure Bucket)</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setExpenseBucket('cogs'); setCategory('ຊື້ເຄື່ອງເຂົ້າຮ້ານ (ຕົ້ນທຶນວັດຖຸດິບ COGS)'); }}
                      className={`p-2 rounded-xl text-left border cursor-pointer transition-all ${
                        expenseBucket === 'cogs' ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : 'border-slate-200 dark:border-neutral-800 text-slate-500'
                      }`}
                    >
                      <span className="text-xs font-black block leading-none">1. COGS</span>
                      <span className="text-[9px] opacity-75">ຊື້ເຄື່ອງເຂົ້າຮ້ານ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setExpenseBucket('opex'); setCategory('ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ (ຄ່ານ້ຳ, ຄ່າໄຟ, ເງິນເດືອນ, ຄ່າເຊົ່າ)'); }}
                      className={`p-2 rounded-xl text-left border cursor-pointer transition-all ${
                        expenseBucket === 'opex' ? 'bg-blue-500/10 border-blue-500 text-blue-500 font-bold' : 'border-slate-200 dark:border-neutral-800 text-slate-500'
                      }`}
                    >
                      <span className="text-xs font-black block leading-none">2. OPEX</span>
                      <span className="text-[9px] opacity-75">ດຳເນີນງານທົ່ວໄປ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setExpenseBucket('capex'); setCategory('ການບໍລິຫານຈັດການ (ອຸປະກອນຄົງທີ່, ຄ່າສູດ)'); }}
                      className={`p-2 rounded-xl text-left border cursor-pointer transition-all ${
                        expenseBucket === 'capex' ? 'bg-purple-500/10 border-purple-500 text-purple-500 font-bold' : 'border-slate-200 dark:border-neutral-800 text-slate-500'
                      }`}
                    >
                      <span className="text-xs font-black block leading-none">3. CAPEX/Admin</span>
                      <span className="text-[9px] opacity-75">ອຸປະກອນ & ສູດ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setExpenseBucket('dividend'); setCategory('ປັນຜົນ (Dividend / Owner Draw)'); }}
                      className={`p-2 rounded-xl text-left border cursor-pointer transition-all ${
                        expenseBucket === 'dividend' ? 'bg-pink-500/10 border-pink-500 text-pink-500 font-bold' : 'border-slate-200 dark:border-neutral-800 text-slate-500'
                      }`}
                    >
                      <span className="text-xs font-black block leading-none">4. DIVIDEND</span>
                      <span className="text-[9px] opacity-75">ປັນຜົນຫຸ້ນສ່ວນ</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Specific Category Select */}
              <div>
                <label className="label-xs block mb-1">ໝວດໝູ່ຍ່ອຍ (Specific Category)</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="crystal-input w-full !text-xs font-bold"
                >
                  {type === 'income' ? (
                    <>
                      <option value="ຂາຍເຄື່ອງດື່ມ & ກາເຟ (Coffee & Drinks)">ຂາຍເຄື່ອງດື່ມ & ກາເຟ (Coffee & Drinks)</option>
                      <option value="ຂາຍເຂົ້າໜົມ & ອາຫານ (Bakery & Food)">ຂາຍເຂົ້າໜົມ & ອາຫານ (Bakery & Food)</option>
                      <option value="ລາຍຮັບຄ່າສະຖານທີ່/Workspace (Workspace Fee)">ລາຍຮັບຄ່າສະຖານທີ່/Workspace (Workspace Fee)</option>
                      <option value="ລາຍຮັບອື່ນໆ (Other Income)">ລາຍຮັບອື່ນໆ (Other Income)</option>
                    </>
                  ) : expenseBucket === 'cogs' ? (
                    <>
                      <option value="ຊື້ເຄື່ອງເຂົ້າຮ້ານ (ຕົ້ນທຶນວັດຖຸດິບ COGS)">ຊື້ເຄື່ອງເຂົ້າຮ້ານ: ວັດຖຸດິບຫຼັກ (ເມັດກາເຟ, ນົມ, ຊາ, ໄຊຣັບ)</option>
                      <option value="COGS: ວັດຖຸດິບເຂົ້າໜົມ (Bakery Raw Materials)">COGS: ວັດຖຸດິບເຂົ້າໜົມ (Bakery Raw Materials)</option>
                      <option value="COGS: ແກ້ວ, ຫຼອດ, ຝາ, ຖົງ & ບັນຈຸພັນ (Packaging)">COGS: ແກ້ວ, ຫຼອດ, ຝາ, ຖົງ & ບັນຈຸພັນ (Packaging)</option>
                      <option value="COGS: ນ້ຳກ້ອນ & ນ້ຳດື່ມກັ່ນ (Ice & Water)">COGS: ນ້ຳກ້ອນ & ນ້ຳດື່ມກັ່ນ (Ice & Water)</option>
                    </>
                  ) : expenseBucket === 'opex' ? (
                    <>
                      <option value="ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ: ເງິນເດືອນພະນັກງານ (Salaries)">OPEX: ເງິນເດືອນພະນັກງານ (Salaries)</option>
                      <option value="ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ: ຄ່າເຊົ່າຮ້ານ/ສະຖານທີ່ (Rent)">OPEX: ຄ່າເຊົ່າຮ້ານ/ສະຖານທີ່ (Rent)</option>
                      <option value="ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ: ຄ່ານ້ຳ-ຄ່າໄຟ (Electricity & Water)">OPEX: ຄ່ານ້ຳ-ຄ່າໄຟ (Electricity & Water)</option>
                      <option value="ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ: ອິນເຕີເນັດ & ສື່ສານ (Internet & Comms)">OPEX: ອິນເຕີເນັດ & ສື່ສານ (Internet & Comms)</option>
                      <option value="ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ: ການຕະຫຼາດ & ໂຄສະນາ (Marketing)">OPEX: ການຕະຫຼາດ & ໂຄສະນາ (Marketing)</option>
                      <option value="ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ: ເຄື່ອງໃຊ້ສິ້ນເປືອງ & ທຳຄວາມສະອາດ (Consumables)">OPEX: ເຄື່ອງໃຊ້ສິ້ນເປືອງ & ທຳຄວາມສະອາດ (Consumables)</option>
                    </>
                  ) : expenseBucket === 'capex' ? (
                    <>
                      <option value="ການບໍລິຫານຈັດການ: ອຸປະກອນຄົງທີ່ (Equipment & Machines)">CAPEX: ອຸປະກອນຄົງທີ່ & ເຄື່ອງຈັກ (Equipment & Machines)</option>
                      <option value="ການບໍລິຫານຈັດການ: ຄ່າສູດ & R&D ເມນູໃໝ່ (Recipe & R&D)">ADMIN: ຄ່າສູດ & R&D ເມນູໃໝ່ (Recipe & R&D)</option>
                      <option value="ການບໍລິຫານຈັດການ: ຄ່າບຳລຸງຮັກສາເຄື່ອງ (Maintenance)">CAPEX: ຄ່າບຳລຸງຮັກສາເຄື່ອງ (Maintenance)</option>
                      <option value="ການບໍລິຫານຈັດການ: ຄ່າທຳນຽມ, ບັນຊີ & ໃບອະນຸຍາດ (Admin & Legal)">ADMIN: ຄ່າທຳນຽມ, ບັນຊີ & ໃບອະນຸຍາດ (Admin & Legal)</option>
                    </>
                  ) : (
                    <>
                      <option value="ປັນຜົນ (Dividend / Owner Draw)">ປັນຜົນຫຸ້ນສ່ວນ / ເຈົ້າຂອງຮ້ານ (Dividends / Drawings)</option>
                    </>
                  )}
                </select>
              </div>

              {/* Payment Methods */}
              <div>
                <label className="label-xs block mb-1">ຊ່ອງທາງການຊຳລະ</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSource('cash')}
                    className={`py-2 text-[11px] font-bold rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${source === 'cash' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 border-transparent shadow-sm' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource('onepay')}
                    className={`py-2 text-[11px] font-bold rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${source === 'onepay' ? 'bg-red-600 text-white border-transparent shadow-sm' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>OnePay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource('ldb')}
                    className={`py-2 text-[11px] font-bold rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${source === 'ldb' ? 'bg-blue-600 text-white border-transparent shadow-sm' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>LDB</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-xs block mb-1">ວັນທີ</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="crystal-input w-full !text-xs !py-2"
                  />
                </div>
                <div>
                  <label className="label-xs block mb-1">ເວລາ</label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="crystal-input w-full !text-xs !py-2"
                  />
                </div>
              </div>

              <div>
                <label className="label-xs block mb-1">ລາຍລະອຽດ / ໝາຍເຫດ</label>
                <input
                  type="text"
                  placeholder="ເຊັ່ນ: ຊື້ເມັດກາເຟ LATDA 5 ຖົງ..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="crystal-input w-full !text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="crystal-button w-full h-11 flex items-center justify-center gap-2"
              >
                <span>{isSubmitting ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກລາຍການ'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Transactions Table (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-white dark:bg-[#141414] p-4 rounded-2xl border border-slate-200 dark:border-neutral-800">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              ປະຫວັດທຸລະກຳ ({transactions.length} ລາຍການ)
            </h3>
            
            {/* Filter Pills */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterBucket('all')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${filterBucket === 'all' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500'}`}
              >
                ທັງໝົດ
              </button>
              <button
                onClick={() => setFilterBucket('income')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${filterBucket === 'income' ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500'}`}
              >
                ລາຍຮັບ
              </button>
              <button
                onClick={() => setFilterBucket('cogs')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${filterBucket === 'cogs' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500'}`}
              >
                COGS
              </button>
              <button
                onClick={() => setFilterBucket('opex')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${filterBucket === 'opex' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500'}`}
              >
                OPEX
              </button>
              <button
                onClick={() => setFilterBucket('capex')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${filterBucket === 'capex' ? 'bg-purple-500 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500'}`}
              >
                CAPEX
              </button>
              <button
                onClick={() => setFilterBucket('dividend')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${filterBucket === 'dividend' ? 'bg-pink-500 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500'}`}
              >
                ປັນຜົນ
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-slate-200 dark:border-neutral-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  <tr>
                    <th className="p-4">ວັນທີ & ເວລາ</th>
                    <th className="p-4">ກຸ່ມຕົ້ນທຶນ & ໝວດໝູ່</th>
                    <th className="p-4">ຊ່ອງທາງ</th>
                    <th className="p-4 text-right">ຈຳນວນເງິນ</th>
                    <th className="p-4 text-center">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800/80 font-sans">
                  {transactions
                    .filter(t => {
                      if (filterBucket === 'all') return true;
                      if (filterBucket === 'income') return t.type === 'income';
                      return t.expenseBucket === filterBucket;
                    })
                    .map((tx) => {
                      const isIncome = tx.type === 'income';
                      const bucket = tx.expenseBucket as ExpenseBucket;
                      
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                          <td className="p-4 whitespace-nowrap">
                            <span className="font-bold text-slate-800 dark:text-white block">{tx.date}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{tx.time}</span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {bucket && (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                  bucket === 'cogs' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                                  bucket === 'opex' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                                  bucket === 'capex' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' :
                                  'bg-pink-500/10 text-pink-500 border border-pink-500/20'
                                }`}>
                                  {bucket.toUpperCase()}
                                </span>
                              )}
                              <span className="font-bold text-slate-800 dark:text-white">{tx.category}</span>
                            </div>
                            {tx.description && (
                              <span className="text-[11px] text-slate-400 italic block mt-0.5">{tx.description}</span>
                            )}
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                              tx.source === 'cash' ? 'bg-amber-500/10 text-amber-500' : 
                              tx.source === 'ldb' ? 'bg-blue-500/10 text-blue-500' : 
                              'bg-red-500/10 text-red-500'
                            }`}>
                              {tx.source === 'cash' ? 'Cash' : tx.source === 'ldb' ? 'LDB Trust' : 'OnePay'}
                            </span>
                          </td>
                          <td className={`p-4 text-right font-black font-mono text-sm whitespace-nowrap ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {isIncome ? '+' : '-'}{Number(tx.amount).toLocaleString()} ₭
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleDelete(tx.id, tx.date)}
                              className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
  );
}
