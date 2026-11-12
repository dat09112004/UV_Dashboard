import { locale, t } from '../../locales/i18n.js';
import React, { useEffect, useId, useRef, useState } from 'react';
import { amountInputError, normalizeAmountInput } from '../../utils/workspaceUi.js';

export default function MoneyField({ name, label, defaultValue = '', max, required = true, onValueChange }) {
  const [value, setValue] = useState(defaultValue === '' ? '' : new Intl.NumberFormat(locale()).format(defaultValue));
  const ref = useRef(null);
  const id = useId();
  const normalized = normalizeAmountInput(value);
  const error = amountInputError(value, max);
  const validationMessage = t(error);
  useEffect(() => { ref.current?.setCustomValidity(validationMessage); }, [validationMessage]);
  return <label className="money-field">
    <span className="field-label-inline">{t(label)}{required && <span className="required-mark" aria-hidden="true">*</span>}</span>
    <span className="money-input"><input ref={ref} type="text" inputMode="numeric" autoComplete="off" required={required} aria-label={t(label)} value={value}
      aria-describedby={id} placeholder={t("Ví dụ: 25.000.000")} onChange={event => {
        const nextValue = event.target.value;
        event.currentTarget.setCustomValidity(t(amountInputError(nextValue, max)));
        setValue(nextValue);
        onValueChange?.(normalizeAmountInput(nextValue));
      }}
      onBlur={() => { if (normalized && !error) setValue(new Intl.NumberFormat(locale()).format(Number(normalized))); }} /><span>VND</span></span>
    <input type="hidden" name={name} value={normalized ?? ''} />
    <small id={id} className={error ? 'field-hint is-error' : 'field-hint'}>{t(error || (normalized && Number.isSafeInteger(Number(normalized)) ? `${new Intl.NumberFormat(locale()).format(Number(normalized))} VND` : 'Có thể nhập hoặc dán số tiền có dấu phân cách.'))}</small>
  </label>;
}
