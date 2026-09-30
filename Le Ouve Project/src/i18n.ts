import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  la: {
    translation: {
      sync_supplier_data: "ບັນທຶກລາຄາຈາກຜູ້ສະໜອງ",
      product_resource: "ຊື່ສິນຄ້າ / ວັດຖຸດິບ",
      search_params: "ຄົ້ນຫາ...",
      database_items: "ລາຍການໃນຖານຂໍ້ມູນ",
      common_resources: "ວັດຖຸດິບຍອດນິຍົມ",
      supplier: "ຜູ້ສະໜອງ (ຮ້ານຄ້າ)",
      currency: "ສະກຸນເງິນ",
      price_original: "ລາຄາຊື້ຕົວຈິງ",
      exchange_rate: "ອັດຕາແລກປ່ຽນ",
      remark: "ໝາຍເຫດ",
      qty_unit: "ຈຳນວນ & ຫົວໜ່ວຍ",
      converted_price: "ລາຄາຄິດໄລ່",
      commit_record: "ບັນທຶກລົງຖານຂໍ້ມູນ",
      active_pricing_index: "ດັດຊະນີລາຄາຜູ້ສະໜອງ",
      live_feed: "ຂໍ້ມູນສົດ",
      transaction_date: "ວັນທີຊື້",
      resource_identifier: "ວັດຖຸດິບ",
      origin_supplier: "ຮ້ານຄ້າ",
      valuation_lak: "ມູນຄ່າ (ກີບ)",
      units: "ຈຳນວນ",
      ops: "ຈັດການ",
      select_item: "ເລືອກ",
      night_mode: "ໂໝດກາງຄືນ (Dark Mode)",
      lao: "ພາສາລາວ",
      english: "English",
      activity_log: "ປະຫວັດການເຄື່ອນໄຫວ",
      item_name: "ຊື່ລາຍການ",
      reset_financials_title: "ຣີເຊັດຂໍ້ມູນການເງິນ",
      reset_financials_desc: "ລຶບປະຫວັດທຸລະກຳ ແລະ ຍອດສະຫຼຸບລາຍວັນທັງໝົດອອກຈາກລະບົບ",
      reset_btn: "ຣີເຊັດຂໍ້ມູນການເງິນທັງໝົດ",
      reset_success: "ຣີເຊັດຂໍ້ມູນການເງິນສຳເລັດແລ້ວ!",
      cancel: "ຍົກເລີກ"
    }
  },
  en: {
    translation: {
      sync_supplier_data: "Sync Supplier Pricing Data",
      product_resource: "Product Resource",
      search_params: "Search parameters...",
      database_items: "Database Items",
      common_resources: "Common Resources",
      supplier: "Supplier / Vendor",
      currency: "Currency",
      price_original: "Sticker Price",
      exchange_rate: "Exchange Rate",
      remark: "Remark",
      qty_unit: "Quantity & Packing Unit",
      converted_price: "Converted Amount",
      commit_record: "Commit Record",
      active_pricing_index: "Active Pricing Index",
      live_feed: "Live Feed",
      transaction_date: "Purchase Date",
      resource_identifier: "Material Name",
      origin_supplier: "Supplier",
      valuation_lak: "Valuation (LAK)",
      units: "Quantity",
      ops: "Actions",
      select_item: "Select",
      night_mode: "Night Mode (Dark)",
      lao: "ພາສາລາວ",
      english: "English",
      activity_log: "Recent Activity Log",
      item_name: "Item Identity",
      reset_financials_title: "Reset Financial Records",
      reset_financials_desc: "Clear all past transactions and daily balance summaries completely.",
      reset_btn: "Reset All Financial Records",
      reset_success: "Financial data reset successfully!",
      cancel: "Cancel"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'la', // Default ເປັນພາສາລາວ
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
