import { useEffect, useRef } from 'react';

export function useChartEntrance() {
  const chartRef = useRef(null);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.hasAttribute('data-chart-entered')) return;

    const reveal = () => chart.setAttribute('data-chart-entered', '');
    if (typeof IntersectionObserver === 'undefined') {
      reveal();
      return;
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        reveal();
        observer.disconnect();
      }
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);

  return chartRef;
}
