// TradingView Lightweight Charts™ (Apache-2.0); attribution logo stays enabled.
class HomeFinancialChart {
  constructor(element, config) { this.element=element; this.config=config; this.chart=null; this.observer=null; }
  async render() {
    const L=window.LightweightCharts;
    if (!L) throw new Error('차트 라이브러리를 불러오지 못했습니다.');
    const c=this.config;
    const height=typeof c.chart.height==='number' ? c.chart.height : Math.max(120,this.element.clientHeight);
    this.element.replaceChildren();
    this.chart=L.createChart(this.element,{width:Math.max(1,this.element.clientWidth),height,
      layout:{background:{type:'solid',color:'#fff'},textColor:'#64748b',fontFamily:'Pretendard, sans-serif',attributionLogo:true},
      grid:{vertLines:{color:'#f1f5f9'},horzLines:{color:'#f1f5f9'}},
      timeScale:{timeVisible:c.xaxis?.labels?.format?.includes('HH'),secondsVisible:false},
      localization:{locale:'ko-KR'},rightPriceScale:{borderColor:'#e2e8f0'},crosshair:{mode:L.CrosshairMode.Normal}});
    const normalized=(data,candle=false)=>{
      const byTime=new Map();
      for (const p of data) {
        const time=Math.floor(Number(p.x)/1000);
        if (!Number.isFinite(time) || (candle ? !Array.isArray(p.y)||!p.y.every(Number.isFinite) : !Number.isFinite(p.y))) continue;
        byTime.set(time,candle ? {time,open:p.y[0],high:p.y[1],low:p.y[2],close:p.y[3]} : {time,value:p.y,...(p.fillColor?{color:p.fillColor}:{})});
      }
      return [...byTime.values()].sort((a,b)=>a.time-b.time);
    };
    let candles=null;
    c.series.forEach((spec,i)=>{
      if (spec.type==='scatter') return;
      const color=c.colors?.[i] || '#2563eb';
      let series;
      if(spec.type==='candlestick') {
        series=this.chart.addSeries(L.CandlestickSeries,{upColor:UPWARD_COLOR,downColor:DOWNWARD_COLOR,borderVisible:false,wickUpColor:UPWARD_COLOR,wickDownColor:DOWNWARD_COLOR});
        candles=series;
      } else if(spec.type==='bar') {
        const volume=spec.name==='거래량';
        series=this.chart.addSeries(L.HistogramSeries,{color,priceScaleId:volume?'volume':'right',priceFormat:{type:volume?'volume':'price'},lastValueVisible:false,priceLineVisible:false});
        if(volume) {series.priceScale().applyOptions({scaleMargins:{top:0.82,bottom:0}});this.chart.priceScale('right').applyOptions({scaleMargins:{top:0.08,bottom:0.22}});}
      } else series=this.chart.addSeries(L.LineSeries,{color,lineWidth:2,title:spec.name,priceLineVisible:false,lastValueVisible:false});
      series.setData(normalized(spec.data,spec.type==='candlestick'));
      if(spec.name==='RSI') for (const price of [30,70]) series.createPriceLine({price,color:'#94a3b8',lineWidth:1,lineStyle:L.LineStyle.Dashed,axisLabelVisible:true,title:''});
    });
    if(candles) {
      const markers=c.series.filter(s=>s.type==='scatter').flatMap(s=>normalized(s.data).map(p=>({time:p.time,position:s.name==='매수'?'belowBar':'aboveBar',color:s.name==='매수'?BUY_SIGNAL_COLOR:SELL_SIGNAL_COLOR,shape:s.name==='매수'?'arrowUp':'arrowDown',text:s.name}))).sort((a,b)=>a.time-b.time);
      this.markers=L.createSeriesMarkers(candles,markers);
    }
    this.chart.timeScale().fitContent();
    this.observer=new ResizeObserver(()=>{if(this.chart && this.element.isConnected) this.chart.resize(Math.max(1,this.element.clientWidth),typeof c.chart.height==='number'?height:Math.max(120,this.element.clientHeight));});
    this.observer.observe(this.element);
  }
  destroy() { this.observer?.disconnect();this.chart?.remove();this.chart=null; }
}

const HOME_MARKETS = [
  { id: 'kospi', name: 'KOSPI', ticker: '^KS11', color: '#0078d4' },
  { id: 'kosdaq', name: 'KOSDAQ', ticker: '^KQ11', color: '#8b5cf6' },
  { id: 'nasdaq', name: 'NASDAQ', ticker: '^IXIC', color: '#0f766e' },
  { id: 'sp500', name: 'S&P 500', ticker: '^GSPC', color: '#d97706' },
];

const PERIODS = [['1d', '1일'], ['1mo', '1M'], ['3mo', '3M'], ['6mo', '6M'], ['1y', '1Y']];
const UPWARD_COLOR = '#e11d48';
const DOWNWARD_COLOR = '#2563eb';
const MACD_LINE_COLOR = '#7c3aed';
const MACD_SIGNAL_COLOR = '#f59e0b';
const MACD_HIST_UP_COLOR = '#16a34a';
const MACD_HIST_DOWN_COLOR = '#dc2626';
const RSI_LINE_COLOR = '#0891b2';
const BUY_SIGNAL_COLOR = '#16a34a';
const SELL_SIGNAL_COLOR = '#dc2626';

function isIntradayPeriod(period) {
  return period === '1d';
}

// point.c 등이 null/undefined이면 Number(null)이 0으로 변환되어 finite 판정을 통과해
// 버리는 문제가 있어, 실제로 숫자 타입인지까지 확인한다.
function isFiniteOhlcValue(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// 원인별로 사용자가 이해할 수 있는 한국어 설명을 붙인다. 서버 응답이 정상이어도
// 특정 봉의 시세가 비어 있는 경우(휴장·지연 등) 원인이 다르므로 구분해서 안내한다.
function describeChartError(error) {
  const message = error?.message || '알 수 없는 오류';
  if (message.startsWith('HTTP ')) return `서버에서 시세를 받아오지 못했습니다(${message}). 잠시 후 다시 시도해 주세요.`;
  if (message === '데이터 없음') return '선택한 기간에는 표시할 시세 데이터가 없습니다. 다른 기간을 선택해 보세요.';
  return `차트를 그리는 중 예상하지 못한 오류가 발생했습니다. 최근 시세에 결측값이 있을 수 있습니다. (${message})`;
}

function isIntradayInterval(interval) {
  return ['1m', '3m', '5m', '15m', '30m', '1h'].includes(interval);
}

function calcEma(data, span) {
  const k = 2 / (span + 1);
  const out = [];
  data.forEach((value, index) => out.push(index === 0 ? value : out[index - 1] * (1 - k) + value * k));
  return out;
}

function calcMACD(ohlcv, fast = 12, slow = 26, signalSpan = 9) {
  const closes = ohlcv.map((point) => point.c);
  const emaFast = calcEma(closes, fast);
  const emaSlow = calcEma(closes, slow);
  const macdLine = emaFast.map((value, index) => (index < slow - 1 ? null : value - emaSlow[index]));
  const signalRaw = calcEma(macdLine.map((value) => value ?? 0), signalSpan);
  const signalLine = signalRaw.map((value, index) => (macdLine[index] == null ? null : value));
  const histogram = macdLine.map((value, index) => (value == null || signalLine[index] == null ? null : value - signalLine[index]));
  return { macdLine, signalLine, histogram };
}

function calcRSI(ohlcv, period = 14) {
  const closes = ohlcv.map((point) => point.c);
  const diffs = closes.map((value, index) => (index === 0 ? 0 : value - closes[index - 1]));
  return closes.map((_, index) => {
    if (index < period) return null;
    const win = diffs.slice(index - period + 1, index + 1);
    const gain = win.filter((value) => value > 0).reduce((sum, value) => sum + value, 0) / period;
    const loss = -win.filter((value) => value < 0).reduce((sum, value) => sum + value, 0) / period;
    return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  });
}

// displayFrom(있으면)보다 앞선 봉은 MA20 등 지표의 선행 구간(lookback) 계산에만 쓰고
// 실제 차트에는 표시하지 않는다. 그래야 짧은 기간(1M 등)을 선택해도 이동평균선이
// 화면 맨 앞부터 끊김 없이 보인다.
function computeChartSeries(ohlcv, displayFrom) {
  const ma20Full = ohlcv.map((point, index) => ({
    x: new Date(point.date).getTime(),
    y: index < 19 ? null : ohlcv.slice(index - 19, index + 1).reduce((sum, item) => sum + item.c, 0) / 20,
  }));
  const { macdLine, signalLine, histogram } = calcMACD(ohlcv);
  const macdFull = ohlcv.map((point, index) => ({ x: new Date(point.date).getTime(), y: macdLine[index] }));
  const signalFull = ohlcv.map((point, index) => ({ x: new Date(point.date).getTime(), y: signalLine[index] }));
  const histogramFull = ohlcv.map((point, index) => ({
    x: new Date(point.date).getTime(), y: histogram[index],
    fillColor: (histogram[index] ?? 0) >= 0 ? MACD_HIST_UP_COLOR : MACD_HIST_DOWN_COLOR,
  }));
  const rsi = calcRSI(ohlcv);
  const rsiFull = ohlcv.map((point, index) => ({ x: new Date(point.date).getTime(), y: rsi[index] }));

  const startIdx = displayFrom ? Math.max(0, ohlcv.findIndex((point) => point.date >= displayFrom)) : 0;
  const displayOhlcv = startIdx > 0 ? ohlcv.slice(startIdx) : ohlcv;
  const candles = displayOhlcv.map((point) => ({ x: new Date(point.date).getTime(), y: [point.o, point.h, point.l, point.c] }));
  const volume = displayOhlcv.map((point) => ({
    x: new Date(point.date).getTime(), y: point.v || 0,
    fillColor: point.c >= point.o ? UPWARD_COLOR : DOWNWARD_COLOR,
  }));
  const cut = (arr) => (startIdx > 0 ? arr.slice(startIdx) : arr);
  const ma20 = cut(ma20Full);

  // 종가가 MA20을 아래→위로 뚫으면 매수시점, 위→아래로 뚫으면 매도시점으로 표시한다.
  const buySignal = candles.map((c) => ({ x: c.x, y: null }));
  const sellSignal = candles.map((c) => ({ x: c.x, y: null }));
  for (let i = 1; i < candles.length; i++) {
    const prevMa = ma20[i - 1].y, curMa = ma20[i].y;
    if (prevMa == null || curMa == null) continue;
    const prevClose = candles[i - 1].y[3], curClose = candles[i].y[3];
    if (prevClose < prevMa && curClose >= curMa) {
      buySignal[i].y = +(candles[i].y[2] * 0.985).toFixed(2); // 캔들 저가 살짝 아래
    } else if (prevClose > prevMa && curClose <= curMa) {
      sellSignal[i].y = +(candles[i].y[1] * 1.015).toFixed(2); // 캔들 고가 살짝 위
    }
  }

  return {
    candles, volume, ma20, buySignal, sellSignal,
    macdSeries: cut(macdFull),
    signalSeries: cut(signalFull),
    histogramSeries: cut(histogramFull),
    rsiSeries: cut(rsiFull),
  };
}

function buildCandleConfig(market, series, period, height, interval = '') {
  const intraday = interval ? isIntradayInterval(interval) : isIntradayPeriod(period);
  return {
    chart: { type: 'candlestick', height, toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, background: '#fff', fontFamily: 'Pretendard, -apple-system, "Malgun Gothic", sans-serif' },
    series: [
      { name: market.name, type: 'candlestick', data: series.candles },
      { name: 'MA20', type: 'line', data: series.ma20 },
      { name: '거래량', type: 'bar', data: series.volume },
      { name: '매수', type: 'scatter', data: series.buySignal, dataLabels: { offsetY: 16 } },
      { name: '매도', type: 'scatter', data: series.sellSignal, dataLabels: { offsetY: -16 } },
    ],
    plotOptions: { candlestick: { colors: { upward: UPWARD_COLOR, downward: DOWNWARD_COLOR }, wick: { useFillColor: true } }, bar: { columnWidth: '65%' } },
    colors: [UPWARD_COLOR, market.color, '#94a3b8', BUY_SIGNAL_COLOR, SELL_SIGNAL_COLOR],
    stroke: { curve: 'smooth', width: [1, 1.7, 0, 0, 0] },
    markers: { size: [0, 0, 0, 7, 7], strokeColors: '#fff', strokeWidth: 2, hover: { size: 9 } },
    dataLabels: {
      enabled: true,
      enabledOnSeries: [3, 4],
      formatter: (value, opts) => (value == null ? '' : opts.seriesIndex === 3 ? '매수' : opts.seriesIndex === 4 ? '매도' : ''),
      style: { fontSize: '10px', fontWeight: 800, colors: ['#334155', market.color, '#334155', BUY_SIGNAL_COLOR, SELL_SIGNAL_COLOR] },
      background: { enabled: true, foreColor: '#fff', borderWidth: 0, opacity: 0.92 },
    },
    xaxis: { type: 'datetime', labels: { format: intraday ? 'HH:mm' : 'MM-dd', style: { fontSize: '10px', colors: '#94a3b8' }, hideOverlappingLabels: true, datetimeUTC: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: [
      { seriesName: market.name, labels: { formatter: (value) => value ? Math.round(value).toLocaleString() : '', style: { fontSize: '10px', colors: '#94a3b8' } } },
      { seriesName: market.name, show: false },
      { show: false },
      { seriesName: market.name, show: false },
      { seriesName: market.name, show: false },
    ],
    grid: { borderColor: '#eef2f7', strokeDashArray: 3, padding: { right: 10, left: 4 } },
    tooltip: { shared: false, x: { format: intraday ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd' }, y: { formatter: (value) => value == null ? '' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) } },
    legend: { show: false },
  };
}

function buildMacdConfig(series, period, height, interval = '') {
  const intraday = interval ? isIntradayInterval(interval) : isIntradayPeriod(period);
  return {
    chart: { type: 'line', height, toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, background: '#fff', fontFamily: 'Pretendard, -apple-system, "Malgun Gothic", sans-serif' },
    series: [
      { name: 'MACD', type: 'line', data: series.macdSeries },
      { name: 'Signal', type: 'line', data: series.signalSeries },
      { name: 'Histogram', type: 'bar', data: series.histogramSeries },
    ],
    plotOptions: { bar: { columnWidth: '65%' } },
    colors: [MACD_LINE_COLOR, MACD_SIGNAL_COLOR, '#94a3b8'],
    stroke: { curve: 'smooth', width: [1.5, 1.5, 0] },
    xaxis: { type: 'datetime', labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { tickAmount: 3, labels: { formatter: (value) => value == null ? '' : Number(value).toFixed(1), style: { fontSize: '9px', colors: '#94a3b8' } } },
    annotations: { yaxis: [{ y: 0, strokeDashArray: 3, borderColor: '#cbd5e1', borderWidth: 1 }] },
    grid: { borderColor: '#eef2f7', strokeDashArray: 3, padding: { top: 0, bottom: 0, left: 4, right: 10 } },
    legend: { show: true, fontSize: '9px', markers: { width: 7, height: 7 }, itemMargin: { horizontal: 6, vertical: 0 }, offsetY: -4 },
    tooltip: { shared: true, x: { format: intraday ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd' }, y: { formatter: (value) => value == null ? '' : Number(value).toFixed(2) } },
  };
}

function buildRsiConfig(series, period, height, interval = '') {
  const intraday = interval ? isIntradayInterval(interval) : isIntradayPeriod(period);
  return {
    chart: { type: 'line', height, toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, background: '#fff', fontFamily: 'Pretendard, -apple-system, "Malgun Gothic", sans-serif' },
    series: [{ name: 'RSI', type: 'line', data: series.rsiSeries }],
    colors: [RSI_LINE_COLOR],
    stroke: { curve: 'smooth', width: [1.6] },
    xaxis: { type: 'datetime', labels: { format: intraday ? 'HH:mm' : 'MM-dd', style: { fontSize: '10px', colors: '#94a3b8' }, hideOverlappingLabels: true, datetimeUTC: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { min: 0, max: 100, tickAmount: 4, labels: { formatter: (value) => value == null ? '' : Math.round(value), style: { fontSize: '9px', colors: '#94a3b8' } } },
    annotations: { yaxis: [
      { y: 70, strokeDashArray: 3, borderColor: '#dc2626', borderWidth: 1, label: { text: '70', style: { fontSize: '9px', color: '#dc2626', background: 'transparent' }, position: 'left', offsetX: 4 } },
      { y: 30, strokeDashArray: 3, borderColor: '#16a34a', borderWidth: 1, label: { text: '30', style: { fontSize: '9px', color: '#16a34a', background: 'transparent' }, position: 'left', offsetX: 4 } },
    ] },
    grid: { borderColor: '#eef2f7', strokeDashArray: 3, padding: { top: 0, bottom: 0, left: 4, right: 10 } },
    legend: { show: false },
    tooltip: { shared: true, x: { format: intraday ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd' }, y: { formatter: (value) => value == null ? '' : Number(value).toFixed(1) } },
  };
}

function barsFootLabel(period, withRsi = false, interval = '5m') {
  const labels = { '1m': '1분봉', '3m': '3분봉', '5m': '5분봉', '15m': '15분봉', '30m': '30분봉', '1h': '1시간봉', '1d': '일봉', '2y': '2년 일봉', '5y': '5년 일봉', '1wk': '주봉', '1mo': '월봉', '1y': '연봉' };
  const bar = labels[interval] || (isIntradayPeriod(period) ? '5분봉' : '일봉');
  return withRsi ? `${bar} · MA20 · MACD · RSI · 거래량` : `${bar} · MA20 · MACD · 거래량`;
}

function trendAnalysis(ohlcv, interval) {
  const closes = ohlcv.map((point) => Number(point.c)).filter(Number.isFinite);
  if (closes.length < 3) return '<p>추세를 설명하기에 충분한 가격 데이터가 없습니다.</p>';
  const last = closes.at(-1);
  const average = (count) => closes.slice(-count).reduce((sum, value) => sum + value, 0) / Math.min(count, closes.length);
  const change = (count) => {
    const start = closes[Math.max(0, closes.length - count)];
    return start ? (last / start - 1) * 100 : 0;
  };
  const ma20 = average(20);
  const ma60 = average(60);
  const shortChange = change(20);
  const mediumChange = change(60);
  const averageMove = closes.slice(-21).reduce((sum, value, index, values) => index ? sum + Math.abs(value / values[index - 1] - 1) : sum, 0) / Math.max(1, Math.min(20, closes.length - 1)) * 100;
  const phase = last >= ma20 && ma20 >= ma60 ? '상승 추세 우위' : last <= ma20 && ma20 <= ma60 ? '하락 추세 우위' : '추세 혼조';
  const relation = last >= ma20 ? '위' : '아래';
  const direction = shortChange >= 0 ? '상승' : '하락';
  const unit = interval === '1y' ? '연' : interval === '1mo' ? '월' : interval === '1wk' ? '주' : isIntradayInterval(interval) ? '분봉' : '일';
  return `
    <div class="home-chart-trend-kpis">
      <span><b>${phase}</b><small>현재 가격이 MA20 ${relation}</small></span>
      <span><b>${shortChange >= 0 ? '+' : ''}${shortChange.toFixed(2)}%</b><small>최근 20개 봉 변화</small></span>
      <span><b>${mediumChange >= 0 ? '+' : ''}${mediumChange.toFixed(2)}%</b><small>최근 60개 봉 변화</small></span>
      <span><b>${averageMove.toFixed(2)}%</b><small>최근 20개 봉 평균 변동폭</small></span>
    </div>
    <p><strong>해설:</strong> 단기 흐름은 ${direction} 방향이며, 현재 가격은 20개 ${unit} 이동평균선 ${relation}에 있습니다. ${ma20 >= ma60 ? '단기 이동평균이 중기 이동평균보다 높아' : '단기 이동평균이 중기 이동평균보다 낮아'} ${phase}로 분류했습니다. 변동폭이 커질수록 같은 방향의 움직임도 빠르게 바뀔 수 있으므로 거래량·뉴스·실적을 함께 확인하세요.</p>`;
}

const US_MEGA_CAPS = [
  { ticker: 'AAPL',  name: 'Apple' },
  { ticker: 'MSFT',  name: 'Microsoft' },
  { ticker: 'GOOGL', name: 'Alphabet' },
  { ticker: 'AMZN',  name: 'Amazon' },
  { ticker: 'NVDA',  name: 'NVIDIA' },
  { ticker: 'META',  name: 'Meta' },
  { ticker: 'TSLA',  name: 'Tesla' },
];

const KOREAN_BLUE_CHIPS = [
  { ticker: '005930.KS', name: '삼성전자' },
  { ticker: '000660.KS', name: 'SK하이닉스' },
  { ticker: '373220.KS', name: 'LG에너지솔루션' },
  { ticker: '207940.KS', name: '삼성바이오로직스' },
  { ticker: '005380.KS', name: '현대차' },
  { ticker: '000270.KS', name: '기아' },
  { ticker: '035420.KS', name: 'NAVER' },
];

function periodButtonsHtml(activePeriod) {
  return PERIODS.map(([value, label]) => `<button type="button" data-period="${value}" class="${value === activePeriod ? 'active' : ''}">${label}</button>`).join('');
}

function chartCard(market) {
  return `
    <section class="home-market-card" data-market-card="${market.id}">
      <header class="home-market-card-head">
        <div>
          <div class="home-market-name">${market.name} <span>· ${market.ticker}</span></div>
          <div class="home-market-price-row">
            <strong data-price="${market.id}">--</strong>
            <em data-change="${market.id}">--</em>
          </div>
        </div>
        <div class="home-market-controls">
          <div class="home-market-periods" data-periods="${market.id}">${periodButtonsHtml('3mo')}</div>
          <button type="button" class="home-market-expand" data-expand="${market.id}" aria-label="${market.name} 차트 크게 보기" title="크게 보기">
            <i class="fa-solid fa-expand"></i>
          </button>
        </div>
      </header>
      <div class="home-market-chart-wrap">
        <div class="home-market-chart" data-chart="${market.id}"></div>
        <div class="home-market-loading" data-loading="${market.id}"><i class="fa-solid fa-spinner fa-spin"></i> 데이터 불러오는 중…</div>
        <div class="home-chart-ma20-badge"><span class="dot" style="background:${market.color}"></span>MA20 (20일 이동평균)</div>
      </div>
      <div class="home-market-macd-wrap">
        <div class="home-market-macd-label">MACD (12, 26, 9)</div>
        <div class="home-market-macd" data-macd="${market.id}"></div>
      </div>
      <footer class="home-market-foot">
        <span data-foot-label="${market.id}"><i class="fa-solid fa-chart-line"></i> ${barsFootLabel('3mo')}</span>
        <span data-source="${market.id}"></span>
      </footer>
    </section>`;
}

function chartModal() {
  return `
    <div class="home-chart-modal-backdrop" id="home-chart-modal" hidden>
      <section class="home-chart-modal" role="dialog" aria-modal="true" aria-labelledby="home-chart-modal-title" tabindex="-1">
        <header class="home-chart-modal-header">
          <div>
            <div class="home-market-name" id="home-chart-modal-title">--</div>
            <div class="home-market-price-row">
              <strong id="home-chart-modal-price">--</strong>
              <em id="home-chart-modal-change">--</em>
            </div>
          </div>
          <div class="home-market-controls">
            <div class="home-chart-search">
              <label class="home-chart-instrument-label" for="home-chart-modal-search">종목</label>
              <input id="home-chart-modal-search" class="home-chart-instrument-select" type="search" placeholder="종목명 또는 티커 검색" autocomplete="off" aria-label="종목명 또는 티커 검색">
              <div id="home-chart-search-results" class="home-chart-search-results" role="listbox" hidden></div>
            </div>
            <div class="home-market-periods home-chart-intervals" id="home-chart-modal-intervals" aria-label="분봉 간격">
              <button type="button" data-interval="1m">1분</button>
              <button type="button" data-interval="3m">3분</button>
              <button type="button" data-interval="5m">5분</button>
              <button type="button" data-interval="15m">15분</button>
              <button type="button" data-interval="30m">30분</button>
              <button type="button" data-interval="1h">1시간</button>
              <button type="button" data-interval="1d">일</button>
              <button type="button" data-interval="2y">2년</button>
              <button type="button" data-interval="5y">5년</button>
              <button type="button" data-interval="1wk">주</button>
              <button type="button" data-interval="1mo">월</button>
              <button type="button" data-interval="1y">Yearly</button>
            </div>
            <button type="button" class="home-chart-modal-close" aria-label="차트 닫기"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </header>
        <div class="home-chart-modal-body">
          <div class="home-market-chart-wrap home-chart-modal-chart-wrap">
            <div class="home-market-chart" id="home-chart-modal-chart"></div>
            <div class="home-market-loading" id="home-chart-modal-loading"><i class="fa-solid fa-spinner fa-spin"></i> 데이터 불러오는 중…</div>
            <div class="home-chart-ma20-badge" id="home-chart-modal-ma20-badge"><span class="dot"></span>MA20 (20봉 이동평균)</div>
          </div>
          <div class="home-market-macd-wrap">
            <div class="home-market-macd-label">MACD (12, 26, 9)</div>
            <div class="home-market-macd home-chart-modal-macd" id="home-chart-modal-macd"></div>
          </div>
          <div class="home-market-macd-wrap">
            <div class="home-market-macd-label">RSI (14)</div>
            <div class="home-market-macd home-chart-modal-rsi" id="home-chart-modal-rsi"></div>
          </div>
          <section class="home-chart-trend" aria-labelledby="home-chart-trend-title">
            <h3 id="home-chart-trend-title"><i class="fa-solid fa-chart-line"></i> 추세 해설 <small>기술적 참고 정보</small></h3>
            <div id="home-chart-modal-trend">데이터를 불러오는 중…</div>
          </section>
          <section class="home-chart-learning home-chart-ai" aria-labelledby="home-chart-learning-title">
            <header><h3 id="home-chart-learning-title"><i class="fa-solid fa-robot"></i> Qwen 차트 분석</h3><span id="home-chart-ai-model">Docker Ollama · Qwen</span></header>
            <div id="home-chart-ai-message" role="status" aria-live="polite">차트 데이터를 기다리고 있습니다.</div>
            <div class="home-chart-ai-actions"><small id="home-chart-ai-context"></small><button type="button" id="home-chart-ai-retry">분석 다시 요청</button></div>
          </section>
          <footer class="home-market-foot">
            <span id="home-chart-modal-foot-label"><i class="fa-solid fa-chart-line"></i> ${barsFootLabel('3mo', true)}</span>
            <span id="home-chart-modal-source"></span>
          </footer>
        </div>
      </section>
    </div>`;
}

function quotePanel(title, subtitle, items, region) {
  return `
    <section class="home-quote-panel" aria-label="${title} 대표 종목 시세">
      <header class="home-quote-panel-head">
        <div>
          <h2>${title}</h2>
          <p>${subtitle}</p>
        </div>
        <span class="home-quote-count">${items.length}종목</span>
      </header>
      <div class="home-quote-list" data-quote-list="${region}">
        ${items.map((item) => `
          <button type="button" class="home-quote-row is-loading" data-quote="${item.ticker}" aria-label="${item.name} 차트 크게 보기" title="클릭하여 차트 보기">
            <div class="home-quote-name"><strong>${item.name} <i class="fa-solid fa-chart-line" aria-hidden="true"></i></strong><span>${item.ticker} · 차트 보기</span></div>
            <div class="home-quote-value"><b>--</b><em>조회 중</em></div>
          </button>`).join('')}
      </div>
    </section>`;
}

function formatQuoteValue(value, region) {
  if (!Number.isFinite(value)) return '--';
  return region === 'kr'
    ? `${Math.round(value).toLocaleString()}원`
    : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function homeView(container) {
  container.innerHTML = `
    <div class="home-dashboard" id="home-dashboard">
      <div class="home-market-grid">${HOME_MARKETS.map(chartCard).join('')}</div>
      <section class="home-quote-dashboard" aria-labelledby="home-quote-title">
        <header class="home-quote-dashboard-head">
          <div>
            <h1 id="home-quote-title">대표 기업 주가</h1>
            <p>미국 매그니피센트 7과 한국 대표 코스피 7종목의 현재가·전일 대비입니다.</p>
          </div>
          <div class="home-quote-actions">
            <span id="home-quote-stamp">조회 전</span>
            <button type="button" id="home-quote-refresh"><i class="fa-solid fa-rotate-right"></i> 새로고침</button>
          </div>
        </header>
        <div class="home-quote-grid">
          ${quotePanel('미국', 'Magnificent Seven · USD', US_MEGA_CAPS, 'us')}
          ${quotePanel('한국', 'Korea Seven · 대표 KOSPI 기업 · KRW', KOREAN_BLUE_CHIPS, 'kr')}
        </div>
        <p class="home-quote-note">종목 행을 클릭하면 가격·거래량·이동평균·MACD·RSI를 포함한 차트 모달이 열립니다. Yahoo Finance 기준이며, 장중 시세는 지연되거나 시장이 닫힌 경우 마지막 거래 가격일 수 있습니다.</p>
      </section>
      ${chartModal()}
    </div>`;

  const charts = new Map();
  const macdCharts = new Map();
  const periods = new Map(HOME_MARKETS.map((market) => [market.id, '3mo']));
  let quoteAbortController = null;

  let modalMarket = null;
  const modalPeriod = '1d';
  let modalInterval = '1m';
  let modalChart = null;
  let modalMacdChart = null;
  let modalRsiChart = null;
  let modalTrigger = null;
  let modalAbortController = null;
  let modalSearchAbortController = null;
  let modalSearchTimer = null;
  let modalAnalysisController = null;
  let modalAnalysisData = null;

  function destroyChart(id) {
    const chart = charts.get(id);
    if (chart) {
      try { chart.destroy(); } catch {}
      charts.delete(id);
    }
    const macdChart = macdCharts.get(id);
    if (macdChart) {
      try { macdChart.destroy(); } catch {}
      macdCharts.delete(id);
    }
  }

  function destroyModalCharts() {
    if (modalChart) { try { modalChart.destroy(); } catch {} modalChart = null; }
    if (modalMacdChart) { try { modalMacdChart.destroy(); } catch {} modalMacdChart = null; }
    if (modalRsiChart) { try { modalRsiChart.destroy(); } catch {} modalRsiChart = null; }
  }

  async function loadChart(market) {
    const id = market.id;
    const period = periods.get(id);
    const card = container.querySelector(`[data-market-card="${id}"]`);
    const chartEl = card.querySelector(`[data-chart="${id}"]`);
    const macdEl = card.querySelector(`[data-macd="${id}"]`);
    const loading = card.querySelector(`[data-loading="${id}"]`);
    const price = card.querySelector(`[data-price="${id}"]`);
    const change = card.querySelector(`[data-change="${id}"]`);
    const source = card.querySelector(`[data-source="${id}"]`);
    const footLabel = card.querySelector(`[data-foot-label="${id}"]`);
    loading.style.display = 'flex';
    destroyChart(id);

    try {
      const response = await fetch(`/api/home/market-candle?market=${encodeURIComponent(id)}&period=${period}`);
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
      footLabel.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${barsFootLabel(period)}`;

      const series = computeChartSeries(ohlcv, data.display_from || null);

      const chart = new HomeFinancialChart(chartEl, buildCandleConfig(market, series, period, 250));
      charts.set(id, chart);
      await chart.render();

      const macdChart = new HomeFinancialChart(macdEl, buildMacdConfig(series, period, 110));
      macdCharts.set(id, macdChart);
      await macdChart.render();

      loading.style.display = 'none';
    } catch (error) {
      loading.innerHTML = `<span class="home-market-error">데이터 오류: ${describeChartError(error)}</span>`;
    }
  }

  async function analyzeModalChart(payload) {
    modalAnalysisController?.abort();
    const controller = new AbortController();
    modalAnalysisController = controller;
    const message = container.querySelector('#home-chart-ai-message');
    const context = container.querySelector('#home-chart-ai-context');
    const button = container.querySelector('#home-chart-ai-retry');
    message.textContent = 'Qwen이 현재 차트의 추세·보조지표·거래량을 분석하고 있습니다…';
    context.textContent = `${payload.name} · ${payload.interval}봉 · ${payload.is_simulated ? '시뮬레이션' : '지연 시세'} · 마지막 봉 ${payload.ohlcv.at(-1).date}`;
    button.disabled = true;
    try {
      let response;
      for (let attempt = 0; attempt < 31; attempt++) {
        if (controller.signal.aborted) return;
        response = await fetch('/api/home/chart-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal,
        });
        if (response.status !== 429 || attempt === 30) break;
        message.textContent = 'Qwen 분석 대기 중입니다. 앞선 분석이 끝나면 자동으로 이어집니다…';
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '차트 분석 요청을 처리하지 못했습니다.');
      if (controller.signal.aborted) return;
      message.textContent = data.message;
      container.querySelector('#home-chart-ai-model').textContent = `${data.provider} · ${data.model}`;
    } catch (error) {
      if (error.name !== 'AbortError') message.textContent = error.message;
    } finally {
      if (modalAnalysisController === controller) button.disabled = false;
    }
  }

  async function loadModalChart(market, period, interval) {
    const chartEl = container.querySelector('#home-chart-modal-chart');
    const macdEl = container.querySelector('#home-chart-modal-macd');
    const rsiEl = container.querySelector('#home-chart-modal-rsi');
    const loading = container.querySelector('#home-chart-modal-loading');
    const price = container.querySelector('#home-chart-modal-price');
    const change = container.querySelector('#home-chart-modal-change');
    const source = container.querySelector('#home-chart-modal-source');
    const footLabel = container.querySelector('#home-chart-modal-foot-label');
    const trend = container.querySelector('#home-chart-modal-trend');
    modalAnalysisController?.abort();
    modalAnalysisData = null;
    container.querySelector('#home-chart-ai-message').textContent = '차트 데이터를 불러오는 중…';
    container.querySelector('#home-chart-ai-context').textContent = '';
    container.querySelector('#home-chart-ai-retry').disabled = true;
    loading.style.display = 'flex';
    loading.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 데이터 불러오는 중…';
    modalAbortController?.abort();
    modalAbortController = new AbortController();
    const signal = modalAbortController.signal;
    destroyModalCharts();

    try {
      const response = await fetch(`/api/home/market-candle?market=${encodeURIComponent(market.id)}&period=${period}&interval=${interval}&ticker=${encodeURIComponent(market.ticker)}&timeframe=${interval}`, { signal });
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
      footLabel.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${barsFootLabel(period, true, interval)}`;

      const series = computeChartSeries(ohlcv, data.display_from || null);
      trend.innerHTML = trendAnalysis(ohlcv, interval);

      modalChart = new HomeFinancialChart(chartEl, buildCandleConfig(market, series, period, '100%', interval));
      await modalChart.render();

      modalMacdChart = new HomeFinancialChart(macdEl, buildMacdConfig(series, period, '100%', interval));
      await modalMacdChart.render();

      modalRsiChart = new HomeFinancialChart(rsiEl, buildRsiConfig(series, period, '100%', interval));
      await modalRsiChart.render();
      modalAnalysisData = { name: market.name, ticker: market.ticker, interval, is_simulated: Boolean(data.is_simulated), display_from: data.display_from || null, ohlcv };
      analyzeModalChart(modalAnalysisData);

      loading.style.display = 'none';
    } catch (error) {
      if (error.name === 'AbortError') return;
      trend.textContent = '추세 해설을 계산할 수 없습니다.';
      container.querySelector('#home-chart-ai-message').textContent = '차트 데이터가 없어 분석할 수 없습니다.';
      loading.innerHTML = `<span class="home-market-error">데이터 오류: ${describeChartError(error)}</span>`;
    }
  }

  container.querySelector('#home-chart-ai-retry').addEventListener('click', () => { if (modalAnalysisData) analyzeModalChart(modalAnalysisData); });
  const modalEl = container.querySelector('#home-chart-modal');
  const modalPanel = modalEl.querySelector('.home-chart-modal');
  const modalSearchInput = container.querySelector('#home-chart-modal-search');
  const modalSearchResults = container.querySelector('#home-chart-search-results');

  function updateModalHeader() {
    container.querySelector('#home-chart-modal-title').textContent = `${modalMarket.name} · ${modalMarket.ticker}`;
    container.querySelector('#home-chart-modal-ma20-badge .dot').style.background = modalMarket.color;
    container.querySelectorAll('#home-chart-modal-intervals [data-interval]').forEach((button) => {
      button.classList.toggle('active', button.dataset.interval === modalInterval);
    });
  }

  function openModal(market, trigger) {
    modalMarket = market;
    modalInterval = '1m';
    modalTrigger = trigger;
    updateModalHeader();
    modalEl.hidden = false;
    modalPanel.focus();
    loadModalChart(modalMarket, modalPeriod, modalInterval);
  }

  function closeModal() {
    modalEl.hidden = true;
    modalAbortController?.abort();
    modalAnalysisController?.abort();
    modalSearchAbortController?.abort();
    destroyModalCharts();
    modalTrigger?.focus();
    modalMarket = null;
  }

  [['us', US_MEGA_CAPS, '#0f766e'], ['kr', KOREAN_BLUE_CHIPS, '#0078d4']].forEach(([, stocks, color]) => {
    stocks.forEach((stock) => {
      const row = container.querySelector(`[data-quote="${stock.ticker}"]`);
      const showChart = () => openModal({ id: `quote-${stock.ticker}`, name: stock.name, ticker: stock.ticker, color }, row);
      row.addEventListener('click', showChart);
    });
  });

  modalEl.querySelector('.home-chart-modal-close').addEventListener('click', closeModal);
  modalEl.addEventListener('click', (event) => {
    if (event.target === modalEl) closeModal();
  });
  modalPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });
  container.querySelector('#home-chart-modal-intervals').addEventListener('click', (event) => {
    const button = event.target.closest('[data-interval]');
    if (!button || !modalMarket) return;
    modalInterval = button.dataset.interval;
    updateModalHeader();
    loadModalChart(modalMarket, modalPeriod, modalInterval);
  });
  modalSearchInput.addEventListener('input', () => {
    const query = modalSearchInput.value.trim();
    clearTimeout(modalSearchTimer);
    modalSearchAbortController?.abort();
    modalSearchResults.hidden = true;
    modalSearchResults.replaceChildren();
    if (!query) return;
    modalSearchTimer = setTimeout(async () => {
      modalSearchAbortController = new AbortController();
      try {
        const response = await fetch(`/api/home/chart-search?q=${encodeURIComponent(query)}`, { signal: modalSearchAbortController.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        (data.items || []).forEach((item) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'home-chart-search-result';
          button.setAttribute('role', 'option');
          button.textContent = `${item.name} · ${item.ticker}${item.exchange ? ` (${item.exchange})` : ''}`;
          button.addEventListener('click', () => {
            modalMarket = { id: item.ticker, name: item.name, ticker: item.ticker, color: '#0078d4' };
            modalSearchInput.value = '';
            modalSearchResults.hidden = true;
            updateModalHeader();
            loadModalChart(modalMarket, modalPeriod, modalInterval);
          });
          modalSearchResults.appendChild(button);
        });
        modalSearchResults.hidden = !modalSearchResults.childElementCount;
      } catch (error) {
        if (error.name !== 'AbortError') modalSearchResults.hidden = true;
      }
    }, 250);
  });

  HOME_MARKETS.forEach((market) => {
    container.querySelector(`[data-periods="${market.id}"]`).addEventListener('click', (event) => {
      const button = event.target.closest('[data-period]');
      if (!button) return;
      periods.set(market.id, button.dataset.period);
      container.querySelectorAll(`[data-periods="${market.id}"] [data-period]`).forEach((item) => item.classList.toggle('active', item === button));
      loadChart(market);
    });
    container.querySelector(`[data-expand="${market.id}"]`).addEventListener('click', (event) => {
      openModal(market, event.currentTarget);
    });
    loadChart(market);
  });

  async function loadQuotes() {
    const refreshButton = container.querySelector('#home-quote-refresh');
    const stamp = container.querySelector('#home-quote-stamp');
    quoteAbortController?.abort();
    quoteAbortController = new AbortController();
    refreshButton.disabled = true;
    refreshButton.classList.add('is-loading');
    stamp.textContent = '시세 조회 중…';

    try {
      const tickers = [...US_MEGA_CAPS, ...KOREAN_BLUE_CHIPS].map((item) => item.ticker);
      const response = await fetch('/api/market/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
        signal: quoteAbortController.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const quoteByTicker = new Map((data.items || []).map((item) => [item.ticker, item]));

      [['us', US_MEGA_CAPS], ['kr', KOREAN_BLUE_CHIPS]].forEach(([region, stocks]) => {
        stocks.forEach((stock) => {
          const row = container.querySelector(`[data-quote="${stock.ticker}"]`);
          const quote = quoteByTicker.get(stock.ticker);
          const value = row.querySelector('.home-quote-value b');
          const change = row.querySelector('.home-quote-value em');
          row.classList.remove('is-loading');
          if (!quote || quote.status !== 'ok') {
            row.classList.add('is-error');
            value.textContent = '조회 불가';
            change.textContent = '잠시 후 재시도';
            return;
          }
          const changePct = Number(quote.change_pct) || 0;
          const isUp = changePct >= 0;
          row.classList.remove('is-error');
          value.textContent = formatQuoteValue(Number(quote.value), region);
          change.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(changePct).toFixed(2)}%`;
          change.className = isUp ? 'is-up' : 'is-down';
        });
      });
      const fetchedAt = data.fetched_at ? new Date(data.fetched_at) : null;
      stamp.textContent = fetchedAt && !Number.isNaN(fetchedAt.valueOf())
        ? `조회 ${fetchedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
        : '조회 완료';
    } catch (error) {
      if (error.name !== 'AbortError') stamp.textContent = '시세 조회 실패';
    } finally {
      refreshButton.disabled = false;
      refreshButton.classList.remove('is-loading');
    }
  }

  container.querySelector('#home-quote-refresh').addEventListener('click', loadQuotes);
  loadQuotes();

  window._viewCleanup = () => {
    quoteAbortController?.abort();
    modalAnalysisController?.abort();
    charts.forEach((chart) => {
      try { chart.destroy(); } catch {}
    });
    macdCharts.forEach((chart) => {
      try { chart.destroy(); } catch {}
    });
    destroyModalCharts();
  };
}
