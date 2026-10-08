import { apiFetch } from '../api.js';

// ── helpers ────────────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function eok(v) {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  if (isNaN(n)) return '-';
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '억원';
}

function pct(v, digits = 1) {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  if (isNaN(n)) return '-';
  return (n >= 0 ? '+' : '') + n.toFixed(digits) + '%';
}

function pctColor(v, invert = false) {
  if (v === null || v === undefined) return '#64748b';
  const positive = invert ? v < 0 : v >= 0;
  return positive ? '#22c55e' : '#ef4444';
}

// ── Score Gauge (SVG) ────────────────────────────────────────────────────────

function gaugeHTML(score, grade, verdict) {
  const radius  = 52;
  const circ    = 2 * Math.PI * radius;
  const fill    = (score / 100) * circ * 0.75;  // 3/4 arc
  const offset  = circ * 0.125;                 // start at 7-o'clock

  const scoreColor =
    score >= 80 ? '#22c55e' :
    score >= 65 ? '#3b82f6' :
    score >= 50 ? '#f59e0b' : '#ef4444';

  const gradeColor =
    grade.startsWith('A') ? '#22c55e' :
    grade === 'B+' || grade === 'B' ? '#3b82f6' :
    grade === 'C' ? '#f59e0b' : '#ef4444';

  return `
    <div style="display:flex; flex-direction:column; align-items:center; gap:6px;">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <!-- background arc -->
        <circle cx="70" cy="70" r="${radius}"
          fill="none" stroke="#1e293b" stroke-width="12"
          stroke-dasharray="${circ * 0.75} ${circ * 0.25}"
          stroke-dashoffset="${-offset}" stroke-linecap="round"
          transform="rotate(135 70 70)"/>
        <!-- score arc -->
        <circle cx="70" cy="70" r="${radius}"
          fill="none" stroke="${scoreColor}" stroke-width="12"
          stroke-dasharray="${fill} ${circ - fill}"
          stroke-dashoffset="${-offset}" stroke-linecap="round"
          transform="rotate(135 70 70)"
          style="transition:stroke-dasharray .8s ease;"/>
        <!-- score text -->
        <text x="70" y="63" text-anchor="middle" font-size="26" font-weight="800"
          fill="${scoreColor}" font-family="inherit">${Math.round(score)}</text>
        <text x="70" y="80" text-anchor="middle" font-size="11" fill="#64748b"
          font-family="inherit">/ 100점</text>
        <!-- grade -->
        <text x="70" y="98" text-anchor="middle" font-size="14" font-weight="700"
          fill="${gradeColor}" font-family="inherit">${esc(grade)}</text>
      </svg>
      <div style="font-size:0.78rem; color:${scoreColor}; font-weight:700; letter-spacing:.04em;">
        ${esc(verdict)}
      </div>
    </div>`;
}

// ── Ratio card ────────────────────────────────────────────────────────────────

function ratioCard(label, value, unit = '%', invert = false, hint = '') {
  const n    = (value !== null && value !== undefined) ? Number(value) : null;
  const disp = n !== null ? ((n >= 0 ? '' : '') + n.toFixed(1) + unit) : '-';
  const color = n !== null ? pctColor(n, invert) : '#64748b';
  return `
    <div style="background:#0f172a; border:1px solid #1e293b; border-radius:10px; padding:14px 16px; min-width:120px; flex:1;">
      <div style="font-size:0.7rem; color:#64748b; margin-bottom:5px; letter-spacing:.03em;">${label}</div>
      <div style="font-size:1.1rem; font-weight:700; color:${color};">${disp}</div>
      ${hint ? `<div style="font-size:0.68rem; color:#475569; margin-top:3px;">${hint}</div>` : ''}
    </div>`;
}

// ── Score breakdown bar ───────────────────────────────────────────────────────

function breakdownHTML(breakdown) {
  const entries = Object.entries(breakdown);
  return entries.map(([label, { score, max, value }]) => {
    const pct_ = max > 0 ? (score / max * 100) : 0;
    const color = pct_ >= 75 ? '#22c55e' : pct_ >= 50 ? '#3b82f6' : pct_ >= 25 ? '#f59e0b' : '#ef4444';
    const valStr = value !== null && value !== undefined
      ? (Number(value).toFixed(1) + (label.includes('비율') || label.includes('률') || label.includes('ROE') || label.includes('ROA') ? '%' : ''))
      : '-';
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-size:0.78rem; color:#94a3b8;">${label}</span>
          <span style="font-size:0.75rem; color:${color}; font-weight:600;">${score}/${max}점 <span style="color:#475569;">(${valStr})</span></span>
        </div>
        <div style="background:#1e293b; border-radius:4px; height:6px; overflow:hidden;">
          <div style="width:${pct_}%; height:100%; background:${color}; border-radius:4px; transition:width .6s ease;"></div>
        </div>
      </div>`;
  }).join('');
}

// ── Financial table ───────────────────────────────────────────────────────────

function finTableHTML(snap, bsns_year) {
  const prevYear = String(Number(bsns_year) - 1);
  const rows = [
    ['매출액',        snap.revenue,       snap.prev_revenue],
    ['영업이익',      snap.op_income,     snap.prev_op_income],
    ['당기순이익',    snap.net_income,    snap.prev_net_income],
    ['자산총계',      snap.total_assets,  null],
    ['부채총계',      snap.total_liabilities, null],
    ['자본총계',      snap.total_equity,  null],
    ['유동자산',      snap.current_assets, null],
    ['유동부채',      snap.current_liabilities, null],
    ['이익잉여금',    snap.retained_earnings, null],
  ];
  const ths = (txt) => `<th style="padding:8px 14px; text-align:${txt === '항목' ? 'left' : 'right'}; color:#64748b; font-size:0.75rem; border-bottom:1px solid #334155; white-space:nowrap;">${txt}</th>`;
  const header = `<tr>${ths('항목')}${ths(bsns_year + '년')}${ths(prevYear + '년 (전기)')}${ths('전기比')}</tr>`;
  const bodyRows = rows.map(([ lbl, cur, prev ], i) => {
    const bg = i % 2 === 1 ? 'background:#0a1628;' : '';
    const curStr  = cur  !== null ? eok(cur)  : '-';
    const prevStr = prev !== null ? eok(prev) : '-';
    let growStr = '-', growColor = '#64748b';
    if (cur !== null && prev !== null && prev !== 0) {
      const g = (cur - prev) / Math.abs(prev) * 100;
      growStr  = pct(g);
      growColor = g >= 0 ? '#22c55e' : '#ef4444';
    }
    const td = (v, align = 'right', color = '#cbd5e1') =>
      `<td style="padding:7px 14px; text-align:${align}; color:${color}; font-size:0.82rem; border-bottom:1px solid #1e293b;">${v}</td>`;
    return `<tr style="${bg}">${td(lbl, 'left')}${td(curStr)}${td(prevStr, 'right', '#64748b')}${td(growStr, 'right', growColor)}</tr>`;
  }).join('');
  return `<div style="overflow-x:auto;">
    <table style="width:100%; border-collapse:collapse;">
      <thead>${header}</thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderAnalysis(data, container) {
  const { company, financials, ratios, health, analysis, bsns_year } = data;
  const { score, grade, verdict, breakdown } = health;
  const { outlook, outlook_color, outlook_reason, paragraphs, disclaimer } = analysis;

  const marketBadge = {
    KOSPI:  { label: 'KOSPI', bg: '#1d4ed8', color: '#bfdbfe' },
    KOSDAQ: { label: 'KOSDAQ', bg: '#065f46', color: '#6ee7b7' },
    KONEX:  { label: 'KONEX', bg: '#78350f', color: '#fde68a' },
  }[company.market] || { label: company.market, bg: '#374151', color: '#d1d5db' };

  const outlookStyle = {
    green:  { bg: '#052e16', border: '#16a34a', color: '#4ade80', tag: 'BUY' },
    yellow: { bg: '#1c1917', border: '#ca8a04', color: '#facc15', tag: 'HOLD' },
    red:    { bg: '#1c0808', border: '#dc2626', color: '#f87171', tag: 'SELL' },
  }[outlook_color] || { bg: '#1e293b', border: '#334155', color: '#94a3b8', tag: '??' };

  container.innerHTML = `
    <!-- Company header -->
    <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px 24px; margin-bottom:18px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            <span style="font-size:1.2rem; font-weight:800; color:#f1f5f9;">${esc(company.corp_name)}</span>
            <span style="background:${marketBadge.bg}; color:${marketBadge.color}; font-size:0.72rem;
              font-weight:700; padding:3px 8px; border-radius:4px; letter-spacing:.04em;">
              ${marketBadge.label}
            </span>
            <span style="background:#0f172a; color:#94a3b8; font-size:0.72rem; padding:3px 8px; border-radius:4px;">
              ${esc(company.stock_code)}
            </span>
          </div>
          <div style="font-size:0.8rem; color:#64748b; line-height:1.8;">
            <span>대표이사: <b style="color:#94a3b8;">${esc(company.ceo_nm)}</b></span>
            <span style="margin:0 10px; color:#334155;">|</span>
            <span>설립: <b style="color:#94a3b8;">${esc(company.est_dt?.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3'))}</b></span>
            <span style="margin:0 10px; color:#334155;">|</span>
            <span>${esc(company.adres)}</span>
          </div>
        </div>
        <div style="text-align:right; font-size:0.78rem; color:#64748b;">
          <div>${bsns_year}년 ${financials.is_consolidated ? '연결' : '별도'}재무제표</div>
          <div style="color:#475569;">DART 공시 기준</div>
        </div>
      </div>
    </div>

    <!-- Top row: Gauge + Outlook + Key ratios -->
    <div style="display:grid; grid-template-columns:auto 1fr; gap:16px; margin-bottom:18px; align-items:start;">

      <!-- Gauge -->
      <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; text-align:center;">
        <div style="font-size:0.78rem; color:#64748b; margin-bottom:12px; font-weight:600;">재무 건전성 점수</div>
        ${gaugeHTML(score, grade, verdict)}
        <div style="margin-top:14px; font-size:0.72rem; color:#475569;">총 100점 만점</div>
      </div>

      <!-- Right panel -->
      <div style="display:flex; flex-direction:column; gap:14px;">

        <!-- Investment outlook -->
        <div style="background:${outlookStyle.bg}; border:1px solid ${outlookStyle.border};
            border-radius:12px; padding:16px 20px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
            <span style="background:${outlookStyle.border}; color:${outlookStyle.color};
              font-size:0.85rem; font-weight:800; padding:4px 12px; border-radius:6px;
              letter-spacing:.06em;">${esc(analysis.outlook_eng)}</span>
            <span style="font-size:1rem; font-weight:700; color:${outlookStyle.color};">${esc(outlook)}</span>
          </div>
          <p style="font-size:0.82rem; color:${outlookStyle.color}; margin:0; line-height:1.6; opacity:.9;">
            ${esc(outlook_reason)}
          </p>
        </div>

        <!-- Key ratios -->
        <div style="display:flex; flex-wrap:wrap; gap:10px;">
          ${ratioCard('부채비율', ratios.debt_equity_ratio, '%', true, '낮을수록 안전')}
          ${ratioCard('영업이익률', ratios.op_margin, '%', false, '높을수록 수익성↑')}
          ${ratioCard('ROE', ratios.roe, '%', false, '자기자본이익률')}
          ${ratioCard('유동비율', ratios.current_ratio, '%', false, '100%↑ 권장')}
          ${ratioCard('매출 성장', ratios.revenue_growth, '%', false, '전년 대비')}
          ${ratioCard('순이익률', ratios.net_margin, '%', false, '')}
        </div>
      </div>
    </div>

    <!-- Rule-based analysis paragraphs -->
    <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:18px;">
      <div style="font-size:0.88rem; font-weight:700; color:#e2e8f0; margin-bottom:14px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <i class="fa-solid fa-robot" style="color:#6366f1;"></i> 재무 분석 (룰 기반)
        <span style="font-size:0.72rem; color:#475569; font-weight:400;">(DART 공시 데이터 기반 자동 분석)</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${paragraphs.map((p, i) => `
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <span style="background:#1d4ed8; color:#93c5fd; font-size:0.68rem; font-weight:700;
              padding:2px 7px; border-radius:4px; margin-top:2px; white-space:nowrap; flex-shrink:0;">
              ${String.fromCharCode(0x2460 + i)}
            </span>
            <p style="font-size:0.85rem; color:#cbd5e1; margin:0; line-height:1.7;">${esc(p)}</p>
          </div>`).join('')}
      </div>
      <p style="font-size:0.72rem; color:#475569; margin:14px 0 0; padding-top:10px; border-top:1px solid #1e293b;">
        ※ ${esc(disclaimer)}
      </p>
    </div>

    <!-- Score breakdown -->
    <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:18px;">
      <div style="font-size:0.88rem; font-weight:700; color:#e2e8f0; margin-bottom:14px;">
        <i class="fa-solid fa-chart-bar" style="color:#3b82f6; margin-right:7px;"></i>항목별 평가
      </div>
      ${breakdownHTML(breakdown)}
    </div>

    <!-- Financial data table -->
    <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:18px;">
      <div style="font-size:0.88rem; font-weight:700; color:#e2e8f0; margin-bottom:14px;">
        <i class="fa-solid fa-table" style="color:#3b82f6; margin-right:7px;"></i>주요 재무 현황
        <span style="font-size:0.72rem; color:#475569; font-weight:400;">(단위: 억원)</span>
      </div>
      ${finTableHTML(financials, bsns_year)}
    </div>
  `;
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function dartFinancialAnalysisView(container) {
  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <h1 style="font-weight:700; color:#1e293b; margin-bottom:6px;">
        <i class="fa-solid fa-magnifying-glass-dollar" style="margin-right:8px; color:#3b82f6;"></i>DART 기업 재무 분석
      </h1>
      <p style="font-size:0.875rem; color:#64748b; line-height:1.6;">
        DART에서 기업을 검색해 재무제표를 불러오고, 재무 건전성·KOSPI/KOSDAQ 구분·투자 관점의 지표를 자동으로 정리합니다.
      </p>
    </div>

    <!-- Search panel -->
    <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:20px;">
      <div style="font-size:0.85rem; font-weight:700; color:#e2e8f0; margin-bottom:14px;">
        <i class="fa-solid fa-magnifying-glass" style="margin-right:6px; color:#3b82f6;"></i>기업 검색
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
        <div>
          <label class="param-label">기업명</label>
          <input id="dfa-company-name" type="text" value="삼성전자" class="param-input"
            placeholder="예: 삼성전자, 카카오, 현대차" style="min-width:200px;"/>
        </div>
        <button class="run-btn" id="dfa-search-btn" style="padding:9px 20px; font-size:0.85rem;">
          <i class="fa-solid fa-magnifying-glass"></i> 검색
        </button>
      </div>
      <div id="dfa-search-status" style="margin-top:10px; font-size:0.82rem;"></div>
      <div id="dfa-search-results" style="margin-top:14px;"></div>
    </div>

    <!-- Analysis panel -->
    <div id="dfa-analysis-wrap" style="display:none;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap;
          gap:10px; margin-bottom:14px;">
        <div style="font-size:0.9rem; font-weight:700; color:#e2e8f0;">
          <i class="fa-solid fa-chart-line" style="margin-right:7px; color:#6366f1;"></i>재무 분석 결과
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <div>
            <label class="param-label" style="display:inline; margin-right:6px;">과세연도</label>
            <select id="dfa-year" class="param-input" style="background:#0f172a; color:#e2e8f0; padding:5px 8px;">
              ${[2024,2023,2022,2021,2020].map(y => `<option value="${y}"${y===2023?' selected':''}>${y}년</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="param-label" style="display:inline; margin-right:6px;">보고서</label>
            <select id="dfa-reprt" class="param-input" style="background:#0f172a; color:#e2e8f0; padding:5px 8px;">
              <option value="11011">사업보고서</option>
              <option value="11012">반기보고서</option>
              <option value="11013">1분기</option>
              <option value="11014">3분기</option>
            </select>
          </div>
        </div>
      </div>
      <div id="dfa-loading" style="display:none; text-align:center; padding:40px; color:#94a3b8; font-size:0.9rem;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:#3b82f6; margin-bottom:12px; display:block;"></i>
        DART 재무제표를 조회하고 재무 지표를 계산하고 있습니다…
      </div>
      <div id="dfa-analysis-content"></div>
    </div>

    <style>
      .dfa-company-card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 10px;
        padding: 14px 16px;
        cursor: pointer;
        transition: border-color .15s, background .15s;
      }
      .dfa-company-card:hover { border-color: #3b82f6; background: #0d1829; }
      .dfa-company-card.selected { border-color: #3b82f6; background: #0d1829; }
    </style>
  `;

  let _selectedCorp = null;

  const searchInput   = container.querySelector('#dfa-company-name');
  const searchBtn     = container.querySelector('#dfa-search-btn');
  const searchStatus  = container.querySelector('#dfa-search-status');
  const searchResults = container.querySelector('#dfa-search-results');
  const analysisWrap  = container.querySelector('#dfa-analysis-wrap');
  const loadingEl     = container.querySelector('#dfa-loading');
  const contentEl     = container.querySelector('#dfa-analysis-content');
  const yearSel        = container.querySelector('#dfa-year');
  const reprtSel       = container.querySelector('#dfa-reprt');

  // ── Search ────────────────────────────────────────────────────────────────
  async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;

    searchBtn.disabled = true;
    searchStatus.innerHTML = `<span style="color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> 검색 중...</span>`;
    searchResults.innerHTML = '';

    try {
      const data = await apiFetch('/api/dart/company-search', {
        method: 'POST', body: JSON.stringify({ company_name: q, limit: 10 }),
      });
      if (!data.results?.length) {
        searchStatus.innerHTML = `<span style="color:#f97316;">검색 결과가 없습니다.</span>`;
        return;
      }
      searchStatus.innerHTML = `<span style="color:#64748b;">${data.count}건 검색됨 — 기업을 선택하면 재무 AI 분석을 시작합니다.</span>`;

      searchResults.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:10px;">
          ${data.results.map(item => {
            const mkt = item.corp_cls === 'Y' ? 'KOSPI' : item.corp_cls === 'K' ? 'KOSDAQ'
                      : item.corp_cls === 'N' ? 'KONEX' : '기타';
            const mktColor = { KOSPI:'#bfdbfe', KOSDAQ:'#6ee7b7', KONEX:'#fde68a' }[mkt] || '#d1d5db';
            const mktBg    = { KOSPI:'#1d4ed8', KOSDAQ:'#065f46', KONEX:'#78350f' }[mkt] || '#374151';
            return `
              <div class="dfa-company-card" data-corp-code="${esc(item.corp_code)}" data-corp-name="${esc(item.corp_name)}">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                  <span style="font-size:0.92rem; font-weight:700; color:#f1f5f9;">${esc(item.corp_name)}</span>
                  <span style="background:${mktBg}; color:${mktColor}; font-size:0.66rem; font-weight:700;
                    padding:2px 6px; border-radius:3px; flex-shrink:0;">${mkt}</span>
                </div>
                <div style="font-size:0.75rem; color:#64748b; line-height:1.6;">
                  <div>종목코드: <b style="color:#94a3b8;">${esc(item.stock_code)}</b></div>
                  <div>DART 번호: <span style="color:#475569;">${esc(item.corp_code)}</span></div>
                </div>
                <div style="margin-top:8px;">
                  <button class="dfa-analyze-btn" data-corp-code="${esc(item.corp_code)}"
                    style="background:#3b82f6; color:#fff; border:none; border-radius:6px;
                           padding:6px 14px; font-size:0.78rem; font-weight:600; cursor:pointer;
                           width:100%;">
                    <i class="fa-solid fa-robot"></i> AI 재무 분석
                  </button>
                </div>
              </div>`;
          }).join('')}
        </div>`;

      // wire up analyze buttons
      searchResults.querySelectorAll('.dfa-analyze-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const corpCode = btn.dataset.corpCode;
          // mark card as selected
          searchResults.querySelectorAll('.dfa-company-card').forEach(c => c.classList.remove('selected'));
          btn.closest('.dfa-company-card').classList.add('selected');
          runAnalysis(corpCode);
        });
      });

    } catch (e) {
      searchStatus.innerHTML = `<span style="color:#ef4444;">오류: ${esc(e.message)}</span>`;
    } finally {
      searchBtn.disabled = false;
    }
  }

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  // ── Analysis ──────────────────────────────────────────────────────────────
  async function runAnalysis(corpCode) {
    _selectedCorp = corpCode;
    analysisWrap.style.display = 'block';
    loadingEl.style.display = 'block';
    contentEl.innerHTML = '';
    analysisWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const payload = {
        corp_code:    corpCode,
        bsns_year:    yearSel.value,
        reprt_code:   reprtSel.value,
      };
      const data = await apiFetch('/api/dart/financial-analysis', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      renderAnalysis(data, contentEl);
    } catch (e) {
      contentEl.innerHTML = `
        <div style="background:#1c0808; border:1px solid #dc2626; border-radius:10px; padding:16px 20px; color:#f87171;">
          <strong>분석 실패:</strong> ${esc(e.message)}
          <p style="font-size:0.8rem; color:#7f1d1d; margin:6px 0 0;">
            DART 사업보고서가 없거나 아직 공시 전일 수 있습니다. 연도를 변경해 다시 시도하세요.
          </p>
        </div>`;
    } finally {
      loadingEl.style.display = 'none';
    }
  }

  // Re-analyze when year/report type changes
  [yearSel, reprtSel].forEach(sel => {
    sel.addEventListener('change', () => {
      if (_selectedCorp) runAnalysis(_selectedCorp);
    });
  });
}
