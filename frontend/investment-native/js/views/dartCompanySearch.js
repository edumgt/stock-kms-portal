import { api } from '../api.js';
import { renderFinancialDashboard } from '../utils/financialCharts.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function dartCompanySearchView(container) {
  container.innerHTML = `
    <div style="margin-bottom:28px;">
      <h1 style="font-weight:760; color:#131722; margin-bottom:8px;">
        <i class="fa-solid fa-magnifying-glass-chart"></i> DART 상장기업 검색
      </h1>
      <p style="font-size:0.88rem; color:#6b7280; line-height:1.65;">
        전자공시시스템의 회사코드 목록에서 상장기업명을 검색해 DART 고유번호, 종목코드, 표시용 티커를 확인합니다.
      </p>
    </div>

    <section class="dart-search-panel">
      <div class="dart-search-row">
        <div>
          <label class="param-label">상장기업명</label>
          <input id="dart-company-name" type="text" value="삼성전자" class="param-input" placeholder="예: 삼성전자, 카카오, 현대차" />
        </div>
        <button class="run-btn" id="dart-search-run">
          <i class="fa-solid fa-magnifying-glass"></i> 검색
        </button>
      </div>
      <div class="dart-help">
        서버 환경변수 <code>DART_API_KEY</code> 또는 <code>OPENDART_API_KEY</code>가 설정되지 않으면 검색이 제한될 수 있습니다.
      </div>
      <div id="dart-search-result" style="margin-top:18px;"></div>
    </section>
  `;

  const input  = container.querySelector('#dart-company-name');
  const run    = container.querySelector('#dart-search-run');
  const result = container.querySelector('#dart-search-result');

  /* ── 파이낸셜 분석 로더 ──────────────────────────────────────────────── */
  async function loadFinancials(ticker, period, panelEl, btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 로딩 중';
    panelEl.innerHTML = `<p style="color:#6b7280;padding:12px 0;">
      <i class="fa-solid fa-spinner fa-spin"></i>&nbsp; ${escapeHtml(ticker)} 재무 데이터 수신 중… (10~20초 소요)</p>`;

    try {
      const data = await api.companyFinancials({ ticker, period });
      panelEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;
          padding:10px 14px;background:#f8fafc;border-radius:8px;margin-bottom:4px;border:1px solid #e2e8f0;">
          <div>
            <span style="font-size:0.95rem;font-weight:700;color:#131722;">${escapeHtml(data.name)}</span>
            <span style="margin-left:8px;font-size:0.8rem;color:#6b7280;">${escapeHtml(data.ticker)}</span>
            <span style="margin-left:6px;font-size:0.75rem;color:#9ca3af;">${escapeHtml(data.currency)}</span>
          </div>
          <span style="font-size:0.75rem;color:#9ca3af;">${data.period === 'annual' ? '연간' : '분기별'}</span>
        </div>
        <div id="fin-charts-inner"></div>
      `;
      renderFinancialDashboard(panelEl.querySelector('#fin-charts-inner'), data);
    } catch (err) {
      panelEl.innerHTML = `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;color:#b91c1c;font-size:0.85rem;">
          <strong>재무 데이터 조회 실패</strong>
          <p style="margin:4px 0 0;">${escapeHtml(err.message)}</p>
          <p style="margin:4px 0 0;color:#6b7280;">Yahoo Finance 조회 가능 티커인지 확인하거나 직접
            <a href="#" onclick="navigate('company-financial');return false;"
               style="color:#2563eb;text-decoration:underline;">기업 파이낸셜 분석</a> 메뉴에서 입력해 보세요.</p>
        </div>`;
    } finally {
      btnEl.disabled = false;
      btnEl.innerHTML = '다시 조회';
    }
  }

  /* ── DART 검색 ──────────────────────────────────────────────────────── */
  const search = async () => {
    const companyName = input.value.trim();
    if (!companyName) {
      result.innerHTML = '<p style="color:#f23645;">회사명을 입력하세요.</p>';
      return;
    }

    run.disabled = true;
    run.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 검색 중';
    result.innerHTML = '<p style="color:#6b7280;">DART 회사코드 목록을 확인하는 중입니다...</p>';

    try {
      const data = await api.dartCompanySearch({ company_name: companyName, limit: 12 });
      if (!data.results.length) {
        result.innerHTML = `<p style="color:#6b7280;">'${escapeHtml(companyName)}'에 해당하는 상장기업을 찾지 못했습니다.</p>`;
        return;
      }

      result.innerHTML = `
        <div class="dart-result-summary">
          <strong>${escapeHtml(data.query)}</strong> 검색 결과 ${data.count}건
          <span>${escapeHtml(data.source)}</span>
        </div>
        <div class="dart-result-grid">
          ${data.results.map(item => `
            <article class="dart-result-card" id="dart-card-${escapeHtml(item.corp_code)}">
              <div class="dart-result-title">${escapeHtml(item.corp_name)}</div>
              <div class="dart-ticker">${escapeHtml(item.display)}</div>
              <dl>
                <div><dt>DART 고유번호</dt><dd>${escapeHtml(item.corp_code)}</dd></div>
                <div><dt>종목코드</dt><dd>${escapeHtml(item.stock_code)}</dd></div>
                <div><dt>Yahoo 티커</dt><dd>${escapeHtml(item.ticker)}</dd></div>
                <div><dt>수정일</dt><dd>${escapeHtml(item.modify_date)}</dd></div>
              </dl>
              <div class="dart-copy-row">
                <button type="button" data-copy="${escapeHtml(item.ticker)}" class="copy-btn">
                  <i class="fa-regular fa-copy"></i> 티커 복사
                </button>
                <button type="button" data-copy="${escapeHtml(item.corp_code)}" class="copy-btn">
                  <i class="fa-regular fa-copy"></i> DART 번호 복사
                </button>
              </div>

              <!-- 파이낸셜 분석 토글 -->
              <div style="margin-top:10px;border-top:1px solid #e5e7eb;padding-top:10px;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <button type="button"
                    class="fin-load-btn"
                    data-ticker="${escapeHtml(item.ticker)}"
                    data-corp="${escapeHtml(item.corp_code)}"
                    data-period="annual"
                    style="padding:6px 14px;font-size:0.8rem;font-weight:600;
                           background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;">
                    <i class="fa-solid fa-chart-pie"></i> 파이낸셜 분석
                  </button>
                  <!-- 연간/분기 토글 -->
                  <div style="display:flex;border:1px solid #d1d5db;border-radius:6px;overflow:hidden;">
                    <button type="button" class="period-ann-btn"
                      data-corp="${escapeHtml(item.corp_code)}"
                      style="padding:5px 10px;font-size:0.75rem;background:#e0e7ff;color:#2563eb;border:none;cursor:pointer;">연간</button>
                    <button type="button" class="period-qtr-btn"
                      data-corp="${escapeHtml(item.corp_code)}"
                      style="padding:5px 10px;font-size:0.75rem;background:#fff;color:#6b7280;border:none;cursor:pointer;">분기별</button>
                  </div>
                </div>
                <div class="fin-panel" data-corp="${escapeHtml(item.corp_code)}" style="margin-top:8px;"></div>
              </div>
            </article>
          `).join('')}
        </div>
        <div class="dart-notes">
          ${data.notes.map(note => `<p>${escapeHtml(note)}</p>`).join('')}
        </div>
      `;

      /* copy buttons */
      result.querySelectorAll('.copy-btn').forEach(button => {
        button.addEventListener('click', async () => {
          await navigator.clipboard.writeText(button.dataset.copy || '');
          const original = button.innerHTML;
          button.innerHTML = '<i class="fa-solid fa-check"></i> 복사됨';
          setTimeout(() => { button.innerHTML = original; }, 900);
        });
      });

      /* 파이낸셜 분석 버튼 */
      result.querySelectorAll('.fin-load-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const ticker  = btn.dataset.ticker;
          const corp    = btn.dataset.corp;
          const period  = btn.dataset.period || 'annual';
          const panel   = result.querySelector(`.fin-panel[data-corp="${corp}"]`);
          if (!ticker || ticker === 'null') {
            panel.innerHTML = `<p style="color:#b45309;font-size:0.82rem;">Yahoo 티커를 확인할 수 없습니다. 직접
              <a href="#" onclick="navigate('company-financial');return false;"
                 style="color:#2563eb;text-decoration:underline;">기업 파이낸셜 분석</a> 메뉴에서 종목코드.KS 로 입력해 보세요.</p>`;
            return;
          }
          loadFinancials(ticker, period, panel, btn);
        });
      });

      /* 연간/분기 토글 */
      result.querySelectorAll('.period-ann-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const corp = btn.dataset.corp;
          btn.style.background = '#e0e7ff'; btn.style.color = '#2563eb';
          const qBtn = result.querySelector(`.period-qtr-btn[data-corp="${corp}"]`);
          if (qBtn) { qBtn.style.background = '#fff'; qBtn.style.color = '#6b7280'; }
          const loadBtn = result.querySelector(`.fin-load-btn[data-corp="${corp}"]`);
          if (loadBtn) loadBtn.dataset.period = 'annual';
        });
      });

      result.querySelectorAll('.period-qtr-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const corp = btn.dataset.corp;
          btn.style.background = '#e0e7ff'; btn.style.color = '#2563eb';
          const aBtn = result.querySelector(`.period-ann-btn[data-corp="${corp}"]`);
          if (aBtn) { aBtn.style.background = '#fff'; aBtn.style.color = '#6b7280'; }
          const loadBtn = result.querySelector(`.fin-load-btn[data-corp="${corp}"]`);
          if (loadBtn) loadBtn.dataset.period = 'quarterly';
        });
      });

    } catch (error) {
      result.innerHTML = `
        <div class="dart-error">
          <strong>검색 실패</strong>
          <p>${escapeHtml(error.message)}</p>
          <p>OpenDART 인증키를 발급받아 서버 실행 환경에 <code>DART_API_KEY</code>로 설정한 뒤 다시 실행하세요.</p>
        </div>`;
    } finally {
      run.disabled = false;
      run.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> 검색';
    }
  };

  run.addEventListener('click', search);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') search();
  });
}
