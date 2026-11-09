import { phrase, t } from './i18n.js';

// Let the browser enforce the input constraints, with messages in the app's language.
export function localizeInvalidInput(event) {
  const field = event.target;
  if (!field.setCustomValidity) return;
  field.setCustomValidity('');
  const validity = field.validity;
  if (validity.valid) return;
  const message = validity.valueMissing
    ? t(field.tagName === 'SELECT' ? 'Vui lòng chọn một mục.' : 'Vui lòng điền trường này.')
    : validity.typeMismatch && field.type === 'email'
      ? t('Vui lòng nhập địa chỉ email hợp lệ.')
      : validity.badInput ? t('Vui lòng nhập một số hợp lệ.')
        : validity.rangeUnderflow ? phrase('Giá trị phải từ § trở lên.', field.min)
          : validity.rangeOverflow ? phrase('Giá trị không được vượt §.', field.max)
            : validity.stepMismatch ? t('Vui lòng nhập giá trị đúng bước quy định.')
              : t('Giá trị đã nhập không hợp lệ.');
  field.setCustomValidity(message);
}

export function clearLocalizedValidation(event) {
  event.target.setCustomValidity?.('');
}
