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
  BarChart3, List, Check, TrendingUp, Receipt, ShoppingBag, Layers, Info 
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
  const [expandedBills, setExpandedBills] = useState<{ [supplier: string]: boolean }>({});
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

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

    if (list.length < 5) {
      list.push({
        isSystem: true,
        type: 'compare',
        productName: i18n.language === 'la' ? 'ປຽບທຽບ 3 ຜູ້ສະໜອງ' : '3-Supplier Price System',
        unit: 'LAK',
        message: i18n.language === 'la'
          ? 'ຊ່ວຍຄົ້ນຫາ ແລະ ຈັດອັບດັບລາຄາທີ່ດີທີ່ສຸດຈາກຜູ້ສະໜອງເພື່ອຫຼຸດຕົ້ນທຶນ ແລະ ເພີ່ມກຳໄລສູງສຸດໃຫ້ກັບຮ້ານ Le Ouve!'
          : 'Instantly matches and lists the lowest cost quotes across active suppliers to prevent double spend.'
      });
    }

    if (list.length < 5) {
      list.push({
        isSystem: true,
        type: 'dual_mode',
        productName: i18n.language === 'la' ? 'ການປ້ອນລາຄາສະດວກ' : 'Flexible Entry Modes',
        unit: 'Entry',
        message: i18n.language === 'la'
          ? 'ບໍ່ຈຳເປັນຕ້ອງປ້ອນທັງສອງ! ປ້ອນພຽງ "ລາຄາລວມ" ຫຼື "ລາຄາຕໍ່ແພັກ" ຢ່າງໃດຢ່າງໜຶ່ງ, ລະບົບຈະຄິດໄລ່ໃຫ້ເອງທັນທີ!'
          : 'Fill either "Total Paid" OR "Price per Pack". The matching counterpart is processed instantly.'
      });
    }

    if (list.length < 5) {
      list.push({
        isSystem: true,
        type: 'is_durable',
        productName: i18n.language === 'la' ? 'ຈັດການເຄື່ອງໃຊ້ Durable' : 'Durable Asset Controls',
        unit: 'Durable',
        message: i18n.language === 'la'
          ? 'ສິນຄ້າທີ່ຕິດປ້າຍ Durable ເປັນເຄື່ອງໃຊ້/ອຸປະກອນ ຈະມີອັດຕາເຜົາຜານລາຍວັນເປັນ 0, ແຈ້ງເຕືອນ Restock ເມື່ອຫຼຸດ Min Stock.'
          : 'Setting items to Durable locks down daily rate of depletion to zero. Restock alerts fire off under Min Stock limits.'
      });
    }

    if (list.length < 5) {
      list.push({
        isSystem: true,
        type: 'live_status',
        productName: i18n.language === 'la' ? 'ດັດຊະນີລາຄາສົດ' : 'Real-time Price Index Feed',
        unit: 'Database',
        message: i18n.language === 'la'
          ? 'ລະບົບເຊື່ອມຕໍ່ກັບ Cloud Firestore ແບບສົດໆ 100% ຂໍ້ມູນທຸກຢ່າງຈະຖືກຄິດໄລ່ ແລະ ແບ່ງປັນໄປໃບບິນ ແລະ ສູດອັດຕະໂນມັດ!'
          : 'Connected live with Google Firestore. Any changes immediately flow down to active recipe costing sheets.'
      });
    }

    if (list.length < 5) {
      list.push({
        isSystem: true,
        type: 'saving_advice',
        productName: i18n.language === 'la' ? 'ຄຳແນະນຳປະຢັດຕົ້ນທຶນ' : 'Procurement Cost Optimization',
        unit: 'Saving',
        message: i18n.language === 'la'
          ? 'ແນະນຳໃຫ້ສົມທຽບໃບສະເໜີລາຄາໃໝ່ທຸກໆອາທິດ ເພື່ອໃຫ້ໄດ້ຮັບສ່ວນຫຼຸດ ແລະ ຂໍ້ສະເໜີທີ່ດີທີ່ສຸດສະເໝີ.'
          : 'Compare new quote entries weekly to capture early supplier price reductions and special promotional batches.'
      });
    }

    return list.slice(0, 5);
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
      if (!comparisonMap[p.productId]) {
        comparisonMap[p.productId] = {};
      }
      const isNew = p.totalPriceLAK !== undefined || p.priceMode !== undefined;
      const packPrice = isNew
        ? Number(p.priceLAK || 0)
        : (p.currency === 'LAK' ? Number(p.priceOriginal || 0) : Number(p.priceOriginal || 0) * Number(p.exchangeRate || 1)) / Number(p.quantity || 1);
      const unitPrice = packPrice / Number(p.quantityPerUnit || 1);
      comparisonMap[p.productId][p.supplier] = {
        price: unitPrice,
        date: p.date,
        rawRecord: p
      };
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

  const optimizedBills = React.useMemo(() => {
    const groups: { [supplier: string]: { productId: string, productName: string, price: number, unit: string }[] } = {};
    supplierComparison.forEach(comp => {
      const best = comp.rankedSuppliers[0];
      if (best) {
        if (!groups[best.supplier]) {
          groups[best.supplier] = [];
        }
        groups[best.supplier].push({
          productId: comp.productId,
          productName: comp.productName,
          price: best.unitPrice,
          unit: comp.unit
        });
      }
    });

    return Object.entries(groups).map(([supplier, items]) => ({
      supplier,
      items,
      totalItems: items.length
    })).sort((a, b) => b.totalItems - a.totalItems);
  }, [supplierComparison]);

  useEffect(() => {
    if (selectedCompProduct === '' && supplierComparison.length > 0) {
      const firstWithComp = supplierComparison.find(c => c.hasComparison) || supplierComparison[0];
      if (firstWithComp) {
        setSelectedCompProduct(firstWithComp.productId);
      }
    }
  }, [supplierComparison, selectedCompProduct]);

  const [selectedChartProductId, setSelectedChartProductId] = useState<string | null>(null);
  const [selectedChartUnit, setSelectedChartUnit] = useState<string>('');

  const chartData = React.useMemo(() => {
    if (!selectedChartProductId) return [];
    
    return [...supplierPrices]
      .filter(p => p.productId === selectedChartProductId)
      .sort((a, b) => (a.createdAt?.toDate?.()?.getTime() || 0) - (b.createdAt?.toDate?.()?.getTime() || 0))
      .map(p => {
        const pLAK = p.currency === 'LAK' ? p.priceOriginal : p.priceOriginal * (p.exchangeRate || 1);
        return {
          date: format(p.createdAt?.toDate?.() || new Date(), 'dd/MM'),
          price: pLAK / ((p.quantity || 1) * (p.quantityPerUnit || 1)),
          supplier: p.supplier,
          unitLabel: `${p.quantity} ${p.unit || 'UNIT'}`
        };
      });
  }, [selectedChartProductId, supplierPrices]);

  const lastTenPrices = React.useMemo(() => {
    return [...supplierPrices].slice(0, 10).reverse().map(p => {
      const totalLAK = p.currency === 'LAK' ? p.priceOriginal : p.priceOriginal * (p.exchangeRate || 1);
      return {
        ...p,
        totalLAK,
      };
    });
  }, [supplierPrices]);

  const [saveLoading, setSaveLoading] = useState(false);

  const handleUpdateProductName = async (id: string) => {
    if (!editProductName.trim()) return;
    try {
      setSaveLoading(true);
      await updateDoc(doc(db, 'products', id), {
        name: editProductName.trim(),
        unit: editProductUnit.trim() || 'UNIT',
        isDurable: editProductIsDurable,
        updatedAt: serverTimestamp()
      });
      setEditingProduct(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product? Historical price records will remain.")) return;
    try {
      await deleteDoc(doc(db, 'products', id));
      alert("Product deleted successfully");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, 'products');
    }
  };

  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeMultiplier, setMergeMultiplier] = useState(1);
  const [isMerging, setIsMerging] = useState(false);

  const handleMergeProducts = async () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) {
      alert("Please select different source and target products.");
      return;
    }

    const sourceProd = products.find(p => p.id === mergeSourceId);
    const targetProd = products.find(p => p.id === mergeTargetId);
    if (!sourceProd || !targetProd) return;

    if (!confirm(`Merge "${sourceProd.name}" into "${targetProd.name}"?`)) return;

    try {
      setIsMerging(true);
      const priceDocs = supplierPrices.filter(sp => sp.productId === mergeSourceId);
      for (const priceDoc of priceDocs) {
        const newQtyPerUnit = (priceDoc.quantityPerUnit || 1) * mergeMultiplier;
        await updateDoc(doc(db, 'supplierPrices', priceDoc.id), {
          productId: mergeTargetId,
          quantityPerUnit: newQtyPerUnit,
          remark: `${priceDoc.remark || ''} (Merged from ${sourceProd.name})`.trim()
        });
      }
      await deleteDoc(doc(db, 'products', mergeSourceId));
      alert("Products merged successfully!");
      setShowMergeModal(false);
      setMergeSourceId('');
      setMergeTargetId('');
      setMergeMultiplier(1);
    } catch (err: any) {
      alert("Error while merging: " + err.message);
    } finally {
      setIsMerging(false);
    }
  };

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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const qS = query(collection(db, 'supplierPrices'), orderBy('createdAt', 'desc'));
    const unsubscribeS = onSnapshot(qS, (snap) => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'supplierPrices');
    });

    return () => {
      unsubscribeP();
      unsubscribeS();
    };
  }, []);

  const renderInsightItem = (insight: any, idx: number) => {
    const isIncrease = insight.type === 'increase';
    const indicatorColor = insight.isSystem
      ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
      : isIncrease
        ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
        : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';

    return (
      <div key={insight.id || idx} className="flex gap-4 items-start animate-in fade-in slide-in-from-right duration-500 font-sans" style={{ animationDelay: `${idx * 150}ms` }}>
        <div className={`w-1.5 h-11 rounded-full mt-1 shrink-0 ${indicatorColor}`}></div>
        <div className="flex-1 min-w-0">
          {insight.isSystem ? (
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5 shrink-0">
                <span className="px-1 py-0.5 bg-blue-500/10 text-blue-500 rounded text-[8px] font-black tracking-widest shrink-0">SYS</span>
                <span className="truncate">{insight.productName}</span>
              </p>
              <p className="text-[10px] text-slate-500 dark:text-blue-100/50 leading-normal mt-1">
                {insight.message}
              </p>
            </div>
          ) : (
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider ${isIncrease ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {insight.productName} ({insight.unit}): {isIncrease ? 'ລາຄາຂຶ້ນ' : 'ລາຄາລົງ'} {Math.abs(insight.diff).toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-600 dark:text-blue-100/60 leading-normal mt-1">
                 ສິນຄ້າຈາກ {insight.supplier || ''} ມີການປ່ຽນແປງລາຄາເກີນ 8%. ຈາກ {(insight.prevPrice || 0).toLocaleString()} ₭/{(insight.unit || '')} ເປັນ {(insight.latestPrice || 0).toLocaleString()} ₭/{(insight.unit || '')}.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

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
    writeFile(workbook, `suppliers_report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleUpdatePrice = async () => {
    if (!editingPriceId || !editPriceData) return;
    try {
      setSaveLoading(true);
      const calculatedPriceLAK = (editPriceData.currency === 'LAK' ? editPriceData.priceOriginal : editPriceData.priceOriginal * editPriceData.exchangeRate);
      
      await updateDoc(doc(db, 'supplierPrices', editingPriceId), {
        ...editPriceData,
        priceLAK: calculatedPriceLAK,
        updatedAt: serverTimestamp()
      });
      setEditingPriceId(null);
      setEditPriceData(null);
      alert("Record updated successfully");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'supplierPrices');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleAddPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrice.productId || !newPrice.supplier) {
      alert("Please specify a product and supplier.");
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
        userEmail: auth.currentUser?.email || 'admin@example.com',
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
      alert("Supplier data saved successfully!");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'supplierPrices');
    } finally {
      setSaveLoading(false);
    }
  };
  
  const handleProductSearchBlur = () => {
    if (!newPrice.productId && productSearch) {
      const match = products.find(p => p.name.toLowerCase() === productSearch.toLowerCase());
      if (match) {
        setNewPrice({
          ...newPrice, 
          productId: match.id, 
          unit: match.unit || newPrice.unit,
          quantityPerUnit: match.packSize || 1
        });
        setProductSearch(match.name);
      }
    }
    setTimeout(() => setIsProductDropdownOpen(false), 200);
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

  const addUnlistedProduct = async (name: string) => {
    const productName = prompt("Enter New Product Name:", name);
    if (productName) {
      try {
        const docRef = await addDoc(collection(db, 'products'), {
          name: productName,
          unit: newPrice.unit || 'UNIT',
          isApproved: true,
          createdAt: serverTimestamp()
        });
        setNewPrice(prev => ({ ...prev, productId: docRef.id }));
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'products');
      }
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 bg-white dark:bg-[#073069] rounded-2xl border border-[#052659]/10 dark:border-white/5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
              {i18n.language === 'la' ? 'ດັດຊະນີລາຄາປະຈຸບັນ • ຂໍ້ມູນສົດ' : 'Current Price Index • Live Connected'}
            </h2>
            <p className="text-[10px] text-slate-400 dark:text-slate-350 font-bold uppercase mt-0.5">
              {i18n.language === 'la' ? 'ອັບເດດລາຄາຈາກ Firestore Realtime ສົດໆ' : 'Real-time database feed fully synced'}
            </p>
          </div>
        </div>
        
        <button
          type="button"
          onClick={() => setIsHelpModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-[10px] uppercase rounded-xl shadow-md transition-all cursor-pointer justify-center self-start sm:self-auto"
        >
          <Info className="w-3.5 h-3.5" />
          <span>{i18n.language === 'la' ? 'Info • ວິທີໃຊ້' : 'Info • Guide'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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

        {/* Form Section */}
        <div className="xl:col-span-1 space-y-6">
          <div className="high-density-card">
            <div className="flex justify-between items-center mb-6">
              <h3 className="label-xs flex items-center gap-2">
                <Plus className="w-3 h-3 text-primary" />
                {t('sync_supplier_data')}
              </h3>
            </div>

            <form onSubmit={handleAddPrice} className="space-y-6">
              <div className="space-y-2 relative">
                <label className="label-xs">{t('product_resource')}</label>
                <div className="flex gap-2">
                  <div className="relative flex-1 group">
                    <input 
                      type="text"
                      className={`crystal-input !text-xs h-[50px] w-full transition-all ${!newPrice.productId && productSearch ? 'border-amber-400/50 bg-amber-400/5' : ''}`}
                      placeholder={t('search_params') + "..."}
                      value={isProductDropdownOpen ? productSearch : (products.find(p => p.id === newPrice.productId)?.name || productSearch)}
                      onFocus={() => {
                        const selectedProduct = products.find(p => p.id === newPrice.productId);
                        if (selectedProduct && !productSearch) {
                          setProductSearch(selectedProduct.name);
                        }
                        setIsProductDropdownOpen(true);
                      }}
                      onBlur={handleProductSearchBlur}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProductSearch(val);
                        setIsProductDropdownOpen(true);
                        const currentSelectedName = products.find(p => p.id === newPrice.productId)?.name || '';
                        if (val.trim().toLowerCase() !== currentSelectedName.trim().toLowerCase()) {
                          setNewPrice(prev => ({ ...prev, productId: '' }));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && productSearch && !newPrice.productId) {
                          e.preventDefault();
                          const match = products.find(p => p.name.toLowerCase() === productSearch.toLowerCase());
                          if (match) {
                            setNewPrice({...newPrice, productId: match.id, unit: match.unit || newPrice.unit});
                            setProductSearch(match.name);
                            setIsProductDropdownOpen(false);
                          }
                        }
                      }}
                    />
                    <Search className={`absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 transition-colors ${isProductDropdownOpen ? 'text-primary' : 'text-slate-400'} pointer-events-none`} />
                    
                    {isProductDropdownOpen && (
                      <div className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-[#073069] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                        {products
                          .filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()))
                          .map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left p-3 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors border-b border-slate-50 dark:border-white/5 last:border-none"
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
                            <p className="text-xs font-bold text-slate-800 dark:text-white">{p.name}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{p.unit || 'UNIT'}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button 
                    type="button" 
                    onClick={() => setShowProductManager(true)}
                    className="w-[50px] h-[50px] flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-500 rounded-2xl hover:bg-primary/10 hover:text-primary transition-all shadow-sm"
                    title="Manage Products"
                  >
                    <List className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="label-xs">Purchase Date</label>
                  <input 
                    type="date"
                    required
                    className="crystal-input h-[50px] !text-[11px] !py-0 w-full"
                    value={newPrice.date}
                    onChange={e => setNewPrice({...newPrice, date: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="label-xs">{t('supplier')}</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. LATDA, CHANHOM..."
                    className="crystal-input h-[50px] !text-xs !py-0 w-full font-bold"
                    value={newPrice.supplier}
                    onChange={e => setNewPrice({...newPrice, supplier: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="label-xs">{i18n.language === 'la' ? 'ຮູບແບບການປ້ອນລາຄາ' : 'Price Input Mode'}</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-900/45 p-1 rounded-2xl border border-slate-200/50 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setNewPrice({...newPrice, priceMode: 'total'})}
                    className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 duration-100 ${
                      newPrice.priceMode === 'total'
                        ? 'bg-[#052659] text-white shadow-md'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>{i18n.language === 'la' ? 'ລາຄາລວມທັງໝົດ' : 'Total Price'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPrice({...newPrice, priceMode: 'per_pack'})}
                    className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 duration-100 ${
                      newPrice.priceMode === 'per_pack'
                        ? 'bg-[#052659] text-white shadow-md'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{i18n.language === 'la' ? 'ລາຄາຕໍ່ແພັກ/ຖົງ' : 'Price per Pack'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="label-xs">{t('price_original')}</label>
                  <input 
                    type="text" 
                    className="crystal-input !text-xs h-[50px] font-mono font-bold w-full"
                    value={displayPrice}
                    placeholder="0"
                    onChange={handlePriceChange}
                  />
                </div>
                <div className="space-y-2">
                  <label className="label-xs">{t('currency')}</label>
                  <select 
                    className="crystal-input !text-xs h-[50px] !py-0 w-full"
                    value={newPrice.currency}
                    onChange={e => setNewPrice({...newPrice, currency: e.target.value, exchangeRate: e.target.value === 'LAK' ? 1 : newPrice.exchangeRate})}
                  >
                    <option value="LAK">LAK (₭)</option>
                    <option value="THB">THB (฿)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="label-xs">{t('qty_unit')}</label>
                <div className="flex items-center gap-2 h-14">
                  <input 
                    type="number" 
                    className="w-full h-full px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm font-bold text-center outline-none"
                    value={newPrice.quantity || ''}
                    placeholder="Qty"
                    onChange={e => setNewPrice({...newPrice, quantity: parseFloat(e.target.value) || 0})}
                  />
                  <span className="text-xs font-black text-slate-300">×</span>
                  <input 
                    type="number" 
                    className="w-full h-full px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm font-bold text-center outline-none"
                    value={newPrice.quantityPerUnit || ''}
                    placeholder="Pack size"
                    onChange={e => setNewPrice({...newPrice, quantityPerUnit: parseFloat(e.target.value) || 0})}
                  />
                  <input 
                    type="text"
                    className="w-24 h-full px-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs font-bold text-center outline-none uppercase"
                    value={newPrice.unit}
                    placeholder="Unit"
                    onChange={e => setNewPrice({...newPrice, unit: e.target.value})}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={saveLoading}
                className="crystal-button w-full h-12 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saveLoading ? 'SAVING...' : t('commit_record')}</span>
              </button>
            </form>
          </div>

          <div className="glass-card bg-white dark:bg-[#052659] text-slate-800 dark:text-white p-6 space-y-4">
            <h4 className="label-xs font-bold italic tracking-wider">Supplier Insights (5 ລາຍການ)</h4>
            <div className="space-y-4">
              {finalInsights.map((insight, idx) => renderInsightItem(insight, idx))}
            </div>
          </div>
        </div>

        {/* Price Comparator & Lists Section */}
        <div className="xl:col-span-2 space-y-6">
          <div className="high-density-card bg-white dark:bg-[#052659] p-6 border border-slate-100 dark:border-white/5 shadow-xl rounded-3xl space-y-6">
            <div className="border-b border-slate-100 dark:border-white/10 pb-4">
              <h3 className="text-base font-black text-[#052659] dark:text-white tracking-tight flex items-center gap-2">
                <TrendingUp className="text-emerald-500 w-5 h-5 animate-pulse" />
                {i18n.language === 'la' ? 'ລະບົບປຽບທຽບລາຄາກັບ 3 ຜູ້ສະໜອງ' : 'Supplier Price Comparator'}
              </h3>
            </div>

            {supplierComparison.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 space-y-3 max-h-[350px] overflow-y-auto pr-2 scrollbar-hide">
                  {supplierComparison.map((comp) => (
                    <button
                      key={comp.productId}
                      type="button"
                      onClick={() => setSelectedCompProduct(comp.productId)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex flex-col justify-between items-start gap-1.5 ${selectedCompProduct === comp.productId ? 'bg-primary/5 dark:bg-[#073069] border-[#073069] dark:border-blue-400/30 ring-2 ring-primary/10' : 'bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/5'}`}
                    >
                      <div className="flex w-full justify-between items-center">
                        <span className="text-xs font-black text-slate-800 dark:text-white truncate">{comp.productName}</span>
                        <span className="text-[9px] font-black tracking-widest uppercase text-slate-400 bg-slate-200/50 dark:bg-white/10 px-2 py-0.5 rounded-md">{comp.unit}</span>
                      </div>
                      <div className="flex w-full justify-between items-center mt-1 text-[10px]">
                        <span>Best: <strong className="text-emerald-600 dark:text-emerald-400 font-bold uppercase">{comp.bestSupplier}</strong></span>
                        {comp.hasComparison && comp.savingsPercent > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-black bg-emerald-500/10 px-2 py-0.5 rounded-md">
                            -{comp.savingsPercent.toFixed(0)}% OFF
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="lg:col-span-7 bg-slate-50 dark:bg-[#041a3c] rounded-3xl p-5 border border-slate-100 dark:border-white/5 flex flex-col justify-between gap-5">
                  {(() => {
                    const compData = supplierComparison.find(c => c.productId === selectedCompProduct);
                    if (!compData) return <div className="text-center py-10 text-slate-400 text-xs">Select product to analyze</div>;

                    return (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center bg-white dark:bg-[#073069] rounded-2xl p-3 border border-slate-100 dark:border-white/5">
                          <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase">{compData.productName}</h4>
                          <span className="text-xs font-black text-[#052659] dark:text-blue-400 uppercase">{compData.unit}</span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Procurement Compare Qty</label>
                            <span className="font-mono font-bold text-emerald-600">{purchaseQty} {compData.unit}</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="500"
                            className="w-full h-2 bg-slate-200 dark:bg-white/10 rounded-lg cursor-pointer"
                            value={purchaseQty}
                            onChange={(e) => setPurchaseQty(parseInt(e.target.value) || 1)}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {compData.rankedSuppliers.slice(0, 3).map((suppQuote: any, rankIdx: number) => (
                            <div key={suppQuote.supplier} className={`p-3.5 rounded-2xl border ${rankIdx === 0 ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-white dark:bg-slate-800/40 border-slate-100 dark:border-white/5'}`}>
                              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-slate-100 dark:bg-white/15 text-slate-500 rounded-md">Rank {rankIdx + 1}</span>
                              <h5 className="text-xs font-black dark:text-white uppercase mt-1 truncate">{suppQuote.supplier}</h5>
                              <p className="text-xs font-mono font-bold text-slate-800 dark:text-white mt-2">
                                {(suppQuote.unitPrice * purchaseQty).toLocaleString()} ₭
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Pricing Feed Analysis Bar Chart */}
          <div className="high-density-card p-0 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 flex justify-between items-center">
              <h4 className="label-xs flex items-center gap-2">
                <BarChart3 className="w-3 h-3 text-primary" />
                Pricing Feed Analysis (ລາຄາທີ່ບັນທຶກລ່າສຸດ)
              </h4>
            </div>
            <div className="p-4 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lastTenPrices}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="supplier" tick={{fontSize: 9, fontWeight: 700}} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#052659', borderRadius: '8px', fontSize: '10px', color: '#fff' }}
                    formatter={(val: number) => [`${val.toLocaleString()} ₭`, 'Price']}
                  />
                  <Bar dataKey="totalLAK" fill="#052659" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
