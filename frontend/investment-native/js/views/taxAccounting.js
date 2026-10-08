import { apiFetch } from '../api.js';
import { loadViewPayload, saveViewPayload } from '../utils/localState.js';

// ── helpers ────────────────────────────────────────────────────────────────

const won = (v) =>
  Number(v || 0).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '원';

const pct = (v) => (Number(v || 0).toFixed(2)) + '%';

const cardHTML = (label, value, color = '#3b82f6') =>
  `<div style="background:#0f172a; border:1px solid #1e293b; border-radius:10px; padding:16px 20px; min-width:160px; flex:1;">
    <div style="font-size:0.72rem; color:#64748b; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px;">${label}</div>
    <div style="font-size:1.15rem; font-weight:700; color:${color}; word-break:break-all;">${value}</div>
  </div>`;

const sectionTitle = (icon, text) =>
  `<h3 style="font-size:0.95rem; font-weight:700; color:#e2e8f0; margin:0 0 14px;"><i class="fa-solid ${icon}" style="margin-right:7px; color:#3b82f6;"></i>${text}</h3>`;

function tableHTML(headers, rows, striped = true) {
  const ths = headers.map(h => `<th style="padding:8px 12px; text-align:${h.align||'left'}; white-space:nowrap; color:#94a3b8; font-weight:600; font-size:0.78rem; border-bottom:1px solid #334155;">${h.label}</th>`).join('');
  const trs = rows.map((row, i) => {
    const bg = striped && i % 2 === 1 ? '#0f172a' : 'transparent';
    const tds = row.map((cell, ci) => `<td style="padding:7px 12px; text-align:${headers[ci]?.align||'left'}; font-size:0.82rem; color:${cell?.color||'#cbd5e1'}; border-bottom:1px solid #1e293b;">${cell?.text ?? cell}</td>`).join('');
    return `<tr style="background:${bg};">${tds}</tr>`;
  }).join('');
  return `<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; table-layout:auto;">
    <thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

// ── Audit (감사 사료용) report ─────────────────────────────────────────────

function renderAuditReport(data, container) {
  const { summary, income_by_category, expense_by_category, monthly, transactions,
          vat, income_tax, business_name, taxpayer_id, tax_year, entity_type } = data;

  const now = new Date().toLocaleDateString('ko-KR');
  const entityLabel = entity_type === 'corporate' ? '법인' : '개인사업자';

  // Header
  let html = `
    <div style="background:#0f172a; border:1px solid #334155; border-radius:12px; padding:20px 24px; margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-size:1.1rem; font-weight:700; color:#f1f5f9; margin-bottom:4px;">
            <i class="fa-solid fa-file-magnifying-glass" style="margin-right:8px; color:#6366f1;"></i>회계 장부 감사 자료
          </div>
          <div style="font-size:0.82rem; color:#64748b;">내부 감사·경영진 검토용 (비공개)</div>
        </div>
        <div style="text-align:right; font-size:0.8rem; color:#64748b; line-height:1.8;">
          <div>과세연도: <b style="color:#94a3b8;">${tax_year}년</b></div>
          <div>사업자 유형: <b style="color:#94a3b8;">${entityLabel}</b></div>
          <div>상호: <b style="color:#94a3b8;">${business_name || '(미입력)'}</b></div>
          <div>사업자번호: <b style="color:#94a3b8;">${taxpayer_id || '(미입력)'}</b></div>
          <div>작성일: <b style="color:#94a3b8;">${now}</b></div>
        </div>
      </div>
    </div>`;

  // Summary cards
  html += `<div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:20px;">
    ${cardHTML('총 수입금액', won(summary.total_income), '#22c55e')}
    ${cardHTML('총 지출금액', won(summary.total_expense), '#f97316')}
    ${cardHTML('당기순이익', won(summary.net_income), summary.net_income >= 0 ? '#3b82f6' : '#ef4444')}
    ${cardHTML('과세소득', won(summary.taxable_income), '#a78bfa')}
    ${cardHTML('부가세 납부액', won(vat.payable), '#ec4899')}
    ${cardHTML('소득(법인)세 합계', won(income_tax.total), '#f59e0b')}
  </div>`;

  // 수입 분류 내역
  html += `<div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:16px;">
    ${sectionTitle('fa-arrow-trend-up', '수입 항목별 내역')}`;
  const incRows = Object.entries(income_by_category).sort((a, b) => b[1] - a[1]);
  const totalInc = summary.total_income;
  html += tableHTML(
    [{ label: '항목' }, { label: '금액', align: 'right' }, { label: '비율', align: 'right' }],
    incRows.map(([cat, amt]) => [cat, { text: won(amt), color: '#22c55e' }, { text: pct(amt / totalInc * 100), color: '#64748b' }])
      .concat([[{ text: '합계', color: '#f1f5f9' }, { text: won(totalInc), color: '#22c55e' }, { text: '100.00%', color: '#64748b' }]])
  );
  html += `</div>`;

  // 지출 분류 내역
  html += `<div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:16px;">
    ${sectionTitle('fa-arrow-trend-down', '지출 항목별 내역')}`;
  const expRows = Object.entries(expense_by_category).sort((a, b) => b[1] - a[1]);
  const totalExp = summary.total_expense;
  html += tableHTML(
    [{ label: '항목' }, { label: '금액', align: 'right' }, { label: '비율', align: 'right' }],
    expRows.map(([cat, amt]) => [cat, { text: won(amt), color: '#f97316' }, { text: pct(amt / totalExp * 100), color: '#64748b' }])
      .concat([[{ text: '합계', color: '#f1f5f9' }, { text: won(totalExp), color: '#f97316' }, { text: '100.00%', color: '#64748b' }]])
  );
  html += `</div>`;

  // 월별 수지 내역
  html += `<div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:16px;">
    ${sectionTitle('fa-calendar-days', '월별 수지 현황')}`;
  const monthRows = Object.entries(monthly).map(([m, v]) => [
    m,
    { text: won(v.income), color: '#22c55e' },
    { text: won(v.expense), color: '#f97316' },
    {
      text: won(v.income - v.expense),
      color: v.income - v.expense >= 0 ? '#3b82f6' : '#ef4444',
    },
  ]);
  html += tableHTML(
    [{ label: '월' }, { label: '수입', align: 'right' }, { label: '지출', align: 'right' }, { label: '수지', align: 'right' }],
    monthRows
  );
  html += `</div>`;

  // Full transaction ledger (capped at 200 for rendering performance)
  const displayTxs = transactions.slice(0, 200);
  html += `<div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:16px;">
    ${sectionTitle('fa-list', `거래 원장 (${transactions.length}건 중 ${displayTxs.length}건 표시)`)}`;
  html += tableHTML(
    [
      { label: '날짜' }, { label: '내용' }, { label: '분류' }, { label: '구분', align: 'center' },
      { label: '입금', align: 'right' }, { label: '출금', align: 'right' },
    ],
    displayTxs.map(tx => [
      tx.date,
      tx.description.length > 30 ? tx.description.slice(0, 30) + '…' : tx.description,
      tx.category,
      { text: tx.type === 'income' ? '수입' : '지출', color: tx.type === 'income' ? '#22c55e' : '#f97316' },
      { text: tx.deposit > 0 ? won(tx.deposit) : '-', color: '#22c55e' },
      { text: tx.withdrawal > 0 ? won(tx.withdrawal) : '-', color: '#f97316' },
    ])
  );
  html += `</div>`;

  // 세액 계산 상세
  html += `<div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:16px;">
    ${sectionTitle('fa-calculator', '세액 산출 내역')}
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div>
        <div style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px; font-weight:600;">부가가치세</div>
        ${tableHTML(
          [{ label: '구분' }, { label: '금액', align: 'right' }],
          [
            ['매출세액 (과세매출 × 10%)', { text: won(vat.output_tax), color: '#f97316' }],
            ['매입세액 (과세매입 × 10%)', { text: won(vat.input_tax), color: '#22c55e' }],
            [{ text: '납부(환급)세액', color: '#f1f5f9' }, { text: won(vat.payable), color: '#ec4899' }],
          ],
          false
        )}
      </div>
      <div>
        <div style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px; font-weight:600;">
          ${entity_type === 'corporate' ? '법인세' : '종합소득세'}
        </div>
        ${tableHTML(
          [{ label: '구분' }, { label: '금액', align: 'right' }],
          [
            ['과세소득', { text: won(summary.taxable_income), color: '#94a3b8' }],
            ['산출세액', { text: won(income_tax.amount), color: '#f97316' }],
            ['지방소득세 (산출세액 × 10%)', { text: won(income_tax.local_tax), color: '#f97316' }],
            [{ text: '총 납부 세액', color: '#f1f5f9' }, { text: won(income_tax.total), color: '#f59e0b' }],
            ['실효세율', { text: pct(income_tax.effective_rate), color: '#64748b' }],
          ],
          false
        )}
      </div>
    </div>
  </div>`;

  container.innerHTML = html;
}

// ── Tax Office (세무서 제출용) report ─────────────────────────────────────

function formRowHTML(label, value, bold = false, color = '#cbd5e1') {
  return `<tr>
    <td style="padding:7px 14px; font-size:0.82rem; color:#94a3b8; border:1px solid #334155; background:#0f172a; width:45%;">${label}</td>
    <td style="padding:7px 14px; font-size:0.82rem; color:${color}; border:1px solid #334155; text-align:right; font-weight:${bold ? 700 : 400};">${value}</td>
  </tr>`;
}

function formSectionHTML(title, rows) {
  return `<div style="margin-bottom:20px;">
    <div style="background:#1e3a5f; color:#93c5fd; font-size:0.8rem; font-weight:700; padding:8px 14px; border-radius:6px 6px 0 0; border:1px solid #334155; border-bottom:none;">${title}</div>
    <table style="width:100%; border-collapse:collapse;">${rows.join('')}</table>
  </div>`;
}

function renderTaxOfficeReport(data, container) {
  const { summary, income_by_category, expense_by_category, vat, income_tax,
          business_name, taxpayer_id, tax_year, entity_type } = data;
  const entityLabel = entity_type === 'corporate' ? '법인세' : '종합소득세';
  const now = new Date().toLocaleDateString('ko-KR');

  let html = `
    <!-- Official form header -->
    <div style="background:#0f172a; border:2px solid #1e40af; border-radius:12px; padding:20px 24px; margin-bottom:20px; text-align:center;">
      <div style="font-size:0.72rem; color:#64748b; margin-bottom:4px;">국세청 신고서 (시뮬레이션 · 참고용)</div>
      <div style="font-size:1.2rem; font-weight:700; color:#f1f5f9; margin-bottom:4px;">${tax_year}년 귀속 부가가치세 · ${entityLabel} 신고서</div>
      <div style="font-size:0.8rem; color:#94a3b8;">세무서 제출용 (참고 자료 · 실제 신고 전 세무사 검토 필요)</div>
    </div>

    <!-- 사업자 정보 -->
    <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:20px;">
      ${sectionTitle('fa-id-card', '① 납세자 기본사항')}
      <table style="width:100%; border-collapse:collapse;">
        <tr>
          <td style="padding:8px 14px; font-size:0.82rem; color:#94a3b8; border:1px solid #334155; background:#0f172a; width:25%;">상호 (법인명)</td>
          <td style="padding:8px 14px; font-size:0.82rem; color:#f1f5f9; border:1px solid #334155; width:25%;">${business_name || ' '}</td>
          <td style="padding:8px 14px; font-size:0.82rem; color:#94a3b8; border:1px solid #334155; background:#0f172a; width:25%;">사업자등록번호</td>
          <td style="padding:8px 14px; font-size:0.82rem; color:#f1f5f9; border:1px solid #334155; width:25%;">${taxpayer_id || ' '}</td>
        </tr>
        <tr>
          <td style="padding:8px 14px; font-size:0.82rem; color:#94a3b8; border:1px solid #334155; background:#0f172a;">사업자 구분</td>
          <td style="padding:8px 14px; font-size:0.82rem; color:#f1f5f9; border:1px solid #334155;">${entity_type === 'corporate' ? '법인' : '개인'}</td>
          <td style="padding:8px 14px; font-size:0.82rem; color:#94a3b8; border:1px solid #334155; background:#0f172a;">과세연도</td>
          <td style="padding:8px 14px; font-size:0.82rem; color:#f1f5f9; border:1px solid #334155;">${tax_year}. 1. 1. ~ ${tax_year}. 12. 31.</td>
        </tr>
        <tr>
          <td style="padding:8px 14px; font-size:0.82rem; color:#94a3b8; border:1px solid #334155; background:#0f172a;">부가세 과세 유형</td>
          <td colspan="3" style="padding:8px 14px; font-size:0.82rem; color:#f1f5f9; border:1px solid #334155;">${vat.registered ? '일반과세자' : '면세사업자'}</td>
        </tr>
      </table>
    </div>`;

  // 부가가치세 신고서
  html += `<div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:20px;">
    ${sectionTitle('fa-receipt', '② 부가가치세 신고서 (일반과세자)')}`;

  html += formSectionHTML('제1절 과세표준 및 매출세액', [
    formRowHTML('① 과세 매출액 (공급가액)',    won(summary.total_income)),
    formRowHTML('② 매출세액 (① × 10/100)',    won(vat.output_tax), false, '#f97316'),
    formRowHTML('③ 면세 매출액',                won(0)),
    formRowHTML('④ 합계 (과세표준)',            won(summary.total_income), true),
  ]);

  html += formSectionHTML('제2절 매입세액', [
    formRowHTML('⑤ 세금계산서 수취분 매입세액', won(vat.input_tax)),
    formRowHTML('⑥ 기타 공제 매입세액',          won(0)),
    formRowHTML('⑦ 공제받지 못할 매입세액',      won(0)),
    formRowHTML('⑧ 차감 매입세액 합계 (⑤+⑥-⑦)', won(vat.input_tax), true, '#22c55e'),
  ]);

  html += formSectionHTML('제3절 납부(환급)세액', [
    formRowHTML('⑨ 납부(환급)세액 (②-⑧)',      won(vat.payable), true, '#ec4899'),
    formRowHTML('⑩ 경감·공제세액',              won(0)),
    formRowHTML('⑪ 가산세',                     won(0)),
    formRowHTML('⑫ 차감·가산하여 납부할 세액',  won(vat.payable), true, '#f59e0b'),
  ]);

  html += `</div>`;

  // 소득세/법인세 신고서
  html += `<div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:20px;">
    ${sectionTitle('fa-building-columns', `③ ${entityLabel} 과세표준 및 세액 신고서`)}`;

  // 수입금액 명세
  const incRows2 = Object.entries(income_by_category);
  html += formSectionHTML('수입금액 명세', [
    ...incRows2.map(([cat, amt]) => formRowHTML(cat, won(amt))),
    formRowHTML('수입금액 합계', won(summary.total_income), true, '#22c55e'),
  ]);

  // 필요경비 명세
  const expRows2 = Object.entries(expense_by_category);
  html += formSectionHTML('필요경비 (손금) 명세', [
    ...expRows2.map(([cat, amt]) => formRowHTML(cat, won(amt))),
    formRowHTML('필요경비 합계', won(summary.total_expense), true, '#f97316'),
  ]);

  // 과세표준 및 세액 산출
  html += formSectionHTML('과세표준 및 세액 산출', [
    formRowHTML('소득금액 (수입 - 필요경비)',  won(summary.net_income)),
    formRowHTML('각종 공제금액',               won(summary.standard_deduction)),
    formRowHTML('과세표준',                    won(summary.taxable_income), true),
    formRowHTML('산출세액',                    won(income_tax.amount), false, '#f97316'),
    formRowHTML('지방소득세 (산출세액 × 10%)', won(income_tax.local_tax), false, '#f97316'),
    formRowHTML('세액공제 합계',               won(0)),
    formRowHTML('총 결정세액 (납부세액)',       won(income_tax.total), true, '#f59e0b'),
    formRowHTML('실효세율',                    pct(income_tax.effective_rate), false, '#64748b'),
  ]);

  html += `</div>`;

  // 세액 납부 일정 안내
  const vatQuarter = `${tax_year + 1}.01.25 (제2기 확정 신고)`;
  const taxDue     = entity_type === 'individual'
    ? `${tax_year + 1}.05.31 (종합소득세 신고·납부 기한)`
    : `${tax_year + 1}.03.31 (법인세 신고·납부 기한)`;

  html += `<div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:20px;">
    ${sectionTitle('fa-calendar-check', '④ 납부 일정 안내')}
    ${tableHTML(
      [{ label: '세목' }, { label: '납부 기한' }, { label: '납부 예상액', align: 'right' }],
      [
        ['부가가치세 (2기 확정)', vatQuarter, { text: won(vat.payable), color: '#ec4899' }],
        [entityLabel, taxDue, { text: won(income_tax.total), color: '#f59e0b' }],
        [{ text: '합계', color: '#f1f5f9' }, '-', { text: won(vat.payable + income_tax.total), color: '#f1f5f9' }],
      ],
      false
    )}
    <p style="font-size:0.75rem; color:#475569; margin-top:12px; line-height:1.6;">
      ※ 이 신고서는 시뮬레이션 결과로 실제 납부 세액과 다를 수 있습니다.<br>
      ※ 실제 신고 전 반드시 담당 세무사 또는 세무서를 통해 확인하십시오.<br>
      ※ 부가세는 예정고지 금액 및 세금계산서 발급 여부에 따라 달라질 수 있습니다.
    </p>
  </div>`;

  container.innerHTML = html;
}

// ── Main view ────────────────────────────────────────────────────────────────

export function taxAccountingView(container) {
  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <h1 style="font-weight:700; color:#1e293b; margin-bottom:6px;">
        <i class="fa-solid fa-file-invoice-dollar" style="margin-right:8px; color:#3b82f6;"></i>세무·회계 시뮬레이션
      </h1>
      <p style="font-size:0.875rem; color:#64748b; line-height:1.6;">
        입출금 내역 파일(CSV·Excel)을 업로드하거나 샘플 데이터를 사용해 세무·회계를 시뮬레이션합니다.
        결과는 <b style="color:#a78bfa;">감사 자료용</b>과 <b style="color:#38bdf8;">세무서 제출용</b> 두 가지 화면으로 제공됩니다.
      </p>
    </div>

    <!-- STEP 1: 파일 업로드 -->
    <div id="tax-step1" style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:24px; margin-bottom:20px;">
      <div style="font-size:0.9rem; font-weight:700; color:#e2e8f0; margin-bottom:16px;">
        <i class="fa-solid fa-upload" style="margin-right:7px; color:#3b82f6;"></i>STEP 1 · 입출금 내역 업로드
      </div>

      <!-- Drag & Drop Zone -->
      <div id="tax-dropzone" style="
        border:2px dashed #334155; border-radius:10px; padding:36px 20px; text-align:center;
        cursor:pointer; transition:border-color .2s, background .2s; margin-bottom:16px;">
        <i class="fa-solid fa-cloud-arrow-up" style="font-size:2rem; color:#334155; margin-bottom:10px;"></i>
        <div style="color:#64748b; font-size:0.88rem; margin-bottom:6px;">파일을 여기에 드래그하거나 클릭해서 선택</div>
        <div style="color:#475569; font-size:0.76rem;">지원 형식: .csv · .xlsx · .xls (최대 5MB)</div>
        <input id="tax-file-input" type="file" accept=".csv,.xlsx,.xls" style="display:none;">
      </div>

      <div style="display:flex; gap:12px; align-items:center;">
        <button id="tax-sample-btn" class="run-btn" style="background:#6366f1; font-size:0.83rem; padding:8px 18px;">
          <i class="fa-solid fa-wand-magic-sparkles"></i> 샘플 데이터 사용
        </button>
        <span style="color:#475569; font-size:0.78rem;">— 또는 파일을 직접 업로드하세요</span>
      </div>

      <div id="tax-upload-status" style="margin-top:12px; font-size:0.83rem;"></div>
    </div>

    <!-- STEP 2: 설정 -->
    <div id="tax-step2" style="display:none; background:#1e293b; border:1px solid #334155; border-radius:12px; padding:24px; margin-bottom:20px;">
      <div style="font-size:0.9rem; font-weight:700; color:#e2e8f0; margin-bottom:16px;">
        <i class="fa-solid fa-sliders" style="margin-right:7px; color:#3b82f6;"></i>STEP 2 · 시뮬레이션 설정
      </div>

      <div id="tax-preview-wrap" style="margin-bottom:18px;"></div>

      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px,1fr)); gap:14px; margin-bottom:18px;">
        <div>
          <label class="param-label">사업자 유형</label>
          <select id="tax-entity" class="param-input" style="background:#0f172a; color:#e2e8f0;">
            <option value="individual">개인사업자</option>
            <option value="corporate">법인</option>
          </select>
        </div>
        <div>
          <label class="param-label">과세연도</label>
          <input id="tax-year" type="number" value="2024" min="2020" max="2030" class="param-input"/>
        </div>
        <div>
          <label class="param-label">상호 / 법인명</label>
          <input id="tax-bizname" type="text" placeholder="홍길동 컨설팅" class="param-input"/>
        </div>
        <div>
          <label class="param-label">사업자등록번호</label>
          <input id="tax-bizid" type="text" placeholder="000-00-00000" class="param-input"/>
        </div>
        <div>
          <label class="param-label">부가세 과세여부</label>
          <select id="tax-vat" class="param-input" style="background:#0f172a; color:#e2e8f0;">
            <option value="true">일반과세자</option>
            <option value="false">면세사업자</option>
          </select>
        </div>
        <div>
          <label class="param-label">기본공제액 (원)</label>
          <input id="tax-deduction" type="number" value="0" min="0" class="param-input" placeholder="0"/>
        </div>
      </div>

      <button id="tax-simulate-btn" class="run-btn">
        <i class="fa-solid fa-calculator"></i> 세무·회계 시뮬레이션 실행
      </button>
    </div>

    <!-- STEP 3: 결과 -->
    <div id="tax-step3" style="display:none;">
      <div style="font-size:0.9rem; font-weight:700; color:#e2e8f0; margin-bottom:16px;">
        <i class="fa-solid fa-chart-pie" style="margin-right:7px; color:#3b82f6;"></i>STEP 3 · 시뮬레이션 결과
      </div>

      <!-- Tabs -->
      <div style="display:flex; gap:0; margin-bottom:20px; border-bottom:1px solid #334155;">
        <button id="tab-audit" class="tax-tab tax-tab-active" data-tab="audit">
          <i class="fa-solid fa-file-magnifying-glass"></i> 감사 자료용
        </button>
        <button id="tab-taxoffice" class="tax-tab" data-tab="taxoffice">
          <i class="fa-solid fa-building-columns"></i> 세무서 제출용
        </button>
        <button id="tax-print-btn" style="
          margin-left:auto; background:transparent; border:1px solid #334155;
          color:#94a3b8; border-radius:7px; padding:7px 14px; cursor:pointer;
          font-size:0.8rem; display:flex; align-items:center; gap:6px;">
          <i class="fa-solid fa-print"></i> 인쇄
        </button>
      </div>

      <div id="tax-result-audit"     class="tax-result-panel"></div>
      <div id="tax-result-taxoffice" class="tax-result-panel" style="display:none;"></div>
    </div>

    <style>
      .tax-tab {
        padding: 9px 20px;
        font-size: 0.83rem;
        font-weight: 600;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: #64748b;
        cursor: pointer;
        transition: all .2s;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .tax-tab-active {
        color: #3b82f6;
        border-bottom-color: #3b82f6;
      }
      .tax-tab:hover:not(.tax-tab-active) {
        color: #94a3b8;
        border-bottom-color: #475569;
      }
      #tax-dropzone:hover, #tax-dropzone.dragover {
        border-color: #3b82f6;
        background: rgba(59,130,246,.06);
      }
      #tax-dropzone.dragover > i { color: #3b82f6; }
    </style>
  `;

  // ── state ────────────────────────────────────────────────────────────────
  const savedState = loadViewPayload('tax-accounting') || {};
  let _transactions = savedState.transactions || null;
  let _simResult    = savedState.simResult || null;

  function persistTaxState() {
    saveViewPayload('tax-accounting', {
      transactions: _transactions,
      simResult: _simResult,
    });
  }

  const step1 = container.querySelector('#tax-step1');
  const step2 = container.querySelector('#tax-step2');
  const step3 = container.querySelector('#tax-step3');

  // ── file upload ──────────────────────────────────────────────────────────
  const dropzone  = container.querySelector('#tax-dropzone');
  const fileInput = container.querySelector('#tax-file-input');
  const statusEl  = container.querySelector('#tax-upload-status');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFileUpload(file);
  });

  async function handleFileUpload(file) {
    if (file.size > 5 * 1024 * 1024) {
      statusEl.innerHTML = `<span style="color:#ef4444;"><i class="fa-solid fa-circle-xmark"></i> 파일이 너무 큽니다 (최대 5MB)</span>`;
      return;
    }
    statusEl.innerHTML = `<span style="color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> 파일 파싱 중...</span>`;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const data = await fetch('/api/tax/upload', { method: 'POST', body: fd }).then(r => r.json());
      if (data.detail) throw new Error(data.detail);
      _transactions = data.transactions;
      _simResult = null;
      persistTaxState();
      statusEl.innerHTML = `<span style="color:#22c55e;"><i class="fa-solid fa-circle-check"></i> ${data.rows}건 로드 완료 · ${file.name}</span>`;
      showStep2(_transactions);
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#ef4444;"><i class="fa-solid fa-circle-xmark"></i> 오류: ${e.message}</span>`;
    }
  }

  // ── sample data ──────────────────────────────────────────────────────────
  container.querySelector('#tax-sample-btn').addEventListener('click', async () => {
    statusEl.innerHTML = `<span style="color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> 샘플 데이터 로딩 중...</span>`;
    try {
      const data = await apiFetch('/api/tax/sample');
      _transactions = data.transactions;
      _simResult = null;
      persistTaxState();
      statusEl.innerHTML = `<span style="color:#22c55e;"><i class="fa-solid fa-circle-check"></i> 샘플 데이터 ${data.rows}건 로드 완료</span>`;
      showStep2(_transactions);
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#ef4444;"><i class="fa-solid fa-circle-xmark"></i> 오류: ${e.message}</span>`;
    }
  });

  // ── show step 2 (preview + config) ───────────────────────────────────────
  function showStep2(txs) {
    step2.style.display = 'block';
    step3.style.display = 'none';

    const preview = txs.slice(0, 5);
    const previewWrap = container.querySelector('#tax-preview-wrap');
    previewWrap.innerHTML = `
      <div style="font-size:0.8rem; color:#64748b; margin-bottom:8px;">
        거래 내역 미리보기 (전체 ${txs.length}건 중 5건)
      </div>
      ${tableHTML(
        [{ label: '날짜' }, { label: '내용' }, { label: '입금', align: 'right' }, { label: '출금', align: 'right' }],
        preview.map(t => [
          t.date,
          t.description.length > 28 ? t.description.slice(0, 28) + '…' : t.description,
          { text: t.deposit > 0 ? won(t.deposit) : '-', color: '#22c55e' },
          { text: t.withdrawal > 0 ? won(t.withdrawal) : '-', color: '#f97316' },
        ])
      )}`;

    previewWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── simulate ─────────────────────────────────────────────────────────────
  container.querySelector('#tax-simulate-btn').addEventListener('click', async () => {
    if (!_transactions?.length) return;

    const btn = container.querySelector('#tax-simulate-btn');
    btn.disabled = true;
    btn.textContent = '시뮬레이션 중...';

    try {
      const body = {
        transactions:      _transactions,
        entity_type:       container.querySelector('#tax-entity').value,
        tax_year:          +container.querySelector('#tax-year').value,
        business_name:     container.querySelector('#tax-bizname').value,
        taxpayer_id:       container.querySelector('#tax-bizid').value,
        vat_registered:    container.querySelector('#tax-vat').value === 'true',
        standard_deduction: +container.querySelector('#tax-deduction').value || 0,
      };

      _simResult = await apiFetch('/api/tax/simulate', { method: 'POST', body: JSON.stringify(body) });
      persistTaxState();

      step3.style.display = 'block';
      renderAuditReport(_simResult, container.querySelector('#tax-result-audit'));
      renderTaxOfficeReport(_simResult, container.querySelector('#tax-result-taxoffice'));
      switchTab('audit');

      step3.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      alert('오류: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '세무·회계 시뮬레이션 실행';
    }
  });

  // ── tabs ─────────────────────────────────────────────────────────────────
  function switchTab(tab) {
    container.querySelectorAll('.tax-tab').forEach(t => t.classList.remove('tax-tab-active'));
    container.querySelector(`[data-tab="${tab}"]`).classList.add('tax-tab-active');
    container.querySelector('#tax-result-audit').style.display     = tab === 'audit'     ? '' : 'none';
    container.querySelector('#tax-result-taxoffice').style.display = tab === 'taxoffice' ? '' : 'none';
  }

  container.querySelectorAll('.tax-tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ── print ─────────────────────────────────────────────────────────────────
  container.querySelector('#tax-print-btn').addEventListener('click', () => {
    window.print();
  });

  // 업로드 원본 파일 자체는 브라우저 정책상 복원할 수 없지만, 파싱된 거래내역과
  // 마지막 결과는 보관하므로 새로고침 후에도 바로 이어서 검토할 수 있다.
  if (_transactions?.length) {
    statusEl.innerHTML = `<span style="color:#22c55e;"><i class="fa-solid fa-clock-rotate-left"></i> 이전에 저장한 거래 내역 ${_transactions.length}건을 복원했습니다.</span>`;
    showStep2(_transactions);
  }
  if (_simResult) {
    step3.style.display = 'block';
    renderAuditReport(_simResult, container.querySelector('#tax-result-audit'));
    renderTaxOfficeReport(_simResult, container.querySelector('#tax-result-taxoffice'));
    switchTab('audit');
  }
}
