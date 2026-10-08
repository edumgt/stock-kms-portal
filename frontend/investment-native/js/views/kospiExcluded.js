import { api } from '../api.js';

const PERIODS = [
  { value: "1mo", label: "1개월" },
  { value: "3mo", label: "3개월" },
  { value: "6mo", label: "6개월" },
  { value: "1y",  label: "1년" },
  { value: "2y",  label: "2년" },
  { value: "3y",  label: "3년" },
];

export function kospiExcludedView(container) {
  container.innerHTML = `
    <div style="margin-bottom:22px;">
      <h1 style="font-weight:800; color:var(--text); margin:0 0 6px; display:flex; align-items:center; gap:8px;">
        <i class="fa-solid fa-filter-circle-xmark" style="color:var(--primary);"></i>
        KOSPI 제외 지수 분석
      </h1>
      <p style="font-size:0.9rem; color:var(--text-muted); line-height:1.65; margin:0;">
        특정 섹터 또는 종목을 제외했을 때 KOSPI 지수가 어떻게 달라지는지 비교합니다.<br>
        예) 반도체 제외 → 삼성전자·SK하이닉스 비중(약 28.5%)을 제거한 나머지 시장의 성과를 확인합니다.
      </p>
    </div>

    <div id="kospi-ex-meta-loading" style="color:var(--text-muted); font-size:.9rem; padding:12px 0;">
      <i class="fa-solid fa-circle-notch fa-spin"></i> 종목 정보 불러오는 중...
    </div>
    <div id="kospi-ex-panel" style="display:none;">

      <!-- 섹터 제외 -->
      <div class="card" style="margin-bottom:16px;">
        <div class="card-title"><i class="fa-solid fa-layer-group"></i> 섹터 제외</div>
        <div id="sector-chips" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;"></div>
      </div>

      <!-- 개별 종목 제외 -->
      <div class="card" style="margin-bottom:16px;">
        <div class="card-title"><i class="fa-solid fa-building"></i> 개별 종목 제외</div>
        <div id="stock-chips" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;"></div>
      </div>

      <!-- 기간 + 실행 -->
      <div class="card" style="margin-bottom:20px;">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <span class="param-label" style="margin:0;">조회 기간</span>
          <div id="period-btns" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
          <button class="btn btn-primary" id="kospi-ex-run" style="margin-left:auto;">
            <i class="fa-solid fa-play"></i> 분석 실행
          </button>
        </div>
        <div id="excl-summary" style="margin-top:12px; font-size:.85rem; color:var(--text-muted); display:none;"></div>
      </div>

      <!-- 결과 -->
      <div id="kospi-ex-result"></div>
    </div>`;

  let selectedPeriod = '1y';
  let selectedSectors = new Set();
  let selectedStocks  = new Set();
  let allComponents = [];

  // 메타 데이터 로드
  api.kospiExMeta().then(meta => {
    document.getElementById('kospi-ex-meta-loading').style.display = 'none';
    document.getElementById('kospi-ex-panel').style.display = 'block';
    allComponents = meta.components;

    // 섹터 칩
    const sectorWrap = document.getElementById('sector-chips');
    meta.sectors.forEach(sector => {
      const sectorWeight = meta.components
        .filter(c => c.sector === sector)
        .reduce((s, c) => s + c.weight_pct, 0);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'excl-chip';
      chip.dataset.sector = sector;
      chip.innerHTML = `<span class="chip-name">${sector}</span><span class="chip-weight">${sectorWeight.toFixed(1)}%</span>`;
      chip.style.cssText = chipStyle(false);
      chip.addEventListener('click', () => {
        const active = selectedSectors.has(sector);
        if (active) selectedSectors.delete(sector);
        else selectedSectors.add(sector);
        chip.style.cssText = chipStyle(!active);
        updateExclSummary(meta.components);
      });
      sectorWrap.appendChild(chip);
    });

    // 종목 칩 (KOSPI 상위 구성종목)
    const stockWrap = document.getElementById('stock-chips');
    meta.components.forEach(comp => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.dataset.ticker = comp.ticker;
      chip.dataset.sector = comp.sector;
      chip.innerHTML = `<span class="chip-name">${comp.name}</span><span class="chip-weight">${comp.weight_pct.toFixed(1)}%</span>`;
      chip.style.cssText = chipStyle(false);
      chip.addEventListener('click', () => {
        const active = selectedStocks.has(comp.ticker);
        if (active) selectedStocks.delete(comp.ticker);
        else selectedStocks.add(comp.ticker);
        chip.style.cssText = chipStyle(!active);
        updateExclSummary(meta.components);
      });
      stockWrap.appendChild(chip);
    });

    // 기간 버튼
    const periodWrap = document.getElementById('period-btns');
    PERIODS.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'period-btn';
      btn.dataset.period = p.value;
      btn.textContent = p.label;
      btn.style.cssText = periodStyle(p.value === selectedPeriod);
      btn.addEventListener('click', () => {
        selectedPeriod = p.value;
        periodWrap.querySelectorAll('.period-btn').forEach(b => {
          b.style.cssText = periodStyle(b === btn);
        });
      });
      periodWrap.appendChild(btn);
    });

    // 실행
    document.getElementById('kospi-ex-run').addEventListener('click', runAnalysis);

  }).catch(err => {
    document.getElementById('kospi-ex-meta-loading').innerHTML =
      `<p style="color:var(--red);">종목 정보 로드 실패: ${err.message}</p>`;
  });

  function updateExclSummary(components) {
    const wrap = document.getElementById('excl-summary');
    const totalPct = computeTotalExclPct(components);
    if (selectedSectors.size === 0 && selectedStocks.size === 0) {
      wrap.style.display = 'none';
      return;
    }
    const parts = [];
    selectedSectors.forEach(s => parts.push(`섹터: ${s}`));
    selectedStocks.forEach(t => {
      const comp = components.find(c => c.ticker === t);
      if (comp) parts.push(comp.name);
    });
    wrap.style.display = 'block';
    wrap.innerHTML = `
      <i class="fa-solid fa-circle-info" style="color:var(--primary);"></i>
      제외 대상: <strong>${parts.slice(0,4).join(', ')}${parts.length>4 ? ` 외 ${parts.length-4}개` : ''}</strong>
      &nbsp;|&nbsp; 총 제외 비중: <strong style="color:var(--red);">약 ${totalPct.toFixed(1)}%</strong>`;
  }

  function computeTotalExclPct(components) {
    const seen = new Set();
    let total = 0;
    components.forEach(c => {
      if (selectedSectors.has(c.sector) || selectedStocks.has(c.ticker)) {
        if (!seen.has(c.ticker)) {
          seen.add(c.ticker);
          total += c.weight_pct;
        }
      }
    });
    return total;
  }

  async function runAnalysis() {
    const btn    = document.getElementById('kospi-ex-run');
    const result = document.getElementById('kospi-ex-result');

    if (selectedSectors.size === 0 && selectedStocks.size === 0) {
      result.innerHTML = `<div class="card" style="color:var(--text-muted); text-align:center; padding:24px;">
        <i class="fa-solid fa-hand-point-up" style="font-size:1.4rem; margin-bottom:8px; display:block;"></i>
        제외할 섹터 또는 종목을 1개 이상 선택하세요.</div>`;
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 분석 중...';
    result.innerHTML = `<div class="card" style="color:var(--text-muted); text-align:center; padding:32px;">
      <div class="spinner"></div>
      <p style="margin-top:12px; font-size:.9rem;">Yahoo Finance에서 데이터를 수신 중입니다 (10~30초 소요)</p>
    </div>`;

    try {
      const data = await api.kospiEx({
        exclude_tickers: [...selectedStocks],
        exclude_sectors:  [...selectedSectors],
        period: selectedPeriod,
      });

      let html = '';
      if (data.is_simulated) {
        html += `<div class="card" style="background:#fff7ed; border-color:#fed7aa; margin-bottom:16px; padding:12px 16px; display:flex; gap:10px; align-items:flex-start;">
          <i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b; margin-top:2px;"></i>
          <span style="font-size:.88rem; color:#7c2d12;">${data.warning}</span>
        </div>`;
      }

      // 통계 카드
      const s = data.stats;
      const adjRet  = s.adjusted.return_pct;
      const baseRet = s.kospi.return_pct;
      const diff    = adjRet - baseRet;
      html += `
        <div class="grid-3" style="margin-bottom:20px;">
          <div class="stat-box">
            <div class="stat-label"><i class="fa-solid fa-chart-line" style="color:var(--primary);"></i> KOSPI 수익률</div>
            <div class="stat-value" style="color:${baseRet>=0?'var(--green)':'var(--red)'};">
              ${baseRet>=0?'+':''}${baseRet.toFixed(2)}%
            </div>
            <div class="stat-sub">연변동성 ${s.kospi.annual_vol_pct.toFixed(1)}%</div>
          </div>
          <div class="stat-box">
            <div class="stat-label"><i class="fa-solid fa-filter-circle-xmark" style="color:var(--red);"></i> 제외 후 수익률</div>
            <div class="stat-value" style="color:${adjRet>=0?'var(--green)':'var(--red)'};">
              ${adjRet>=0?'+':''}${adjRet.toFixed(2)}%
            </div>
            <div class="stat-sub">연변동성 ${s.adjusted.annual_vol_pct.toFixed(1)}%</div>
          </div>
          <div class="stat-box">
            <div class="stat-label"><i class="fa-solid fa-arrows-up-down" style="color:#a855f7;"></i> 초과 성과 (제외 후 - KOSPI)</div>
            <div class="stat-value" style="color:${diff>=0?'var(--green)':'var(--red)'};">
              ${diff>=0?'+':''}${diff.toFixed(2)}%p
            </div>
            <div class="stat-sub">총 제외 비중 ${s.total_excl_weight.toFixed(1)}%</div>
          </div>
        </div>`;

      if (data.image) {
        html += `<div class="card" style="padding:16px; margin-bottom:20px;">
          <img src="${data.image}" style="width:100%; border-radius:8px;"/>
        </div>`;
      }

      // 제외 종목 테이블
      if (data.excluded.length > 0) {
        html += `
          <div class="card" style="margin-bottom:20px;">
            <div class="card-title"><i class="fa-solid fa-list-check"></i> 제외된 종목 목록</div>
            <div style="overflow-x:auto;">
              <table class="dart-table">
                <thead>
                  <tr>
                    <th>종목명</th>
                    <th>종목코드</th>
                    <th>섹터</th>
                    <th>KOSPI 추정 비중</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.excluded.map(e => `
                    <tr>
                      <td><strong>${e.name}</strong></td>
                      <td class="mono">${e.ticker}</td>
                      <td><span class="badge badge-blue">${e.sector}</span></td>
                      <td><strong>${e.weight_pct.toFixed(1)}%</strong></td>
                    </tr>`).join('')}
                  <tr style="background:var(--primary-light); font-weight:700;">
                    <td colspan="3" style="text-align:right; color:var(--primary-dark);">총 제외 비중</td>
                    <td style="color:var(--red); font-weight:800;">${s.total_excl_weight.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>`;
      }

      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<div class="card" style="background:var(--red-bg); border-color:#fca5a5;">
        <p style="color:var(--red); margin:0;"><i class="fa-solid fa-circle-exclamation"></i> 오류: ${e.message}</p>
      </div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-play"></i> 분석 실행';
    }
  }
}

function chipStyle(active) {
  return `
    display:inline-flex; align-items:center; gap:5px;
    padding:5px 12px; border-radius:99px; cursor:pointer;
    font-size:.82rem; font-weight:600;
    border: 1.5px solid ${active ? 'var(--primary)' : 'var(--border)'};
    background: ${active ? 'var(--primary)' : 'var(--surface-soft)'};
    color: ${active ? '#ffffff' : 'var(--text-muted)'};
    transition: all .15s;
  `;
}

function periodStyle(active) {
  return `
    padding:6px 14px; border-radius:var(--radius-sm);
    border: 1.5px solid ${active ? 'var(--primary)' : 'var(--border)'};
    background: ${active ? 'var(--primary)' : 'var(--surface-soft)'};
    color: ${active ? '#ffffff' : 'var(--text-muted)'};
    font-size:.82rem; font-weight:600; cursor:pointer; transition:all .15s;
  `;
}
