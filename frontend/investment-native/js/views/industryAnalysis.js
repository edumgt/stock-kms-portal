import { api } from '../api.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(value, suffix = '') {
  return value === null || value === undefined ? '-' : `${value}${suffix}`;
}

// ── 탭 공통 유틸 ─────────────────────────────────────────────────────────────
function tabShell(tabs) {
  return `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:var(--text); margin-bottom:6px;"><i class="fa-solid fa-industry"></i> 산업 경쟁력 분석</h1>
      <p style="font-size:0.875rem; color:#94a3b8; line-height:1.6;">
        Porter 5 Forces · 산업별 KPI · Peer Comparison · 뉴스/공시 메모 · PEST · 생애주기로 산업 경쟁력을 분석합니다.
      </p>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:20px; border-bottom:1px solid #334155; padding-bottom:0;">
      ${tabs.map((t, i) => `
        <button class="ia-tab" data-tab="${i}"
          style="padding:9px 18px; border:none; border-radius:8px 8px 0 0; cursor:pointer;
                 font-size:0.825rem; font-weight:600; transition:all 0.15s;
                 background:${i===0?'#2563eb':'#1e293b'};
                 color:${i===0?'#fff':'#94a3b8'};">
          ${t}
        </button>`).join('')}
    </div>
    <div id="ia-content"></div>`;
}

function activateTab(container, idx, renders) {
  container.querySelectorAll('.ia-tab').forEach((btn, i) => {
    btn.style.background = i === idx ? '#2563eb' : '#1e293b';
    btn.style.color      = i === idx ? '#fff'    : '#94a3b8';
  });
  renders[idx](container.querySelector('#ia-content'));
}

// ── 메인 진입점 ──────────────────────────────────────────────────────────────
export function industryAnalysisView(container) {
  const TABS = [
    '① Porter 5 Forces',
    '② 산업별 KPI',
    '③ Peer Comparison',
    '④ 뉴스/공시 메모',
    '⑤ PEST',
    '⑥ 섹터 주가 비교',
    '⑦ 산업 생애주기',
    '⑧ SWOT Matrix',
  ];
  container.innerHTML = tabShell(TABS);

  const renders = [
    renderPorter,
    renderKpi,
    renderPeer,
    renderNewsMemo,
    renderPest,
    renderSector,
    renderLifecycle,
    renderSwot,
  ];

  container.querySelectorAll('.ia-tab').forEach((btn, i) => {
    btn.addEventListener('click', () => activateTab(container, i, renders));
  });

  // 기본: 첫 탭
  renders[0](container.querySelector('#ia-content'));
}


// ── Tab 1: Porter 5 Forces ───────────────────────────────────────────────────
const FORCES = ['경쟁강도', '신규진입 위협', '대체재 위협', '구매자 교섭력', '공급자 교섭력'];

function renderPorter(el) {
  el.innerHTML = `
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">
        <div>
          <label class="param-label">분석 산업명</label>
          <input id="porter-ind" type="text" value="반도체" class="param-input"/>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-size:0.75rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:12px;">위협 강도 조절 (0 = 낮음 / 10 = 높음)</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px;" id="porter-sliders">
          ${FORCES.map((f, i) => `
            <div style="background:#0f172a; border-radius:8px; padding:12px 16px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span style="font-size:0.825rem; color:#e2e8f0;">${f}</span>
                <span id="porter-val-${i}" style="font-size:0.875rem; font-weight:700; color:#3b82f6;">
                  ${[8,6,4,5,7][i]}.0
                </span>
              </div>
              <input type="range" id="porter-sl-${i}" min="0" max="10" step="0.5"
                     value="${[8,6,4,5,7][i]}"
                     style="width:100%; accent-color:#3b82f6;"
                     oninput="document.getElementById('porter-val-${i}').textContent=parseFloat(this.value).toFixed(1)"/>
            </div>`).join('')}
        </div>
      </div>
      <button class="run-btn" id="porter-run">▶ 분석 실행</button>
      <div id="porter-result" style="margin-top:20px;"></div>
    </div>`;

  el.querySelector('#porter-run').addEventListener('click', async () => {
    const btn    = el.querySelector('#porter-run');
    const result = el.querySelector('#porter-result');
    const industry = el.querySelector('#porter-ind').value.trim() || '반도체';
    const scores = {};
    FORCES.forEach((f, i) => {
      scores[f] = parseFloat(el.querySelector(`#porter-sl-${i}`).value);
    });

    btn.disabled = true; btn.textContent = '분석 중...';
    result.innerHTML = '<p style="color:#94a3b8;">Porter 5 Forces 분석 중...</p>';
    try {
      const data = await api.industryPorter({ industry, scores });
      let html = '';
      if (data.image) html += `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:16px;"/>`;
      if (data.forces) {
        const gradeColor = { '강함': '#ef4444', '보통': '#f59e0b', '약함': '#22c55e' };
        html += `<div style="display:flex; flex-wrap:wrap; gap:10px;">
          ${Object.entries(data.forces).map(([f, v]) => `
            <div class="metric-box" style="min-width:130px;">
              <div style="font-size:0.7rem; color:#64748b; margin-bottom:4px;">${f}</div>
              <div style="font-size:1rem; font-weight:700; color:${gradeColor[v.level]};">
                ${v.score.toFixed(1)} — ${v.level}
              </div>
            </div>`).join('')}
          <div class="metric-box" style="min-width:130px; border:1px solid #3b82f6;">
            <div style="font-size:0.7rem; color:#64748b; margin-bottom:4px;">종합 위협지수</div>
            <div style="font-size:1.1rem; font-weight:700; color:#3b82f6;">
              ${data.avg_score} — ${data.grade}
            </div>
          </div>
        </div>`;
      }
      result.innerHTML = html;
    } catch(e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = '▶ 분석 실행';
    }
  });
}


// ── Tab 2: 산업별 KPI ────────────────────────────────────────────────────────
const KPI_DATA = {
  '반도체': [
    ['ASP (Average Selling Price, 평균판매가격)', '제품 하나를 평균 얼마에 팔았는지 나타내는 값입니다. 판매량·고가 제품 비중과 함께 메모리 가격 사이클을 확인합니다.'],
    ['가동률', '공장 활용도와 공급 여력을 확인'],
    ['DRAM 현물가/계약가', '수요·공급 밸런스 선행 지표'],
    ['Capex', '차세대 공정과 증설 방향'],
  ],
  '2차전지': [
    ['배터리 팩 가격($/kWh)', '원가 경쟁력'],
    ['에너지 밀도(Wh/kg)', '기술 우위'],
    ['리튬·코발트 가격', '원가 변동 선행 지표'],
    ['EV 침투율', '수요 성장 모멘텀'],
  ],
  '바이오': [
    ['임상 파이프라인 단계', '승인 가능성과 가치'],
    ['FDA/MFDS 허가', '규제 리스크'],
    ['특허 만료일', '제네릭 경쟁 진입 시점'],
    ['R&D/매출 비율', '연구 집중도'],
  ],
  '유통·커머스': [
    ['점포당 매출', '오프라인 운영 효율성'],
    ['객단가', '고객당 구매 금액'],
    ['GMV', '플랫폼 거래 규모'],
    ['재고회전율', '운전자본 관리 능력'],
  ],
  '플랫폼·SaaS': [
    ['MAU', '사용자 기반 규모'],
    ['ARR', '반복 매출 체력'],
    ['이탈률', '고객 유지율'],
    ['CAC/LTV', '고객 획득 효율'],
  ],
  '금융·은행': [
    ['NIM', '순이자마진'],
    ['ROE', '자본 효율성'],
    ['대손충당금', '건전성 리스크'],
    ['연체율', '신용 사이클 변화'],
  ],
  '정유·화학': [
    ['정제마진', '제품가와 원가의 차이'],
    ['크랙마진', '원유 대비 제품 수익성'],
    ['스프레드', '화학 제품 수급 지표'],
    ['유가·나프타 가격', '원가와 재고평가 영향'],
  ],
};

function renderKpi(el) {
  const industries = Object.keys(KPI_DATA);
  el.innerHTML = `
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-bottom:18px;">
        <div style="min-width:220px; flex:1;">
          <label class="param-label">산업 선택</label>
          <select id="kpi-ind" class="param-input">
            ${industries.map((name) => `<option value="${name}">${name}</option>`).join('')}
          </select>
        </div>
        <button class="run-btn" id="kpi-run">KPI 표 보기</button>
      </div>
      <div id="kpi-status" style="min-height:22px; margin-bottom:10px; color:#38bdf8; font-size:0.8rem;"></div>
      <div id="kpi-result"></div>
    </div>`;

  const draw = () => {
    const selected = el.querySelector('#kpi-ind').value;
    const rows = KPI_DATA[selected] || [];
    el.querySelector('#kpi-result').innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin-bottom:16px;">
        ${rows.map(([metric, meaning]) => `
          <div style="background:#0f172a; border:1px solid #334155; border-radius:8px; padding:14px;">
            <div style="font-size:0.78rem; color:#64748b; margin-bottom:6px;">핵심 KPI</div>
            <div style="font-size:1rem; font-weight:700; color:#38bdf8; margin-bottom:6px;">${escapeHtml(metric)}</div>
            <div style="font-size:0.8rem; color:#cbd5e1; line-height:1.45;">${escapeHtml(meaning)}</div>
          </div>`).join('')}
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div style="background:#0f172a; border-radius:8px; padding:14px; color:#94a3b8; font-size:0.825rem; line-height:1.6;">
          ${escapeHtml(selected)} 분석에서는 많은 숫자를 나열하기보다, 위 KPI 중 먼저 움직이는 지표와 기업 실적에 직접 연결되는 지표를 구분해서 봅니다.
        </div>
        <div style="background:#0f172a; border-radius:8px; padding:14px; color:#cbd5e1; font-size:0.825rem; line-height:1.6;">
          <div style="font-size:0.72rem; color:#64748b; font-weight:700; margin-bottom:6px;">분석 체크리스트</div>
          <div>1. 선행 KPI가 개선 중인지 확인</div>
          <div>2. Peer 기업 대비 수익성 차이 확인</div>
          <div>3. 뉴스/공시 이벤트가 KPI에 주는 영향 기록</div>
        </div>
      </div>`;
    const status = el.querySelector('#kpi-status');
    status.textContent = `${selected} KPI 표를 갱신했습니다.`;
    const btn = el.querySelector('#kpi-run');
    btn.textContent = 'KPI 표 갱신 완료';
    setTimeout(() => {
      if (document.body.contains(btn)) btn.textContent = 'KPI 표 보기';
    }, 900);
  };

  el.querySelector('#kpi-run').addEventListener('click', draw);
  el.querySelector('#kpi-ind').addEventListener('change', () => {
    el.querySelector('#kpi-status').textContent = '산업을 변경했습니다. KPI 표 보기 버튼으로 갱신하세요.';
  });
  draw();
}


// ── Tab 3: 기업 Peer Comparison ─────────────────────────────────────────────
function renderPeer(el) {
  el.innerHTML = `
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="margin-bottom:14px;">
        <label class="param-label">기업명,티커 한 줄씩 입력</label>
        <textarea id="peer-input" rows="5" class="param-input" style="resize:vertical;">삼성전자,005930.KS
SK하이닉스,000660.KS
엔비디아,NVDA
인텔,INTC</textarea>
      </div>
      <button class="run-btn" id="peer-run">Peer 재무표 생성</button>
      <div id="peer-result" style="margin-top:20px;"></div>
    </div>`;

  el.querySelector('#peer-run').addEventListener('click', async () => {
    const btn = el.querySelector('#peer-run');
    const result = el.querySelector('#peer-result');
    const tickers = {};
    el.querySelector('#peer-input').value.split('\n').forEach((line) => {
      const [name, ticker] = line.split(',').map((x) => x?.trim());
      if (name && ticker) tickers[name] = ticker;
    });
    if (!Object.keys(tickers).length) {
      result.innerHTML = '<p style="color:#ef4444;">기업명,티커 형식으로 1개 이상 입력하세요.</p>';
      return;
    }

    btn.disabled = true; btn.textContent = '수신 중...';
    result.innerHTML = '<p style="color:#94a3b8;">Yahoo Finance 재무 데이터 수신 중...</p>';
    try {
      const data = await api.industryPeer({ tickers });
      result.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead><tr style="background:#0f172a;">
              ${['기업','티커','시가총액(억)','매출성장률','영업이익률','PER','PBR','부채비율','ROE'].map((h) => `
                <th style="padding:9px 10px;text-align:${h === '기업' || h === '티커' ? 'left' : 'right'};color:#94a3b8;font-size:0.7rem;">${h}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${data.rows.map((r) => `
                <tr style="border-bottom:1px solid #334155;">
                  <td style="padding:9px 10px;color:#e2e8f0;font-weight:700;">${escapeHtml(r.company)}</td>
                  <td style="padding:9px 10px;color:#94a3b8;">${escapeHtml(r.ticker)}</td>
                  ${r.error ? `
                    <td colspan="7" style="padding:9px 10px;color:#ef4444;">${escapeHtml(r.error)}</td>
                  ` : `
                    <td style="padding:9px 10px;text-align:right;color:#cbd5e1;">${fmt(r.market_cap_krw_100m)}</td>
                    <td style="padding:9px 10px;text-align:right;color:${(r.revenue_growth_pct ?? 0) >= 0 ? '#22c55e' : '#ef4444'};">${fmt(r.revenue_growth_pct, '%')}</td>
                    <td style="padding:9px 10px;text-align:right;color:#cbd5e1;">${fmt(r.operating_margin_pct, '%')}</td>
                    <td style="padding:9px 10px;text-align:right;color:#cbd5e1;">${fmt(r.per)}</td>
                    <td style="padding:9px 10px;text-align:right;color:#cbd5e1;">${fmt(r.pbr)}</td>
                    <td style="padding:9px 10px;text-align:right;color:#cbd5e1;">${fmt(r.debt_to_equity_pct, '%')}</td>
                    <td style="padding:9px 10px;text-align:right;color:#cbd5e1;">${fmt(r.roe_pct, '%')}</td>
                  `}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:14px; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px;">
          <div class="metric-box">
            <div style="font-size:0.7rem; color:#64748b; margin-bottom:4px;">수익성 우위 후보</div>
            <div style="font-size:1rem; font-weight:700; color:#3b82f6;">${escapeHtml(data.leader || '-')}</div>
          </div>
          ${data.notes.map((note) => `
            <div style="background:#0f172a; border-radius:8px; padding:12px; color:#94a3b8; font-size:0.78rem; line-height:1.5;">${escapeHtml(note)}</div>
          `).join('')}
        </div>`;
    } catch(e) {
      result.innerHTML = `<p style="color:#ef4444;">오류: ${escapeHtml(e.message)}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Peer 재무표 생성';
    }
  });
}


// ── Tab 4: 뉴스·공시 영향 메모 ─────────────────────────────────────────────
const EVENT_IMPACTS = {
  '실적 발표': ['매출 성장률', '영업이익률', '컨센서스 대비 서프라이즈'],
  '유상증자': ['주당 가치 희석', '재무 안정성', '투자 재원'],
  '자사주 매입': ['주주환원', 'EPS', '저평가 신호'],
  '대규모 수주': ['수주잔고', '미래 매출 가시성', '가동률'],
  '경영권 변경': ['전략 방향성', '지배구조 리스크', '자본 배분'],
  '규제/허가': ['시장 진입', '일정 지연', '규제 비용'],
};

function renderNewsMemo(el) {
  el.innerHTML = `
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div>
          <label class="param-label">공시/뉴스 유형</label>
          <select id="news-type" class="param-input">
            ${Object.keys(EVENT_IMPACTS).map((name) => `<option value="${name}">${name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="param-label">관련 기업/산업</label>
          <input id="news-target" type="text" value="반도체" class="param-input"/>
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <label class="param-label">뉴스/공시 요약</label>
        <textarea id="news-summary" rows="4" class="param-input" style="resize:vertical;">AI 서버 수요 증가로 HBM 공급 계약이 확대되었다.</textarea>
      </div>
      <button class="run-btn" id="news-run">영향 메모 생성</button>
      <div id="news-result" style="margin-top:20px;"></div>
    </div>`;

  el.querySelector('#news-run').addEventListener('click', () => {
    const type = el.querySelector('#news-type').value;
    const target = el.querySelector('#news-target').value.trim() || '분석 대상';
    const summary = el.querySelector('#news-summary').value.trim();
    const metrics = EVENT_IMPACTS[type] || [];
    el.querySelector('#news-result').innerHTML = `
      <div style="background:#0f172a; border-radius:10px; padding:16px; border-left:3px solid #38bdf8;">
        <div style="font-size:0.78rem; color:#64748b; margin-bottom:6px;">뉴스/공시 영향 메모</div>
        <div style="font-size:1rem; font-weight:700; color:#fff; margin-bottom:10px;">${escapeHtml(target)} · ${escapeHtml(type)}</div>
        <div style="font-size:0.84rem; color:#cbd5e1; line-height:1.6; margin-bottom:14px;">${escapeHtml(summary || '요약을 입력하세요.')}</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px;">
          ${metrics.map((m) => `
            <div style="background:#1e293b; border:1px solid #334155; border-radius:8px; padding:12px;">
              <div style="font-size:0.7rem; color:#64748b; margin-bottom:4px;">영향 지표</div>
              <div style="font-size:0.9rem; font-weight:700; color:#38bdf8;">${escapeHtml(m)}</div>
            </div>`).join('')}
        </div>
        <div style="margin-top:14px; color:#94a3b8; font-size:0.8rem; line-height:1.55;">
          해석 질문: 이 사건은 일시적 이슈인가, 구조적 변화인가? 다음 분기 실적에서 어떤 지표로 확인할 수 있는가?
        </div>
      </div>`;
  });
  el.querySelector('#news-run').click();
}


// ── Tab 5: PEST 분석 ────────────────────────────────────────────────────────
const PEST_DEFAULTS = {
  P: '수출 규제, 보조금, 인허가 정책',
  E: '금리, 환율, 경기 사이클, 원자재 가격',
  S: '고령화, 소비 패턴 변화, 노동시장 변화',
  T: 'AI 전환, 자동화, 신기술 대체 가능성',
};
const PEST_LABELS = {
  P: ['Political', '정치·규제 환경', '#ef4444'],
  E: ['Economic', '경제 환경', '#22c55e'],
  S: ['Social', '사회·인구 트렌드', '#3b82f6'],
  T: ['Technological', '기술 변화', '#f59e0b'],
};

function renderPest(el) {
  el.innerHTML = `
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="margin-bottom:16px;">
        <label class="param-label">분석 산업명</label>
        <input id="pest-title" type="text" value="반도체" class="param-input"/>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; margin-bottom:18px;">
        ${Object.entries(PEST_LABELS).map(([key, [en, ko, color]]) => `
          <div>
            <label style="display:block; font-size:0.75rem; font-weight:600; color:${color}; margin-bottom:6px;">${key} · ${en} (${ko})</label>
            <textarea id="pest-${key}" rows="4" class="param-input" style="resize:vertical;">${PEST_DEFAULTS[key]}</textarea>
          </div>`).join('')}
      </div>
      <button class="run-btn" id="pest-run">PEST 매트릭스 생성</button>
      <div id="pest-result" style="margin-top:20px;"></div>
    </div>`;

  el.querySelector('#pest-run').addEventListener('click', () => {
    const title = el.querySelector('#pest-title').value.trim() || '산업';
    const blocks = Object.keys(PEST_LABELS).map((key) => {
      const [en, ko, color] = PEST_LABELS[key];
      const items = el.querySelector(`#pest-${key}`).value.split('\n').map((x) => x.trim()).filter(Boolean);
      return `
        <div style="background:#0f172a; border:1px solid #334155; border-left:3px solid ${color}; border-radius:8px; padding:14px;">
          <div style="font-size:0.76rem; color:${color}; font-weight:700; margin-bottom:8px;">${key} · ${en}</div>
          <div style="font-size:0.9rem; color:#fff; font-weight:700; margin-bottom:8px;">${ko}</div>
          ${items.map((item) => `<div style="font-size:0.8rem; color:#cbd5e1; line-height:1.45; margin-bottom:5px;">• ${escapeHtml(item)}</div>`).join('')}
        </div>`;
    }).join('');
    el.querySelector('#pest-result').innerHTML = `
      <div style="background:#111827; border-radius:12px; padding:18px;">
        <div style="text-align:center; color:#fff; font-size:1rem; font-weight:700; margin-bottom:16px;">PEST 분석 — ${escapeHtml(title)}</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px;">${blocks}</div>
      </div>`;
  });
  el.querySelector('#pest-run').click();
}


// ── Tab 2: 섹터 주가 비교 ────────────────────────────────────────────────────
const SECTOR_OPTS = [
  { v:'SOXX', l:'반도체 (SOXX)' }, { v:'XLE', l:'에너지 (XLE)' },
  { v:'XLF', l:'금융 (XLF)' },    { v:'XLV', l:'헬스케어 (XLV)' },
  { v:'XLK', l:'기술 (XLK)' },    { v:'XLI', l:'산업재 (XLI)' },
  { v:'XLY', l:'소비재경기 (XLY)'},{ v:'XLP', l:'소비재필수 (XLP)'},
  { v:'XLB', l:'소재 (XLB)' },    { v:'XLRE',l:'부동산 (XLRE)'},
  { v:'XLU', l:'유틸리티 (XLU)' },{ v:'IBB', l:'바이오 (IBB)' },
];
const DEFAULT_SECTORS = ['SOXX','XLE','XLF','XLV','XLK','XLI'];
const PERIODS_SEC = [
  {v:'1mo',l:'1개월'},{v:'3mo',l:'3개월'},{v:'6mo',l:'6개월'},
  {v:'1y',l:'1년'},{v:'2y',l:'2년'},{v:'5y',l:'5년'},
];

function renderSector(el) {
  el.innerHTML = `
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="margin-bottom:16px;">
        <label class="param-label" style="margin-bottom:8px; display:block;">섹터 ETF 선택</label>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:8px;" id="sec-grid">
          ${SECTOR_OPTS.map(t => `
            <label style="display:flex; align-items:center; gap:8px; padding:8px 12px;
                   background:#0f172a; border-radius:8px; cursor:pointer;
                   border:1px solid #334155; font-size:0.8rem; color:#94a3b8;">
              <input type="checkbox" value="${t.v}" ${DEFAULT_SECTORS.includes(t.v)?'checked':''}
                     style="accent-color:#3b82f6;"/>
              ${t.l}
            </label>`).join('')}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px; flex-wrap:wrap;">
        <label class="param-label" style="margin:0;">기간:</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap;" id="sec-period">
          ${PERIODS_SEC.map(p => `
            <button data-p="${p.v}" class="sec-pbtn"
              style="padding:5px 12px; border-radius:6px; border:1px solid #334155; cursor:pointer;
                     font-size:0.8rem; background:${p.v==='1y'?'#2563eb':'#0f172a'};
                     color:${p.v==='1y'?'#fff':'#94a3b8'};">${p.l}</button>`).join('')}
        </div>
      </div>
      <button class="run-btn" id="sec-run">▶ 비교 분석</button>
      <div id="sec-result" style="margin-top:20px;"></div>
    </div>`;

  let selPeriod = '1y';
  el.querySelectorAll('.sec-pbtn').forEach(b => {
    b.addEventListener('click', () => {
      selPeriod = b.dataset.p;
      el.querySelectorAll('.sec-pbtn').forEach(x => {
        x.style.background = x===b?'#2563eb':'#0f172a';
        x.style.color      = x===b?'#fff':'#94a3b8';
      });
    });
  });

  el.querySelector('#sec-run').addEventListener('click', async () => {
    const btn    = el.querySelector('#sec-run');
    const result = el.querySelector('#sec-result');
    const tickers = [...el.querySelectorAll('#sec-grid input:checked')].map(x => x.value);
    if (!tickers.length) { result.innerHTML='<p style="color:#ef4444;">최소 1개 선택하세요.</p>'; return; }
    btn.disabled=true; btn.textContent='수신 중...';
    result.innerHTML='<p style="color:#94a3b8;">Yahoo Finance 데이터 수신 중... (10~20초)</p>';
    try {
      const data = await api.industrySector({ tickers, period: selPeriod });
      let html = '';
      if (data.image) html += `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:16px;"/>`;
      if (data.summary) {
        const sorted = Object.entries(data.summary).sort((a,b)=>b[1].return_pct-a[1].return_pct);
        html += `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.825rem;">
          <thead><tr style="background:#0f172a;">
            <th style="padding:8px 12px;text-align:left;color:#64748b;font-size:0.7rem;">섹터</th>
            <th style="padding:8px 12px;text-align:right;color:#64748b;font-size:0.7rem;">수익률</th>
            <th style="padding:8px 12px;text-align:right;color:#64748b;font-size:0.7rem;">연환산 변동성</th>
          </tr></thead><tbody>
          ${sorted.map(([n,s])=>`<tr style="border-bottom:1px solid #334155;">
            <td style="padding:8px 12px;color:#e2e8f0;">${n}</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700;
                color:${s.return_pct>=0?'#22c55e':'#ef4444'};">${s.return_pct>=0?'▲':'▼'}${Math.abs(s.return_pct).toFixed(2)}%</td>
            <td style="padding:8px 12px;text-align:right;color:#94a3b8;">${s.annual_vol.toFixed(1)}%</td>
          </tr>`).join('')}
          </tbody></table></div>`;
      }
      result.innerHTML = html;
    } catch(e) {
      result.innerHTML=`<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled=false; btn.textContent='▶ 비교 분석';
    }
  });
}


// ── Tab 3: 산업 생애주기 ─────────────────────────────────────────────────────
const STAGES = ['도입기','성장기','성숙기','쇠퇴기'];
const STAGE_COLORS = {'도입기':'#3b82f6','성장기':'#22c55e','성숙기':'#f59e0b','쇠퇴기':'#ef4444'};
const STAGE_EXAMPLES = {
  '도입기': '양자컴퓨터, 핵융합, 뇌-컴퓨터 인터페이스',
  '성장기': 'AI 반도체, 전기차, 클라우드, 우주산업',
  '성숙기': '스마트폰, 자동차, 은행, 석유화학',
  '쇠퇴기': '인쇄매체, 유선전화, DVD 렌탈',
};

function renderLifecycle(el) {
  el.innerHTML = `
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <!-- 단계 선택 카드 -->
      <div style="margin-bottom:20px;">
        <label class="param-label" style="margin-bottom:10px; display:block;">현재 생애주기 단계 선택</label>
        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px;" id="stage-cards">
          ${STAGES.map((s,i) => `
            <div data-stage="${s}" class="stage-card"
                 style="text-align:center; padding:16px 8px; background:#0f172a; border-radius:10px;
                        cursor:pointer; border:2px solid ${i===1?STAGE_COLORS[s]:'#334155'};
                        transition:all 0.15s;"
                 onclick="this.closest('#ia-content, div').querySelectorAll && (() => {})()">
              <div style="font-size:1.25rem; margin-bottom:6px;"><i class="${['fa-solid fa-seedling','fa-solid fa-chart-line','fa-solid fa-scale-balanced','fa-solid fa-arrow-trend-down'][i]}"></i></div>
              <div style="font-size:0.875rem; font-weight:700; color:${STAGE_COLORS[s]};">${s}</div>
              <div style="font-size:0.68rem; color:#64748b; margin-top:4px; line-height:1.4;">${STAGE_EXAMPLES[s]}</div>
            </div>`).join('')}
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
        <div>
          <label class="param-label">분석 산업명</label>
          <input id="lc-ind" type="text" value="전기차" class="param-input"/>
        </div>
      </div>
      <button class="run-btn" id="lc-run">▶ 생애주기 분석</button>
      <div id="lc-result" style="margin-top:20px;"></div>
    </div>`;

  let selStage = '성장기';

  el.querySelectorAll('.stage-card').forEach(card => {
    card.addEventListener('click', () => {
      selStage = card.dataset.stage;
      el.querySelectorAll('.stage-card').forEach(c => {
        const col = STAGE_COLORS[c.dataset.stage];
        c.style.borderColor = c === card ? col : '#334155';
        c.style.background  = c === card ? col + '22' : '#0f172a';
      });
    });
  });

  el.querySelector('#lc-run').addEventListener('click', async () => {
    const btn    = el.querySelector('#lc-run');
    const result = el.querySelector('#lc-result');
    const industry = el.querySelector('#lc-ind').value.trim() || '전기차';
    btn.disabled=true; btn.textContent='분석 중...';
    result.innerHTML='<p style="color:#94a3b8;">생애주기 차트 생성 중...</p>';
    try {
      const data = await api.industryLifecycle({ stage: selStage, industry });
      let html = '';
      if (data.image) html += `<img src="${data.image}" style="width:100%; border-radius:8px; margin-bottom:16px;"/>`;
      if (data.strategies) {
        const col = STAGE_COLORS[selStage] || '#3b82f6';
        html += `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div style="background:#0f172a; border-radius:10px; padding:16px; border-left:3px solid ${col};">
              <div style="font-size:0.75rem; font-weight:600; color:#64748b; margin-bottom:8px; text-transform:uppercase;">단계 특징</div>
              ${data.characteristics.map(c=>`<div style="font-size:0.825rem; color:#e2e8f0; margin-bottom:5px;">• ${c}</div>`).join('')}
            </div>
            <div style="background:#0f172a; border-radius:10px; padding:16px; border-left:3px solid #3b82f6;">
              <div style="font-size:0.75rem; font-weight:600; color:#64748b; margin-bottom:8px; text-transform:uppercase;">투자 전략</div>
              ${data.strategies.map(s=>`<div style="font-size:0.825rem; color:#3b82f6; margin-bottom:5px;">• ${s}</div>`).join('')}
            </div>
          </div>`;
      }
      result.innerHTML = html;
    } catch(e) {
      result.innerHTML=`<p style="color:#ef4444;">오류: ${e.message}</p>`;
    } finally {
      btn.disabled=false; btn.textContent='▶ 생애주기 분석';
    }
  });
}


// ── Tab 4: SWOT Matrix (순수 프론트엔드) ─────────────────────────────────────
const SWOT_DEFAULTS = {
  S: '높은 기술 진입장벽\n강력한 브랜드 파워\n원가 경쟁력',
  W: '높은 설비투자 비용\n특정 고객사 의존도\n인력 부족',
  O: 'AI 수요 급증\n신흥국 시장 확대\n정부 보조금 정책',
  T: '중국 경쟁사 부상\n경기침체 수요 감소\n공급망 불안정',
};
const SWOT_COLORS = { S:'#22c55e', W:'#ef4444', O:'#3b82f6', T:'#f59e0b' };
const SWOT_LABELS = { S:'강점 (Strengths)', W:'약점 (Weaknesses)', O:'기회 (Opportunities)', T:'위협 (Threats)' };

function renderSwot(el) {
  el.innerHTML = `
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid #334155;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">
        ${['S','W','O','T'].map(k => `
          <div>
            <label style="display:block; font-size:0.75rem; font-weight:600;
                   color:${SWOT_COLORS[k]}; margin-bottom:6px; text-transform:uppercase;">
              ${SWOT_LABELS[k]}
            </label>
            <textarea id="swot-${k}" rows="4" class="param-input" style="resize:vertical;">${SWOT_DEFAULTS[k]}</textarea>
          </div>`).join('')}
      </div>
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
        <div style="flex:1;">
          <label class="param-label">기업 / 산업명</label>
          <input id="swot-title" type="text" value="삼성전자 반도체" class="param-input"/>
        </div>
        <button class="run-btn" id="swot-run" style="margin-top:18px;">▶ SWOT 매트릭스 생성</button>
      </div>
      <div id="swot-result"></div>
    </div>`;

  el.querySelector('#swot-run').addEventListener('click', () => {
    const title = el.querySelector('#swot-title').value || 'SWOT 분석';
    const items = {};
    ['S','W','O','T'].forEach(k => {
      items[k] = el.querySelector(`#swot-${k}`).value
        .split('\n').map(l => l.trim()).filter(Boolean);
    });
    renderSwotMatrix(el.querySelector('#swot-result'), title, items);
  });

  // 기본 렌더
  setTimeout(() => el.querySelector('#swot-run').click(), 50);
}

function renderSwotMatrix(el, title, items) {
  const bg = { S:'#052e16', W:'#450a0a', O:'#082f49', T:'#431407' };
  const border = { S:'#22c55e', W:'#ef4444', O:'#3b82f6', T:'#f59e0b' };

  el.innerHTML = `
    <div style="background:#0f172a; border-radius:12px; padding:20px;">
      <div style="text-align:center; font-size:1rem; font-weight:700; color:#fff; margin-bottom:16px;">
        SWOT Matrix — ${title}
      </div>
      <!-- 축 레이블 -->
      <div style="display:grid; grid-template-columns:80px 1fr 1fr; gap:4px; margin-bottom:4px;">
        <div></div>
        <div style="text-align:center; font-size:0.75rem; font-weight:700; color:#22c55e; padding:4px;
             background:#052e16; border-radius:6px;">내부 요인 (Internal)</div>
        <div style="text-align:center; font-size:0.75rem; font-weight:700; color:#3b82f6; padding:4px;
             background:#082f49; border-radius:6px;">외부 요인 (External)</div>
      </div>
      <div style="display:grid; grid-template-columns:80px 1fr 1fr; gap:4px;">
        <!-- 행 레이블 + 4분면 -->
        <div style="display:grid; grid-template-rows:1fr 1fr; gap:4px;">
          <div style="display:flex; align-items:center; justify-content:center; padding:8px 4px;
               background:#052e16; border-radius:6px; font-size:0.72rem; font-weight:700;
               color:#22c55e; text-align:center; line-height:1.4;">긍정적<br/>(Positive)</div>
          <div style="display:flex; align-items:center; justify-content:center; padding:8px 4px;
               background:#450a0a; border-radius:6px; font-size:0.72rem; font-weight:700;
               color:#ef4444; text-align:center; line-height:1.4;">부정적<br/>(Negative)</div>
        </div>
        ${[['S','O'],['W','T']].map(row => `
          <div style="display:grid; grid-template-rows:1fr 1fr; gap:4px;">
            ${row.map(k => `
              <div style="background:${bg[k]}; border:1px solid ${border[k]}; border-radius:8px;
                   padding:14px; min-height:120px;">
                <div style="font-size:0.75rem; font-weight:700; color:${border[k]};
                     margin-bottom:8px; text-transform:uppercase;">${SWOT_LABELS[k]}</div>
                ${items[k].map(line => `
                  <div style="display:flex; align-items:flex-start; gap:6px; margin-bottom:5px;">
                    <span style="color:${border[k]}; font-size:0.8rem; flex-shrink:0; margin-top:1px;">▸</span>
                    <span style="font-size:0.8rem; color:#e2e8f0; line-height:1.4;">${line}</span>
                  </div>`).join('')}
              </div>`).join('')}
          </div>`).join('')}
      </div>
      <!-- SO/ST/WO/WT 전략 힌트 -->
      <div style="margin-top:16px; display:grid; grid-template-columns:repeat(2,1fr); gap:10px;">
        ${[
          { label:'SO 전략', desc:'강점으로 기회 활용', color:'#22c55e', hint:'공격적 확장 전략' },
          { label:'ST 전략', desc:'강점으로 위협 대응', color:'#f59e0b', hint:'다각화·방어 전략' },
          { label:'WO 전략', desc:'기회로 약점 보완', color:'#3b82f6', hint:'내부 역량 강화 전략' },
          { label:'WT 전략', desc:'약점·위협 최소화', color:'#ef4444', hint:'축소·철수 전략' },
        ].map(s => `
          <div style="background:#1e293b; border-radius:8px; padding:10px 14px;
               border-left:3px solid ${s.color}; display:flex; align-items:center; gap:10px;">
            <div>
              <div style="font-size:0.8rem; font-weight:700; color:${s.color};">${s.label}</div>
              <div style="font-size:0.75rem; color:#94a3b8;">${s.desc} → ${s.hint}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}
