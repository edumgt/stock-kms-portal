import { api } from '../api.js';
import { cloudResourceCard } from './cloudAiResources.js';

export function pipelineView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:var(--text); margin-bottom:6px;"><i class="fa-solid fa-diagram-project"></i> 퀀트 파이프라인</h1>
      <p style="font-size:0.875rem; color:#94a3b8; line-height:1.6;">
        데이터 생성 → 기술적 지표 계산 → 백테스트 → RandomForest ML 예측까지 4단계 퀀트 파이프라인을 실행합니다.
      </p>
    </div>
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155; margin-bottom:16px;">
      <div style="font-size:0.75rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:12px;">파이프라인 단계</div>
      <div style="display:flex; gap:0; overflow-x:auto; margin-bottom:20px;">
        ${['1. 데이터 생성\n(GBM 시뮬레이션)', '2. 기술적 지표\n(MA/RSI/BB/MACD)', '3. 백테스트\n(MA 크로스오버)', '4. ML 예측\n(RandomForest)'].map((s, i) => `
          <div style="flex:1; min-width:130px; text-align:center; padding:12px 8px; background:#0f172a;
               border-right:${i < 3 ? '1px solid #334155' : 'none'}; border-radius:${i===0?'8px 0 0 8px':i===3?'0 8px 8px 0':'0'};">
            <div style="font-size:0.875rem; color:#3b82f6; margin-bottom:4px;">${i+1}</div>
            <div style="font-size:0.75rem; color:#94a3b8; white-space:pre-line;">${s.split('\n')[1]}</div>
          </div>`).join('')}
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; margin-bottom:20px;">
        <div>
          <label class="param-label">거래일 수</label>
          <input id="pl-days" type="number" value="252" min="60" max="1260" class="param-input"/>
        </div>
        <div>
          <label class="param-label">단기 MA</label>
          <input id="pl-short" type="number" value="20" min="5" max="50" class="param-input"/>
        </div>
        <div>
          <label class="param-label">장기 MA</label>
          <input id="pl-long" type="number" value="60" min="20" max="200" class="param-input"/>
        </div>
        <div>
          <label class="param-label">RF 트리 수</label>
          <input id="pl-trees" type="number" value="100" min="10" max="500" class="param-input"/>
        </div>
      </div>
      <button class="run-btn" id="pl-run">▶ 파이프라인 실행</button>
      <div id="pl-result" style="margin-top:20px;"></div>
    </div>
    ${cloudResourceCard('pipeline')}`;

  container.querySelector('#pl-run').addEventListener('click', async () => {
    const btn = container.querySelector('#pl-run');
    const result = container.querySelector('#pl-result');
    btn.disabled = true; btn.textContent = '파이프라인 실행 중...';
    result.innerHTML = '<p style="color:#94a3b8;">4단계 파이프라인 실행 중... (30초 내외)</p>';
    try {
      const data = await api.pipeline({
        n_days:    +container.querySelector('#pl-days').value,
        short_ma:  +container.querySelector('#pl-short').value,
        long_ma:   +container.querySelector('#pl-long').value,
        n_trees:   +container.querySelector('#pl-trees').value,
      });
      let html = '';
      if (data.image) html += `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:16px;"/>`;
      if (data.metrics) {
        const m = data.metrics;
        html += `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px;">
          ${Object.entries(m).map(([k, v]) => `
            <div class="metric-box">
              <div style="font-size:0.7rem; color:#64748b; text-transform:uppercase; margin-bottom:4px; word-break:break-word;">${k.replace(/_/g,' ')}</div>
              <div style="font-size:1rem; font-weight:700; color:#3b82f6;">${typeof v === 'number' ? v.toFixed(4) : v}</div>
            </div>`).join('')}
        </div>`;
      }
      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = '▶ 파이프라인 실행';
    }
  });
}
