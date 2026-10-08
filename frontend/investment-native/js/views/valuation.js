// ── 공통 유틸 ────────────────────────────────────────────────────────────────
function fmt(n, digits = 0) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString('ko-KR', { maximumFractionDigits: digits });
}

function fmtPct(n, digits = 1) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return `${Number(n).toFixed(digits)}%`;
}

// ── 탭 공통 셸 ────────────────────────────────────────────────────────────────
function tabShell(tabs) {
  return `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700;color:#0f172a;margin-bottom:6px;">
        <i class="fa-solid fa-calculator"></i> 밸류에이션 실습
      </h1>
      <p style="font-size:0.875rem;color:#475569;line-height:1.6;">
        기업 선정부터 DCF·EVA·FCF 절대가치 평가까지 단계별로 실습합니다.
        가정을 바꿔가며 가치 범위를 직접 확인해보세요.
      </p>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:20px;border-bottom:1px solid #d9e1ec;padding-bottom:0;">
      ${tabs.map((t, i) => `
        <button class="va-tab" data-tab="${i}"
          style="padding:9px 16px;border:none;border-radius:8px 8px 0 0;cursor:pointer;
                 font-size:0.82rem;font-weight:600;transition:all 0.15s;
                 background:${i === 0 ? '#2563eb' : '#f1f5f9'};
                 color:${i === 0 ? '#fff' : '#475569'};">
          ${t}
        </button>`).join('')}
    </div>
    <div id="va-content"></div>`;
}

function activateTab(container, idx, renders) {
  container.querySelectorAll('.va-tab').forEach((btn, i) => {
    btn.style.background = i === idx ? '#2563eb' : '#f1f5f9';
    btn.style.color      = i === idx ? '#fff'    : '#475569';
  });
  renders[idx](container.querySelector('#va-content'));
}

// ── 카드 래퍼 ─────────────────────────────────────────────────────────────────
function card(title, icon, body, accent = '#2563eb') {
  return `
    <div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;border-left:3px solid ${accent};border:1px solid #e2e8f0;border-left:3px solid ${accent};box-shadow:0 1px 4px #0001;">
      <h3 style="font-size:0.95rem;font-weight:700;color:#0f172a;margin:0 0 14px;">
        <i class="${icon}" style="color:${accent};margin-right:6px;"></i>${title}
      </h3>
      ${body}
    </div>`;
}

function infoBox(text, color = '#3b82f6') {
  return `<div style="background:${color}12;border:1px solid ${color}44;border-radius:8px;padding:12px 14px;font-size:0.83rem;color:#1e293b;line-height:1.65;margin-bottom:14px;">${text}</div>`;
}

function badge(label, color = '#2563eb') {
  return `<span style="display:inline-block;background:${color}18;color:${color};border:1px solid ${color}44;border-radius:20px;padding:2px 10px;font-size:0.75rem;font-weight:600;margin:2px;">${label}</span>`;
}

function resultRow(label, value, highlight = false) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e2e8f0;">
    <span style="font-size:0.85rem;color:${highlight ? '#0f172a' : '#64748b'};font-weight:${highlight ? '700' : '400'};">${label}</span>
    <span style="font-size:0.9rem;color:${highlight ? '#2563eb' : '#0f172a'};font-weight:${highlight ? '700' : '500'};">${value}</span>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// Tab 1: 기업 선정 가이드
// ════════════════════════════════════════════════════════════════════════════
function renderCompanySelect(content) {
  const criteria = [
    { icon: 'fa-solid fa-money-bill-trend-up', label: '안정적 FCF 창출', desc: '영업현금흐름이 3년 이상 꾸준히 플러스인 기업', good: '반도체·소프트웨어·브랜드 소비재', bad: '초기 스타트업·적자 바이오', color: '#22c55e' },
    { icon: 'fa-solid fa-chart-line', label: '이해 가능한 사업 모델', desc: '"이 회사는 무엇으로 돈을 버나?"를 한 문장으로 설명할 수 있어야 한다', good: '편의점, 반도체 파운드리, 플랫폼', bad: '복잡한 금융지주, 지주회사', color: '#3b82f6' },
    { icon: 'fa-solid fa-shield-halved', label: '경쟁 우위(해자)', desc: '브랜드·특허·전환비용·네트워크효과 중 하나 이상 보유', good: '삼성전자(기술), 카카오(네트워크)', bad: '완전 경쟁 업종(철강·화학)', color: '#a855f7' },
    { icon: 'fa-solid fa-database', label: '재무 데이터 접근성', desc: 'DART 공시 재무제표가 3년 이상 조회 가능한 상장법인', good: '코스피/코스닥 상장사', bad: '상장 전 기업, 특수목적법인', color: '#f59e0b' },
    { icon: 'fa-solid fa-magnifying-glass-chart', label: '예측 가능한 성장성', desc: '매출·이익 성장 방향이 산업 구조상 어느 정도 예측 가능한 기업', good: '인구 구조 수혜주, 에너지전환 수혜주', bad: '사이클 극단 업종, 규제 리스크 높은 업종', color: '#06b6d4' },
  ];

  const sampleCompanies = [
    { name: '삼성전자', sector: '반도체·IT', ticker: '005930', why: '안정적 FCF, 글로벌 1위 파운드리·메모리, DART 데이터 풍부', difficulty: '<i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-regular fa-star"></i><i class="fa-regular fa-star"></i>' },
    { name: 'NAVER', sector: '인터넷 플랫폼', ticker: '035420', why: '광고·커머스·클라우드 수익 구조 이해 용이, 네트워크 해자', difficulty: '<i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-regular fa-star"></i><i class="fa-regular fa-star"></i><i class="fa-regular fa-star"></i>' },
    { name: '셀트리온', sector: '바이오·제약', ticker: '068270', why: '바이오시밀러 글로벌 판매, 성장성 높지만 가정 난이도 높음', difficulty: '<i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-regular fa-star"></i>' },
    { name: '현대차', sector: '자동차·EV', ticker: '005380', why: '전통 자동차 + EV 전환기, 실물 자산 기반 FCF 분석에 적합', difficulty: '<i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-regular fa-star"></i><i class="fa-regular fa-star"></i>' },
    { name: 'LG에너지솔루션', sector: '2차전지', ticker: '373220', why: '글로벌 EV 배터리 수요 성장, 장기 계약 기반 예측 가능성', difficulty: '<i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-regular fa-star"></i>' },
    { name: '카카오', sector: '플랫폼·핀테크', ticker: '035720', why: '다양한 수익 모델이지만 구조 복잡, 중급 수준 실습에 적합', difficulty: '<i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-regular fa-star"></i><i class="fa-regular fa-star"></i>' },
  ];

  const checklist = [
    '최근 3년 영업현금흐름(CFO)이 꾸준히 플러스인가?',
    'FCF = CFO - Capex가 양수인가? (마이너스라면 이유가 설명되는가?)',
    '부채비율이 업종 평균을 크게 초과하지 않는가?',
    '주력 사업이 무엇인지 한 문장으로 설명할 수 있는가?',
    '향후 3~5년 매출 성장 방향이 어느 정도 예측 가능한가?',
    'DART에서 감사보고서(연결 재무제표) 3년치를 확인할 수 있는가?',
  ];

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:20px;">
      ${criteria.map(c => `
        <div style="background:#f8fafc;border-radius:10px;padding:16px;border-top:3px solid ${c.color};border:1px solid #e2e8f0;border-top:3px solid ${c.color};">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <i class="${c.icon}" style="color:${c.color};font-size:1rem;"></i>
            <span style="font-size:0.9rem;font-weight:700;color:#0f172a;">${c.label}</span>
          </div>
          <p style="font-size:0.8rem;color:#475569;line-height:1.55;margin:0 0 10px;">${c.desc}</p>
          <div style="font-size:0.75rem;">
            <div style="color:#16a34a;margin-bottom:3px;"><i class="fa-solid fa-circle-check"></i> 적합: ${c.good}</div>
            <div style="color:#dc2626;"><i class="fa-solid fa-circle-xmark"></i> 주의: ${c.bad}</div>
          </div>
        </div>`).join('')}
    </div>

    ${card('실습 추천 기업 6선', 'fa-solid fa-star', `
      ${infoBox('아래 기업들은 DART 데이터 접근성이 좋고 사업 구조가 상대적으로 명확해 밸류에이션 실습에 적합합니다. 이 페이지의 DCF·EVA·FCF 탭에서 바로 가정값을 입력해볼 수 있습니다.', '#a855f7')}
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <th style="text-align:left;padding:8px 6px;color:#475569;font-weight:600;">기업명</th>
              <th style="text-align:left;padding:8px 6px;color:#475569;font-weight:600;">섹터</th>
              <th style="text-align:left;padding:8px 6px;color:#475569;font-weight:600;">선정 이유</th>
              <th style="text-align:center;padding:8px 6px;color:#475569;font-weight:600;">난이도</th>
            </tr>
          </thead>
          <tbody>
            ${sampleCompanies.map(c => `
              <tr style="border-bottom:1px solid #e9f0f8;">
                <td style="padding:8px 6px;color:#2563eb;font-weight:600;">${c.name}</td>
                <td style="padding:8px 6px;color:#0f172a;">${badge(c.sector, '#2563eb')}</td>
                <td style="padding:8px 6px;color:#475569;line-height:1.5;">${c.why}</td>
                <td style="padding:8px 6px;text-align:center;color:#f59e0b;">${c.difficulty}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`, '#a855f7')}

    ${card('기업 선정 체크리스트', 'fa-solid fa-list-check', `
      ${infoBox('분석 기업을 고른 뒤 아래 항목을 하나씩 체크하세요. 모두 체크되지 않아도 괜찮습니다. 안 되는 항목이 있으면 "왜 안 되는지"를 먼저 파악하는 것도 분석의 시작입니다.')}
      <div id="checklist-wrap" style="display:flex;flex-direction:column;gap:8px;">
        ${checklist.map((item, i) => `
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:8px;border-radius:6px;border:1px solid #e2e8f0;transition:background 0.15s;"
                 onmouseover="this.style.background='#0f1f38'" onmouseout="this.style.background='transparent'">
            <input type="checkbox" id="chk-${i}" style="margin-top:2px;accent-color:#2563eb;width:16px;height:16px;flex-shrink:0;">
            <span style="font-size:0.83rem;color:#475569;line-height:1.5;">${item}</span>
          </label>`).join('')}
      </div>
      <div id="chk-result" style="margin-top:14px;padding:10px;background:#f1f5f9;border-radius:8px;font-size:0.83rem;color:#2563eb;text-align:center;display:none;"></div>`, '#22c55e')}

    ${card('기업 선정 후 다음 단계', 'fa-solid fa-arrow-right', `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
        ${[
          ['② FCF 분석', 'fa-solid fa-money-bill-transfer', '영업현금흐름과 설비투자를 입력해 실제 잉여현금을 계산합니다.', '#06b6d4'],
          ['③ DCF 계산', 'fa-solid fa-function', '미래 FCF를 할인해 기업 내재가치를 추정합니다.', '#3b82f6'],
          ['④ EVA 분석', 'fa-solid fa-chart-bar', '자본 비용을 내고도 가치를 창출하는지 확인합니다.', '#a855f7'],
          ['⑤ 종합 리포트', 'fa-solid fa-file-lines', '세 가지 분석을 종합해 한 장의 리포트를 완성합니다.', '#f59e0b'],
        ].map(([t, ic, d, c]) => `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;border:1px solid #e2e8f0;">
            <div style="color:${c};margin-bottom:6px;"><i class="${ic}"></i> <strong style="font-size:0.83rem;">${t}</strong></div>
            <p style="font-size:0.78rem;color:#64748b;line-height:1.5;margin:0;">${d}</p>
          </div>`).join('')}
      </div>`, '#f59e0b')}
  `;

  content.querySelectorAll('[id^="chk-"]').forEach(chk => {
    chk.addEventListener('change', () => {
      const total = checklist.length;
      const checked = content.querySelectorAll('[id^="chk-"]:checked').length;
      const res = content.querySelector('#chk-result');
      res.style.display = 'block';
      if (checked === total) {
        res.style.color = '#22c55e';
        res.textContent = `모든 항목 통과! 이 기업은 절대가치 평가 실습에 적합합니다. DCF 탭으로 이동해 가정값을 입력해보세요.`;
      } else {
        res.style.color = '#60a5fa';
        res.textContent = `${checked}/${total}개 체크됨. 체크 안 된 항목의 이유를 먼저 분석하세요.`;
      }
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Tab 2: FCF 분석
// ════════════════════════════════════════════════════════════════════════════
function renderFcf(content) {
  content.innerHTML = `
    ${infoBox('<strong>FCF(잉여현금흐름)란?</strong> 용돈에서 필수 지출(설비투자)을 빼고 남은 돈입니다. 이 돈으로 배당·차입상환·재투자를 합니다. FCF가 꾸준히 플러스인 기업이 진짜 현금을 버는 기업입니다.', '#06b6d4')}

    ${card('연도별 FCF 계산기', 'fa-solid fa-money-bill-transfer', `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;" id="fcf-table">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <th style="text-align:left;padding:8px;color:#475569;">항목</th>
              ${['1년차', '2년차', '3년차', '4년차', '5년차'].map(y => `<th style="text-align:center;padding:8px;color:#475569;">${y}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:8px;color:#475569;">매출액 (억원)</td>
              ${[10000, 11000, 12100, 13310, 14641].map((v, i) => `<td style="padding:6px;"><input type="number" class="fcf-rev" data-yr="${i}" value="${v}" style="width:90px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:4px 6px;color:#0f172a;font-size:0.82rem;text-align:right;"></td>`).join('')}
            </tr>
            <tr>
              <td style="padding:8px;color:#475569;">영업현금흐름 CFO (억원)</td>
              ${[1500, 1650, 1800, 1980, 2180].map((v, i) => `<td style="padding:6px;"><input type="number" class="fcf-cfo" data-yr="${i}" value="${v}" style="width:90px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:4px 6px;color:#0f172a;font-size:0.82rem;text-align:right;"></td>`).join('')}
            </tr>
            <tr>
              <td style="padding:8px;color:#475569;">설비투자 Capex (억원)</td>
              ${[400, 420, 440, 460, 480].map((v, i) => `<td style="padding:6px;"><input type="number" class="fcf-capex" data-yr="${i}" value="${v}" style="width:90px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:4px 6px;color:#0f172a;font-size:0.82rem;text-align:right;"></td>`).join('')}
            </tr>
            <tr style="background:#f1f5f9;">
              <td style="padding:8px;color:#2563eb;font-weight:700;">FCF (억원)</td>
              ${[0,1,2,3,4].map(i => `<td style="padding:8px;text-align:center;color:#22c55e;font-weight:700;" id="fcf-val-${i}">-</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:8px;color:#475569;">FCF 마진 (%)</td>
              ${[0,1,2,3,4].map(i => `<td style="padding:8px;text-align:center;color:#475569;font-size:0.82rem;" id="fcf-margin-${i}">-</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:8px;color:#475569;">CFO 대비 FCF (%)</td>
              ${[0,1,2,3,4].map(i => `<td style="padding:8px;text-align:center;color:#475569;font-size:0.82rem;" id="fcf-ratio-${i}">-</td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
      <button id="fcf-calc" style="margin-top:14px;padding:9px 22px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;">FCF 계산하기</button>

      <div id="fcf-summary" style="display:none;margin-top:16px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;" id="fcf-kpis"></div>
        <div id="fcf-chart-wrap" style="margin-top:16px;"></div>
        <div id="fcf-comment" style="margin-top:14px;padding:12px;background:#f1f5f9;border-radius:8px;font-size:0.82rem;color:#475569;line-height:1.6;"></div>
      </div>`, '#06b6d4')}

    ${card('FCF 해석 가이드', 'fa-solid fa-lightbulb', `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
        ${[
          ['FCF > 0 지속', '#22c55e', '본업에서 현금이 꾸준히 남는 구조. 외부 자금 없이도 성장·배당·상환 가능.'],
          ['FCF < 0 (성장기)', '#f59e0b', '설비투자가 많아 FCF가 마이너스일 수 있음. 단, 이유가 "성장 투자"인지 확인.'],
          ['CFO는 +, FCF는 -', '#a855f7', 'Capex가 크다는 의미. 투자가 성과로 이어지는지 수년 후 확인 필요.'],
          ['FCF 급감', '#ef4444', '매출채권·재고 증가 또는 운전자본 부담. 이익의 질이 떨어질 수 있음.'],
        ].map(([t, c, d]) => `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;border-left:3px solid ${c};">
            <div style="font-size:0.82rem;font-weight:700;color:${c};margin-bottom:6px;">${t}</div>
            <p style="font-size:0.78rem;color:#64748b;line-height:1.5;margin:0;">${d}</p>
          </div>`).join('')}
      </div>`, '#22c55e')}
  `;

  content.querySelector('#fcf-calc').addEventListener('click', () => {
    const cfos   = [...content.querySelectorAll('.fcf-cfo')].map(el => +el.value || 0);
    const capexs = [...content.querySelectorAll('.fcf-capex')].map(el => +el.value || 0);
    const revs   = [...content.querySelectorAll('.fcf-rev')].map(el => +el.value || 0);
    const fcfs   = cfos.map((c, i) => c - capexs[i]);

    fcfs.forEach((f, i) => {
      content.querySelector(`#fcf-val-${i}`).textContent = `${fmt(f)}억`;
      content.querySelector(`#fcf-val-${i}`).style.color = f >= 0 ? '#22c55e' : '#ef4444';
      content.querySelector(`#fcf-margin-${i}`).textContent = revs[i] ? fmtPct(f / revs[i] * 100) : '-';
      content.querySelector(`#fcf-ratio-${i}`).textContent = cfos[i] ? fmtPct(f / cfos[i] * 100) : '-';
    });

    const avgFcf   = fcfs.reduce((a, b) => a + b, 0) / fcfs.length;
    const growing  = fcfs[fcfs.length - 1] > fcfs[0];
    const allPos   = fcfs.every(f => f > 0);
    const kpiWrap  = content.querySelector('#fcf-kpis');
    kpiWrap.innerHTML = [
      ['평균 FCF', `${fmt(avgFcf)}억`, '#22c55e'],
      ['5년차 FCF', `${fmt(fcfs[4])}억`, '#3b82f6'],
      ['FCF 성장 방향', growing ? '증가 추세' : '감소 추세', growing ? '#22c55e' : '#ef4444'],
      ['전기간 FCF+', allPos ? '달성' : '일부 마이너스', allPos ? '#22c55e' : '#f59e0b'],
    ].map(([l, v, c]) => `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:0.75rem;color:#475569;margin-bottom:4px;">${l}</div>
        <div style="font-size:1rem;font-weight:700;color:${c};">${v}</div>
      </div>`).join('');

    const maxF = Math.max(...fcfs.map(Math.abs));
    const chartH = 120;
    content.querySelector('#fcf-chart-wrap').innerHTML = `
      <div style="font-size:0.78rem;color:#475569;margin-bottom:8px;">연도별 FCF 추이 (억원)</div>
      <div style="display:flex;align-items:flex-end;gap:8px;height:${chartH}px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
        ${fcfs.map((f, i) => {
          const h = maxF > 0 ? Math.abs(f) / maxF * (chartH - 24) : 10;
          const col = f >= 0 ? '#22c55e' : '#ef4444';
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="font-size:0.7rem;color:${col};font-weight:600;">${fmt(f)}</div>
            <div style="width:100%;height:${h}px;background:${col}55;border-radius:4px 4px 0 0;border-bottom:2px solid ${col};"></div>
            <div style="font-size:0.7rem;color:#64748b;">${i + 1}년</div>
          </div>`;
        }).join('')}
      </div>`;

    const comment = allPos && growing
      ? '모든 연도 FCF가 플러스이며 성장 중입니다. 외부 자금 없이 스스로 성장하는 건강한 구조입니다.'
      : !allPos
      ? 'FCF가 마이너스인 연도가 있습니다. 설비투자 목적인지, 영업 부진인지 원인을 확인하세요.'
      : 'FCF는 모두 플러스지만 성장이 정체됩니다. 성숙 단계 기업으로 배당·자사주 여력을 살펴보세요.';
    content.querySelector('#fcf-comment').textContent = comment;
    content.querySelector('#fcf-summary').style.display = 'block';
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Tab 3: DCF 밸류에이션
// ════════════════════════════════════════════════════════════════════════════
function renderDcf(content) {
  content.innerHTML = `
    ${infoBox('<strong>DCF(할인현금흐름)란?</strong> 미래에 받을 현금을 오늘 가치로 환산해 기업 내재가치를 계산합니다. "1년 후 1만원"보다 "오늘 9,000원"이 나을 수 있는 원리를 이용합니다. 가정(할인율·성장률)이 바뀌면 결과도 크게 달라지므로, 시나리오 범위를 함께 확인하세요.', '#3b82f6')}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div style="background:#fff;border-radius:12px;padding:18px;border:1px solid #e2e8f0;border-left:3px solid #2563eb;">
        <h3 style="font-size:0.88rem;font-weight:700;color:#0f172a;margin:0 0 14px;">
          <i class="fa-solid fa-sliders" style="color:#2563eb;margin-right:6px;"></i>기본 가정 입력
        </h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${[
            ['dcf-fcf', '기준 FCF (억원)', 1500, '현재 연간 잉여현금흐름'],
            ['dcf-g1', '1~3년차 성장률 (%)', 12, '초기 고성장 구간'],
            ['dcf-g2', '4~5년차 성장률 (%)', 7, '성장 안정화 구간'],
            ['dcf-tg', '영구 성장률 (%)', 2.5, '5년 이후 영원한 성장률 (GDP 수준)'],
            ['dcf-wacc', 'WACC 할인율 (%)', 9, '자본 조달 평균 비용'],
            ['dcf-debt', '순부채 (억원)', 3000, '총부채 - 현금성 자산'],
            ['dcf-shares', '발행주식수 (백만주)', 600, ''],
          ].map(([id, label, def, hint]) => `
            <div>
              <label style="font-size:0.78rem;color:#64748b;display:block;margin-bottom:3px;">${label}${hint ? ` <span style="color:#475569;">(${hint})</span>` : ''}</label>
              <input type="number" id="${id}" value="${def}" step="0.1"
                style="width:100%;background:#f8fafc;border:1px solid #d9e1ec;border-radius:6px;padding:7px 10px;color:#0f172a;font-size:0.85rem;">
            </div>`).join('')}
          <button id="dcf-calc" style="padding:10px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;margin-top:4px;">
            <i class="fa-solid fa-calculator"></i> DCF 계산
          </button>
        </div>
      </div>

      <div style="background:#fff;border-radius:12px;padding:18px;border:1px solid #e2e8f0;border-left:3px solid #22c55e;" id="dcf-result-panel">
        <h3 style="font-size:0.88rem;font-weight:700;color:#0f172a;margin:0 0 14px;">
          <i class="fa-solid fa-chart-pie" style="color:#22c55e;margin-right:6px;"></i>계산 결과
        </h3>
        <div style="color:#64748b;font-size:0.82rem;text-align:center;padding:40px 0;">
          가정값을 입력하고 DCF 계산 버튼을 누르세요.
        </div>
      </div>
    </div>

    <div id="dcf-detail" style="display:none;">
      ${card('연도별 FCF 흐름 & 현재가치', 'fa-solid fa-table', '<div id="dcf-flow-table"></div>', '#3b82f6')}
      ${card('민감도 분석 (할인율 × 성장률)', 'fa-solid fa-table-cells', `
        ${infoBox('할인율(행)과 영구성장률(열)을 바꿔가며 내재가치가 어떻게 달라지는지 확인합니다. 가운데 파란색 셀이 기본 가정입니다.')}
        <div id="dcf-sensitivity" style="overflow-x:auto;"></div>`, '#a855f7')}
      <div id="dcf-interpretation" style="margin-top:4px;"></div>
    </div>
  `;

  content.querySelector('#dcf-calc').addEventListener('click', () => {
    const fcfBase  = +content.querySelector('#dcf-fcf').value   || 1500;
    const g1       = +content.querySelector('#dcf-g1').value    / 100 || 0.12;
    const g2       = +content.querySelector('#dcf-g2').value    / 100 || 0.07;
    const tg       = +content.querySelector('#dcf-tg').value    / 100 || 0.025;
    const wacc     = +content.querySelector('#dcf-wacc').value  / 100 || 0.09;
    const debt     = +content.querySelector('#dcf-debt').value  || 3000;
    const shares   = +content.querySelector('#dcf-shares').value || 600;

    const gRates = [g1, g1, g1, g2, g2];
    let fcfs = [];
    let fcf  = fcfBase;
    gRates.forEach(g => { fcf *= (1 + g); fcfs.push(fcf); });

    const pvFcfs   = fcfs.map((f, i) => f / Math.pow(1 + wacc, i + 1));
    const termFcf  = fcfs[4] * (1 + tg);
    const tv       = termFcf / (wacc - tg);
    const pvTv     = tv / Math.pow(1 + wacc, 5);
    const ev       = pvFcfs.reduce((a, b) => a + b, 0) + pvTv;
    const equity   = ev - debt;
    const perShare = equity / shares * 100;

    const panel = content.querySelector('#dcf-result-panel');
    panel.querySelector('div').style.display = 'none';
    const resHtml = [
      ['FCF 현재가치 합계', `${fmt(pvFcfs.reduce((a,b)=>a+b,0))}억`, false],
      ['영구가치(TV) 현재가치', `${fmt(pvTv)}억`, false],
      ['기업가치 (EV)', `${fmt(ev)}억`, false],
      ['(-) 순부채', `${fmt(debt)}억`, false],
      ['주주가치 (Equity)', `${fmt(equity)}억`, true],
      ['내재가치 (주당)', `${fmt(perShare, 0)}원`, true],
    ].map(([l, v, h]) => resultRow(l, v, h)).join('');

    panel.innerHTML = `
      <h3 style="font-size:0.88rem;font-weight:700;color:#0f172a;margin:0 0 14px;">
        <i class="fa-solid fa-chart-pie" style="color:#22c55e;margin-right:6px;"></i>계산 결과
      </h3>
      ${resHtml}
      <div style="margin-top:12px;padding:10px;background:#f1f5f9;border-radius:8px;font-size:0.78rem;color:#64748b;line-height:1.55;">
        TV 비중: ${fmtPct(pvTv / ev * 100)} | FCF 비중: ${fmtPct(pvFcfs.reduce((a,b)=>a+b,0) / ev * 100)}
      </div>`;

    const flowTable = content.querySelector('#dcf-flow-table');
    flowTable.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0;">
              ${['연차', '성장률', 'FCF(억)', 'PV(억)', '누적PV(억)'].map(h => `<th style="padding:8px;color:#475569;text-align:right;">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${fcfs.map((f, i) => {
              const cumPv = pvFcfs.slice(0, i + 1).reduce((a, b) => a + b, 0);
              return `<tr style="border-bottom:1px solid #e9f0f8;">
                <td style="padding:7px;color:#0f172a;text-align:right;">${i + 1}년차</td>
                <td style="padding:7px;color:#a855f7;text-align:right;">${fmtPct(gRates[i] * 100)}</td>
                <td style="padding:7px;color:#0f172a;text-align:right;">${fmt(f)}</td>
                <td style="padding:7px;color:#2563eb;text-align:right;">${fmt(pvFcfs[i])}</td>
                <td style="padding:7px;color:#22c55e;text-align:right;">${fmt(cumPv)}</td>
              </tr>`;
            }).join('')}
            <tr style="background:#f1f5f9;font-weight:700;">
              <td style="padding:7px;color:#f59e0b;text-align:right;">영구가치</td>
              <td style="padding:7px;color:#a855f7;text-align:right;">${fmtPct(tg * 100)}</td>
              <td style="padding:7px;color:#0f172a;text-align:right;">${fmt(tv)}</td>
              <td style="padding:7px;color:#2563eb;text-align:right;">${fmt(pvTv)}</td>
              <td style="padding:7px;color:#22c55e;text-align:right;">${fmt(ev)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;

    const waccs = [0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.13];
    const tgs   = [0.01, 0.015, 0.02, 0.025, 0.03, 0.035];
    const baseW = wacc;
    const baseTg = tg;

    const calcPs = (w, g) => {
      let f = fcfBase;
      const fs = gRates.map(gr => { f *= (1 + gr); return f; });
      const pvs = fs.map((v, i) => v / Math.pow(1 + w, i + 1));
      const tvv = fs[4] * (1 + g) / (w - g);
      const pvt = tvv / Math.pow(1 + w, 5);
      const eqv = pvs.reduce((a,b) => a+b,0) + pvt - debt;
      return eqv / shares * 100;
    };

    const sensDiv = content.querySelector('#dcf-sensitivity');
    sensDiv.innerHTML = `
      <table style="border-collapse:collapse;font-size:0.75rem;">
        <thead>
          <tr>
            <th style="padding:6px 10px;color:#64748b;border:1px solid #e2e8f0;">WACC \\ TV성장률</th>
            ${tgs.map(g => `<th style="padding:6px 10px;color:#475569;border:1px solid #e2e8f0;text-align:center;">${fmtPct(g*100)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${waccs.map(w => `
            <tr>
              <td style="padding:6px 10px;color:#475569;border:1px solid #e2e8f0;font-weight:600;">${fmtPct(w*100)}</td>
              ${tgs.map(g => {
                const ps = calcPs(w, g);
                const isBase = Math.abs(w - baseW) < 0.001 && Math.abs(g - baseTg) < 0.001;
                const col = isBase ? '#2563eb' : ps > perShare * 1.2 ? '#22c55e33' : ps < perShare * 0.8 ? '#ef444433' : '#1e293b';
                return `<td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;background:${col};color:${isBase?'#fff':'#f1f5f9'};font-weight:${isBase?'700':'400'};">${fmt(ps, 0)}원</td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>`;

    const upside = ((perShare / (perShare * 0.85) - 1) * 100).toFixed(0);
    content.querySelector('#dcf-interpretation').innerHTML = card('결과 해석 및 투자 판단 가이드', 'fa-solid fa-lightbulb', `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px;">
        ${[
          ['DCF 내재가치', `${fmt(perShare, 0)}원/주`, '#60a5fa'],
          ['영구가치 비중', `${fmtPct(pvTv/ev*100)}`, pvTv/ev > 0.6 ? '#ef4444' : '#22c55e'],
          ['주주가치', `${fmt(equity)}억`, equity > 0 ? '#22c55e' : '#ef4444'],
        ].map(([l, v, c]) => `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:0.75rem;color:#475569;margin-bottom:4px;">${l}</div>
            <div style="font-size:1rem;font-weight:700;color:${c};">${v}</div>
          </div>`).join('')}
      </div>
      ${infoBox(`
        <strong>영구가치(TV) 비중이 ${fmtPct(pvTv/ev*100)}입니다.</strong><br>
        ${pvTv/ev > 0.65 ? '<i class="fa-solid fa-triangle-exclamation"></i> TV 비중이 65%를 초과합니다. 5년 이후 성장 가정이 결과를 크게 좌우합니다. 영구성장률과 할인율 가정을 보수적으로 재검토하세요.' : '<i class="fa-solid fa-circle-check"></i> TV 비중이 적정 수준입니다. 5년 예측 FCF가 가치의 상당 부분을 설명합니다.'}<br>
        <strong>주의</strong>: DCF는 "정답"이 아닙니다. 민감도 표를 보며 가치 범위(보수~낙관)를 확인하고 현재 주가와 비교해보세요.`)}`, '#22c55e');

    content.querySelector('#dcf-detail').style.display = 'block';
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Tab 4: EVA 분석
// ════════════════════════════════════════════════════════════════════════════
function renderEva(content) {
  content.innerHTML = `
    ${infoBox('<strong>EVA(경제적 부가가치)란?</strong> 회계 이익에서 자본 비용까지 뺀 "진짜 가치 창출"을 측정합니다. 영업이익이 플러스여도 EVA가 마이너스라면, 주주와 채권자 몫을 다 못 벌어내고 있는 겁니다. EVA가 꾸준히 플러스인 기업이 진짜 좋은 기업입니다.', '#a855f7')}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div style="background:#fff;border-radius:12px;padding:18px;border:1px solid #e2e8f0;border-left:3px solid #a855f7;">
        <h3 style="font-size:0.88rem;font-weight:700;color:#0f172a;margin:0 0 14px;">
          <i class="fa-solid fa-sliders" style="color:#a855f7;margin-right:6px;"></i>EVA 입력값
        </h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${[
            ['eva-nopat', '세후 영업이익 NOPAT (억원)', 500, '법인세 반영 후 영업이익'],
            ['eva-ic', '투하자본 IC (억원)', 4000, '자기자본 + 이자부 부채'],
            ['eva-ke', '자기자본비용 Ke (%)', 12, '주주 요구 수익률 (CAPM 기준)'],
            ['eva-kd', '세후 부채비용 Kd (%)', 3.5, '차입이자율 × (1-세율)'],
            ['eva-ew', '자기자본 비중 (%)', 60, '자기자본 / 투하자본'],
          ].map(([id, label, def, hint]) => `
            <div>
              <label style="font-size:0.78rem;color:#64748b;display:block;margin-bottom:3px;">${label} <span style="color:#475569;">(${hint})</span></label>
              <input type="number" id="${id}" value="${def}" step="0.1"
                style="width:100%;background:#f8fafc;border:1px solid #d9e1ec;border-radius:6px;padding:7px 10px;color:#0f172a;font-size:0.85rem;">
            </div>`).join('')}
          <button id="eva-calc" style="padding:10px;background:#a855f7;color:#fff;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;margin-top:4px;">
            <i class="fa-solid fa-calculator"></i> EVA 계산
          </button>
        </div>
      </div>

      <div style="background:#fff;border-radius:12px;padding:18px;border:1px solid #e2e8f0;border-left:3px solid #a855f7;" id="eva-result-panel">
        <h3 style="font-size:0.88rem;font-weight:700;color:#0f172a;margin:0 0 14px;">
          <i class="fa-solid fa-chart-bar" style="color:#a855f7;margin-right:6px;"></i>계산 결과
        </h3>
        <div style="color:#64748b;font-size:0.82rem;text-align:center;padding:40px 0;">
          입력값을 넣고 EVA 계산 버튼을 누르세요.
        </div>
      </div>
    </div>

    ${card('EVA 멀티 시나리오 비교', 'fa-solid fa-table-cells', `
      ${infoBox('NOPAT이 다를 때 EVA가 어떻게 달라지는지, 그리고 투하자본 규모에 따른 차이를 비교합니다.')}
      <div id="eva-scenario" style="overflow-x:auto;"></div>`, '#a855f7')}

    ${card('EVA 이해하기 — 비유로 설명', 'fa-solid fa-lightbulb', `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
        ${[
          ['<i class="fa-solid fa-box"></i> A 회사', '영업이익 500억, 투하자본 4,000억, WACC 10%', '자본비용 400억 → EVA = +100억', '진짜 가치를 만들고 있는 기업', '#22c55e'],
          ['<i class="fa-solid fa-box"></i> B 회사', '영업이익 300억, 투하자본 4,000억, WACC 10%', '자본비용 400억 → EVA = -100억', '회계이익은 있지만 실질 가치 파괴', '#ef4444'],
          ['<i class="fa-solid fa-box"></i> C 회사', '영업이익 400억, 투하자본 4,000억, WACC 10%', '자본비용 400억 → EVA = 0', '본전치기. 투자자 기대를 딱 충족', '#f59e0b'],
        ].map(([name, cond, res, comment, col]) => `
          <div style="background:#f8fafc;border-radius:8px;padding:14px;border-top:3px solid ${col};">
            <div style="font-size:0.88rem;font-weight:700;color:#0f172a;margin-bottom:6px;">${name}</div>
            <div style="font-size:0.78rem;color:#64748b;line-height:1.5;margin-bottom:6px;">${cond}</div>
            <div style="font-size:0.82rem;color:${col};font-weight:600;margin-bottom:4px;">${res}</div>
            <div style="font-size:0.78rem;color:#64748b;">${comment}</div>
          </div>`).join('')}
      </div>`, '#a855f7')}
  `;

  content.querySelector('#eva-calc').addEventListener('click', () => {
    const nopat = +content.querySelector('#eva-nopat').value || 500;
    const ic    = +content.querySelector('#eva-ic').value    || 4000;
    const ke    = +content.querySelector('#eva-ke').value    / 100 || 0.12;
    const kd    = +content.querySelector('#eva-kd').value    / 100 || 0.035;
    const ew    = +content.querySelector('#eva-ew').value    / 100 || 0.60;
    const dw    = 1 - ew;
    const wacc  = ke * ew + kd * dw;
    const capCost = ic * wacc;
    const eva   = nopat - capCost;
    const ronic = nopat / ic;
    const spread = ronic - wacc;

    const panel = content.querySelector('#eva-result-panel');
    const evaCol = eva >= 0 ? '#22c55e' : '#ef4444';
    panel.innerHTML = `
      <h3 style="font-size:0.88rem;font-weight:700;color:#0f172a;margin:0 0 14px;">
        <i class="fa-solid fa-chart-bar" style="color:#a855f7;margin-right:6px;"></i>계산 결과
      </h3>
      ${resultRow('WACC (가중평균자본비용)', fmtPct(wacc * 100))}
      ${resultRow('자본비용 (IC × WACC)', `${fmt(capCost)}억`)}
      ${resultRow('NOPAT', `${fmt(nopat)}억`)}
      ${resultRow('ROIC (투하자본이익률)', fmtPct(ronic * 100))}
      ${resultRow('WACC 대비 스프레드 (ROIC-WACC)', fmtPct(spread * 100))}
      ${resultRow('EVA', `${fmt(eva)}억`, true)}
      <div style="margin-top:12px;padding:12px;border-radius:8px;background:${evaCol}18;border:1px solid ${evaCol}44;font-size:0.82rem;color:${evaCol};font-weight:600;text-align:center;">
        ${eva >= 0 ? `<i class="fa-solid fa-circle-check"></i> EVA 양수: 자본 비용을 넘어 ${fmt(eva)}억원의 가치를 창출하고 있습니다.` : `<i class="fa-solid fa-triangle-exclamation"></i> EVA 음수: 자본 비용을 충당하지 못해 ${fmt(Math.abs(eva))}억원의 가치를 훼손하고 있습니다.`}
      </div>`;

    const nopats = [nopat * 0.6, nopat * 0.8, nopat, nopat * 1.2, nopat * 1.4];
    const ics    = [ic * 0.7, ic * 0.85, ic, ic * 1.15, ic * 1.3];
    const scDiv  = content.querySelector('#eva-scenario');
    scDiv.innerHTML = `
      <table style="border-collapse:collapse;font-size:0.77rem;">
        <thead>
          <tr>
            <th style="padding:6px 10px;color:#64748b;border:1px solid #e2e8f0;">NOPAT \\ 투하자본</th>
            ${ics.map(v => `<th style="padding:6px 10px;color:#475569;border:1px solid #e2e8f0;text-align:center;">${fmt(v)}억</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${nopats.map(n => `
            <tr>
              <td style="padding:6px 10px;color:#475569;border:1px solid #e2e8f0;font-weight:600;">${fmt(n)}억</td>
              ${ics.map(c => {
                const e = n - c * wacc;
                const isBase = Math.abs(n - nopat) < 1 && Math.abs(c - ic) < 1;
                const col = isBase ? '#2563eb' : e >= 0 ? '#22c55e22' : '#ef444422';
                return `<td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;background:${col};color:${e>=0?'#22c55e':'#ef4444'};font-weight:${isBase?'700':'400'};">${fmt(e)}억</td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>`;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Tab 5: 종합 리포트
// ════════════════════════════════════════════════════════════════════════════
function renderReport(content) {
  content.innerHTML = `
    ${infoBox('분석 기업과 가정값을 입력하면 FCF·DCF·EVA 요약이 한 장의 투자 리포트 형태로 생성됩니다. 각 탭에서 상세 계산을 마친 뒤 이 탭에서 종합 정리하세요.', '#f59e0b')}

    <div style="background:#1e293b;border-radius:12px;padding:18px;margin-bottom:16px;border-left:3px solid #f59e0b;">
      <h3 style="font-size:0.88rem;font-weight:700;color:#0f172a;margin:0 0 14px;">
        <i class="fa-solid fa-file-lines" style="color:#f59e0b;margin-right:6px;"></i>종합 리포트 입력
      </h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${[
          ['rpt-company', '분석 기업명', '삼성전자'],
          ['rpt-sector', '섹터', '반도체·IT'],
          ['rpt-price', '현재 주가 (원)', '72000'],
          ['rpt-fcf-avg', 'FCF 평균 (억원)', '1800'],
          ['rpt-dcf-iv', 'DCF 내재가치 (원/주)', '85000'],
          ['rpt-eva', 'EVA (억원)', '100'],
          ['rpt-wacc', 'WACC (%)', '9'],
          ['rpt-horizon', '분석 기간 (년)', '5'],
        ].map(([id, label, def]) => `
          <div>
            <label style="font-size:0.78rem;color:#64748b;display:block;margin-bottom:3px;">${label}</label>
            <input type="text" id="${id}" value="${def}"
              style="width:100%;background:#f8fafc;border:1px solid #d9e1ec;border-radius:6px;padding:7px 10px;color:#0f172a;font-size:0.85rem;">
          </div>`).join('')}
      </div>
      <div style="margin-top:12px;">
        <label style="font-size:0.78rem;color:#64748b;display:block;margin-bottom:3px;">투자 의견 요약 (한 줄)</label>
        <input type="text" id="rpt-opinion" value="안정적 FCF 창출과 기술 해자를 바탕으로 현재 주가 대비 약 18% 저평가로 판단"
          style="width:100%;background:#f8fafc;border:1px solid #d9e1ec;border-radius:6px;padding:7px 10px;color:#0f172a;font-size:0.85rem;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:12px;">
        ${[
          ['rpt-risk1', '주요 리스크 1', '중국 반도체 경쟁 심화'],
          ['rpt-risk2', '주요 리스크 2', '글로벌 IT 수요 둔화'],
          ['rpt-risk3', '주요 리스크 3', '환율 변동 (달러 약세)'],
        ].map(([id, label, def]) => `
          <div>
            <label style="font-size:0.78rem;color:#64748b;display:block;margin-bottom:3px;">${label}</label>
            <input type="text" id="${id}" value="${def}"
              style="width:100%;background:#f8fafc;border:1px solid #d9e1ec;border-radius:6px;padding:7px 10px;color:#0f172a;font-size:0.85rem;">
          </div>`).join('')}
      </div>
      <button id="rpt-gen" style="margin-top:14px;padding:10px 24px;background:#f59e0b;color:#0f172a;border:none;border-radius:8px;font-size:0.85rem;font-weight:700;cursor:pointer;">
        <i class="fa-solid fa-file-lines"></i> 리포트 생성
      </button>
    </div>

    <div id="rpt-output" style="display:none;"></div>

    ${card('밸류에이션 실습 마무리 — 핵심 정리', 'fa-solid fa-graduation-cap', `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
        ${[
          ['FCF', 'fa-solid fa-money-bill-transfer', '#06b6d4', '실제 현금 창출력 확인\nCFO - Capex = 진짜 남은 돈'],
          ['DCF', 'fa-solid fa-function', '#3b82f6', '미래 현금의 현재가치 합산\n가정 범위로 내재가치 추정'],
          ['EVA', 'fa-solid fa-chart-bar', '#a855f7', '자본비용 차감 후 진짜 이익\nROIC > WACC 이면 가치 창출'],
          ['시나리오', 'fa-solid fa-table-cells', '#f59e0b', '단일 숫자보다 범위로 판단\n보수·기준·낙관 비교 필수'],
        ].map(([t, ic, c, d]) => `
          <div style="background:#f8fafc;border-radius:8px;padding:14px;border-top:3px solid ${c};">
            <div style="color:${c};margin-bottom:8px;font-size:0.95rem;"><i class="${ic}"></i> <strong>${t}</strong></div>
            <p style="font-size:0.78rem;color:#64748b;line-height:1.6;margin:0;white-space:pre-line;">${d}</p>
          </div>`).join('')}
      </div>
      <div style="margin-top:16px;padding:14px;background:#f1f5f9;border-radius:8px;font-size:0.82rem;color:#475569;line-height:1.7;">
        <strong style="color:#0f172a;">절대가치 평가의 핵심 메시지</strong><br>
        밸류에이션은 "정답 맞히기"가 아닙니다. 좋은 가정을 찾고, 그 가정이 현실과 맞는지 계속 검증하는 과정입니다.
        DCF 내재가치가 현재 주가보다 높다고 무조건 매수하지 마세요. 가정의 근거가 얼마나 탄탄한지, 리스크는 무엇인지를 함께 고려해야 합니다.
      </div>`, '#f59e0b')}
  `;

  content.querySelector('#rpt-gen').addEventListener('click', () => {
    const g = id => content.querySelector(`#${id}`).value;
    const company = g('rpt-company');
    const price   = +g('rpt-price') || 0;
    const iv      = +g('rpt-dcf-iv') || 0;
    const upside  = price > 0 ? ((iv / price - 1) * 100).toFixed(1) : 0;
    const eva     = +g('rpt-eva') || 0;
    const ratingColor = iv > price * 1.15 ? '#22c55e' : iv < price * 0.85 ? '#ef4444' : '#f59e0b';
    const rating  = iv > price * 1.15 ? '매수 (BUY)' : iv < price * 0.85 ? '매도 (SELL)' : '중립 (HOLD)';

    content.querySelector('#rpt-output').style.display = 'block';
    content.querySelector('#rpt-output').innerHTML = `
      <div style="background:#1e293b;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-size:0.75rem;color:#475569;margin-bottom:4px;">투자분석 리포트 | ${new Date().toLocaleDateString('ko-KR')}</div>
            <h2 style="font-weight:800;color:#0f172a;margin:0 0 4px;">${company}</h2>
            <div style="font-size:0.82rem;color:#475569;">${g('rpt-sector')} | WACC ${g('rpt-wacc')}% | 분석기간 ${g('rpt-horizon')}년</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.75rem;color:#64748b;">투자의견</div>
            <div style="font-size:1.3rem;font-weight:800;color:${ratingColor};">${rating}</div>
            <div style="font-size:0.82rem;color:${ratingColor};">목표가 ${fmt(iv, 0)}원 (현재 ${fmt(price, 0)}원, ${upside > 0 ? '+' : ''}${upside}%)</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px;">
          ${[
            ['현재 주가', `${fmt(price, 0)}원`, '#f1f5f9'],
            ['DCF 내재가치', `${fmt(iv, 0)}원`, ratingColor],
            ['업사이드', `${upside > 0 ? '+' : ''}${upside}%`, ratingColor],
            ['FCF 평균', `${fmt(+g('rpt-fcf-avg'))}억`, '#22c55e'],
            ['EVA', `${fmt(eva)}억`, eva >= 0 ? '#22c55e' : '#ef4444'],
          ].map(([l, v, c]) => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:0.72rem;color:#475569;margin-bottom:4px;">${l}</div>
              <div style="font-size:0.95rem;font-weight:700;color:${c};">${v}</div>
            </div>`).join('')}
        </div>

        <div style="padding:14px;background:#f1f5f9;border-radius:8px;margin-bottom:16px;border-left:3px solid ${ratingColor};">
          <div style="font-size:0.75rem;color:#475569;margin-bottom:4px;">투자 의견</div>
          <div style="font-size:0.88rem;color:#0f172a;line-height:1.6;">${g('rpt-opinion')}</div>
        </div>

        <div>
          <div style="font-size:0.8rem;font-weight:700;color:#475569;margin-bottom:8px;">주요 리스크</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${[g('rpt-risk1'), g('rpt-risk2'), g('rpt-risk3')].filter(Boolean).map(r =>
              `<span style="background:#ef444418;color:#ef4444;border:1px solid #ef444444;border-radius:20px;padding:3px 12px;font-size:0.78rem;"><i class="fa-solid fa-triangle-exclamation"></i> ${r}</span>`
            ).join('')}
          </div>
        </div>

        <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:0.72rem;color:#475569;line-height:1.6;">
          본 리포트는 교육 목적의 실습 결과물이며 실제 투자 권유가 아닙니다. 모든 가정과 수치는 학습용으로 임의 설정된 것입니다.
        </div>
      </div>`;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 메인 진입점
// ════════════════════════════════════════════════════════════════════════════
export function valuationView(container) {
  const TABS = [
    '① 기업 선정',
    '② FCF 분석',
    '③ DCF 밸류에이션',
    '④ EVA 분석',
    '⑤ 종합 리포트',
  ];
  container.innerHTML = tabShell(TABS);

  const renders = [
    renderCompanySelect,
    renderFcf,
    renderDcf,
    renderEva,
    renderReport,
  ];

  container.querySelectorAll('.va-tab').forEach((btn, i) => {
    btn.addEventListener('click', () => activateTab(container, i, renders));
  });

  renders[0](container.querySelector('#va-content'));
}
