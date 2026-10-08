import { cloudResourceCard } from './cloudAiResources.js';

// ── 공통 UI 유틸 ──────────────────────────────────────────────────────────────
function tabShell(title, desc, tabs) {
  return `
    <div style="margin-bottom:18px;">
      <h1 style="font-weight:700;color:#111;margin-bottom:5px;">
        <i class="fa-solid fa-chart-line"></i> ${title}
      </h1>
      <p style="font-size:0.88rem;color:#757575;line-height:1.6;margin:0;">${desc}</p>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:18px;border-bottom:2px solid #f0f0f0;padding-bottom:0;">
      ${tabs.map((t, i) => `
        <button class="tc-tab" data-tab="${i}" style="
          padding:8px 14px;border:none;border-radius:6px 6px 0 0;cursor:pointer;
          font-size:0.82rem;font-weight:600;transition:all .12s;
          background:${i === 0 ? '#0078d4' : '#f5f5f5'};
          color:${i === 0 ? '#fff' : '#555'};">
          ${t}
        </button>`).join('')}
    </div>
    <div id="tc-content"></div>`;
}

function activateTab(container, idx, renders) {
  container.querySelectorAll('.tc-tab').forEach((b, i) => {
    b.style.background = i === idx ? '#0078d4' : '#f5f5f5';
    b.style.color      = i === idx ? '#fff'    : '#555';
  });
  renders[idx](container.querySelector('#tc-content'));
}

function card(title, icon, body, accent = '#0078d4') {
  return `<div style="background:#fff;border-radius:10px;padding:20px;margin-bottom:16px;
                      border:1px solid #e8e8e8;border-left:3px solid ${accent};box-shadow:0 1px 4px rgba(0,0,0,.05);">
    <h3 style="font-size:0.95rem;font-weight:700;color:#111;margin:0 0 14px;">
      <i class="${icon}" style="color:${accent};margin-right:7px;"></i>${title}
    </h3>${body}</div>`;
}

function info(html, color = '#0078d4') {
  return `<div style="background:${color}0d;border:1px solid ${color}30;border-radius:7px;
                      padding:11px 14px;font-size:0.85rem;color:#333;line-height:1.65;margin-bottom:14px;">${html}</div>`;
}

function pill(label, color) {
  return `<span style="display:inline-block;background:${color}12;color:${color};border:1px solid ${color}33;
                       border-radius:20px;padding:2px 10px;font-size:0.75rem;font-weight:600;margin:2px;">${label}</span>`;
}

// ── ApexCharts 헬퍼 ───────────────────────────────────────────────────────────

function destroyCharts(state) {
  (state._charts || []).forEach(c => { try { c.destroy(); } catch (e) {} });
  state._charts = [];
}

function trackChart(state, inst) {
  if (!state._charts) state._charts = [];
  state._charts.push(inst);
  return inst;
}

const APEX_FONT = 'Pretendard, -apple-system, "Malgun Gothic", sans-serif';

class ApexCandleBuilder {
  constructor(el, prices, height = 320) {
    this.el = typeof el === 'string' ? document.querySelector(el) : el;
    this.prices = prices;
    this.height = height;
    this._series  = [{ name: 'OHLC', type: 'candlestick', data: prices.map(p => ({ x: p.date, y: [p.o, p.h, p.l, p.c] })) }];
    this._colors  = ['#107c10'];
    this._widths  = [1];
    this._dashes  = [0];
    this._yAnno   = [];
    this._ptAnno  = [];
  }

  addLine(data, color = '#0078d4', name = '') {
    this._series.push({ name: name || `L${this._series.length}`, type: 'line',
      data: data.map((v, i) => ({ x: this.prices[i]?.date ?? i, y: v ?? null })) });
    this._colors.push(color); this._widths.push(1.6); this._dashes.push(0);
    return this;
  }

  addBand(upper, lower, color = '#9e9e9e') {
    this._series.push({ name: 'BB_U', type: 'line',
      data: upper.map((v, i) => ({ x: this.prices[i]?.date ?? i, y: v ?? null })) });
    this._series.push({ name: 'BB_L', type: 'line',
      data: lower.map((v, i) => ({ x: this.prices[i]?.date ?? i, y: v ?? null })) });
    this._colors.push(color, color); this._widths.push(1, 1); this._dashes.push(5, 5);
    return this;
  }

  addTrendLine(x1, y1, x2, y2, color = '#f59e0b', dash = []) {
    const len = Math.max(1, x2 - x1);
    this._series.push({ name: 'Trend', type: 'line',
      data: this.prices.map((p, i) => i < x1 || i > x2
        ? { x: p.date, y: null }
        : { x: p.date, y: y1 + (y2 - y1) * (i - x1) / len })
    });
    this._colors.push(color); this._widths.push(1.5); this._dashes.push(dash.length ? 6 : 0);
    return this;
  }

  addHLine(y, color = '#9e9e9e', dash = [4, 3], label = '') {
    this._yAnno.push({
      y, strokeDashArray: 4, borderColor: color, borderWidth: 1.2,
      ...(label ? { label: { text: label, position: 'left',
        style: { background: 'transparent', color, fontSize: '10px', fontWeight: '600', padding: { left: 0, right: 4 } } } } : {})
    });
    return this;
  }

  addArrow(xi, label, color = '#107c10', dir = 1) {
    if (xi < 0 || xi >= this.prices.length) return this;
    const p = this.prices[xi];
    this._ptAnno.push({
      x: p.date,
      y: dir > 0 ? p.l * 0.993 : p.h * 1.007,
      marker: { size: 5, fillColor: color, strokeColor: '#fff', strokeWidth: 1.5 },
      label: { text: `${dir > 0 ? '▲' : '▼'} ${label}`, position: dir > 0 ? 'bottom' : 'top',
        style: { background: color, color: '#fff', fontSize: '9px', fontWeight: '700',
          padding: { top: 2, bottom: 2, left: 5, right: 5 }, borderRadius: 4 } }
    });
    return this;
  }

  addWaveLabel(xi, label, color = '#a855f7') {
    if (xi < 0 || xi >= this.prices.length) return this;
    const p = this.prices[xi];
    this._ptAnno.push({
      x: p.date, y: p.h * 1.013,
      marker: { size: 4, fillColor: color, strokeColor: '#fff', strokeWidth: 1 },
      label: { text: label, position: 'top',
        style: { background: color, color: '#fff', fontSize: '11px', fontWeight: '700',
          padding: { top: 2, bottom: 2, left: 6, right: 6 }, borderRadius: 12 } }
    });
    return this;
  }

  render() {
    const inst = new ApexCharts(this.el, {
      chart: {
        type: 'candlestick', height: this.height,
        toolbar: { show: false }, zoom: { enabled: false },
        background: '#fff', animations: { enabled: false }, fontFamily: APEX_FONT,
      },
      series: this._series,
      plotOptions: { candlestick: { colors: { upward: '#107c10', downward: '#c50f1f' }, wick: { useFillColor: true } } },
      colors: this._colors,
      stroke: { curve: 'smooth', width: this._widths, dashArray: this._dashes },
      xaxis: {
        type: 'category',
        labels: { style: { fontSize: '10px', colors: '#9e9e9e', fontFamily: APEX_FONT },
          hideOverlappingLabels: true, rotate: 0 },
        axisBorder: { show: false }, axisTicks: { show: false }, tickAmount: 8,
      },
      yaxis: { labels: { formatter: v => v != null ? Math.round(v).toLocaleString() : '',
        style: { fontSize: '10px', colors: '#9e9e9e', fontFamily: APEX_FONT } } },
      grid: { borderColor: '#f0f0f0', strokeDashArray: 3, padding: { top: 0, right: 10 } },
      annotations: { yaxis: this._yAnno, points: this._ptAnno },
      legend: { show: false }, theme: { mode: 'light' },
      tooltip: { shared: false, intersect: true },
    });
    inst.render();
    return inst;
  }
}

function createMiniLine(el, series, { min, max, height = 110, refLines = [] } = {}) {
  const inst = new ApexCharts(el, {
    chart: { type: 'line', height, toolbar: { show: false }, zoom: { enabled: false },
      background: '#fff', animations: { enabled: false }, fontFamily: APEX_FONT },
    series: series.map(s => ({ name: s.name || '', data: s.data.map((v, i) => ({ x: i, y: v ?? null })) })),
    stroke: { curve: 'smooth', width: series.map(s => s.width || 1.5) },
    colors: series.map(s => s.color || '#8b5cf6'),
    xaxis: { type: 'numeric', labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { min, max, tickAmount: 3,
      labels: { formatter: v => v != null ? Math.round(v) : '', style: { fontSize: '9px', colors: '#9e9e9e', fontFamily: APEX_FONT } } },
    annotations: { yaxis: refLines.map(r => ({ y: r.v, strokeDashArray: 3, borderColor: r.c, borderWidth: 1 })) },
    grid: { borderColor: '#f5f5f5', strokeDashArray: 3, padding: { top: 0, bottom: 0, left: 4, right: 4 } },
    legend: { show: false }, tooltip: { enabled: false }, theme: { mode: 'light' },
  });
  inst.render();
  return inst;
}

// ── 가격 데이터 생성기 ─────────────────────────────────────────────────────────
function genPrices(n = 80, start = 50000, seed = 42, scenario = 'trend_up') {
  let rng = seed;
  const rand  = () => { rng = (rng * 1664525 + 1013904223) % 2 ** 32; return rng / 2 ** 32; };
  const randn = () => { const u = rand(), v = rand(); return Math.sqrt(-2 * Math.log(u + 1e-10)) * Math.cos(2 * Math.PI * v); };
  const prices = [];
  let price = start, vol = start * 0.02;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 0; i < n; i++) {
    let drift = 0;
    if (scenario === 'trend_up')   drift = price * 0.004;
    if (scenario === 'trend_down') drift = -price * 0.004;
    if (scenario === 'sideways')   drift = (i % 20 < 10 ? 1 : -1) * price * 0.001;
    if (scenario === 'wave') { const ph = i / n * Math.PI * 2; drift = Math.sin(ph) * price * 0.006 + (i < n * 0.6 ? price * 0.003 : -price * 0.002); }
    const chg = drift + randn() * vol;
    const o = price, c = Math.max(o * 0.85, o + chg);
    const hi = Math.max(o, c) * (1 + rand() * 0.015);
    const lo = Math.min(o, c) * (1 - rand() * 0.015);
    const m = months[Math.floor(i / 7) % 12], d = (i % 28) + 1;
    prices.push({ o, h: hi, l: lo, c, v: Math.floor(rand() * 1e6 + 2e5), date: `${m}${d}` });
    price = c; vol = vol * 0.95 + Math.abs(chg) * 0.05;
  }
  return prices;
}

// ── 지표 계산 ─────────────────────────────────────────────────────────────────
function calcMA(prices, n) {
  return prices.map((_, i) => i < n - 1 ? null : prices.slice(i - n + 1, i + 1).reduce((s, p) => s + p.c, 0) / n);
}
function calcRSI(prices, n = 14) {
  const d = prices.map((_, i) => i === 0 ? 0 : prices[i].c - prices[i - 1].c);
  return prices.map((_, i) => {
    if (i < n) return null;
    const sl = d.slice(i - n + 1, i + 1);
    const g = sl.filter(v => v > 0).reduce((s, v) => s + v, 0) / n;
    const l = -sl.filter(v => v < 0).reduce((s, v) => s + v, 0) / n;
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  });
}
function calcBB(prices, n = 20) {
  const mid   = calcMA(prices, n);
  const upper = prices.map((_, i) => { if (i < n - 1) return null; const sl = prices.slice(i - n + 1, i + 1).map(p => p.c); const m = sl.reduce((s, v) => s + v, 0) / n; return m + 2 * Math.sqrt(sl.reduce((s, v) => s + (v - m) ** 2, 0) / n); });
  const lower = prices.map((_, i) => { if (i < n - 1) return null; const sl = prices.slice(i - n + 1, i + 1).map(p => p.c); const m = sl.reduce((s, v) => s + v, 0) / n; return m - 2 * Math.sqrt(sl.reduce((s, v) => s + (v - m) ** 2, 0) / n); });
  return { mid, upper, lower };
}
function calcMACD(prices, f = 12, s = 26, sig = 9) {
  const ema = (data, span) => { const k = 2 / (span + 1), out = []; data.forEach((v, i) => out.push(i === 0 ? v : out[i - 1] * (1 - k) + v * k)); return out; };
  const closes = prices.map(p => p.c);
  const e12 = ema(closes, f), e26 = ema(closes, s);
  const macd = e12.map((v, i) => i < s - 1 ? null : v - e26[i]);
  const sigLine = ema(macd.map(v => v ?? 0), sig).map((v, i) => macd[i] == null ? null : v);
  return { macd, signal: sigLine };
}

// ── ① 기업 선정 ──────────────────────────────────────────────────────────────
function renderStockSelect(content, state) {
  destroyCharts(state);
  const companies = [
    { name: '삼성전자',      ticker: '005930.KS', sector: '반도체·IT',  tags: ['대형주', '배당', '수출'],   scenario: 'trend_up',   start: 71000  },
    { name: 'SK하이닉스',    ticker: '000660.KS', sector: '반도체',      tags: ['사이클', 'HBM'],          scenario: 'wave',       start: 168000 },
    { name: 'NAVER',         ticker: '035420.KS', sector: '플랫폼',      tags: ['광고', '커머스'],          scenario: 'sideways',   start: 165000 },
    { name: '현대차',        ticker: '005380.KS', sector: '자동차·EV',   tags: ['EV전환', '배당'],          scenario: 'trend_up',   start: 230000 },
    { name: 'LG에너지솔루션', ticker: '373220.KS', sector: '2차전지',     tags: ['EV배터리'],               scenario: 'wave',       start: 380000 },
    { name: '카카오',        ticker: '035720.KS', sector: '플랫폼·핀테크', tags: ['구독', '핀테크'],          scenario: 'trend_down', start: 40000  },
    { name: '셀트리온',      ticker: '068270.KS', sector: '바이오',      tags: ['바이오시밀러'],             scenario: 'sideways',   start: 165000 },
    { name: '삼성바이오로직스', ticker: '207940.KS', sector: '바이오',    tags: ['CMO'],                    scenario: 'trend_up',   start: 850000 },
  ];

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:20px;">
      ${companies.map((c, i) => `
        <div class="stock-card" data-idx="${i}" style="background:#fff;border-radius:10px;padding:16px;
             border:2px solid ${state.selected === i ? '#0078d4' : '#e8e8e8'};cursor:pointer;transition:all .12s;
             box-shadow:${state.selected === i ? '0 0 0 3px #0078d420' : 'none'};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <div>
              <div style="font-size:0.95rem;font-weight:700;color:#111;">${c.name}</div>
              <div style="font-size:0.78rem;color:#9e9e9e;">${c.ticker}</div>
            </div>
            <span style="background:#e3f2fd;color:#0078d4;border-radius:5px;padding:2px 8px;font-size:0.75rem;font-weight:600;">${c.sector}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">${c.tags.map(t => pill(t, '#757575')).join('')}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.8rem;color:#bdbdbd;">시뮬레이션 추세</span>
            <span style="font-size:0.8rem;font-weight:600;color:${c.scenario === 'trend_up' ? '#107c10' : c.scenario === 'trend_down' ? '#c50f1f' : c.scenario === 'wave' ? '#a855f7' : '#f59e0b'};">
              ${c.scenario === 'trend_up' ? '↑ 상승' : c.scenario === 'trend_down' ? '↓ 하락' : c.scenario === 'wave' ? '〜 파동' : '─ 횡보'}
            </span>
          </div>
          ${state.selected === i ? `<div style="margin-top:8px;padding:4px 8px;background:#e3f2fd;border-radius:5px;font-size:0.78rem;color:#0078d4;font-weight:600;"><i class="fa-solid fa-check"></i> 선택됨 — 나머지 탭에서 분석 가능</div>` : ''}
        </div>`).join('')}
    </div>
    <div id="stock-preview" style="${state.selected == null ? 'display:none' : ''}">
      ${state.selected != null ? renderStockPreview(companies[state.selected]) : ''}
    </div>`;

  content.querySelectorAll('.stock-card').forEach(el => {
    el.addEventListener('click', () => {
      state.selected = +el.dataset.idx;
      state.company  = companies[state.selected];
      renderStockSelect(content, state);
    });
  });
}

function renderStockPreview(c) {
  return card(`${c.name} — 분석 미리보기`, 'fa-solid fa-magnifying-glass-chart', `
    ${info(`<strong>${c.name} (${c.ticker})</strong>를 선택했습니다. 위 탭에서 추세, 이동평균, 캔들패턴, 지표, 파동 분석을 순서대로 실습하세요.`, '#0078d4')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
      ${[['섹터', c.sector, '#0078d4'], ['추세 유형', c.scenario, '#a855f7'], ['기준가격', c.start.toLocaleString() + '원', '#107c10']].map(([l, v, col]) => `
        <div style="background:#fafafa;border-radius:8px;padding:12px;text-align:center;border:1px solid #f0f0f0;">
          <div style="font-size:0.75rem;color:#9e9e9e;margin-bottom:4px;">${l}</div>
          <div style="font-size:0.92rem;font-weight:700;color:${col};">${v}</div>
        </div>`).join('')}
    </div>`, '#0078d4');
}

// ── ② 추세분석 ───────────────────────────────────────────────────────────────
function renderTrend(content, state) {
  destroyCharts(state);
  const c = state.company;
  const prices = genPrices(80, c.start, 7, c.scenario);

  content.innerHTML = card('추세분석 — 추세선 · 채널 · 강도', 'fa-solid fa-arrow-trend-up', `
    ${info(`<strong>분석 기업: ${c.name}</strong> | 추세선 = 연속 저점/고점 연결 | 채널 = 추세선 + 평행선 | ADX > 25 = 강한 추세`, '#107c10')}
    <div id="cv-trend" style="width:100%;min-height:340px;"></div>
    <div id="trend-signal" style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;"></div>
    <div style="margin-top:16px;">
      <div style="font-size:0.85rem;font-weight:700;color:#111;margin-bottom:10px;">추세 판단 기준</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.83rem;">
          <tr style="background:#fafafa;">
            <th style="padding:8px 10px;text-align:left;color:#757575;border-bottom:1px solid #f0f0f0;">구분</th>
            <th style="padding:8px 10px;text-align:left;color:#757575;border-bottom:1px solid #f0f0f0;">조건</th>
            <th style="padding:8px 10px;text-align:left;color:#757575;border-bottom:1px solid #f0f0f0;">매매 관점</th>
          </tr>
          ${[['상승추세','HH·HL 연속, MA 정배열, ADX>25','추세선 저점 매수 / 채널 상단 이익실현'],
             ['하락추세','LH·LL 연속, MA 역배열, ADX>25','현물 보유자는 비중·손실 한도 점검 / 공매도는 별도 위험관리 필요'],
             ['횡보','가격이 박스권 내 등락, ADX<20','박스권 하단 매수, 상단 이익실현'],
             ['추세 전환','추세선 종가 이탈 + 거래량 폭증','포지션 축소 후 신추세 확인 대기']].map(([g, cd, m]) => `
            <tr style="border-bottom:1px solid #f5f5f5;">
              <td style="padding:8px 10px;color:#111;font-weight:600;">${g}</td>
              <td style="padding:8px 10px;color:#555;">${cd}</td>
              <td style="padding:8px 10px;color:#0078d4;font-size:0.8rem;">${m}</td>
            </tr>`).join('')}
        </table>
      </div>
    </div>`, '#107c10');

  requestAnimationFrame(() => {
    const el = content.querySelector('#cv-trend');
    if (!el) return;
    const ma20 = calcMA(prices, 20), ma60 = calcMA(prices, 60);
    const lows = prices.map(p => p.l), highs = prices.map(p => p.h);
    const li1 = 10, li2 = 40, hi1 = 5, hi2 = 35;
    const inst = new ApexCandleBuilder(el, prices, 340)
      .addLine(ma20, '#0078d4', 'MA20')
      .addLine(ma60, '#c50f1f', 'MA60')
      .addTrendLine(li1, lows[li1],  li2, lows[li2],  '#107c10')
      .addTrendLine(hi1, highs[hi1], hi2, highs[hi2], '#107c10', [4, 3])
      .render();
    trackChart(state, inst);

    const last = prices[prices.length - 1].c, m20 = ma20[ma20.length - 1], m60 = ma60[ma60.length - 1];
    const trend = last > m20 && m20 > m60 ? '상승추세' : last < m20 && m20 < m60 ? '하락추세' : '횡보/전환';
    const tColor = trend === '상승추세' ? '#107c10' : trend === '하락추세' ? '#c50f1f' : '#f59e0b';
    const hh = prices.slice(-20).every((_, i, a) => i === 0 || a[i].h >= a[i - 1].h * 0.97);
    content.querySelector('#trend-signal').innerHTML = [
      ['현재 추세', trend, tColor], ['MA 배열', m20 > m60 ? '정배열(강세)' : '역배열(약세)', m20 > m60 ? '#107c10' : '#c50f1f'],
      ['고저점 구조', hh ? 'HH·HL (상승)' : 'LH·LL (하락)', hh ? '#107c10' : '#c50f1f'],
      ['현재가 vs MA20', last > m20 ? 'MA20 위' : 'MA20 아래', last > m20 ? '#107c10' : '#c50f1f'],
    ].map(([l, v, c]) => `
      <div style="background:#fafafa;border-radius:8px;padding:12px;text-align:center;border:1px solid #f0f0f0;">
        <div style="font-size:0.75rem;color:#9e9e9e;margin-bottom:4px;">${l}</div>
        <div style="font-size:0.9rem;font-weight:700;color:${c};">${v}</div>
      </div>`).join('');
  });
}

// ── ③ 이동평균선 ──────────────────────────────────────────────────────────────
function renderMA(content, state) {
  destroyCharts(state);
  const c = state.company;
  const prices = genPrices(80, c.start, 13, c.scenario);
  const ma5 = calcMA(prices, 5), ma20 = calcMA(prices, 20), ma60 = calcMA(prices, 60);

  content.innerHTML = card('이동평균선 — 골든크로스 · 데드크로스 · 정배열', 'fa-solid fa-chart-line', `
    ${info(`MA5(단기)·MA20(중기)·MA60(장기)의 배열과 크로스 신호를 확인합니다. 골든크로스(단기↑장기)는 상승 전환 신호입니다.`, '#0078d4')}
    <div id="cv-ma" style="width:100%;min-height:320px;"></div>
    <div id="ma-signals" style="margin-top:14px;"></div>`, '#0078d4');

  requestAnimationFrame(() => {
    const el = content.querySelector('#cv-ma');
    if (!el) return;
    const builder = new ApexCandleBuilder(el, prices, 320)
      .addLine(ma5,  '#107c10', 'MA5')
      .addLine(ma20, '#0078d4', 'MA20')
      .addLine(ma60, '#c50f1f', 'MA60');
    ma20.forEach((v, i) => {
      if (i < 1 || v == null || ma60[i] == null) return;
      if (ma20[i - 1] < ma60[i - 1] && ma20[i] >= ma60[i]) builder.addArrow(i, '골든', '#107c10', 1);
      if (ma20[i - 1] > ma60[i - 1] && ma20[i] <= ma60[i]) builder.addArrow(i, '데드', '#c50f1f', -1);
    });
    trackChart(state, builder.render());

    const m5 = ma5[ma5.length - 1], m20 = ma20[ma20.length - 1], m60 = ma60[ma60.length - 1];
    const last = prices[prices.length - 1].c;
    const crossType = m20 > m60 ? '골든크로스 상태' : '데드크로스 상태';
    const arr = m20 > m60 ? '정배열' : '역배열';
    content.querySelector('#ma-signals').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">
        ${[['MA5', m5, '#107c10'], ['MA20', m20, '#0078d4'], ['MA60', m60, '#c50f1f'],
           ['배열상태', arr, m20 > m60 ? '#107c10' : '#c50f1f'],
           ['크로스', crossType, m20 > m60 ? '#107c10' : '#c50f1f']].map(([l, v, col]) => `
          <div style="background:#fafafa;border:1px solid #f0f0f0;border-radius:8px;padding:11px;text-align:center;">
            <div style="font-size:0.75rem;color:#9e9e9e;margin-bottom:4px;">${l}</div>
            <div style="font-size:0.88rem;font-weight:700;color:${col};">${typeof v === 'number' ? Math.round(v).toLocaleString() + '원' : v}</div>
          </div>`).join('')}
      </div>
      ${info(`<strong>실전 전략:</strong> ${m20 > m60
        ? `정배열 — MA5가 MA20 위를 유지하는 동안의 조정은 ‘눌림목’으로 불리기도 합니다. 단, MA20 터치만으로 매수 기회가 확정되지는 않습니다.`
        : `역배열 — 반등 시 MA20이 저항. 데드크로스 확인 후 현금 보유 전략.`}`, '#0078d4')}`;
  });
}

// ── ④ 캔들 패턴 ───────────────────────────────────────────────────────────────
function renderCandle(content, state) {
  destroyCharts(state);
  const patterns = [
    { name: '망치봉 (Hammer)',    signal: '반등', color: '#107c10', desc: '하락 추세 말단에서 아래 꼬리가 몸통의 2배 이상. 매도세가 매수세에 밀린 증거.', cond: '하락 추세 + 지지선 근처 + 거래량 증가', target: '직전 저항선', stop: '망치봉 저가 이하' },
    { name: '베어리쉬 엔걸핑',     signal: '하락', color: '#c50f1f', desc: '큰 음봉이 전날 양봉 몸통 전체를 감싸며 매도 압력 폭증 신호.', cond: '상승 추세 + 저항선 근처 + 거래량 증가', target: '직전 지지선', stop: '음봉 고가 이상' },
    { name: '도지 (Doji)',        signal: '전환', color: '#f59e0b', desc: '시가=종가. 매수·매도 균형. 추세 방향에 따라 전환 또는 조정 신호.', cond: '추세 말단 + 지지·저항 근처', target: '다음봉 방향 확인 후 진입', stop: '도지 고·저가 이탈' },
    { name: '샛별 (Morning Star)', signal: '반등', color: '#107c10', desc: '음봉→소형봉→양봉 3캔들. 바닥 반전의 강한 신호.', cond: '하락 추세 말단 + 과매도', target: '38.2%~61.8% 되돌림', stop: '첫 음봉 저가' },
    { name: '이브닝스타',          signal: '하락', color: '#c50f1f', desc: '양봉→소형봉→음봉. 상단 반전의 강한 신호. 샛별의 반대.', cond: '상승 추세 말단 + 과매수', target: '38.2% 되돌림', stop: '첫 양봉 고가' },
    { name: '불리쉬 엔걸핑',       signal: '반등', color: '#107c10', desc: '큰 양봉이 전날 음봉 전체를 감쌈. 강한 매수 전환.', cond: '하락 추세 + 지지선', target: '직전 고점', stop: '음봉 저가' },
  ];
  const selectedPat = state.pat ?? 0;
  const p = patterns[selectedPat];

  content.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
      ${patterns.map((pt, i) => `
        <button class="pat-btn" data-idx="${i}" style="padding:7px 14px;border-radius:20px;cursor:pointer;font-size:0.82rem;font-weight:600;
          border:1px solid ${state.pat === i ? pt.color : '#e8e8e8'};
          background:${state.pat === i ? pt.color + '14' : '#fff'};color:${state.pat === i ? pt.color : '#555'};">
          ${pt.name}
        </button>`).join('')}
    </div>
    ${card(p.name, 'fa-solid fa-chart-candlestick', `
      ${info(`<strong>신호:</strong> ${p.signal === '반등' ? '<i class="fa-solid fa-arrow-trend-up"></i> 매수 신호' : '<i class="fa-solid fa-arrow-trend-down"></i> 매도 신호'} &nbsp;|&nbsp; ${p.desc}`, p.signal === '반등' ? '#107c10' : '#c50f1f')}
      <div id="cv-candle" style="width:100%;min-height:280px;"></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px;">
        ${[['진입 조건', p.cond, '#0078d4'], ['목표가', p.target, '#107c10'], ['손절', p.stop, '#c50f1f']].map(([l, v, c]) => `
          <div style="background:#fafafa;border-radius:8px;padding:12px;border-left:3px solid ${c};">
            <div style="font-size:0.75rem;color:#9e9e9e;margin-bottom:4px;">${l}</div>
            <div style="font-size:0.82rem;color:#111;line-height:1.5;">${v}</div>
          </div>`).join('')}
      </div>`, p.color)}`;

  content.querySelectorAll('.pat-btn').forEach(btn => {
    btn.addEventListener('click', () => { state.pat = +btn.dataset.idx; renderCandle(content, state); });
  });

  requestAnimationFrame(() => {
    const el = content.querySelector('#cv-candle');
    if (!el) return;
    const cp = state.company;
    const prices = genPrices(40, cp.start, 19 + selectedPat, selectedPat % 2 === 0 ? 'trend_up' : 'trend_down');
    const ma20 = calcMA(prices, 20);
    const mid = prices.length - 3;
    const inst = new ApexCandleBuilder(el, prices, 280)
      .addLine(ma20, '#0078d4')
      .addArrow(mid, p.signal === '반등' ? '↑패턴' : '↓패턴', p.signal === '반등' ? '#107c10' : '#c50f1f', p.signal === '반등' ? 1 : -1)
      .render();
    trackChart(state, inst);
  });
}

// ── ⑤ 보조지표 ────────────────────────────────────────────────────────────────
function renderIndicators(content, state) {
  destroyCharts(state);
  const c = state.company;
  const prices = genPrices(80, c.start, 31, c.scenario);
  const rsi = calcRSI(prices);
  const { macd, signal: macdSig } = calcMACD(prices);
  const { mid, upper, lower } = calcBB(prices);

  content.innerHTML = card('보조지표 — RSI · MACD · 볼린저밴드', 'fa-solid fa-gauge-high', `
    ${info(`RSI(과매수/과매도) · MACD(추세 전환) · 볼린저밴드(변동성·밴드 위치)를 함께 보면 신호 신뢰도가 높아집니다.`, '#a855f7')}
    <div id="cv-ind" style="width:100%;min-height:280px;"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
      <div>
        <div style="font-size:0.82rem;font-weight:600;color:#555;margin-bottom:6px;">RSI (14)</div>
        <div id="cv-rsi" style="width:100%;min-height:110px;"></div>
      </div>
      <div>
        <div style="font-size:0.82rem;font-weight:600;color:#555;margin-bottom:6px;">MACD (12,26,9)</div>
        <div id="cv-macd" style="width:100%;min-height:110px;"></div>
      </div>
    </div>
    <div id="ind-signal" style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;"></div>`, '#a855f7');

  requestAnimationFrame(() => {
    const elMain = content.querySelector('#cv-ind');
    if (!elMain) return;

    trackChart(state, new ApexCandleBuilder(elMain, prices, 280)
      .addLine(mid, '#0078d4', 'MA20')
      .addBand(upper, lower, '#9e9e9e')
      .render());

    const elRsi = content.querySelector('#cv-rsi');
    if (elRsi) trackChart(state, createMiniLine(elRsi,
      [{ data: rsi, color: '#8b5cf6', name: 'RSI' }],
      { min: 0, max: 100, height: 110, refLines: [{ v: 70, c: '#c50f1f' }, { v: 30, c: '#107c10' }] }
    ));

    const elMacd = content.querySelector('#cv-macd');
    if (elMacd) {
      const mRange = Math.max(...macd.filter(v => v != null).map(Math.abs)) * 1.5 || 1;
      trackChart(state, createMiniLine(elMacd,
        [{ data: macd, color: '#0078d4', name: 'MACD' }, { data: macdSig, color: '#f59e0b', name: 'Signal', width: 1 }],
        { min: -mRange, max: mRange, height: 110, refLines: [{ v: 0, c: '#9e9e9e' }] }
      ));
    }

    const lastRsi  = rsi.filter(v => v != null).slice(-1)[0];
    const lastMacd = macd.filter(v => v != null).slice(-1)[0];
    const lastSig  = macdSig.filter(v => v != null).slice(-1)[0];
    const lastC    = prices[prices.length - 1].c;
    const lUp      = upper.filter(v => v != null).slice(-1)[0];
    const lLo      = lower.filter(v => v != null).slice(-1)[0];
    const bbPct    = ((lastC - lLo) / (lUp - lLo) * 100).toFixed(0);
    const rsiSig   = lastRsi > 70 ? '과매수 <i class="fa-solid fa-triangle-exclamation"></i>' : lastRsi < 30 ? '과매도 <i class="fa-solid fa-check"></i>' : '중립';
    const macdSigTxt = lastMacd > lastSig ? '골든크로스 ↑' : '데드크로스 ↓';

    content.querySelector('#ind-signal').innerHTML = [
      ['RSI', lastRsi.toFixed(1), lastRsi > 70 ? '#c50f1f' : lastRsi < 30 ? '#107c10' : '#9e9e9e'],
      ['RSI 신호', rsiSig, lastRsi > 70 ? '#c50f1f' : lastRsi < 30 ? '#107c10' : '#9e9e9e'],
      ['MACD 신호', macdSigTxt, lastMacd > lastSig ? '#107c10' : '#c50f1f'],
      ['BB 위치', `${bbPct}%`, +bbPct > 70 ? '#c50f1f' : +bbPct < 30 ? '#107c10' : '#9e9e9e'],
    ].map(([l, v, c]) => `
      <div style="background:#fafafa;border:1px solid #f0f0f0;border-radius:8px;padding:11px;text-align:center;">
        <div style="font-size:0.75rem;color:#9e9e9e;margin-bottom:4px;">${l}</div>
        <div style="font-size:0.9rem;font-weight:700;color:${c};">${v}</div>
      </div>`).join('');
  });
}

// ── ⑥ 엘리어트 파동 ──────────────────────────────────────────────────────────
function renderElliott(content, state) {
  destroyCharts(state);
  const c = state.company;
  const prices = genPrices(80, c.start, 37, 'wave');

  content.innerHTML = card('엘리어트 파동 — 충격5파 + 조정3파 분석', 'fa-solid fa-wave-square', `
    ${info(`주가가 추세 방향으로 5파(충격파) + 반대 방향으로 3파(조정파: a-b-c)로 움직인다는 이론입니다.`, '#a855f7')}
    <div id="cv-elliott" style="width:100%;min-height:340px;"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:16px;">
      ${[['1파','첫 상승, 인지 어려움','하락 추세 속 반등으로 보임','#60a5fa'],
         ['2파','1파 되돌림(최대 61.8%)','1파 시작점 이탈 시 파동 무효','#3b82f6'],
         ['3파','가장 강하고 긴 파동','거래량 폭발, 추격 매수','#1d4ed8'],
         ['4파','2차 조정(1파 고점 불침범)','3파 보유자 일부 차익실현','#7c3aed'],
         ['5파','마지막 상승, 다이버전스','거래량 줄고 RSI 다이버전스','#a855f7'],
         ['abc조정','상승분 38.2~61.8% 되돌림','c파에서 새 진입 기회 탐색','#9e9e9e'],
        ].map(([wave, desc, tip, col]) => `
        <div style="background:#fafafa;border-radius:8px;padding:12px;border-left:3px solid ${col};border:1px solid #f0f0f0;border-left-width:3px;">
          <div style="font-size:0.92rem;font-weight:700;color:${col};margin-bottom:4px;">${wave}</div>
          <div style="font-size:0.8rem;color:#111;margin-bottom:4px;">${desc}</div>
          <div style="font-size:0.76rem;color:#9e9e9e;">${tip}</div>
        </div>`).join('')}
    </div>`, '#a855f7');

  requestAnimationFrame(() => {
    const el = content.querySelector('#cv-elliott');
    if (!el) return;
    const ma20 = calcMA(prices, 20);
    const builder = new ApexCandleBuilder(el, prices, 340).addLine(ma20, '#9e9e9e');
    const waveIdx = [5, 15, 30, 42, 52, 65, 75];
    const labels  = ['1', '2', '3', '4', '5', 'a', 'b'];
    const colors  = ['#60a5fa', '#3b82f6', '#1d4ed8', '#7c3aed', '#a855f7', '#c50f1f', '#f59e0b'];
    waveIdx.forEach((xi, i) => { if (xi < prices.length) builder.addWaveLabel(xi, labels[i], colors[i]); });
    const lo = prices[0].l, hi = prices.slice(0, 55).reduce((m, p) => Math.max(m, p.h), 0);
    [38.2, 61.8].forEach(lvl => builder.addHLine(hi - (hi - lo) * lvl / 100, '#a855f7', [3, 3], `Fib ${lvl}%`));
    trackChart(state, builder.render());
  });
}

// ── ⑦ 종합 신호 ──────────────────────────────────────────────────────────────
function renderSummary(content, state) {
  destroyCharts(state);
  const c = state.company;
  const prices = genPrices(80, c.start, 43, c.scenario);
  const ma20 = calcMA(prices, 20), ma60 = calcMA(prices, 60);
  const rsi  = calcRSI(prices);
  const { macd, signal: macdSig } = calcMACD(prices);
  const { upper, lower } = calcBB(prices);

  const lastC = prices[prices.length - 1].c;
  const lm20 = ma20[ma20.length - 1], lm60 = ma60[ma60.length - 1];
  const lRsi  = rsi.filter(v => v != null).slice(-1)[0];
  const lMacd = macd.filter(v => v != null).slice(-1)[0];
  const lSig  = macdSig.filter(v => v != null).slice(-1)[0];
  const lUp   = upper.filter(v => v != null).slice(-1)[0];
  const lLo   = lower.filter(v => v != null).slice(-1)[0];
  const bbPct = (lastC - lLo) / (lUp - lLo);

  const signals = [
    { name: '추세(MA정배열)',   bull: lm20 > lm60,    score: lm20 > lm60 ? 1 : -1 },
    { name: '가격 vs MA20',    bull: lastC > lm20,   score: lastC > lm20 ? 1 : -1 },
    { name: 'RSI',             bull: lRsi < 50,      score: lRsi < 30 ? 2 : lRsi > 70 ? -2 : lRsi < 50 ? 0.5 : -0.5 },
    { name: 'MACD',            bull: lMacd > lSig,   score: lMacd > lSig ? 1 : -1 },
    { name: '볼린저밴드 위치',  bull: bbPct < 0.5,    score: bbPct < 0.2 ? 2 : bbPct > 0.8 ? -2 : 0 },
  ];
  const total   = signals.reduce((s, sg) => s + sg.score, 0);
  const opinion = total >= 2 ? '매수 우세' : total <= -2 ? '매도 우세' : '중립';
  const opColor = total >= 2 ? '#107c10' : total <= -2 ? '#c50f1f' : '#f59e0b';

  content.innerHTML = card(`${c.name} 기술적 분석 종합 리포트`, 'fa-solid fa-file-chart-column', `
    ${info(`5개 기술적 지표를 종합해 현재 매수/매도/중립 신호를 판단합니다. 단일 지표가 아닌 복수 지표의 방향 일치도를 보는 것이 핵심입니다.`, '#111')}
    <div id="cv-summary" style="width:100%;min-height:280px;"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:16px 0;">
      ${signals.map(sg => `
        <div style="background:#fafafa;border-radius:8px;padding:12px;border-left:3px solid ${sg.score > 0 ? '#107c10' : sg.score < 0 ? '#c50f1f' : '#9e9e9e'};border:1px solid #f0f0f0;border-left-width:3px;">
          <div style="font-size:0.75rem;color:#9e9e9e;margin-bottom:4px;">${sg.name}</div>
          <div style="font-size:0.9rem;font-weight:700;color:${sg.score > 0 ? '#107c10' : sg.score < 0 ? '#c50f1f' : '#f59e0b'};">
            ${sg.score > 0 ? '↑ 강세' : '↓ 약세'}
          </div>
        </div>`).join('')}
    </div>
    <div style="padding:18px;border-radius:10px;border:2px solid ${opColor};background:${opColor}0d;text-align:center;">
      <div style="font-size:0.78rem;color:#9e9e9e;margin-bottom:6px;">종합 기술적 의견</div>
      <div style="font-size:1.4rem;font-weight:800;color:${opColor};">${opinion}</div>
      <div style="font-size:0.8rem;color:#555;margin-top:4px;">종합 스코어: ${total.toFixed(1)} | 기준: +2이상=매수우세, -2이하=매도우세</div>
    </div>
    <div style="margin-top:14px;padding:12px;background:#fafafa;border-radius:8px;font-size:0.8rem;color:#757575;line-height:1.65;border:1px solid #f0f0f0;">
      <i class="fa-solid fa-triangle-exclamation"></i> 본 분석은 시뮬레이션 데이터 기반 교육용 리포트입니다.
    </div>`, '#111');

  requestAnimationFrame(() => {
    const el = content.querySelector('#cv-summary');
    if (!el) return;
    trackChart(state, new ApexCandleBuilder(el, prices, 280)
      .addLine(ma20, '#0078d4')
      .addLine(ma60, '#c50f1f')
      .addBand(upper, lower, '#9e9e9e')
      .render());
  });
}

// ── 메인 진입점 ───────────────────────────────────────────────────────────────
export function technicalChartView(container) {
  const state = {
    selected: 0,
    company: { name: '삼성전자', ticker: '005930.KS', sector: '반도체·IT', scenario: 'trend_up', start: 71000 },
    pat: 0,
    _charts: [],
  };

  const TABS = ['① 기업 선정', '② 추세분석', '③ 이동평균', '④ 캔들패턴', '⑤ 보조지표', '⑥ 엘리어트파동', '⑦ 종합리포트'];
  const renders = [
    c => renderStockSelect(c, state),
    c => renderTrend(c, state),
    c => renderMA(c, state),
    c => renderCandle(c, state),
    c => renderIndicators(c, state),
    c => renderElliott(c, state),
    c => renderSummary(c, state),
  ];

  container.innerHTML = tabShell('기술적 분석 실습',
    '기업 선정부터 추세·이동평균·캔들패턴·보조지표·엘리어트파동·종합리포트까지 단계별로 실습합니다.', TABS)
    + cloudResourceCard('technical-chart');

  // 다른 화면으로 이동할 때 이 화면이 만든 ApexCharts 인스턴스를 정리 (resize 리스너가
  // 살아남아 사라진 컨테이너를 대상으로 NaN width 에러를 내는 것을 방지)
  window._viewCleanup = () => destroyCharts(state);

  container.querySelectorAll('.tc-tab').forEach((btn, i) => {
    btn.addEventListener('click', () => activateTab(container, i, renders));
  });

  renders[0](container.querySelector('#tc-content'));
}
