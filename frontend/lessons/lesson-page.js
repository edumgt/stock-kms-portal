const LESSONS = [
  ['01', '10-1', '법인과 회사 구조 1: 시작하기 전에'],
  ['02', '10-2', '법인과 회사 구조 2: 운영·자금·신용보증'],
  ['03', '10-3', '법인과 회사 구조 3: 세무·회계의 기초'],
  ['04', '11', '거시경제와 주식시장 읽기'],
  ['05', '03', '주식 1'], ['06', '05', '주식 2'], ['07', '04', '주식 3'],
  ['08', ['06', 'theory-1'], '거래 전략 · LEAN · 선물·옵션'],
  ['09', ['07', 'theory-2', 'theory-3'], '펀드 · ETF · 채권 · 코인'],
  ['10', ['theory-4'], '자산배분 · 퀀트'],
];

const page = document.body.dataset.lesson;
const lesson = LESSONS.find(([number]) => number === page) || LESSONS[0];
const [number, lessonSources, title] = lesson;
const sourceIds = Array.isArray(lessonSources) ? lessonSources : [lessonSources];
const app = document.querySelector('#lessonApp');
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function nav() {
  return `<header class="portal-gnb"><a href="/?view=home" class="portal-brand">투자 분석 포털</a><nav aria-label="주요 메뉴"><a href="/?view=home">대시보드</a><a href="/?view=minute-chart">시장정보</a><a href="/?view=chart-drawing">드로잉 차트</a><a href="/?view=data-visualization">데이터 시각화</a><a href="/?view=learn">RAG</a><a href="/?view=investment-practice">투자 실습</a><a href="/?view=home">회원가입/로그인</a><a href="/?view=home">시스템</a></nav></header><aside class="portal-lnb" aria-label="학습 메뉴"><div class="portal-lnb-head"><b>EDUMGT Finance</b><span>투자 분석 · 금융 학습 · RAG 실습</span></div><nav><p>통합 학습 과정 · 10개</p>${LESSONS.map(([n,, label]) => `<a class="${n === number ? 'active' : ''}" href="${n}.html"><b>${n}</b><span>${escapeHtml(label)}</span></a>`).join('')}</nav></aside>`;
}

function addToc(root) {
  const headings = [...root.querySelectorAll('h2, h3')];
  headings.forEach((heading, index) => { heading.id = `section-${index + 1}`; });
  const toc = document.querySelector('#lessonToc');
  toc.innerHTML = `<b>학습 목차</b><ol>${headings.map((heading) => `<li class="${heading.tagName === 'H3' ? 'sub' : ''}"><a href="#${heading.id}">${escapeHtml(heading.textContent)}</a></li>`).join('')}</ol>`;
  toc.querySelectorAll('a').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault(); root.querySelector(link.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

async function loadMarked() {
  if (window.marked) return;
  await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/marked@11/marked.min.js'; script.onload = resolve; script.onerror = reject; document.head.append(script); });
}

async function markdownSource(documentId) {
  await loadMarked();
  const response = await fetch(`content/${documentId}.md`);
  if (!response.ok) throw new Error('학습 원문을 불러오지 못했습니다.');
  const source = document.createElement('section');
  source.className = 'lesson-source';
  source.innerHTML = window.marked.parse(await response.text());
  const sourceTitle = source.querySelector('h1');
  if (sourceTitle) sourceTitle.replaceWith(Object.assign(document.createElement('h2'), { textContent: sourceTitle.textContent }));
  return source;
}

function theorySource(sourceId) {
  const day = Number(sourceId.replace('theory-', ''));
  const data = window.THEORY_DAYS?.find((item) => item.day === day);
  if (!data) throw new Error('80 포트 학습 데이터를 불러오지 못했습니다.');
  const source = document.createElement('section');
  source.className = 'lesson-source';
  source.innerHTML = `<h2>${escapeHtml(data.title)}</h2><p class="lesson-intro">${escapeHtml(data.subtitle)}</p>${data.lessons.map(([heading, paragraphs]) => `<section><h3>${escapeHtml(heading)}</h3>${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('')}`;
  return source;
}

document.querySelector('#lessonShell').insertAdjacentHTML('afterbegin', nav());
Promise.all(sourceIds.map((sourceId) => sourceId.startsWith('theory-') ? Promise.resolve(theorySource(sourceId)) : markdownSource(sourceId)))
  .then((sources) => {
    document.title = `${number}. ${title} | 투자 분석 포털`;
    app.innerHTML = `<article class="lesson-document"><p class="lesson-number">${number} / 10</p><h1>${escapeHtml(title)}</h1><p class="lesson-intro">10단원 통합 과정의 ${number}단원입니다.</p></article>`;
    const documentRoot = app.querySelector('.lesson-document');
    sources.forEach((source) => documentRoot.append(source));
    addToc(app);
  })
  .catch((error) => { app.innerHTML = `<p class="lesson-error">${escapeHtml(error.message)} 새로고침 후 다시 시도해 주세요.</p>`; });
