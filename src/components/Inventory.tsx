import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  Receipt,
  CheckCircle,
  AlertCircle,
  X,
  Save,
  DollarSign,
  Gift,
  Clock,
  Layers,
  Search,
  Droplet,
  Coffee,
  User,
  Calendar,
  CreditCard,
  ArrowRight,
  Upload,
  Eye,
  Sliders
} from 'lucide-react';
import { format } from 'date-fns';

// ຟັງຊັນບີບອັດຮູບສຳລັບ Paste (Ctrl+V)
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

export type UnitType = 'g' | 'ml' | 'pcs' | 'tsp' | 'tbsp';

// ຕົວຄູນປ່ຽນຫົວໜ່ວຍເປັນກຣາມ (tsp: 5g, tbsp: 15g)
export const convertToGram = (amount: number, unit: UnitType): number => {
  if (unit === 'tsp') return amount * 5;
  if (unit === 'tbsp') return amount * 15;
  return amount;
};

export interface RecipeIngredient {
  productId: string;
  name: string;
  amountPerBatch: number;
  unit: UnitType;
  costPerUnit: number; // ຕົ້ນທຶນຕໍ່ຫົວໜ່ວຍ (LAK)
}

export interface Recipe {
  id: string;
  name: string;
  category: 'COOKIE' | 'BAKERY' | 'BEVERAGE' | 'OTHER';
  batchYield: number; // ຈຳນວນກ້ອນຕໍ່ 1 ເຕົາ
  overheadCostPerPiece: number; // ຄ່າໄຟ/ນ້ຳ/ແຮງງານຕໍ່ກ້ອນ
  sellingPrice: number;
  ingredients: RecipeIngredient[];
  prepNotes?: string;
  pricingNotes?: string;
  recipeImage?: string;
  currentLiquidMl?: number;
  maxLiquidMl?: number;
}

export interface PosBillItem {
  recipeId: string;
  recipeName: string;
  producedQty: number; // ຈຳນວນທີ່ອົບອອກມາ
  actualSoldQty: number; // ຈຳນວນທີ່ຂາຍໄດ້ເງິນ
  sampleQty: number; // ຊິມເອງ / ແຖມ
  pricePerUnit: number;
  lineRevenue: number;
  recipeImage?: string;
}

export interface PosBill {
  id: string;
  billNo: string;
  customerName: string;
  date: string;
  time: string;
  status: 'pending' | 'settled';
  items: PosBillItem[];
  estimatedRevenue: number;
  actualRevenue: number;
  paymentMethod: 'onepay' | 'cash' | 'ldb';
  notes?: string;
  receiptImage?: string;
  debtId?: string; // ຜູກກັບ collection 'debts' ຂອງ Finance
}

export default function Inventory() {
  // Navigation Subtabs
  const [activeTab, setActiveTab] = useState<'pos_terminal' | 'pos_bills' | 'recipes'>('recipes');

  // Firestore Data
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [posBills, setPosBills] = useState<PosBill[]>([]);

  // POS Terminal Cart (ຈຳນວນທີ່ອົບອອກມາ)
  const [posCart, setPosCart] = useState<{ [recipeId: string]: number }>({});
  const [posCustomer, setPosCustomer] = useState('');
  const [posNotes, setPosNotes] = useState('');
  const [posPaymentMethod, setPosPaymentMethod] = useState<'onepay' | 'cash' | 'ldb'>('onepay');

  // Modals
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  const [editingBill, setEditingBill] = useState<PosBill | null>(null);
  const [settlingBill, setSettlingBill] = useState<PosBill | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // In-App Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Bills Filter
  const [billFilter, setBillFilter] = useState<'all' | 'pending' | 'settled'>('all');
  const [searchBill, setSearchBill] = useState('');

  // 🔄 Realtime Firestore
  useEffect(() => {
    const unsubRecipes = onSnapshot(collection(db, 'recipes'), snap => {
      setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe)));
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubBills = onSnapshot(query(collection(db, 'pos_bills'), orderBy('date', 'desc')), snap => {
      setPosBills(snap.docs.map(d => ({ id: d.id, ...d.data() } as PosBill)));
    });

    return () => { unsubRecipes(); unsubProducts(); unsubBills(); };
  }, []);

  // 📋 ຮອງຮັບ Paste (Ctrl+V) ທົ່ວໄປ
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const base64 = await compressImage(file);
            if (isRecipeModalOpen && editingRecipe) {
              setEditingRecipe((prev: any) => ({ ...prev, recipeImage: base64 }));
            }
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isRecipeModalOpen, editingRecipe]);

  // ==========================================
  // POS TERMINAL: ອອກບິນ POS (ສົ່ງເຂົ້າ AR)
  // ==========================================
  const cartItems = useMemo(() => {
    const items: PosBillItem[] = [];
    let totalEst = 0;

    Object.entries(posCart).forEach(([recipeId, qty]) => {
      if (qty > 0) {
        const r = recipes.find(item => item.id === recipeId);
        if (r) {
          const lineTotal = qty * r.sellingPrice;
          totalEst += lineTotal;
          items.push({
            recipeId: r.id,
            recipeName: r.name,
            producedQty: qty,
            actualSoldQty: qty,
            sampleQty: 0,
            pricePerUnit: r.sellingPrice,
            lineRevenue: lineTotal,
            recipeImage: r.recipeImage
          });
        }
      }
    });

    return { items, totalEst };
  }, [posCart, recipes]);

  const handleIssuePosBill = async () => {
    if (cartItems.items.length === 0) return;

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const timeNow = format(new Date(), 'HH:mm');
      const billNo = `POS-${Date.now().toString().slice(-6)}`;
      const customer = posCustomer.trim() || 'ລູກຄ້າ POS ທົ່ວໄປ';

      // 1. ບັນທຶກເຂົ້າ collection 'debts' (AR - ໜີ້ຕ້ອງຮັບ) ໃນ Finance
      const debtRef = await addDoc(collection(db, 'debts'), {
        type: 'receivable', // ໜີ້ຕ້ອງຮັບ
        person: customer,
        amount: cartItems.totalEst,
        dueDate: today,
        status: 'pending',
        remark: `ບິນ POS #${billNo} (${posNotes.trim() || 'ລໍຖ້າເຄຍບິນ'})`,
        createdAt: serverTimestamp()
      });

      // 2. ບັນທຶກບິນ POS ໃນ pos_bills
      await addDoc(collection(db, 'pos_bills'), {
        billNo,
        customerName: customer,
        date: today,
        time: timeNow,
        status: 'pending',
        items: cartItems.items,
        estimatedRevenue: cartItems.totalEst,
        actualRevenue: 0,
        paymentMethod: posPaymentMethod,
        notes: posNotes.trim(),
        debtId: debtRef.id,
        createdAt: serverTimestamp()
      });

      // Reset
      setPosCart({});
      setPosCustomer('');
      setPosNotes('');
      setActiveTab('pos_bills');
    } catch (err) {
      console.error(err);
    }
  };

  // Filter ບິນ POS
  const filteredBills = useMemo(() => {
    return posBills.filter(b => {
      if (billFilter === 'pending' && b.status !== 'pending') return false;
      if (billFilter === 'settled' && b.status !== 'settled') return false;
      if (searchBill.trim()) {
        const q = searchBill.toLowerCase();
        return b.billNo.toLowerCase().includes(q) || b.customerName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [posBills, billFilter, searchBill]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-sans p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-[#141414] p-6 rounded-3xl border border-neutral-800">
        <div>
          <span className="bg-[#052659] text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Workspace • Bakery & Cafe
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-white mt-1">
            Inventory & POS System
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            ສູດຂະໜົມ, ຕັດສະຕັອກຕາມເຕົາ, ອອກບິນ POS ເຂົ້າ AR, ແລະ ເຄຍບິນຂຶ້ນ Dashboard
          </p>
        </div>

        {/* Subtabs Switcher */}
        <div className="flex items-center bg-[#0a0a0a] border border-neutral-800 p-1 rounded-2xl text-xs font-bold">
          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'recipes' ? 'bg-[#052659] text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            ສູດຂະໜົມ & ຕົ້ນທຶນ ({recipes.length})
          </button>
          <button
            onClick={() => setActiveTab('pos_terminal')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'pos_terminal' ? 'bg-[#052659] text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            ອອກບິນ POS ປະຈຳວັນ
          </button>
          <button
            onClick={() => setActiveTab('pos_bills')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'pos_bills' ? 'bg-[#052659] text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <span>ປະຫວັດບິນ & ເຄຍບິນ</span>
            {posBills.filter(b => b.status === 'pending').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================
          TAB 1: ສູດຂະໜົມ & ຕົ້ນທຶນ (RECIPES)
          ======================================================== */}
      {activeTab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-serif text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>ລາຍການສູດຂະໜົມ & ຕົ້ນທຶນ (Recipe & Batch Yield)</span>
            </h2>
            <button
              onClick={() => {
                setEditingRecipe({
                  id: '',
                  name: '',
                  category: 'COOKIE',
                  batchYield: 20,
                  overheadCostPerPiece: 2000,
                  sellingPrice: 25000,
                  ingredients: []
                });
                setIsRecipeModalOpen(true);
              }}
              className="px-4 py-2 bg-white hover:bg-neutral-200 text-black text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Plus className="w-4 h-4 text-black" />
              <span>+ ສ້າງສູດໃໝ່</span>
            </button>
          </div>

          {recipes.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-neutral-800 rounded-3xl bg-[#141414] space-y-3">
              <Coffee className="w-10 h-10 text-neutral-600 mx-auto" />
              <h3 className="text-base font-serif text-neutral-300">ຍັງບໍ່ທັນມີສູດຂະໜົມໃນລະບົບ</h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                ກົດປຸ່ມ "+ ສ້າງສູດໃໝ່" ເພື່ອກຳນົດວັດຖຸດິບ, ຄ່າໄຟ-ນ້ຳ, ແລະ ຈຳນວນກ້ອນຕໍ່ເຕົາ (Batch Yield)
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recipes.map(r => {
                // ຄຳນວນຕົ້ນທຶນຕໍ່ກ້ອນ
                const rawCostPerBatch = r.ingredients.reduce((sum, it) => {
                  const gAmount = convertToGram(it.amountPerBatch, it.unit);
                  return sum + (gAmount * it.costPerUnit);
                }, 0);
                const rawCostPerPiece = r.batchYield > 0 ? rawCostPerBatch / r.batchYield : 0;
                const totalCostPerPiece = rawCostPerPiece + (r.overheadCostPerPiece || 0);
                const profitPerPiece = r.sellingPrice - totalCostPerPiece;
                const margin = r.sellingPrice > 0 ? (profitPerPiece / r.sellingPrice) * 100 : 0;

                return (
                  <div key={r.id} className="p-5 rounded-2xl bg-[#141414] border border-neutral-800 flex flex-col justify-between space-y-4 hover:border-neutral-700 transition-all">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-amber-400 uppercase">
                          {r.category}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              setEditingRecipe(r);
                              setIsRecipeModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'ຢືນຢັນລຶບສູດ',
                                message: `ທ່ານຕ້ອງການລຶບສູດ "${r.name}" ແທ້ຫຼືບໍ່?`,
                                onConfirm: async () => {
                                  await deleteDoc(doc(db, 'recipes', r.id));
                                  setConfirmModal(null);
                                }
                              });
                            }}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-500 bg-neutral-900 border border-neutral-800 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-3">
                        {r.recipeImage && (
                          <img src={r.recipeImage} alt={r.name} className="w-12 h-12 rounded-xl object-cover border border-neutral-700" />
                        )}
                        <div>
                          <h3 className="font-serif text-lg text-white">{r.name}</h3>
                          <span className="text-xs text-neutral-400 font-mono">1 ເຕົາອົບໄດ້ {r.batchYield} ກ້ອນ</span>
                        </div>
                      </div>

                      {/* Bottle Gauge (ຖ້າມີ liquid ml) */}
                      {r.maxLiquidMl && (
                        <div className="mt-3 space-y-1">
                          <div className="flex justify-between text-[10px] text-neutral-400">
                            <span>Bottle Gauge</span>
                            <span>{r.currentLiquidMl || 0} / {r.maxLiquidMl} ml</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                            <div
                              className="h-full bg-sky-400 rounded-full"
                              style={{ width: `${Math.min(100, ((r.currentLiquidMl || 0) / r.maxLiquidMl) * 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 pt-3 border-t border-neutral-800/80 space-y-1 text-xs">
                        <div className="flex justify-between text-neutral-400">
                          <span>ຕົ້ນທຶນຕໍ່ກ້ອນ:</span>
                          <span className="font-mono text-white">{Math.round(totalCostPerPiece).toLocaleString()} ₭</span>
                        </div>
                        <div className="flex justify-between text-neutral-400">
                          <span>ລາຄາຂາຍ:</span>
                          <span className="font-mono text-emerald-400 font-bold">{Number(r.sellingPrice).toLocaleString()} ₭</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-neutral-900/80 border border-neutral-800 flex justify-between items-center text-xs">
                      <span className="text-neutral-400">ກຳໄລຕໍ່ກ້ອນ:</span>
                      <span className="font-mono font-bold text-emerald-400">
                        +{Math.round(profitPerPiece).toLocaleString()} ₭ ({Math.round(margin)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          TAB 2: ອອກບິນ POS ປະຈຳວັນ (TERMINAL)
          ======================================================== */}
      {activeTab === 'pos_terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Menu Grid */}
          <div className="lg:col-span-8 space-y-4">
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              ເລືອກເມນູທີ່ອົບ/ຜະລິດອອກມາປະຈຳວັນ (ຕັດສະຕັອກຕາມເຕົາ)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {recipes.map(r => {
                const count = posCart[r.id] || 0;
                return (
                  <div key={r.id} className="p-4 rounded-2xl bg-[#141414] border border-neutral-800 flex flex-col justify-between space-y-3">
                    <div className="flex items-center gap-3">
                      {r.recipeImage && <img src={r.recipeImage} alt={r.name} className="w-10 h-10 rounded-xl object-cover border border-neutral-700" />}
                      <div>
                        <h4 className="font-serif text-base text-white">{r.name}</h4>
                        <span className="text-xs font-mono text-emerald-400 font-bold">{Number(r.sellingPrice).toLocaleString()} ₭</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-neutral-800">
                      <span className="text-xs text-neutral-400">ຈຳນວນທີ່ອົບ:</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPosCart(prev => ({ ...prev, [r.id]: Math.max(0, count - 1) }))}
                          className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 text-white font-bold cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono font-bold text-white text-sm">{count}</span>
                        <button
                          type="button"
                          onClick={() => setPosCart(prev => ({ ...prev, [r.id]: count + 1 }))}
                          className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 text-white font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Checkout Box */}
          <div className="lg:col-span-4">
            <div className="bg-[#141414] border border-neutral-800 rounded-3xl p-5 space-y-4 sticky top-6">
              <div className="border-b border-neutral-800 pb-3 flex justify-between items-center">
                <h3 className="font-serif text-base text-white flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-400" />
                  <span>ສະຫຼຸບໃບບິນ POS</span>
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/40 border border-amber-800/40 text-amber-300">
                  AR Pending
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-neutral-400 block mb-1">ຊື່ລູກຄ້າ / ໂຕະ / ເລກອໍເດີ</label>
                  <input
                    type="text"
                    placeholder="ຕົວຢ່າງ: ໂຕະ 1, ລູກຄ້າ Pre-order..."
                    value={posCustomer}
                    onChange={e => setPosCustomer(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-neutral-400 block mb-1">ໝາຍເຫດ</label>
                  <input
                    type="text"
                    placeholder="ໃສ່ກ່ອງ, ຫວານໜ້ອຍ..."
                    value={posNotes}
                    onChange={e => setPosNotes(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Items in Bill */}
              <div className="divide-y divide-neutral-800/60 max-h-48 overflow-y-auto pt-2 text-xs">
                {cartItems.items.length === 0 ? (
                  <div className="py-6 text-center text-neutral-500">ຍັງບໍ່ມີເມນູໃນບິນ</div>
                ) : (
                  cartItems.items.map(it => (
                    <div key={it.recipeId} className="py-2 flex justify-between items-center">
                      <div>
                        <span className="text-white font-bold block">{it.recipeName}</span>
                        <span className="text-[10px] text-neutral-500 font-mono">{it.producedQty} × {it.pricePerUnit.toLocaleString()}</span>
                      </div>
                      <span className="font-mono text-white font-bold">{it.lineRevenue.toLocaleString()} ₭</span>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-neutral-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-400">ຍອດປະເມີນລວມ:</span>
                  <span className="font-mono font-bold text-xl text-amber-400">{cartItems.totalEst.toLocaleString()} ₭</span>
                </div>

                <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-400 leading-relaxed">
                  ℹ️ ເມື່ອກົດອອກບິນ ຍອດຈະຖືກສົ່ງໄປ **ໜີ້ຕ້ອງຮັບ (AR)** ໃນ Finance. ເມື່ອລູກຄ້າຊຳລະແລ້ວ ຈຶ່ງມາກົດ <em>"ເຄຍບິນ"</em> ເພື່ອເພີ່ມຍອດຂາຍເຂົ້າ Dashboard.
                </div>

                <button
                  type="button"
                  disabled={cartItems.items.length === 0}
                  onClick={handleIssuePosBill}
                  className="w-full py-3 bg-white hover:bg-neutral-200 text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-40"
                >
                  <span>ອອກບິນ POS (ຕັດສະຕັອກ & ສົ່ງເຂົ້າ AR)</span>
                  <ArrowRight className="w-4 h-4 text-black" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 3: ປະຫວັດບິນ & ເຄຍບິນ (SETTLEMENT)
          ======================================================== */}
      {activeTab === 'pos_bills' && (
        <div className="space-y-4">
          <div className="bg-[#141414] border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center bg-[#0a0a0a] border border-neutral-800 rounded-xl p-1">
              <button
                onClick={() => setBillFilter('all')}
                className={`px-3 py-1.5 rounded-lg cursor-pointer ${billFilter === 'all' ? 'bg-[#052659] text-white' : 'text-neutral-400'}`}
              >
                ທັງໝົດ ({posBills.length})
              </button>
              <button
                onClick={() => setBillFilter('pending')}
                className={`px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 ${billFilter === 'pending' ? 'bg-[#052659] text-white' : 'text-neutral-400'}`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                ລໍຖ້າເຄຍ (AR) ({posBills.filter(b => b.status === 'pending').length})
              </button>
              <button
                onClick={() => setBillFilter('settled')}
                className={`px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 ${billFilter === 'settled' ? 'bg-[#052659] text-white' : 'text-neutral-400'}`}
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                ເຄຍແລ້ວ (Dashboard) ({posBills.filter(b => b.status === 'settled').length})
              </button>
            </div>

            <div className="flex items-center gap-2 bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-1.5 w-64">
              <Search className="w-3.5 h-3.5 text-neutral-500" />
              <input
                type="text"
                placeholder="ຄົ້ນຫາເລກບິນ ຫຼື ຊື່ລູກຄ້າ..."
                value={searchBill}
                onChange={e => setSearchBill(e.target.value)}
                className="bg-transparent text-white focus:outline-none w-full"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredBills.length === 0 ? (
              <div className="p-12 text-center text-neutral-500 border border-neutral-800 rounded-2xl bg-[#141414] text-xs">
                ບໍ່ພົບລາຍການໃບບິນ POS ຕາມເງື່ອນໄຂ
              </div>
            ) : (
              filteredBills.map(bill => {
                const isPending = bill.status === 'pending';
                return (
                  <div key={bill.id} className="p-4 rounded-2xl bg-[#141414] border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs hover:border-neutral-700 transition-all">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-sm">#{bill.billNo}</span>
                        <span className="text-neutral-300 font-bold">• {bill.customerName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                          isPending ? 'bg-amber-950/40 text-amber-400 border border-amber-800/40' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                        }`}>
                          {isPending ? 'ລໍຖ້າຊຳລະ (AR)' : '✓ ເຄຍແລ້ວ (Dashboard)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400">
                        {bill.date} {bill.time} • {bill.items.map(i => `${i.recipeName} (${i.producedQty})`).join(', ')}
                        {bill.notes ? ` • Note: ${bill.notes}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-800">
                      <div className="text-right">
                        <span className="text-[10px] text-neutral-500 block">{isPending ? 'ຍອດປະເມີນ:' : 'ຍອດຂາຍຈິງ:'}</span>
                        <span className={`font-mono font-bold text-base ${isPending ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {(bill.actualRevenue || bill.estimatedRevenue).toLocaleString()} ₭
                        </span>
                      </div>

                      {/* ✏️ ປຸ່ມແກ້ໄຂບິນ POS */}
                      <button
                        onClick={() => setEditingBill(bill)}
                        className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white cursor-pointer"
                        title="ແກ້ໄຂບິນ"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      </button>

                      {/* ⚡ ປຸ່ມເຄຍບິນ POS */}
                      {isPending ? (
                        <button
                          onClick={() => setSettlingBill(bill)}
                          className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-black" />
                          <span>ເຄຍບິນ (ຮັບເງິນ)</span>
                        </button>
                      ) : (
                        bill.receiptImage && (
                          <button
                            onClick={() => setPreviewImage(bill.receiptImage || null)}
                            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white cursor-pointer"
                            title="ເບິ່ງສະລິບ"
                          >
                            <Eye className="w-3.5 h-3.5 text-sky-400" />
                          </button>
                        )
                      )}

                      <button
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: 'ຢືນຢັນລຶບບິນ POS',
                            message: `ທ່ານຕ້ອງການລຶບບິນ #${bill.billNo} ແທ້ຫຼືບໍ່?`,
                            onConfirm: async () => {
                              await deleteDoc(doc(db, 'pos_bills', bill.id));
                              if (bill.debtId) await deleteDoc(doc(db, 'debts', bill.debtId));
                              setConfirmModal(null);
                            }
                          });
                        }}
                        className="p-2 text-neutral-500 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ສ້າງ / ແກ້ໄຂສູດຂະໜົມ (RECIPE BUILDER)
          ======================================================== */}
      {isRecipeModalOpen && editingRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setIsRecipeModalOpen(false)}>
          <div className="bg-[#141414] border border-neutral-800 rounded-3xl p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
              <h3 className="font-serif text-lg text-white">
                {editingRecipe.id ? 'ແກ້ໄຂສູດຂະໜົມ' : 'ສ້າງສູດຂະໜົມໃໝ່'}
              </h3>
              <button onClick={() => setIsRecipeModalOpen(false)} className="text-neutral-400 hover:text-white cursor-pointer">✕</button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!editingRecipe.name.trim()) return;

              const payload = {
                ...editingRecipe,
                updatedAt: serverTimestamp()
              };

              if (editingRecipe.id) {
                await updateDoc(doc(db, 'recipes', editingRecipe.id), payload);
              } else {
                await addDoc(collection(db, 'recipes'), {
                  ...payload,
                  createdAt: serverTimestamp()
                });
              }

              setIsRecipeModalOpen(false);
            }} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-400 block mb-1">ຊື່ເມນູ / ສູດ</label>
                  <input
                    type="text"
                    required
                    placeholder="ເຊັ່ນ: Salted Caramel Cookie..."
                    value={editingRecipe.name}
                    onChange={e => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">ໝວດໝູ່</label>
                  <select
                    value={editingRecipe.category}
                    onChange={e => setEditingRecipe({ ...editingRecipe, category: e.target.value as any })}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="COOKIE">Cookie (ຄຸກກີ້)</option>
                    <option value="BAKERY">Bakery (ເບເກີຣີ/ເຄັກ)</option>
                    <option value="BEVERAGE">Beverage (ເຄື່ອງດື່ມ)</option>
                    <option value="OTHER">Other (ອື່ນໆ)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-neutral-400 block mb-1">ຈຳນວນກ້ອນຕໍ່ 1 ເຕົາ (Batch Yield)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editingRecipe.batchYield}
                    onChange={e => setEditingRecipe({ ...editingRecipe, batchYield: Number(e.target.value) || 1 })}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">ຄ່າໄຟ/ນ້ຳຕໍ່ກ້ອນ (Overhead)</label>
                  <input
                    type="number"
                    value={editingRecipe.overheadCostPerPiece}
                    onChange={e => setEditingRecipe({ ...editingRecipe, overheadCostPerPiece: Number(e.target.value) || 0 })}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">ລາຄາຂາຍຕໍ່ກ້ອນ (LAK)</label>
                  <input
                    type="number"
                    required
                    value={editingRecipe.sellingPrice}
                    onChange={e => setEditingRecipe({ ...editingRecipe, sellingPrice: Number(e.target.value) || 0 })}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold"
                  />
                </div>
              </div>

              {/* ວັດຖຸດິບໃນສູດ */}
              <div className="border border-neutral-800 rounded-2xl p-4 bg-[#0a0a0a] space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-neutral-300">ວັດຖຸດິບໃນສູດຕໍ່ 1 ເຕົາ</span>
                  <button
                    type="button"
                    onClick={() => {
                      const firstProd = products[0];
                      setEditingRecipe({
                        ...editingRecipe,
                        ingredients: [
                          ...editingRecipe.ingredients,
                          {
                            productId: firstProd?.id || '',
                            name: firstProd?.name || 'ວັດຖຸດິບ',
                            amountPerBatch: 100,
                            unit: 'g',
                            costPerUnit: firstProd?.costPerUnit || 50
                          }
                        ]
                      });
                    }}
                    className="text-[11px] font-bold text-sky-400 hover:underline cursor-pointer"
                  >
                    + ເພີ່ມວັດຖຸດິບ
                  </button>
                </div>

                {editingRecipe.ingredients.length === 0 ? (
                  <p className="text-[11px] text-neutral-500 py-3 text-center">ຍັງບໍ່ທັນເພີ່ມວັດຖຸດິບໃນສູດນີ້</p>
                ) : (
                  editingRecipe.ingredients.map((ing, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800/80">
                      <select
                        value={ing.productId}
                        onChange={e => {
                          const p = products.find(prod => prod.id === e.target.value);
                          const updated = [...editingRecipe.ingredients];
                          updated[idx] = {
                            ...updated[idx],
                            productId: e.target.value,
                            name: p?.name || 'ວັດຖຸດິບ',
                            costPerUnit: p?.costPerUnit || 50
                          };
                          setEditingRecipe({ ...editingRecipe, ingredients: updated });
                        }}
                        className="flex-1 bg-[#141414] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-white"
                      >
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        placeholder="ປະລິມານ"
                        value={ing.amountPerBatch}
                        onChange={e => {
                          const updated = [...editingRecipe.ingredients];
                          updated[idx].amountPerBatch = Number(e.target.value) || 0;
                          setEditingRecipe({ ...editingRecipe, ingredients: updated });
                        }}
                        className="w-20 bg-[#141414] border border-neutral-800 rounded-lg px-2 py-1.5 text-center font-mono text-white"
                      />

                      <select
                        value={ing.unit}
                        onChange={e => {
                          const updated = [...editingRecipe.ingredients];
                          updated[idx].unit = e.target.value as any;
                          setEditingRecipe({ ...editingRecipe, ingredients: updated });
                        }}
                        className="bg-[#141414] border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-300 font-mono"
                      >
                        <option value="g">g (ກຣາມ)</option>
                        <option value="ml">ml (ມິນລີລິດ)</option>
                        <option value="pcs">pcs (ອັນ)</option>
                        <option value="tsp">tsp (ຊ້ອນຊາ = 5g)</option>
                        <option value="tbsp">tbsp (ຊ້ອນໂຕະ = 15g)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingRecipe({
                            ...editingRecipe,
                            ingredients: editingRecipe.ingredients.filter((_, i) => i !== idx)
                          });
                        }}
                        className="text-neutral-500 hover:text-rose-500 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* ຮູບສູດຂະໜົມ (Ctrl+V) */}
              <div>
                <label className="text-neutral-400 flex justify-between mb-1">
                  <span>ຮູບເມນູຂະໜົມ (Ctrl+V ວາງໄດ້)</span>
                </label>
                <div className="border border-dashed border-neutral-700 rounded-xl p-2.5 flex items-center justify-between">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) setEditingRecipe({ ...editingRecipe, recipeImage: await compressImage(file) });
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                  />
                  {editingRecipe.recipeImage ? (
                    <div className="flex items-center gap-2 w-full justify-between">
                      <img src={editingRecipe.recipeImage} alt="Recipe" className="w-10 h-10 rounded-lg object-cover" />
                      <span className="text-emerald-400 font-bold">ມີຮູບແລ້ວ ✓</span>
                      <button type="button" onClick={() => setEditingRecipe({ ...editingRecipe, recipeImage: '' })} className="text-rose-500">✕</button>
                    </div>
                  ) : (
                    <span className="text-neutral-500 mx-auto flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> ຄລິກ ຫຼື ກົດ Ctrl+V</span>
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-neutral-800">
                <button type="button" onClick={() => setIsRecipeModalOpen(false)} className="px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400">ຍົກເລີກ</button>
                <button type="submit" className="px-5 py-2 bg-white text-black font-bold rounded-xl hover:bg-neutral-200">ບັນທຶກສູດ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ແກ້ໄຂບິນ POS (EDIT BILL)
          ======================================================== */}
      {editingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setEditingBill(null)}>
          <div className="bg-[#141414] border border-neutral-800 rounded-3xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
              <h3 className="font-serif text-base text-white">ແກ້ໄຂບິນ POS #{editingBill.billNo}</h3>
              <button onClick={() => setEditingBill(null)} className="text-neutral-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const recalculated = editingBill.items.reduce((s, it) => s + (it.producedQty * it.pricePerUnit), 0);
              
              await updateDoc(doc(db, 'pos_bills', editingBill.id), {
                customerName: editingBill.customerName,
                notes: editingBill.notes || '',
                items: editingBill.items,
                estimatedRevenue: recalculated,
                actualRevenue: editingBill.status === 'settled' ? recalculated : editingBill.actualRevenue
              });

              if (editingBill.debtId) {
                await updateDoc(doc(db, 'debts', editingBill.debtId), {
                  person: editingBill.customerName,
                  amount: recalculated
                });
              }

              setEditingBill(null);
            }} className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-400 block mb-1">ຊື່ລູກຄ້າ</label>
                <input
                  type="text"
                  value={editingBill.customerName}
                  onChange={e => setEditingBill({ ...editingBill, customerName: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white font-bold"
                />
              </div>

              <div className="space-y-2 border border-neutral-800 rounded-xl p-3 bg-[#0a0a0a]">
                <span className="font-bold text-neutral-400 block">ລາຍການເມນູ</span>
                {editingBill.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center gap-2">
                    <span className="text-white font-bold flex-1">{it.recipeName}</span>
                    <input
                      type="number"
                      min="1"
                      value={it.producedQty}
                      onChange={e => {
                        const updated = [...editingBill.items];
                        updated[idx].producedQty = Number(e.target.value) || 1;
                        updated[idx].lineRevenue = updated[idx].producedQty * updated[idx].pricePerUnit;
                        setEditingBill({ ...editingBill, items: updated });
                      }}
                      className="w-16 bg-[#141414] border border-neutral-700 rounded px-2 py-1 text-center font-mono text-white"
                    />
                    <span className="font-mono text-white w-20 text-right">{it.lineRevenue.toLocaleString()} ₭</span>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">ໝາຍເຫດ</label>
                <input
                  type="text"
                  value={editingBill.notes || ''}
                  onChange={e => setEditingBill({ ...editingBill, notes: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-neutral-800">
                <button type="button" onClick={() => setEditingBill(null)} className="px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400">ຍົກເລີກ</button>
                <button type="submit" className="px-5 py-2 bg-white text-black font-bold rounded-xl">ບັນທຶກແກ້ໄຂ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ເຄຍບິນ POS (SETTLE BILL & PUSH TO DASHBOARD)
          ======================================================== */}
      {settlingBill && (
        <div 
          onPaste={async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                  const base64 = await compressImage(file);
                  setSettlingBill(prev => prev ? ({ ...prev, receiptImage: base64 }) : null);
                }
              }
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" 
          onClick={() => setSettlingBill(null)}
        >
          <div className="bg-[#141414] border border-neutral-800 rounded-3xl p-6 w-full max-w-xl space-y-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
              <div>
                <h3 className="font-serif text-base text-white flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>ເຄຍບິນ POS #{settlingBill.billNo}</span>
                </h3>
                <p className="text-[10px] text-neutral-400">ລູກຄ້າ: {settlingBill.customerName} • ເມື່ອເຄຍແລ້ວຍອດຂາຍຈະຂຶ້ນ Dashboard ທັນທີ</p>
              </div>
              <button onClick={() => setSettlingBill(null)} className="text-neutral-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="border border-neutral-800 rounded-2xl p-3 bg-[#0a0a0a] space-y-3">
                <span className="font-bold text-neutral-300 block">ກວດສອບ: ຂາຍຈິງ vs ຊິມເອງ / ແຖມ</span>
                {settlingBill.items.map((it, idx) => (
                  <div key={idx} className="space-y-1.5 pt-2 border-t border-neutral-850">
                    <div className="flex justify-between text-white font-bold">
                      <span>{it.recipeName}</span>
                      <span className="font-mono text-neutral-400">@{it.pricePerUnit.toLocaleString()} ₭</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-[#141414] rounded-xl flex items-center justify-between border border-neutral-800">
                        <span className="text-emerald-400 font-bold">ຂາຍຈິງ:</span>
                        <input
                          type="number"
                          min="0"
                          value={it.actualSoldQty}
                          onChange={e => {
                            const updated = [...settlingBill.items];
                            updated[idx].actualSoldQty = Number(e.target.value) || 0;
                            setSettlingBill({ ...settlingBill, items: updated });
                          }}
                          className="w-14 bg-[#0a0a0a] border border-neutral-700 rounded px-2 py-0.5 text-center font-mono text-emerald-400 font-bold"
                        />
                      </div>
                      <div className="p-2 bg-[#141414] rounded-xl flex items-center justify-between border border-neutral-800">
                        <span className="text-amber-400 font-bold">ແຖມ/ຊິມ:</span>
                        <input
                          type="number"
                          min="0"
                          value={it.sampleQty}
                          onChange={e => {
                            const updated = [...settlingBill.items];
                            updated[idx].sampleQty = Number(e.target.value) || 0;
                            setSettlingBill({ ...settlingBill, items: updated });
                          }}
                          className="w-14 bg-[#0a0a0a] border border-neutral-700 rounded px-2 py-0.5 text-center font-mono text-amber-400 font-bold"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ວິທີຊຳລະ & ສະລິບ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-400 block mb-1">ຊ່ອງທາງຊຳລະ</label>
                  <select
                    value={settlingBill.paymentMethod}
                    onChange={e => setSettlingBill({ ...settlingBill, paymentMethod: e.target.value as any })}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white font-bold"
                  >
                    <option value="onepay">BCEL One (ໂອນ)</option>
                    <option value="cash">ເງິນສົດ (Cash)</option>
                    <option value="ldb">LDB Trust</option>
                  </select>
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">ສະລິບໂອນ (Ctrl+V)</label>
                  <div className="border border-dashed border-neutral-700 rounded-xl p-2 bg-[#0a0a0a] text-center flex items-center justify-center min-h-[42px]">
                    {settlingBill.receiptImage ? (
                      <span className="text-emerald-400 font-bold">✓ ແນບສະລິບແລ້ວ</span>
                    ) : (
                      <span className="text-neutral-500 text-[11px]">ກົດ Ctrl+V ເພື່ອວາງສະລິບ</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Real Revenue Highlight */}
              {(() => {
                const realRevenue = settlingBill.items.reduce((s, it) => s + (it.actualSoldQty * it.pricePerUnit), 0);
                return (
                  <div className="p-4 bg-[#0a0a0a] border border-neutral-800 rounded-2xl flex justify-between items-center">
                    <div>
                      <span className="text-neutral-400 block">ຍອດຂາຍຕົວຈິງທີ່ຈະເຂົ້າ Dashboard:</span>
                      <span className="text-[10px] text-neutral-500">(ຄິດໄລ່ສະເພາະຈຳນວນທີ່ຂາຍໄດ້ຈິງ)</span>
                    </div>
                    <span className="font-mono text-2xl font-bold text-emerald-400 font-serif">
                      {realRevenue.toLocaleString()} ₭
                    </span>
                  </div>
                );
              })()}

              <div className="pt-2 flex justify-end gap-2 border-t border-neutral-800">
                <button type="button" onClick={() => setSettlingBill(null)} className="px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400">ຍົກເລີກ</button>
                <button
                  type="button"
                  onClick={async () => {
                    const realRevenue = settlingBill.items.reduce((s, it) => s + (it.actualSoldQty * it.pricePerUnit), 0);
                    const today = format(new Date(), 'yyyy-MM-dd');
                    const timeNow = format(new Date(), 'HH:mm');

                    // 1. ບັນທຶກລາຍຮັບຕົວຈິງເຂົ້າ collection 'transactions' (Finance & Dashboard ຈະດຶງໄປສະແດງທັນທີ!)
                    await addDoc(collection(db, 'transactions'), {
                      type: 'income',
                      amount: realRevenue,
                      category: 'ຍອດຂາຍ (POS)',
                      source: settlingBill.paymentMethod,
                      description: `ຍອດຂາຍ POS #${settlingBill.billNo} (${settlingBill.customerName})`,
                      receiptImage: settlingBill.receiptImage || '',
                      date: today,
                      time: timeNow,
                      createdAt: serverTimestamp()
                    });

                    // 2. ອັບເດດບິນ POS ເປັນ settled
                    await updateDoc(doc(db, 'pos_bills', settlingBill.id), {
                      status: 'settled',
                      actualRevenue: realRevenue,
                      items: settlingBill.items,
                      paymentMethod: settlingBill.paymentMethod,
                      receiptImage: settlingBill.receiptImage || '',
                      settledAt: serverTimestamp()
                    });

                    // 3. ອັບເດດໜີ້ AR ໃນ collection 'debts' ເປັນ settled
                    if (settlingBill.debtId) {
                      await updateDoc(doc(db, 'debts', settlingBill.debtId), {
                        status: 'settled',
                        amount: realRevenue,
                        receiptImage: settlingBill.receiptImage || ''
                      });
                    }

                    setSettlingBill(null);
                  }}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <CheckCircle className="w-4 h-4 text-black" />
                  <span>ຢືນຢັນເຄຍບິນ & ເພີ່ມຍອດຂາຍ</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Image Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-xl max-h-[85vh] bg-[#141414] rounded-3xl p-3 border border-neutral-800" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white cursor-pointer">✕</button>
            <img src={previewImage} alt="Receipt" className="w-full h-auto max-h-[80vh] object-contain rounded-2xl" />
          </div>
        </div>
      )}

      {/* In-App Confirm Dialog */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#141414] border border-neutral-800 rounded-3xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-serif text-base text-white">{confirmModal.title}</h3>
            <p className="text-xs text-neutral-400">{confirmModal.message}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmModal(null)} className="px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 text-xs">ຍົກເລີກ</button>
              <button onClick={confirmModal.onConfirm} className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs">ຢືນຢັນ</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
