import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  deleteDoc, doc, serverTimestamp, setDoc, getDocs, where, limit 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  DollarSign, TrendingUp, TrendingDown, Wallet, CreditCard, 
  Plus, Trash2, Calendar, Clock, Filter, ArrowUpRight, ArrowDownRight,
  Lock, Key, Download
} from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';

export default function Finance({ userSettings }: { userSettings?: any }) {
  const { i18n } = useTranslation();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState('ຂາຍເຄື່ອງດື່ມ (Sales)');
  const [source, setSource] = useState<'cash' | 'online'>('online');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter & PIN
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterDate, setFilterDate] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState(!userSettings?.financialPin);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // Realtime Subscribe Transactions
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

  // Format Comma Input
  const handleAmountChange = (val: string) => {
    const raw = val.replace(/,/g, '');
    if (raw === '' || !isNaN(Number(raw))) {
      setAmount(raw ? Number(raw).toLocaleString() : '');
    }
  };

  // Recalculate daily summary
  const recalculateSummary = async (dateStr: string) => {
    try {
      const q = query(collection(db, 'transactions'), where('date', '==', dateStr));
      const snap = await getDocs(q);
      const txs = snap.docs.map(d => d.data());

      let income = 0, expenses = 0, cashIn = 0, cashOut = 0, onlineIn = 0, onlineOut = 0;
      txs.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') {
          income += amt;
          if (t.source === 'cash') cashIn += amt; else onlineIn += amt;
        } else {
          expenses += amt;
          if (t.source === 'cash') cashOut += amt; else onlineOut += amt;
        }
      });

      await setDoc(doc(db, 'dailySummaries', dateStr), {
        date: dateStr,
        income,
        expenses,
        cashIncome: cashIn,
        cashExpenses: cashOut,
        onlineIncome: onlineIn,
        onlineExpenses: onlineOut,
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
      alert("ບັນທຶກທຸລະກຳສຳເລັດ!");
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

  // Metrics Overview
  const metrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let cashBalance = 0;
    let onlineBalance = 0;

    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        totalIncome += amt;
        if (t.source === 'cash') cashBalance += amt; else onlineBalance += amt;
      } else {
        totalExpense += amt;
        if (t.source === 'cash') cashBalance -= amt; else onlineBalance -= amt;
      }
    });

    return {
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      cashBalance,
      onlineBalance
    };
  }, [transactions]);

  // Export to Excel
  const handleExportExcel = () => {
    const data = transactions.map(t => ({
      "ວັນທີ (Date)": t.date,
      "ເວລາ (Time)": t.time,
      "ປະເພດ (Type)": t.type === 'income' ? 'ລາຍຮັບ (Income)' : 'ລາຍຈ່າຍ (Expense)',
      "ໝວດໝູ່ (Category)": t.category,
      "ຈຳນວນເງິນ (Amount)": t.amount,
      "ຊ່ອງທາງ (Source)": t.source === 'cash' ? 'ເງິນສົດ (Cash)' : 'ໂອນ/BCEL (Online)',
      "ລາຍລະອຽດ (Remark)": t.description || ''
    }));

    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Finance Transactions");
    writeFile(wb, `LeOuve_Finance_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  // PIN Protection Screen
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
              className="w-full text-center text-2xl tracking-[0.4em] font-mono font-black py-3 rounded-2xl border border-slate-200 dark:border-white/10 dark:bg-black/20"
            />
            {pinError && <p className="text-[11px] text-rose-500 font-bold">ລະຫັດ PIN ບໍ່ຖືກຕ້ອງ!</p>}
            <button type="submit" className="crystal-button w-full">ປົດລັອກ</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans pb-16">
      {/* 1. Header & Summary Cards */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <span className="bg-[#052659] text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Finance
          </span>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white mt-1">
            {i18n.language === 'la' ? 'ການເງິນ & ບັນຊີລາຍຮັບ-ລາຍຈ່າຍ' : 'Financial Ledger & Cashflow'}
          </h1>
        </div>
        <button
          onClick={handleExportExcel}
          className="crystal-button !py-2.5 !px-4 flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Excel</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="high-density-card p-6 border-l-4 border-l-emerald-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>ລາຍຮັບທັງໝົດ</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          </span>
          <h2 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono">
            +{metrics.totalIncome.toLocaleString()} ₭
          </h2>
        </div>

        <div className="high-density-card p-6 border-l-4 border-l-rose-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>ລາຍຈ່າຍທັງໝົດ</span>
            <ArrowDownRight className="w-4 h-4 text-rose-500" />
          </span>
          <h2 className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2 font-mono">
            -{metrics.totalExpense.toLocaleString()} ₭
          </h2>
        </div>

        <div className="high-density-card p-6 border-l-4 border-l-blue-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>ເງິນໃນບັນຊີ (Online/QR)</span>
            <CreditCard className="w-4 h-4 text-blue-500" />
          </span>
          <h2 className="text-2xl font-black text-blue-600 dark:text-sky-400 mt-2 font-mono">
            {metrics.onlineBalance.toLocaleString()} ₭
          </h2>
        </div>

        <div className="high-density-card p-6 border-l-4 border-l-amber-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>ເງິນສົດໃນລິ້ນຊັກ (Cash)</span>
            <Wallet className="w-4 h-4 text-amber-500" />
          </span>
          <h2 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2 font-mono">
            {metrics.cashBalance.toLocaleString()} ₭
          </h2>
        </div>
      </div>

      {/* 2. Grid Layout: Form Entry & Transaction Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Input Form */}
        <div className="lg:col-span-4">
          <div className="high-density-card p-6 space-y-6 sticky top-24">
            <h3 className="text-sm font-black uppercase tracking-wider text-[#052659] dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-500" />
              <span>ບັນທຶກລາຍການໃໝ່</span>
            </h3>

            <form onSubmit={handleAddTransaction} className="space-y-4">
              {/* Type Toggle */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-black/20 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => { setType('income'); setCategory('ຂາຍເຄື່ອງດື່ມ (Sales)'); }}
                  className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${type === 'income' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500'}`}
                >
                  + ລາຍຮັບ (Income)
                </button>
                <button
                  type="button"
                  onClick={() => { setType('expense'); setCategory('ຊື້ວັດຖຸດິບ (Raw Materials)'); }}
                  className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${type === 'expense' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-500'}`}
                >
                  - ລາຍຈ່າຍ (Expense)
                </button>
              </div>

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

              <div>
                <label className="label-xs block mb-1">ໝວດໝູ່</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="crystal-input w-full !text-xs font-bold"
                >
                  {type === 'income' ? (
                    <>
                      <option value="ຂາຍເຄື່ອງດື່ມ (Sales)">ຂາຍເຄື່ອງດື່ມ (Sales)</option>
                      <option value="ຂາຍເຂົ້າໜົມ (Bakery)">ຂາຍເຂົ້າໜົມ (Bakery)</option>
                      <option value="ລາຍຮັບອື່ນໆ (Other Income)">ລາຍຮັບອື່ນໆ (Other Income)</option>
                    </>
                  ) : (
                    <>
                      <option value="ຊື້ວັດຖຸດິບ (Raw Materials)">ຊື້ວັດຖຸດິບ (Raw Materials)</option>
                      <option value="ຄ່ານ້ຳ-ຄ່າໄຟ (Utilities)">ຄ່ານ້ຳ-ຄ່າໄຟ (Utilities)</option>
                      <option value="ເງິນເດືອນພະນັກງານ (Salary)">ເງິນເດືອນພະນັກງານ (Salary)</option>
                      <option value="ຄ່າເຊົ່າສະຖານທີ່ (Rent)">ຄ່າເຊົ່າສະຖານທີ່ (Rent)</option>
                      <option value="ເຄື່ອງໃຊ້ສິ້ນເປືອງ (Supplies)">ເຄື່ອງໃຊ້ສິ້ນເປືອງ (Supplies)</option>
                      <option value="ລາຍຈ່າຍອື່ນໆ (Other Expense)">ລາຍຈ່າຍອື່ນໆ (Other Expense)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="label-xs block mb-1">ຊ່ອງທາງຮັບ/ຈ່າຍເງິນ</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSource('online')}
                    className={`py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer ${source === 'online' ? 'bg-[#052659] text-white border-transparent' : 'border-slate-200 dark:border-white/10 text-slate-500'}`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>ໂອນ / BCEL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource('cash')}
                    className={`py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer ${source === 'cash' ? 'bg-[#052659] text-white border-transparent' : 'border-slate-200 dark:border-white/10 text-slate-500'}`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>ເງິນສົດ (Cash)</span>
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
                  placeholder="ຕົວຢ່າງ: ຊື້ກາເຟ LATDA 2 ຖົງ..."
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

        {/* Right: Transactions List */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-white dark:bg-[#073069] p-4 rounded-2xl border border-slate-200 dark:border-white/10">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              ປະຫວັດທຸລະກຳ ({transactions.length} ລາຍການ)
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer ${filterType === 'all' ? 'bg-[#052659] text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}
              >
                ທັງໝົດ
              </button>
              <button
                onClick={() => setFilterType('income')}
                className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer ${filterType === 'income' ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}
              >
                ລາຍຮັບ
              </button>
              <button
                onClick={() => setFilterType('expense')}
                className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer ${filterType === 'expense' ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}
              >
                ລາຍຈ່າຍ
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#073069] rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  <tr>
                    <th className="p-4">ວັນທີ & ເວລາ</th>
                    <th className="p-4">ໝວດໝູ່ & ລາຍລະອຽດ</th>
                    <th className="p-4">ຊ່ອງທາງ</th>
                    <th className="p-4 text-right">ຈຳນວນເງິນ</th>
                    <th className="p-4 text-center">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-sans">
                  {transactions
                    .filter(t => filterType === 'all' || t.type === filterType)
                    .map((tx) => {
                      const isIncome = tx.type === 'income';
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                          <td className="p-4 whitespace-nowrap">
                            <span className="font-bold text-slate-800 dark:text-white block">{tx.date}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{tx.time}</span>
                          </td>
                          <td className="p-4">
                            <span className="font-bold text-slate-800 dark:text-white block">{tx.category}</span>
                            {tx.description && (
                              <span className="text-[11px] text-slate-400 italic block mt-0.5">{tx.description}</span>
                            )}
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${tx.source === 'cash' ? 'bg-amber-500/10 text-amber-600' : 'bg-blue-500/10 text-blue-600'}`}>
                              {tx.source === 'cash' ? 'Cash' : 'Online / BCEL'}
                            </span>
                          </td>
                          <td className={`p-4 text-right font-black font-mono text-sm whitespace-nowrap ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {isIncome ? '+' : '-'}{Number(tx.amount).toLocaleString()} ₭
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleDelete(tx.id, tx.date)}
                              className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 italic">
                        ຍັງບໍ່ມີລາຍການບັນທຶກການເງິນ. ປ້ອນລາຍການໃໝ່ທາງຊ້າຍມືໄດ້ເລີຍ!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
