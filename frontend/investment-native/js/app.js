import { homeView }            from './views/home.js?v=20261008-footer-25px';
import { serverResourcesView } from './views/serverResources.js';
import { volumeCloudView }    from './views/volumeCloud.js';
import { sectorCloudView }    from './views/sectorCloud.js';
import { worldMarketsView }   from './views/worldMarkets.js';
import { assetClassesView }   from './views/assetClasses.js';
import { todayGainersView }   from './views/todayGainers.js';
import { todaySobujangView }  from './views/todaySobujang.js';
import { globalCapitalMapView } from './views/globalCapitalMap.js';
import { crossValidationView } from './views/crossValidation.js';
import { decisionBoundaryView } from './views/decisionBoundary.js';
import { randomForestView }    from './views/randomForest.js';
import { kmeansView }          from './views/kmeans.js';
import { svmView }             from './views/svm.js';
import { mlpView }             from './views/mlp.js';
import { linearRegressionView } from './views/linearRegression.js';
import { textClassifyView }    from './views/textClassify.js';
import { opencvView }          from './views/opencv.js';
import { cnnTimeseriesView }   from './views/cnnTimeseries.js';
import { lstmView }            from './views/lstm.js';
import { transformerView }     from './views/transformer.js';
import { backtestView }        from './views/backtest.js';
import { quantView }           from './views/quant.js';
import { portfolioView }       from './views/portfolio.js';
import { portfolioCombinationView } from './views/portfolioCombination.js';
import { portfolioGuideView } from './views/portfolioGuide.js';
import { portfolioRegimeView } from './views/portfolioRegime.js';
import { portfolioSimulationView } from './views/portfolioSimulation.js';
import { pipelineView }        from './views/pipeline.js';
import { riskView }            from './views/risk.js';
import { huggingfaceView }     from './views/huggingface.js';
import { macroRealtimeView }    from './views/macroRealtime.js';
import { kospiExcludedView }   from './views/kospiExcluded.js';
import { macroSimulationView }  from './views/macroSimulation.js';
import { industryAnalysisView } from './views/industryAnalysis.js';
import { financialStatementView } from './views/financialStatement.js';
import { dartCompanySearchView } from './views/dartCompanySearch.js';
import { dartRegionSearchView }  from './views/dartRegionSearch.js';
import { groupNetworkView }      from './views/groupNetwork.js';
import { valuationView }        from './views/valuation.js';
import { technicalChartView }  from './views/technicalChart.js';
import { financialKnowledgeView } from './views/financialKnowledge.js';
import { investmentTreeView }   from './views/investmentTree.js';
import { quizHomeView, quizDayView } from './views/quiz.js';
import { vocabularyExamView } from './views/vocabularyExam.js';
import { ragChatView } from './views/ragChat.js';
import { llmBenchView } from './views/llmBenchView.js';
import { companyFinancialView } from './views/companyFinancial.js';
// 학습 화면 오류 수정본을 기존 ES 모듈 캐시와 분리해 항상 새로 불러온다.
import { learnView }            from './views/learn.js?v=20261008-footer-25px';
import { taxAccountingView }         from './views/taxAccounting.js';
import { dartFinancialAnalysisView } from './views/dartFinancialAnalysis.js';
import { api }                 from './api.js';
import { LEARN_DOCS }          from './data/learnDocs.js';
import { restoreFormState, saveFormState } from './utils/localState.js';
import { initChartDrawingOffcanvas } from './utils/chartDrawingOffcanvas.js';
import { initAuth, recordUsage } from './auth.js';

if (new URLSearchParams(window.location.search).get('embedded') === '1') {
  document.documentElement.classList.add('embedded-dashboard');
}

const app        = document.getElementById('app');
const breadcrumb = document.getElementById('breadcrumb');
const TOPBAR_MARKETS = ['^KS11', '^IXIC', 'KRW=X'];
const TOPBAR_REFRESH_MS = 30_000;
const VISITOR_HEARTBEAT_MS = 30_000;
const VISITOR_ID_KEY = 'investment_analysis_visitor_id';

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => reject(new Error('캡처 도구를 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });
}

function initScreenCaptureAssistant() {
  const fab = document.getElementById('screen-capture-fab');
  const panel = document.getElementById('screen-capture-panel');
  if (!fab || !panel) return;
  const preview = panel.querySelector('[data-capture-preview]');
  const status = panel.querySelector('[data-capture-status]');
  const service = panel.querySelector('[data-capture-service]');
  let imageBlob;
  let previewUrl;

  const copyImage = async () => {
    if (!imageBlob || !navigator.clipboard?.write || !window.ClipboardItem) throw new Error('이 브라우저에서는 이미지 클립보드 복사를 지원하지 않습니다.');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })]);
  };
  const capture = async () => {
    fab.disabled = true;
    fab.classList.add('is-capturing');
    status.textContent = '현재 화면을 캡처하고 있습니다…';
    panel.hidden = false;
    try {
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(document.body, {
        backgroundColor: '#f8fafc',
        scale: Math.min(window.devicePixelRatio || 1, 2),
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        ignoreElements: (element) => element.dataset?.html2canvasIgnore === 'true',
      });
      imageBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!imageBlob) throw new Error('이미지를 만들지 못했습니다.');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(imageBlob);
      preview.src = previewUrl;
      try {
        await copyImage();
        status.textContent = 'PNG를 클립보드에 복사했습니다. GPT 창에서 Ctrl/⌘+V로 붙여넣으세요.';
      } catch {
        status.textContent = '캡처가 준비되었습니다. 아래 버튼으로 PNG를 저장하거나 다시 복사하세요.';
      }
    } catch (error) {
      panel.hidden = false;
      status.textContent = error.message || '화면 캡처에 실패했습니다.';
    } finally {
      fab.disabled = false;
      fab.classList.remove('is-capturing');
    }
  };

  fab.addEventListener('click', capture);
  panel.querySelector('[data-capture-close]').addEventListener('click', () => { panel.hidden = true; });
  panel.querySelector('[data-capture-copy]').addEventListener('click', async () => {
    try { await copyImage(); status.textContent = 'PNG를 클립보드에 다시 복사했습니다. GPT 창에서 Ctrl/⌘+V로 붙여넣으세요.'; }
    catch (error) { status.textContent = error.message; }
  });
  panel.querySelector('[data-capture-download]').addEventListener('click', () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `investment-analysis-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  });
  panel.querySelector('[data-capture-open]').addEventListener('click', () => {
    if (!imageBlob) { status.textContent = '먼저 캡처하기 버튼을 눌러 이미지를 준비해 주세요.'; return; }
    window.open(service.value, '_blank', 'noopener,noreferrer');
    status.textContent = 'GPT 웹을 열었습니다. 새 창에서 Ctrl/⌘+V로 이미지를 붙여넣고 질문하세요.';
  });
}

function initGlobalSearch() {
  const form = document.getElementById('global-search');
  const input = document.getElementById('global-search-input');
  const results = document.getElementById('global-search-results');
  if (!form || !input || !results) return;
  let timer; let activeRequest = 0;
  const close = () => { results.hidden = true; results.replaceChildren(); };
  const renderState = (text) => { results.hidden = false; results.replaceChildren(); const state = document.createElement('p'); state.className = 'global-search-state'; state.textContent = text; results.append(state); };
  const search = async () => {
    const query = input.value.trim(); if (query.length < 2) { close(); return; }
    const requestId = ++activeRequest; renderState('문서를 찾는 중입니다…');
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`); const data = await response.json(); if (!response.ok) throw new Error(data.detail || '검색 결과를 불러오지 못했습니다.'); if (requestId !== activeRequest) return;
      results.replaceChildren(); results.hidden = false;
      if (!data.hits?.length) { renderState('일치하는 학습 문서를 찾지 못했습니다.'); return; }
      data.hits.forEach((hit) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'global-search-result'; const title = document.createElement('strong'); title.textContent = hit.title; const snippet = document.createElement('p'); snippet.textContent = hit.snippet || '문서에서 관련 내용을 확인하세요.'; button.append(title, snippet); button.addEventListener('click', () => { close(); input.value = ''; navigate(`learn-${hit.doc_id}`); }); results.append(button); });
    } catch (error) { if (requestId === activeRequest) renderState(error.message || '검색에 실패했습니다.'); }
  };
  input.addEventListener('input', () => { window.clearTimeout(timer); timer = window.setTimeout(search, 180); });
  form.addEventListener('submit', (event) => { event.preventDefault(); search(); });
  document.addEventListener('click', (event) => { if (!form.contains(event.target)) close(); });
  input.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
}

const learnRoutes = Object.fromEntries(
  LEARN_DOCS.map((doc) => [
    `learn-${doc.id}`,
    { label: `학습 · ${doc.label}`, render: () => learnView(app, doc.id) },
  ]),
);

const quizDayRoutes = Object.fromEntries(
  Array.from({ length: 5 }, (_, i) => i + 1).map(d => [
    `quiz-day-${d}`,
    { label: `주식 ${d} 퀴즈`, render: () => quizDayView(app, d, navigate) },
  ])
);

const routes = {
  'home':              { label: '대시보드',               render: () => homeView(app, navigate) },
  'server-resources':  { label: '서버 리소스',             render: () => serverResourcesView(app) },
  'volume-cloud':     { label: '거래량 클라우드',          render: () => volumeCloudView(app) },
  'sector-cloud':     { label: '섹터별 클라우드',          render: () => sectorCloudView(app) },
  'world-markets':    { label: '세계증시현황',              render: () => worldMarketsView(app) },
  'asset-classes':    { label: '다양한 기초자산 차트',       render: () => assetClassesView(app) },
  'today-gainers':    { label: '금일 상승종목',              render: () => todayGainersView(app) },
  'today-sobujang':   { label: '금일 소부장 종목',           render: () => todaySobujangView(app) },
  'global-capital-map': { label: '세계 거대자금 지도',       render: () => globalCapitalMapView(app) },
  'cross-validation':  { label: 'Cross Validation',       render: () => crossValidationView(app) },
  'decision-boundary': { label: 'Decision Boundary',      render: () => decisionBoundaryView(app) },
  'random-forest':     { label: 'Random Forest',          render: () => randomForestView(app) },
  'kmeans':            { label: 'KMeans 클러스터링',       render: () => kmeansView(app) },
  'svm':               { label: 'SVM 분류기',             render: () => svmView(app) },
  'mlp':               { label: 'MLP 신경망',             render: () => mlpView(app) },
  'linear-regression': { label: '선형 회귀',              render: () => linearRegressionView(app) },
  'text-classify':     { label: '텍스트 분류 (TF-IDF)',   render: () => textClassifyView(app) },
  'opencv':            { label: 'OpenCV 애니메이션',      render: () => opencvView(app) },
  'cnn-timeseries':    { label: '1D CNN 시계열',          render: () => cnnTimeseriesView(app) },
  'lstm':              { label: 'LSTM 예측기',            render: () => lstmView(app) },
  'transformer':       { label: 'Transformer',            render: () => transformerView(app) },
  'backtest':          { label: '백테스트 엔진',          render: () => backtestView(app) },
  'quant-lean':        { label: 'Quant · LEAN 백테스트 리포트', render: () => quantView(app) },
  'portfolio':         { label: '포트폴리오 최적화',      render: () => portfolioView(app) },
  'portfolio-combination': { label: '포트폴리오 조합',    render: () => portfolioCombinationView(app) },
  'portfolio-guide':       { label: '포트폴리오 추천',    render: () => portfolioGuideView(app) },
  'portfolio-regime':      { label: '자산배분 위험선호도(R1~R5)', render: () => portfolioRegimeView(app) },
  'portfolio-simulation':  { label: '포트폴리오 시뮬레이션', render: () => portfolioSimulationView(app) },
  'pipeline':          { label: '퀀트 파이프라인',        render: () => pipelineView(app) },
  'risk':              { label: '리스크 분석 (VaR)',       render: () => riskView(app) },
  'huggingface':       { label: 'HuggingFace 이미지 생성', render: () => huggingfaceView(app) },
  'macro-realtime':    { label: '거시경제현황 1 (실시간)',    render: () => macroRealtimeView(app) },
  'macro-simulation':  { label: '거시경제현황 2 (시뮬레이션)', render: () => macroSimulationView(app) },
  'kospi-excluded':    { label: 'KOSPI 제외 지수 분석',       render: () => kospiExcludedView(app) },
  'industry-analysis': { label: '산업 경쟁력 분석',           render: () => industryAnalysisView(app) },
  'company-financial':   { label: '기업 파이낸셜 분석',          render: () => companyFinancialView(app) },
  'financial-statement': { label: '재무제표분석',              render: () => financialStatementView(app) },
  'dart-company-search': { label: 'DART 상장기업 검색',        render: () => dartCompanySearchView(app) },
  'dart-region-search':  { label: 'DART 지역·종사자수 조회',    render: () => dartRegionSearchView(app) },
  'group-network':       { label: '그룹사 계열사 네트워크',      render: () => groupNetworkView(app) },
  'valuation':           { label: '밸류에이션 실습',            render: () => valuationView(app) },
  'technical-chart':     { label: '기술적 분석 실습',            render: () => technicalChartView(app) },
  'financial-knowledge': { label: '금융상품·자산배분',           render: () => financialKnowledgeView(app) },
  'investment-tree':     { label: '투자 성향 분석',              render: () => investmentTreeView(app) },
  'tax-accounting':              { label: '세무·회계 시뮬레이션',         render: () => taxAccountingView(app) },
  'dart-financial-analysis':    { label: 'DART 재무 AI 분석',             render: () => dartFinancialAnalysisView(app) },
  'quiz-home':           { label: '퀴즈 · 통합 모의고사',        render: () => quizHomeView(app, navigate) },
  'vocabulary-exam':     { label: '퀴즈 · 단어장 30문제 시험',   render: () => vocabularyExamView(app, navigate) },
  'rag-chat':            { label: '문서 검색 채팅',              render: () => ragChatView(app) },
  'llm-bench':           { label: 'LLM 서빙 방식 비교(AWS)',     render: () => llmBenchView(app) },
  ...quizDayRoutes,
  ...learnRoutes,
};

const PRACTICE_GUIDES = {
  'macro-realtime': {
    technique: '실시간 지표 비교',
    text: '금리·유가·환율처럼 경제의 온도를 알려주는 숫자를 한곳에 모아 봅니다. 여러 온도계를 함께 보면 시장이 뜨거운지, 식는지 더 쉽게 짐작할 수 있습니다.',
  },
  'macro-simulation': {
    technique: 'GBM 확률 시뮬레이션',
    text: '주가와 경제지표가 매일 조금씩 흔들린다고 가정하고, 가능한 미래 길을 여러 번 그려 보는 방법입니다. 하나의 정답을 맞히기보다 어떤 상황이 나올 수 있는지 연습합니다.',
  },
  'kospi-excluded': {
    technique: '비교 지수 분석',
    text: '큰 종목이나 특정 산업을 빼고 지수를 다시 계산해 봅니다. 마치 과일 바구니에서 사과만 빼 보고 전체 맛이 얼마나 달라지는지 확인하는 것과 같습니다.',
  },
  'industry-analysis': {
    technique: 'Porter 5 Forces와 비교 분석',
    text: '한 산업에서 누가 힘이 센지, 새 경쟁자가 들어오기 쉬운지 같은 질문을 점수와 표로 정리합니다. 회사 하나만 보지 않고 그 회사가 뛰는 운동장을 함께 살펴보는 방법입니다.',
  },
  'dart-financial-analysis': {
    technique: '재무비율 계산과 AI 요약',
    text: '공시 속 숫자에서 매출, 빚, 이익의 관계를 먼저 계산하고 AI가 핵심 흐름을 글로 정리합니다. AI의 의견은 힌트이므로 원래 숫자와 공시도 함께 확인하는 것이 중요합니다.',
  },
  'dart-company-search': {
    technique: '기업명 검색·정규화',
    text: '입력한 회사 이름에서 띄어쓰기 같은 작은 차이를 줄이고, 비슷한 이름의 상장회사를 찾아줍니다. 도서관에서 책 제목 일부로 원하는 책을 찾는 것과 비슷합니다.',
  },
  'dart-region-search': {
    technique: '조건 필터링',
    text: '지역, 직원 수처럼 고른 조건에 맞는 회사만 골라냅니다. 많은 카드 더미에서 “서울에 있고 직원 수가 이 범위인 카드만” 찾는 간단한 분류입니다.',
  },
  'group-network': {
    technique: '네트워크 그래프',
    text: '회사들을 점으로, 관계를 선으로 이어서 한 그룹의 연결 모습을 보여줍니다. 가족 관계도를 그리듯 어떤 회사가 중심인지 한눈에 살펴볼 수 있습니다.',
  },
  'company-financial': {
    technique: '재무 시계열 시각화',
    text: '여러 해의 매출·이익·빚을 그래프로 나란히 봅니다. 숫자 표를 길게 읽지 않아도 좋아지는 방향인지 나빠지는 방향인지 빠르게 찾는 방법입니다.',
  },
  'financial-statement': {
    technique: '재무제표 구조 읽기',
    text: '회사가 번 돈, 가진 것, 갚아야 할 돈이 어떻게 연결되는지 차례대로 살펴봅니다. 가계부에서 수입·지출·통장을 함께 보는 것과 비슷합니다.',
  },
  'valuation': {
    technique: '현금흐름 기반 가치평가',
    text: '회사가 앞으로 벌 수 있는 돈을 추정해 오늘의 값으로 바꿔 봅니다. 지금 받는 1만원과 몇 년 뒤 받는 1만원의 가치가 다르다는 생각에서 출발합니다.',
  },
  'portfolio': {
    technique: '몬테카를로 시뮬레이션',
    text: '자산을 섞는 방법을 아주 많이 만들어 보고, 수익과 위험의 균형이 좋은 조합을 찾습니다. 여러 재료로 음료를 만들어 가장 알맞은 맛을 고르는 것과 같습니다.',
  },
  'portfolio-combination': {
    technique: '두 종목 움직임 비교',
    text: '선택한 두 종목이 같은 날에 얼마나 비슷하게 움직였는지 최근 가격 흐름으로 살펴봅니다. 신호등은 함께 담을 때 기대할 수 있는 분산 효과를 쉽게 보여주는 참고 정보입니다.',
  },
  'risk': {
    technique: 'VaR·CVaR 손실 추정',
    text: '평소가 아니라 특히 나쁜 날에 얼마나 잃을 수 있는지 가늠합니다. “가장 큰 비를 만났을 때 우산이 충분한가”를 미리 확인하는 안전 점검입니다.',
  },
  'technical-chart': {
    technique: '기술적 지표 계산',
    text: '가격의 움직임을 이동평균·RSI·MACD 같은 간단한 규칙으로 정리합니다. 매일의 점을 이어 큰 흐름과 너무 빠르게 움직인 구간을 찾는 방법입니다.',
  },
  'backtest': {
    technique: '규칙 검증과 백테스트',
    text: '“이때 사고 저때 판다”는 규칙을 과거 또는 가상 가격에 적용해 봅니다. 새 게임 규칙을 실제 경기 전에 연습 경기로 시험하는 것과 같습니다.',
  },
  'pipeline': {
    technique: '퀀트 파이프라인과 Random Forest',
    text: '가격 데이터를 정리하고 지표를 만들고 규칙을 시험한 뒤 여러 결정나무의 의견을 모아 예측합니다. 작은 판단자 여러 명이 투표해 결론을 내리는 방식입니다.',
  },
  'cross-validation': {
    technique: '교차 검증',
    text: '데이터를 여러 조각으로 나눠 번갈아 시험합니다. 한 번의 시험 점수만 보지 않고 자리를 바꿔가며 여러 번 확인해 모델이 정말 안정적인지 살펴봅니다.',
  },
  'random-forest': {
    technique: 'Random Forest',
    text: '서로 조금씩 다른 결정나무를 많이 만들고 다수결로 답을 고릅니다. 한 사람의 추측보다 여러 사람의 의견을 모아 결정하는 것과 같습니다.',
  },
  'kmeans': {
    technique: 'K-Means 군집화',
    text: '정답 이름을 알려주지 않아도 서로 닮은 데이터끼리 모둠을 만듭니다. 색이나 모양이 비슷한 구슬을 자연스럽게 같은 바구니에 담는 방식입니다.',
  },
  'svm': {
    technique: 'SVM 분류',
    text: '서로 다른 두 무리 사이에 가장 넓은 빈 공간을 찾아 경계선을 긋습니다. 두 팀이 섞이지 않게 운동장 한가운데에 가장 안전한 선을 긋는 모습과 비슷합니다.',
  },
  'mlp': {
    technique: 'MLP 신경망',
    text: '여러 층의 작은 계산기가 앞 단계의 결과를 받아 조금씩 판단을 더합니다. 단서를 하나씩 합쳐서 점점 더 알맞은 답에 가까워지는 구조입니다.',
  },
  'linear-regression': {
    technique: '선형·다항 회귀',
    text: '흩어진 점들 사이에서 전체 흐름을 가장 잘 설명하는 선 또는 곡선을 찾습니다. 점들이 올라가는지 내려가는지 보고 다음 위치를 조심스럽게 예상하는 방법입니다.',
  },
  'lstm': {
    technique: 'LSTM 시계열 예측',
    text: '최근 값만 보지 않고 중요한 앞부분의 흐름을 기억하며 다음 값을 예상합니다. 긴 노래의 앞 멜로디를 기억해 다음 소절을 짐작하는 것과 비슷합니다.',
  },
  'transformer': {
    technique: 'Transformer 어텐션',
    text: '긴 데이터 중에서 지금 예측에 특히 중요한 부분에 더 집중합니다. 긴 글을 읽을 때 중요한 문장에 밑줄을 그어 뜻을 파악하는 것과 비슷합니다.',
  },
};

function addPracticeGuide(view) {
  const guide = PRACTICE_GUIDES[view];
  if (!guide || app.querySelector('.practice-guide')) return;

  app.insertAdjacentHTML('afterbegin', `
    <aside class="practice-guide" aria-label="분석 기법 쉬운 설명">
      <div class="practice-guide-icon"><i class="fa-solid fa-lightbulb"></i></div>
      <div>
        <div class="practice-guide-title">쉽게 이해하기 <span>${guide.technique}</span></div>
        <p>${guide.text}</p>
      </div>
    </aside>`);
}

let currentView = null;
let navigationVersion = 0;
const MOBILE_BREAKPOINT = 1024;

function updateQuizSidebarLock() {
  for (let d = 2; d <= 15; d++) {
    const el = document.querySelector(`.nav-item[data-view="quiz-day-${d}"]`);
    if (!el) continue;
    const prevDone = (() => {
      try { const p = JSON.parse(localStorage.getItem(`quiz_progress_day${d - 1}`)); return p?.finished === true; } catch { return false; }
    })();
    el.classList.toggle('locked', !prevDone);
  }
}

function navigate(view) {
  const route = routes[view] || routes['home'];
  const version = ++navigationVersion;
  currentView = view;

  // Views that create resources needing teardown (e.g. ApexCharts instances,
  // which keep an internal window-resize listener alive) register a cleanup
  // via window._viewCleanup. Run it before swapping in the next view's HTML,
  // otherwise the orphaned chart's resize handler fires against a detached
  // container and throws (NaN width/transform errors from apexcharts).
  if (typeof window._viewCleanup === 'function') {
    try { window._viewCleanup(); } catch (e) { /* noop */ }
  }
  window._viewCleanup = null;

  // Update active sidebar link
  document.querySelectorAll('.nav-item[data-view], .sidebar-link[data-view]').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });

  // Update breadcrumb
  if (breadcrumb) breadcrumb.textContent = route.label;

  // 현재 화면이 속한 사이드바 섹션만 펼치고 나머지는 닫는다 (사용 중인 메뉴만 열림)
  const _practiceViews = ['macro-realtime','macro-simulation','kospi-excluded','industry-analysis',
    'dart-region-search','group-network','company-financial','financial-statement','valuation',
    'risk','technical-chart','backtest','pipeline','cross-validation','random-forest',
    'kmeans','svm','mlp','linear-regression','lstm','transformer','market-snapshot','financial-knowledge'];
  const _portfolioViews = ['portfolio', 'portfolio-combination', 'portfolio-guide', 'portfolio-simulation'];
  const _aiViews = ['dart-financial-analysis','dart-company-search','tax-accounting'];
  const activeSections = [];
  if (['learn-10-1', 'learn-10-2', 'learn-10-3', 'learn-11'].includes(view)) activeSections.push('review');
  else if (view?.startsWith('learn-')) activeSections.push('learn');
  if (view?.startsWith('quiz-') || view === 'vocabulary-exam') activeSections.push('quiz');
  if (['server-resources', 'world-markets', 'asset-classes', 'today-gainers', 'today-sobujang', 'volume-cloud', 'sector-cloud', 'global-capital-map'].includes(view)) activeSections.push('visualization');
  if (_portfolioViews.includes(view)) activeSections.push('portfolio');
  if (_practiceViews.includes(view)) activeSections.push('practice');
  if (_aiViews.includes(view)) activeSections.push('aitools');
  if (typeof window._setActiveNavSections === 'function') window._setActiveNavSections(activeSections);

  if (view?.startsWith('quiz-') || view === 'vocabulary-exam') updateQuizSidebarLock();

  // Clear the previous screen before a view starts asynchronous work.  Without
  // this, the former menu can remain visible until its replacement is ready.
  app.setAttribute('aria-busy', 'true');
  app.classList.add('is-view-loading');
  app.innerHTML = '<div class="view-loading" role="status"><i class="fa-solid fa-circle-notch fa-spin"></i><span>화면을 불러오는 중입니다.</span></div>';
  Promise.resolve(route.render()).catch((error) => {
    if (version === navigationVersion) {
      app.innerHTML = `<div class="view-load-error">화면을 불러오지 못했습니다. ${error?.message || ''}</div>`;
    }
  }).finally(() => {
    if (version === navigationVersion) {
      app.removeAttribute('aria-busy');
      app.classList.remove('is-view-loading');
    }
  });
  recordUsage(view);
  // MongoDB를 사용하지 않는 화면의 사용자 입력은 화면별로 브라우저에 보관한다.
  // 렌더링 직후 실행해 각 뷰의 기본값 대신 마지막 입력값을 복원한다.
  requestAnimationFrame(() => restoreFormState(view, app));
  addPracticeGuide(view);

  if (window.innerWidth <= MOBILE_BREAKPOINT && typeof closeSidebar === 'function') closeSidebar();
}

window.navigate = navigate;

// 개별 뷰마다 저장 코드를 반복하지 않고 모든 입력·선택 변경을 자동 보관한다.
app.addEventListener('input', (event) => saveFormState(currentView, app));
app.addEventListener('change', (event) => saveFormState(currentView, app));

// Wire up sidebar links
// 'chart-drawing'은 페이지 이동이 아니라 오프캔버스 패널을 여는 위젯이라
// initChartDrawingOffcanvas()가 별도의 클릭 리스너로 처리한다.
document.querySelectorAll('.nav-item[data-view], .sidebar-link[data-view]').forEach(a => {
  if (a.dataset.view === 'chart-drawing') return;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(a.dataset.view);
  });
});

document.querySelectorAll('[data-view="home"].brand').forEach((button) => {
  button.addEventListener('click', () => navigate('home'));
});

// Health check
async function checkHealth() {
  const dot  = document.getElementById('health-dot');
  const text = document.getElementById('health-text');
  try {
    await api.health();
    if (dot)  dot.style.background  = '#22c55e';
    if (text) text.textContent = '백엔드 연결됨';
  } catch {
    if (dot)  dot.style.background  = '#ef4444';
    if (text) text.textContent = '백엔드 오프라인';
  }
}

function formatMarketValue(label, value) {
  const digits = label === 'USD/KRW' ? 2 : 0;
  return Number(value).toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatTimestamp(ts) {
  if (!ts) return '--';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

async function refreshTopbarMarkets() {
  const stamp = document.getElementById('ticker-stamp');
  const nodes = [...document.querySelectorAll('.ticker-item[data-market-label]')];
  if (!nodes.length) return;

  try {
    const data = await api.marketSnapshot({ tickers: TOPBAR_MARKETS });
    const byLabel = Object.fromEntries((data.items || []).map((item) => [item.label, item]));

    nodes.forEach((node) => {
      const label = node.dataset.marketLabel;
      const valueEl = node.querySelector('b');
      const changeEl = node.querySelector('em');
      const item = byLabel[label];

      if (!item || item.status !== 'ok') {
        valueEl.textContent = '-';
        changeEl.textContent = '조회 실패';
        changeEl.className = '';
        return;
      }

      valueEl.textContent = formatMarketValue(label, item.value);
      const sign = item.change_pct >= 0 ? '+' : '';
      changeEl.textContent = `${sign}${item.change_pct.toFixed(2)}%`;
      changeEl.className = item.change_pct >= 0 ? 'up' : 'dn';
      node.title = `데이터 시각 ${formatTimestamp(item.latest_data_at)}`;
    });

    if (stamp) stamp.textContent = `조회 시각 ${formatTimestamp(data.fetched_at)} (15분 지연)`;
  } catch {
    nodes.forEach((node) => {
      const valueEl = node.querySelector('b');
      const changeEl = node.querySelector('em');
      valueEl.textContent = '-';
      changeEl.textContent = '조회 실패';
      changeEl.className = '';
    });
    if (stamp) stamp.textContent = '조회 시각 확인 불가';
  }
}

function visitorId() {
  const createId = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll('-', '');
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  };
  try {
    const saved = localStorage.getItem(VISITOR_ID_KEY);
    if (saved) return saved;
    const id = createId();
    localStorage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch {
    return createId();
  }
}

async function refreshVisitorCount() {
  const badge = document.getElementById('visitor-count');
  const text = badge?.querySelector('span');
  if (!text) return;
  try {
    const data = await api.visitorHeartbeat({ visitor_id: visitorId() });
    text.textContent = `현재 접속 ${Number(data.active_visitors || 0).toLocaleString('ko-KR')}명`;
  } catch {
    text.textContent = '현재 접속 확인 불가';
  }
}

checkHealth();
initScreenCaptureAssistant();
initGlobalSearch();
initChartDrawingOffcanvas();
initAuth().then(() => { if (currentView) recordUsage(currentView); });
setInterval(checkHealth, 30000);
refreshTopbarMarkets();
setInterval(refreshTopbarMarkets, TOPBAR_REFRESH_MS);
refreshVisitorCount();
setInterval(refreshVisitorCount, VISITOR_HEARTBEAT_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshVisitorCount();
});

// Boot
// pages/*.html 정적 페이지의 사이드바 링크가 index.html?view=xxx 형태로
// 돌아오므로, 쿼리스트링에 유효한 view가 있으면 그 화면으로 바로 진입한다.
const requestedView = new URLSearchParams(window.location.search).get('view');
if (requestedView === 'chart-drawing') {
  // 'chart-drawing'은 라우트가 아니라 오프캔버스 위젯이므로, 홈으로 이동한 뒤 패널을 연다.
  navigate('home');
  document.querySelector('.nav-item[data-view="chart-drawing"]')?.click();
} else {
  navigate(requestedView && routes[requestedView] ? requestedView : 'home');
}
