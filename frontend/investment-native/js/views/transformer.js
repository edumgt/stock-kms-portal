import { api } from '../api.js';
import { cloudResourceCard } from './cloudAiResources.js';

export function transformerView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:var(--text); margin-bottom:6px;"><i class="fa-solid fa-robot"></i> Transformer 시계열 예측</h1>
      <p style="font-size:0.875rem; color:#94a3b8; line-height:1.6;">
        Self-Attention 기반 Transformer 아키텍처로 시계열 패턴을 학습하고 예측합니다.
      </p>
    </div>
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; margin-bottom:20px;">
        <div>
          <label class="param-label">시퀀스 길이</label>
          <input id="tf-seq" type="number" value="60" min="10" max="200" class="param-input"/>
        </div>
        <div>
          <label class="param-label">d_model</label>
          <input id="tf-dm" type="number" value="32" min="8" max="128" class="param-input"/>
        </div>
        <div>
          <label class="param-label">어텐션 헤드</label>
          <input id="tf-heads" type="number" value="4" min="1" max="8" class="param-input"/>
        </div>
        <div>
          <label class="param-label">에폭 수</label>
          <input id="tf-epochs" type="number" value="20" min="5" max="100" class="param-input"/>
        </div>
      </div>
      <button class="run-btn" id="tf-run">▶ 학습 및 예측</button>
      <div id="tf-result" style="margin-top:20px;"></div>
    </div>
    ${cloudResourceCard('transformer')}`;

  container.querySelector('#tf-run').addEventListener('click', async () => {
    const btn = container.querySelector('#tf-run');
    const result = container.querySelector('#tf-result');
    btn.disabled = true; btn.textContent = '학습 중...';
    result.innerHTML = '<p style="color:#94a3b8;">Transformer 모델 학습 중... (60초 내외)</p>';
    try {
      const data = await api.transformer({
        seq_len: +container.querySelector('#tf-seq').value,
        d_model: +container.querySelector('#tf-dm').value,
        n_heads: +container.querySelector('#tf-heads').value,
        epochs:  +container.querySelector('#tf-epochs').value,
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
