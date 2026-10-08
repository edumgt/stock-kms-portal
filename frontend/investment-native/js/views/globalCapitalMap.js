const CAPITALS = [
  {
    id: 'blackrock', type: 'asset', icon: 'fa-building-columns', tone: 'blue', name: 'BlackRock', country: '미국',
    amount: 'US$15.3조', basis: '운용자산(AUM) · 2026.06',
    description: '연금·개인·보험사 등 고객의 돈을 펀드와 ETF로 운용하는 자산운용사입니다. 회사가 소유한 투자원금과 고객자산을 같은 개념으로 보면 안 됩니다.',
    korea: 'iShares·지수 추종·리밸런싱을 통해 한국 대형주 수급에 영향을 줄 수 있습니다.',
    source: 'https://www.blackrock.com/corporate/newsroom/media/press-releases/blackrock-reports-second-quarter-2026',
  },
  {
    id: 'gpfg', type: 'sovereign', icon: 'fa-oil-well', tone: 'navy', name: '노르웨이 GPFG', country: '노르웨이',
    amount: 'US$2.11조', basis: '기금가치 · 2025.12',
    description: '석유·가스 수입을 미래 세대를 위해 해외에 장기 투자하는 국부펀드입니다. NBIM이 운용하며, 일반 개인연금 계좌와는 목적이 다릅니다.',
    korea: '한국 상장사 410곳 주식에 약 US$276억을 투자했다고 공개했습니다.',
    source: 'https://www.nbim.no/en/news-and-insights/consultations/2026/public-consultation-on-the-draft-amendment-to-the-korea-stewardship-code/',
  },
  {
    id: 'nps', type: 'pension', icon: 'fa-people-roof', tone: 'coral', name: '국민연금기금', country: '한국',
    amount: '₩1,670.7조', basis: '기금적립금 · 2026.04',
    description: '국민의 연금 지급을 위해 보험료와 운용수익을 장기 운용하는 공적연금입니다. 주식뿐 아니라 채권·대체투자·현금성 자산에도 분산합니다.',
    korea: '국내주식 비중은 25.1%이며, 자산배분과 리밸런싱도 매매의 중요한 이유입니다.',
    source: 'https://fund.nps.or.kr/oprtprcn/otln/getOHED0013M0.do',
  },
  {
    id: 'cpp', type: 'pension', icon: 'fa-leaf', tone: 'green', name: 'CPP Investments', country: '캐나다',
    amount: 'C$7,144억', basis: '순자산 · 2025.03',
    description: '캐나다 공적연금(CPP)의 투자 조직입니다. 연금 지급 능력을 뒷받침하기 위해 전 세계 주식·채권·사모·인프라에 장기 투자합니다.',
    korea: '한국 투자도 전체 글로벌 자산배분과 위험 관리의 일부로 이뤄집니다.',
    source: 'https://www.cppinvestments.com/newsroom/cpp-investments-net-assets-total-714-4-billion-at-2025-fiscal-year-end/',
  },
  {
    id: 'temasek', type: 'state', icon: 'fa-landmark', tone: 'purple', name: 'Temasek', country: '싱가포르',
    amount: 'S$5,180억', basis: '순포트폴리오가치 · 2026.03',
    description: '싱가포르 정부가 소유한 글로벌 투자회사입니다. GIC처럼 외환보유액을 위탁운용하는 펀드가 아니라 자기자산을 소유·운용하는 상업적 투자회사입니다.',
    korea: '직접투자·펀드·장기 지분투자의 형태로 한국 기업과 산업을 살필 수 있습니다.',
    source: 'https://www.temasek.com.sg/en/our-financials/portfolio-performance',
  },
  {
    id: 'gic', type: 'sovereign', icon: 'fa-shield-halved', tone: 'teal', name: 'GIC', country: '싱가포르',
    amount: '총액 비공개', basis: '정부 외환보유액 장기 운용',
    description: '싱가포르 정부 준비자산을 장기 실질수익 목표로 운용하는 기관입니다. 국가 준비자산 규모가 드러나는 것을 막기 위해 운용자산 총액은 공개하지 않습니다.',
    korea: '개별 거래보다 장기 글로벌 자산배분의 관점에서 해석해야 합니다.',
    source: 'https://www.gic.com.sg/who-we-are/faqs/',
  },
];

const TYPE_LABELS = { all: '전체', sovereign: '국부펀드', pension: '공적연금', state: '정부 소유 투자회사', asset: '자산운용사' };

function profileCard(item) {
  return `<button type="button" class="capital-profile ${item.tone}" data-capital="${item.id}" data-type="${item.type}" aria-pressed="false">
    <span class="capital-profile-icon"><i class="fa-solid ${item.icon}"></i></span>
    <span class="capital-profile-top"><em>${TYPE_LABELS[item.type]}</em><small>${item.country}</small></span>
    <strong>${item.name}</strong><b>${item.amount}</b><small class="capital-profile-basis">${item.basis}</small>
  </button>`;
}

export function globalCapitalMapView(container) {
  container.innerHTML = `
    <section class="global-capital-page">
      <header class="global-capital-hero">
        <div><span class="global-capital-eyebrow"><i class="fa-solid fa-globe"></i> LONG-TERM CAPITAL ATLAS</span><h1>세계 거대 자금의 지도</h1><p>국부펀드·공적연금·정부 투자회사·자산운용사는 이름이 비슷해도 돈의 주인과 투자 방식이 다릅니다.</p></div>
        <div class="global-capital-hero-stat"><span>한국에서 확인할 질문</span><strong>누구의 돈인가?</strong><small>보유 목적과 리밸런싱 여부를 함께 봅니다.</small></div>
      </header>

      <section class="capital-warning"><i class="fa-solid fa-circle-info"></i><p><b>같은 ‘규모’가 아닙니다.</b> 블랙록의 AUM은 고객자산 운용액이고, 국부펀드·연기금의 숫자는 기금 또는 순자산입니다. 통화·기준일·회계도 달라 한 줄 순위표로 단정하지 않았습니다.</p></section>

      <div class="capital-type-tabs" role="tablist" aria-label="기관 유형 필터">${Object.entries(TYPE_LABELS).map(([type, label]) => `<button type="button" role="tab" data-type-filter="${type}" aria-selected="${type === 'all'}">${label}</button>`).join('')}</div>

      <div class="global-capital-layout">
        <section class="capital-map-panel">
          <div class="capital-panel-head"><div><h2>자금의 종류와 공개 규모</h2><p>카드를 선택하면 자금의 성격과 한국 시장에서의 읽는 법을 확인할 수 있습니다.</p></div><span id="capital-visible-count">${CAPITALS.length}개 기관</span></div>
          <div class="capital-orbit" aria-label="대형 장기자금 인포그래픽">
            <div class="capital-orbit-core"><i class="fa-solid fa-chart-line"></i><strong>장기 자금</strong><small>소유자·목적·규칙</small></div>
            <div class="capital-orbit-ring ring-one"></div><div class="capital-orbit-ring ring-two"></div>
            <div class="capital-profiles">${CAPITALS.map(profileCard).join('')}</div>
          </div>
        </section>
        <aside class="capital-detail" id="capital-detail" aria-live="polite"></aside>
      </div>

      <section class="capital-flow-panel">
        <div class="capital-panel-head"><div><h2>한국 주식시장까지 닿는 경로</h2><p>거대 기관의 거래가 곧바로 한 종목의 ‘매수 신호’가 되지는 않는 이유입니다.</p></div></div>
        <div class="capital-flow"><article><i class="fa-solid fa-wallet"></i><b>돈의 주인</b><span>국가·가입자·고객</span></article><i class="fa-solid fa-arrow-right-long"></i><article><i class="fa-solid fa-scale-balanced"></i><b>운용 규칙</b><span>자산배분·위험 한도·지수</span></article><i class="fa-solid fa-arrow-right-long"></i><article><i class="fa-solid fa-arrow-right-arrow-left"></i><b>실제 거래</b><span>직접투자·ETF·리밸런싱</span></article><i class="fa-solid fa-arrow-right-long"></i><article class="impact"><i class="fa-solid fa-chart-column"></i><b>한국 시장</b><span>대형주 수급·공시·의결권</span></article></div>
      </section>

      <section class="capital-impact-grid">
        <article><span class="impact-no">01</span><h3>5% 공시는 출발점</h3><p>대량보유 공시는 보유 사실을 알려 주지만, 경영권 인수나 주가 상승을 뜻하지는 않습니다. 공시의 보유 목적을 먼저 확인하세요.</p></article>
        <article><span class="impact-no">02</span><h3>지수 리밸런싱은 기계적일 수 있음</h3><p>한국 비중이나 주가가 바뀌면 펀드는 목표 비중을 맞추기 위해 사고팔 수 있습니다. 기업 실적 판단과 별개일 수 있습니다.</p></article>
        <article><span class="impact-no">03</span><h3>장기 자금도 위험을 줄입니다</h3><p>국부펀드·연기금도 환율, 지정학, 유동성, 밸류에이션에 따라 비중을 조정합니다. ‘장기’가 ‘절대 팔지 않음’을 뜻하지는 않습니다.</p></article>
      </section>

      <footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>
    </section>`;

  let selectedId = 'gpfg';
  let selectedType = 'all';
  const detail = container.querySelector('#capital-detail');

  function renderDetail() {
    const item = CAPITALS.find((capital) => capital.id === selectedId) || CAPITALS[0];
    detail.innerHTML = `<div class="capital-detail-type ${item.tone}"><i class="fa-solid ${item.icon}"></i> ${TYPE_LABELS[item.type]}</div><h2>${item.name}</h2><div class="capital-detail-amount"><strong>${item.amount}</strong><span>${item.basis}</span></div><p>${item.description}</p><div class="capital-korea-note"><i class="fa-solid fa-flag"></i><div><b>한국 시장에서</b><span>${item.korea}</span></div></div><a href="${item.source}" target="_blank" rel="noreferrer">공식 출처 열기 <i class="fa-solid fa-arrow-up-right-from-square"></i></a>`;
    container.querySelectorAll('[data-capital]').forEach((button) => {
      const active = button.dataset.capital === item.id;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function applyFilter() {
    let count = 0;
    container.querySelectorAll('[data-capital]').forEach((card) => {
      const visible = selectedType === 'all' || card.dataset.type === selectedType;
      card.hidden = !visible;
      if (visible) count += 1;
    });
    container.querySelector('#capital-visible-count').textContent = `${count}개 기관`;
    const currentVisible = container.querySelector(`[data-capital="${selectedId}"]`);
    if (!currentVisible || currentVisible.hidden) selectedId = CAPITALS.find((item) => selectedType === 'all' || item.type === selectedType).id;
    renderDetail();
  }

  container.querySelectorAll('[data-capital]').forEach((card) => card.addEventListener('click', () => { selectedId = card.dataset.capital; renderDetail(); }));
  container.querySelectorAll('[data-type-filter]').forEach((tab) => tab.addEventListener('click', () => {
    selectedType = tab.dataset.typeFilter;
    container.querySelectorAll('[data-type-filter]').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
    applyFilter();
  }));
  renderDetail();
}
