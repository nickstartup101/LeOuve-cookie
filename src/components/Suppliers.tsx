import React, { useState, useEffect, useMemo } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  deleteDoc, doc, updateDoc, serverTimestamp, getDocs, where 
} from 'firebase/firestore';
import { 
  Plus, Trash2, Edit2, Save, X, Search, 
  Receipt, Upload, Eye, Calculator, Package, ImageIcon, 
  Building2, Check, ZoomIn, Layers
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

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

interface BillItemRow {
  productId: string;
  quantity: number | string;
  quantityPerUnit: number | string;
  unit: string;
  priceOriginal: number | string;
  priceMode: 'total' | 'per_pack';
  remark: string;
}

export default function Suppliers() {
  const { i18n } = useTranslation();
  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [firestoreSuppliers, setFirestoreSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState('');

  // 1. Batch Invoice Header
  const [billSupplier, setBillSupplier] = useState('');
  const [billCurrency, setBillCurrency] = useState<'THB' | 'LAK' | 'USD'>('THB');
  const [billExchangeRate, setBillExchangeRate] = useState<number>(680);
  const [billDate, setBillDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [billTime, setBillTime] = useState(format(new Date(), 'HH:mm'));
  const [billReceiptImage, setBillReceiptImage] = useState('');
  
  // 2. Line Items in Invoice
  const [billItems, setBillItems] = useState<BillItemRow[]>([
    { productId: '', quantity: 1, quantityPerUnit: 1000, unit: 'g', priceOriginal: '', priceMode: 'total', remark: '' }
  ]);

  const [saveLoading, setSaveLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Modals
  const [isSupplierManagerOpen, setIsSupplierManagerOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [editSupplierName, setEditSupplierName] = useState('');
  const [newSupplierInput, setNewSupplierInput] = useState('');

  const [isProductManagerOpen, setIsProductManagerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);

  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editPriceDisplay, setEditPriceDisplay] = useState('');

  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    categoryType: 'COGS' as 'COGS' | 'EQUIPMENT' | 'OPERATIONAL',
    unit: 'g',
    packSize: 1000,
    minStock: 100,
    productImage: ''
  });

  const [appModal, setAppModal] = useState<{ isOpen: boolean; title: string; type: 'delete_quote' | 'alert'; data?: any }>({ isOpen: false, title: '', type: 'alert' });

  useEffect(() => {
    const unsubP = onSnapshot(query(collection(db, 'products'), orderBy('name')), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubS = onSnapshot(query(collection(db, 'supplierPrices'), orderBy('createdAt', 'desc')), snap => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubSuppliers = onSnapshot(query(collection(db, 'suppliers'), orderBy('name')), async snap => {
      if (snap.empty) {
        const defaults = ['ລັກຂະນາແພກ', 'Makro', 'LATDA', 'CHANHOM', 'DMART', 'HEAVENLY'];
        for (const name of defaults) {
          await addDoc(collection(db, 'suppliers'), { name, createdAt: serverTimestamp() });
        }
      } else {
        const sups = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
        setFirestoreSuppliers(sups);
        if (!billSupplier && sups.length > 0) setBillSupplier(sups[0].name);
      }
    });

    return () => { unsubP(); unsubS(); unsubSuppliers(); };
  }, []);

  // Clipboard Paste (Ctrl+V)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const b64 = await compressImage(file);
            if (isEditModalOpen && editingItem) {
              setEditingItem((prev: any) => ({ ...prev, productImage: b64 }));
            } else if (isAddProductModalOpen) {
              setNewProductForm(prev => ({ ...prev, productImage: b64 }));
            } else if (isProductManagerOpen && editingProduct) {
              setEditingProduct((prev: any) => ({ ...prev, productImage: b64 }));
            } else {
              setBillReceiptImage(b64);
            }
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isEditModalOpen, editingItem, isAddProductModalOpen, isProductManagerOpen, editingProduct]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      const b64 = await compressImage(files[0]);
      setBillReceiptImage(b64);
    }
  };

  const handleAddBillItemRow = () => {
    setBillItems(prev => [
      ...prev,
      { productId: '', quantity: 1, quantityPerUnit: 1000, unit: 'g', priceOriginal: '', priceMode: 'total', remark: '' }
    ]);
  };

  const handleRemoveBillItemRow = (idx: number) => {
    if (billItems.length <= 1) return;
    setBillItems(prev => prev.filter((_, i) => i !== idx));
  };

  const billSummary = useMemo(() => {
    let grandTotalOriginal = 0;
    billItems.forEach(it => {
      const rawPrice = Number(String(it.priceOriginal).replace(/,/g, '')) || 0;
      const qty = Number(it.quantity) || 1;
      grandTotalOriginal += (it.priceMode === 'total' ? rawPrice : rawPrice * qty);
    });
    const rate = billCurrency === 'LAK' ? 1 : (Number(billExchangeRate) || 1);
    return {
      grandTotalOriginal,
      grandTotalLAK: grandTotalOriginal * rate
    };
  }, [billItems, billCurrency, billExchangeRate]);

  const handleSaveWholeBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = billItems.filter(it => it.productId && Number(String(it.priceOriginal).replace(/,/g, '')) > 0);
    if (validItems.length === 0) {
      setAppModal({ isOpen: true, title: 'ແຈ້ງເຕືອນ', type: 'alert', data: 'ກະລຸນາເລືອກສິນຄ້າ ແລະ ໃສ່ລາຄາຢ່າງໜ້ອຍ 1 ລາຍການ' });
      return;
    }

    try {
      setSaveLoading(true);
      const rate = billCurrency === 'LAK' ? 1 : (Number(billExchangeRate) || 1);

      const batchPromises = validItems.map(item => {
        const rawPrice = Number(String(item.priceOriginal).replace(/,/g, ''));
        const qty = Number(item.quantity) || 1;
        const singlePrice = item.priceMode === 'total' ? rawPrice / qty : rawPrice;
        const priceLAK = singlePrice * rate;
        const totalOriginal = item.priceMode === 'total' ? rawPrice : rawPrice * qty;
        const totalPriceLAK = totalOriginal * rate;

        return addDoc(collection(db, 'supplierPrices'), {
          productId: item.productId,
          supplier: billSupplier || 'General Store',
          currency: billCurrency,
          exchangeRate: rate,
          priceOriginal: singlePrice,
          priceLAK,
          totalPriceOriginal: totalOriginal,
          totalPriceLAK,
          quantity: qty,
          quantityPerUnit: Number(item.quantityPerUnit) || 1,
          unit: item.unit || 'g',
          remark: item.remark || '',
          receiptImage: billReceiptImage || '',
          date: billDate,
          time: billTime,
          priceMode: item.priceMode,
          createdAt: serverTimestamp(),
          userId: auth.currentUser?.uid || 'admin',
          userEmail: auth.currentUser?.email || 'admin@leouve.com'
        });
      });

      await Promise.all(batchPromises);
      setBillReceiptImage('');
      setBillItems([{ productId: '', quantity: 1, quantityPerUnit: 1000, unit: 'g', priceOriginal: '', priceMode: 'total', remark: '' }]);
      setAppModal({ isOpen: true, title: 'ສຳເລັດ', type: 'alert', data: `ບັນທຶກສຳເລັດແລ້ວທັງໝົດ ${validItems.length} ລາຍການ!` });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleUpdateSupplierName = async (supplierId: string, oldName: string) => {
    if (!editSupplierName.trim() || editSupplierName.trim() === oldName) {
      setEditingSupplierId(null);
      return;
    }
    const newName = editSupplierName.trim();
    try {
      await updateDoc(doc(db, 'suppliers', supplierId), { name: newName });
      const q = query(collection(db, 'supplierPrices'), where('supplier', '==', oldName));
      const snap = await getDocs(q);
      const updates = snap.docs.map(d => updateDoc(doc(db, 'supplierPrices', d.id), { supplier: newName }));
      await Promise.all(updates);

      if (billSupplier === oldName) setBillSupplier(newName);
      setEditingSupplierId(null);
      setEditSupplierName('');
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleSaveEditedItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      setSaveLoading(true);
      const rawPrice = Number(String(editingItem.priceInput).replace(/,/g, '')) || 0;
      const qty = Number(editingItem.quantity) || 1;
      const rate = editingItem.currency === 'LAK' ? 1 : (Number(editingItem.exchangeRate) || 1);

      const singlePrice = editingItem.priceMode === 'total' ? rawPrice / qty : rawPrice;
      const priceLAK = singlePrice * rate;
      const totalOriginal = editingItem.priceMode === 'total' ? rawPrice : rawPrice * qty;
      const totalPriceLAK = totalOriginal * rate;

      await updateDoc(doc(db, 'supplierPrices', editingItem.id), {
        productId: editingItem.productId,
        supplier: editingItem.supplier,
        currency: editingItem.currency,
        exchangeRate: rate,
        priceOriginal: singlePrice,
        priceLAK,
        totalPriceOriginal: totalOriginal,
        totalPriceLAK,
        quantity: qty,
        quantityPerUnit: Number(editingItem.quantityPerUnit) || 1,
        unit: editingItem.unit || 'g',
        remark: editingItem.remark || '',
        receiptImage: editingItem.receiptImage || '',
        date: editingItem.date,
        time: editingItem.time || '12:00',
        priceMode: editingItem.priceMode,
        updatedAt: serverTimestamp()
      });

      if (editingItem.productId) {
        await updateDoc(doc(db, 'products', editingItem.productId), {
          productImage: editingItem.productImage || '',
          categoryType: editingItem.categoryType || 'COGS',
          isDurable: editingItem.categoryType === 'EQUIPMENT',
          unit: editingItem.unit || 'g',
          packSize: Number(editingItem.quantityPerUnit) || 1000,
          updatedAt: serverTimestamp()
        });
      }

      setIsEditModalOpen(false);
      setEditingItem(null);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSaveNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductForm.name.trim()) return;

    try {
      const docRef = await addDoc(collection(db, 'products'), {
        name: newProductForm.name.trim(),
        categoryType: newProductForm.categoryType,
        unit: newProductForm.unit || 'g',
        packSize: Number(newProductForm.packSize) || 1000,
        minStock: Number(newProductForm.minStock) || 100,
        productImage: newProductForm.productImage || '',
        isDurable: newProductForm.categoryType === 'EQUIPMENT',
        createdAt: serverTimestamp()
      });

      setBillItems(prev => prev.map((it, idx) => idx === 0 ? {
        ...it,
        productId: docRef.id,
        unit: newProductForm.unit,
        quantityPerUnit: newProductForm.packSize
      } : it));

      setIsAddProductModalOpen(false);
      setNewProductForm({ name: '', categoryType: 'COGS', unit: 'g', packSize: 1000, minStock: 100, productImage: '' });
      setAppModal({ isOpen: true, title: 'ສຳເລັດ', type: 'alert', data: 'ເພີ່ມສິນຄ້າໃໝ່ສຳເລັດແລ້ວ!' });
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-xs">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Procurement
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-800 dark:text-white mt-1">
            Supplier Quotes & Batch Invoices
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ບັນທຶກ, ແກ້ໄຂ ແລະ ອັບໂຫຼດຮູບສິນຄ້າ & ຮູບໃບບິນຊື້ເຄື່ອງ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsSupplierManagerOpen(true)}
            className="px-3.5 py-2 rounded-2xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-neutral-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200 dark:border-neutral-800"
          >
            <Building2 className="w-3.5 h-3.5 text-sky-500" />
            <span>ຈັດການຮ້ານຄ້າ</span>
          </button>

          <button
            onClick={() => setIsProductManagerOpen(true)}
            className="px-3.5 py-2 rounded-2xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-neutral-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200 dark:border-neutral-800"
          >
            <Layers className="w-3.5 h-3.5 text-amber-500" />
            <span>ຈັດການສິນຄ້າ</span>
          </button>

          <button
            onClick={() => setIsAddProductModalOpen(true)}
            className="crystal-button !py-2.5 !px-4 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>ເພີ່ມສິນຄ້າໃໝ່</span>
          </button>
        </div>
      </div>

      {/* Batch Form */}
      <div className="high-density-card p-6 space-y-6">
        <form onSubmit={handleSaveWholeBill} className="space-y-6">
          <div className="space-y-4 border-b border-slate-100 dark:border-neutral-800 pb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
              
              <div className="lg:col-span-5 space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="label-xs">ຮ້ານຄ້າ / ຜູ້ສະໜອງ (Supplier)</label>
                  <button
                    type="button"
                    onClick={() => setIsSupplierManagerOpen(true)}
                    className="text-[10px] text-sky-500 hover:underline cursor-pointer"
                  >
                    + ເພີ່ມ/ແກ້ໄຂຊື່ຮ້ານ
                  </button>
                </div>
                <select
                  value={billSupplier}
                  onChange={e => setBillSupplier(e.target.value)}
                  className="crystal-input w-full font-bold cursor-pointer h-11"
                >
                  {firestoreSuppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>

              <div className="lg:col-span-3 space-y-1.5">
                <label className="label-xs block">ວັນທີຕາມໃບບິນ</label>
                <input
                  type="date"
                  required
                  value={billDate}
                  onChange={e => setBillDate(e.target.value)}
                  className="crystal-input w-full font-mono text-xs font-bold h-11"
                />
              </div>

              <div className="lg:col-span-4 space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="label-xs">ສະກຸນເງິນ & ເລດ</label>
                  {billCurrency !== 'LAK' && (
                    <span className="text-[10px] font-mono text-amber-500 font-bold">1 {billCurrency} = {billExchangeRate} ₭</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <select
                    value={billCurrency}
                    onChange={e => {
                      const c = e.target.value as any;
                      setBillCurrency(c);
                      if (c === 'LAK') setBillExchangeRate(1);
                      else if (c === 'THB') setBillExchangeRate(680);
                      else if (c === 'USD') setBillExchangeRate(22000);
                    }}
                    className="crystal-input w-28 font-bold cursor-pointer h-11 shrink-0"
                  >
                    <option value="THB">THB (฿)</option>
                    <option value="LAK">LAK (₭)</option>
                    <option value="USD">USD ($)</option>
                  </select>

                  <input
                    type="number"
                    disabled={billCurrency === 'LAK'}
                    placeholder="ເລດເງິນ"
                    value={billCurrency === 'LAK' ? 1 : billExchangeRate}
                    onChange={e => setBillExchangeRate(parseFloat(e.target.value) || 1)}
                    className="crystal-input flex-1 font-mono font-bold text-center disabled:opacity-40 h-11"
                  />
                </div>
              </div>

            </div>

            {/* Receipt Upload Box */}
            <div className="space-y-1.5 pt-2">
              <label className="label-xs flex justify-between">
                <span>ຮູບພາບໃບບິນຊື້ເຄື່ອງ (Receipt Attachment)</span>
                <span className="text-emerald-500 font-bold text-[9px]">ຮອງຮັບ Ctrl + V ວາງຮູບໄດ້ທັນທີ</span>
              </label>

              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-200 dark:border-neutral-700/80 rounded-2xl p-4 text-center hover:bg-slate-50 dark:hover:bg-neutral-800/40 relative cursor-pointer transition-colors min-h-[85px] flex items-center justify-center"
              >
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const b64 = await compressImage(file);
                      setBillReceiptImage(b64);
                    }
                  }} 
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                />
                
                {billReceiptImage ? (
                  <div className="flex items-center gap-4 w-full justify-between px-2">
                    <div 
                      onClick={(e) => { e.stopPropagation(); setPreviewImage(billReceiptImage); }}
                      className="relative group/thumb cursor-pointer shrink-0"
                      title="ກົດເພື່ອຊູມເບິ່ງຮູບເຕັມ"
                    >
                      <img src={billReceiptImage} alt="Receipt" className="w-14 h-14 object-cover rounded-xl border border-neutral-700 shadow-sm" />
                      <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                        <ZoomIn className="w-4 h-4 text-white" />
                      </div>
                    </div>

                    <div className="flex-1 text-left min-w-0">
                      <span className="text-xs font-bold text-emerald-500 block">ອັບໂຫຼດຮູບໃບບິນສຳເລັດແລ້ວ ✓</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">ຮູບໃບບິນນີ້ຈະຖືກບັນທຶກຕິດໄປນຳທຸກໆລາຍການສິນຄ້າດ້ານລຸ່ມ</span>
                    </div>

                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); setBillReceiptImage(''); }} 
                      className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl cursor-pointer shrink-0"
                      title="ລຶບຮູບ"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1.5 text-slate-400 py-1">
                    <div className="flex items-center gap-2">
                      <Upload className="w-5 h-5 text-sky-500" />
                      <span className="text-xs font-bold text-slate-700 dark:text-neutral-200">ຄລິກເລືອກຮູບໃບບິນ, ລາກວາງໃສ່ບ່ອນນີ້</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      ຫຼື Capture ໜ້າຈໍແລ້ວກົດ <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-[9px] text-neutral-800 dark:text-neutral-200 font-mono font-bold">Ctrl + V</kbd> ເພື່ອວາງຮູບໄດ້ທັນທີ
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Line items list */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-serif uppercase tracking-wider text-slate-800 dark:text-white">
                ລາຍການສິນຄ້າໃນໃບບິນນີ້ ({billItems.length} ລາຍການ)
              </h4>
              <button
                type="button"
                onClick={handleAddBillItemRow}
                className="text-xs font-bold text-sky-500 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ເພີ່ມລາຍການຊື້ໃນບິນນີ້</span>
              </button>
            </div>

            <div className="space-y-3">
              {billItems.map((item, idx) => {
                const prod = products.find(p => p.id === item.productId);

                return (
                  <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/70 dark:border-neutral-800 space-y-3">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-neutral-800 text-[10px] font-bold flex items-center justify-center font-mono shrink-0">
                        {idx + 1}
                      </span>

                      {/* Product Thumbnail with Zoom */}
                      <div className="shrink-0">
                        {prod?.productImage ? (
                          <div 
                            onClick={() => setPreviewImage(prod.productImage)}
                            className="relative group/pimg cursor-pointer"
                            title="ກົດເພື່ອເບິ່ງຮູບໃຫຍ່"
                          >
                            <img src={prod.productImage} alt={prod.name} className="w-9 h-9 rounded-xl object-cover border border-neutral-700" />
                            <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover/pimg:opacity-100 transition-opacity">
                              <ZoomIn className="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-slate-400">
                            <Package className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      {/* Dropdown Select Product */}
                      <div className="flex-1 min-w-[200px]">
                        <select
                          value={item.productId}
                          onChange={e => {
                            const pId = e.target.value;
                            const pr = products.find(p => p.id === pId);
                            setBillItems(prev => prev.map((it, i) => i === idx ? { 
                              ...it, 
                              productId: pId, 
                              unit: pr?.unit || 'g', 
                              quantityPerUnit: pr?.packSize || 1000 
                            } : it));
                          }}
                          className="crystal-input w-full font-bold !py-2 text-xs cursor-pointer h-10"
                        >
                          <option value="">-- ເລືອກສິນຄ້າ --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>
                              [{p.categoryType || 'COGS'}] {p.name} ({p.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Price Mode */}
                      <div className="flex bg-slate-200 dark:bg-neutral-800 rounded-xl p-0.5 text-[10px] shrink-0 self-center">
                        <button
                          type="button"
                          onClick={() => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, priceMode: 'total' } : it))}
                          className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all ${item.priceMode === 'total' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 shadow-xs' : 'text-slate-400'}`}
                        >
                          ລາຄາລວມ
                        </button>
                        <button
                          type="button"
                          onClick={() => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, priceMode: 'per_pack' } : it))}
                          className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all ${item.priceMode === 'per_pack' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 shadow-xs' : 'text-slate-400'}`}
                        >
                          ຕໍ່ແພັກ
                        </button>
                      </div>

                      {/* Price input */}
                      <div className="w-full sm:w-44 shrink-0">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="ລາຄາ"
                            value={item.priceOriginal ? Number(item.priceOriginal).toLocaleString() : ''}
                            onChange={e => {
                              const raw = Number(e.target.value.replace(/,/g, '')) || 0;
                              setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, priceOriginal: raw } : it));
                            }}
                            className="crystal-input w-full !py-2 font-mono font-bold text-right text-xs pr-12 h-10"
                          />
                          <span className="absolute right-3 top-2.5 text-[10px] text-slate-400 font-bold pointer-events-none">
                            {billCurrency}
                          </span>
                        </div>
                      </div>

                      {billItems.length > 1 && (
                        <button type="button" onClick={() => handleRemoveBillItemRow(idx)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl cursor-pointer self-center">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1 border-t border-slate-200/60 dark:border-neutral-800/60">
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 block mb-1">ຈຳນວນແພັກ/ຖົງ</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="1"
                          value={item.quantity}
                          onChange={e => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: parseFloat(e.target.value) || 1 } : it))}
                          className="crystal-input w-full !py-1.5 text-center font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 block mb-1">ຂະໜາດຕໍ່ແພັກ</label>
                        <input
                          type="number"
                          placeholder="1000"
                          value={item.quantityPerUnit}
                          onChange={e => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, quantityPerUnit: parseFloat(e.target.value) || 1 } : it))}
                          className="crystal-input w-full !py-1.5 text-center font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 block mb-1">ຫົວໜ່ວຍ (g/ml/pcs)</label>
                        <input
                          type="text"
                          placeholder="g"
                          value={item.unit}
                          onChange={e => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                          className="crystal-input w-full !py-1.5 text-center font-bold uppercase"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 block mb-1">ໝາຍເຫດ</label>
                        <input
                          type="text"
                          placeholder="ໝາຍເຫດ..."
                          value={item.remark}
                          onChange={e => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, remark: e.target.value } : it))}
                          className="crystal-input w-full !py-1.5"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grand Total */}
          <div className="p-4 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5" />
                <span>ກວດສອບຍອດລວມທັງໝົດຂອງໃບບິນ (Grand Total Check)</span>
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ກວດເບິ່ງວ່າຍອດລວມນີ້ ກົງກັບຕົວເລກ Grand Total ໃນເຈ້ຍບິນແລ້ວຫຼືບໍ່
              </p>
            </div>

            <div className="text-right">
              <span className="text-2xl font-serif font-bold text-slate-800 dark:text-white font-mono block">
                {billSummary.grandTotalOriginal.toLocaleString()} {billCurrency}
              </span>
              {billCurrency !== 'LAK' && (
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  ≈ {Math.round(billSummary.grandTotalLAK).toLocaleString()} ₭
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={handleAddBillItemRow}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-800 text-xs font-bold cursor-pointer"
            >
              + ເພີ່ມແຖວສິນຄ້າ
            </button>
            <button
              type="submit"
              disabled={saveLoading}
              className="crystal-button !py-3 !px-8 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{saveLoading ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກໃບບິນ (ທຸກລາຍການ)'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Historical Quotes Table */}
      <div className="high-density-card p-6 overflow-hidden">
        <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-serif text-slate-800 dark:text-white">ປະຫວັດລາຄາ & ໃບບິນທັງໝົດ</h3>
            <p className="text-xs text-slate-400">ກົດທີ່ຮູບສິນຄ້າ ຫຼື ໄອຄອນຕາເພື່ອເບິ່ງຮູບໃຫຍ່</p>
          </div>
          <input
            type="text"
            placeholder="ຄົ້ນຫາ..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="crystal-input !py-1.5 !text-xs w-48"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
              <tr>
                <th className="p-3">ວັນທີ</th>
                <th className="p-3">ສິນຄ້າ</th>
                <th className="p-3">ຮ້ານຄ້າ</th>
                <th className="p-3 text-right">ລາຄາເດີມ</th>
                <th className="p-3 text-right">ລາຄາກີບ (LAK)</th>
                <th className="p-3 text-center">ໃບບິນ</th>
                <th className="p-3 text-center">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
              {supplierPrices
                .filter(p => {
                  const prod = products.find(pr => pr.id === p.productId)?.name || '';
                  return prod.toLowerCase().includes(filter.toLowerCase()) || (p.supplier || '').toLowerCase().includes(filter.toLowerCase());
                })
                .map(item => {
                  const prod = products.find(pr => pr.id === item.productId);
                  const total = item.totalPriceLAK || (item.currency === 'LAK' ? item.priceOriginal : item.priceOriginal * item.exchangeRate);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                      <td className="p-3 font-mono text-slate-400">{item.date}</td>
                      <td className="p-3 font-bold text-slate-800 dark:text-white">
                        <div className="flex items-center gap-2.5">
                          {prod?.productImage ? (
                            <div 
                              onClick={() => setPreviewImage(prod.productImage)}
                              className="relative group/pimg cursor-pointer shrink-0"
                              title="ກົດເພື່ອເບິ່ງຮູບໃຫຍ່"
                            >
                              <img src={prod.productImage} alt={prod.name} className="w-8 h-8 rounded-lg object-cover border border-neutral-700" />
                              <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover/pimg:opacity-100 transition-opacity">
                                <ZoomIn className="w-3.5 h-3.5 text-white" />
                              </div>
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-slate-400 shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                          )}

                          <div>
                            <span>{prod?.name || 'Item'}</span>
                            <span className="text-[10px] text-slate-400 block font-normal">{item.quantity}ແພັກ × {item.quantityPerUnit}{item.unit}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-medium">{item.supplier}</td>
                      <td className="p-3 text-right font-mono font-medium whitespace-nowrap">
                        {item.totalPriceOriginal ? Number(item.totalPriceOriginal).toLocaleString() : Number(item.priceOriginal).toLocaleString()} {item.currency}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-500 whitespace-nowrap">
                        {Math.round(total).toLocaleString()} ₭
                      </td>
                      <td className="p-3 text-center">
                        {item.receiptImage ? (
                          <button 
                            onClick={() => setPreviewImage(item.receiptImage)} 
                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 cursor-pointer"
                            title="ກົດເບິ່ງຮູບໃບບິນໃຫຍ່"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        ) : <span className="text-slate-500">-</span>}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => {
                              const rawVal = item.priceMode === 'total' 
                                ? (item.totalPriceOriginal || item.priceOriginal * item.quantity)
                                : item.priceOriginal;

                              const associatedProduct = products.find(p => p.id === item.productId);

                              setEditingItem({
                                ...item,
                                priceInput: rawVal,
                                priceMode: item.priceMode || 'total',
                                exchangeRate: item.currency === 'LAK' ? 1 : (item.exchangeRate || 1),
                                productImage: associatedProduct?.productImage || '',
                                categoryType: associatedProduct?.categoryType || 'COGS'
                              });
                              setEditPriceDisplay(Number(rawVal).toLocaleString());
                              setIsEditModalOpen(true);
                            }} 
                            className="p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-500/10 rounded-lg cursor-pointer transition-colors"
                            title="ແກ້ໄຂລາຄາ & ອັບໂຫຼດຮູບສິນຄ້າ"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setAppModal({ isOpen: true, title: 'ຢືນຢັນການລຶບ', type: 'delete_quote', data: item.id })} 
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer transition-colors"
                            title="ລຶບລາຍການ"
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

      {/* 🏪 Modal: Manage Suppliers */}
      {isSupplierManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsSupplierManagerOpen(false)}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-md w-full space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-serif text-slate-800 dark:text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-sky-500" />
                  <span>ຈັດການລາຍຊື່ຮ້ານຄ້າ (Suppliers List)</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ແກ້ໄຂຊື່ຮ້ານທີ່ສະກົດຜິດ (ລະບົບຈະອັບເດດໃນບິນເກົ່າໃຫ້ເອງ)</p>
              </div>
              <button onClick={() => setIsSupplierManagerOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            <div className="space-y-1.5">
              <label className="label-xs">ເພີ່ມຮ້ານຄ້າໃໝ່ເຂົ້າ Firestore</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ຊື່ຮ້ານຄ້າໃໝ່..."
                  value={newSupplierInput}
                  onChange={e => setNewSupplierInput(e.target.value)}
                  className="crystal-input flex-1 !text-xs font-bold"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!newSupplierInput.trim()) return;
                    await addDoc(collection(db, 'suppliers'), { name: newSupplierInput.trim(), createdAt: serverTimestamp() });
                    setBillSupplier(newSupplierInput.trim());
                    setNewSupplierInput('');
                  }}
                  className="crystal-button !py-2 !px-4 shrink-0"
                >
                  ເພີ່ມ
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
              <label className="label-xs block">ລາຍຊື່ຮ້ານຄ້າໃນລະບົບ ({firestoreSuppliers.length} ຮ້ານ)</label>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {firestoreSuppliers.map(sup => (
                  <div key={sup.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/60 dark:border-neutral-800 flex items-center justify-between gap-2">
                    {editingSupplierId === sup.id ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          autoFocus
                          value={editSupplierName}
                          onChange={e => setEditSupplierName(e.target.value)}
                          className="crystal-input flex-1 !py-1 !text-xs font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateSupplierName(sup.id, sup.name)}
                          className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSupplierId(null)}
                          className="p-1.5 bg-neutral-200 dark:bg-neutral-800 text-slate-400 rounded-lg"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-slate-800 dark:text-white truncate">{sup.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditingSupplierId(sup.id); setEditSupplierName(sup.name); }}
                            className="p-1.5 text-slate-400 hover:text-sky-500 rounded-lg cursor-pointer"
                            title="ແກ້ໄຂຊື່ຮ້ານ"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບຮ້ານຄ້າ "${sup.name}"?`)) return;
                              await deleteDoc(doc(db, 'suppliers', sup.id));
                              if (billSupplier === sup.name) setBillSupplier(firestoreSuppliers[0]?.name || '');
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer"
                            title="ລຶບຮ້ານ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📦 Modal: Manage Products */}
      {isProductManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsProductManagerOpen(false)}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-xl w-full space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-serif text-slate-800 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span>ຈັດການສິນຄ້າ & ປ່ຽນໝວດໝູ່</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ແກ້ໄຂຊື່, ປ່ຽນປະເພດ COGS ເປັນ CAPEX (ອຸປະກອນ) ຫຼື OPEX</p>
              </div>
              <button onClick={() => setIsProductManagerOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            {editingProduct ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/70 dark:border-neutral-800 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 dark:text-neutral-200">ກຳລັງແກ້ໄຂ: {editingProduct.name}</h4>
                <div>
                  <label className="label-xs block mb-1">ຊື່ສິນຄ້າ</label>
                  <input
                    type="text"
                    value={editingProduct.name}
                    onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="crystal-input w-full !text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="label-xs block mb-1.5">ປ່ຽນໝວດໝູ່ສິນຄ້າ</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingProduct({ ...editingProduct, categoryType: 'COGS' })}
                      className={`py-2 px-1 text-xs font-bold rounded-xl border text-center cursor-pointer transition-all ${editingProduct.categoryType === 'COGS' ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-black' : 'border-neutral-800 text-slate-400'}`}
                    >
                      COGS (ວັດຖຸດິບ)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProduct({ ...editingProduct, categoryType: 'EQUIPMENT' })}
                      className={`py-2 px-1 text-xs font-bold rounded-xl border text-center cursor-pointer transition-all ${editingProduct.categoryType === 'EQUIPMENT' ? 'bg-purple-500/10 border-purple-500 text-purple-500 font-black' : 'border-neutral-800 text-slate-400'}`}
                    >
                      ອຸປະກອນ (CAPEX)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProduct({ ...editingProduct, categoryType: 'OPERATIONAL' })}
                      className={`py-2 px-1 text-xs font-bold rounded-xl border text-center cursor-pointer transition-all ${editingProduct.categoryType === 'OPERATIONAL' ? 'bg-blue-500/10 border-blue-500 text-blue-500 font-black' : 'border-neutral-800 text-slate-400'}`}
                    >
                      ດຳເນີນງານ (OPEX)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label-xs block mb-1">ຫົວໜ່ວຍ</label>
                    <input
                      type="text"
                      value={editingProduct.unit}
                      onChange={e => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                      className="crystal-input w-full !text-xs font-bold text-center uppercase"
                    />
                  </div>
                  <div>
                    <label className="label-xs block mb-1">ຂະໜາດຕໍ່ແພັກ</label>
                    <input
                      type="number"
                      value={editingProduct.packSize}
                      onChange={e => setEditingProduct({ ...editingProduct, packSize: parseFloat(e.target.value) || 1000 })}
                      className="crystal-input w-full !text-xs font-mono font-bold text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="label-xs flex justify-between mb-1"><span>ຮູບສິນຄ້າ (Ctrl+V ວາງໄດ້)</span></label>
                  <div className="border border-dashed border-slate-300 dark:border-neutral-700 rounded-xl p-2 relative flex items-center justify-between">
                    <input type="file" accept="image/*" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const b64 = await compressImage(file);
                        setEditingProduct((prev: any) => ({ ...prev, productImage: b64 }));
                      }
                    }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    {editingProduct.productImage ? (
                      <div className="flex items-center gap-2 w-full justify-between">
                        <img src={editingProduct.productImage} alt="Product" className="w-8 h-8 rounded-lg object-cover border border-neutral-700" />
                        <span className="text-[11px] text-emerald-500 font-bold">ມີຮູບສິນຄ້າແລ້ວ ✓</span>
                        <button type="button" onClick={() => setEditingProduct({ ...editingProduct, productImage: '' })} className="text-rose-500 p-1">✕</button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 mx-auto flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> ຄລິກ ຫຼື ວາງຮູບ (Ctrl+V)</span>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setEditingProduct(null)} className="px-3.5 py-1.5 rounded-xl border text-xs text-slate-400">ຍົກເລີກ</button>
                  <button type="button" onClick={async () => {
                    await updateDoc(doc(db, 'products', editingProduct.id), {
                      name: editingProduct.name.trim(),
                      categoryType: editingProduct.categoryType,
                      unit: editingProduct.unit || 'g',
                      packSize: Number(editingProduct.packSize) || 1000,
                      isDurable: editingProduct.categoryType === 'EQUIPMENT',
                      productImage: editingProduct.productImage || '',
                      updatedAt: serverTimestamp()
                    });
                    setEditingProduct(null);
                  }} className="crystal-button !py-1.5 !px-5 text-xs">ບັນທຶກສິນຄ້າ</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="label-xs block">ລາຍການສິນຄ້າໃນລະບົບ ({products.length} ລາຍການ)</label>
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {products.map(p => (
                    <div key={p.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/60 dark:border-neutral-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {p.productImage ? (
                          <img src={p.productImage} alt={p.name} className="w-8 h-8 rounded-lg object-cover border border-neutral-700 shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-slate-400 shrink-0">
                            <Package className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-800 dark:text-white block truncate">{p.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{p.packSize}{p.unit}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          p.categoryType === 'EQUIPMENT' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                          p.categoryType === 'OPERATIONAL' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {p.categoryType || 'COGS'}
                        </span>
                        
                        <button
                          type="button"
                          onClick={() => setEditingProduct({ ...p, categoryType: p.categoryType || 'COGS' })}
                          className="p-1.5 text-slate-400 hover:text-sky-500 rounded-lg cursor-pointer"
                          title="ແກ້ໄຂ"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🔍 Lightbox Zoom Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-2xl max-h-[90vh] bg-[#141414] rounded-3xl p-3 border border-neutral-800" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/70 text-white hover:bg-black cursor-pointer z-10">
              <X className="w-5 h-5" />
            </button>
            <img src={previewImage} alt="Enlarged Preview" className="w-full h-auto max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}

      {/* 📝 Modal: Edit Quote (ປັບປຸງຄົບຖ້ວນທຸກແຖວ ບໍ່ມີຂາດ) */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-serif text-slate-800 dark:text-white flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-sky-500" />
                  <span>ແກ້ໄຂລາຍການລາຄາ & ໝວດໝູ່ສິນຄ້າ</span>
                </h3>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            <form onSubmit={handleSaveEditedItem} className="space-y-4">
              <div>
                <label className="label-xs block mb-1">ສິນຄ້າ / ວັດຖຸດິບ</label>
                <select
                  value={editingItem.productId}
                  onChange={e => {
                    const pId = e.target.value;
                    const pr = products.find(p => p.id === pId);
                    setEditingItem({ 
                      ...editingItem, 
                      productId: pId, 
                      unit: pr?.unit || editingItem.unit,
                      productImage: pr?.productImage || '',
                      categoryType: pr?.categoryType || 'COGS'
                    });
                  }}
                  className="crystal-input w-full font-bold cursor-pointer"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>[{p.categoryType || 'COGS'}] {p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-xs block mb-1">ປະເພດສິນຄ້າ</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, categoryType: 'COGS' })}
                    className={`py-1.5 text-xs font-bold rounded-xl border text-center cursor-pointer ${editingItem.categoryType === 'COGS' ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : 'border-neutral-800 text-slate-400'}`}
                  >
                    COGS (ວັດຖຸດິບ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, categoryType: 'EQUIPMENT' })}
                    className={`py-1.5 text-xs font-bold rounded-xl border text-center cursor-pointer ${editingItem.categoryType === 'EQUIPMENT' ? 'bg-purple-500/10 border-purple-500 text-purple-500 font-bold' : 'border-neutral-800 text-slate-400'}`}
                  >
                    ອຸປະກອນ (CAPEX)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, categoryType: 'OPERATIONAL' })}
                    className={`py-1.5 text-xs font-bold rounded-xl border text-center cursor-pointer ${editingItem.categoryType === 'OPERATIONAL' ? 'bg-blue-500/10 border-blue-500 text-blue-500 font-bold' : 'border-neutral-800 text-slate-400'}`}
                  >
                    ດຳເນີນງານ (OPEX)
                  </button>
                </div>
              </div>

              {/* ຮູບສິນຄ້າ */}
              <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 space-y-1.5">
                <label className="label-xs !text-sky-500 flex justify-between">
                  <span>ຮູບພາບສິນຄ້າຕົວຈິງ</span>
                  <span className="font-bold text-[9px]">Ctrl+V</span>
                </label>
                <div className="border border-dashed border-sky-500/30 rounded-xl p-2 relative flex items-center justify-between">
                  <input type="file" accept="image/*" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const b64 = await compressImage(file);
                      setEditingItem((prev: any) => ({ ...prev, productImage: b64 }));
                    }
                  }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  
                  {editingItem.productImage ? (
                    <div className="flex items-center gap-3 w-full justify-between">
                      <img src={editingItem.productImage} alt="Product" className="w-9 h-9 rounded-lg object-cover border border-sky-400" />
                      <span className="text-xs font-bold text-sky-500 truncate flex-1 pl-1">ຕິດຮູບສິນຄ້າແລ້ວ ✓</span>
                      <button type="button" onClick={() => setEditingItem((prev: any) => ({ ...prev, productImage: '' }))} className="text-rose-500 p-1">✕</button>
                    </div>
                  ) : (
                    <span className="text-xs text-sky-600 dark:text-sky-400 mx-auto flex items-center gap-1.5 font-bold">
                      <Upload className="w-3.5 h-3.5" /> ຄລິກ ຫຼື ວາງຮູບສິນຄ້າ (Ctrl+V)
                    </span>
                  )}
                </div>
              </div>

              {/* ຮ້ານຄ້າ & ວັນທີ */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-xs block mb-1">ຮ້ານຄ້າ (Supplier)</label>
                  <select
                    value={editingItem.supplier}
                    onChange={e => setEditingItem({ ...editingItem, supplier: e.target.value })}
                    className="crystal-input w-full font-bold cursor-pointer"
                  >
                    {firestoreSuppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-xs block mb-1">ວັນທີຊື້</label>
                  <input
                    type="date"
                    required
                    value={editingItem.date}
                    onChange={e => setEditingItem({ ...editingItem, date: e.target.value })}
                    className="crystal-input w-full font-mono font-bold"
                  />
                </div>
              </div>

              {/* ໂໝດລາຄາ */}
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setEditingItem({ ...editingItem, priceMode: 'total' })}
                  className={`py-2 text-xs font-bold rounded-xl cursor-pointer ${editingItem.priceMode === 'total' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 font-bold' : 'text-slate-400'}`}
                >
                  ລາຄາລວມ
                </button>
                <button
                  type="button"
                  onClick={() => setEditingItem({ ...editingItem, priceMode: 'per_pack' })}
                  className={`py-2 text-xs font-bold rounded-xl cursor-pointer ${editingItem.priceMode === 'per_pack' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 font-bold' : 'text-slate-400'}`}
                >
                  ຕໍ່ແພັກ
                </button>
              </div>

              {/* ລາຄາ, ສະກຸນເງິນ, ເລດ */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label-xs block mb-1">ລາຄາ</label>
                  <input
                    type="text"
                    required
                    value={editPriceDisplay}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '');
                      setEditPriceDisplay(raw ? Number(raw).toLocaleString() : '');
                      setEditingItem({ ...editingItem, priceInput: Number(raw) || 0 });
                    }}
                    className="crystal-input w-full font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="label-xs block mb-1">ສະກຸນເງິນ</label>
                  <select
                    value={editingItem.currency}
                    onChange={e => setEditingItem({ ...editingItem, currency: e.target.value })}
                    className="crystal-input w-full font-bold cursor-pointer"
                  >
                    <option value="THB">THB (฿)</option>
                    <option value="LAK">LAK (₭)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
                <div>
                  <label className="label-xs block mb-1">ເລດເງິນ</label>
                  <input
                    type="number"
                    disabled={editingItem.currency === 'LAK'}
                    value={editingItem.currency === 'LAK' ? 1 : editingItem.exchangeRate}
                    onChange={e => setEditingItem({ ...editingItem, exchangeRate: parseFloat(e.target.value) || 1 })}
                    className="crystal-input w-full font-mono font-bold text-center disabled:opacity-40"
                  />
                </div>
              </div>

              {/* ຈຳນວນແພັກ, ຂະໜາດ, ຫົວໜ່ວຍ */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label-xs block mb-1">ຈຳນວນແພັກ</label>
                  <input
                    type="number"
                    min="1"
                    value={editingItem.quantity}
                    onChange={e => setEditingItem({ ...editingItem, quantity: parseFloat(e.target.value) || 1 })}
                    className="crystal-input w-full text-center font-bold"
                  />
                </div>
                <div>
                  <label className="label-xs block mb-1">ຂະໜາດ/ແພັກ</label>
                  <input
                    type="number"
                    value={editingItem.quantityPerUnit}
                    onChange={e => setEditingItem({ ...editingItem, quantityPerUnit: parseFloat(e.target.value) || 1 })}
                    className="crystal-input w-full text-center font-bold"
                  />
                </div>
                <div>
                  <label className="label-xs block mb-1">ຫົວໜ່ວຍ</label>
                  <input
                    type="text"
                    value={editingItem.unit}
                    onChange={e => setEditingItem({ ...editingItem, unit: e.target.value })}
                    className="crystal-input w-full text-center font-bold uppercase"
                  />
                </div>
              </div>

              {/* ຮູບໃບບິນ */}
              <div>
                <label className="label-xs flex justify-between mb-1">
                  <span>ຮູບໃບບິນ (Receipt Attachment)</span>
                  <span className="text-emerald-500 font-bold text-[9px]">Ctrl+V</span>
                </label>
                <div className="border border-dashed border-slate-300 dark:border-neutral-700 rounded-xl p-2 relative flex items-center justify-between">
                  <input type="file" accept="image/*" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const b64 = await compressImage(file);
                      setEditingItem((prev: any) => ({ ...prev, receiptImage: b64 }));
                    }
                  }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  {editingItem.receiptImage ? (
                    <div className="flex items-center gap-2 w-full justify-between">
                      <img src={editingItem.receiptImage} alt="Receipt" className="w-8 h-8 rounded-lg object-cover border border-neutral-700" />
                      <span className="text-[11px] font-bold text-emerald-500 truncate flex-1 pl-1">ຕິດຮູບໃບບິນແລ້ວ ✓</span>
                      <button type="button" onClick={() => setEditingItem((prev: any) => ({ ...prev, receiptImage: '' }))} className="text-rose-500 p-1">✕</button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 mx-auto flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> ຄລິກ ຫຼື ວາງຮູບໃບບິນ</span>
                  )}
                </div>
              </div>

              <div>
                <label className="label-xs block mb-1">ໝາຍເຫດ</label>
                <input
                  type="text"
                  value={editingItem.remark || ''}
                  onChange={e => setEditingItem({ ...editingItem, remark: e.target.value })}
                  className="crystal-input w-full !text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-400">ຍົກເລີກ</button>
                <button type="submit" disabled={saveLoading} className="crystal-button">
                  {saveLoading ? 'Saving...' : 'ບັນທຶກການແກ້ໄຂ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📦 Modal: Add New Product */}
      {isAddProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsAddProductModalOpen(false)}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
              <h3 className="text-sm font-serif text-slate-800 dark:text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-500" />
                <span>ເພີ່ມສິນຄ້າໃໝ່ (New Product)</span>
              </h3>
              <button onClick={() => setIsAddProductModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveNewProduct} className="space-y-4">
              <div>
                <label className="label-xs block mb-1">ຊື່ສິນຄ້າ / ວັດຖຸດິບ</label>
                <input
                  type="text"
                  required
                  placeholder="ເຊັ່ນ: Mmilk, ໂຖແກ້ວ, ຖາດໂລ..."
                  value={newProductForm.name}
                  onChange={e => setNewProductForm({ ...newProductForm, name: e.target.value })}
                  className="crystal-input w-full !text-xs font-bold"
                />
              </div>

              <div>
                <label className="label-xs block mb-1.5">ປະເພດສິນຄ້າ</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNewProductForm({ ...newProductForm, categoryType: 'COGS', unit: 'g' })}
                    className={`p-2 rounded-xl text-xs font-bold border text-center cursor-pointer ${newProductForm.categoryType === 'COGS' ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : 'border-neutral-800 text-slate-400'}`}
                  >
                    COGS (ວັດຖຸດິບ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProductForm({ ...newProductForm, categoryType: 'EQUIPMENT', unit: 'pcs' })}
                    className={`p-2 rounded-xl text-xs font-bold border text-center cursor-pointer ${newProductForm.categoryType === 'EQUIPMENT' ? 'bg-purple-500/10 border-purple-500 text-purple-500 font-bold' : 'border-neutral-800 text-slate-400'}`}
                  >
                    ອຸປະກອນ (CAPEX)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProductForm({ ...newProductForm, categoryType: 'OPERATIONAL', unit: 'pack' })}
                    className={`p-2 rounded-xl text-xs font-bold border text-center cursor-pointer ${newProductForm.categoryType === 'OPERATIONAL' ? 'bg-blue-500/10 border-blue-500 text-blue-500 font-bold' : 'border-neutral-800 text-slate-400'}`}
                  >
                    ດຳເນີນງານ (OPEX)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-xs block mb-1">ຫົວໜ່ວຍ (Unit)</label>
                  <select
                    value={newProductForm.unit}
                    onChange={e => setNewProductForm({ ...newProductForm, unit: e.target.value })}
                    className="crystal-input w-full font-bold cursor-pointer"
                  >
                    <option value="g">g (ກຣາມ)</option>
                    <option value="ml">ml (ມິນລິລິດ / ຂວດ)</option>
                    <option value="pcs">pcs (ອັນ/ແກ້ວ)</option>
                    <option value="pack">pack (ແພັກ)</option>
                    <option value="box">box (ແກັດ)</option>
                  </select>
                </div>

                <div>
                  <label className="label-xs block mb-1">ຂະໜາດຕໍ່ແພັກ</label>
                  <input
                    type="number"
                    value={newProductForm.packSize}
                    onChange={e => setNewProductForm({ ...newProductForm, packSize: parseFloat(e.target.value) || 1000 })}
                    className="crystal-input w-full font-mono font-bold text-center"
                    placeholder="1000"
                  />
                </div>
              </div>

              <div>
                <label className="label-xs flex justify-between mb-1">
                  <span>ຮູບພາບສິນຄ້າ (Product Photo)</span>
                  <span className="text-emerald-500 font-bold text-[9px]">Ctrl+V ວາງໄດ້</span>
                </label>
                <div className="border border-dashed border-slate-300 dark:border-neutral-700 rounded-xl p-3 relative flex items-center justify-between">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const b64 = await compressImage(file);
                        setNewProductForm(prev => ({ ...prev, productImage: b64 }));
                      }
                    }} 
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                  />
                  {newProductForm.productImage ? (
                    <div className="flex items-center gap-2 w-full justify-between">
                      <img src={newProductForm.productImage} alt="Product" className="w-10 h-10 rounded-lg object-cover border border-neutral-700" />
                      <span className="text-xs text-emerald-500 font-bold">ອັບໂຫຼດຮູບສິນຄ້າແລ້ວ ✓</span>
                      <button type="button" onClick={() => setNewProductForm(prev => ({ ...prev, productImage: '' }))} className="text-rose-500 p-1">✕</button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 mx-auto flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /> ຄລິກເລືອກຮູບ ຫຼື ກົດ Ctrl+V</span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
                <button type="button" onClick={() => setIsAddProductModalOpen(false)} className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-400">ຍົກເລີກ</button>
                <button type="submit" className="crystal-button">ບັນທຶກສິນຄ້າ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Alerts & Popups */}
      {appModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={() => setAppModal({ ...appModal, isOpen: false })}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-serif text-slate-800 dark:text-white border-b border-neutral-800 pb-2">{appModal.title}</h3>
            {appModal.type === 'alert' && (
              <div className="space-y-4 text-xs">
                <p className="text-slate-400">{appModal.data}</p>
                <button onClick={() => setAppModal({ ...appModal, isOpen: false })} className="crystal-button w-full">ເຂົ້າໃຈແລ້ວ</button>
              </div>
            )}
            {appModal.type === 'delete_quote' && (
              <div className="space-y-4 text-xs">
                <p className="text-slate-300">ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບລາຍການລາຄານີ້ອອກຈາກລະບົບ?</p>
                <div className="flex gap-2">
                  <button onClick={() => setAppModal({ ...appModal, isOpen: false })} className="flex-1 py-2.5 rounded-xl border text-slate-400 font-bold">ຍົກເລີກ</button>
                  <button 
                    onClick={async () => {
                      if (appModal.data) await deleteDoc(doc(db, 'supplierPrices', appModal.data));
                      setAppModal({ ...appModal, isOpen: false });
                    }} 
                    className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold"
                  >
                    ລຶບທັນທີ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
