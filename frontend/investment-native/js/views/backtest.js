import { api } from '../api.js';
import { cloudResourceCard } from './cloudAiResources.js';

export function backtestView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:var(--text); margin-bottom:6px;"><i class="fa-solid fa-clock-rotate-left"></i> 백테스트 엔진</h1>
      <p style="font-size:0.875rem; color:var(--text-muted); line-height:1.6;">
        GBM으로 시뮬레이션된 가격에 이동평균 크로스오버 전략을 적용하고 성과를 분석합니다.
      </p>
    </div>
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:16px; margin-bottom:20px;">
        <div>
          <label class="param-label">단기 MA</label>
          <input id="bt-short" type="number" value="20" min="5" max="50" class="param-input"/>
        </div>
        <div>
          <label class="param-label">장기 MA</label>
          <input id="bt-long" type="number" value="60" min="20" max="200" class="param-input"/>
        </div>
        <div>
          <label class="param-label">초기 자본 ($)</label>
          <input id="bt-capital" type="number" value="10000" min="1000" class="param-input"/>
        </div>
        <div>
          <label class="param-label">거래일 수</label>
          <input id="bt-days" type="number" value="252" min="60" max="1260" class="param-input"/>
        </div>
        <div>
          <label class="param-label">변동성 (σ)</label>
          <input id="bt-vol" type="number" value="0.2" min="0.05" max="0.8" step="0.05" class="param-input"/>
        </div>
      </div>
      <button class="run-btn" id="bt-run">▶ 백테스트 실행</button>
      <div id="bt-result" style="margin-top:20px;"></div>
    </div>
    ${cloudResourceCard('backtest')}`;

  container.querySelector('#bt-run').addEventListener('click', async () => {
    const btn = container.querySelector('#bt-run');
    const result = container.querySelector('#bt-result');
    btn.disabled = true; btn.textContent = '실행 중...';
    result.innerHTML = '<p style="color:#94a3b8;">백테스트 실행 중...</p>';
    try {
      const data = await api.backtest({
        short_ma:        +container.querySelector('#bt-short').value,
        long_ma:         +container.querySelector('#bt-long').value,
        initial_capital: +container.querySelector('#bt-capital').value,
        n_days:          +container.querySelector('#bt-days').value,
        volatility:      +container.querySelector('#bt-vol').value,
      });
      let html = '';
      if (data.image) html += `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:16px;"/>`;
      if (data.metrics) {
        const m = data.metrics;
        html += `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px;">
          ${Object.entries(m).map(([k, v]) => `
            <div class="metric-box">
              <div style="font-size:0.7rem; color:#64748b; text-transform:uppercase; margin-bottom:4px; word-break:break-word;">${k.replace(/_/g,' ')}</div>
              <div style="font-size:1rem; font-weight:700; color:${String(v).startsWith('-') ? '#ef4444' : '#22c55e'};">${typeof v === 'number' ? v.toFixed(2) : v}</div>
            </div>`).join('')}
        </div>`;
      }
      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = '▶ 백테스트 실행';
    }
  });
}
