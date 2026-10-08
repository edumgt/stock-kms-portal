import { api } from '../api.js';
import { cloudResourceCard } from './cloudAiResources.js';

export function cnnTimeseriesView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:var(--text); margin-bottom:6px;"><i class="fa-solid fa-wave-square"></i> 1D CNN 시계열 예측</h1>
      <p style="font-size:0.875rem; color:#94a3b8; line-height:1.6;">
        1D Convolutional Neural Network으로 시계열 데이터의 패턴을 학습하고 다음 N 스텝을 예측합니다.
      </p>
    </div>
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; margin-bottom:20px;">
        <div>
          <label class="param-label">시퀀스 길이</label>
          <input id="cnn-seq" type="number" value="50" min="10" max="200" class="param-input"/>
        </div>
        <div>
          <label class="param-label">에폭 수</label>
          <input id="cnn-epochs" type="number" value="30" min="5" max="100" class="param-input"/>
        </div>
        <div>
          <label class="param-label">예측 스텝</label>
          <input id="cnn-steps" type="number" value="20" min="5" max="50" class="param-input"/>
        </div>
      </div>
      <button class="run-btn" id="cnn-run">▶ 학습 및 예측</button>
      <div id="cnn-result" style="margin-top:20px;"></div>
    </div>
    ${cloudResourceCard('cnn-timeseries')}`;

  container.querySelector('#cnn-run').addEventListener('click', async () => {
    const btn = container.querySelector('#cnn-run');
    const result = container.querySelector('#cnn-result');
    btn.disabled = true; btn.textContent = '학습 중...';
    result.innerHTML = '<p style="color:#94a3b8;">CNN 모델 학습 중... (30초 내외)</p>';
    try {
      const data = await api.cnnTimeseries({
        seq_len:    +container.querySelector('#cnn-seq').value,
        epochs:     +container.querySelector('#cnn-epochs').value,
        pred_steps: +container.querySelector('#cnn-steps').value,
      });
      result.innerHTML = renderImageResult(data);
    } catch (e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = '▶ 학습 및 예측';
    }
  });
}

function renderImageResult(data) {
  const img = data.image ? `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:16px;"/>` : '';
  const metrics = data.metrics ? renderMetrics(data.metrics) : '';
  return img + metrics;
}

function renderMetrics(m) {
  return `<div style="display:flex; flex-wrap:wrap; gap:12px;">
    ${Object.entries(m).map(([k, v]) => `
      <div class="metric-box">
        <div style="font-size:0.7rem; color:#64748b; text-transform:uppercase; margin-bottom:4px;">${k}</div>
        <div style="font-size:1rem; font-weight:700; color:#3b82f6;">${typeof v === 'number' ? v.toFixed(4) : v}</div>
      </div>`).join('')}
  </div>`;
}
