import LanguageSwitch from '../../locales/LanguageSwitch.jsx';
import { t } from '../../locales/i18n.js';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Package, TrendingUp, Wallet, CreditCard, Users, ClipboardList, Clock3, Sheet, MoreHorizontal, ChevronDown, BellRing } from 'lucide-react';
import { canOpenSection, homeSection } from '../../utils/roles.js';
import AccountMenu from '../../features/auth/components/AccountMenu.jsx';

export const NAV_ITEMS = [
  { id: 'overview', label: 'Tổng quan', icon: BarChart3 },
  { id: 'orders', label: 'Tiến độ đơn hàng', icon: Package },
  { id: 'revenue', label: 'Doanh thu', icon: TrendingUp },
  { id: 'receivables', label: 'Công nợ phải thu', icon: Wallet },
  { id: 'payables', label: 'Công nợ phải trả', icon: CreditCard },
  { id: 'reminders', label: 'Nhắc việc', icon: BellRing },
  { id: 'data-entry', label: 'Nhập liệu Excel', icon: Sheet },
  { id: 'users', label: 'Quản lý tài khoản', icon: Users },
  { id: 'tasks', label: 'Công việc của tôi', icon: ClipboardList },
  { id: 'assignments', label: 'Giao việc', icon: ClipboardList },
];

const SECONDARY_IDS = new Set(['data-entry', 'users', 'tasks', 'assignments', 'reminders']);

export function splitNavigationItems(items, viewportWidth = 1440) {
  if (!Array.isArray(items) || items.length <= 5 || viewportWidth >= 1460) {
    return { primary: items || [], overflow: [] };
  }
  const primaryLimit = viewportWidth < 1100 ? 4 : 5;
  const primary = [];
  const overflow = [];
  for (const item of items) {
    if (!SECONDARY_IDS.has(item.id) && primary.length < primaryLimit) primary.push(item);
    else overflow.push(item);
  }
  while (primary.length < primaryLimit && overflow.length > 0) {
    primary.push(overflow.shift());
  }
  if (overflow.length === 1 && primary.length < items.length) {
    primary.push(overflow.shift());
  }
  return { primary, overflow };
}

function HeaderClock({ language }) {
  const [now, setNow] = useState(() => new Date());
  const formatter = useMemo(() => new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }), [language]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <time className="header-clock" dateTime={now.toISOString()} title={t('Giờ Việt Nam')}>
    <Clock3 size={16} aria-hidden="true" />
    <span>{formatter.format(now)}</span>
    <small>UTC+7</small>
  </time>;
}

export default function AppHeader({ language, activeSection, onNavigate, user, onLogout, onPasswordChanged, pendingRemindersCount = 0 }) {
  const trackRef = useRef(null);
  const moreMenuRef = useRef(null);
  const buttonRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1440);
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleItems = useMemo(() => NAV_ITEMS.filter(({ id }) => canOpenSection(user, id)), [user]);
  const { primary: primaryItems, overflow: overflowItems } = useMemo(
    () => splitNavigationItems(visibleItems, viewportWidth),
    [visibleItems, viewportWidth],
  );
  const activeOverflowItem = overflowItems.find(item => item.id === activeSection);
  const indicatorTarget = activeOverflowItem ? '__more__' : activeSection;

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const handlePointer = event => {
      if (!moreMenuRef.current?.contains(event.target)) setMoreOpen(false);
    };
    const handleKey = event => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [moreOpen]);

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const button = buttonRefs.current[indicatorTarget];
      if (button) setIndicator({ left: button.offsetLeft, width: button.offsetWidth });
    };
    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    if (trackRef.current) observer.observe(trackRef.current);
    if (buttonRefs.current[indicatorTarget]) observer.observe(buttonRefs.current[indicatorTarget]);
    return () => observer.disconnect();
  }, [indicatorTarget, language, primaryItems.length, overflowItems.length]);

  const select = section => {
    setMoreOpen(false);
    onNavigate(section);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    buttonRefs.current[section]?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'nearest', inline: 'nearest' });
  };
  return (
    <header className="app-header">
      <div className="header-top">
        <button className="app-brand" onClick={() => select(homeSection(user))} aria-label={t("Về trang chính")}>
          <div className="brand-mark"><img src="/logo.png" alt="Uyen Vu International" /></div>
          <div><strong>UYEN VU INTERNATIONAL</strong><span>{t("Quản lý điều hành")}</span></div>
        </button>
        <HeaderClock language={language} />
        <div className="header-account-controls"><LanguageSwitch /><AccountMenu user={user} onLogout={onLogout} onPasswordChanged={onPasswordChanged} /></div>
      </div>
      <nav className="header-nav" aria-label={t("Điều hướng chính")}>
        <div className="nav-track" ref={trackRef}>
          <span className="nav-indicator" aria-hidden="true" style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }} />
          {primaryItems.map(({ id, label, icon: Icon }) => (
            <button key={id} ref={element => { buttonRefs.current[id] = element; }} onClick={() => select(id)}
              aria-current={activeSection === id ? 'page' : undefined} className={activeSection === id ? 'nav-item active' : 'nav-item'}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{t(label)}</span>
              {id === 'reminders' && pendingRemindersCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white leading-none">
                  {pendingRemindersCount}
                </span>
              )}
            </button>
          ))}
          {overflowItems.length > 0 && (
            <div className="nav-more-wrapper" ref={moreMenuRef}>
              <button
                type="button"
                ref={element => { buttonRefs.current.__more__ = element; }}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen(open => !open)}
                className={activeOverflowItem ? 'nav-item nav-more-button active' : 'nav-item nav-more-button'}
              >
                <MoreHorizontal size={18} strokeWidth={1.8} />
                <span>{activeOverflowItem ? `${t('Thêm')} · ${t(activeOverflowItem.label)}` : t('Thêm')}</span>
                {overflowItems.some(i => i.id === 'reminders') && pendingRemindersCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white leading-none">
                    {pendingRemindersCount}
                  </span>
                )}
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              {moreOpen && (
                <div className="nav-more-menu" role="menu" aria-label={t('Mục điều hướng khác')}>
                  {overflowItems.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      aria-current={activeSection === id ? 'page' : undefined}
                      className={activeSection === id ? 'nav-more-item active' : 'nav-more-item'}
                      onClick={() => select(id)}
                    >
                      <Icon size={17} strokeWidth={1.8} />
                      <span>{t(label)}</span>
                      {id === 'reminders' && pendingRemindersCount > 0 && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white leading-none">
                          {pendingRemindersCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
