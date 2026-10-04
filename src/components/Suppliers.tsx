import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  deleteDoc, doc, updateDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Plus, Trash2, Save, X, Search, Download, 
  BarChart3, Check, TrendingUp, Receipt, ShoppingBag, Info,
  Upload, Image as ImageIcon, Eye, ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import { useTranslation } from 'react-i18next';
import ApprovalModal from './ApprovalModal';

// Helper ບີບອັດຮູບໃບບິນໃຫ້ເບົາ (ບໍ່ເກີນ 120KB) ເພື່ອບັນທຶກລົງ Firestore ໄດ້ສະບາຍ
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
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

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
      setDisplayPrice(formatWithCommas(e.target.value));
      setNewPrice({ ...newPrice, priceOriginal: Number(rawValue) || 0 });
    }
  };

  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [supplierList, setSupplierList] = useState<string[]>(['LATDA', 'CHANHOM', 'DMART', 'HEAVENLY', 'MARRY ANN']);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);

  const [filter, setFilter] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Form State
  const [newPrice, setNewPrice] = useState({
    productId: '',
    supplier: 'LATDA',
    currency: 'LAK',
    exchangeRate: 1,
    priceOriginal: 0,
    priceLAK: 0,
    quantity: 1,
    quantityPerUnit: 1,
    unit: 'g',
    remark: '',
    receiptImage: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    priceMode: 'total' as 'total' | 'per_pack'
  });

  const [saveLoading, setSaveLoading] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalType, setApprovalType] = useState<'create' | 'delete' | null>(null);
  const [pendingAction, setPendingAction] = useState<any>(null);

  // Firestore Listeners
  useEffect(() => {
    const unsubP = onSnapshot(query(collection(db, 'products'), orderBy('name')), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'products'));

    const unsubS = onSnapshot(query(collection(db, 'supplierPrices'), orderBy('createdAt', 'desc')), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSupplierPrices(data);
      // Auto-extract unique supplier names into dropdown
      const uniqueSuppliers = Array.from(new Set([...supplierList, ...data.map(d => d.supplier).filter(Boolean)]));
      setSupplierList(uniqueSuppliers);
    }, err => handleFirestoreError(err, OperationType.LIST, 'supplierPrices'));

    return () => { unsubP(); unsubS(); };
  }, []);

  // 📋 ຮອງຮັບການ Paste ຮູບໃບບິນຜ່ານ Ctrl + V ຢູ່ໜ້າເວັບ
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const base64 = await compressImage(file);
            setNewPrice(prev => ({ ...prev, receiptImage: base64 }));
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // ຮອງຮັບການ Drag & Drop ຮູບໃບບິນ
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      const base64 = await compressImage(files[0]);
      setNewPrice(prev => ({ ...prev, receiptImage: base64 }));
    }
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await compressImage(file);
      setNewPrice(prev => ({ ...prev, receiptImage: base64 }));
    }
  };

  const handleAddPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrice.productId || !newPrice.supplier) {
      alert("ກະລຸນາເລືອກສິນຄ້າ ແລະ ຊື່ຮ້ານຄ້າ");
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
        supplier: supplierList[0] || 'LATDA', 
        currency: 'LAK', 
        exchangeRate: 1, 
        priceOriginal: 0, 
        priceLAK: 0, 
        quantity: 1, 
        quantityPerUnit: 1, 
        unit: 'g',
        remark: '',
        receiptImage: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm'),
        priceMode: 'total'
      });
      alert("ບັນທຶກລາຄາພ້ອມໃບບິນສຳເລັດແລ້ວ!");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'supplierPrices');
    } finally {
      setSaveLoading(false);
    }
  };

  // ເພີ່ມສິນຄ້າໃໝ່ດ່ວນໃນ Suppliers
  const handleAddNewProductOnTheFly = async () => {
    const name = prompt("ໃສ່ຊື່ວັດຖຸດິບໃໝ່:");
    if (!name?.trim()) return;
    const unit = prompt("ໃສ່ຫົວໜ່ວຍ (ເຊັ່ນ: g, ml, pcs):", "g") || "g";
    try {
      const docRef = await addDoc(collection(db, 'products'), {
        name: name.trim(),
        unit: unit.trim(),
        packSize: 1000,
        minStock: 100,
        createdAt: serverTimestamp()
      });
      setNewPrice(prev => ({ ...prev, productId: docRef.id, unit }));
      setProductSearch(name.trim());
      alert("ເພີ່ມວັດຖຸດິບສຳເລັດ!");
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* 🚀 Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-sm">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Procurement
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-800 dark:text-white mt-1">
            Supplier Pricing & Receipt Registry
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ບັນທຶກລາຄາຊື້ພ້ອມຕິດຮູບໃບບິນ (ອັບໂຫຼດ, Drag & Drop ຫຼື ກົດ Ctrl+V ໄດ້ທັນທີ)
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleAddNewProductOnTheFly}
            className="crystal-button !py-2.5 !px-4 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>+ ເພີ່ມວັດຖຸດິບໃໝ່</span>
          </button>
        </div>
      </div>

      <ApprovalModal 
        isOpen={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        onApprove={async () => {
          if (pendingAction) await deleteDoc(doc(db, 'supplierPrices', pendingAction));
          setShowApprovalModal(false);
        }}
        actionType="Delete Quote"
      />

      {/* Grid: Form & List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* 1. Entry Form (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="high-density-card p-6 space-y-4">
            <h3 className="text-sm font-serif text-slate-800 dark:text-white flex items-center justify-between border-b border-slate-100 dark:border-neutral-800 pb-3">
              <span>ບັນທຶກລາຄາ & ໃບບິນ</span>
              <span className="text-[10px] text-slate-400 font-sans uppercase">Quick Entry</span>
            </h3>

            <form onSubmit={handleAddPrice} className="space-y-4">
              
              {/* Product Autocomplete */}
              <div className="space-y-1 relative">
                <label className="label-xs">ຊື່ສິນຄ້າ / ວັດຖຸດິບ</label>
                <div className="relative">
                  <input 
                    type="text"
                    required
                    placeholder="ພິມເພື່ອຄົ້ນຫາວັດຖຸດິບ..."
                    value={isProductDropdownOpen ? productSearch : (products.find(p => p.id === newPrice.productId)?.name || productSearch)}
                    onFocus={() => setIsProductDropdownOpen(true)}
                    onChange={e => {
                      setProductSearch(e.target.value);
                      setIsProductDropdownOpen(true);
                    }}
                    className="crystal-input w-full font-bold pl-9"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>

                {isProductDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-[#1c1c1c] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-xl max-h-48 overflow-y-auto">
                    {products.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setNewPrice({ ...newPrice, productId: p.id, unit: p.unit || 'g', quantityPerUnit: p.packSize || 1 });
                          setProductSearch(p.name);
                          setIsProductDropdownOpen(false);
                        }}
                        className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-neutral-800 flex justify-between text-xs font-bold"
                      >
                        <span>{p.name}</span>
                        <span className="text-slate-400 font-mono uppercase">{p.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Supplier Dropdown + Add Supplier Button */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="label-xs">ຮ້ານຄ້າ / ຜູ້ສະໜອງ</label>
                  <button
                    type="button"
                    onClick={() => {
                      const name = prompt("ໃສ່ຊື່ຜູ້ສະໜອງໃໝ່:");
                      if (name?.trim()) {
                        setSupplierList(prev => Array.from(new Set([...prev, name.trim()])));
                        setNewPrice(prev => ({ ...prev, supplier: name.trim() }));
                      }
                    }}
                    className="text-[10px] text-sky-500 hover:underline cursor-pointer"
                  >
                    + ເພີ່ມຮ້ານຄ້າໃໝ່
                  </button>
                </div>

                <select
                  value={newPrice.supplier}
                  onChange={e => setNewPrice({ ...newPrice, supplier: e.target.value })}
                  className="crystal-input w-full font-bold cursor-pointer"
                >
                  {supplierList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Price Mode */}
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setNewPrice({...newPrice, priceMode: 'total'})}
                  className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${newPrice.priceMode === 'total' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 shadow-sm' : 'text-slate-500'}`}
                >
                  ລາຄາລວມບິນ
                </button>
                <button
                  type="button"
                  onClick={() => setNewPrice({...newPrice, priceMode: 'per_pack'})}
                  className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${newPrice.priceMode === 'per_pack' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 shadow-sm' : 'text-slate-500'}`}
                >
                  ລາຄາຕໍ່ແພັກ
                </button>
              </div>

              {/* Price & Currency */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-xs block mb-1">ລາຄາ</label>
                  <input 
                    type="text" 
                    required
                    placeholder="0"
                    value={displayPrice}
                    onChange={handlePriceChange}
                    className="crystal-input w-full font-mono text-base font-bold"
                  />
                </div>
                <div>
                  <label className="label-xs block mb-1">ສະກຸນເງິນ</label>
                  <select 
                    value={newPrice.currency}
                    onChange={e => setNewPrice({...newPrice, currency: e.target.value, exchangeRate: e.target.value === 'LAK' ? 1 : newPrice.exchangeRate})}
                    className="crystal-input w-full font-bold cursor-pointer"
                  >
                    <option value="LAK">LAK (₭)</option>
                    <option value="THB">THB (฿)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              {/* Qty and Pack size */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] text-slate-400 block mb-0.5">ຈຳນວນແພັກ</label>
                  <input 
                    type="number" 
                    min="1"
                    value={newPrice.quantity}
                    onChange={e => setNewPrice({...newPrice, quantity: parseFloat(e.target.value) || 1})}
                    className="crystal-input w-full text-center font-bold"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-400 block mb-0.5">ຂະໜາດຕໍ່ແພັກ</label>
                  <input 
                    type="number" 
                    min="1"
                    value={newPrice.quantityPerUnit}
                    onChange={e => setNewPrice({...newPrice, quantityPerUnit: parseFloat(e.target.value) || 1})}
                    className="crystal-input w-full text-center font-bold"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-400 block mb-0.5">ຫົວໜ່ວຍ</label>
                  <input 
                    type="text" 
                    value={newPrice.unit}
                    onChange={e => setNewPrice({...newPrice, unit: e.target.value})}
                    className="crystal-input w-full text-center font-bold uppercase"
                  />
                </div>
              </div>

              {/* 📸 RECEIPT UPLOAD / DRAG & DROP / PASTE ZONE */}
              <div className="space-y-1.5">
                <label className="label-xs flex justify-between">
                  <span>ຮູບພາບໃບບິນ (Receipt Image)</span>
                  <span className="text-emerald-500 font-bold text-[9px]">ຮອງຮັບ Ctrl + V</span>
                </label>
                
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-slate-200 dark:border-neutral-800 rounded-2xl p-4 text-center hover:bg-slate-50/50 dark:hover:bg-neutral-800/30 transition-all relative cursor-pointer"
                >
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  {newPrice.receiptImage ? (
                    <div className="flex items-center justify-between gap-3 text-left">
                      <img src={newPrice.receiptImage} alt="Receipt" className="w-12 h-12 object-cover rounded-xl border border-slate-200 dark:border-neutral-700" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-emerald-500 block truncate">ອັບໂຫຼດຮູບໃບບິນແລ້ວ ✓</span>
                        <span className="text-[10px] text-slate-400 block">ຄລິກ ຫຼື ວາງຮູບໃໝ່ເພື່ອປ່ຽນ</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); setNewPrice({ ...newPrice, receiptImage: '' }); }}
                        className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="py-2 space-y-1">
                      <Upload className="w-6 h-6 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-600 dark:text-neutral-300">ຄລິກເລືອກຮູບ ຫຼື ລາກວາງໃສ່ບ່ອນນີ້</p>
                      <p className="text-[10px] text-slate-400">ຫຼື ກົດ <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-neutral-800 font-mono text-[9px]">Ctrl+V</kbd> ເພື່ອວາງຮູບໃບບິນທັນທີ</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-xs block mb-1">ວັນທີຊື້</label>
                  <input 
                    type="date"
                    required
                    value={newPrice.date}
                    onChange={e => setNewPrice({...newPrice, date: e.target.value})}
                    className="crystal-input w-full !text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="label-xs block mb-1">ໝາຍເຫດ</label>
                  <input 
                    type="text" 
                    placeholder="ໃສ່ໝາຍເຫດ..."
                    value={newPrice.remark}
                    onChange={e => setNewPrice({...newPrice, remark: e.target.value})}
                    className="crystal-input w-full !text-xs"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={saveLoading}
                className="crystal-button w-full h-11 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{saveLoading ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກລາຄາ & ໃບບິນ'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* 2. Price Feed & Table (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="high-density-card p-5 overflow-hidden">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-serif text-slate-800 dark:text-white">ປະຫວັດລາຄາ & ໃບບິນທີ່ບັນທຶກ</h3>
                <p className="text-xs text-slate-400">ກົດທີ່ໄອຄອນຮູບເພື່ອເບິ່ງໃບບິນຕົວຈິງ</p>
              </div>

              <div className="relative">
                <input 
                  type="text" 
                  placeholder="ຄົ້ນຫາ..."
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="crystal-input !py-1.5 !text-xs pl-8 w-44"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
                  <tr>
                    <th className="p-3">ວັນທີ</th>
                    <th className="p-3">ສິນຄ້າ</th>
                    <th className="p-3">ຮ້ານຄ້າ</th>
                    <th className="p-3 text-right">ລາຄາລວມ</th>
                    <th className="p-3 text-center">ໃບບິນ</th>
                    <th className="p-3 text-center">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800/80">
                  {supplierPrices
                    .filter(p => {
                      const prod = products.find(pr => pr.id === p.productId)?.name || '';
                      return prod.toLowerCase().includes(filter.toLowerCase()) || (p.supplier || '').toLowerCase().includes(filter.toLowerCase());
                    })
                    .map((item) => {
                      const prod = products.find(pr => pr.id === item.productId);
                      const totalLAK = item.totalPriceLAK !== undefined ? item.totalPriceLAK : (item.currency === 'LAK' ? item.priceOriginal : item.priceOriginal * (item.exchangeRate || 1));

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                          <td className="p-3 whitespace-nowrap font-mono text-slate-400">{item.date}</td>
                          <td className="p-3 font-bold text-slate-800 dark:text-white">
                            <span>{prod?.name || 'Item'}</span>
                            <span className="text-[10px] text-slate-400 block font-normal">{item.quantity} × {item.quantityPerUnit}{item.unit}</span>
                          </td>
                          <td className="p-3 font-medium">{item.supplier}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-500 whitespace-nowrap">
                            {Math.round(totalLAK).toLocaleString()} ₭
                          </td>
                          <td className="p-3 text-center">
                            {item.receiptImage ? (
                              <button 
                                onClick={() => setPreviewImage(item.receiptImage)}
                                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 cursor-pointer inline-flex items-center gap-1"
                                title="ເບິ່ງຮູບໃບບິນ"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => {
                                setPendingAction(item.id);
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

      </div>

      {/* Modal ເບິ່ງຮູບໃບບິນຂະໜາດເຕັມ */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-xl max-h-[85vh] bg-[#141414] rounded-3xl p-3 border border-neutral-800 overflow-hidden" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black cursor-pointer">
              <X className="w-5 h-5" />
            </button>
            <img src={previewImage} alt="Full Receipt" className="w-full h-auto max-h-[80vh] object-contain rounded-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
