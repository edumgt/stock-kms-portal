import { api } from '../api.js';

export function portfolioView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:var(--text); margin-bottom:6px;"><i class="fa-solid fa-briefcase"></i> 포트폴리오 최적화</h1>
      <p style="font-size:0.875rem; color:#94a3b8; line-height:1.6;">
        몬테카를로 시뮬레이션으로 효율적 프론티어를 도출하고 샤프 비율 최적 및 위험균등 포트폴리오를 계산합니다.
      </p>
    </div>
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; margin-bottom:20px;">
        <div>
          <label class="param-label">자산 수</label>
          <input id="pf-assets" type="number" value="5" min="5" max="5" class="param-input" disabled/>
        </div>
        <div>
          <label class="param-label">시뮬레이션 수</label>
          <input id="pf-sims" type="number" value="3000" min="500" max="10000" class="param-input"/>
        </div>
        <div>
          <label class="param-label">무위험 수익률</label>
          <input id="pf-rf" type="number" value="0.02" min="0" max="0.1" step="0.005" class="param-input"/>
        </div>
      </div>
      <button class="run-btn" id="pf-run">▶ 포트폴리오 최적화</button>
      <div id="pf-result" style="margin-top:20px;"></div>
    </div>`;

  container.querySelector('#pf-run').addEventListener('click', async () => {
    const btn = container.querySelector('#pf-run');
    const result = container.querySelector('#pf-result');
    btn.disabled = true; btn.textContent = '계산 중...';
    result.innerHTML = '<p style="color:#94a3b8;">효율적 프론티어 계산 중...</p>';
    try {
      const data = await api.portfolio({
        n_simulations: +container.querySelector('#pf-sims').value,
        risk_free:   +container.querySelector('#pf-rf').value,
      });
      let html = '';
      if (data.image) html += `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:20px;"/>`;

      if (data.optimal_weights) {
        const sharpe = {
          weights: data.optimal_weights,
          metrics: { 'Return': data.optimal_return, 'Volatility': data.optimal_vol, 'Sharpe': data.optimal_sharpe },
        };
        html += renderPortfolioCard('샤프 비율 최적 포트폴리오', sharpe, '#3b82f6');
      }
      if (data.riskparity_weights) {
        const rp = { weights: data.riskparity_weights, metrics: {} };
        html += renderPortfolioCard('위험 균등 (Risk Parity)', rp, '#22c55e');
      }
      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = '▶ 포트폴리오 최적화';
    }
  });
}

function renderPortfolioCard(title, pf, color) {
  const weights = pf.weights || {};
  const metrics = pf.metrics || {};
  const wRows = Object.entries(weights).map(([k, v]) => `
    <tr>
      <td style="padding:6px 10px; color:#e2e8f0;">${k}</td>
      <td style="padding:6px 10px; color:${color}; font-weight:600;">${(v * 100).toFixed(1)}%</td>
    </tr>`).join('');
  const mBoxes = Object.entries(metrics).map(([k, v]) => `
    <div class="metric-box">
      <div style="font-size:0.7rem; color:#64748b; text-transform:uppercase; margin-bottom:4px;">${k.replace(/_/g,' ')}</div>
      <div style="font-size:1rem; font-weight:700; color:${color};">${typeof v === 'number' ? v.toFixed(4) : v}</div>
    </div>`).join('');
  return `
    <div style="background:#0f172a; border-radius:10px; padding:16px; margin-bottom:16px; border:1px solid #334155;">
      <div style="font-size:0.875rem; font-weight:600; color:${color}; margin-bottom:12px;">${title}</div>
      <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:12px;">${mBoxes}</div>
      <table style="width:100%; font-size:0.825rem; border-collapse:collapse;">
        <thead><tr>
          <th style="padding:6px 10px; text-align:left; color:#64748b; font-size:0.7rem;">자산</th>
          <th style="padding:6px 10px; text-align:left; color:#64748b; font-size:0.7rem;">비중</th>
        </tr></thead>
        <tbody>${wRows}</tbody>
      </table>
    </div>`;
}
