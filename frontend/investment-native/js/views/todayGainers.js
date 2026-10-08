function formatPrice(value) {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value).toLocaleString()}원`;
}

function rowMarkup(item) {
  const isUp = item.change_pct >= 0;
  const rankClass = item.rank <= 3 ? ` is-top${item.rank}` : '';
  return `
    <button type="button" class="gainers-row${rankClass}" data-quote-ticker="${item.ticker}" aria-haspopup="dialog" aria-label="${item.name} 시세 보기">
      <span class="gainers-rank">${item.rank}</span>
      <div class="gainers-name">
        <strong>${item.name}</strong>
        <span class="gainers-meta">${item.ticker} · ${item.sector}</span>
        <span class="gainers-quote-action"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> 시세 보기</span>
      </div>
      <span class="gainers-price">${formatPrice(item.price)}</span>
      <span class="gainers-change ${isUp ? 'is-up' : 'is-down'}">${isUp ? '▲' : '▼'} ${Math.abs(item.change_pct).toFixed(2)}%</span>
    </button>`;
}

function installQuoteModal(container) {
  const modal = document.createElement('div');
  modal.className = 'gainers-quote-modal-backdrop';
  modal.hidden = true;
  modal.innerHTML = `
    <section class="gainers-quote-modal" role="dialog" aria-modal="true" aria-labelledby="gainers-quote-title" tabindex="-1">
      <header class="gainers-quote-modal-header">
        <div>
          <p id="gainers-quote-sector"></p>
          <h2 id="gainers-quote-title">--</h2>
          <div class="gainers-quote-price-row"><strong id="gainers-quote-price">--</strong><em id="gainers-quote-change">--</em></div>
        </div>
        <button type="button" class="gainers-quote-modal-close" aria-label="시세 창 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="gainers-quote-periods" aria-label="차트 기간">
        <button type="button" data-quote-period="1mo">1개월</button>
        <button type="button" data-quote-period="3mo" class="active">3개월</button>
        <button type="button" data-quote-period="1y">1년</button>
      </div>
      <div class="gainers-quote-chart-wrap">
        <div id="gainers-quote-chart" class="gainers-quote-chart"></div>
        <div id="gainers-quote-loading" class="gainers-quote-loading"><i class="fa-solid fa-spinner fa-spin"></i> 시세를 불러오는 중…</div>
      </div>
      <div id="gainers-quote-source" class="gainers-quote-source"></div>
    </section>`;
  document.body.appendChild(modal);

  const panel = modal.querySelector('.gainers-quote-modal');
  const title = modal.querySelector('#gainers-quote-title');
  const sector = modal.querySelector('#gainers-quote-sector');
  const price = modal.querySelector('#gainers-quote-price');
  const change = modal.querySelector('#gainers-quote-change');
  const chartEl = modal.querySelector('#gainers-quote-chart');
  const loading = modal.querySelector('#gainers-quote-loading');
  const source = modal.querySelector('#gainers-quote-source');
  const closeButton = modal.querySelector('.gainers-quote-modal-close');
  let chart = null;
  let abortController = null;
  let selected = null;
  let lastFocused = null;
  let requestId = 0;

  const destroyChart = () => {
    if (chart) { try { chart.destroy(); } catch {} chart = null; }
    chartEl.replaceChildren();
  };
  const close = () => {
    requestId += 1;
    modal.hidden = true;
    abortController?.abort();
    destroyChart();
    document.body.classList.remove('modal-open');
    lastFocused?.focus();
  };
  const loadChart = async (period = '3mo') => {
    if (!selected) return;
    const currentRequest = ++requestId;
    abortController?.abort();
    abortController = new AbortController();
    destroyChart();
    loading.hidden = false;
    loading.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 시세를 불러오는 중…';
    source.textContent = '';
    modal.querySelectorAll('[data-quote-period]').forEach((button) => button.classList.toggle('active', button.dataset.quotePeriod === period));
    try {
      const response = await fetch(`/api/home/market-candle?market=stock&period=${period}&interval=1d&ticker=${encodeURIComponent(selected.ticker)}`, { signal: abortController.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const ohlcv = data.ohlcv || [];
      if (!ohlcv.length) throw new Error('데이터 없음');
      if (currentRequest !== requestId || modal.hidden) return;
      const last = ohlcv.at(-1);
      const previous = ohlcv.length > 1 ? ohlcv.at(-2).c : last.o;
      const changePct = previous ? ((last.c / previous) - 1) * 100 : 0;
      const isUp = changePct >= 0;
      price.textContent = formatPrice(last.c);
      change.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(changePct).toFixed(2)}%`;
      change.className = isUp ? 'is-up' : 'is-down';
      if (!window.ApexCharts) throw new Error('차트 라이브러리 없음');
      chart = new window.ApexCharts(chartEl, {
        chart: { type: 'candlestick', height: 390, toolbar: { show: true }, fontFamily: 'Pretendard, sans-serif' },
        series: [{ data: ohlcv.map((point) => ({ x: new Date(point.date).getTime(), y: [point.o, point.h, point.l, point.c] })) }],
        plotOptions: { candlestick: { colors: { upward: '#e11d48', downward: '#2563eb' } } },
        xaxis: { type: 'datetime' },
        yaxis: { tooltip: { enabled: true }, labels: { formatter: (value) => Math.round(value).toLocaleString() } },
        grid: { borderColor: '#e2e8f0' },
        tooltip: { x: { format: 'yyyy-MM-dd' } },
      });
      await chart.render();
      if (currentRequest !== requestId || modal.hidden) return;
      source.textContent = data.is_simulated ? '시뮬레이션 데이터' : 'Yahoo Finance · 장중 시세는 약 15분 지연될 수 있습니다.';
      source.classList.toggle('is-simulated', Boolean(data.is_simulated));
      loading.hidden = true;
    } catch (error) {
      if (error.name === 'AbortError' || currentRequest !== requestId || modal.hidden) return;
      loading.innerHTML = `<span>시세를 불러오지 못했습니다: ${error.message}</span>`;
    }
  };
  const open = (item, trigger) => {
    selected = item;
    lastFocused = trigger;
    title.textContent = `${item.name} · ${item.ticker}`;
    sector.textContent = item.sector;
    price.textContent = formatPrice(item.price);
    const isUp = item.change_pct >= 0;
    change.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(item.change_pct).toFixed(2)}%`;
    change.className = isUp ? 'is-up' : 'is-down';
    modal.hidden = false;
    document.body.classList.add('modal-open');
    panel.focus();
    loadChart();
  };

  closeButton.addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) close(); });
  modal.querySelector('.gainers-quote-periods').addEventListener('click', (event) => {
    const button = event.target.closest('[data-quote-period]');
    if (button) loadChart(button.dataset.quotePeriod);
  });
  return { open, destroy: () => { abortController?.abort(); destroyChart(); modal.remove(); } };
}

export function marketRankingsView(container, {
  id,
  title,
  icon,
  description,
  endpoint,
  loadingText,
  note,
}) {
  container.innerHTML = `
    <section class="gainers-page">
      <header class="gainers-head">
        <div>
          <h1><i class="fa-solid ${icon}"></i> ${title}</h1>
          <p>${description}</p>
        </div>
        <div class="gainers-actions">
          <span id="${id}-stamp">조회 전</span>
          <button type="button" id="${id}-refresh"><i class="fa-solid fa-rotate-right"></i> 새로고침</button>
        </div>
      </header>
      <div class="gainers-list" id="${id}-list">
        <div class="gainers-loading"><i class="fa-solid fa-spinner fa-spin"></i> ${loadingText}</div>
      </div>
      <p class="gainers-note">${note}</p>
    </section>`;

  let disposed = false;
  const quoteModal = installQuoteModal(container);
  const itemsByTicker = new Map();

  async function loadGainers() {
    const list = container.querySelector(`#${id}-list`);
    const stamp = container.querySelector(`#${id}-stamp`);
    const button = container.querySelector(`#${id}-refresh`);
    button.disabled = true;
    button.classList.add('is-loading');
    stamp.textContent = '조회 중…';

    try {
      const response = await fetch(`${endpoint}?limit=20`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (disposed) return;
      const items = data.items || [];
      if (!items.length) throw new Error('데이터 없음');

      itemsByTicker.clear();
      items.forEach((item) => itemsByTicker.set(item.ticker, item));
      list.innerHTML = items.map(rowMarkup).join('');
      const fetchedAt = data.fetched_at ? new Date(data.fetched_at) : null;
      const stampText = fetchedAt && !Number.isNaN(fetchedAt.valueOf())
        ? `조회 ${fetchedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
        : '조회 완료';
      stamp.textContent = data.is_simulated ? `${stampText} · 시뮬레이션 데이터` : stampText;
      stamp.classList.toggle('is-simulated', Boolean(data.is_simulated));
    } catch (error) {
      if (disposed) return;
      list.innerHTML = `<div class="gainers-error"><i class="fa-solid fa-triangle-exclamation"></i> 데이터를 불러오지 못했습니다: ${error.message}</div>`;
      stamp.textContent = '조회 실패';
    } finally {
      if (!disposed) {
        button.disabled = false;
        button.classList.remove('is-loading');
      }
    }
  }

  container.querySelector(`#${id}-refresh`).addEventListener('click', loadGainers);
  container.querySelector(`#${id}-list`).addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-quote-ticker]');
    const item = trigger && itemsByTicker.get(trigger.dataset.quoteTicker);
    if (item) quoteModal.open(item, trigger);
  });
  loadGainers();

  window._viewCleanup = () => { disposed = true; quoteModal.destroy(); };
}

export function todayGainersView(container) {
  marketRankingsView(container, {
    id: 'gainers',
    title: '금일 상승종목 TOP 20',
    icon: 'fa-arrow-trend-up',
    description: 'KOSPI 대표 종목(약 28종목) 중 오늘 등락률이 높은 상위 20종목입니다. 전체 시장 스크리너가 아닌, 학습용 참고 순위입니다.',
    endpoint: '/api/market/top-gainers',
    loadingText: '오늘의 등락률을 불러오는 중…',
    note: 'Yahoo Finance 시세(약 15분 지연) 기준이며, 장중에는 순위가 실시간으로 계속 바뀝니다. 상승률 상위라는 것이 좋은 투자 대상이라는 뜻은 아니며, 급등 이유(실적·공시·수급)를 반드시 별도로 확인하세요.',
  });
}
