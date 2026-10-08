import { api } from '../api.js';

function pageShell(title, desc, bodyHtml) {
  return `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:var(--text); margin-bottom:6px;">${title}</h1>
      <p style="font-size:0.875rem; color:#94a3b8; line-height:1.6;">${desc}</p>
    </div>
    ${bodyHtml}
  `;
}

export function textClassifyView(container) {
  container.innerHTML = pageShell(
    '<i class="fa-solid fa-comments"></i> 텍스트 분류 (TF-IDF)',
    'TF-IDF 벡터화 + 로지스틱 회귀로 텍스트를 스포츠 / 정치 카테고리로 분류합니다.',
    `<div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="margin-bottom:16px;">
        <label class="param-label">분류할 텍스트 (한 줄에 하나)</label>
        <textarea id="nlp-texts" rows="6" class="param-input" style="resize:vertical;">The team scored a goal in overtime to win the championship!
The government proposed a new budget policy for healthcare.
Ice hockey season is starting next month with exciting matchups.
Political debates are heating up ahead of the election.</textarea>
      </div>
      <button class="run-btn" id="nlp-run">▶ 분류 실행</button>
      <div id="nlp-result" style="margin-top:20px;"></div>
    </div>`
  );

  container.querySelector('#nlp-run').addEventListener('click', async (btn_) => {
    const btn = container.querySelector('#nlp-run');
    const result = container.querySelector('#nlp-result');
    const texts = container.querySelector('#nlp-texts').value
      .split('\n').map(t => t.trim()).filter(Boolean);
    if (!texts.length) { result.innerHTML = '<p style="color:#ef4444;">텍스트를 입력하세요.</p>'; return; }

    btn.disabled = true; btn.textContent = '실행 중...';
    result.innerHTML = '<p style="color:#94a3b8;">분류 중...</p>';
    try {
      const data = await api.textClassify({ texts });
      const rows = data.predictions.map(p => `
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #334155; color:#e2e8f0; word-break:break-word; max-width:400px;">${p.text}</td>
          <td style="padding:10px 12px; border-bottom:1px solid #334155; font-weight:600; color:#3b82f6;">${p.label}</td>
          <td style="padding:10px 12px; border-bottom:1px solid #334155; color:#94a3b8;">${(p.confidence * 100).toFixed(1)}%</td>
        </tr>`).join('');
      result.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
          <thead>
            <tr style="background:#0f172a;">
              <th style="padding:10px 12px; text-align:left; color:#64748b; font-size:0.75rem; text-transform:uppercase;">텍스트</th>
              <th style="padding:10px 12px; text-align:left; color:#64748b; font-size:0.75rem; text-transform:uppercase;">분류</th>
              <th style="padding:10px 12px; text-align:left; color:#64748b; font-size:0.75rem; text-transform:uppercase;">신뢰도</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    } catch (e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = '▶ 분류 실행';
    }
  });
}
