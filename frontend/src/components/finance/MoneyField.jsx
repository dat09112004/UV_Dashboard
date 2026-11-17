import { locale, t } from '../../locales/i18n.js';
import React, { useEffect, useId, useRef, useState } from 'react';
import { amountInputError, normalizeAmountInput } from '../../utils/workspaceUi.js';

function formatInitialMoney(val, allowNegative = false) {
  if (val === '' || val === null || val === undefined) return '';
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val);
  if (!allowNegative && num < 0) return '';
  return new Intl.NumberFormat(locale()).format(num);
}

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
          placeholder={t("0")}
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
      {error && (
        <small id={id} className="field-hint is-error" role="alert">
          {t(error)}
        </small>
      )}
    </label>
  );
}
