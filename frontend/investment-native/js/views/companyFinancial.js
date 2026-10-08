import { api } from '../api.js';
import {
  renderFinancialDashboard,
  legendDot,
} from '../utils/financialCharts.js';

function escapeHtml(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function companyFinancialView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:760;color:#131722;margin-bottom:8px;">
        <i class="fa-solid fa-chart-pie"></i> 기업 파이낸셜 분석
      </h1>
      <p style="font-size:0.88rem;color:#6b7280;line-height:1.65;">
        상장기업 티커를 입력하면 성과·수익전환·부채·어닝 차트를 한 화면에서 확인합니다.
        미국 주식 <code>AAPL</code>, 한국 주식 <code>005930.KS</code> 형식을 사용합니다.
      </p>
    </div>

    <section style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
      <div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;">
        <div>
          <label class="param-label">티커 심볼</label>
          <input id="cf-ticker" type="text" value="AAPL" class="param-input"
            placeholder="예: AAPL, 005930.KS, TSLA" style="width:180px;" />
        </div>
        <div>
          <label class="param-label">기간</label>
          <div style="display:flex;border:1.5px solid #d1d5db;border-radius:8px;overflow:hidden;">
            <button id="cf-annual"
              style="padding:7px 16px;font-size:0.82rem;background:#2563eb;color:#fff;border:none;cursor:pointer;">연간</button>
            <button id="cf-quarterly"
              style="padding:7px 16px;font-size:0.82rem;background:#fff;color:#374151;border:none;cursor:pointer;">분기별</button>
          </div>
        </div>
        <button class="run-btn" id="cf-run">
          <i class="fa-solid fa-magnifying-glass"></i> 조회
        </button>
      </div>
      <p style="font-size:0.78rem;color:#9ca3af;margin:10px 0 0;">
        한국 주식: <code>.KS</code>(코스피) 또는 <code>.KQ</code>(코스닥) suffix 필요. 데이터: Yahoo Finance
      </p>
    </section>

    <div id="cf-company-header" style="display:none;margin-bottom:4px;padding:12px 18px;
      background:#fff;border:1px solid #e2e8f0;border-radius:10px;
      display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;"></div>

    <div id="cf-result"></div>
  `;

  const tickerInput  = container.querySelector('#cf-ticker');
  const runBtn       = container.querySelector('#cf-run');
  const annualBtn    = container.querySelector('#cf-annual');
  const quarterlyBtn = container.querySelector('#cf-quarterly');
  const header       = container.querySelector('#cf-company-header');
  const result       = container.querySelector('#cf-result');

  let currentPeriod = 'annual';

  function setPeriod(p) {
    currentPeriod = p;
    const isAnn = p === 'annual';
    annualBtn.style.background    = isAnn ? '#2563eb' : '#fff';
    annualBtn.style.color         = isAnn ? '#fff'    : '#374151';
    quarterlyBtn.style.background = isAnn ? '#fff'    : '#2563eb';
    quarterlyBtn.style.color      = isAnn ? '#374151' : '#fff';
  }

  annualBtn.addEventListener('click',    () => setPeriod('annual'));
  quarterlyBtn.addEventListener('click', () => setPeriod('quarterly'));

  async function fetchData() {
    const ticker = tickerInput.value.trim().toUpperCase();
    if (!ticker) { result.innerHTML = '<p style="color:#ef4444;">티커를 입력하세요.</p>'; return; }

    runBtn.disabled = true;
    runBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 조회 중';
    result.innerHTML = `<p style="color:#6b7280;padding:20px 0;">
      <i class="fa-solid fa-spinner fa-spin"></i>&nbsp; ${escapeHtml(ticker)} 재무 데이터 로딩 중…</p>`;
    header.style.display = 'none';

    try {
      const data = await api.companyFinancials({ ticker, period: currentPeriod });

      header.style.display = 'flex';
      header.innerHTML = `
        <div>
          <span style="font-size:1.1rem;font-weight:700;color:#131722;">${escapeHtml(data.name)}</span>
          <span style="margin-left:8px;font-size:0.82rem;color:#6b7280;">${escapeHtml(data.ticker)}</span>
          <span style="margin-left:6px;font-size:0.78rem;color:#9ca3af;">${escapeHtml(data.currency)}</span>
        </div>
        <span style="font-size:0.78rem;color:#9ca3af;">${data.period === 'annual' ? '연간' : '분기별'} 데이터</span>
      `;

      renderFinancialDashboard(result, data);
    } catch (err) {
      result.innerHTML = `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;color:#b91c1c;">
          <strong>조회 실패</strong>
          <p style="margin:6px 0 0;font-size:0.85rem;">${escapeHtml(err.message)}</p>
          <p style="margin:6px 0 0;font-size:0.82rem;color:#6b7280;">
            예시: 미국 <code>AAPL</code> / 한국 <code>005930.KS</code>(삼성전자)
          </p>
        </div>`;
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> 조회';
    }
  }

  runBtn.addEventListener('click', fetchData);
  tickerInput.addEventListener('keydown', e => { if (e.key === 'Enter') fetchData(); });
  fetchData();
}
