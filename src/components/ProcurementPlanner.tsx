import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { 
  TrendingUp, Printer, Cpu, CheckCircle, Search, RotateCw, FileDown, 
  ShoppingCart, Info, Sliders, Building, Check, Smartphone, AlertCircle, Trash2, Truck 
} from 'lucide-react';

const getSinglePackPriceLAK = (quote: any): number => {
  if (!quote) return 100000;
  if (quote.priceMode === 'total' || quote.priceMode === 'per_pack' || quote.totalPriceLAK !== undefined) {
    return Number(quote.priceLAK || 0);
  }
  const totalOriginal = Number(quote.priceOriginal || 0);
  const exchangeRate = Number(quote.exchangeRate || 1);
  const totalLAK = quote.currency === 'LAK' ? totalOriginal : totalOriginal * exchangeRate;
  return totalLAK / Number(quote.quantity || 1);
};

const getQuoteUnitCostLAK = (quote: any, defaultPackSize?: number): number => {
  if (!quote) return 100000;
  const packPriceLAK = getSinglePackPriceLAK(quote);
  const size = Number(quote.quantityPerUnit || defaultPackSize || 1);
  return packPriceLAK / (size || 1);
};

export function getSmartPackSize(
  productName: string,
  productUnit: string,
  configPackSize?: number,
  quoteQuantityPerUnit?: number,
  quotePriceLAK?: number
): number {
  if (quoteQuantityPerUnit && quoteQuantityPerUnit > 1) return quoteQuantityPerUnit;
  if (configPackSize && configPackSize > 1) return configPackSize;

  const name = (productName || '').toLowerCase().trim();
  const prodUnit = (productUnit || '').toLowerCase().trim();

  const numericUnitsMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:g|ml|ກຣາມ|ມລ|gram|milliliter)/);
  if (numericUnitsMatch) return parseFloat(numericUnitsMatch[1]);

  const kgLMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:kg|l|ກລ|ກິໂລ|ລິດ|litre|kilogram)/);
  if (kgLMatch) return parseFloat(kgLMatch[1]) * 1000;

  const laKMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:ກ|k)/);
  if (laKMatch) return parseFloat(laKMatch[1]) * 1000;

  if ((prodUnit === 'g' || prodUnit === 'ml') && (quotePriceLAK || 0) > 1000) return 1000;
  return 1;
}

export function getCommercialPackSize(productName: string, unit: string): number {
  const name = (productName || '').toLowerCase().trim();
  const u = (unit || '').toLowerCase().trim();
  if (u === 'g' || u === 'ກຣາມ') {
    if (name.includes('ນ້ຳຕານ') || name.includes('sugar') || name.includes('ຄີມ') || name.includes('creamer') || name.includes('ເກືອ')) return 1000;
    if (name.includes('ກາເຟ') || name.includes('coffee') || name.includes('ເມັດ')) return 500;
    return 500;
  }
  if (u === 'ml' || u === 'ມລ' || u === 'ລິດ' || u === 'l') return 1000;
  return 1;
}

export default function ProcurementPlanner() {
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [salesRecords, setSalesRecords] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);

  const [plannerTab, setPlannerTab] = useState<'auto' | 'manual'>('auto');
  const [manualBasket, setManualBasket] = useState<{ [productId: string]: number }>({});
  const [manualProductSearch, setManualProductSearch] = useState('');
  const [dismissedSuppliers, setDismissedSuppliers] = useState<string[]>([]);

  const [targetCoverageDays, setTargetCoverageDays] = useState<number>(6);
  const [forecastMethod, setForecastMethod] = useState<'predictive' | 'historical'>('predictive');
  const [projectedCupsPerDay, setProjectedCupsPerDay] = useState<number>(50);
  const [onlyExhaustion, setOnlyExhaustion] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [supplierStrategy, setSupplierStrategy] = useState<'lowest_cost' | 'most_stock_in'>('most_stock_in');
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [paperWidth, setPaperWidth] = useState<'90mm' | '80mm' | '50mm'>('80mm');
  const [selectedBill, setSelectedBill] = useState<any>(null);
  
  const [connectionType, setConnectionType] = useState<'network' | 'bluetooth'>('network');
  const [printerIp, setPrinterIp] = useState('192.168.1.22');
  const [printerPort, setPrinterPort] = useState('9100');
  const [ipConnected, setIpConnected] = useState(false);
  const [btConnected, setBtConnected] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubP = onSnapshot(query(collection(db, 'products')), snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubS = onSnapshot(query(collection(db, 'supplierPrices')), snap => setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubR = onSnapshot(query(collection(db, 'recipes')), snap => setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubSales = onSnapshot(query(collection(db, 'menu_sales')), snap => setSalesRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubAdj = onSnapshot(query(collection(db, 'inventory')), snap => {
      setAdjustments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubP(); unsubS(); unsubR(); unsubSales(); unsubAdj();
    };
  }, []);

  const processedPlannerData = useMemo(() => {
    return products.map(p => {
      const pPrices = supplierPrices.filter(sp => sp.productId === p.id);
      const totalIn = pPrices.reduce((sum, sp) => {
        let size = sp.quantityPerUnit || p.packSize || 1;
        if (size <= 1) size = getCommercialPackSize(p.name, (p.unit || 'g').toLowerCase());
        return sum + ((sp.quantity || 0) * size);
      }, 0);

      const pAdjs = adjustments.filter(adj => adj.productId === p.id);
      const totalAdjustment = pAdjs.reduce((sum, adj) => sum + (adj.amount || 0), 0);
      const currentBalance = Math.max(0, totalIn + totalAdjustment);

      const avgDailyBurn = p.isDurable ? 0 : 25; // Simple estimated fallback burn
      const safetyBuffer = parseFloat(p.minStock) || 0;
      const targetStockLevel = (avgDailyBurn * targetCoverageDays) + safetyBuffer;
      const suggestedAmountToOrder = Math.max(0, targetStockLevel - currentBalance);

      return {
        ...p,
        currentBalance,
        avgDailyBurn,
        safetyBuffer,
        targetStockLevel,
        suggestedAmountToOrder
      };
    });
  }, [products, supplierPrices, adjustments, targetCoverageDays]);

  const supplierPurchaseGroups = useMemo(() => {
    const rawToRestock = processedPlannerData.filter(item => item.suggestedAmountToOrder > 0);
    const groups: { [supplierName: string]: { supplier: string; items: any[]; totalCost: number } } = {};

    rawToRestock.forEach(item => {
      const pricesForProduct = supplierPrices.filter(sp => sp.productId === item.id);
      const bestSelection = pricesForProduct[0] || null;
      const chosenSupplier = bestSelection ? bestSelection.supplier : 'General Supplier';
      const pricePerPack = bestSelection ? getSinglePackPriceLAK(bestSelection) : 100000;
      const sizePerPack = bestSelection?.quantityPerUnit || item.packSize || 1;
      const recommendedPacks = Math.ceil(item.suggestedAmountToOrder / (sizePerPack || 1));
      const lineCost = recommendedPacks * pricePerPack;

      if (!groups[chosenSupplier]) {
        groups[chosenSupplier] = { supplier: chosenSupplier, items: [], totalCost: 0 };
      }
      groups[chosenSupplier].items.push({
        productName: item.name,
        packsToOrder: recommendedPacks,
        costPerPack: pricePerPack,
        lineCost,
        buyUnit: bestSelection?.unit || 'PACK'
      });
      groups[chosenSupplier].totalCost += lineCost;
    });

    return Object.values(groups).filter(g => !dismissedSuppliers.includes(g.supplier));
  }, [processedPlannerData, supplierPrices, dismissedSuppliers]);

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white dark:bg-slate-900 shadow-xl rounded-3xl p-6 lg:p-8 border border-slate-100 dark:border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="bg-[#052659] text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Procurement
          </span>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white mt-2 leading-tight">
            {i18n.language === 'la' ? 'ແຜນຈັດຊື້ & ບິນອັດຕະໂນມັດ' : 'Smart Procurement & Billing Optimization'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {i18n.language === 'la' ? 'ຄຳນວນເຕີມສາງອັດຕະໂນມັດ ພ້ອມແຍກບິນໄປຕາມຮ້ານຄ້າທີ່ຖືກທີ່ສຸດ' : 'Replenishment calculation cost-optimized across active suppliers.'}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setOnlyExhaustion(!onlyExhaustion)}
            className={`p-3 rounded-2xl border text-xs font-black flex items-center gap-2 cursor-pointer ${onlyExhaustion ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-100 text-slate-600'}`}
          >
            <span>{onlyExhaustion ? 'Exhaustion Only: ON' : 'All Items'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {supplierPurchaseGroups.map((bill, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-3xl p-6 shadow-lg flex flex-col justify-between space-y-4">
            <div>
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-3">
                <h3 className="text-sm font-black uppercase text-[#052659] dark:text-white flex items-center gap-2">
                  <Building className="w-4 h-4 text-emerald-500" />
                  {bill.supplier}
                </h3>
                <span className="text-xs font-mono font-black text-emerald-600">
                  {bill.totalCost.toLocaleString()} ₭
                </span>
              </div>

              <div className="space-y-2 mt-4 max-h-40 overflow-y-auto">
                {bill.items.map((it, i) => (
                  <div key={i} className="flex justify-between items-center text-xs p-2 bg-slate-50 dark:bg-white/5 rounded-xl">
                    <span className="font-bold text-slate-800 dark:text-white">{it.productName}</span>
                    <span className="font-mono text-sky-500 font-bold">{it.packsToOrder} {it.buyUnit}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setSelectedBill(bill);
                setIsPrinterModalOpen(true);
              }}
              className="w-full py-3 bg-[#052659] hover:bg-[#0c3a80] text-white text-xs font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Thermal Voucher</span>
            </button>
          </div>
        ))}
      </div>

      {/* Thermal Print Modal */}
      <AnimatePresence>
        {isPrinterModalOpen && selectedBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full space-y-4">
              <div className="flex justify-between items-center border-b border-white/10 pb-3 text-white">
                <h3 className="text-xs font-black uppercase tracking-wider">Thermal Receipt Preview</h3>
                <button onClick={() => setIsPrinterModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              {/* Thermal Voucher with Le Ouve Header */}
              <div className="bg-[#faf7f0] text-slate-800 p-6 shadow-md border-t-8 border-dashed border-red-500/25 font-mono text-xs select-none">
                <div className="text-center space-y-1">
                  <h2 className="text-[14px] font-black tracking-tight uppercase leading-4 text-slate-900 font-sans">
                    ☕ LE OUVE WORKSPACE
                  </h2>
                  <p className="text-[9px] text-slate-500">Vientiane, Lao PDR</p>
                  <p className="text-[9px] text-slate-400">--------------------------------</p>
                  <p className="text-[10px] font-black uppercase">SUPPLIER INVOICE</p>
                  <p className="text-[9px] text-slate-400">--------------------------------</p>
                </div>

                <div className="mt-3 space-y-1 text-[10px]">
                  <div className="flex justify-between"><span>SUPPLIER:</span><span className="font-bold">{selectedBill.supplier}</span></div>
                  <div className="flex justify-between"><span>DATE:</span><span>{new Date().toLocaleDateString()}</span></div>
                </div>

                <div className="space-y-1 my-3 border-t border-b border-dashed border-slate-300 py-2">
                  {selectedBill.items.map((it: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span className="truncate max-w-[120px]">{it.productName}</span>
                      <span>{it.packsToOrder}x {it.buyUnit}</span>
                      <span>{it.lineCost.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-xs font-black">
                  <span>TOTAL:</span>
                  <span>{selectedBill.totalCost.toLocaleString()} ₭</span>
                </div>
              </div>

              <button
                onClick={() => window.print()}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest cursor-pointer"
              >
                Print to Device
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
