const BASE_MONEY = 1000000;
const MIN_MONEY = 100000;
// 학습용 시뮬레이션에서 과도한 음수 시나리오를 제한하기 위한 연간 최소 성장 배수(-30%).
const MIN_GROWTH_MULTIPLIER = 0.7;
const MIN_BAR_WIDTH_PERCENT = 2;
const ETF_SCORE_WEIGHTS = { ret: 0.4, gap: 0.25, te: 0.2, fee: 0.15 };

const STYLE_PRESETS = {
  safe: {
    name: '안정형',
    description: '손실을 줄이는 것을 가장 중요하게 생각해요.',
    weights: { '주식/ETF': 0.2, '채권': 0.55, '원자재': 0.1, '현금': 0.15 },
    checks: ['원금 손실이 걱정돼요', '수익이 조금 낮아도 괜찮아요', '큰 변동은 피하고 싶어요'],
  },
  balanced: {
    name: '균형형',
    description: '안정성과 수익을 함께 챙기고 싶어요.',
    weights: { '주식/ETF': 0.4, '채권': 0.35, '원자재': 0.15, '현금': 0.1 },
    checks: ['적당한 변동은 감수할 수 있어요', '예금보다 높은 수익을 원해요', '장기적으로 키우고 싶어요'],
  },
  growth: {
    name: '성장형',
    description: '변동이 있더라도 더 큰 수익을 기대해요.',
    weights: { '주식/ETF': 0.6, '채권': 0.2, '원자재': 0.15, '현금': 0.05 },
    checks: ['단기 하락을 버틸 수 있어요', '장기 수익을 더 중요하게 봐요', '공격적으로 투자해도 괜찮아요'],
  },
};

const ASSET_RETURN = { '주식/ETF': 0.09, '채권': 0.035, '원자재': 0.055, '현금': 0.02 };
const ASSET_RISK = { '주식/ETF': 0.2, '채권': 0.07, '원자재': 0.17, '현금': 0.01 };
const SCENARIO_ADJUST = { slow: -0.03, normal: 0, fast: 0.03 };

export function financialKnowledgeView(container) {
  container.innerHTML = `
    <div style="margin-bottom:18px;">
      <h1 style="font-weight:760; color:#131722; margin:0 0 6px;">
        <i class="fa-solid fa-layer-group"></i> 쉬운 자산배분 체험
      </h1>
      <p style="font-size:0.9rem; color:#475569; line-height:1.6; margin:0;">
        금융 지식이 적어도 괜찮아요. <strong>100만원</strong>을 투자 성향에 맞게 나누고, 결과를 간단히 확인해요.
      </p>
    </div>

    <section style="border:1px solid #d9e1ec; border-radius:8px; padding:16px; background:#fff;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:12px;">
        <div>
          <label class="param-label">투자 금액 (원)</label>
          <input id="fk-money" type="number" class="param-input" min="${MIN_MONEY}" step="10000" value="${BASE_MONEY}" />
        </div>
        <div>
          <label class="param-label">투자 방식 체크</label>
          <select id="fk-style" class="param-input">
            <option value="safe">안정형</option>
            <option value="balanced" selected>균형형</option>
            <option value="growth">성장형</option>
          </select>
        </div>
        <div>
          <label class="param-label">시뮬레이션 기간</label>
          <select id="fk-years" class="param-input">
            <option value="1">1년</option>
            <option value="3" selected>3년</option>
            <option value="5">5년</option>
          </select>
        </div>
        <div>
          <label class="param-label">시장 분위기</label>
          <select id="fk-scenario" class="param-input">
            <option value="slow">보수적</option>
            <option value="normal" selected>보통</option>
            <option value="fast">긍정적</option>
          </select>
        </div>
      </div>

      <button class="run-btn" id="fk-run">
        <i class="fa-solid fa-play"></i> 시뮬레이션 보기
      </button>

      <div id="fk-result" style="margin-top:16px;"></div>
    </section>

    <section style="border:1px solid #d9e1ec; border-radius:8px; padding:16px; background:#fff; margin-top:14px;">
      <h2 style="color:#131722; margin:0 0 8px;">
        <i class="fa-solid fa-scale-balanced"></i> ETF 2종 비교 (선택 조건 중심)
      </h2>
      <p style="font-size:0.8rem; color:#64748b; margin:0 0 12px; line-height:1.5;">
        수익률, 괴리율(ETF 시장 가격과 실제 자산값의 차이), 추적오차(지수를 따라간 정도의 차이), 펀드보수(보유 기간에 드는 운영 비용)를 함께 비교하고 거래 수수료 차이도 함께 확인합니다.
      </p>

      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px;">
        <div style="border:1px solid #e5edf5; border-radius:8px; padding:12px; background:#f8fafc;">
          <div style="font-size:0.82rem; font-weight:700; color:#2962ff; margin-bottom:8px;">ETF A</div>
          <label class="param-label">이름</label>
          <input id="etf-a-name" class="param-input" value="ETF A" />
          <label class="param-label">최근 1년 수익률 (%)</label>
          <input id="etf-a-ret" type="number" class="param-input" value="12" step="0.1" />
          <label class="param-label">괴리율(시장 가격과 실제 자산값의 차이, %) </label>
          <input id="etf-a-gap" type="number" class="param-input" value="0.20" step="0.01" min="0" />
          <label class="param-label">추적오차(지수를 따라간 정도의 차이, %) </label>
          <input id="etf-a-te" type="number" class="param-input" value="0.35" step="0.01" min="0" />
          <label class="param-label">펀드보수 TER(1년 운영 비용 비율, %) </label>
          <input id="etf-a-fee" type="number" class="param-input" value="0.09" step="0.01" min="0" />
          <label class="param-label">주식거래 수수료(왕복, %) </label>
          <input id="etf-a-commission" type="number" class="param-input" value="0.03" step="0.01" min="0" />
        </div>

        <div style="border:1px solid #e5edf5; border-radius:8px; padding:12px; background:#f8fafc;">
          <div style="font-size:0.82rem; font-weight:700; color:#7c3aed; margin-bottom:8px;">ETF B</div>
          <label class="param-label">이름</label>
          <input id="etf-b-name" class="param-input" value="ETF B" />
          <label class="param-label">최근 1년 수익률 (%)</label>
          <input id="etf-b-ret" type="number" class="param-input" value="10" step="0.1" />
          <label class="param-label">괴리율(시장 가격과 실제 자산값의 차이, %) </label>
          <input id="etf-b-gap" type="number" class="param-input" value="0.35" step="0.01" min="0" />
          <label class="param-label">추적오차(지수를 따라간 정도의 차이, %) </label>
          <input id="etf-b-te" type="number" class="param-input" value="0.60" step="0.01" min="0" />
          <label class="param-label">펀드보수 TER(1년 운영 비용 비율, %) </label>
          <input id="etf-b-fee" type="number" class="param-input" value="0.20" step="0.01" min="0" />
          <label class="param-label">주식거래 수수료(왕복, %) </label>
          <input id="etf-b-commission" type="number" class="param-input" value="0.03" step="0.01" min="0" />
        </div>
      </div>

      <button class="run-btn" id="etf-compare-run" style="margin-top:12px;">
        <i class="fa-solid fa-arrows-left-right"></i> ETF 2종 비교하기
      </button>
      <div id="etf-compare-result" style="margin-top:12px;"></div>
      <p style="font-size:0.74rem; color:#64748b; margin:10px 0 0;">
        ※ 기존 "산업 경쟁력 분석 → 섹터 주가 비교" 화면에서는 다중 ETF(섹터) 수익률·변동성 비교가 가능합니다.
      </p>
    </section>
  `;

  const render = () => {
    const money = Math.max(MIN_MONEY, Number(container.querySelector('#fk-money').value) || BASE_MONEY);
    const years = Math.max(1, Number(container.querySelector('#fk-years').value) || 1);
    const style = container.querySelector('#fk-style').value;
    const scenario = container.querySelector('#fk-scenario').value;
    const preset = STYLE_PRESETS[style] || STYLE_PRESETS.balanced;
    const scenarioAdjust = SCENARIO_ADJUST[scenario] || 0;
    const expected = calcExpectedReturn(preset.weights) + scenarioAdjust;
    const risk = calcRisk(preset.weights);
    const growthMultiplier = getGrowthMultiplier(expected);
    const futureMoney = money * (growthMultiplier ** years);

    container.querySelector('#fk-result').innerHTML = `
      ${renderSummary(preset, money, years, expected, risk, futureMoney)}
      ${renderAllocations(preset.weights, money, years, scenarioAdjust)}
    `;
  };

  container.querySelector('#fk-run').addEventListener('click', render);
  container.querySelector('#etf-compare-run').addEventListener('click', renderEtfCompare);
  render();
  renderEtfCompare();

  function renderEtfCompare() {
    const etfA = readEtfInput(container, 'a');
    const etfB = readEtfInput(container, 'b');

    const a = scoreEtf(etfA);
    const b = scoreEtf(etfB);
    const winner = a.total === b.total ? '동점' : (a.total > b.total ? etfA.name : etfB.name);

    container.querySelector('#etf-compare-result').innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:8px; border:1px solid #e5edf5; text-align:left;">항목</th>
              <th style="padding:8px; border:1px solid #e5edf5; text-align:right;">${escapeHtml(etfA.name)}</th>
              <th style="padding:8px; border:1px solid #e5edf5; text-align:right;">${escapeHtml(etfB.name)}</th>
            </tr>
          </thead>
          <tbody>
            ${renderCompareRow('수익률(%)', etfA.ret, etfB.ret, true)}
            ${renderCompareRow('괴리율(시장 가격과 실제 자산값의 차이, %)', etfA.gap, etfB.gap, false)}
            ${renderCompareRow('추적오차(지수를 따라간 정도의 차이, %)', etfA.te, etfB.te, false)}
            ${renderCompareRow('펀드보수 TER(1년 운영 비용 비율, %)', etfA.fee, etfB.fee, false)}
            ${renderCompareRow('주식거래 수수료 왕복(%)', etfA.commission, etfB.commission, false)}
            ${renderCompareRow('1년 총비용 추정(보수+수수료, %)', etfA.fee + etfA.commission, etfB.fee + etfB.commission, false)}
            ${renderScoreRow('수익률 점수', a.retScore, b.retScore)}
            ${renderScoreRow('괴리율 점수', a.gapScore, b.gapScore)}
            ${renderScoreRow('추적오차 점수', a.teScore, b.teScore)}
            ${renderScoreRow('보수 점수', a.feeScore, b.feeScore)}
            ${renderScoreRow('종합 점수', a.total, b.total, true)}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px; padding:10px; border:1px solid #d9e1ec; border-radius:8px; background:#f8fafc; font-size:0.8rem; color:#334155;">
        <strong>판정:</strong> ${winner === '동점' ? '두 ETF가 동점입니다.' : `${escapeHtml(winner)} 우위`}<br/>
        가중치: 수익률 ${Math.round(ETF_SCORE_WEIGHTS.ret * 100)}% · 괴리율 ${Math.round(ETF_SCORE_WEIGHTS.gap * 100)}% · 추적오차 ${Math.round(ETF_SCORE_WEIGHTS.te * 100)}% · 보수 ${Math.round(ETF_SCORE_WEIGHTS.fee * 100)}%<br/>
        <span style="color:#64748b;">※ 거래 수수료는 매매 시점 비용, 펀드보수는 보유 기간 비용으로 분리해 해석하세요.</span>
      </div>
    `;
  }
}

function renderSummary(preset, money, years, expected, risk, futureMoney) {
  return `
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-bottom:12px;">
      ${[
        ['선택 성향', `${preset.name}`, '#2962ff'],
        ['현재 금액', `${formatWon(money)}`, '#089981'],
        ['예상 연수익률', `${toPct(expected)}`, '#2962ff'],
        ['예상 변동성', `${toPct(risk)}`, '#d97706'],
        [`${years}년 후 예상`, `${formatWon(futureMoney)}`, '#7c3aed'],
      ].map(([label, value, color]) => `
        <div style="background:#f8fafc; border:1px solid #e5edf5; border-left:3px solid ${color}; border-radius:8px; padding:10px;">
          <div style="font-size:0.74rem; color:#64748b; margin-bottom:4px;">${label}</div>
          <div style="font-size:0.95rem; color:#131722; font-weight:800;">${value}</div>
        </div>
      `).join('')}
    </div>
    <div style="border:1px solid #d9e1ec; border-radius:8px; padding:10px 12px; background:#fff; margin-bottom:12px;">
      <div style="font-size:0.85rem; color:#131722; font-weight:700; margin-bottom:6px;">${preset.description}</div>
      <div style="display:grid; gap:4px;">
        ${preset.checks.map((text) => `
          <div style="font-size:0.8rem; color:#475569;"><i class="fa-regular fa-square-check"></i> ${text}</div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAllocations(weights, money, years, scenarioAdjust) {
  return `
    <section style="border:1px solid #d9e1ec; border-radius:8px; padding:12px; background:#fff;">
      <h2 style="color:#131722; margin:0 0 8px;">선택 금액(${formatWon(money)}) 자산배분 결과</h2>
      <div style="display:grid; gap:8px;">
        ${Object.entries(weights).map(([asset, weight]) => {
          const nowMoney = money * weight;
          const assetExpected = (ASSET_RETURN[asset] || 0) + scenarioAdjust;
          const assetGrowthMultiplier = getGrowthMultiplier(assetExpected);
          const futureMoney = nowMoney * (assetGrowthMultiplier ** years);
          return `
            <div style="border:1px solid #e5edf5; border-radius:8px; padding:10px; background:#f8fafc;">
              <div style="display:flex; justify-content:space-between; gap:8px; font-size:0.8rem; margin-bottom:4px;">
                <strong style="color:#131722;">${asset}</strong>
                <span style="color:#475569;">${toPct(weight)} · ${formatWon(nowMoney)}</span>
              </div>
              <div style="height:6px; border-radius:99px; background:#e5edf5; overflow:hidden; margin-bottom:6px;">
                <div style="height:100%; width:${Math.max(MIN_BAR_WIDTH_PERCENT, weight * 100)}%; background:#2962ff;"></div>
              </div>
              <div style="font-size:0.76rem; color:#64748b;">${years}년 후 예상: ${formatWon(futureMoney)}</div>
            </div>
          `;
        }).join('')}
      </div>
      <p style="font-size:0.74rem; color:#64748b; margin:10px 0 0;">
        ※ 학습용 단순 시뮬레이션입니다. 실제 수익은 달라질 수 있어요.
      </p>
    </section>
  `;
}

function calcExpectedReturn(weights) {
  return Object.entries(weights).reduce((acc, [asset, weight]) => acc + (ASSET_RETURN[asset] || 0) * weight, 0);
}

function calcRisk(weights) {
  return Object.entries(weights).reduce((acc, [asset, weight]) => acc + (ASSET_RISK[asset] || 0) * weight, 0);
}

function getGrowthMultiplier(expected) {
  return Math.max(MIN_GROWTH_MULTIPLIER, 1 + expected);
}

function formatWon(value) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function toPct(value) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function readEtfInput(container, suffix) {
  const name = (container.querySelector(`#etf-${suffix}-name`).value || `ETF ${suffix.toUpperCase()}`).trim();
  return {
    name: name || `ETF ${suffix.toUpperCase()}`,
    ret: Number(container.querySelector(`#etf-${suffix}-ret`).value) || 0,
    gap: Math.max(0, Number(container.querySelector(`#etf-${suffix}-gap`).value) || 0),
    te: Math.max(0, Number(container.querySelector(`#etf-${suffix}-te`).value) || 0),
    fee: Math.max(0, Number(container.querySelector(`#etf-${suffix}-fee`).value) || 0),
    commission: Math.max(0, Number(container.querySelector(`#etf-${suffix}-commission`).value) || 0),
  };
}

function scoreEtf(etf) {
  const retScore = higherBetterScore(etf.ret, -20, 20);
  const gapScore = lowerBetterScore(etf.gap, 2);
  const teScore = lowerBetterScore(etf.te, 2);
  const feeScore = lowerBetterScore(etf.fee, 1);
  const total =
    retScore * ETF_SCORE_WEIGHTS.ret +
    gapScore * ETF_SCORE_WEIGHTS.gap +
    teScore * ETF_SCORE_WEIGHTS.te +
    feeScore * ETF_SCORE_WEIGHTS.fee;
  return { retScore, gapScore, teScore, feeScore, total };
}

function higherBetterScore(value, minValue, maxValue) {
  if (maxValue <= minValue) return 0;
  const scaled = ((value - minValue) / (maxValue - minValue)) * 100;
  return clamp(scaled, 0, 100);
}

function lowerBetterScore(value, badThreshold) {
  if (badThreshold <= 0) return 0;
  const scaled = 100 - (value / badThreshold) * 100;
  return clamp(scaled, 0, 100);
}

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function renderCompareRow(label, a, b, higherBetter) {
  const aBetter = higherBetter ? a > b : a < b;
  const bBetter = higherBetter ? b > a : b < a;
  return `
    <tr>
      <td style="padding:8px; border:1px solid #e5edf5; color:#334155;">${label}</td>
      <td style="padding:8px; border:1px solid #e5edf5; text-align:right; color:${aBetter ? '#089981' : '#334155'};">${Number(a).toFixed(2)}</td>
      <td style="padding:8px; border:1px solid #e5edf5; text-align:right; color:${bBetter ? '#089981' : '#334155'};">${Number(b).toFixed(2)}</td>
    </tr>
  `;
}

function renderScoreRow(label, a, b, highlight = false) {
  const aBetter = a > b;
  const bBetter = b > a;
  return `
    <tr style="${highlight ? 'background:#eef2ff;' : ''}">
      <td style="padding:8px; border:1px solid #e5edf5; color:#334155; font-weight:${highlight ? 700 : 500};">${label}</td>
      <td style="padding:8px; border:1px solid #e5edf5; text-align:right; color:${aBetter ? '#089981' : '#334155'}; font-weight:${highlight ? 700 : 500};">${Number(a).toFixed(2)}</td>
      <td style="padding:8px; border:1px solid #e5edf5; text-align:right; color:${bBetter ? '#089981' : '#334155'}; font-weight:${highlight ? 700 : 500};">${Number(b).toFixed(2)}</td>
    </tr>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
