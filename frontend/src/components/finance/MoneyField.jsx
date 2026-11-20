import { locale, t } from '../../locales/i18n.js';
import React, { useEffect, useId, useRef, useState } from 'react';
import { amountInputError, normalizeAmountInput } from '../../utils/workspaceUi.js';

// Chức năng: Định dạng (formatInitialMoney - Initial Money) phục vụ xử lý dữ liệu trong MoneyField.jsx
function formatInitialMoney(val, allowNegative = false) {
  if (val === '' || val === null || val === undefined) return '';
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val);
  if (!allowNegative && num < 0) return '';
  return new Intl.NumberFormat(locale()).format(num);
}


// Chức năng: Định dạng dòng gợi ý số tiền có dấu chấm phân cách hàng nghìn và đơn vị đọc nhanh (nghìn/triệu/tỷ) để tránh nhập nhầm số 0
export function formatMoneyInputHint(rawValue) {
  if (rawValue === null || rawValue === undefined) return '';
  const trimmed = String(rawValue).trim();
  if (!trimmed) return '';
  const neg = trimmed.startsWith('-');
  const digits = (neg ? trimmed.slice(1) : trimmed).replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(digits)) return '';
  const num = Number(digits);
  if (!Number.isSafeInteger(num)) return '';
  const formatted = new Intl.NumberFormat('vi-VN').format(neg ? -num : num);
  let shortUnit = '';
  if (num >= 1000000000) {
    const val = (num / 1000000000).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
    shortUnit = ` (${neg ? '-' : ''}${val} tỷ)`;
  } else if (num >= 1000000) {
    const val = (num / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
    shortUnit = ` (${neg ? '-' : ''}${val} triệu)`;
  } else if (num >= 1000) {
    const val = (num / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
    shortUnit = ` (${neg ? '-' : ''}${val} nghìn)`;
  }
  return `= ${formatted} VND${shortUnit}`;
}

// Chức năng: Ô nhập số tiền VND thông minh: tự động định dạng dấu chấm phân cách hàng nghìn và kiểm tra giới hạn trần
export default function MoneyField({
  name,
  label,
  defaultValue = '',
  max,
  required = true,
  allowNegative = false,
  onValueChange,
}) {
  const [value, setValue] = useState(() => formatInitialMoney(defaultValue, allowNegative));
  const ref = useRef(null);
  const id = useId();

  useEffect(() => {
    setValue(formatInitialMoney(defaultValue, allowNegative));
  }, [defaultValue, allowNegative]);

  const rawTrimmed = String(value ?? '').trim();
  const isNeg = allowNegative && rawTrimmed.startsWith('-');
  const absRaw = isNeg ? rawTrimmed.slice(1).trim() : rawTrimmed;
  const absNormalized = rawTrimmed === '0' ? '0' : normalizeAmountInput(absRaw);
  const normalized =
    absNormalized === null
      ? null
      : absNormalized === ''
        ? ''
        : isNeg && absNormalized !== '0'
          ? `-${absNormalized}`
          : absNormalized;

  const error =
    rawTrimmed === ''
      ? ''
      : allowNegative && (rawTrimmed === '0' || (absNormalized !== null && absNormalized !== ''))
        ? ''
        : amountInputError(absRaw, max);

  const validationMessage = t(error);
  useEffect(() => {
    ref.current?.setCustomValidity(validationMessage);
  }, [validationMessage]);

  return (
    <label className="money-field">
      <span className="field-label-inline">
        {t(label)}
        {required && <span className="required-mark" aria-hidden="true">*</span>}
      </span>
      <span className="money-input">
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          aria-label={t(label)}
          value={value}
          aria-describedby={error ? id : undefined}
          onChange={event => {
            const nextValue = event.target.value;
            const nextTrim = String(nextValue ?? '').trim();
            const nextNeg = allowNegative && nextTrim.startsWith('-');
            const nextAbs = nextNeg ? nextTrim.slice(1).trim() : nextTrim;
            const nextErr =
              nextTrim === '' || (allowNegative && nextTrim === '0')
                ? ''
                : amountInputError(nextAbs, max);
            event.currentTarget.setCustomValidity(t(nextErr));
            setValue(nextValue);
            const normAbs = normalizeAmountInput(nextAbs);
            onValueChange?.(
              normAbs && nextNeg && normAbs !== '0' ? `-${normAbs}` : normAbs
            );
          }}
          onBlur={() => {
            if (normalized !== null && normalized !== '' && !error) {
              setValue(new Intl.NumberFormat(locale()).format(Number(normalized)));
            }
          }}
        />
        <span>VND</span>
      </span>
      <input type="hidden" name={name} value={normalized ?? ''} />
      {!error && normalized !== null && normalized !== '' && (
        <small className="field-hint" style={{ color: '#1558c9', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {formatMoneyInputHint(normalized)}
        </small>
      )}
      {error && (
        <small id={id} className="field-hint is-error" role="alert">
          {t(error)}
        </small>
      )}
    </label>
  );
}
