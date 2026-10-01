import { useState, useEffect, useMemo } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, TrendingDown, DollarSign, Percent, 
  ShoppingBag, PieChart, Activity, Zap, RefreshCcw, BrainCircuit,
  ArrowUpRight, ArrowDownRight, Layers
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { format, subDays, isSameDay } from 'date-fns';
import { User } from 'firebase/auth';

interface DashboardProps {
  userSettings: any;
  user?: User | null;
}

export default function Dashboard({ userSettings, user }: DashboardProps) {
  const { i18n } = useTranslation();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe transactions and supplier purchase orders
  useEffect(() => {
    const unsubTx = onSnapshot(query(collection(db, 'transactions')), snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubPrices = onSnapshot(query(collection(db, 'supplierPrices')), snap => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubProd = onSnapshot(query(collection(db, 'products')), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => { unsubTx(); unsubPrices(); unsubProd(); };
  }, []);

  // 📊 Realtime Financial KPI Calculator (Gross Margin, COGS, Net Profit, ROI, Total Revenue)
  const financeKPIs = useMemo(() => {
    let totalRevenue = 0;
    let operatingExpenses = 0;

    // 1. Total Revenue from transactions
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        totalRevenue += amt;
      } else {
        operatingExpenses += amt;
      }
    });

    // 2. COGS (Cost of Goods Sold / Purchasing Spend)
    // ຄິດໄລ່ຈາກຍອດຊື້ວັດຖຸດິບຕົວຈິງຈາກ Suppliers ຫຼື ໝວດໝູ່ 'Raw Materials'
    let cogsPurchasing = supplierPrices.reduce((sum, sp) => {
      const totalLAK = sp.totalPriceLAK !== undefined 
        ? Number(sp.totalPriceLAK || 0) 
        : (sp.currency === 'LAK' ? Number(sp.priceOriginal || 0) : Number(sp.priceOriginal || 0) * Number(sp.exchangeRate || 1));
      return sum + totalLAK;
    }, 0);

    // ຖ້າບໍ່ມີການບັນທຶກ Supplier Prices, ດຶງຈາກລາຍຈ່າຍໝວດໝູ່ ຊື້ວັດຖຸດິບ (Raw Materials)
    if (cogsPurchasing === 0) {
      cogsPurchasing = transactions
        .filter(t => t.type === 'expense' && (t.category?.includes('Raw') || t.category?.includes('ວັດຖຸດິບ')))
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    }

    // 3. Gross Profit & Gross Margin %
    const grossProfit = totalRevenue - cogsPurchasing;
    const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // 4. Net Profit (ກຳໄລສຸດທິ = ລາຍຮັບ - ລາຍຈ່າຍທັງໝົດ)
    const totalCostsAndExpenses = Math.max(operatingExpenses, cogsPurchasing);
    const netProfit = totalRevenue - totalCostsAndExpenses;
    const netMarginPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // 5. ROI % (Return on Investment = (Net Profit / Total Investment/COGS) * 100)
    const investmentBase = totalCostsAndExpenses > 0 ? totalCostsAndExpenses : 1;
    const roiPercent = (netProfit / investmentBase) * 100;

    return {
      totalRevenue,
      cogsPurchasing,
      grossProfit,
      grossMarginPercent,
      netProfit,
      netMarginPercent,
      roiPercent
    };
  }, [transactions, supplierPrices]);

  // 7-Day Revenue vs Expense Trend Chart
  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
    return last7Days.map(date => {
      const dayStr = format(date, 'yyyy-MM-dd');
      let rev = 0;
      let exp = 0;

      transactions.forEach(t => {
        if (t.date === dayStr) {
          const amt = Number(t.amount) || 0;
          if (t.type === 'income') rev += amt;
          else exp += amt;
        }
      });

      return {
        day: format(date, 'EEE'),
        fullDate: dayStr,
        Revenue: rev,
        Expenses: exp
      };
    });
  }, [transactions]);

  return (
    <div className="space-y-6 font-sans pb-16">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#052659] text-white flex items-center justify-center font-black">
            LO
          </div>
          <div>
            <h2 className="text-base font-black uppercase text-slate-800 dark:text-white tracking-wide">
              Le Ouve Executive Dashboard
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
              Live Business Analytics & Financial Metrics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[9px] font-black uppercase tracking-wider border border-emerald-500/20">
            Realtime Synced
          </span>
        </div>
      </div>

      {/* 🚀 EXECUTIVE FINANCIAL KPI METRICS ROW (5 ຕົວຊີ້ວັດການເງິນ) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* 1. Total Revenue */}
        <div className="high-density-card p-5 border-t-4 border-t-sky-500">
          <div className="flex justify-between items-center">
            <span className="label-xs">Total Revenue (ຍອດຂາຍ)</span>
            <DollarSign className="w-4 h-4 text-sky-500" />
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white font-mono mt-2">
            {financeKPIs.totalRevenue.toLocaleString()} ₭
          </h3>
          <span className="text-[9px] text-sky-500 font-bold uppercase mt-1 block">
            ລາຍຮັບລວມທັງໝົດ
          </span>
        </div>

        {/* 2. COGS (Purchasing) */}
        <div className="high-density-card p-5 border-t-4 border-t-amber-500">
          <div className="flex justify-between items-center">
            <span className="label-xs">COGS / Purchasing (ຕົ້ນທຶນ)</span>
            <ShoppingBag className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white font-mono mt-2">
            {financeKPIs.cogsPurchasing.toLocaleString()} ₭
          </h3>
          <span className="text-[9px] text-amber-500 font-bold uppercase mt-1 block">
            ຄ່າຈັດຊື້ & ວັດຖຸດິບ
          </span>
        </div>

        {/* 3. Gross Margin % */}
        <div className="high-density-card p-5 border-t-4 border-t-indigo-500">
          <div className="flex justify-between items-center">
            <span className="label-xs">Gross Margin %</span>
            <Percent className="w-4 h-4 text-indigo-500" />
          </div>
          <h3 className={`text-xl font-black font-mono mt-2 ${financeKPIs.grossMarginPercent >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-500'}`}>
            {financeKPIs.grossMarginPercent.toFixed(1)}%
          </h3>
          <span className="text-[9px] text-slate-400 font-bold uppercase mt-1 block">
            ກຳໄລຂັ້ນຕົ້ນ: {financeKPIs.grossProfit.toLocaleString()} ₭
          </span>
        </div>

        {/* 4. Net Profit */}
        <div className="high-density-card p-5 border-t-4 border-t-emerald-500">
          <div className="flex justify-between items-center">
            <span className="label-xs">Net Profit (ກຳໄລສຸດທິ)</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <h3 className={`text-xl font-black font-mono mt-2 ${financeKPIs.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {financeKPIs.netProfit.toLocaleString()} ₭
          </h3>
          <span className={`text-[9px] font-bold uppercase mt-1 block ${financeKPIs.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            Net Margin: {financeKPIs.netMarginPercent.toFixed(1)}%
          </span>
        </div>

        {/* 5. ROI % */}
        <div className="high-density-card p-5 border-t-4 border-t-purple-500">
          <div className="flex justify-between items-center">
            <span className="label-xs">ROI % (ຜົນຕອບແທນ)</span>
            <PieChart className="w-4 h-4 text-purple-500" />
          </div>
          <h3 className={`text-xl font-black font-mono mt-2 ${financeKPIs.roiPercent >= 0 ? 'text-purple-600 dark:text-purple-400' : 'text-rose-500'}`}>
            {financeKPIs.roiPercent.toFixed(1)}%
          </h3>
          <span className="text-[9px] text-purple-500 font-bold uppercase mt-1 block">
            Return on Investment
          </span>
        </div>

      </div>

      {/* Charts Section */}
      <div className="high-density-card p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-sm font-black uppercase text-slate-800 dark:text-white tracking-wide">
              Revenue vs Expenses Trend (7 ວັນ)
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
              ການປຽບທຽບກະແສເງິນສົດເຂົ້າ-ອອກ
            </p>
          </div>
          <div className="flex gap-4 text-xs font-bold font-mono">
            <span className="flex items-center gap-1.5 text-emerald-500">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Revenue
            </span>
            <span className="flex items-center gap-1.5 text-rose-500">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Expenses
            </span>
          </div>
        </div>

        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" opacity={0.3} />
              <XAxis dataKey="day" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#141414', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  color: '#fff',
                  fontSize: '11px' 
                }} 
              />
              <Area type="monotone" dataKey="Revenue" stroke="#10b981" fill="url(#colorRev)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="Expenses" stroke="#f43f5e" fill="url(#colorExp)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
