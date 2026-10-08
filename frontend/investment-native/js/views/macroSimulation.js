import { api } from '../api.js';

export function macroSimulationView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:#131722; margin-bottom:6px;"><i class="fa-solid fa-chart-area"></i> 거시경제현황 2 — 시뮬레이션 대시보드</h1>
      <p style="font-size:0.875rem; color:#6b7280; line-height:1.6;">
        GBM(기하브라운운동)으로 기준금리·CPI·유가·환율·KOSPI·S&amp;P 500을 시뮬레이션하고
        경기사이클(상승기→과열기→침체기→회복기) 국면을 함께 표시합니다.
      </p>
    </div>

    <!-- 경기사이클 설명 -->
    <div style="background:#1e293b; border-radius:12px; padding:16px 20px; border:1px solid #334155; margin-bottom:16px;">
      <div style="font-size:0.75rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:12px;">경기사이클 4단계</div>
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px;">
        ${[
          { name: '상승기', color: '#22c55e', desc: '성장률↑ 금리 안정 주가↑' },
          { name: '과열기', color: '#f59e0b', desc: '물가↑ 금리↑ 긴축 시작' },
          { name: '침체기', color: '#ef4444', desc: '성장 둔화 실업↑ 주가↓' },
          { name: '회복기', color: '#3b82f6', desc: '금리↓ 완화 소비 회복' },
        ].map(p => `
          <div style="text-align:center; padding:10px 8px; background:#0f172a; border-radius:8px;
               border-top:3px solid ${p.color};">
            <div style="font-size:0.875rem; font-weight:700; color:${p.color}; margin-bottom:4px;">${p.name}</div>
            <div style="font-size:0.7rem; color:#64748b; line-height:1.5;">${p.desc}</div>
          </div>`).join('')}
      </div>
    </div>

    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; margin-bottom:20px;">
        <div>
          <label class="param-label">시뮬레이션 기간 (거래일)</label>
          <input id="sim-days" type="number" value="252" min="60" max="1260" class="param-input"/>
          <div style="font-size:0.7rem; color:#64748b; margin-top:4px;">252일 = 1년, 1260일 = 5년</div>
        </div>
        <div>
          <label class="param-label">랜덤 시드 (재현성)</label>
          <input id="sim-seed" type="number" value="42" min="0" max="9999" class="param-input"/>
        </div>
      </div>
      <button class="run-btn" id="sim-run">▶ 시뮬레이션 실행</button>
      <div id="sim-result" style="margin-top:24px;"></div>
    </div>`;

  container.querySelector('#sim-run').addEventListener('click', async () => {
    const btn    = container.querySelector('#sim-run');
    const result = container.querySelector('#sim-result');
    btn.disabled = true; btn.textContent = '시뮬레이션 중...';
    result.innerHTML = '<p style="color:#94a3b8;">GBM 시뮬레이션 실행 중...</p>';
    try {
      const data = await api.macroSimulation({
        n_days: +container.querySelector('#sim-days').value,
        seed:   +container.querySelector('#sim-seed').value,
      });

      let html = '';
      if (data.image) {
        html += `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:20px;"/>`;
      }

      if (data.summary) {
        html += `
          <div style="font-size:0.75rem; font-weight:600; color:#64748b; text-transform:uppercase;
               letter-spacing:0.08em; margin-bottom:12px;">시뮬레이션 결과 요약</div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.825rem;">
              <thead>
                <tr style="background:#0f172a;">
                  <th style="padding:10px 12px; text-align:left; color:#64748b; font-size:0.7rem; text-transform:uppercase; white-space:nowrap;">지표</th>
                  <th style="padding:10px 12px; text-align:right; color:#64748b; font-size:0.7rem; text-transform:uppercase;">시작값</th>
                  <th style="padding:10px 12px; text-align:right; color:#64748b; font-size:0.7rem; text-transform:uppercase;">종료값</th>
                  <th style="padding:10px 12px; text-align:right; color:#64748b; font-size:0.7rem; text-transform:uppercase;">변화율</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(data.summary).map(([name, s]) => {
                  const isPos = s.chg_pct >= 0;
                  return `
                    <tr style="border-bottom:1px solid #334155;">
                      <td style="padding:10px 12px; color:#e2e8f0; font-weight:500;">${name}</td>
                      <td style="padding:10px 12px; text-align:right; color:#94a3b8;">${s.start.toLocaleString()}</td>
                      <td style="padding:10px 12px; text-align:right; color:#e2e8f0; font-weight:600;">${s.end.toLocaleString()}</td>
                      <td style="padding:10px 12px; text-align:right; font-weight:700;
                           color:${isPos ? '#22c55e' : '#ef4444'};">
                        ${isPos ? '▲' : '▼'} ${Math.abs(s.chg_pct).toFixed(2)}%
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;
      }
      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = '▶ 시뮬레이션 실행';
    }
  });
}
