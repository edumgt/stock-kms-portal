import { api } from '../api.js';

const TABS = [
  { symbol: 'hyundai', label: '현대자동차 (005380)' },
  { symbol: 'samsung', label: '삼성전자 (005930)' },
  { symbol: 'samsung-em', label: '삼성전기 (009150)' },
];

const STAT_CARDS = [
  ['Net Profit', '순수익'],
  ['Compounding Annual Return', '연복리 수익률'],
  ['Sharpe Ratio', 'Sharpe Ratio'],
  ['Sortino Ratio', 'Sortino Ratio'],
  ['Drawdown', '최대 낙폭(MDD)'],
  ['Win Rate', '승률'],
  ['Total Orders', '총 주문 수'],
  ['Total Fees', '총 수수료'],
];

function fmtDate(iso) {
  return iso ? iso.slice(0, 10) : '-';
}

function drawEquityCurve(canvas, points) {
  const width = Math.max(360, canvas.parentElement.clientWidth - 2);
  const height = 220;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * dpr; canvas.height = height * dpr;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!points.length) {
    ctx.fillStyle = '#64748b'; ctx.font = '13px sans-serif'; ctx.fillText('표시할 자산 곡선 데이터가 없습니다.', 16, height / 2);
    return;
  }
  const left = 16; const right = 16; const top = 16; const bottom = 28;
  const values = points.map((p) => p.equity);
  const min = Math.min(...values); const max = Math.max(...values); const gap = Math.max(max - min, 1);
  const x = (i) => left + i * (width - left - right) / Math.max(points.length - 1, 1);
  const y = (v) => top + (max - v) / gap * (height - top - bottom);

  ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(left, height - bottom); ctx.lineTo(width - right, height - bottom); ctx.stroke();

  ctx.beginPath();
  points.forEach((p, i) => { const px = x(i); const py = y(p.equity); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.lineTo(x(points.length - 1), height - bottom); ctx.lineTo(x(0), height - bottom); ctx.closePath();
  ctx.fillStyle = 'rgba(37,99,235,.14)'; ctx.fill();

  ctx.beginPath();
  points.forEach((p, i) => { const px = x(i); const py = y(p.equity); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2.2; ctx.stroke();

  ctx.fillStyle = '#94a3b8'; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'start';
  ctx.fillText(`시작 ${Math.round(values[0]).toLocaleString('ko-KR')}`, left, height - 8);
  ctx.textAlign = 'end';
  ctx.fillText(`종료 ${Math.round(values[values.length - 1]).toLocaleString('ko-KR')}`, width - right, height - 8);
}

function renderResult(target, data) {
  const stats = data.statistics || {};
  const isPositive = String(stats['Net Profit'] || '').trim().startsWith('-') === false;
  target.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin-bottom:16px;">
      <div>
        <h2 style="margin:0 0 4px; font-weight:700; color:var(--text);">${data.label} <span style="color:#64748b; font-weight:500; font-size:.85rem;">(${data.code})</span></h2>
        <p style="margin:0; color:#94a3b8; font-size:.82rem;">${data.strategy_name} · ${fmtDate(data.start_date)} ~ ${fmtDate(data.end_date)}</p>
      </div>
      <span style="padding:5px 12px; border-radius:20px; font-size:.75rem; font-weight:700; background:${data.status === 'Completed' ? 'rgba(34,197,94,.15)' : 'rgba(148,163,184,.15)'}; color:${data.status === 'Completed' ? '#22c55e' : '#94a3b8'};">
        <i class="fa-solid ${data.status === 'Completed' ? 'fa-circle-check' : 'fa-circle-question'}"></i> ${data.status === 'Completed' ? 'LEAN 백테스트 완료' : (data.status || '상태 미확인')}
      </span>
    </div>
    <p style="margin:0 0 18px; padding:12px 14px; background:#1e293b; border:1px solid #334155; border-radius:10px; color:#cbd5e1; font-size:.82rem; line-height:1.55;">
      <i class="fa-solid fa-flask" style="color:#3b82f6;"></i> ${data.strategy_note}
    </p>
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:12px; margin-bottom:20px;">
      ${STAT_CARDS.map(([key, label]) => `
        <div class="metric-box">
          <div style="font-size:.68rem; color:#64748b; margin-bottom:4px;">${label}</div>
          <div style="font-size:1rem; font-weight:700; color:${key === 'Net Profit' ? (isPositive ? '#22c55e' : '#ef4444') : 'var(--text)'};">${stats[key] ?? '-'}</div>
        </div>`).join('')}
    </div>
    <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:14px;">
      <div style="font-size:.78rem; color:#94a3b8; margin-bottom:8px;"><i class="fa-solid fa-chart-line"></i> 자산(Equity) 곡선</div>
      <canvas data-quant-chart aria-label="LEAN 백테스트 자산 변화 곡선"></canvas>
    </div>
    <p style="margin:16px 0 0; padding:11px 12px; background:rgba(250,204,21,.08); border:1px solid rgba(250,204,21,.35); border-radius:9px; color:#fbbf24; font-size:.75rem; line-height:1.55;">
      <i class="fa-solid fa-circle-info"></i> 이 결과는 QuantConnect LEAN 엔진으로 미리 실행해 둔 백테스트 산출물(<code>lean-hyundai</code>/<code>lean-samsung</code>/<code>lean-samsung-electro-mechanics</code> 및 그 결과 폴더)을 그대로 보여 주는 학습용 자료입니다. 실시간 시세가 아니며, 실제 매매 수수료·세금·슬리피지·상장폐지 등을 모두 반영하지 않았으므로 투자 판단의 근거로 사용하지 마세요.
    </p>`;
  drawEquityCurve(target.querySelector('[data-quant-chart]'), data.equity_curve || []);
  window.addEventListener('resize', () => drawEquityCurve(target.querySelector('[data-quant-chart]'), data.equity_curve || []));
}

async function loadSymbol(container, symbol) {
  const target = container.querySelector('#quant-content');
  target.innerHTML = '<p style="color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> LEAN 백테스트 결과를 불러오는 중...</p>';
  try {
    const data = await api.quantLean(symbol);
    renderResult(target, data);
  } catch (error) {
    target.innerHTML = `<p style="color:#ef4444;">결과를 불러오지 못했습니다: ${error.message}</p>`;
  }
}

export function quantView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:var(--text); margin-bottom:6px;"><i class="fa-solid fa-chart-simple"></i> Quant · LEAN 백테스트 리포트</h1>
      <p style="font-size:0.875rem; color:#94a3b8; line-height:1.6;">
        QuantConnect LEAN 엔진으로 실행한 현대자동차·삼성전자·삼성전기 백테스트 결과를 확인합니다.
      </p>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:20px; border-bottom:1px solid #334155;">
      ${TABS.map((tab, i) => `
        <button class="quant-tab" data-symbol="${tab.symbol}"
          style="padding:9px 18px; border:none; border-radius:8px 8px 0 0; cursor:pointer;
                 font-size:0.825rem; font-weight:600; transition:all 0.15s;
                 background:${i === 0 ? '#2563eb' : '#1e293b'};
                 color:${i === 0 ? '#fff' : '#94a3b8'};">
          ${tab.label}
        </button>`).join('')}
    </div>
    <div id="quant-content"></div>`;

  container.querySelectorAll('.quant-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.quant-tab').forEach((b) => {
        const active = b === btn;
        b.style.background = active ? '#2563eb' : '#1e293b';
        b.style.color = active ? '#fff' : '#94a3b8';
      });
      loadSymbol(container, btn.dataset.symbol);
    });
  });

  loadSymbol(container, TABS[0].symbol);
}
