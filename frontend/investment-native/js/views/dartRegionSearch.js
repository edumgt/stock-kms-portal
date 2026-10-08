import { api } from '../api.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function corpClsLabel(cls) {
  switch (cls) {
    case 'Y': return 'KOSPI';
    case 'K': return 'KOSDAQ';
    case 'N': return 'KONEX';
    case 'E': return '기타';
    default:  return cls || '-';
  }
}

const REGION_PRESETS = [
  '서울특별시', '경기도', '부산광역시', '인천광역시',
  '대구광역시', '대전광역시', '광주광역시', '울산광역시',
  '세종특별자치시', '강원도', '충청북도', '충청남도',
  '전라북도', '전라남도', '경상북도', '경상남도', '제주도',
];

export function dartRegionSearchView(container) {
  container.innerHTML = `
    <div style="margin-bottom:28px;">
      <h1 style="font-weight:760; color:#131722; margin-bottom:8px;">
        <i class="fa-solid fa-location-dot"></i> DART 지역·종사자수 기업 조회
      </h1>
      <p style="font-size:0.88rem; color:#6b7280; line-height:1.65;">
        OpenDART에 등록된 상장기업을 지역과 종사자수 범위로 필터링하여 회사명·사업자번호 목록을 조회합니다.<br>
        <strong>최초 실행 시</strong> 전체 기업 정보를 일괄 로딩하므로 30 ~ 60초가 소요될 수 있습니다.
        이후 검색은 캐시를 사용해 즉시 응답합니다.
      </p>
    </div>

    <section class="dart-search-panel">
      <!-- 지역 프리셋 -->
      <div style="margin-bottom:14px;">
        <div class="param-label" style="margin-bottom:6px;">지역 빠른 선택</div>
        <div id="region-presets" style="display:flex; flex-wrap:wrap; gap:6px;">
          ${REGION_PRESETS.map(r => `
            <button type="button" class="preset-region-btn"
              data-region="${escapeHtml(r)}"
              style="padding:3px 11px; border-radius:20px; border:1px solid var(--border);
                     background:var(--surface-soft); font-size:0.78rem; color:#374151;
                     cursor:pointer; transition:background .15s, border-color .15s;">
              ${escapeHtml(r)}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- 검색 조건 -->
      <div class="dart-search-row">
        <div>
          <label class="param-label">지역 (주소 포함 검색)</label>
          <input id="dart-region"  type="text" value="서울특별시" class="param-input"
            placeholder="예: 서울특별시, 경기도" style="width:180px;" />
        </div>
        <div>
          <label class="param-label">최소 종사자수</label>
          <input id="dart-emp-min" type="number" class="param-input"
            placeholder="예: 100" style="width:120px;" min="0" />
        </div>
        <div>
          <label class="param-label">최대 종사자수</label>
          <input id="dart-emp-max" type="number" class="param-input"
            placeholder="예: 1000" style="width:120px;" min="0" />
        </div>
        <div>
          <label class="param-label">사업연도</label>
          <select id="dart-bsns-year" class="param-input" style="width:100px;">
            <option value="2024">2024</option>
            <option value="2023">2023</option>
            <option value="2022">2022</option>
            <option value="2021">2021</option>
          </select>
        </div>
        <div>
          <label class="param-label">최대 결과 수</label>
          <select id="dart-limit" class="param-input" style="width:90px;">
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        </div>
        <div style="display:flex; align-items:flex-end;">
          <button class="run-btn" id="dart-region-run">
            <i class="fa-solid fa-magnifying-glass"></i> 조회
          </button>
        </div>
      </div>

      <div class="dart-help">
        · 지역명은 DART 등록 주소에 포함되는지 여부로 검색합니다 (예: "서울특별시", "경기도 성남시").<br>
        · 종사자수 필터 적용 시 <strong>사업보고서(11011) 기준</strong>으로 추가 API 요청이 발생합니다.<br>
        · 서버 환경변수 <code>DART_API_KEY</code>가 설정되어 있어야 합니다.
      </div>

      <div id="dart-region-result" style="margin-top:18px;"></div>
    </section>
  `;

  const regionInput = container.querySelector('#dart-region');
  const empMinInput = container.querySelector('#dart-emp-min');
  const empMaxInput = container.querySelector('#dart-emp-max');
  const yearSelect  = container.querySelector('#dart-bsns-year');
  const limitSelect = container.querySelector('#dart-limit');
  const run         = container.querySelector('#dart-region-run');
  const result      = container.querySelector('#dart-region-result');

  // 지역 프리셋 클릭
  container.querySelector('#region-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-region-btn');
    if (!btn) return;
    regionInput.value = btn.dataset.region;
    container.querySelectorAll('.preset-region-btn').forEach(b => {
      b.style.background    = 'var(--surface-soft)';
      b.style.borderColor   = 'var(--border)';
      b.style.color         = '#374151';
      b.style.fontWeight    = '';
    });
    btn.style.background  = 'var(--primary-light)';
    btn.style.borderColor = 'var(--primary)';
    btn.style.color       = 'var(--primary)';
    btn.style.fontWeight  = '700';
  });

  const search = async () => {
    const region  = regionInput.value.trim();
    const empMin  = empMinInput.value !== '' ? parseInt(empMinInput.value, 10) : null;
    const empMax  = empMaxInput.value !== '' ? parseInt(empMaxInput.value, 10) : null;
    const bsnYear = yearSelect.value;
    const limit   = parseInt(limitSelect.value, 10);

    const useEmpFilter = empMin !== null || empMax !== null;

    run.disabled = true;
    run.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 조회 중';
    result.innerHTML = `
      <p style="color:#6b7280;">
        <i class="fa-solid fa-circle-notch fa-spin"></i>
        DART에서 기업 정보를 불러오는 중입니다.
        ${useEmpFilter ? '종사자수 필터 적용 중 — ' : ''}
        <strong>처음 실행 시 30~60초가 소요됩니다.</strong>
      </p>`;

    try {
      const data = await api.dartCompanyList({ region, emp_min: empMin, emp_max: empMax, bsns_year: bsnYear, limit });

      if (!data.results.length) {
        result.innerHTML = `<p style="color:#6b7280;">조건에 맞는 상장기업을 찾지 못했습니다.</p>`;
        return;
      }

      const empCondText = useEmpFilter
        ? ` · 종사자 ${empMin ?? ''}${empMin !== null && empMax !== null ? '~' : ''}${empMax ?? ''}명`
        : '';

      // CSV 데이터 생성
      const csvRows = [
        ['회사명', '사업자번호', '법인등록번호', '대표이사', '주소', '종목코드', '법인구분', '설립일', '종사자수(명)'],
        ...data.results.map(r => [
          r.corp_name, r.bizr_no, r.jurir_no, r.ceo_nm,
          r.adres, r.stock_code, corpClsLabel(r.corp_cls),
          r.est_dt, r.emp_count ?? '',
        ]),
      ];
      const csvContent = csvRows
        .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');

      result.innerHTML = `
        <div class="dart-result-summary">
          <span>
            <strong>${escapeHtml(data.region || '전체')}</strong>${escapeHtml(empCondText)}
            &nbsp;—&nbsp; 총 <strong>${data.total_matched}</strong>건 중
            <strong>${data.count}</strong>건 표시
          </span>
          <span>${escapeHtml(data.source)}</span>
        </div>
        <div style="margin-bottom:10px;">
          <button id="dart-csv-btn" class="copy-btn">
            <i class="fa-solid fa-file-csv"></i> CSV 다운로드
          </button>
        </div>
        <div style="overflow-x:auto;">
          <table class="dart-table">
            <thead>
              <tr>
                <th>#</th>
                <th>회사명</th>
                <th>사업자번호</th>
                <th>주소</th>
                <th>종목코드</th>
                <th>시장</th>
                <th>대표이사</th>
                ${useEmpFilter ? '<th style="text-align:right;">종사자수</th>' : ''}
                <th>DART</th>
              </tr>
            </thead>
            <tbody>
              ${data.results.map((item, idx) => `
                <tr>
                  <td style="color:var(--text-muted); font-size:.75rem;">${idx + 1}</td>
                  <td><strong>${escapeHtml(item.corp_name)}</strong></td>
                  <td class="mono">${escapeHtml(item.bizr_no || '–')}</td>
                  <td style="font-size:.77rem; color:#6b7280; max-width:220px;">${escapeHtml(item.adres || '–')}</td>
                  <td class="mono">${escapeHtml(item.stock_code || '–')}</td>
                  <td><span class="badge ${_mktBadge(item.corp_cls)}">${escapeHtml(corpClsLabel(item.corp_cls))}</span></td>
                  <td style="font-size:.78rem;">${escapeHtml(item.ceo_nm || '–')}</td>
                  ${useEmpFilter ? `<td style="text-align:right; font-weight:700;">${item.emp_count !== null ? item.emp_count.toLocaleString('ko-KR') : '–'}</td>` : ''}
                  <td>
                    <a href="https://dart.fss.or.kr/corp/main.do?corp_code=${escapeHtml(item.corp_code)}"
                       target="_new" rel="noopener"
                       style="color:var(--primary); font-size:.82rem; display:inline-flex; align-items:center; gap:3px;">
                      <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="dart-notes">
          <p>사업자번호·주소·대표이사는 DART 등록 정보 기준이며 실제와 다를 수 있습니다.</p>
          ${useEmpFilter ? `<p>종사자수는 ${escapeHtml(data.bsns_year)}년도 사업보고서(empSttus) 기준이며, 미공시 기업은 결과에서 제외됩니다.</p>` : ''}
        </div>
      `;

      result.querySelector('#dart-csv-btn')?.addEventListener('click', () => {
        const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `dart_${data.region || 'all'}_${bsnYear}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch (error) {
      result.innerHTML = `
        <div class="dart-error">
          <strong>조회 실패</strong>
          <p>${escapeHtml(error.message)}</p>
          <p>서버에 <code>DART_API_KEY</code> 환경변수가 설정되어 있는지 확인하세요.</p>
        </div>`;
    } finally {
      run.disabled = false;
      run.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> 조회';
    }
  };

  run.addEventListener('click', search);
  [regionInput, empMinInput, empMaxInput].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
  });
}

function _mktBadge(cls) {
  switch (cls) {
    case 'Y': return 'badge-blue';
    case 'K': return 'badge-green';
    default:  return 'badge-gray';
  }
}
