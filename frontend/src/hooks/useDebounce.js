import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook trì hoãn giá trị đầu vào (Debounce Value) dùng cho tất cả ô tìm kiếm và bộ lọc.
 * - Khi người dùng xóa trắng (`value === ''`) hoặc đặt lại bộ lọc về mặc định (`delay <= 0`),
 *   giá trị được cập nhật ngay lập tức để trải nghiệm xóa bộ lọc phản hồi tức thì.
 * - Khi người dùng đang gõ phím hoặc chuyển đổi bộ lọc liên tục, trì hoãn `delay` ms (mặc định 300ms)
 *   trước khi kích hoạt tính toán lọc bảng và gọi RESTful API.
 */
export function useDebouncedValue(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    if (value === '' || delay <= 0) {
      setDebouncedValue(value);
      return undefined;
    }
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook trì hoãn hàm xử lý sự kiện (Debounced Callback) với cơ chế tự động hủy timer khi unmount.
 */
export function useDebouncedCallback(callback, delay = 300) {
  const callbackRef = useRef(callback);
  const timerRef = useRef(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        callbackRef.current?.(...args);
      }, delay);
    },
    [delay]
  );
}

export default useDebouncedValue;
