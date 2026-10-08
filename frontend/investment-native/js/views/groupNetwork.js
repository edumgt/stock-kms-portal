import { api } from '../api.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMarketCap(won) {
  if (!won) return '–';
  const trillion = won / 1e12;
  if (trillion >= 1) return `${trillion.toFixed(2)}조`;
  const billion = won / 1e8;
  return `${billion.toFixed(0)}억`;
}

function formatPrice(won) {
  if (!won) return '–';
  return won.toLocaleString('ko-KR') + '원';
}

const PRESET_GROUPS = [
  '삼성', 'SK', 'LG', '현대', '롯데', '포스코', '한화', 'GS',
  'KT', '두산', 'CJ', '신세계', '한진', '아모레', '카카오', '네이버',
];

export function groupNetworkView(container) {
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-weight:700; color:#131722; margin-bottom:8px;">
        <i class="fa-solid fa-sitemap"></i> 그룹사 상장 계열사 네트워크
      </h1>
      <p style="font-size:0.88rem; color:#6b7280; line-height:1.65;">
        대기업 그룹명 또는 키워드를 입력하면 해당 이름을 포함한 상장 계열사·자회사를 시가총액 순으로 보여줍니다.<br>
        데이터 출처: OpenDART 회사코드 목록 &amp; 한국거래소(pykrx).
      </p>
    </div>

    <!-- 검색 패널 -->
    <section style="background:#fff; border:1px solid #d9e1ec; border-radius:10px; padding:20px 24px; margin-bottom:20px;">
      <!-- 프리셋 버튼 -->
      <div style="margin-bottom:14px;">
        <div style="font-size:0.78rem; color:#6b7280; margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:.04em;">
          주요 그룹 바로가기
        </div>
        <div id="gn-presets" style="display:flex; flex-wrap:wrap; gap:6px;">
          ${PRESET_GROUPS.map(g => `
            <button type="button" class="gn-preset-btn" data-group="${escapeHtml(g)}"
              style="padding:4px 12px; border-radius:20px; border:1px solid #d9e1ec;
                     background:#f8fafc; font-size:0.82rem; color:#374151; cursor:pointer;
                     transition:background .15s, border-color .15s;">
              ${escapeHtml(g)}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- 입력 행 -->
      <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
        <div style="flex:1; min-width:220px;">
          <label style="display:block; font-size:0.8rem; font-weight:600; color:#374151; margin-bottom:5px;">
            그룹명 / 키워드
          </label>
          <input id="gn-input" type="text" value="삼성"
            placeholder="예: 삼성, SK, 현대, LG …"
            style="width:100%; padding:9px 13px; border:1px solid #d9e1ec; border-radius:8px;
                   font-size:0.95rem; outline:none;" />
        </div>
        <button id="gn-run"
          style="padding:9px 22px; background:#2962ff; color:#fff; border:none; border-radius:8px;
                 font-size:0.9rem; font-weight:600; white-space:nowrap; transition:background .15s;">
          <i class="fa-solid fa-magnifying-glass"></i> 검색
        </button>
      </div>
      <p style="font-size:0.78rem; color:#9ca3af; margin-top:10px; margin-bottom:0;">
        서버 환경변수 <code>DART_API_KEY</code>가 설정되어 있어야 하며, 시가총액 조회에는 KRX 서버 연결이 필요합니다.
      </p>
    </section>

    <!-- 결과 영역 -->
    <div id="gn-result"></div>
  `;

  const input   = container.querySelector('#gn-input');
  const runBtn  = container.querySelector('#gn-run');
  const result  = container.querySelector('#gn-result');
  const presets = container.querySelector('#gn-presets');

  // ── 프리셋 버튼 hover effect
  presets.querySelectorAll('.gn-preset-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#eef4ff';
      btn.style.borderColor = '#2962ff';
      btn.style.color = '#2962ff';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#f8fafc';
      btn.style.borderColor = '#d9e1ec';
      btn.style.color = '#374151';
    });
    btn.addEventListener('click', () => {
      input.value = btn.dataset.group;
      search();
    });
  });

  // ── 검색 실행
  const search = async () => {
    const groupName = input.value.trim();
    if (!groupName) {
      result.innerHTML = '<p style="color:#f23645;">그룹명을 입력하세요.</p>';
      return;
    }

    runBtn.disabled = true;
    runBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 조회 중…';
    result.innerHTML = `
      <div style="padding:32px; text-align:center; color:#6b7280; font-size:0.9rem;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem; color:#2962ff; display:block; margin-bottom:12px;"></i>
        DART 회사코드 목록 및 KRX 시장 데이터를 조회하는 중입니다…
      </div>`;

    try {
      const data = await api.groupNetwork({ group_name: groupName, limit: 80 });

      if (!data.results || data.results.length === 0) {
        result.innerHTML = `
          <div style="padding:24px; background:#fff; border:1px solid #d9e1ec; border-radius:10px; color:#6b7280; text-align:center;">
            <i class="fa-solid fa-circle-info" style="font-size:1.4rem; margin-bottom:10px; display:block;"></i>
            <strong>'${escapeHtml(groupName)}'</strong> 키워드를 포함한 상장기업을 찾지 못했습니다.<br>
            다른 키워드로 검색해보세요.
          </div>`;
        return;
      }

      // ── 탭 필터 상태
      let activeFilter = '전체';

      const render = (filter) => {
        activeFilter = filter;
        const filtered = filter === '전체'
          ? data.results
          : data.results.filter(r => r.market === filter);

        const tabs = ['전체', 'KOSPI', 'KOSDAQ', '기타'];
        const tabHtml = tabs.map(t => {
          const cnt = t === '전체' ? data.results.length
            : data.results.filter(r => r.market === t).length;
          const active = t === activeFilter;
          return `<button class="gn-tab" data-tab="${escapeHtml(t)}"
            style="padding:6px 16px; border-radius:20px; border:1px solid ${active ? '#2962ff' : '#d9e1ec'};
                   background:${active ? '#2962ff' : '#fff'}; color:${active ? '#fff' : '#374151'};
                   font-size:0.82rem; font-weight:600; cursor:pointer;">
            ${escapeHtml(t)} <span style="opacity:.75;">${cnt}</span>
          </button>`;
        }).join('');

        const cardHtml = filtered.map(item => {
          const mktColor = item.market === 'KOSPI' ? '#1d4ed8'
            : item.market === 'KOSDAQ' ? '#059669' : '#6b7280';
          const mcap = formatMarketCap(item.market_cap);
          const price = formatPrice(item.close);

          return `
            <article style="background:#fff; border:1px solid #d9e1ec; border-radius:10px;
                            padding:16px 18px; display:flex; flex-direction:column; gap:10px;
                            transition:box-shadow .15s; cursor:default;"
              onmouseenter="this.style.boxShadow='0 4px 18px rgba(41,98,255,.12)'"
              onmouseleave="this.style.boxShadow='none'">

              <!-- 헤더 -->
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
                <div style="font-size:1rem; font-weight:700; color:#131722; line-height:1.35;">
                  ${escapeHtml(item.corp_name)}
                </div>
                <span style="flex-shrink:0; padding:2px 8px; border-radius:12px; font-size:0.72rem;
                             font-weight:700; color:#fff; background:${mktColor};">
                  ${escapeHtml(item.market)}
                </span>
              </div>

              <!-- 종목코드 -->
              <div style="font-size:0.82rem; color:#2962ff; font-weight:600; font-family:monospace;">
                ${escapeHtml(item.stock_code)}
              </div>

              <!-- 시가총액 / 주가 -->
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                <div style="background:#f8fafc; border-radius:6px; padding:8px 10px;">
                  <div style="font-size:0.7rem; color:#6b7280; margin-bottom:2px;">시가총액</div>
                  <div style="font-size:0.95rem; font-weight:700; color:#131722;">${escapeHtml(mcap)}</div>
                </div>
                <div style="background:#f8fafc; border-radius:6px; padding:8px 10px;">
                  <div style="font-size:0.7rem; color:#6b7280; margin-bottom:2px;">현재가</div>
                  <div style="font-size:0.95rem; font-weight:700; color:#131722;">${escapeHtml(price)}</div>
                </div>
              </div>

              <!-- DART 링크 -->
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <a href="${escapeHtml(item.dart_url)}" target="_new" rel="noopener noreferrer"
                  style="font-size:0.78rem; color:#2962ff; text-decoration:none; font-weight:600;
                         display:inline-flex; align-items:center; gap:4px;">
                  <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.72rem;"></i>
                  DART 공시
                </a>
                <span style="color:#d9e1ec;">|</span>
                <span style="font-size:0.75rem; color:#9ca3af;">DART코드: ${escapeHtml(item.corp_code)}</span>
              </div>
            </article>`;
        }).join('');

        result.innerHTML = `
          <!-- 요약 배너 -->
          <div style="background:linear-gradient(135deg,#1d4ed8 0%,#2962ff 60%,#0ea5e9 100%);
                      border-radius:10px; padding:20px 24px; margin-bottom:18px; color:#fff;">
            <div style="font-size:0.85rem; opacity:.85; margin-bottom:6px;">
              '<strong>${escapeHtml(data.query)}</strong>' 그룹 검색 결과 (OpenDART + KRX)
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:20px; margin-top:4px;">
              <div>
                <div style="font-size:1.6rem; font-weight:800;">${data.count}개</div>
                <div style="font-size:0.78rem; opacity:.8;">상장 계열사</div>
              </div>
              <div>
                <div style="font-size:1.6rem; font-weight:800;">${formatMarketCap(data.total_market_cap)}</div>
                <div style="font-size:0.78rem; opacity:.8;">합산 시가총액</div>
              </div>
              <div>
                <div style="font-size:1.6rem; font-weight:800;">${data.kospi_count}</div>
                <div style="font-size:0.78rem; opacity:.8;">KOSPI</div>
              </div>
              <div>
                <div style="font-size:1.6rem; font-weight:800;">${data.kosdaq_count}</div>
                <div style="font-size:0.78rem; opacity:.8;">KOSDAQ</div>
              </div>
            </div>
          </div>

          <!-- 탭 필터 -->
          <div id="gn-tabs" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
            ${tabHtml}
          </div>

          <!-- 카드 그리드 -->
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:14px;">
            ${cardHtml}
          </div>

          <!-- 출처 -->
          <p style="font-size:0.75rem; color:#9ca3af; margin-top:16px; text-align:right;">
            출처: ${escapeHtml(data.source)} · 시가총액 미조회 기업은 0으로 표시됩니다.
          </p>
        `;

        // 탭 클릭 이벤트 재등록
        result.querySelectorAll('.gn-tab').forEach(tab => {
          tab.addEventListener('click', () => render(tab.dataset.tab));
        });
      };

      render('전체');
    } catch (err) {
      result.innerHTML = `
        <div style="background:#fff; border:1px solid #fca5a5; border-radius:10px;
                    padding:20px 24px; color:#991b1b;">
          <strong><i class="fa-solid fa-triangle-exclamation"></i> 조회 실패</strong>
          <p style="margin:8px 0 0; font-size:0.88rem;">${escapeHtml(err.message)}</p>
          <p style="margin:6px 0 0; font-size:0.82rem; color:#b45309;">
            OpenDART 인증키(<code>DART_API_KEY</code>)를 서버에 설정한 뒤 다시 시도하세요.
          </p>
        </div>`;
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> 검색';
    }
  };

  runBtn.addEventListener('click', search);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  runBtn.addEventListener('mouseenter', () => { if (!runBtn.disabled) runBtn.style.background = '#1e53e5'; });
  runBtn.addEventListener('mouseleave', () => { if (!runBtn.disabled) runBtn.style.background = '#2962ff'; });
}
