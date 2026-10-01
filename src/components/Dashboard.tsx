import { useState, useEffect, useMemo } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  RefreshCcw, TrendingUp, Activity, Zap, Triangle, History, BrainCircuit, 
  Loader2, X, Search, ChevronRight, Package 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, subDays, isSameDay } from 'date-fns';
import axios from 'axios';
import { User } from 'firebase/auth';

interface DashboardProps {
  userSettings: any;
  user?: User | null;
}

export default function Dashboard({ userSettings, user }: DashboardProps) {
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [rawMovements, setRawMovements] = useState<any[]>([]);
  const [inventoryBalances, setInventoryBalances] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentQuoteIdx, setCurrentQuoteIdx] = useState(0);

  const tips = useMemo(() => [
    {
      la: "ການຈັດການສາງສິນຄ້າທີ່ດີ ຄືຫົວໃຈຂອງຮ້ານຄ້າ Le Ouve!",
      en: "Good stock planning is the heartbeat of retail!",
      emoji: "💡",
      color: "border-sky-500/20 bg-sky-500/5 text-sky-600 dark:text-sky-400"
    },
    {
      la: "ຫຼຸດຕົ້ນທຶນ ເພີ່ມປະສິດທິພາບ ສ້າງກຳໄລທີ່ຍືນຍົງ",
      en: "Reduce costs, maximize flow, build durable profits.",
      emoji: "🚀",
      color: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
    },
    {
      la: "ຕິດຕາມທຸກການເຄື່ອນໄຫວ ເພື່ອການຕັດສິນໃຈທີ່ຖືກຕ້ອງ",
      en: "Every stock move tells a story—learn from your data flow.",
      emoji: "📊",
      color: "border-violet-500/20 bg-violet-500/5 text-violet-600 dark:text-violet-400"
    }
  ], []);

  const getLaoGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return { text: "ສະບາຍດີຕອນເຊົ້າ", emoji: "🌅" };
    if (hours < 17) return { text: "ສະບາຍດີຍາມບ່າຍ", emoji: "☀️" };
    return { text: "ສະບາຍດີຕອນແລງ", emoji: "🌙" };
  };

  const greeting = getLaoGreeting();

  const fetchMatrixData = async () => {
    if (!userSettings?.googleSheetsId) return;
    setSyncing(true);
    setError(null);
    try {
      const [movementsRes, inventoryRes] = await Promise.all([
        axios.get(`/api/sheets/stock-data/${userSettings.googleSheetsId}`),
        axios.get(`/api/sheets/inventory/${userSettings.googleSheetsId}`)
      ]);

      const moveValues = movementsRes.data.values || [];
      let mData: any[] = [];
      if (moveValues.length > 0) {
        mData = moveValues.slice(1).map((row: any[]) => ({
          date: row[0] || '',
          item: String(row[1] || '').trim(),
          type: String(row[2] || 'OUT').toUpperCase().includes('IN') ? 'IN' : 'OUT',
          quantity: parseFloat(String(row[3] || '0').replace(/[^0-9.]/g, '')) || 0
        })).filter(m => m.item);
        setRawMovements(mData);
      }

      const invValues = inventoryRes.data.values || [];
      let iData: any[] = [];
      if (invValues.length > 0) {
        iData = invValues.slice(1).map((row: any[]) => ({
          name: String(row[0] || '').trim(),
          totalIn: parseFloat(String(row[1] || '0')) || 0,
          totalOut: parseFloat(String(row[2] || '0')) || 0,
          current: parseFloat(String(row[3] || '0')) || 0,
          minStock: parseFloat(String(row[4] || '10')) || 10
        })).filter(i => i.name);
        setInventoryBalances(iData);
      }
    } catch (err: any) {
      setError("Matrix Sync: Verify your Google Sheets integration in Settings.");
    } finally {
      setLoading(false);
      setSyncing(false);
      setLastSynced(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => {
    fetchMatrixData();
  }, [userSettings?.googleSheetsId]);

  const analytics = useMemo(() => {
    const stockHealth = inventoryBalances.map(item => {
      const current = parseFloat(item.current) || 0;
      const min = parseFloat(item.minStock) || 0;
      const isCritical = current <= min;
      const isWarning = current <= (min * 1.5);
      const capacity = min > 0 ? min * 3 : 20;
      const health = Math.min(100, Math.round((current / capacity) * 100));

      return {
        name: item.name,
        health,
        current,
        min,
        status: isCritical ? 'Critical' : isWarning ? 'Warning' : 'Healthy'
      };
    });

    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
    const trendsByDay = last7Days.map(date => ({
      day: format(date, 'EEE'),
      fullDate: date,
      in: 0,
      out: 0
    }));

    rawMovements.forEach(m => {
      const mDate = new Date(m.date);
      if (!isNaN(mDate.getTime())) {
        const found = trendsByDay.find(t => isSameDay(t.fullDate, mDate));
        if (found) {
          if (m.type === 'IN') found.in += m.quantity;
          else found.out += m.quantity;
        }
      }
    });

    return { stockHealth, trends: trendsByDay };
  }, [rawMovements, inventoryBalances]);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <BrainCircuit className="w-5 h-5 text-primary animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-[#052659] dark:text-white">Le Ouve Intelligence Hub</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
              {lastSynced ? `Synced: ${lastSynced} • ${inventoryBalances.length} Items` : 'Ready to Sync'}
            </p>
          </div>
        </div>
        <button 
          onClick={fetchMatrixData} 
          disabled={syncing}
          className="crystal-button !py-2 !px-4 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCcw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          <span className="text-[10px] font-black uppercase">{syncing ? 'SYNCING...' : 'SYNC SHEETS'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 glass-card p-6 bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-4xl">{greeting.emoji}</span>
            <div>
              <h3 className="text-sm font-black uppercase text-[#052659] dark:text-white">
                {greeting.text}, {user?.displayName || 'Partner'}!
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                {format(new Date(), 'EEEE, dd MMMM yyyy')}
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-[9px] font-black uppercase">Online</span>
        </div>

        <div 
          onClick={() => setCurrentQuoteIdx((prev) => (prev + 1) % tips.length)}
          className={`glass-card p-6 border cursor-pointer flex flex-col justify-between ${tips[currentQuoteIdx].color}`}
        >
          <span className="text-[8px] font-black uppercase tracking-widest opacity-60">LE OUVE INSPIRATION • TAP TO SWAP</span>
          <p className="text-xs font-black leading-tight mt-1">{tips[currentQuoteIdx].la}</p>
        </div>
      </div>

      {/* Stock Health & IN/OUT Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="high-density-card flex flex-col h-[350px]">
          <h3 className="label-xs flex items-center gap-2 mb-4">
            <Activity className="w-3 h-3 text-emerald-500" />
            Stock Health Analysis
          </h3>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {analytics.stockHealth.map((item, idx) => (
              <div key={idx} className="space-y-1 text-xs">
                <div className="flex justify-between font-bold">
                  <span>{item.name}</span>
                  <span className={item.status === 'Critical' ? 'text-red-500' : 'text-emerald-500'}>{item.current} in stock</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full ${item.status === 'Critical' ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${item.health}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 high-density-card flex flex-col h-[350px]">
          <h3 className="label-xs flex items-center gap-2 mb-4">
            <TrendingUp className="w-3 h-3 text-primary" />
            IN vs OUT (7-Day Movement)
          </h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.trends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="day" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 800 }} />
                <Area type="monotone" dataKey="in" stroke="#94A3B8" fill="transparent" strokeWidth={2} />
                <Area type="monotone" dataKey="out" stroke="#052659" fill="#052659" fillOpacity={0.1} strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
