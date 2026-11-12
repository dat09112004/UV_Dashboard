import React from 'react';
import { t } from '../../locales/i18n.js';

export default class AppErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="dashboard-workspace" role="alert">
      <h1>{t('Không thể hiển thị giao diện')}</h1>
      <button type="button" onClick={() => window.location.reload()}>{t('Tải lại trang')}</button>
    </main>;
  }
}
