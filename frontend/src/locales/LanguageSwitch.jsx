import React, { useSyncExternalStore } from 'react';
import { Globe2 } from 'lucide-react';
import { getLanguage, setLanguage, subscribeLanguage, t } from './i18n.js';

export default function LanguageSwitch() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
  return (
    <div className="language-switch" role="group" aria-label={t('Lựa chọn ngôn ngữ')}>
      <Globe2 size={15} aria-hidden="true" />
      <button type="button" lang="vi" title="Tiếng Việt" aria-label="Tiếng Việt" aria-pressed={language === 'vi'} onClick={() => setLanguage('vi')}>VI</button>
      <button type="button" lang="en" title="English" aria-label="English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
    </div>
  );
}
