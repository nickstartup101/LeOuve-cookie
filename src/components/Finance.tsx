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
  Lock, Download, QrCode, Building2
} from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';

export default function Finance({ userSettings }: { userSettings?: any }) {
  const { i18n } = useTranslation();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State: ຊ່ອງທາງຊຳລະມີ Cash, OnePay, LDB
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState('ຂາຍເຄື່ອງດື່ມ (Sales)');
  const [source, setSource] = useState<'cash' | 'onepay' | 'ldb'>('onepay');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter & PIN
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
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

  const recalculateSummary = async (dateStr: string) => {
    try {
      const q = query(collection(db, 'transactions'), where('date', '==', dateStr));
      const snap = await getDocs(q);
      const txs = snap.docs.map(d => d.data());

      let income = 0, expenses = 0, cashIn = 0, cashOut = 0;
      let onepayIn = 0, onepayOut = 0, ldbIn = 0, ldbOut = 0;

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
        }
      });

      await setDoc(doc(db, 'dailySummaries', dateStr), {
        date: dateStr,
        income,
        expenses,
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
        source, // 'cash' | 'onepay' | 'ldb'
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

  // Metrics Overview Breakdown by Cash, OnePay, LDB
  const metrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
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
      }
    });

    return {
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      cashBalance,
      onepayBalance,
      ldbBalance
    };
  }, [transactions]);

  const handleExportExcel = () => {
    const data = transactions.map(t => ({
      "ວັນທີ (Date)": t.date,
      "ເວລາ (Time)": t.time,
      "ປະເພດ (Type)": t.type === 'income' ? 'ລາຍຮັບ (Income)' : 'ລາຍຈ່າຍ (Expense)',
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
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

      {/* 5 Cards Overview: Revenue, Expense, Cash, OnePay, LDB */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="high-density-card p-5 border-l-4 border-l-emerald-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>ລາຍຮັບທັງໝົດ</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          </span>
          <h2 className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5 font-mono">
            +{metrics.totalIncome.toLocaleString()} ₭
          </h2>
        </div>

        <div className="high-density-card p-5 border-l-4 border-l-rose-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>ລາຍຈ່າຍທັງໝົດ</span>
            <ArrowDownRight className="w-4 h-4 text-rose-500" />
          </span>
          <h2 className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1.5 font-mono">
            -{metrics.totalExpense.toLocaleString()} ₭
          </h2>
        </div>

        {/* BCEL OnePay */}
        <div className="high-density-card p-5 border-l-4 border-l-red-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>BCEL OnePay</span>
            <QrCode className="w-4 h-4 text-red-500" />
          </span>
          <h2 className="text-xl font-black text-red-600 dark:text-red-400 mt-1.5 font-mono">
            {metrics.onepayBalance.toLocaleString()} ₭
          </h2>
        </div>

        {/* LDB Trust */}
        <div className="high-density-card p-5 border-l-4 border-l-blue-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>LDB Trust</span>
            <Building2 className="w-4 h-4 text-blue-500" />
          </span>
          <h2 className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1.5 font-mono">
            {metrics.ldbBalance.toLocaleString()} ₭
          </h2>
        </div>

        {/* Cash */}
        <div className="high-density-card p-5 border-l-4 border-l-amber-500">
          <span className="label-xs flex items-center justify-between text-slate-400">
            <span>ເງິນສົດ (Cash)</span>
            <Wallet className="w-4 h-4 text-amber-500" />
          </span>
          <h2 className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1.5 font-mono">
            {metrics.cashBalance.toLocaleString()} ₭
          </h2>
        </div>
      </div>

      {/* Entry Form & List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <div className="high-density-card p-6 space-y-5 sticky top-20">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-500" />
              <span>ບັນທຶກລາຍການໃໝ່</span>
            </h3>

            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => { setType('income'); setCategory('ຂາຍເຄື່ອງດື່ມ (Sales)'); }}
                  className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${type === 'income' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500'}`}
                >
                  + ລາຍຮັບ
                </button>
                <button
                  type="button"
                  onClick={() => { setType('expense'); setCategory('ຊື້ວັດຖຸດິບ (Raw Materials)'); }}
                  className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${type === 'expense' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-500'}`}
                >
                  - ລາຍຈ່າຍ
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

              {/* Payment Methods: Cash, OnePay, LDB */}
              <div>
                <label className="label-xs block mb-1.5">ຊ່ອງທາງການຊຳລະ</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSource('cash')}
                    className={`py-2 px-1 text-[11px] font-bold rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${source === 'cash' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 border-transparent shadow-sm' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource('onepay')}
                    className={`py-2 px-1 text-[11px] font-bold rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${source === 'onepay' ? 'bg-red-600 text-white border-transparent shadow-sm' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>OnePay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource('ldb')}
                    className={`py-2 px-1 text-[11px] font-bold rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${source === 'ldb' ? 'bg-blue-600 text-white border-transparent shadow-sm' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}
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
                  placeholder="ເຊັ່ນ: ຂາຍເຄື່ອງດື່ມຕອນເຊົ້າ..."
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

        {/* Transactions Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-[#141414] p-4 rounded-2xl border border-slate-200 dark:border-neutral-800">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              ປະຫວັດທຸລະກຳ ({transactions.length} ລາຍການ)
            </h3>
            <div className="flex gap-1.5">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer ${filterType === 'all' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500'}`}
              >
                ທັງໝົດ
              </button>
              <button
                onClick={() => setFilterType('income')}
                className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer ${filterType === 'income' ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500'}`}
              >
                ລາຍຮັບ
              </button>
              <button
                onClick={() => setFilterType('expense')}
                className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer ${filterType === 'expense' ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500'}`}
              >
                ລາຍຈ່າຍ
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-slate-200 dark:border-neutral-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  <tr>
                    <th className="p-4">ວັນທີ & ເວລາ</th>
                    <th className="p-4">ໝວດໝູ່ & ລາຍລະອຽດ</th>
                    <th className="p-4">ຊ່ອງທາງ</th>
                    <th className="p-4 text-right">ຈຳນວນເງິນ</th>
                    <th className="p-4 text-center">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800/80 font-sans">
                  {transactions
                    .filter(t => filterType === 'all' || t.type === filterType)
                    .map((tx) => {
                      const isIncome = tx.type === 'income';
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30 transition-colors">
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
                            <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase ${
                              tx.source === 'cash' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 
                              tx.source === 'ldb' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 
                              'bg-red-500/10 text-red-500 border border-red-500/20'
                            }`}>
                              {tx.source === 'cash' ? 'Cash' : tx.source === 'ldb' ? 'LDB Trust' : 'BCEL OnePay'}
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
