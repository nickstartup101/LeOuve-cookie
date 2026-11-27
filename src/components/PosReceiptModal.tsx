import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toBlob } from 'html-to-image';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Copy,
  MapPin,
  Phone,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Wifi,
  X
} from 'lucide-react';

type ReceiptMode = 'RECEIPT' | 'VOID' | 'REFUND';

interface ReceiptSettings {
  brandName: string;
  address: string;
  phone: string;
  website: string;
  thankYou: string;
  wifiName: string;
  wifiPassword: string;
  notice: string;
  barcodeCaption: string;
}

interface PosReceiptModalProps {
  bill: any | null;
  onClose: () => void;
}

const SETTINGS_KEY = 'leouve_receipt_template_v1';
const LEGACY_SETTINGS_KEY = 'leOuveReceiptSettings';

const DEFAULT_SETTINGS: ReceiptSettings = {
  brandName: 'Le Ouve',
  address: 'Vientiane, Lao PDR',
  phone: '',
  website: '',
  thankYou: 'THANK YOU FOR SUPPORTING LE OUVE',
  wifiName: '',
  wifiPassword: '',
  notice: 'Please check your items before leaving.',
  barcodeCaption: 'LE OUVE WORKSPACE • {billNo}'
};

const TOP_EDGE_PATH = 'M0 0 L10 8 L20 0 L30 8 L40 0 L50 8 L60 0 L70 8 L80 0 L90 8 L100 0 L110 8 L120 0 L130 8 L140 0 L150 8 L160 0 L170 8 L180 0 L190 8 L200 0 L210 8 L220 0 L230 8 L240 0 L250 8 L260 0 L270 8 L280 0 L290 8 L300 0 L310 8 L320 0 L330 8 L340 0 L350 8 L360 0 L370 8 L380 0 L390 8 L400 0 V20 H0 Z';
const BOTTOM_EDGE_PATH = 'M0 0 H400 L390 12 L380 20 L370 12 L360 20 L350 12 L340 20 L330 12 L320 20 L310 12 L300 20 L290 12 L280 20 L270 12 L260 20 L250 12 L240 20 L230 12 L220 20 L210 12 L200 20 L190 12 L180 20 L170 12 L160 20 L150 12 L140 20 L130 12 L120 20 L110 12 L100 20 L90 12 L80 20 L70 12 L60 20 L50 12 L40 20 L30 12 L20 20 L10 12 L0 20 Z';

const loadReceiptSettings = (): ReceiptSettings => {
  try {
    const saved = window.localStorage.getItem(SETTINGS_KEY)
      || window.localStorage.getItem(LEGACY_SETTINGS_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Unable to load receipt settings:', error);
    return DEFAULT_SETTINGS;
  }
};

const formatMoney = (value: number, mode: ReceiptMode) => {
  const amount = Math.round(Math.abs(Number(value) || 0)).toLocaleString();
  return `${mode === 'REFUND' ? '-' : ''}${amount} ₭`;
};

const formatBreakdownMoney = (value: number, mode: ReceiptMode, sign: 'negative' | 'positive') => {
  const amount = Math.round(Math.abs(Number(value) || 0)).toLocaleString();
  if (Number(value) === 0) return `0 ₭`;
  if (mode === 'REFUND') return `-${amount} ₭`;
  return `${sign === 'negative' ? '-' : '+'}${amount} ₭`;
};

const saveAs = (blob: Blob, fileName: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

const Barcode = ({ value }: { value: string }) => {
  const bits = useMemo(() => {
    const encoded = `*${value || 'NO-BILL'}*`;
    return Array.from(encoded).flatMap(character => [
      ...character.charCodeAt(0).toString(2).padStart(8, '0'),
      '0'
    ]);
  }, [value]);
  const width = bits.length * 2;

  return (
    <svg
      role="img"
      aria-label={`Barcode for ${value}`}
      viewBox={`0 0 ${width} 38`}
      className="mx-auto h-12 w-full max-w-[250px]"
      preserveAspectRatio="none"
    >
      <rect width={width} height="38" fill="#ffffff" />
      {bits.map((bit, index) => bit === '1' ? (
        <rect key={index} x={index * 2} y="2" width="1.25" height="32" fill="#1a1a1a" />
      ) : null)}
    </svg>
  );
};

const POSReceiptModal = ({ bill, onClose }: PosReceiptModalProps) => {
  const [mode, setMode] = useState<ReceiptMode>('RECEIPT');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ReceiptSettings>(loadReceiptSettings);
  const [copyFeedback, setCopyFeedback] = useState<'copied' | 'downloaded' | 'error' | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [templateFeedback, setTemplateFeedback] = useState<'saved' | 'error' | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const copyFeedbackTimeout = useRef<number | null>(null);
  const templateFeedbackTimeout = useRef<number | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Unable to save receipt settings:', error);
    }
  }, [settings]);

  useEffect(() => () => {
    if (copyFeedbackTimeout.current !== null) {
      window.clearTimeout(copyFeedbackTimeout.current);
    }
    if (templateFeedbackTimeout.current !== null) {
      window.clearTimeout(templateFeedbackTimeout.current);
    }
  }, []);

  useEffect(() => {
    if (!bill) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bill, onClose]);

  const items = (bill?.items || []).map((item: any) => {
    const quantity = Number(item.actualSoldQty ?? item.soldQty ?? item.producedQty ?? 0);
    const unitPrice = Number(item.finalPrice ?? item.discountedPrice ?? item.sellingPrice ?? 0);
    const originalUnitPrice = Number(
      item.originalPrice ?? item.originalSellingPrice ?? item.regularPrice ?? unitPrice
    );
    return {
      ...item,
      quantity,
      unitPrice,
      originalUnitPrice,
      lineTotal: quantity * unitPrice,
      lineDiscount: quantity * Math.max(0, originalUnitPrice - unitPrice)
    };
  });
  const calculatedSubtotal = items.reduce((sum: number, item: any) => sum + item.quantity * item.originalUnitPrice, 0);
  const calculatedDiscount = items.reduce((sum: number, item: any) => sum + item.lineDiscount, 0);
  const subtotal = Number(bill?.subtotal ?? calculatedSubtotal);
  const discount = Number(bill?.discountAmount ?? bill?.discount ?? calculatedDiscount);
  const tax = Number(bill?.taxAmount ?? bill?.tax ?? bill?.vat ?? 0);
  const fallbackTotal = subtotal - discount + tax;
  const total = Number(
    bill?.status === 'settled' && bill.actualRevenue !== undefined
      ? bill.actualRevenue
      : bill?.totalRevenue ?? fallbackTotal
  );
  const isPaid = bill?.status === 'settled';
  const note = bill?.notes || bill?.orderNote || bill?.remark || '';
  const billNo = String(bill?.billNo || 'NO-BILL');
  const barcodeCaption = settings.barcodeCaption.replace(/\{billNo\}/g, billNo);

  const showTemplateFeedback = (feedback: 'saved' | 'error') => {
    if (templateFeedbackTimeout.current !== null) {
      window.clearTimeout(templateFeedbackTimeout.current);
    }
    setTemplateFeedback(feedback);
    templateFeedbackTimeout.current = window.setTimeout(() => {
      setTemplateFeedback(null);
      templateFeedbackTimeout.current = null;
    }, 2500);
  };

  const handleSaveTemplate = () => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      showTemplateFeedback('saved');
    } catch (error) {
      console.error('Unable to save receipt template:', error);
      showTemplateFeedback('error');
    }
  };

  const handleResetTemplate = () => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
      setSettings(DEFAULT_SETTINGS);
      showTemplateFeedback('saved');
    } catch (error) {
      console.error('Unable to reset receipt template:', error);
      showTemplateFeedback('error');
    }
  };

  const showTemporaryCopyFeedback = (feedback: 'copied' | 'downloaded' | 'error') => {
    if (copyFeedbackTimeout.current !== null) {
      window.clearTimeout(copyFeedbackTimeout.current);
    }
    setCopyFeedback(feedback);
    copyFeedbackTimeout.current = window.setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackTimeout.current = null;
    }, 2000);
  };

  const handleCopyAsImage = async () => {
    const receiptElement = receiptRef.current;
    if (!receiptElement) {
      console.error('Unable to copy POS receipt: receipt element is not available.');
      showTemporaryCopyFeedback('error');
      return;
    }

    setIsCopying(true);
    try {
      const blob = await toBlob(receiptElement, { pixelRatio: 3 });
      if (!blob) {
        throw new Error('Receipt image conversion returned an empty blob.');
      }

      const safeBillNo = billNo.replace(/[^\w.-]+/g, '_');
      const fileName = `${safeBillNo}_receipt.png`;
      if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') {
        saveAs(blob, fileName);
        showTemporaryCopyFeedback('downloaded');
        return;
      }

      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showTemporaryCopyFeedback('copied');
      } catch (error) {
        console.warn('Clipboard image write failed; downloading the receipt PNG instead.', error);
        saveAs(blob, fileName);
        showTemporaryCopyFeedback('downloaded');
      }
    } catch (error) {
      console.error('Unable to create POS receipt image:', error);
      showTemporaryCopyFeedback('error');
    } finally {
      setIsCopying(false);
    }
  };

  const settingFields: Array<{ key: keyof ReceiptSettings; label: string; multiline?: boolean }> = [
    { key: 'brandName', label: 'Brand name' },
    { key: 'address', label: 'Shop address' },
    { key: 'phone', label: 'Phone number' },
    { key: 'website', label: 'Website URL' },
    { key: 'thankYou', label: 'Thank-you message' },
    { key: 'wifiName', label: 'Wi-Fi name' },
    { key: 'wifiPassword', label: 'Wi-Fi password' },
    { key: 'notice', label: 'Return / check policy', multiline: true },
    { key: 'barcodeCaption', label: 'ຂໍ້ຄວາມກ້ອງ Barcode (Barcode Caption)' }
  ];

  return (
    <AnimatePresence>
      {bill && (
        <motion.div
          className="receipt-print-root fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={event => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <div className="receipt-print-stage flex max-h-[96vh] w-full max-w-5xl flex-col items-center gap-3 overflow-y-auto lg:flex-row lg:items-start lg:justify-center">
            <section className="receipt-print-paper-wrap relative w-full max-w-[400px] shrink-0 pt-3">
              <div className="receipt-print-controls mb-3 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-white/10 p-2 text-[10px] font-bold text-white">
                {([
                  ['RECEIPT', Receipt],
                  ['VOID', Ban],
                  ['REFUND', RotateCcw]
                ] as const).map(([receiptMode, Icon]) => (
                  <button
                    key={receiptMode}
                    type="button"
                    onClick={() => setMode(receiptMode)}
                    aria-pressed={mode === receiptMode}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 transition ${
                      mode === receiptMode ? 'bg-white text-[#4f0303]' : 'text-white/80 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {receiptMode}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowSettings(open => !open)}
                  aria-expanded={showSettings}
                  className={`rounded-xl p-2 transition ${showSettings ? 'bg-white text-[#4f0303]' : 'text-white hover:bg-white/10'}`}
                  aria-label="Receipt settings"
                  title="Receipt settings"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-xl bg-[#4f0303] p-2 text-white transition hover:bg-[#680404]"
                  aria-label="Print receipt"
                  title="Print receipt"
                >
                  <Printer className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCopyAsImage}
                  disabled={isCopying}
                  aria-label="Copy receipt as image"
                  aria-busy={isCopying}
                  className={`inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-2 transition hover:bg-[#faf9f6] disabled:cursor-wait disabled:opacity-70 ${
                    copyFeedback === 'copied' || copyFeedback === 'downloaded' ? 'text-emerald-700' : 'text-[#4f0303]'
                  }`}
                  title="Copy as Image / ກັອບປີ້ເປັນຮູບພາບ"
                >
                  {copyFeedback === 'copied' || copyFeedback === 'downloaded'
                    ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                    : copyFeedback === 'error'
                      ? <AlertCircle className="h-4 w-4 shrink-0" />
                      : <Copy className="h-4 w-4 shrink-0" />}
                  <span className="text-[9px] leading-tight">
                    {isCopying
                      ? 'Preparing PNG...'
                      : copyFeedback === 'copied'
                        ? 'Copied Image / ກັອບແລ້ວ'
                        : copyFeedback === 'downloaded'
                          ? 'Image Downloaded / ດາວໂຫຼດແລ້ວ'
                          : copyFeedback === 'error'
                            ? 'Copy Failed / ກັອບບໍ່ສຳເລັດ'
                            : 'Copy as Image / ກັອບປີ້ເປັນຮູບພາບ'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-white transition hover:bg-white/10"
                  aria-label="Close receipt"
                  title="Close receipt"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div ref={receiptRef} className="receipt-image-frame">
                <article
                    className="receipt-paper relative overflow-visible bg-white px-6 pb-7 pt-4 text-[#1a1a1a] shadow-2xl"
                    style={{ fontFamily: "'Plus Jakarta Sans', 'Noto Sans Lao', sans-serif" }}
                  >
                  <svg className="absolute left-0 top-0 h-3 w-full -translate-y-full" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true">
                    <path d={TOP_EDGE_PATH} fill="#ffffff" />
                  </svg>
                  <svg className="absolute bottom-0 left-0 h-3 w-full translate-y-full" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true">
                    <path d={BOTTOM_EDGE_PATH} fill="#ffffff" />
                  </svg>

                  <div className="text-center">
                    <h1 className="text-4xl leading-none text-[#4f0303]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                      {settings.brandName || 'Le Ouve'}
                    </h1>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.28em] text-[#404040]">
                      BAKERY &amp; CAFE ATELIER
                    </p>
                    <div className="mt-3 space-y-1 text-[10px] text-[#404040]">
                      {settings.address && (
                        <p className="flex items-center justify-center gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0 text-[#4f0303]" />
                          {settings.address}
                        </p>
                      )}
                      {settings.phone && (
                        <p className="flex items-center justify-center gap-1.5 font-mono">
                          <Phone className="h-3 w-3 shrink-0 text-[#4f0303]" />
                          {settings.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="my-4 border-t border-dotted border-[#e8e5e0]" />

                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 pb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-[#404040]">
                    <span>PURCHASED ITEMS</span>
                    <span>QTY</span>
                    <span className="text-right">PRICE</span>
                  </div>

                  <div className="space-y-3">
                    {items.map((item: any, index: number) => (
                      <div key={`${item.id || item.menuName || 'item'}-${index}`} className="grid grid-cols-[1fr_auto_auto] items-start gap-3">
                        <div className="flex min-w-0 gap-2">
                          <span className="flex h-6 w-7 shrink-0 items-center justify-center rounded-md bg-[#4f0303] font-mono text-[10px] font-bold text-white">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <p className="break-words text-[12px] font-bold leading-snug">{item.menuName || 'Menu item'}</p>
                            {(item.description || item.notes || item.note) && (
                              <p className="mt-0.5 whitespace-pre-wrap text-[9px] leading-snug text-[#666666]">
                                {item.description || item.notes || item.note}
                              </p>
                            )}
                            <p className="mt-1 text-[9px] text-[#666666]">Amount: {item.quantity}</p>
                          </div>
                        </div>
                        <span className="pt-1 font-mono text-[10px]">{item.quantity}</span>
                        <span className="whitespace-nowrap pt-1 text-right font-mono text-[10px]">
                          {item.originalUnitPrice > item.unitPrice && (
                            <span className="mr-1 text-[9px] text-[#888888] line-through">
                              {formatMoney(item.originalUnitPrice * item.quantity, mode)}
                            </span>
                          )}
                          <strong className="font-bold">{formatMoney(item.lineTotal, mode)}</strong>
                        </span>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <p className="py-3 text-center text-xs text-[#666666]">No purchased items</p>
                    )}
                  </div>

                  {note && (
                    <p className="mt-3 whitespace-pre-wrap border-l-2 border-[#4f0303] pl-2 text-[9px] italic text-[#555555]">
                      {note}
                    </p>
                  )}

                  <div className="my-4 border-t border-dotted border-[#e8e5e0]" />

                  <div className="space-y-1.5 font-mono text-[10px]">
                    <div className="flex justify-between text-[#404040]">
                      <span>SUBTOTAL</span>
                      <span>{formatMoney(subtotal, mode)}</span>
                    </div>
                    <div className="flex justify-between text-[#404040]">
                      <span>DISCOUNT (-)</span>
                      <span>{formatBreakdownMoney(discount, mode, 'negative')}</span>
                    </div>
                    <div className="flex justify-between text-[#404040]">
                      <span>TAX / VAT (+)</span>
                      <span>{formatBreakdownMoney(tax, mode, 'positive')}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t-2 border-[#4f0303] pt-2 text-sm font-black text-[#4f0303]">
                      <span>TOTAL AMOUNT</span>
                      <span>{formatMoney(total, mode)}</span>
                    </div>
                  </div>

                  <div className="my-4 border-t border-dotted border-[#e8e5e0]" />

                  <div className="space-y-1 font-mono text-[9px] text-[#404040]">
                    <div className="flex justify-between gap-2"><span>DATE / TIME</span><span className="text-right">{bill.date || ''} {bill.time || ''}</span></div>
                    <div className="flex justify-between gap-2"><span>BILL NO.</span><span>{billNo}</span></div>
                    <div className="flex justify-between gap-2"><span>CUSTOMER</span><span className="max-w-[65%] truncate text-right">{bill.customerName || 'Walk-in'}</span></div>
                    <div className="flex justify-between gap-2"><span>PAYMENT</span><span className="uppercase">{bill.paymentMethod || 'N/A'}</span></div>
                    <div className="mt-2 flex items-center justify-center gap-1.5 border border-dotted border-[#e8e5e0] py-1.5 font-sans text-[9px] font-bold">
                      {isPaid
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-[#4f0303]" />
                        : <Ban className="h-3.5 w-3.5 text-[#4f0303]" />}
                      <span className="tracking-wider">{isPaid ? 'PAID' : 'PAYMENT PENDING'}</span>
                    </div>
                  </div>

                  <div className="mt-4 text-center">
                    <Barcode value={billNo} />
                    <p className="mt-1 break-all font-mono text-[8px] tracking-[0.12em] text-[#404040]">
                      {barcodeCaption}
                    </p>
                  </div>

                  <footer className="mt-4 space-y-2 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#4f0303]">{settings.thankYou}</p>
                    {(settings.wifiName || settings.wifiPassword) && (
                      <p className="flex items-center justify-center gap-1.5 text-[9px] text-[#404040]">
                        <Wifi className="h-3 w-3 text-[#4f0303]" />
                        <span>{settings.wifiName && `Wi-Fi: ${settings.wifiName}`}</span>
                        <span>{settings.wifiPassword && `PW: ${settings.wifiPassword}`}</span>
                      </p>
                    )}
                    {settings.notice && <p className="text-[9px] leading-relaxed text-[#404040]">{settings.notice}</p>}
                    {settings.website && <p className="font-mono text-[9px] text-[#4f0303]">{settings.website}</p>}
                  </footer>

                  {mode !== 'RECEIPT' && (
                    <div
                      className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap border-4 border-dashed border-[#4f0303] bg-white/80 px-5 py-2 text-center font-mono text-lg font-black text-[#4f0303]"
                      style={{ transform: `translate(-50%, -50%) rotate(-13deg)` }}
                    >
                      {mode === 'VOID' ? 'VOIDED • ຍົກເລີກ' : 'REFUNDED • ສົ່ງເງິນຄືນ'}
                    </div>
                  )}
                </article>
              </div>
            </section>

            {showSettings && (
              <aside className="receipt-print-controls w-full max-w-[340px] rounded-2xl border border-[#e8e5e0] bg-white p-5 text-[#1a1a1a] shadow-2xl">
                <div className="mb-4 flex items-center justify-between border-b border-[#e8e5e0] pb-3">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <SlidersHorizontal className="h-4 w-4 text-[#4f0303]" />
                    Receipt details
                  </h2>
                  <button type="button" onClick={() => setShowSettings(false)} aria-label="Close settings">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[70vh] space-y-3 overflow-y-auto">
                  {settingFields.map(field => (
                    <label key={field.key} className="block text-[10px] font-bold uppercase tracking-wide text-[#555555]">
                      {field.label}
                      {field.multiline ? (
                        <textarea
                          value={settings[field.key]}
                          onChange={event => setSettings(current => ({ ...current, [field.key]: event.target.value }))}
                          rows={2}
                          className="mt-1 w-full resize-y rounded-lg border border-[#e8e5e0] bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-[#1a1a1a] outline-none focus:border-[#4f0303]"
                        />
                      ) : (
                        <input
                          value={settings[field.key]}
                          onChange={event => setSettings(current => ({ ...current, [field.key]: event.target.value }))}
                          placeholder={field.key === 'barcodeCaption' ? 'LE OUVE ATELIER • {billNo}' : undefined}
                          className="mt-1 w-full rounded-lg border border-[#e8e5e0] bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-[#1a1a1a] outline-none focus:border-[#4f0303]"
                        />
                      )}
                    </label>
                  ))}
                  <div className="space-y-2 border-t border-[#e8e5e0] pt-3">
                    <button
                      type="button"
                      onClick={handleSaveTemplate}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4f0303] px-3 py-2.5 text-center text-[10px] font-bold text-white transition hover:bg-[#680404]"
                    >
                      {templateFeedback === 'saved'
                        ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                        : <Save className="h-4 w-4 shrink-0" />}
                      <span>
                        {templateFeedback === 'saved'
                          ? 'ບັນທຶກສຳເລັດ'
                          : 'ບັນທຶກເປັນ Template ຖາວອນ (Save Template)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetTemplate}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e8e5e0] bg-[#faf9f6] px-3 py-2 text-center text-[10px] font-bold text-[#4f0303] transition hover:bg-[#f4f3f0]"
                    >
                      <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                      <span>ຄືນຄ່າເລີ່ມຕົ້ນ (Reset Default)</span>
                    </button>
                    {templateFeedback === 'error' && (
                      <p role="alert" className="text-center text-[10px] font-semibold text-[#4f0303]">
                        Unable to save receipt template.
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default POSReceiptModal;
