import { api } from '../api.js';

export function riskView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:var(--text); margin-bottom:6px;"><i class="fa-solid fa-shield-halved"></i> 리스크 분석 (VaR / CVaR)</h1>
      <p style="font-size:0.875rem; color:#94a3b8; line-height:1.6;">
        정규분포 및 역사적 시뮬레이션을 통해 Value at Risk와 Conditional VaR(Expected Shortfall)를 계산합니다.
      </p>
    </div>
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; margin-bottom:20px;">
        <div>
          <label class="param-label">포트폴리오 가치 ($)</label>
          <input id="risk-pv" type="number" value="1000000" min="1000" class="param-input"/>
        </div>
        <div>
          <label class="param-label">신뢰수준 (%)</label>
          <input id="risk-conf" type="number" value="95" min="90" max="99" class="param-input"/>
        </div>
        <div>
          <label class="param-label">연간 변동성 (σ)</label>
          <input id="risk-vol" type="number" value="0.2" min="0.01" max="1.0" step="0.01" class="param-input"/>
        </div>
        <div>
          <label class="param-label">시뮬레이션 일수</label>
          <input id="risk-days" type="number" value="252" min="30" max="1260" class="param-input"/>
        </div>
      </div>
      <button class="run-btn" id="risk-run">▶ VaR 계산</button>
      <div id="risk-result" style="margin-top:20px;"></div>
    </div>`;

  container.querySelector('#risk-run').addEventListener('click', async () => {
    const btn = container.querySelector('#risk-run');
    const result = container.querySelector('#risk-result');
    btn.disabled = true; btn.textContent = '계산 중...';
    result.innerHTML = '<p style="color:#94a3b8;">리스크 분석 중...</p>';
    try {
      const data = await api.risk({
        portfolio_value: +container.querySelector('#risk-pv').value,
        confidence:      +container.querySelector('#risk-conf').value / 100,
        volatility:      +container.querySelector('#risk-vol').value,
        n_days:          +container.querySelector('#risk-days').value,
      });
      let html = '';
      if (data.image) html += `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:16px;"/>`;

      const pv = +container.querySelector('#risk-pv').value;
      const metrics = [
        { label: `VaR ${container.querySelector('#risk-conf').value}%`, value: data.var_pct != null ? `${(data.var_pct*100).toFixed(2)}%` : '—', color: '#f59e0b' },
        { label: 'CVaR (ES)', value: data.cvar_pct != null ? `${(data.cvar_pct*100).toFixed(2)}%` : '—', color: '#ef4444' },
        { label: 'VaR 금액', value: data.var_amount != null ? `$${data.var_amount.toLocaleString('en', {maximumFractionDigits:0})}` : '—', color: '#f59e0b' },
        { label: 'CVaR 금액', value: data.cvar_amount != null ? `$${data.cvar_amount.toLocaleString('en', {maximumFractionDigits:0})}` : '—', color: '#ef4444' },
      ];
      html += `<div style="display:flex; flex-wrap:wrap; gap:12px;">
        ${metrics.map(m => `
          <div class="metric-box" style="min-width:130px;">
            <div style="font-size:0.7rem; color:#64748b; text-transform:uppercase; margin-bottom:4px;">${m.label}</div>
            <div style="font-size:1.1rem; font-weight:700; color:${m.color};">${m.value}</div>
          </div>`).join('')}
      </div>`;
      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = '▶ VaR 계산';
    }
  });
}
