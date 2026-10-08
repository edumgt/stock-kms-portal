const ASSET_CATEGORIES = [
  {
    label: '원자재',
    icon: 'fa-solid fa-gem',
    assets: [
      { id: 'gold', name: '국제 금 선물', ticker: 'GC=F', color: '#d97706' },
      { id: 'oil', name: 'WTI 원유 선물', ticker: 'CL=F', color: '#0f766e' },
    ],
  },
  {
    label: '환율',
    icon: 'fa-solid fa-money-bill-transfer',
    assets: [
      { id: 'dxy', name: '달러인덱스(DXY)', ticker: 'DX-Y.NYB', color: '#2563eb' },
      { id: 'usdkrw', name: '원/달러 환율', ticker: 'KRW=X', color: '#dc2626' },
    ],
  },
  {
    label: '금리',
    icon: 'fa-solid fa-percent',
    assets: [
      { id: 'ust10y', name: '미국 10년물 국채금리', ticker: '^TNX', color: '#7c3aed' },
    ],
  },
  {
    label: '가상자산',
    icon: 'fa-brands fa-bitcoin',
    assets: [
      { id: 'bitcoin', name: '비트코인(BTC/USD)', ticker: 'BTC-USD', color: '#f59e0b' },
    ],
  },
];

const ASSETS = ASSET_CATEGORIES.flatMap((category) => category.assets);

const CHART_PERIODS = [['1mo', '1M'], ['3mo', '3M'], ['6mo', '6M'], ['1y', '1Y']];
const CHART_UPWARD_COLOR = '#e11d48';
const CHART_DOWNWARD_COLOR = '#2563eb';

// point.c 등이 null/undefined이면 Number(null)이 0으로 변환되어 finite 판정을 통과해
// 버리는 문제가 있어, 실제로 숫자 타입인지까지 확인한다.
function isFiniteOhlcValue(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// 원인별로 사용자가 이해할 수 있는 한국어 설명을 붙인다.
function describeChartError(error) {
  const message = error?.message || '알 수 없는 오류';
  if (message.startsWith('HTTP ')) return `서버에서 시세를 받아오지 못했습니다(${message}). 잠시 후 다시 시도해 주세요.`;
  if (message === '데이터 없음') return '선택한 기간에는 표시할 시세 데이터가 없습니다. 다른 기간을 선택해 보세요.';
  return `차트를 그리는 중 예상하지 못한 오류가 발생했습니다. 최근 시세에 결측값이 있을 수 있습니다. (${message})`;
}

function assetChartCard(asset) {
  return `
    <section class="home-market-card" data-idx-card="${asset.id}">
      <header class="home-market-card-head">
        <div>
          <div class="home-market-name">${asset.name} <span>· ${asset.ticker}</span></div>
          <div class="home-market-price-row">
            <strong data-idx-price="${asset.id}">--</strong>
            <em data-idx-change="${asset.id}">--</em>
          </div>
        </div>
        <div class="home-market-periods" data-idx-periods="${asset.id}">
          ${CHART_PERIODS.map(([value, label]) => `<button type="button" data-period="${value}" class="${value === '3mo' ? 'active' : ''}">${label}</button>`).join('')}
        </div>
      </header>
      <div class="home-market-chart-wrap">
        <div class="home-market-chart" data-idx-chart="${asset.id}"></div>
        <div class="home-market-loading" data-idx-loading="${asset.id}"><i class="fa-solid fa-spinner fa-spin"></i> 데이터 불러오는 중…</div>
      </div>
      <footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>
    </section>`;
}

function categoryPanel(category) {
  return `
    <section class="world-market-panel world-market-index-panel">
      <div class="world-market-panel-head"><div><h2><i class="${category.icon}"></i> ${category.label}</h2><p>Yahoo Finance 기준 일봉 캔들·20일 이동평균·거래량입니다.</p></div><span>15분 지연</span></div>
      <div class="world-market-index-grid asset-class-grid">${category.assets.map(assetChartCard).join('')}</div>
    </section>`;
}

export function assetClassesView(container) {
  container.innerHTML = `
    <section class="world-markets-page">
      <header class="world-markets-head">
        <div><h1><i class="fa-solid fa-layer-group"></i> 다양한 기초자산 차트</h1><p>주식 지수 외에 원자재·환율·금리·가상자산처럼 서로 다른 성격의 기초자산 흐름을 함께 비교합니다.</p></div>
      </header>
      <p class="world-markets-note">여기 모은 자산은 서로 다른 시장(상품 선물, 외환, 채권, 가상자산)에서 거래되며 거래 시간·휴장일도 다릅니다. 같은 날짜라도 캔들이 비어 있거나 거래량이 0으로 보일 수 있습니다. 이 화면은 투자 권유가 아닌 참고용 시세입니다.</p>
      ${ASSET_CATEGORIES.map(categoryPanel).join('')}
    </section>`;

  const idxCharts = new Map();
  const idxPeriods = new Map(ASSETS.map((asset) => [asset.id, '3mo']));

  function destroyIdxChart(id) {
    const idxChart = idxCharts.get(id);
    if (idxChart) {
      try { idxChart.destroy(); } catch {}
      idxCharts.delete(id);
    }
  }

  async function loadAssetChart(asset) {
    const id = asset.id;
    const card = container.querySelector(`[data-idx-card="${id}"]`);
    const chartEl = card.querySelector(`[data-idx-chart="${id}"]`);
    const loadingEl = card.querySelector(`[data-idx-loading="${id}"]`);
    const price = card.querySelector(`[data-idx-price="${id}"]`);
    const change = card.querySelector(`[data-idx-change="${id}"]`);
    const source = card.querySelector(`[data-idx-source="${id}"]`);
    loadingEl.style.display = 'flex';
    loadingEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 데이터 불러오는 중…';
    destroyIdxChart(id);

    try {
      const response = await fetch(`/api/home/market-candle?market=${encodeURIComponent(id)}&period=${idxPeriods.get(id)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const ohlcv = (data.ohlcv || []).filter((point) => [point?.o, point?.h, point?.l, point?.c].every(isFiniteOhlcValue));
      if (!ohlcv.length) throw new Error('데이터 없음');

      const last = ohlcv.at(-1);
      const previousClose = ohlcv.length > 1 ? ohlcv.at(-2).c : last.o;
      const changePercent = ((last.c / previousClose) - 1) * 100;
      const isUp = changePercent >= 0;
      price.textContent = last.c.toLocaleString(undefined, { maximumFractionDigits: 2 });
      change.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(changePercent).toFixed(2)}%`;
      change.className = isUp ? 'is-up' : 'is-down';
      source.textContent = data.is_simulated ? '시뮬레이션 데이터' : 'Yahoo Finance · 15분 지연';
      source.classList.toggle('is-simulated', Boolean(data.is_simulated));

      // 백엔드가 MA20 계산용으로 표시 기간보다 앞선 봉을 함께 내려주므로, 이동평균은
      // 전체 구간으로 계산한 뒤 실제 표시 구간(display_from 이후)만 잘라서 보여준다.
      const ma20Full = ohlcv.map((point, index) => ({
        x: new Date(point.date).getTime(),
        y: index < 19 ? null : ohlcv.slice(index - 19, index + 1).reduce((sum, item) => sum + item.c, 0) / 20,
      }));
      const displayFrom = data.display_from || null;
      const startIdx = displayFrom ? Math.max(0, ohlcv.findIndex((point) => point.date >= displayFrom)) : 0;
      const displayOhlcv = startIdx > 0 ? ohlcv.slice(startIdx) : ohlcv;
      const candles = displayOhlcv.map((point) => ({ x: new Date(point.date).getTime(), y: [point.o, point.h, point.l, point.c] }));
      const ma20 = startIdx > 0 ? ma20Full.slice(startIdx) : ma20Full;
      const volume = displayOhlcv.map((point) => ({
        x: new Date(point.date).getTime(), y: point.v || 0,
        fillColor: point.c >= point.o ? CHART_UPWARD_COLOR : CHART_DOWNWARD_COLOR,
      }));

      const idxChart = new ApexCharts(chartEl, {
        chart: { type: 'candlestick', height: 250, toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, background: '#fff', fontFamily: 'Pretendard, -apple-system, "Malgun Gothic", sans-serif' },
        series: [
          { name: asset.name, type: 'candlestick', data: candles },
          { name: 'MA20', type: 'line', data: ma20 },
          { name: '거래량', type: 'bar', data: volume },
        ],
        plotOptions: { candlestick: { colors: { upward: CHART_UPWARD_COLOR, downward: CHART_DOWNWARD_COLOR }, wick: { useFillColor: true } }, bar: { columnWidth: '65%' } },
        colors: [CHART_UPWARD_COLOR, asset.color, '#94a3b8'],
        stroke: { curve: 'smooth', width: [1, 1.7, 0] },
        xaxis: { type: 'datetime', labels: { format: 'MM-dd', style: { fontSize: '10px', colors: '#94a3b8' }, hideOverlappingLabels: true, datetimeUTC: false }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: [{ labels: { formatter: (value) => value ? Math.round(value).toLocaleString() : '', style: { fontSize: '10px', colors: '#94a3b8' } } }, { show: false }, { show: false }],
        grid: { borderColor: '#eef2f7', strokeDashArray: 3, padding: { right: 10, left: 4 } },
        tooltip: { shared: false, x: { format: 'yyyy-MM-dd' }, y: { formatter: (value) => value == null ? '' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) } },
        legend: { show: false },
      });
      idxCharts.set(id, idxChart);
      await idxChart.render();
      loadingEl.style.display = 'none';
    } catch (error) {
      loadingEl.innerHTML = `<span class="home-market-error">데이터 오류: ${describeChartError(error)}</span>`;
    }
  }

  ASSETS.forEach((asset) => {
    container.querySelector(`[data-idx-periods="${asset.id}"]`).addEventListener('click', (event) => {
      const button = event.target.closest('[data-period]');
      if (!button) return;
      idxPeriods.set(asset.id, button.dataset.period);
      container.querySelectorAll(`[data-idx-periods="${asset.id}"] [data-period]`).forEach((item) => item.classList.toggle('active', item === button));
      loadAssetChart(asset);
    });
    loadAssetChart(asset);
  });

  window._viewCleanup = () => {
    idxCharts.forEach((idxChart) => { try { idxChart.destroy(); } catch {} });
  };
}
