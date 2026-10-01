import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  deleteDoc, doc, updateDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Legend 
} from 'recharts';
import { 
  Plus, Trash2, Edit3, Save, X, Search, Truck, Clock, Download, 
  BarChart3, List, Check, TrendingUp, Receipt, ShoppingBag, Layers, Info,
  Sparkles, Calendar, ArrowUpRight, ArrowDownRight, Tag, Sliders
} from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import { useTranslation } from 'react-i18next';
import { COMMON_RESOURCES } from '../constants';
import ApprovalModal from './ApprovalModal';

export default function Suppliers() {
  const { t, i18n } = useTranslation();
  const [displayPrice, setDisplayPrice] = useState('');

  const formatWithCommas = (val: string) => {
    const num = val.replace(/,/g, '');
    if (!num) return '';
    if (isNaN(Number(num))) return displayPrice;
    return Number(num).toLocaleString();
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/,/g, '');
    if (rawValue === '' || !isNaN(Number(rawValue))) {
      const formatted = formatWithCommas(e.target.value);
      setDisplayPrice(formatted);
      setNewPrice({ ...newPrice, priceOriginal: Number(rawValue) || 0 });
    }
  };

  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [showProductManager, setShowProductManager] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductUnit, setEditProductUnit] = useState('');
  const [editProductIsDurable, setEditProductIsDurable] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceData, setEditPriceData] = useState<any>(null);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Price Insights
  const priceInsights = React.useMemo(() => {
    const list: any[] = [];
    const productGroups: { [key: string]: any[] } = {};
    
    [...supplierPrices].reverse().forEach(p => {
      if (!p.productId) return;
      if (!productGroups[p.productId]) productGroups[p.productId] = [];
      productGroups[p.productId].push(p);
    });

    Object.entries(productGroups).forEach(([prodId, prices]) => {
      if (prices.length < 2) return;
      
      const latest = prices[prices.length - 1];
      const previous = prices[prices.length - 2];
      
      const latestOriginalLAK = (latest.currency === 'LAK' ? latest.priceOriginal : latest.priceOriginal * (latest.exchangeRate || 1));
      const prevOriginalLAK = (previous.currency === 'LAK' ? previous.priceOriginal : previous.priceOriginal * (previous.exchangeRate || 1));
      const latestStandardPrice = latestOriginalLAK / ((latest.quantity || 1) * (latest.quantityPerUnit || 1));
      const prevStandardPrice = prevOriginalLAK / ((previous.quantity || 1) * (previous.quantityPerUnit || 1));
      
      if (prevStandardPrice > 0) {
        const diff = (latestStandardPrice - prevStandardPrice) / prevStandardPrice;
        if (Math.abs(diff) >= 0.08) {
          const product = products.find(p => p.id === latest.productId);
          list.push({
            productId: latest.productId,
            productName: product?.name || 'Item',
            unit: latest.unit || 'UNIT',
            supplier: latest.supplier,
            diff: diff * 100,
            type: diff > 0 ? 'increase' : 'decrease',
            latestPrice: latestStandardPrice,
            prevPrice: prevStandardPrice
          });
        }
      }
    });
    return list;
  }, [supplierPrices, products]);

  const finalInsights = React.useMemo(() => {
    const list = [...priceInsights];
    if (list.length < 3) {
      list.push({
        isSystem: true,
        type: 'compare',
        productName: i18n.language === 'la' ? 'ລະບົບປຽບທຽບ 3 ຮ້ານຄ້າ' : '3-Supplier Price Match',
        message: i18n.language === 'la'
          ? 'ຊ່ວຍຈັດອັບດັບລາຄາທີ່ຖືກທີ່ສຸດຈາກຜູ້ສະໜອງເພື່ອຫຼຸດຕົ້ນທຶນ ແລະ ເພີ່ມກຳໄລສູງສຸດໃຫ້ Le Ouve!'
          : 'Automatically detects lowest procurement bids to protect gross margins.'
      });
    }
    if (list.length < 3) {
      list.push({
        isSystem: true,
        type: 'dual_mode',
        productName: i18n.language === 'la' ? 'ໂໝດປ້ອນລາຄາອັດສະລິຍະ' : 'Dual Price Mode',
        message: i18n.language === 'la'
          ? 'ປ້ອນພຽງ "ລາຄາລວມ" ຫຼື "ລາຄາຕໍ່ແພັກ" ຢ່າງໃດຢ່າງໜຶ່ງ, ລະບົບຈະຄິດໄລ່ອີກຄ່າໜຶ່ງໃຫ້ເອງທັນທີ.'
          : 'Enter Total or Per-pack price; the system divides/multiplies dynamically.'
      });
    }
    return list.slice(0, 3);
  }, [priceInsights, i18n.language]);

  const [selectedCompProduct, setSelectedCompProduct] = useState<string>('');
  const [purchaseQty, setPurchaseQty] = useState<number>(10);

  const supplierComparison = React.useMemo(() => {
    const comparisonMap: { [productId: string]: { [supplier: string]: { price: number, date: string, rawRecord: any } } } = {};

    const sortedPrices = [...supplierPrices].sort((a, b) => {
      const timeA = a.createdAt?.toDate?.()?.getTime() || new Date(a.date).getTime();
      const timeB = b.createdAt?.toDate?.()?.getTime() || new Date(b.date).getTime();
      return timeA - timeB;
    });

    sortedPrices.forEach(p => {
      if (!p.productId || !p.supplier) return;
      if (!comparisonMap[p.productId]) comparisonMap[p.productId] = {};
      const isNew = p.totalPriceLAK !== undefined || p.priceMode !== undefined;
      const packPrice = isNew
        ? Number(p.priceLAK || 0)
        : (p.currency === 'LAK' ? Number(p.priceOriginal || 0) : Number(p.priceOriginal || 0) * Number(p.exchangeRate || 1)) / Number(p.quantity || 1);
      const unitPrice = packPrice / Number(p.quantityPerUnit || 1);
      comparisonMap[p.productId][p.supplier] = { price: unitPrice, date: p.date, rawRecord: p };
    });

    const list: any[] = [];
    Object.entries(comparisonMap).forEach(([prodId, supplierMap]) => {
      const product = products.find(p => p.id === prodId);
      if (!product) return;

      const rankedSuppliers = Object.entries(supplierMap).map(([supplier, data]) => ({
        supplier,
        unitPrice: data.price,
        date: data.date,
        currency: data.rawRecord.currency,
        priceOriginal: data.rawRecord.priceOriginal,
        quantityPerUnit: data.rawRecord.quantityPerUnit || 1,
        unit: data.rawRecord.unit || product.unit || 'UNIT'
      })).sort((a, b) => a.unitPrice - b.unitPrice);

      if (rankedSuppliers.length > 0) {
        const best = rankedSuppliers[0];
        const worst = rankedSuppliers[rankedSuppliers.length - 1];
        const savingsPerUnit = worst.unitPrice - best.unitPrice;
        const savingsPercent = worst.unitPrice > 0 ? (savingsPerUnit / worst.unitPrice) * 100 : 0;

        list.push({
          productId: prodId,
          productName: product.name,
          unit: product.unit || best.unit || 'UNIT',
          rankedSuppliers,
          bestSupplier: best.supplier,
          bestPrice: best.unitPrice,
          savingsPerUnit,
          savingsPercent,
          hasComparison: rankedSuppliers.length > 1
        });
      }
    });

    return list;
  }, [supplierPrices, products]);

  useEffect(() => {
    if (selectedCompProduct === '' && supplierComparison.length > 0) {
      const firstWithComp = supplierComparison.find(c => c.hasComparison) || supplierComparison[0];
      if (firstWithComp) setSelectedCompProduct(firstWithComp.productId);
    }
  }, [supplierComparison, selectedCompProduct]);

  // Last 10 price records for bar chart
  const lastTenPrices = React.useMemo(() => {
    return [...supplierPrices].slice(0, 10).reverse().map(p => {
      const totalLAK = p.totalPriceLAK !== undefined 
        ? Number(p.totalPriceLAK) 
        : (p.currency === 'LAK' ? p.priceOriginal : p.priceOriginal * (p.exchangeRate || 1));
      return {
        ...p,
        totalLAK,
      };
    });
  }, [supplierPrices]);

  const [saveLoading, setSaveLoading] = useState(false);

  // Form State
  const [newPrice, setNewPrice] = useState({
    productId: '',
    supplier: '',
    currency: 'LAK',
    exchangeRate: 1,
    priceOriginal: 0,
    priceLAK: 0,
    quantity: 1,
    quantityPerUnit: 1,
    unit: '',
    remark: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    priceMode: 'total' as 'total' | 'per_pack'
  });

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalType, setApprovalType] = useState<'create' | 'delete' | 'new_product' | null>(null);
  const [pendingAction, setPendingAction] = useState<any>(null);

  useEffect(() => {
    const qP = query(collection(db, 'products'), orderBy('name'));
    const unsubscribeP = onSnapshot(qP, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, error => handleFirestoreError(error, OperationType.LIST, 'products'));

    const qS = query(collection(db, 'supplierPrices'), orderBy('createdAt', 'desc'));
    const unsubscribeS = onSnapshot(qS, (snap) => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, error => handleFirestoreError(error, OperationType.LIST, 'supplierPrices'));

    return () => { unsubscribeP(); unsubscribeS(); };
  }, []);

  const handleExport = () => {
    const headers = ['Date', 'Product', 'Supplier', 'Price LAK', 'Quantity', 'Unit', 'User'];
    const rows = supplierPrices.map(p => [
      format(p.createdAt?.toDate() || new Date(), 'yyyy-MM-dd'),
      products.find(prod => prod.id === p.productId)?.name || 'Unknown',
      p.supplier,
      p.priceLAK,
      p.quantity,
      p.unit,
      p.userEmail
    ]);

    const worksheet = utils.aoa_to_sheet([headers, ...rows]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Suppliers Report');
    writeFile(workbook, `leouve_suppliers_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleAddPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrice.productId || !newPrice.supplier) {
      alert("ກະລຸນາເລືອກສິນຄ້າ ແລະ ຊື່ຜູ້ສະໜອງ");
      return;
    }

    try {
      setSaveLoading(true);
      let singlePriceOriginal = newPrice.priceOriginal;
      if (newPrice.priceMode === 'total') {
        singlePriceOriginal = newPrice.priceOriginal / (newPrice.quantity || 1);
      }
      
      const calculatedPriceLAK = (newPrice.currency === 'LAK' ? singlePriceOriginal : singlePriceOriginal * newPrice.exchangeRate);
      const totalOriginal = newPrice.priceMode === 'total' ? newPrice.priceOriginal : newPrice.priceOriginal * (newPrice.quantity || 1);
      const totalLAK = (newPrice.currency === 'LAK' ? totalOriginal : totalOriginal * newPrice.exchangeRate);

      await addDoc(collection(db, 'supplierPrices'), {
        ...newPrice,
        priceOriginal: singlePriceOriginal,
        priceLAK: calculatedPriceLAK,
        totalPriceOriginal: totalOriginal,
        totalPriceLAK: totalLAK,
        createdAt: serverTimestamp(),
        userId: auth.currentUser?.uid || 'admin',
        userEmail: auth.currentUser?.email || 'admin@leouve.com',
      });
      
      setProductSearch('');
      setDisplayPrice('');
      setNewPrice({ 
        productId: '', 
        supplier: '', 
        currency: 'LAK', 
        exchangeRate: 1, 
        priceOriginal: 0, 
        priceLAK: 0, 
        quantity: 1, 
        quantityPerUnit: 1, 
        unit: '',
        remark: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm'),
        priceMode: 'total'
      });
      alert("ບັນທຶກລາຄາຜູ້ສະໜອງສຳເລັດແລ້ວ!");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'supplierPrices');
    } finally {
      setSaveLoading(false);
    }
  };

  const executeApprovedAction = async () => {
    if (approvalType === 'delete' && pendingAction) {
      try {
        await deleteDoc(doc(db, 'supplierPrices', pendingAction));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'supplierPrices');
      }
    }
    setApprovalType(null);
    setPendingAction(null);
  };

  // Live Calculated Single Pack & Base Unit Price for Form Preview
  const previewCost = React.useMemo(() => {
    const rawVal = newPrice.priceOriginal;
    const rate = newPrice.currency === 'LAK' ? 1 : (newPrice.exchangeRate || 1);
    const qty = newPrice.quantity || 1;
    const subQty = newPrice.quantityPerUnit || 1;

    let singlePackLAK = 0;
    let totalLAK = 0;

    if (newPrice.priceMode === 'total') {
      totalLAK = rawVal * rate;
      singlePackLAK = totalLAK / qty;
    } else {
      singlePackLAK = rawVal * rate;
      totalLAK = singlePackLAK * qty;
    }

    const subItemPriceLAK = singlePackLAK / subQty;

    return { totalLAK, singlePackLAK, subItemPriceLAK };
  }, [newPrice]);

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* 🚀 TOP BAR: Live Index Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-[#141414] p-5 rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
              <span>Le Ouve Procurement & Price Index</span>
              <span className="px-2 py-0.5 text-[8px] bg-emerald-500/10 text-emerald-500 rounded-md font-mono">LIVE FEED</span>
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
              {products.length} Products Tracked • {supplierPrices.length} Historical Quotes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          
          <button
            type="button"
            onClick={() => setIsHelpModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{i18n.language === 'la' ? 'ວິທີໃຊ້' : 'Guide'}</span>
          </button>
        </div>
      </div>

      <ApprovalModal 
        isOpen={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        onApprove={executeApprovedAction}
        actionType={approvalType || ''}
        actionData={pendingAction && approvalType === 'delete' ? {
          id: pendingAction,
          item: products.find(p => p.id === supplierPrices.find(sp => sp.id === pendingAction)?.productId)?.name,
          supplier: supplierPrices.find(sp => sp.id === pendingAction)?.supplier,
          date: supplierPrices.find(sp => sp.id === pendingAction)?.date
        } : null}
      />

      {/* 🧩 BENTO GRID: Entry Form (Left) & Comparator + Insights (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* 1. LEFT COLUMN: Modern Procurement Form (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="high-density-card p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800/80 pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-500" />
                <span>ບັນທຶກລາຄາຈາກຜູ້ສະໜອງ</span>
              </h3>
              <span className="text-[9px] font-mono text-slate-400 uppercase">Input Terminal</span>
            </div>

            <form onSubmit={handleAddPrice} className="space-y-4">
              
              {/* Product Resource Search & Select */}
              <div className="space-y-1.5 relative">
                <label className="label-xs flex justify-between">
                  <span>{t('product_resource')}</span>
                  <span className="text-[9px] text-sky-500 cursor-pointer hover:underline" onClick={() => setShowProductManager(true)}>
                    + ຈັດການສິນຄ້າ
                  </span>
                </label>
                
                <div className="relative">
                  <input 
                    type="text"
                    required
                    className="crystal-input w-full !text-xs font-bold pl-9"
                    placeholder="ພິມຊື່ສິນຄ້າເພື່ອຄົ້ນຫາ..."
                    value={isProductDropdownOpen ? productSearch : (products.find(p => p.id === newPrice.productId)?.name || productSearch)}
                    onFocus={() => setIsProductDropdownOpen(true)}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setIsProductDropdownOpen(true);
                    }}
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  
                  {isProductDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-[#1c1c1c] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                      {products
                        .filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()))
                        .map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left p-3 hover:bg-slate-100 dark:hover:bg-neutral-800/60 border-b border-slate-100 dark:border-neutral-800/40 last:border-none flex justify-between items-center"
                          onClick={() => {
                            setNewPrice({
                              ...newPrice, 
                              productId: p.id, 
                              unit: p.unit || newPrice.unit,
                              quantityPerUnit: p.packSize || 1
                            });
                            setProductSearch(p.name);
                            setIsProductDropdownOpen(false);
                          }}
                        >
                          <span className="text-xs font-bold text-slate-800 dark:text-white">{p.name}</span>
                          <span className="text-[9px] font-mono text-slate-400 uppercase bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded">{p.unit || 'UNIT'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Supplier Name with Quick Select Pills */}
              <div className="space-y-1.5">
                <label className="label-xs">ຊື່ຜູ້ສະໜອງ (Supplier / Vendor)</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. LATDA, CHANHOM, DMART..."
                  className="crystal-input w-full !text-xs font-bold"
                  value={newPrice.supplier}
                  onChange={e => setNewPrice({...newPrice, supplier: e.target.value})}
                />
                
                {/* Quick Pills */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['LATDA', 'CHANHOM', 'DMART', 'HEAVENLY', 'MARRY ANN', 'MARKET'].map(sup => (
                    <button
                      key={sup}
                      type="button"
                      onClick={() => setNewPrice({...newPrice, supplier: sup})}
                      className={`px-2.5 py-1 text-[9px] font-bold rounded-lg border transition-all cursor-pointer ${
                        newPrice.supplier === sup 
                          ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 border-transparent shadow-xs' 
                          : 'bg-slate-100 dark:bg-neutral-900 border-slate-200/60 dark:border-neutral-800 text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      {sup}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Mode Toggle (Total vs Per Pack) */}
              <div className="space-y-1.5">
                <label className="label-xs">{i18n.language === 'la' ? 'ຮູບແບບການປ້ອນລາຄາ' : 'Price Input Mode'}</label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl border border-slate-200/60 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setNewPrice({...newPrice, priceMode: 'total'})}
                    className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      newPrice.priceMode === 'total'
                        ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>{i18n.language === 'la' ? 'ລາຄາລວມບິນ' : 'Total Price'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPrice({...newPrice, priceMode: 'per_pack'})}
                    className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      newPrice.priceMode === 'per_pack'
                        ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{i18n.language === 'la' ? 'ລາຄາຕໍ່ແພັກ' : 'Price per Pack'}</span>
                  </button>
                </div>
              </div>

              {/* Price & Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="label-xs">{t('price_original')}</label>
                  <input 
                    type="text" 
                    required
                    className="crystal-input !text-sm h-11 font-mono font-bold w-full"
                    value={displayPrice}
                    placeholder="0"
                    onChange={handlePriceChange}
                  />
                </div>
                <div className="space-y-1">
                  <label className="label-xs">{t('currency')}</label>
                  <select 
                    className="crystal-input !text-xs h-11 w-full font-bold cursor-pointer"
                    value={newPrice.currency}
                    onChange={e => setNewPrice({...newPrice, currency: e.target.value, exchangeRate: e.target.value === 'LAK' ? 1 : newPrice.exchangeRate})}
                  >
                    <option value="LAK">LAK (₭)</option>
                    <option value="THB">THB (฿)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              {/* Exchange rate factor if foreign currency */}
              {newPrice.currency !== 'LAK' && (
                <div className="space-y-1 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                  <label className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                    Exchange Rate ({newPrice.currency} ➔ LAK)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newPrice.exchangeRate || ''}
                    onChange={e => setNewPrice({...newPrice, exchangeRate: parseFloat(e.target.value) || 1})}
                    className="crystal-input w-full !text-xs font-mono font-bold mt-1"
                    placeholder="e.g. 680"
                  />
                </div>
              )}

              {/* Qty × Sub-qty × Unit inline */}
              <div className="space-y-1">
                <label className="label-xs">{t('qty_unit')} (ຈຳນວນແພັກ × ຂະໜາດ)</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <input 
                      type="number" 
                      min="1"
                      className="crystal-input w-full text-center font-bold !text-xs"
                      value={newPrice.quantity || ''}
                      placeholder="Qty (ແພັກ)"
                      onChange={e => setNewPrice({...newPrice, quantity: parseFloat(e.target.value) || 1})}
                    />
                  </div>
                  <span className="text-slate-400 font-black">×</span>
                  <div className="flex-1">
                    <input 
                      type="number" 
                      min="1"
                      className="crystal-input w-full text-center font-bold !text-xs"
                      value={newPrice.quantityPerUnit || ''}
                      placeholder="Vol/Pack"
                      onChange={e => setNewPrice({...newPrice, quantityPerUnit: parseFloat(e.target.value) || 1})}
                    />
                  </div>
                  <div className="w-24">
                    <input 
                      type="text"
                      className="crystal-input w-full text-center font-bold !text-xs uppercase"
                      value={newPrice.unit}
                      placeholder="Unit (g/ml)"
                      onChange={e => setNewPrice({...newPrice, unit: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {/* Date & Memo */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="label-xs">ວັນທີຊື້</label>
                  <input 
                    type="date"
                    required
                    className="crystal-input w-full !text-xs font-mono"
                    value={newPrice.date}
                    onChange={e => setNewPrice({...newPrice, date: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="label-xs">ໝາຍເຫດ</label>
                  <input 
                    type="text" 
                    className="crystal-input w-full !text-xs"
                    placeholder="Batch, note..."
                    value={newPrice.remark}
                    onChange={e => setNewPrice({...newPrice, remark: e.target.value})}
                  />
                </div>
              </div>

              {/* 💡 LIVE REAL-TIME CALCULATION PREVIEW */}
              {previewCost.totalLAK > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1.5 font-mono">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">ຍອດລວມທັງໝົດ:</span>
                    <span className="text-sm font-black text-emerald-800 dark:text-emerald-300">
                      {Math.round(previewCost.totalLAK).toLocaleString()} ₭
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400">
                    <span>ຕົກແພັກລະ:</span>
                    <span className="font-bold">{Math.round(previewCost.singlePackLAK).toLocaleString()} ₭ / ແພັກ</span>
                  </div>
                  {newPrice.quantityPerUnit > 1 && (
                    <div className="flex justify-between items-center text-[10px] text-sky-600 dark:text-sky-400 font-bold border-t border-emerald-500/15 pt-1">
                      <span>ຕົ້ນທຶນຍ່ອຍ:</span>
                      <span>{previewCost.subItemPriceLAK.toFixed(2)} ₭ / {newPrice.unit || 'unit'}</span>
                    </div>
                  )}
                </div>
              )}

              <button 
                type="submit" 
                disabled={saveLoading}
                className="crystal-button w-full h-11 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{saveLoading ? 'ກຳລັງບັນທຶກ...' : t('commit_record')}</span>
              </button>
            </form>
          </div>
        </div>

        {/* 2. RIGHT COLUMN: 3-Supplier Comparator & Price Feed (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Supplier Price Comparator Podium */}
          <div className="high-density-card p-6 space-y-5">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-neutral-800/80 pb-3">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-800 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span>{i18n.language === 'la' ? 'ລະບົບປຽບທຽບ 3 ຜູ້ສະໜອງ' : 'Supplier Price Comparator'}</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                  ຄົ້ນຫາຮ້ານທີ່ໃຫ້ລາຄາຖືກທີ່ສຸດເພື່ອປົກປ້ອງກຳໄລ
                </p>
              </div>

              {/* Product Selector Dropdown */}
              {supplierComparison.length > 0 && (
                <select
                  value={selectedCompProduct}
                  onChange={e => setSelectedCompProduct(e.target.value)}
                  className="crystal-input !py-1.5 !text-xs font-bold font-sans max-w-[200px]"
                >
                  {supplierComparison.map(c => (
                    <option key={c.productId} value={c.productId}>
                      {c.productName} ({c.unit})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {supplierComparison.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs italic">
                ຍັງບໍ່ມີຂໍ້ມູນລາຄາປຽບທຽບ, ກະລຸນາບັນທຶກລາຄາສິນຄ້າເຂົ້າລະບົບກ່ອນ.
              </div>
            ) : (
              (() => {
                const compData = supplierComparison.find(c => c.productId === selectedCompProduct);
                if (!compData) return null;

                return (
                  <div className="space-y-4">
                    {/* Quantity Slider */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/60 dark:border-neutral-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="label-xs text-slate-500">ປະລິມານການສັ່ງຊື້ປຽບທຽບ:</span>
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                          {purchaseQty} {compData.unit}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="200"
                        value={purchaseQty}
                        onChange={(e) => setPurchaseQty(parseInt(e.target.value) || 1)}
                        className="w-full h-1.5 bg-slate-200 dark:bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#052659] dark:accent-white"
                      />
                    </div>

                    {/* Podium Cards (Rank 1, Rank 2, Rank 3) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {compData.rankedSuppliers.slice(0, 3).map((suppQuote: any, rankIdx: number) => {
                        const isBest = rankIdx === 0;
                        const totalQuote = suppQuote.unitPrice * purchaseQty;

                        return (
                          <div 
                            key={suppQuote.supplier} 
                            className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 transition-all ${
                              isBest 
                                ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20' 
                                : 'bg-white dark:bg-[#1c1c1c] border-slate-200/60 dark:border-neutral-800'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-neutral-800 text-slate-500 font-mono">
                                  Rank {rankIdx + 1}
                                </span>
                                {isBest && <span className="text-xs">🏆 ຖືກສຸດ</span>}
                              </div>
                              <h4 className="text-xs font-black uppercase tracking-tight text-slate-800 dark:text-white truncate pt-1">
                                {suppQuote.supplier}
                              </h4>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {Math.round(suppQuote.unitPrice).toLocaleString()} ₭/{compData.unit}
                              </p>
                            </div>

                            <div className="border-t border-slate-100 dark:border-neutral-800/80 pt-2 font-mono">
                              <span className="text-[9px] text-slate-400 uppercase block">Est. Cost:</span>
                              <span className={`text-sm font-black ${isBest ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>
                                {Math.round(totalQuote).toLocaleString()} ₭
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            )}
          </div>

          {/* Pricing Feed Bar Chart */}
          <div className="high-density-card p-6 space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-500" />
              <span>ລາຄາບັນທຶກລ່າສຸດ (Recent Pricing Feed)</span>
            </h4>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lastTenPrices}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" opacity={0.2} />
                  <XAxis dataKey="supplier" tick={{fontSize: 9, fontWeight: 700}} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#141414', borderRadius: '12px', fontSize: '11px', border: '1px solid #262626', color: '#fff' }}
                    formatter={(val: number) => [`${val.toLocaleString()} ₭`, 'Price']}
                  />
                  <Bar dataKey="totalLAK" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>

      {/* 📋 BOTTOM SECTION: Full Price Index Table */}
      <div className="high-density-card overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-neutral-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white">
              {t('active_pricing_index')}
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
              ປະຫວັດການບັນທຶກລາຄາວັດຖຸດິບທັງໝົດ
            </p>
          </div>

          <div className="relative">
            <input 
              type="text" 
              placeholder="ຄົ້ນຫາຊື່ສິນຄ້າ ຫຼື ຮ້ານຄ້າ..." 
              className="crystal-input !py-1.5 !text-xs pl-8 w-60"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="p-4">{t('transaction_date')}</th>
                <th className="p-4">{t('resource_identifier')}</th>
                <th className="p-4">{t('origin_supplier')}</th>
                <th className="p-4 text-right">ລາຄາລວມ (LAK)</th>
                <th className="p-4 text-right">ລາຄາຕໍ່ແພັກ</th>
                <th className="p-4 text-center">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-neutral-800/80 font-sans">
              {supplierPrices
                .filter(p => {
                  const prodName = products.find(prod => prod.id === p.productId)?.name || '';
                  return prodName.toLowerCase().includes(filter.toLowerCase()) || p.supplier.toLowerCase().includes(filter.toLowerCase());
                })
                .map(price => {
                  const item = products.find(p => p.id === price.productId);
                  const isNew = price.totalPriceLAK !== undefined || price.priceMode !== undefined;
                  const totalLAK = isNew
                    ? Number(price.totalPriceLAK || 0)
                    : (price.currency === 'LAK' ? Number(price.priceOriginal || 0) : Number(price.priceOriginal || 0) * Number(price.exchangeRate || 1));
                  const packPrice = isNew ? Number(price.priceLAK || 0) : totalLAK / Number(price.quantity || 1);

                  return (
                    <tr key={price.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                      <td className="p-4 whitespace-nowrap">
                        <span className="font-bold text-slate-800 dark:text-white block">{price.date || 'Pending'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{price.time || '--:--'}</span>
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-slate-800 dark:text-white uppercase block">{item?.name || 'Unlabeled'}</span>
                        {price.remark && <span className="text-[10px] text-slate-400 italic block mt-0.5">"{price.remark}"</span>}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 bg-slate-100 dark:bg-neutral-800 rounded-lg text-[10px] font-bold uppercase">
                          {price.supplier}
                        </span>
                      </td>
                      <td className="p-4 text-right font-black font-mono text-sm whitespace-nowrap">
                        {Math.round(totalLAK).toLocaleString()} ₭
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold block">
                          {Math.round(packPrice).toLocaleString()} ₭ / {price.unit || 'ແພັກ'}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">Qty: {price.quantity}</span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => {
                            setApprovalType('delete');
                            setPendingAction(price.id);
                            setShowApprovalModal(true);
                          }}
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
  );
}
