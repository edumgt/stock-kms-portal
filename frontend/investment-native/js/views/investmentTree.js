// Virtual canvas coordinate space
const VW = 900, VH = 490;

// ── Branching condition ──────────────────────────────────────────────────────
// Single source of truth for how the tree forks: picking an investment period
// (1년 미만 / 1~5년 / 5년 이상) selects the follow-up question, and each answer
// to that follow-up question maps to one of the six strategy results below.
// NODES/edges used for canvas rendering are generated from this definition,
// so adding/changing a period bucket or its follow-up only requires editing
// this array.
const PERIOD_BRANCHES = [
  {
    period: '1년 미만',
    cx: 150,
    followUp: {
      text: ['손실을 얼마까지', '허용할 수 있나요?'],
      answers: [
        { label: '5% 이하',  result: 'safe_first' },
        { label: '10% 이상', result: 'short_term' },
      ],
    },
  },
  {
    period: '1~5년',
    cx: 450,
    followUp: {
      text: ['시장 급락 시', '어떻게 하나요?'],
      answers: [
        { label: '팔고 싶다',    result: 'balanced' },
        { label: '더 사고 싶다', result: 'mid_growth' },
      ],
    },
  },
  {
    period: '5년 이상',
    cx: 750,
    followUp: {
      text: ['주식 투자', '경험이 있나요?'],
      answers: [
        { label: '없거나 적다', result: 'long_passive' },
        { label: '경험 있다',   result: 'long_active' },
      ],
    },
  },
];

const STRATEGIES = {
  safe_first: {
    emoji: '<i class="fa-solid fa-shield-halved"></i>', name: '안전우선형',
    desc: '원금 보호를 가장 중요하게 생각해요. 수익보다 손실 최소화가 우선입니다. 예금·채권 위주로 구성해 큰 변동 없이 조금씩 자산을 지킵니다.',
    alloc: [
      { label: '예금·CMA', pct: 55, color: '#3b82f6' },
      { label: '국채·채권ETF', pct: 30, color: '#10b981' },
      { label: '주식ETF', pct: 10, color: '#f59e0b' },
      { label: '현금', pct: 5,  color: '#94a3b8' },
    ],
    expected: '연 2~3%', risk: '낮음 <i class="fa-solid fa-circle" style="color:#22c55e;"></i>',
    horizon: '단기 (1년 미만)',
    products: ['KB국민은행 정기예금', 'KODEX 단기채권PLUS', '예금보험 적금'],
    tags: ['원금보호', '저위험', '예금·채권 중심'],
    tip: '<i class="fa-solid fa-lightbulb"></i> 예금자보호법으로 1인당 5,000만원까지 보호됩니다.',
  },
  short_term: {
    emoji: '<i class="fa-solid fa-bolt"></i>', name: '단기수익형',
    desc: '단기간에 예금보다 높은 수익을 노립니다. 어느 정도 변동을 감수하고, 주식 ETF와 채권을 반반 섞어 유연하게 운용합니다.',
    alloc: [
      { label: '주식ETF', pct: 40, color: '#f59e0b' },
      { label: '채권ETF', pct: 35, color: '#3b82f6' },
      { label: '원자재ETF', pct: 15, color: '#8b5cf6' },
      { label: '현금', pct: 10, color: '#94a3b8' },
    ],
    expected: '연 4~6%', risk: '중하 <i class="fa-solid fa-circle" style="color:#eab308;"></i>',
    horizon: '단기 (1년 미만)',
    products: ['KODEX 200', 'TIGER 국채3년', 'KODEX 골드선물(H)'],
    tags: ['단기수익', '혼합형', '변동 감수'],
    tip: '<i class="fa-solid fa-lightbulb"></i> 단기 매매는 거래세·수수료가 수익을 줄일 수 있습니다. 비용 확인 필수!',
  },
  balanced: {
    emoji: '<i class="fa-solid fa-scale-balanced"></i>', name: '균형안정형',
    desc: '주식과 채권을 반반 섞어 중기적으로 안정적인 성장을 추구합니다. 시장 하락 시 채권이 충격을 완화해줍니다.',
    alloc: [
      { label: '주식ETF', pct: 40, color: '#3b82f6' },
      { label: '채권ETF', pct: 40, color: '#10b981' },
      { label: '원자재', pct: 10, color: '#f59e0b' },
      { label: '현금', pct: 10, color: '#94a3b8' },
    ],
    expected: '연 4~6%', risk: '중간 <i class="fa-solid fa-circle" style="color:#eab308;"></i>',
    horizon: '중기 (1~5년)',
    products: ['TIGER 미국S&P500', 'KODEX 국고채10년', 'KODEX 골드선물(H)'],
    tags: ['균형분산', '중기', '정기 리밸런싱'],
    tip: '<i class="fa-solid fa-lightbulb"></i> 6개월마다 비중을 원래대로 되돌리는 "리밸런싱"이 핵심입니다.',
  },
  mid_growth: {
    emoji: '<i class="fa-solid fa-chart-line"></i>', name: '중기성장형',
    desc: '주가 하락도 매수 기회로 보는 적극적 투자자입니다. 주식 ETF 비중을 높여 중장기 복리 성장을 기대합니다.',
    alloc: [
      { label: '주식ETF', pct: 65, color: '#f59e0b' },
      { label: '채권ETF', pct: 20, color: '#3b82f6' },
      { label: '원자재ETF', pct: 10, color: '#8b5cf6' },
      { label: '현금', pct: 5,  color: '#94a3b8' },
    ],
    expected: '연 6~9%', risk: '중상 <i class="fa-solid fa-circle" style="color:#f97316;"></i>',
    horizon: '중기 (1~5년)',
    products: ['TIGER 미국S&P500', 'KODEX 나스닥100', 'TIGER 국채3년'],
    tags: ['성장추구', '주식중심', '변동 감수'],
    tip: '<i class="fa-solid fa-lightbulb"></i> 하락장에서 추가 매수(물타기)보다 정해진 비중을 유지하는 게 더 안전합니다.',
  },
  long_passive: {
    emoji: '<i class="fa-solid fa-seedling"></i>', name: '장기패시브형',
    desc: '오래 두면 복리가 알아서 일을 한다는 믿음입니다. 글로벌 지수추종 ETF 한두 개로 단순하게 장기 보유합니다.',
    alloc: [
      { label: '글로벌ETF', pct: 70, color: '#10b981' },
      { label: '채권ETF', pct: 20, color: '#3b82f6' },
      { label: '현금', pct: 10, color: '#94a3b8' },
    ],
    expected: '연 7~10%', risk: '중상 <i class="fa-solid fa-circle" style="color:#f97316;"></i>',
    horizon: '장기 (5년 이상)',
    products: ['TIGER 미국S&P500', 'KODEX 미국나스닥100', 'ACE 미국채10년'],
    tags: ['인덱스투자', '장기복리', '패시브'],
    tip: '<i class="fa-solid fa-lightbulb"></i> 매달 일정액을 자동 매수(적립식)하면 여러 가격에 매수한 평균 단가가 형성됩니다. 평균 단가가 항상 낮아지는 것은 아닙니다.',
  },
  long_active: {
    emoji: '<i class="fa-solid fa-bullseye"></i>', name: '장기액티브형',
    desc: '섹터, 테마, 팩터 전략으로 시장 평균보다 높은 수익(알파)을 추구합니다. 경험을 활용해 능동적으로 포트폴리오를 관리합니다.',
    alloc: [
      { label: '국내외주식', pct: 55, color: '#f59e0b' },
      { label: '테마·팩터ETF', pct: 25, color: '#8b5cf6' },
      { label: '채권ETF', pct: 15, color: '#3b82f6' },
      { label: '현금', pct: 5,  color: '#94a3b8' },
    ],
    expected: '연 8~12%', risk: '높음 <i class="fa-solid fa-circle" style="color:#ef4444;"></i>',
    horizon: '장기 (5년 이상)',
    products: ['TIGER 글로벌AI&로보틱스', 'KODEX 반도체', 'TIGER 인도니프티50'],
    tags: ['알파추구', '섹터·테마', '적극운용'],
    tip: '<i class="fa-solid fa-lightbulb"></i> 과도한 집중투자는 포트폴리오 전체를 위험에 빠뜨릴 수 있습니다. 분산은 필수입니다.',
  },
};

// ── Tree data (generated from PERIOD_BRANCHES) ────────────────────────────────
function buildNodes() {
  const nodes = {
    q1: {
      id: 'q1', type: 'question',
      text: ['투자 기간은?'],
      cx: 450, cy: 68, w: 172, h: 52,
      edges: [],
    },
  };

  let resultSlot = 0;
  PERIOD_BRANCHES.forEach((branch, bi) => {
    const qId = `q2_${bi}`;
    nodes.q1.edges.push({ to: qId, label: branch.period });

    nodes[qId] = {
      id: qId, type: 'question',
      text: branch.followUp.text,
      cx: branch.cx, cy: 218, w: 158, h: 52,
      edges: [],
    };

    branch.followUp.answers.forEach(({ label, result }) => {
      nodes[qId].edges.push({ to: result, label });
      nodes[result] = {
        id: result, type: 'result',
        text: [STRATEGIES[result].name],
        cx: 75 + resultSlot * 150, cy: 395, w: 126, h: 46,
      };
      resultSlot++;
    });
  });

  return nodes;
}

const NODES = buildNodes();

// ── State ─────────────────────────────────────────────────────────────────────
let _state = null;

function makeState() {
  return { path: [], current: 'q1', done: false, hovered: null };
}

function getAvailable(cur) {
  return (NODES[cur]?.edges || []).map(e => e.to);
}

function getPathEdgeSet(path) {
  return new Set(path.map(s => `${s.from}→${s.to}`));
}

function getOnPathSet(path) {
  const s = new Set();
  for (const step of path) { s.add(step.from); s.add(step.to); }
  return s;
}

// ── Canvas polyfill ────────────────────────────────────────────────────────────
function patchRoundRect(ctx) {
  if (ctx.roundRect) return;
  ctx.roundRect = function (x, y, w, h, r) {
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arcTo(x + w, y, x + w, y + r, r);
    this.lineTo(x + w, y + h - r);
    this.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.lineTo(x + r, y + h);
    this.arcTo(x, y + h, x, y + h - r, r);
    this.lineTo(x, y + r);
    this.arcTo(x, y, x + r, y, r);
  };
}

// ── Draw utilities ────────────────────────────────────────────────────────────
function drawWrapText(ctx, lines, cx, cy, lineH) {
  const startY = cy - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineH));
}

function drawEdge(ctx, fromN, toN, isActive, label) {
  const x1 = fromN.cx, y1 = fromN.cy + fromN.h / 2 + 2;
  const x2 = toN.cx,   y2 = toN.cy  - toN.h  / 2 - 2;
  const midY = (y1 + y2) / 2;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1, midY, x2, midY, x2, y2);
  ctx.strokeStyle = isActive ? '#f59e0b' : '#d1d5db';
  ctx.lineWidth   = isActive ? 2.8 : 1.4;
  ctx.stroke();

  // Arrow tip
  const tipX = x2, tipY = y2;
  const arrLen = 7, arrW = 4;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - arrW, tipY - arrLen);
  ctx.lineTo(tipX + arrW, tipY - arrLen);
  ctx.closePath();
  ctx.fillStyle = isActive ? '#f59e0b' : '#d1d5db';
  ctx.fill();

  // Edge label pill
  const lx = (x1 + x2) / 2;
  const ly = (y1 + y2) / 2;
  ctx.font = '11px Pretendard,sans-serif';
  const tw = ctx.measureText(label).width;
  const pw = tw + 14, ph = 18, pr = 9;
  ctx.beginPath();
  ctx.roundRect(lx - pw / 2, ly - ph / 2, pw, ph, pr);
  ctx.fillStyle   = isActive ? '#fffbeb' : '#f8fafc';
  ctx.strokeStyle = isActive ? '#f59e0b' : '#e2e8f0';
  ctx.lineWidth   = isActive ? 1.4 : 1;
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = isActive ? '#b45309' : '#94a3b8';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, lx, ly);
}

const NODE_STYLE = {
  current:  { bg: '#2962ff', text: '#ffffff', border: '#1d4ed8', bw: 2.5, shadow: 'rgba(41,98,255,0.35)' },
  available:{ bg: '#eff6ff', text: '#2962ff', border: '#2962ff', bw: 2,   shadow: 'rgba(41,98,255,0.2)' },
  selected: { bg: '#f59e0b', text: '#ffffff', border: '#d97706', bw: 1.5, shadow: null },
  done_res: { bg: '#059669', text: '#ffffff', border: '#047857', bw: 2.5, shadow: 'rgba(5,150,105,0.35)' },
  dim:      { bg: '#f1f5f9', text: '#c4d0df', border: '#e2e8f0', bw: 1,   shadow: null },
};

function nodeVisualState(nodeId, st) {
  if (st.done && nodeId === st.current) return 'done_res';
  if (nodeId === st.current)            return 'current';
  const avail = getAvailable(st.current);
  if (!st.done && avail.includes(nodeId)) return 'available';
  if (getOnPathSet(st.path).has(nodeId)) return 'selected';
  return 'dim';
}

function drawNode(ctx, node, vstate, isHovered) {
  const st = NODE_STYLE[vstate];
  const { cx, cy, w, h } = node;
  const x = cx - w / 2, y = cy - h / 2;

  if (st.shadow) {
    ctx.shadowColor = st.shadow;
    ctx.shadowBlur  = isHovered ? 18 : 12;
  }

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fillStyle = st.bg;
  ctx.fill();
  ctx.strokeStyle = st.border;
  ctx.lineWidth   = st.bw;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  if (vstate === 'available' && isHovered) {
    ctx.beginPath();
    ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 12);
    ctx.strokeStyle = '#2962ff';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle     = st.text;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.font          = `bold ${node.type === 'result' ? 12.5 : 13}px Pretendard,sans-serif`;
  drawWrapText(ctx, node.text, cx, cy, 16);
}

// ── Main draw ─────────────────────────────────────────────────────────────────
function draw(ctx, st) {
  ctx.clearRect(0, 0, VW, VH);

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, VW, VH);

  const pathEdges = getPathEdgeSet(st.path);

  // Edges first
  Object.values(NODES).forEach(node => {
    (node.edges || []).forEach(edge => {
      const active = pathEdges.has(`${node.id}→${edge.to}`);
      drawEdge(ctx, node, NODES[edge.to], active, edge.label);
    });
  });

  // Nodes
  Object.values(NODES).forEach(node => {
    const vs = nodeVisualState(node.id, st);
    drawNode(ctx, node, vs, node.id === st.hovered);
  });
}

// ── Result panel ──────────────────────────────────────────────────────────────
function allocBarsHTML(alloc) {
  return alloc.map(a => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:#374151;margin-bottom:4px;">
        <span>${a.label}</span><span style="font-weight:700;">${a.pct}%</span>
      </div>
      <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;">
        <div style="width:${a.pct}%;height:100%;background:${a.color};border-radius:5px;transition:width 0.6s ease;"></div>
      </div>
    </div>`).join('');
}

function renderResult(resultEl, stratId) {
  const s = STRATEGIES[stratId];
  resultEl.innerHTML = `
    <div style="border:2px solid #059669;border-radius:14px;background:#fff;padding:22px 24px;animation:fadeInUp 0.4s ease;">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
        <div style="font-size:2.8rem;line-height:1;">${s.emoji}</div>
        <div>
          <div style="font-size:1.25rem;font-weight:760;color:#059669;">${s.name}</div>
          <div style="font-size:0.82rem;color:#6b7280;margin-top:3px;">나의 투자 성향 결과</div>
        </div>
      </div>

      <p style="font-size:0.88rem;color:#374151;line-height:1.65;margin:0 0 20px;padding:12px 14px;background:#f0fdf4;border-left:3px solid #059669;border-radius:0 8px 8px 0;">
        ${s.desc}
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div>
          <div style="font-size:0.72rem;font-weight:760;color:#6b7280;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;">자산 배분 비율</div>
          ${allocBarsHTML(s.alloc)}
        </div>
        <div>
          <div style="font-size:0.72rem;font-weight:760;color:#6b7280;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;">전략 요약</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:0.84rem;align-items:start;">
            <span style="color:#6b7280;">기대 수익</span><span style="font-weight:700;color:#131722;">${s.expected}</span>
            <span style="color:#6b7280;">위험 수준</span><span style="font-weight:700;">${s.risk}</span>
            <span style="color:#6b7280;">투자 기간</span><span style="font-weight:700;color:#131722;">${s.horizon}</span>
          </div>

          <div style="margin-top:16px;">
            <div style="font-size:0.72rem;font-weight:760;color:#6b7280;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;">추천 상품 예시</div>
            <ul style="margin:0;padding:0 0 0 16px;font-size:0.82rem;color:#374151;line-height:1.8;">
              ${s.products.map(p => `<li>${p}</li>`).join('')}
            </ul>
          </div>

          <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:6px;">
            ${s.tags.map(t => `<span style="font-size:0.75rem;padding:3px 10px;border-radius:20px;background:#eff6ff;color:#2962ff;font-weight:600;">#${t}</span>`).join('')}
          </div>
        </div>
      </div>

      <div style="padding:12px 14px;background:#fffbeb;border-radius:8px;font-size:0.83rem;color:#92400e;line-height:1.5;">
        ${s.tip}
      </div>

      <p style="font-size:0.75rem;color:#9ca3af;margin:14px 0 0;line-height:1.5;">
        <i class="fa-solid fa-triangle-exclamation"></i> 이 결과는 학습 목적의 참고용이며 실제 투자 권유가 아닙니다. 투자 전 전문가와 상담하세요.
      </p>
    </div>`;

  resultEl.style.display = 'block';
  requestAnimationFrame(() => resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

// ── Path breadcrumb ───────────────────────────────────────────────────────────
function updateBreadcrumb(el, st) {
  if (st.path.length === 0) {
    el.textContent = '첫 번째 질문에 답해보세요 →';
    return;
  }
  const parts = st.path.map(s => `<b>${s.edgeLabel}</b>`).join(' → ');
  el.innerHTML = `선택 경로: ${parts}${st.done ? ` → <b style="color:#059669;">${NODES[st.current].text[0]}</b> <i class="fa-solid fa-check"></i>` : ''}`;
}

// ── Main export ───────────────────────────────────────────────────────────────
export function investmentTreeView(container) {
  _state = makeState();

  container.innerHTML = `
    <style>
      @keyframes fadeInUp {
        from { opacity:0; transform:translateY(12px); }
        to   { opacity:1; transform:translateY(0); }
      }
      #tree-canvas { display:block; cursor:default; border-radius:10px; border:1px solid #e2e8f0; }
    </style>

    <div style="margin-bottom:18px;">
      <h1 style="font-weight:760;color:#131722;margin:0 0 5px;">
        <i class="fa-solid fa-sitemap"></i> 투자 성향 분석 — 의사결정 트리
      </h1>
      <p style="font-size:0.87rem;color:#475569;margin:0;line-height:1.6;">
        파란 노드를 클릭해 답을 선택하세요. 선택 경로에 따라 나의 투자 전략이 결정됩니다.
      </p>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
      <button id="btn-restart"
        style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:1px solid #d1d5db;border-radius:7px;background:#fff;font-size:0.82rem;font-weight:600;color:#374151;cursor:pointer;">
        <i class="fa-solid fa-rotate-left"></i> 다시 시작
      </button>
      <button id="btn-back"
        style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:1px solid #d1d5db;border-radius:7px;background:#fff;font-size:0.82rem;font-weight:600;color:#374151;cursor:pointer;">
        <i class="fa-solid fa-chevron-left"></i> 한 단계 뒤로
      </button>
      <div id="tree-breadcrumb"
        style="font-size:0.83rem;color:#64748b;flex:1;min-width:200px;">
        첫 번째 질문에 답해보세요 →
      </div>
    </div>

    <!-- Legend -->
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;font-size:0.78rem;color:#64748b;">
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#2962ff;margin-right:5px;vertical-align:middle;"></span>현재 질문</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#eff6ff;border:1.5px solid #2962ff;margin-right:5px;vertical-align:middle;"></span>선택 가능 (클릭)</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#f59e0b;margin-right:5px;vertical-align:middle;"></span>선택됨</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#059669;margin-right:5px;vertical-align:middle;"></span>최종 결과</span>
    </div>

    <!-- Canvas wrapper (horizontal scroll on narrow screens) -->
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:20px;">
      <canvas id="tree-canvas"></canvas>
    </div>

    <div id="result-panel" style="display:none;margin-top:4px;"></div>`;

  // ── Canvas setup ─────────────────────────────────────────────────────────────
  const canvas = container.querySelector('#tree-canvas');
  const ctx    = canvas.getContext('2d');
  patchRoundRect(ctx);

  const dpr = window.devicePixelRatio || 1;
  const displayW = Math.max(container.clientWidth || 600, 600);
  const scale    = displayW / VW;
  const displayH = VH * scale;

  canvas.width  = VW  * dpr * scale;
  canvas.height = VH  * dpr * scale;
  canvas.style.width  = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
  ctx.scale(dpr * scale, dpr * scale);

  const breadcrumb = container.querySelector('#tree-breadcrumb');
  const resultEl   = container.querySelector('#result-panel');

  // Converts canvas mouse position → virtual coords
  function toVirtual(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      vx: (e.clientX - rect.left) / scale,
      vy: (e.clientY - rect.top)  / scale,
    };
  }

  function hitTest(vx, vy, nodeId) {
    const n = NODES[nodeId];
    return vx >= n.cx - n.w / 2 && vx <= n.cx + n.w / 2 &&
           vy >= n.cy - n.h / 2 && vy <= n.cy + n.h / 2;
  }

  function redraw() {
    draw(ctx, _state);
    updateBreadcrumb(breadcrumb, _state);
  }

  // ── Click handler ─────────────────────────────────────────────────────────────
  canvas.addEventListener('click', e => {
    if (_state.done) return;
    const { vx, vy } = toVirtual(e);
    const avail = getAvailable(_state.current);
    for (const nid of avail) {
      if (hitTest(vx, vy, nid)) {
        const fromNode  = NODES[_state.current];
        const edgeLabel = fromNode.edges.find(ed => ed.to === nid).label;
        _state.path.push({ from: _state.current, to: nid, edgeLabel });
        _state.current = nid;
        if (NODES[nid].type === 'result') {
          _state.done = true;
          redraw();
          renderResult(resultEl, nid);
        } else {
          redraw();
        }
        break;
      }
    }
  });

  // ── Hover handler ─────────────────────────────────────────────────────────────
  canvas.addEventListener('mousemove', e => {
    if (_state.done) return;
    const { vx, vy } = toVirtual(e);
    const avail = getAvailable(_state.current);
    let hovered = null;
    for (const nid of avail) {
      if (hitTest(vx, vy, nid)) { hovered = nid; break; }
    }
    if (hovered !== _state.hovered) {
      _state.hovered = hovered;
      canvas.style.cursor = hovered ? 'pointer' : 'default';
      redraw();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (_state.hovered) { _state.hovered = null; canvas.style.cursor = 'default'; redraw(); }
  });

  // Touch support
  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    canvas.dispatchEvent(new MouseEvent('click', { clientX: t.clientX, clientY: t.clientY }));
  }, { passive: false });

  // ── Buttons ───────────────────────────────────────────────────────────────────
  container.querySelector('#btn-restart').addEventListener('click', () => {
    _state = makeState();
    resultEl.style.display = 'none';
    redraw();
  });

  container.querySelector('#btn-back').addEventListener('click', () => {
    if (_state.path.length === 0) return;
    _state.path.pop();
    _state.current = _state.path.length > 0 ? _state.path[_state.path.length - 1].to : 'q1';
    _state.done    = false;
    resultEl.style.display = 'none';
    redraw();
  });

  redraw();
}
