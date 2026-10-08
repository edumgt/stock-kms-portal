import { api } from '../api.js';

const TICKER_OPTIONS = [
  { value: "^TNX",     label: "미국 10년물 금리 (^TNX)" },
  { value: "CL=F",     label: "WTI 유가 (CL=F)" },
  { value: "^GSPC",    label: "S&P 500 (^GSPC)" },
  { value: "^KS11",    label: "KOSPI (^KS11)" },
  { value: "GC=F",     label: "금 Gold (GC=F)" },
  { value: "EURUSD=X", label: "EUR/USD 환율" },
  { value: "BTC-USD",  label: "Bitcoin (BTC-USD)" },
  { value: "^IRX",     label: "미국 단기금리 3M (^IRX)" },
  { value: "^VIX",     label: "VIX 공포지수" },
  { value: "DX-Y.NYB", label: "달러 인덱스 (DXY)" },
];

const PERIODS = [
  { value: "1mo",  label: "1개월" },
  { value: "3mo",  label: "3개월" },
  { value: "6mo",  label: "6개월" },
  { value: "1y",   label: "1년" },
  { value: "2y",   label: "2년" },
  { value: "5y",   label: "5년" },
];

const DEFAULT_TICKERS = ["^TNX", "CL=F", "^GSPC", "^KS11", "GC=F", "EURUSD=X"];

function formatTimestamp(ts) {
  if (!ts) return '--';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function macroRealtimeView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:#131722; margin-bottom:6px;"><i class="fa-solid fa-globe"></i> 거시경제현황 1 — 실시간 데이터</h1>
      <p style="font-size:0.875rem; color:#6b7280; line-height:1.6;">
        Yahoo Finance에서 금리·유가·환율·주가지수 등 거시경제 지표를 실시간으로 가져와 추세, 상관관계, 수익률을 분석합니다.
      </p>
    </div>

    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155; margin-bottom:16px;">
      <!-- 종목 선택 -->
      <div style="margin-bottom:16px;">
        <label class="param-label" style="margin-bottom:8px; display:block;">조회 종목 선택 (복수 선택 가능)</label>
        <div id="ticker-grid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:8px;">
          ${TICKER_OPTIONS.map(t => `
            <label style="display:flex; align-items:center; gap:8px; padding:8px 12px;
                   background:#0f172a; border-radius:8px; cursor:pointer;
                   border:1px solid #334155; font-size:0.8rem; color:#94a3b8;
                   transition:border-color 0.15s;"
                   onmouseover="this.style.borderColor='#3b82f6'"
                   onmouseout="this.style.borderColor='#334155'">
              <input type="checkbox" value="${t.value}"
                     ${DEFAULT_TICKERS.includes(t.value) ? 'checked' : ''}
                     style="accent-color:#3b82f6; width:14px; height:14px;"/>
              <span>${t.label}</span>
            </label>`).join('')}
        </div>
      </div>

      <!-- 기간 선택 -->
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
        <label class="param-label" style="margin:0;">조회 기간:</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;" id="period-btns">
          ${PERIODS.map((p, i) => `
            <button data-period="${p.value}"
                    style="padding:6px 14px; border-radius:6px; border:1px solid #334155;
                           background:${p.value === '1y' ? '#2563eb' : '#0f172a'};
                           color:${p.value === '1y' ? '#fff' : '#94a3b8'};
                           font-size:0.8rem; cursor:pointer; transition:all 0.15s;"
                    class="period-btn">${p.label}</button>`).join('')}
        </div>
      </div>

      <button class="run-btn" id="macro-run">▶ 조회 및 분석</button>
      <div id="macro-result" style="margin-top:24px;"></div>
    </div>`;

  // Period button toggle
  let selectedPeriod = '1y';
  container.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPeriod = btn.dataset.period;
      container.querySelectorAll('.period-btn').forEach(b => {
        b.style.background = b === btn ? '#2563eb' : '#0f172a';
        b.style.color      = b === btn ? '#fff'    : '#94a3b8';
      });
    });
  });

  container.querySelector('#macro-run').addEventListener('click', async () => {
    const btn    = container.querySelector('#macro-run');
    const result = container.querySelector('#macro-result');

    const tickers = [...container.querySelectorAll('#ticker-grid input:checked')].map(el => el.value);
    if (!tickers.length) {
      result.innerHTML = '<p style="color:#ef4444;">최소 1개 종목을 선택하세요.</p>';
      return;
    }

    btn.disabled = true; btn.textContent = '데이터 수신 중...';
    result.innerHTML = `<p style="color:#94a3b8;">Yahoo Finance에서 데이터를 수신 중입니다... (10~20초 소요)</p>`;

    try {
      const data = await api.macroRealtime({ tickers, period: selectedPeriod });

      let html = '';
      html += `
        <div style="margin-bottom:12px; font-size:0.78rem; color:#94a3b8;">
          조회 시각: <strong style="color:#e2e8f0;">${formatTimestamp(data.fetched_at)}</strong>
        </div>`;
      if (data.is_simulated) {
        html += `<div style="margin-bottom:14px; padding:10px 14px; background:#422006; border:1px solid #92400e;
                             border-radius:8px; font-size:0.82rem; color:#fde68a; display:flex; gap:8px; align-items:center;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>${data.warning}</span>
        </div>`;
      }
      if (data.image) {
        html += `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:20px;"/>`;
      }

      if (data.summary) {
        html += `
          <div style="font-size:0.75rem; font-weight:600; color:#64748b; text-transform:uppercase;
               letter-spacing:0.08em; margin-bottom:12px;">종목별 요약</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px;">
            ${Object.entries(data.summary).map(([name, s]) => {
              const isPos = s.return_pct >= 0;
              return `
                <div style="background:#0f172a; border-radius:10px; padding:14px; border:1px solid #334155;">
                  <div style="font-size:0.75rem; color:#64748b; margin-bottom:6px; word-break:break-word;">${name}</div>
                  <div style="font-size:1.1rem; font-weight:700; color:#e2e8f0; margin-bottom:4px;">${s.current.toLocaleString()}</div>
                  <div style="font-size:0.8rem; font-weight:600; color:${isPos ? '#22c55e' : '#ef4444'};">
                    ${isPos ? '▲' : '▼'} ${Math.abs(s.return_pct).toFixed(2)}%
                  </div>
                  <div style="font-size:0.7rem; color:#64748b; margin-top:4px;">데이터 시각 ${formatTimestamp(s.latest_data_at)}</div>
                  <div style="font-size:0.7rem; color:#64748b; margin-top:4px;">연환산 변동성 ${s.annual_vol_pct.toFixed(1)}%</div>
                </div>`;
            }).join('')}
          </div>`;
      }
      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = '▶ 조회 및 분석';
    }
  });
}
