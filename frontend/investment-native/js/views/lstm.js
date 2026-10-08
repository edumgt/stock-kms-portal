import { api } from '../api.js';
import { cloudResourceCard } from './cloudAiResources.js';

export function lstmView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:var(--text); margin-bottom:6px;"><i class="fa-solid fa-repeat"></i> LSTM 예측기</h1>
      <p style="font-size:0.875rem; color:#94a3b8; line-height:1.6;">
        Long Short-Term Memory 신경망으로 시계열 시퀀스를 학습하고 미래 값을 예측합니다.
      </p>
    </div>
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; margin-bottom:20px;">
        <div>
          <label class="param-label">룩백 기간</label>
          <input id="lstm-lb" type="number" value="60" min="10" max="200" class="param-input"/>
        </div>
        <div>
          <label class="param-label">에폭 수</label>
          <input id="lstm-epochs" type="number" value="30" min="5" max="100" class="param-input"/>
        </div>
        <div>
          <label class="param-label">LSTM 유닛</label>
          <input id="lstm-units" type="number" value="64" min="16" max="256" class="param-input"/>
        </div>
        <div>
          <label class="param-label">예측 스텝</label>
          <input id="lstm-steps" type="number" value="20" min="5" max="50" class="param-input"/>
        </div>
      </div>
      <button class="run-btn" id="lstm-run">▶ 학습 및 예측</button>
      <div id="lstm-result" style="margin-top:20px;"></div>
    </div>
    ${cloudResourceCard('lstm')}`;

  container.querySelector('#lstm-run').addEventListener('click', async () => {
    const btn = container.querySelector('#lstm-run');
    const result = container.querySelector('#lstm-result');
    btn.disabled = true; btn.textContent = '학습 중...';
    result.innerHTML = '<p style="color:#94a3b8;">LSTM 모델 학습 중... (30초 내외)</p>';
    try {
      const data = await api.lstm({
        lookback:   +container.querySelector('#lstm-lb').value,
        epochs:     +container.querySelector('#lstm-epochs').value,
        units:      +container.querySelector('#lstm-units').value,
        pred_steps: +container.querySelector('#lstm-steps').value,
      });
      result.innerHTML = renderResult(data);
    } catch (e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = '▶ 학습 및 예측';
    }
  });
}

function renderResult(data) {
  const img = data.image ? `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:16px;"/>` : '';
  const m = data.metrics;
  if (!m) return img;
  return img + `<div style="display:flex; flex-wrap:wrap; gap:12px;">
    ${Object.entries(m).map(([k, v]) => `
      <div class="metric-box">
        <div style="font-size:0.7rem; color:#64748b; text-transform:uppercase; margin-bottom:4px;">${k}</div>
        <div style="font-size:1rem; font-weight:700; color:#3b82f6;">${typeof v === 'number' ? v.toFixed(4) : v}</div>
      </div>`).join('')}
  </div>`;
}
