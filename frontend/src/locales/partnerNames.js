// English display names for known partners. Use the source names for identity
// and replace these labels with registered English names when supplied.
const englishNames = new Map([
  ['CÔNG TY TNHH SẢN XUẤT TM TỔNG HỢP II', 'Tong Hop II Manufacturing and Trading Co., Ltd.'],
  ['CTY SX TM TỔNG HỢP II', 'Tong Hop II Manufacturing and Trading Co., Ltd.'],
  ['MOC LAM PHAT', 'Moc Lam Phat Household Business'],
  ['HKD MỘC LAM PHÁT', 'Moc Lam Phat Household Business'],
  ['CÔNG TY TNHH MTV MAY THIÊN DUYÊN', 'Thien Duyen Garment Single-Member Co., Ltd.'],
  ['MAY THIÊN DUYÊN', 'Thien Duyen Garment Single-Member Co., Ltd.'],
  ['CÔNG TY TNHH MTV MAY MẶC NHẬT LONG ANH', 'Nhat Long Anh Garment Single-Member Co., Ltd.'],
  ['HKD NGUYỄN VĂN QUYẾT', 'Nguyen Van Quyet Household Business'],
  ['CÔNG TY TNHH SẢN XUẤT TM THIÊN TƯỜNG', 'Thien Tuong Manufacturing and Trading Co., Ltd.'],
  ['CÔNG TY TNHH ĐẠI TOÀN PHÚ', 'Dai Toan Phu Co., Ltd.'],
  ['CÔNG TY TNHH ALDY HUTA', 'Aldy Huta Co., Ltd.'],
  ['CÔNG TY TNHH ALDY HUTA & HUBEI ROCKY', 'Aldy Huta Co., Ltd. & Hubei Rocky'],
]);

// Chức năng: Xử lý nghiệp vụ (englishPartnerName - Partner Name) phục vụ xử lý dữ liệu trong partnerNames.js
export function englishPartnerName(value) {
  // Chức năng: Xử lý nghiệp vụ (lookup - lookup) phục vụ xử lý dữ liệu trong partnerNames.js
  const lookup = name => englishNames.get(name.normalize('NFC').toLocaleUpperCase('vi-VN'));
  const direct = lookup(value);
  if (direct) return direct;
  const coded = /^(\d+\s*[-–]\s*)(.+)$/.exec(value);
  if (!coded) return undefined;
  const name = lookup(coded[2]);
  return name ? coded[1] + name : undefined;
}
