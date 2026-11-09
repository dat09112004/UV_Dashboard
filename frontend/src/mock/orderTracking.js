// Chỉ bổ sung trường chưa có trong nguồn; không suy ra SL đặt hoặc xác nhận giao từ doanh thu/số bán.
export const EMPTY_ORDER_TRACKING = Object.freeze({
  orderedQty: null,
  deliveredQty: null,
  unit: '',
  expectedReceiptDate: '',
  actualDeliveryDate: '',
});
