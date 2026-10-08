/**
 * learn.js — MD 파일 학습 뷰 (marked.js CDN 렌더링)
 * /api/learn/doc/{docId} 엔드포인트에서 markdown 텍스트를 받아 렌더링
 */

function ensureMarked() {
  if (window.marked) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/marked@11/marked.min.js';
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

let vocabularyEntriesLoader;

function cleanVocabularyText(value = '') {
  return value
    .replace(/!?(?:\[([^\]]+)\]\([^)]*\))/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\\([|\\])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitVocabularyRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(cleanVocabularyText);
}

function vocabularyAliases(term) {
  const aliases = new Set([term]);
  term.split('·').forEach((part) => {
    const alias = part.trim();
    if (alias.length >= 2) aliases.add(alias);
  });
  const parentheses = [...term.matchAll(/\(([^)]+)\)/g)];
  parentheses.forEach((match) => {
    const alias = match[1].trim();
    if (alias.length >= 2) aliases.add(alias);
  });
  return [...aliases];
}

const VOCABULARY_WORD_MEANINGS = {
  active: '능동적인', analysis: '분석', asset: '자산', average: '평균', book: '장부',
  capital: '자본', cash: '현금', convergence: '수렴', data: '자료', dividend: '배당',
  earnings: '이익', exchange: '거래소', expense: '비용', flow: '흐름', fund: '펀드',
  gross: '총', guidance: '전망', income: '소득·이익', index: '지수', initial: '최초의',
  intelligence: '지능', interest: '이자', liquidity: '유동성', loss: '손실', market: '시장', money: '통화',
  net: '순', operating: '영업의', per: '…당', price: '가격', processing: '처리',
  product: '생산물', provider: '공급자', ratio: '비율', return: '수익률', security: '증권', share: '주식·지분',
  social: '사회의', strength: '강도', system: '체계', total: '전체', traded: '거래되는',
  trading: '거래', value: '가치', year: '연도', yield: '수익률', to: '대', of: '의',
};

function vocabularyNameStructure(term, name) {
  const englishName = (name.match(/[A-Za-z][A-Za-z’'&.\- ]{1,}/)?.[0] || '').trim();
  const abbreviation = (term.match(/\(([A-Z][A-Z0-9]+)\)/)?.[1]
    || name.match(/\b([A-Z]{2,}(?:\/[A-Z]{2,})?)\b/)?.[1]
    || '');
  if (englishName) {
    const words = englishName.match(/[A-Za-z]+/g) || [];
    const explained = words
      .map((word) => `${word}(${VOCABULARY_WORD_MEANINGS[word.toLowerCase()] || '이름을 이루는 말'})`)
      .join(' · ');
    const abbreviationText = abbreviation && words.length > 1
      ? ` ${abbreviation}는 이 영어 이름의 핵심 단어 첫 글자를 딴 약어예요.`
      : '';
    return `${englishName}은 ${explained}처럼 뜻을 나누어 읽을 수 있는 이름이에요.${abbreviationText}`;
  }
  return `‘${term}’은 금융·투자에서 쓰는 우리말 용어예요. 한자어·영문 표현이 함께 쓰일 때도 있으므로 아래 설명에서 가리키는 대상과 계산 기준을 함께 확인하세요.`;
}

function completeVocabularyEntry(entry) {
  const name = entry.name || `${entry.term} (금융·투자 용어)`;
  return {
    ...entry,
    name,
    origin: entry.origin || vocabularyNameStructure(entry.term, name),
    description: entry.description || `${entry.term}의 의미와 쓰임을 확인할 수 있는 용어예요.`,
  };
}

/** docs/voca.md의 표를 읽어 학습 본문에서 쓸 용어 사전을 만든다. */
function parseVocabularyEntries(markdown) {
  const entries = new Map();
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!/^\s*\|/.test(lines[index]) || !/^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) continue;
    const headers = splitVocabularyRow(lines[index]);
    const originIndex = headers.findIndex((header) => /말의 구조|유래/.test(header));
    const nameIndex = headers.findIndex((header) => /한자|영어/.test(header));
    // 계산식·비교 표는 용어 사전이 아니므로, 용어명·영문명 등을 명시한 표만 사용한다.
    if (nameIndex < 0 && originIndex < 0) continue;
    index += 2;

    while (index < lines.length && /^\s*\|/.test(lines[index])) {
      const cells = splitVocabularyRow(lines[index]);
      const term = cells[0];
      if (!term || term.length > 50 || !cells.length) {
        index += 1;
        continue;
      }

      let name = nameIndex > 0 ? cells[nameIndex] || '' : '';
      let origin = originIndex > 0 ? cells[originIndex] || '' : '';
      const descriptionCells = cells.filter((cell, cellIndex) => cellIndex > 0 && cellIndex !== nameIndex && cellIndex !== originIndex);

      // 첫 표의 일부 행은 '말의 구조' 칸을 생략하고 설명만 적었다.
      if (originIndex === 2 && cells.length === 3) {
        origin = '';
      }
      const description = descriptionCells.join(' ').trim() || (originIndex === 2 && cells.length === 3 ? cells[2] : '');

      const entry = completeVocabularyEntry({ term, name, origin, description });
      const previous = entries.get(term);
      const score = (name ? 200 : 0) + (origin ? 100 : 0) + description.length;
      const previousScore = previous ? (previous.name ? 200 : 0) + (previous.origin ? 100 : 0) + previous.description.length : -1;
      if (score > previousScore) entries.set(term, entry);
      index += 1;
    }
    index -= 1;
  }

  const aliases = new Map();
  entries.forEach((entry) => {
    vocabularyAliases(entry.term).forEach((alias) => {
      const existing = aliases.get(alias);
      const entryScore = (entry.name ? 200 : 0) + (entry.origin ? 100 : 0) + entry.description.length;
      const existingScore = existing ? (existing.name ? 200 : 0) + (existing.origin ? 100 : 0) + existing.description.length : -1;
      if (!existing || entryScore > existingScore) aliases.set(alias, entry);
    });
  });
  return aliases;
}

function loadVocabularyEntries() {
  if (!vocabularyEntriesLoader) {
    vocabularyEntriesLoader = fetch('/api/learn/doc/voca')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => parseVocabularyEntries(data.content || ''))
      .catch((error) => {
        vocabularyEntriesLoader = null;
        throw error;
      });
  }
  return vocabularyEntriesLoader;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWordCharacter(character) {
  return /[A-Za-z0-9가-힣_]/.test(character || '');
}

function installVocabularyModal(root, vocabulary) {
  if (!vocabulary?.size) return;
  const terms = [...vocabulary.keys()].sort((a, b) => b.length - a.length);
  const matcher = new RegExp(terms.map(escapeRegExp).join('|'), 'g');
  const blockedTags = new Set(['A', 'BUTTON', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'SELECT', 'OPTION', 'SVG']);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim() || blockedTags.has(node.parentElement?.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  let triggerCount = 0;

  textNodes.forEach((node) => {
    const text = node.nodeValue;
    matcher.lastIndex = 0;
    let match;
    let position = 0;
    const fragment = document.createDocumentFragment();
    let changed = false;
    while ((match = matcher.exec(text))) {
      const matchedTerm = match[0];
      const before = text[match.index - 1];
      const after = text[match.index + matchedTerm.length];
      if (isWordCharacter(before) || isWordCharacter(after)) continue;
      if (match.index > position) fragment.append(text.slice(position, match.index));
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'vocabulary-term';
      trigger.dataset.vocabularyTerm = matchedTerm;
      trigger.setAttribute('aria-label', `${matchedTerm} 용어 설명 보기`);
      trigger.textContent = matchedTerm;
      fragment.append(trigger);
      position = match.index + matchedTerm.length;
      changed = true;
      triggerCount += 1;
    }
    if (changed) {
      if (position < text.length) fragment.append(text.slice(position));
      node.replaceWith(fragment);
    }
  });
  if (!triggerCount) return;

  const tip = document.createElement('p');
  tip.className = 'vocabulary-tip';
  tip.innerHTML = '<i class="fa-solid fa-book-open" aria-hidden="true"></i> 밑줄 친 용어를 누르면 영어 전체 이름, 이름의 구성과 쉬운 설명을 바로 볼 수 있어요.';
  root.prepend(tip);

  const modal = document.createElement('div');
  modal.className = 'vocabulary-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'vocabulary-modal-title');
  modal.innerHTML = `
    <section class="vocabulary-modal">
      <header class="vocabulary-modal-header">
        <div><span class="vocabulary-modal-icon"><i class="fa-solid fa-book-bookmark"></i></span><div><p>주식 용어 바로 알기</p><h2 id="vocabulary-modal-title"></h2></div></div>
        <button type="button" class="vocabulary-modal-close" aria-label="용어 설명 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="vocabulary-modal-content">
        <section><h3><i class="fa-solid fa-language"></i> 한자·영어 전체 이름</h3><p data-vocabulary="name"></p></section>
        <section><h3><i class="fa-solid fa-seedling"></i> 이름의 뜻·구성</h3><p data-vocabulary="origin"></p></section>
        <section class="vocabulary-modal-description"><h3><i class="fa-solid fa-lightbulb"></i> 쉬운 설명</h3><p data-vocabulary="description"></p></section>
      </div>
    </section>`;
  document.body.appendChild(modal);

  const closeButton = modal.querySelector('.vocabulary-modal-close');
  const title = modal.querySelector('#vocabulary-modal-title');
  const fields = {
    name: modal.querySelector('[data-vocabulary="name"]'),
    origin: modal.querySelector('[data-vocabulary="origin"]'),
    description: modal.querySelector('[data-vocabulary="description"]'),
  };
  let lastFocused = null;
  const closeModal = () => {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
    lastFocused?.focus();
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape' && modal.classList.contains('show')) closeModal();
  };
  const openModal = (term, trigger) => {
    const entry = vocabulary.get(term);
    if (!entry) return;
    lastFocused = trigger;
    title.textContent = entry.term;
    fields.name.textContent = entry.name;
    fields.origin.textContent = entry.origin;
    fields.description.textContent = entry.description;
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    closeButton.focus();
  };

  root.querySelectorAll('[data-vocabulary-term]').forEach((trigger) => {
    trigger.addEventListener('click', () => openModal(trigger.dataset.vocabularyTerm, trigger));
  });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => {
    previousCleanup?.();
    document.removeEventListener('keydown', onKeydown);
    modal.remove();
  };
}

let mermaidLoader;
let mermaidInitialized = false;

function initializeMermaid() {
  if (!mermaidInitialized) {
    window.mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
    mermaidInitialized = true;
  }
  return window.mermaid;
}

function ensureMermaid() {
  if (window.mermaid) return Promise.resolve(initializeMermaid());
  if (mermaidLoader) return mermaidLoader;

  // 인라인 module 스크립트는 import 실패를 안정적으로 reject하지 못해 Mermaid
  // 렌더링이 대기 상태에 남을 수 있다. 전역 번들을 명시적으로 로드한다.
  mermaidLoader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/mermaid.min.js?v=11.16.0';
    s.async = true;
    s.onload = () => {
      if (!window.mermaid) {
        reject(new Error('Mermaid 라이브러리를 초기화하지 못했습니다.'));
        return;
      }
      resolve(initializeMermaid());
    };
    s.onerror = () => reject(new Error('Mermaid CDN을 불러오지 못했습니다.'));
    document.head.appendChild(s);
  }).catch((err) => {
    mermaidLoader = null;
    throw err;
  });

  return mermaidLoader;
}

/** Mermaid 소스는 VIEW 배지로 대체하고, 클릭할 때만 모달에서 렌더링한다. */
async function renderMermaidBlocks(root) {
  const blocks = [...root.querySelectorAll('code.language-mermaid')];
  if (!blocks.length) return;

  const modal = document.createElement('div');
  modal.className = 'mermaid-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Mermaid 차트');
  modal.innerHTML = `
    <section class="mermaid-modal" role="document">
      <header class="mermaid-modal-header">
        <div><i class="fa-solid fa-diagram-project"></i> Mermaid 차트</div>
        <button type="button" class="mermaid-modal-close" aria-label="차트 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="mermaid-modal-chart" aria-live="polite"></div>
    </section>`;
  document.body.appendChild(modal);

  const chart = modal.querySelector('.mermaid-modal-chart');
  const closeButton = modal.querySelector('.mermaid-modal-close');
  let lastFocused = null;
  const closeModal = () => {
    modal.classList.remove('show');
    chart.replaceChildren();
    lastFocused?.focus();
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape' && modal.classList.contains('show')) closeModal();
  };
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', onKeydown);

  const diagrams = blocks.map((code, index) => {
    const pre = code.closest('pre');
    const graphDef = code.textContent;
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'mermaid-view-badge';
    badge.innerHTML = '<i class="fa-solid fa-eye"></i><span>VIEW</span><small>Mermaid 차트</small>';
    pre.replaceWith(badge);
    return { graphDef, badge, index };
  });

  diagrams.forEach(({ graphDef, badge, index }) => {
    badge.addEventListener('click', async () => {
      lastFocused = badge;
      modal.classList.add('show');
      chart.innerHTML = '<div class="mermaid-modal-loading"><i class="fa-solid fa-spinner fa-spin"></i> 차트를 렌더링하는 중…</div>';
      closeButton.focus();
      try {
        await ensureMermaid();
        const id = `mermaid-modal-${Date.now()}-${index}`;
        const { svg, bindFunctions } = await window.mermaid.render(id, graphDef);
        chart.innerHTML = svg;
        bindFunctions?.(chart);
      } catch (err) {
        chart.innerHTML = '<p class="mermaid-modal-error">차트를 렌더링하지 못했습니다. 문서의 Mermaid 문법을 확인하세요.</p>';
        console.error('mermaid 렌더링 실패:', err);
      }
    });
  });

  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => {
    previousCleanup?.();
    document.removeEventListener('keydown', onKeydown);
    modal.remove();
  };
}

function buildToc(container) {
  const heads = [...container.querySelectorAll('h2, h3')];
  if (!heads.length) return '';
  return `<aside class="learn-toc" id="learn-toc" aria-hidden="true" aria-label="문서 목차">
    <div class="learn-toc-hdr">
      <div class="learn-toc-title"><i class="fa-solid fa-list-ul"></i> 목차</div>
      <button class="learn-toc-close" id="learn-toc-close" type="button" aria-label="목차 닫기">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <ul class="toc-list">
      ${heads.map(h => {
        const cls = h.tagName === 'H3' ? 'toc-item h3' : 'toc-item';
        return `<li class="${cls}" data-id="${h.id}">${h.textContent.replace(/^[#\s]+/,'')}</li>`;
      }).join('')}
    </ul>
  </aside>`;
}

function installFinancialStatementSamplesModal(root, docId) {
  const trigger = root.querySelector('[data-financial-statement-samples]');
  if (docId !== '04' || !trigger) return;

  const modal = document.createElement('div');
  modal.className = 'financial-statement-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'financial-statement-modal-title');
  modal.innerHTML = `
    <section class="financial-statement-modal">
      <header class="financial-statement-modal-header">
        <div><span class="financial-statement-modal-icon"><i class="fa-solid fa-calculator"></i></span><div><h2 id="financial-statement-modal-title">재무제표 미니 시뮬레이터</h2><p>숫자를 입력해 손익·현금·재무상태가 연결되는 흐름을 연습해 보세요.</p></div></div>
        <button type="button" class="financial-statement-modal-close" aria-label="재무제표 시뮬레이터 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="financial-statement-simulator">
        <svg class="financial-statement-input-connections" aria-hidden="true"><defs><marker id="financial-input-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="context-stroke"></path></marker></defs><g data-financial-input-connection-lines></g></svg>
        <section class="financial-statement-inputs" aria-label="연습 수치 입력">
          <div class="financial-statement-section-heading"><div><span>STEP 1</span><h3>기본 수치 입력</h3></div><p>단위: 억원</p></div>
          <div class="financial-statement-input-grid">
            <label><span>기초 자산</span><small>기초 재무상태</small><input type="number" data-financial-input="initialAssets" value="1000" min="0" step="10"></label>
            <label><span>기초 부채</span><small>자산보다 작게 입력</small><input type="number" data-financial-input="initialLiabilities" value="400" min="0" step="10"></label>
            <label><span>매출액</span><input type="number" data-financial-input="sales" value="1000" min="0" step="10"></label>
            <label><span>매출원가</span><input type="number" data-financial-input="cogs" value="600" min="0" step="10"></label>
            <label><span>판매관리비</span><input type="number" data-financial-input="opex" value="200" min="0" step="10"></label>
            <label><span>운전자본 증가</span><small>증가하면 현금이 줄어요</small><input type="number" data-financial-input="workingCapital" value="50" step="10"></label>
            <label><span>설비투자</span><input type="number" data-financial-input="capex" value="100" min="0" step="10"></label>
            <label><span>차입금 증감</span><small>상환은 음수로 입력</small><input type="number" data-financial-input="borrowing" value="40" step="10"></label>
          </div>
        </section>
        <div class="financial-statement-flow" aria-label="재무제표 연결 흐름"><span>손익</span><i class="fa-solid fa-arrow-right"></i><span>현금흐름</span><i class="fa-solid fa-arrow-right"></i><span>재무상태</span></div>
        <div class="financial-statement-results" aria-live="polite">
          <svg class="financial-statement-connections" aria-hidden="true"><defs><marker id="financial-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="context-stroke"></path></marker></defs><g data-financial-connection-lines></g></svg>
          <section class="financial-statement-card income-card"><h3><i class="fa-solid fa-chart-line"></i> 손익계산서</h3><dl><div><dt>매출액</dt><dd data-financial-output="sales"></dd></div><div class="input-row"><dt>(−) 매출원가</dt><dd data-financial-output="cogs"></dd></div><div><dt>매출총이익</dt><dd data-financial-output="grossProfit"></dd></div><div class="input-row"><dt>(−) 판매관리비</dt><dd data-financial-output="opex"></dd></div><div><dt>영업이익</dt><dd data-financial-output="operatingIncome"></dd></div><div class="total"><dt>당기순이익 <small>세율 20%</small></dt><dd data-financial-output="netIncome"></dd></div></dl></section>
          <section class="financial-statement-card cashflow-card"><h3><i class="fa-solid fa-money-bill-transfer"></i> 현금흐름표</h3><dl><div><dt>영업활동 현금흐름</dt><dd data-financial-output="operatingCashFlow"></dd></div><div class="input-row"><dt>(−) 운전자본 증가</dt><dd data-financial-output="workingCapital"></dd></div><div class="input-row"><dt>(−) 설비투자</dt><dd data-financial-output="capex"></dd></div><div><dt>투자활동 현금흐름</dt><dd data-financial-output="investingCashFlow"></dd></div><div class="input-row"><dt>차입금 증감</dt><dd data-financial-output="borrowing"></dd></div><div><dt>재무활동 현금흐름</dt><dd data-financial-output="financingCashFlow"></dd></div><div class="total"><dt>기말 현금 <small>기초 자산의 20%</small></dt><dd data-financial-output="endingCash"></dd></div></dl></section>
          <section class="financial-statement-card balance-card"><h3><i class="fa-solid fa-scale-balanced"></i> 재무상태표</h3><dl><div class="input-row"><dt>기초 자산</dt><dd data-financial-output="initialAssets"></dd></div><div><dt>기말 자산</dt><dd data-financial-output="assets"></dd></div><div class="input-row"><dt>기초 부채</dt><dd data-financial-output="initialLiabilities"></dd></div><div><dt>기말 부채</dt><dd data-financial-output="liabilities"></dd></div><div class="total"><dt>기말 자본 <small>기초 자본 + 순이익</small></dt><dd data-financial-output="equity"></dd></div><div class="balance-check"><dt>대차 일치</dt><dd data-financial-output="balanceCheck"></dd></div></dl></section>
        </div>
        <footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>
      </div>
    </section>`;
  document.body.appendChild(modal);

  const closeButton = modal.querySelector('.financial-statement-modal-close');
  let lastFocused = null;

  const closeModal = () => {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
    lastFocused?.focus();
  };
  const format = (value) => Math.round(value).toLocaleString('ko-KR');
  const drawInputConnections = () => {
    const simulator = modal.querySelector('.financial-statement-simulator');
    const svg = modal.querySelector('.financial-statement-input-connections');
    const lineGroup = modal.querySelector('[data-financial-input-connection-lines]');
    const bounds = simulator.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    lineGroup.replaceChildren();
    ['initialAssets', 'initialLiabilities', 'sales', 'cogs', 'opex', 'workingCapital', 'capex', 'borrowing'].forEach((name, index) => {
      const source = modal.querySelector(`[data-financial-input="${name}"]`).getBoundingClientRect();
      const target = modal.querySelector(`[data-financial-output="${name}"]`).parentElement.getBoundingClientRect();
      const x1 = source.left - bounds.left + source.width / 2;
      const y1 = source.bottom - bounds.top + 2;
      const x2 = target.left - bounds.left + 10;
      const y2 = target.top - bounds.top + 4;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${y1 + 28}, ${x2} ${y2 - 32}, ${x2} ${y2}`);
      path.setAttribute('class', `financial-input-connection input-link-${index}`);
      path.setAttribute('marker-end', 'url(#financial-input-arrow)');
      lineGroup.append(path);
    });
  };
  const drawConnections = () => {
    const results = modal.querySelector('.financial-statement-results');
    const svg = modal.querySelector('.financial-statement-connections');
    const lineGroup = modal.querySelector('[data-financial-connection-lines]');
    const bounds = results.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    svg.setAttribute('width', bounds.width);
    svg.setAttribute('height', bounds.height);
    const links = [
      ['netIncome', 'operatingCashFlow', '순이익'],
      ['investingCashFlow', 'assets', '설비투자'],
      ['financingCashFlow', 'liabilities', '차입'],
      ['endingCash', 'assets', '기말 현금'],
    ];
    lineGroup.replaceChildren();
    links.forEach(([from, to, label], index) => {
      const source = modal.querySelector(`[data-financial-output="${from}"]`).parentElement.getBoundingClientRect();
      const target = modal.querySelector(`[data-financial-output="${to}"]`).parentElement.getBoundingClientRect();
      const x1 = source.right - bounds.left + 2;
      const y1 = source.top - bounds.top + source.height / 2;
      const x2 = target.left - bounds.left - 5;
      const y2 = target.top - bounds.top + target.height / 2;
      const bend = Math.max(20, (x2 - x1) / 2) + index * 3;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
      path.setAttribute('class', `financial-connection-line link-${index}`);
      path.setAttribute('marker-end', 'url(#financial-arrow)');
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', (x1 + x2) / 2);
      text.setAttribute('y', (y1 + y2) / 2 - 5 - index * 2);
      text.setAttribute('class', `financial-connection-label link-${index}`);
      text.textContent = label;
      lineGroup.append(path, text);
    });
  };
  const updateSimulator = () => {
    const value = (name) => Number(modal.querySelector(`[data-financial-input="${name}"]`).value) || 0;
    const initialAssets = value('initialAssets');
    const initialLiabilities = value('initialLiabilities');
    const initialEquity = initialAssets - initialLiabilities;
    const sales = value('sales');
    const grossProfit = sales - value('cogs');
    const operatingIncome = grossProfit - value('opex');
    const netIncome = operatingIncome - Math.max(operatingIncome, 0) * 0.2;
    const operatingCashFlow = netIncome - value('workingCapital');
    const investingCashFlow = -value('capex');
    const financingCashFlow = value('borrowing');
    const startingCash = initialAssets * 0.2;
    const endingCash = startingCash + operatingCashFlow + investingCashFlow + financingCashFlow;
    const assets = initialAssets + netIncome + value('borrowing');
    const liabilities = initialLiabilities + value('borrowing');
    const outputs = { initialAssets, initialLiabilities, sales, cogs: -value('cogs'), grossProfit, opex: -value('opex'), operatingIncome, netIncome, operatingCashFlow, workingCapital: -value('workingCapital'), capex: -value('capex'), investingCashFlow, borrowing: value('borrowing'), financingCashFlow, endingCash, assets, liabilities, equity: initialEquity + netIncome };
    Object.entries(outputs).forEach(([name, amount]) => {
      modal.querySelectorAll(`[data-financial-output="${name}"]`).forEach((target) => {
        target.textContent = `${amount < 0 ? '−' : ''}${format(Math.abs(amount))}`;
        target.classList.toggle('negative', amount < 0);
      });
    });
    modal.querySelector('[data-financial-output="balanceCheck"]').textContent = '일치 ✓';
    requestAnimationFrame(drawConnections);
    requestAnimationFrame(drawInputConnections);
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape' && modal.classList.contains('show')) closeModal();
  };

  trigger.addEventListener('click', () => {
    lastFocused = trigger;
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    closeButton.focus();
    requestAnimationFrame(drawConnections);
    requestAnimationFrame(drawInputConnections);
  });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-financial-input]').forEach((input) => input.addEventListener('input', updateSimulator));
  modal.querySelector('[data-financial-reset]').addEventListener('click', () => {
    modal.querySelectorAll('[data-financial-input]').forEach((input) => { input.value = input.defaultValue; });
    updateSimulator();
  });
  updateSimulator();
  const resizeObserver = new ResizeObserver(() => { drawConnections(); drawInputConnections(); });
  resizeObserver.observe(modal.querySelector('.financial-statement-simulator'));
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => {
    previousCleanup?.();
    document.removeEventListener('keydown', onKeydown);
    resizeObserver.disconnect();
    modal.remove();
  };
}

function installValuationSimulator(root, docId) {
  const trigger = root.querySelector('[data-valuation-simulator]');
  if (docId !== '04' || !trigger) return;

  const modal = document.createElement('div');
  modal.className = 'valuation-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'valuation-modal-title');
  modal.innerHTML = `
    <section class="valuation-modal">
      <header class="valuation-modal-header">
        <div><span class="valuation-modal-icon"><i class="fa-solid fa-calculator"></i></span><div><h2 id="valuation-modal-title">PER·PBR 미니 계산기</h2><p>주가와 회사의 이익·순자산이 가격 지표로 바뀌는 과정을 확인하세요.</p></div></div>
        <button type="button" class="valuation-modal-close" aria-label="PER PBR 계산기 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="valuation-simulator">
        <section class="valuation-inputs" aria-label="기업 수치 입력">
          <div class="valuation-section-heading"><span>STEP 1</span><h3>숫자를 바꿔 보세요</h3><p>주가: 원 · 나머지: 억 원/만 주</p></div>
          <div class="valuation-input-grid">
            <label>주가 (원)<input type="number" data-valuation-input="price" value="50000" min="0" step="1000"></label>
            <label>발행주식 수 (만 주)<input type="number" data-valuation-input="shares" value="1000" min="1" step="100"></label>
            <label>연간 순이익 (억 원)<input type="number" data-valuation-input="netIncome" value="500" step="100"></label>
            <label>순자산 (억 원)<input type="number" data-valuation-input="equity" value="5000" min="1" step="500"></label>
          </div>
        </section>
        <section class="valuation-results" aria-live="polite">
          <div class="valuation-metric"><span>시가총액</span><strong data-valuation-output="marketCap"></strong><small>주가 × 발행주식 수</small></div>
          <div class="valuation-metric"><span>EPS · BPS</span><strong><b data-valuation-output="eps"></b> / <b data-valuation-output="bps"></b></strong><small>한 주당 이익 / 순자산</small></div>
          <div class="valuation-metric highlight"><span>PER</span><strong data-valuation-output="per"></strong><small>주가 ÷ EPS</small></div>
          <div class="valuation-metric highlight green"><span>PBR</span><strong data-valuation-output="pbr"></strong><small>주가 ÷ BPS</small></div>
        </section>
        <section class="valuation-formulas" aria-label="계산 과정">
          <div class="valuation-section-heading"><span>STEP 2</span><h3>PER이 만들어지는 순서</h3></div>
          <ol>
            <li><b>시가총액</b><span data-valuation-formula="marketCap"></span></li>
            <li><b>주당순이익(EPS)</b><span data-valuation-formula="eps"></span></li>
            <li class="per-formula"><b>PER</b><span data-valuation-formula="per"></span></li>
            <li><b>주당순자산(BPS) · PBR</b><span data-valuation-formula="pbr"></span></li>
          </ol>
        </section>
        <section class="valuation-per-meaning" aria-live="polite">
          <div class="valuation-section-heading"><span>STEP 3</span><h3>PER은 무엇을 말하나요?</h3><p>현재 이익이 유지된다는 단순한 가정</p></div>
          <div class="valuation-per-meaning-grid">
            <article><span><i class="fa-regular fa-clock"></i> 이익 기준 회수 기간 감각</span><strong data-valuation-per-period></strong><p data-valuation-per-period-detail></p></article>
            <article><span><i class="fa-solid fa-seedling"></i> 높은 PER에 담긴 기대</span><strong data-valuation-per-expectation></strong><p data-valuation-per-expectation-detail></p></article>
          </div>
        </section>
        <section class="valuation-examples" aria-live="polite">
          <div class="valuation-section-heading"><span>STEP 4</span><h3>이 수치에서 비교해 볼 섹터</h3><p>학습용 비교 후보</p></div>
          <p class="valuation-example-intro" data-valuation-example-intro></p>
          <div class="valuation-example-cards" data-valuation-example-cards></div>
        </section>
        <footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>
      </div>
    </section>`;
  document.body.appendChild(modal);

  const closeButton = modal.querySelector('.valuation-modal-close');
  let lastFocused = null;
  const format = (amount, digits = 0) => Number(amount).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const update = () => {
    const value = (name) => Number(modal.querySelector(`[data-valuation-input="${name}"]`).value) || 0;
    const price = value('price');
    const shares = value('shares');
    const netIncome = value('netIncome');
    const equity = value('equity');
    const marketCap = price * shares / 10000;
    const eps = shares ? netIncome * 10000 / shares : 0;
    const bps = shares ? equity * 10000 / shares : 0;
    const per = eps > 0 ? price / eps : null;
    const pbr = bps > 0 ? price / bps : null;
    const example = (() => {
      if (per === null) return {
        intro: '적자 구간에서는 PER 대신 매출 성장, 현금 소진, 자금 조달 가능성을 먼저 비교합니다.',
        cards: [['성장 초기·바이오', '셀트리온 · 알테오젠', '매출 성장과 연구개발비, 현금 보유액을 함께 확인'], ['인터넷·플랫폼', '카카오 · NAVER', '이익 회복 시점과 사업별 수익성을 비교']],
      };
      if (per < 10 && pbr < 1) return {
        intro: '낮은 PER·PBR은 자산가치와 이익의 지속성을 함께 점검하는 가치주 관점에 가깝습니다.',
        cards: [['은행·금융지주', 'KB금융 · 신한지주', 'ROE, 건전성, 배당 성향을 비교'], ['보험·증권', '삼성생명 · 미래에셋증권', '금리 변화와 보유 자산의 질을 확인']],
      };
      if (per >= 20 && pbr >= 2) return {
        intro: '높은 PER·PBR은 앞으로의 이익 성장 기대가 가격에 많이 반영된 성장주 관점에 가깝습니다.',
        cards: [['반도체·AI', 'SK하이닉스 · 한미반도체', '실적 성장률과 설비투자 사이클을 비교'], ['플랫폼·소프트웨어', 'NAVER · 더존비즈온', '매출 성장과 수익성 개선 속도를 확인']],
      };
      if (per < 15) return {
        intro: '상대적으로 낮은 PER은 경기·업황에 따라 이익이 크게 변할 수 있는 기업도 함께 살펴볼 수 있습니다.',
        cards: [['자동차·부품', '현대차 · 기아', '판매량, 환율, 전기차 투자 부담을 비교'], ['철강·에너지', 'POSCO홀딩스 · S-OIL', '원자재 가격과 업황의 정점 여부를 확인']],
      };
      return {
        intro: '중간 수준의 PER·PBR에서는 안정적인 이익, 브랜드, 자본 효율을 함께 비교하는 연습이 좋습니다.',
        cards: [['소비재·식품', '오리온 · KT&G', '가격 결정력과 꾸준한 현금흐름을 확인'], ['통신·유틸리티', 'KT · 한국전력', '배당 여력, 부채, 규제 환경을 비교']],
      };
    })();
    modal.querySelector('[data-valuation-output="marketCap"]').textContent = `${format(marketCap)}억 원`;
    modal.querySelector('[data-valuation-output="eps"]').textContent = `EPS ${format(eps)}원`;
    modal.querySelector('[data-valuation-output="bps"]').textContent = `BPS ${format(bps)}원`;
    modal.querySelector('[data-valuation-output="per"]').textContent = per === null ? '산정 어려움' : `${format(per, 1)}배`;
    modal.querySelector('[data-valuation-output="pbr"]').textContent = pbr === null ? '산정 어려움' : `${format(pbr, 1)}배`;
    modal.querySelector('[data-valuation-formula="marketCap"]').textContent = `${format(price)}원 × ${format(shares)}만 주 = ${format(marketCap)}억 원`;
    modal.querySelector('[data-valuation-formula="eps"]').textContent = `${format(netIncome)}억 원 ÷ ${format(shares)}만 주 = ${format(eps)}원`;
    modal.querySelector('[data-valuation-formula="per"]').textContent = per === null ? '순이익이 0 이하라 PER을 일반적으로 계산하기 어렵습니다.' : `${format(price)}원 ÷ ${format(eps)}원 = ${format(per, 1)}배`;
    modal.querySelector('[data-valuation-formula="pbr"]').textContent = `${format(equity)}억 원 ÷ ${format(shares)}만 주 = BPS ${format(bps)}원 → ${format(price)}원 ÷ ${format(bps)}원 = ${pbr === null ? '산정 어려움' : `${format(pbr, 1)}배`}`;
    const periodTitle = per === null ? '순이익이 있어야 비교할 수 있어요' : per <= 1.5 ? 'PER 1배: 1년치 순이익과 같은 가격' : `PER ${format(per, 1)}배: 약 ${format(per, 1)}년치 순이익과 같은 가격`;
    const periodDetail = per === null
      ? '적자이면 “몇 년치 이익”이라는 해석이 성립하지 않습니다. 매출, 현금흐름, 자금 조달 여력을 함께 봅니다.'
      : '회사를 통째로 사는 가격(시가총액)을 현재의 연간 순이익이 매년 똑같이 낸다고 가정해 나눈 감각입니다. 배당, 세금, 재투자, 이익 변동이 있으므로 실제 투자금 회수 기간은 아닙니다.';
    const expectationTitle = per === null ? 'PER 대신 성장과 현금을 확인' : per >= 20 ? '높은 PER은 미래 이익 성장을 기대할 수 있어요' : 'PER만으로 기대를 단정할 수 없어요';
    const expectationDetail = per === null
      ? '아직 이익이 없거나 적자라면, 시장은 미래 흑자 전환·매출 성장·기술력 등을 다른 지표로 평가할 수 있습니다.'
      : per >= 20
        ? '시장 참여자가 앞으로 이익이 빠르게 늘거나, 사업의 질·안정성이 좋아질 것으로 기대해 현재 이익보다 높은 가격을 지불하는 경우가 있습니다. 기대한 성장이 실현되지 않으면 높은 PER은 빠르게 낮아질 수 있습니다.'
        : '낮은 PER은 이익 감소·업황 하락·부채 부담 같은 걱정을 반영할 수도 있고, 중간 PER은 성장성과 안정성이 일부 반영된 모습일 수 있습니다. 같은 업종·비슷한 성장성끼리 비교합니다.';
    modal.querySelector('[data-valuation-per-period]').textContent = periodTitle;
    modal.querySelector('[data-valuation-per-period-detail]').textContent = periodDetail;
    modal.querySelector('[data-valuation-per-expectation]').textContent = expectationTitle;
    modal.querySelector('[data-valuation-per-expectation-detail]').textContent = expectationDetail;
    modal.querySelector('[data-valuation-example-intro]').textContent = example.intro;
    modal.querySelector('[data-valuation-example-cards]').innerHTML = example.cards.map(([sector, stocks, point]) => `<article><span>${sector}</span><strong>${stocks}</strong><p>${point}</p></article>`).join('');
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-valuation-input]').forEach((input) => input.addEventListener('input', update));
  modal.querySelector('[data-valuation-reset]').addEventListener('click', () => { modal.querySelectorAll('[data-valuation-input]').forEach((input) => { input.value = input.defaultValue; }); update(); });
  update();
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installPsrSimulator(root, docId) {
  const trigger = root.querySelector('[data-psr-simulator]');
  if (docId !== '04' || !trigger) return;

  const modal = document.createElement('div');
  modal.className = 'valuation-modal-backdrop psr-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'psr-modal-title');
  modal.innerHTML = `
    <section class="valuation-modal psr-modal">
      <header class="valuation-modal-header">
        <div><span class="valuation-modal-icon psr-modal-icon"><i class="fa-solid fa-receipt"></i></span><div><h2 id="psr-modal-title">PSR 미니 계산기</h2><p>매출과 시가총액만으로 보는 가격표를 직접 계산해 보세요.</p></div></div>
        <button type="button" class="valuation-modal-close" aria-label="PSR 계산기 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="valuation-simulator psr-simulator">
        <section class="valuation-inputs" aria-label="PSR 수치 입력">
          <div class="valuation-section-heading"><span>STEP 1</span><h3>숫자를 바꿔 보세요</h3><p>주가: 원 · 나머지: 억 원/만 주</p></div>
          <div class="valuation-input-grid">
            <label>주가 (원)<input type="number" data-psr-input="price" value="50000" min="0" step="1000"></label>
            <label>발행주식 수 (만 주)<input type="number" data-psr-input="shares" value="40000" min="1" step="1000"></label>
            <label>연간 매출 (억 원)<input type="number" data-psr-input="sales" value="200000" min="1" step="10000"></label>
            <label>순이익률 (%)<input type="number" data-psr-input="margin" value="5" min="-100" max="100" step="1"></label>
          </div>
        </section>
        <section class="valuation-results psr-results" aria-live="polite">
          <div class="valuation-metric"><span>시가총액</span><strong data-psr-output="marketCap"></strong><small>주가 × 발행주식 수</small></div>
          <div class="valuation-metric highlight psr-highlight"><span>PSR</span><strong data-psr-output="psr"></strong><small>시가총액 ÷ 매출</small></div>
          <div class="valuation-metric"><span>가정한 순이익</span><strong data-psr-output="netIncome"></strong><small>매출 × 순이익률</small></div>
        </section>
        <section class="valuation-formulas" aria-label="PSR 계산 과정">
          <div class="valuation-section-heading"><span>STEP 2</span><h3>PSR이 만들어지는 순서</h3></div>
          <ol>
            <li><b>시가총액</b><span data-psr-formula="marketCap"></span></li>
            <li class="per-formula"><b>PSR</b><span data-psr-formula="psr"></span></li>
            <li><b>같은 매출, 다른 이익</b><span data-psr-formula="profit"></span></li>
          </ol>
        </section>
        <section class="psr-meaning" aria-live="polite">
          <div class="valuation-section-heading"><span>STEP 3</span><h3>PSR을 읽는 방법</h3><p>매출만으로 끝내지 않기</p></div>
          <div class="psr-meaning-grid">
            <article><strong data-psr-meaning-title></strong><p data-psr-meaning-detail></p></article>
            <article><strong>반드시 순이익률을 함께 봅니다</strong><p>PSR은 매출을 기준으로 하므로, 비용을 빼고 실제로 얼마나 남기는지는 알려주지 않습니다. 같은 PSR이라도 순이익률이 높은 회사와 낮은 회사의 PER은 크게 달라질 수 있습니다.</p></article>
          </div>
        </section>
        <footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>
      </div>
    </section>`;
  document.body.appendChild(modal);

  const closeButton = modal.querySelector('.valuation-modal-close');
  let lastFocused = null;
  const format = (amount, digits = 0) => Number(amount).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const update = () => {
    const value = (name) => Number(modal.querySelector(`[data-psr-input="${name}"]`).value) || 0;
    const price = value('price');
    const shares = value('shares');
    const sales = value('sales');
    const margin = value('margin');
    const marketCap = price * shares / 10000;
    const psr = sales > 0 ? marketCap / sales : null;
    const netIncome = sales * margin / 100;
    const impliedPer = netIncome > 0 ? marketCap / netIncome : null;
    modal.querySelector('[data-psr-output="marketCap"]').textContent = `${format(marketCap)}억 원`;
    modal.querySelector('[data-psr-output="psr"]').textContent = psr === null ? '산정 어려움' : `${format(psr, 2)}배`;
    modal.querySelector('[data-psr-output="netIncome"]').textContent = `${format(netIncome)}억 원`;
    modal.querySelector('[data-psr-formula="marketCap"]').textContent = `${format(price)}원 × ${format(shares)}만 주 = ${format(marketCap)}억 원`;
    modal.querySelector('[data-psr-formula="psr"]').textContent = psr === null ? '매출이 0보다 커야 계산할 수 있습니다.' : `${format(marketCap)}억 원 ÷ ${format(sales)}억 원 = ${format(psr, 2)}배`;
    modal.querySelector('[data-psr-formula="profit"]').textContent = impliedPer === null
      ? `순이익률 ${format(margin, 1)}%이면 일반적인 PER 비교가 어렵습니다.`
      : `순이익률 ${format(margin, 1)}% → 순이익 ${format(netIncome)}억 원 → 같은 가격의 PER은 약 ${format(impliedPer, 1)}배`;
    modal.querySelector('[data-psr-meaning-title]').textContent = psr === null ? 'PSR을 계산할 수 없습니다' : `PSR ${format(psr, 2)}배 = 연 매출의 ${format(psr, 2)}배 가격`;
    modal.querySelector('[data-psr-meaning-detail]').textContent = psr === null
      ? '매출이 있어야 시가총액을 매출로 나눌 수 있습니다.'
      : '회사를 통째로 사는 가격이 연간 매출의 몇 배인지를 뜻합니다. 매출은 이익이 아니므로, 이 숫자만으로 회수 기간이나 비싸고 싼 가격을 판단할 수는 없습니다.';
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-psr-input]').forEach((input) => input.addEventListener('input', update));
  modal.querySelector('[data-psr-reset]').addEventListener('click', () => { modal.querySelectorAll('[data-psr-input]').forEach((input) => { input.value = input.defaultValue; }); update(); });
  update();
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installFinancialHealthSimulator(root, docId) {
  const trigger = root.querySelector('[data-financial-health-simulator]');
  if (docId !== '04' || !trigger) return;

  const modal = document.createElement('div');
  modal.className = 'financial-health-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'financial-health-modal-title');
  modal.innerHTML = `
    <section class="financial-health-modal">
      <header class="financial-health-modal-header">
        <div><span class="financial-health-modal-icon"><i class="fa-solid fa-shield-heart"></i></span><div><h2 id="financial-health-modal-title">재무 안전성 미니 시뮬레이터</h2><p>현금·만기 부채·영업현금·운전자본의 관계를 숫자로 연습해 보세요.</p></div></div>
        <button type="button" class="financial-health-modal-close" aria-label="재무 안전성 계산기 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="financial-health-simulator">
        <section class="financial-health-inputs">
          <div class="financial-health-section-heading"><span>STEP 1</span><h3>회사의 숫자를 넣어 보세요</h3><p>단위: 억 원</p></div>
          <div class="financial-health-input-grid">
            <label>현금·단기금융자산<input type="number" data-financial-health-input="cash" value="1200" min="0" step="100"></label>
            <label>1년 안 갚을 부채<input type="number" data-financial-health-input="shortDebt" value="600" min="0" step="100"></label>
            <label>영업활동 현금흐름<input type="number" data-financial-health-input="operatingCash" value="500" step="100"></label>
            <label>연간 이자비용<input type="number" data-financial-health-input="interest" value="80" min="0" step="10"></label>
            <label>올해 재고·외상값<input type="number" data-financial-health-input="workingCapital" value="900" min="0" step="100"></label>
            <label>작년 재고·외상값<input type="number" data-financial-health-input="previousWorkingCapital" value="750" min="0" step="100"></label>
            <label>올해 매출<input type="number" data-financial-health-input="sales" value="5000" min="0" step="500"></label>
            <label>작년 매출<input type="number" data-financial-health-input="previousSales" value="4500" min="0" step="500"></label>
          </div>
        </section>
        <section class="financial-health-results" aria-live="polite">
          <article><span>단기 부채 대비 현금</span><strong data-financial-health-output="liquidity"></strong><small>현금 ÷ 1년 안 갚을 부채</small></article>
          <article><span>이자 감당 여력</span><strong data-financial-health-output="interestCoverage"></strong><small>영업현금 ÷ 이자비용</small></article>
          <article><span>운전자본 증감</span><strong data-financial-health-output="workingCapitalGrowth"></strong><small>재고·외상값의 전년 대비 변화</small></article>
          <article><span>매출 증감</span><strong data-financial-health-output="salesGrowth"></strong><small>매출의 전년 대비 변화</small></article>
        </section>
        <section class="financial-health-reading" aria-live="polite">
          <div class="financial-health-section-heading"><span>STEP 2</span><h3>이 숫자를 이렇게 읽어 보세요</h3><p data-financial-health-status></p></div>
          <div class="financial-health-checks">
            <p data-financial-health-check="liquidity"></p><p data-financial-health-check="interest"></p><p data-financial-health-check="workingCapital"></p>
          </div>
        </section>
        <section class="financial-health-examples" aria-live="polite">
          <div class="financial-health-section-heading"><span>STEP 3</span><h3>함께 살펴볼 섹터·종목 예시</h3><p>학습용 비교 후보</p></div>
          <p data-financial-health-example-intro></p>
          <div class="financial-health-example-cards" data-financial-health-example-cards></div>
        </section>
        <footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>
      </div>
    </section>`;
  document.body.appendChild(modal);

  const closeButton = modal.querySelector('.financial-health-modal-close');
  let lastFocused = null;
  const format = (amount, digits = 1) => Number(amount).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const update = () => {
    const value = (name) => Number(modal.querySelector(`[data-financial-health-input="${name}"]`).value) || 0;
    const cash = value('cash'); const shortDebt = value('shortDebt'); const operatingCash = value('operatingCash'); const interest = value('interest');
    const workingCapital = value('workingCapital'); const previousWorkingCapital = value('previousWorkingCapital'); const sales = value('sales'); const previousSales = value('previousSales');
    const liquidity = shortDebt ? cash / shortDebt : null;
    const interestCoverage = interest ? operatingCash / interest : null;
    const workingCapitalGrowth = previousWorkingCapital ? (workingCapital - previousWorkingCapital) / previousWorkingCapital * 100 : null;
    const salesGrowth = previousSales ? (sales - previousSales) / previousSales * 100 : null;
    const workingCapitalFaster = workingCapitalGrowth !== null && salesGrowth !== null && workingCapitalGrowth > salesGrowth + 5;
    const isCautious = (liquidity !== null && liquidity < 1) || (interestCoverage !== null && interestCoverage < 1) || workingCapitalFaster;
    modal.querySelector('[data-financial-health-output="liquidity"]').textContent = liquidity === null ? '부채 없음' : `${format(liquidity, 2)}배`;
    modal.querySelector('[data-financial-health-output="interestCoverage"]').textContent = interestCoverage === null ? '이자 없음' : `${format(interestCoverage, 1)}배`;
    modal.querySelector('[data-financial-health-output="workingCapitalGrowth"]').textContent = workingCapitalGrowth === null ? '비교 불가' : `${format(workingCapitalGrowth)}%`;
    modal.querySelector('[data-financial-health-output="salesGrowth"]').textContent = salesGrowth === null ? '비교 불가' : `${format(salesGrowth)}%`;
    modal.querySelector('[data-financial-health-status]').textContent = isCautious ? '추가 확인이 필요한 모습' : '숫자상 완충 여력을 확인하는 모습';
    modal.querySelector('[data-financial-health-check="liquidity"]').textContent = liquidity === null ? '단기 부채가 0이면 현금 비율을 계산할 필요가 적습니다. 다른 부채의 만기와 약정을 확인하세요.' : liquidity >= 1.5 ? `현금이 1년 안 갚을 부채의 ${format(liquidity, 1)}배입니다. 단기 상환에 쓸 완충 여력이 있는지 보는 출발점입니다.` : `현금이 1년 안 갚을 부채의 ${format(liquidity, 1)}배입니다. 만기 연장 가능성, 추가 현금 유입, 단기금융자산을 공시에서 확인하세요.`;
    modal.querySelector('[data-financial-health-check="interest"]').textContent = interestCoverage === null ? '이자비용이 0으로 입력됐습니다. 리스료·차입금 등 실제 고정 지급 부담도 따로 확인하세요.' : interestCoverage >= 3 ? `영업현금이 이자비용의 약 ${format(interestCoverage, 1)}배입니다. 이자만 놓고 보면 현금으로 감당할 여지를 살펴볼 수 있습니다.` : `영업현금이 이자비용의 약 ${format(interestCoverage, 1)}배입니다. 이익이 아닌 실제 영업현금이 계속 들어오는지와 차입 만기를 함께 봅니다.`;
    modal.querySelector('[data-financial-health-check="workingCapital"]').textContent = workingCapitalGrowth === null || salesGrowth === null ? '전년 수치를 입력하면 재고·외상값 증가 속도와 매출 증가 속도를 비교할 수 있습니다.' : workingCapitalFaster ? `재고·외상값은 ${format(workingCapitalGrowth)}% 늘어 매출 증가율 ${format(salesGrowth)}%보다 빠릅니다. 재고가 쌓이거나 대금을 늦게 받는 이유를 확인하세요.` : `재고·외상값 증가율 ${format(workingCapitalGrowth)}%와 매출 증가율 ${format(salesGrowth)}%를 비교했습니다. 매출 성장만큼 현금이 묶이지 않는지도 다음 분기에 이어서 봅니다.`;
    const examples = isCautious
      ? { intro: '현금과 만기, 운전자본이 중요하게 읽히는 업종의 공시를 비교해 보세요.', cards: [['유통·제조', '이마트 · 현대모비스', '재고·매출채권이 현금흐름과 어떻게 함께 움직이는지 확인'], ['설비투자형 산업', '두산에너빌리티 · 한화오션', '수주·설비투자·차입금 만기와 영업현금흐름을 함께 확인']] }
      : { intro: '현금 창출력과 자본 배분을 함께 확인해 볼 수 있는 업종의 공시를 비교해 보세요.', cards: [['통신·필수소비재', 'KT · KT&G', '반복적인 현금흐름, 배당과 투자 지출의 균형을 확인'], ['대형 IT·플랫폼', '삼성전자 · NAVER', '현금 보유와 설비·연구개발 투자 사이의 균형을 확인']] };
    modal.querySelector('[data-financial-health-example-intro]').textContent = examples.intro;
    modal.querySelector('[data-financial-health-example-cards]').innerHTML = examples.cards.map(([sector, stocks, point]) => `<article><span>${sector}</span><strong>${stocks}</strong><p>${point}</p></article>`).join('');
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-financial-health-input]').forEach((input) => input.addEventListener('input', update));
  modal.querySelector('[data-financial-health-reset]').addEventListener('click', () => { modal.querySelectorAll('[data-financial-health-input]').forEach((input) => { input.value = input.defaultValue; }); update(); });
  update();
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installRoeEpsSimulator(root, docId) {
  const trigger = root.querySelector('[data-roe-eps-simulator]');
  if (docId !== '04' || !trigger) return;

  const modal = document.createElement('div');
  modal.className = 'roe-eps-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'roe-eps-modal-title');
  modal.innerHTML = `
    <section class="roe-eps-modal">
      <header class="roe-eps-modal-header">
        <div><span class="roe-eps-modal-icon"><i class="fa-solid fa-chart-pie"></i></span><div><h2 id="roe-eps-modal-title">ROE·EPS 미니 계산기</h2><p>같은 순이익도 자본과 주식 수에 따라 다르게 읽히는 이유를 확인하세요.</p></div></div>
        <button type="button" class="roe-eps-modal-close" aria-label="ROE EPS 계산기 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="roe-eps-simulator">
        <section class="roe-eps-inputs"><div class="roe-eps-section-heading"><span>STEP 1</span><h3>숫자를 바꿔 보세요</h3><p>금액: 억 원 · 주식 수: 만 주</p></div><div class="roe-eps-input-grid">
          <label>당기순이익<input type="number" data-roe-eps-input="netIncome" value="100" step="10"></label>
          <label>기초 자기자본<input type="number" data-roe-eps-input="beginningEquity" value="900" step="100"></label>
          <label>기말 자기자본<input type="number" data-roe-eps-input="endingEquity" value="1100" step="100"></label>
          <label>보통주주 귀속 순이익<input type="number" data-roe-eps-input="commonIncome" value="100" step="10"></label>
          <label>가중평균 주식 수<input type="number" data-roe-eps-input="shares" value="100" min="1" step="10"></label>
        </div></section>
        <section class="roe-eps-results" aria-live="polite">
          <div><span>평균 자기자본</span><strong data-roe-eps-output="averageEquity"></strong><small>(기초 + 기말) ÷ 2</small></div>
          <div class="highlight"><span>ROE</span><strong data-roe-eps-output="roe"></strong><small>당기순이익 ÷ 평균 자기자본</small></div>
          <div class="highlight blue"><span>EPS</span><strong data-roe-eps-output="eps"></strong><small>보통주주 귀속 순이익 ÷ 주식 수</small></div>
        </section>
        <section class="roe-eps-formulas"><div class="roe-eps-section-heading"><span>STEP 2</span><h3>계산 과정</h3></div><ol>
          <li><b>평균 자기자본</b><span data-roe-eps-formula="averageEquity"></span></li>
          <li class="roe-formula"><b>ROE</b><span data-roe-eps-formula="roe"></span></li>
          <li class="eps-formula"><b>EPS</b><span data-roe-eps-formula="eps"></span></li>
        </ol></section>
        <footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>
      </div>
    </section>`;
  document.body.appendChild(modal);
  const closeButton = modal.querySelector('.roe-eps-modal-close');
  let lastFocused = null;
  const format = (amount, digits = 0) => Number(amount).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const update = () => {
    const value = (name) => Number(modal.querySelector(`[data-roe-eps-input="${name}"]`).value) || 0;
    const netIncome = value('netIncome');
    const beginningEquity = value('beginningEquity');
    const endingEquity = value('endingEquity');
    const commonIncome = value('commonIncome');
    const shares = value('shares');
    const averageEquity = (beginningEquity + endingEquity) / 2;
    const roe = averageEquity ? netIncome / averageEquity * 100 : 0;
    const eps = shares ? commonIncome * 10000 / shares : 0;
    modal.querySelector('[data-roe-eps-output="averageEquity"]').textContent = `${format(averageEquity)}억 원`;
    modal.querySelector('[data-roe-eps-output="roe"]').textContent = `${format(roe, 1)}%`;
    modal.querySelector('[data-roe-eps-output="eps"]').textContent = `${format(eps)}원`;
    modal.querySelector('[data-roe-eps-formula="averageEquity"]').textContent = `(${format(beginningEquity)}억 원 + ${format(endingEquity)}억 원) ÷ 2 = ${format(averageEquity)}억 원`;
    modal.querySelector('[data-roe-eps-formula="roe"]').textContent = `${format(netIncome)}억 원 ÷ ${format(averageEquity)}억 원 × 100 = ${format(roe, 1)}%`;
    modal.querySelector('[data-roe-eps-formula="eps"]').textContent = `${format(commonIncome)}억 원 ÷ ${format(shares)}만 주 = ${format(eps)}원`;
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-roe-eps-input]').forEach((input) => input.addEventListener('input', update));
  modal.querySelector('[data-roe-eps-reset]').addEventListener('click', () => { modal.querySelectorAll('[data-roe-eps-input]').forEach((input) => { input.value = input.defaultValue; }); update(); });
  update();
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installDcfSimulator(root, docId) {
  const trigger = root.querySelector('[data-dcf-simulator]');
  if (docId !== '04' || !trigger) return;

  const modal = document.createElement('div');
  modal.className = 'dcf-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'dcf-modal-title');
  modal.innerHTML = `
    <section class="dcf-modal">
      <header class="dcf-modal-header"><div><span class="dcf-modal-icon"><i class="fa-solid fa-coins"></i></span><div><h2 id="dcf-modal-title">DCF 미니 계산기</h2><p>미래 현금을 오늘의 가치로 바꾸는 과정을 연습해 보세요.</p></div></div><button type="button" class="dcf-modal-close" aria-label="DCF 계산기 닫기"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="dcf-simulator">
        <section class="dcf-inputs"><div class="dcf-section-heading"><span>STEP 1</span><h3>가정을 입력하세요</h3><p>현금흐름: 억 원 · 비율: %</p></div><div class="dcf-input-grid">
          <label>올해 잉여현금흐름<input type="number" data-dcf-input="freeCashFlow" value="1000" min="0" step="100"></label>
          <label>향후 5년 성장률<input type="number" data-dcf-input="growthRate" value="8" step="1"></label>
          <label>할인율(WACC 예시)<input type="number" data-dcf-input="discountRate" value="10" min="0.1" step="1"><small>미래 돈을 오늘값으로 낮추는 비율</small></label>
          <label>영구성장률<input type="number" data-dcf-input="terminalGrowth" value="3" step="0.5"><small>5년 뒤 장기 성장 가정</small></label>
        </div></section>
        <section class="dcf-results" aria-live="polite"><div><span>5년 현금흐름 현재가치</span><strong data-dcf-output="forecastValue"></strong><small>1~5년 현금흐름을 할인한 합계</small></div><div><span>터미널가치 현재가치</span><strong data-dcf-output="terminalValue"></strong><small>6년 이후 현금흐름의 오늘값</small></div><div class="highlight"><span>기업가치 예시</span><strong data-dcf-output="enterpriseValue"></strong><small>두 현재가치의 합계</small></div></section>
        <section class="dcf-forecast"><div class="dcf-section-heading"><span>STEP 2</span><h3>5년 뒤 현금을 오늘값으로 바꾸기</h3></div><div class="dcf-forecast-grid" data-dcf-forecast></div></section>
        <section class="dcf-formula"><div class="dcf-section-heading"><span>STEP 3</span><h3>터미널가치 계산</h3></div><p data-dcf-formula="terminal"></p><small>할인율은 영구성장률보다 커야 단순 모델에서 계산할 수 있습니다.</small></section>
        <footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>
      </div>
    </section>`;
  document.body.appendChild(modal);
  const closeButton = modal.querySelector('.dcf-modal-close');
  let lastFocused = null;
  const format = (amount, digits = 0) => Number(amount).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const update = () => {
    const value = (name) => Number(modal.querySelector(`[data-dcf-input="${name}"]`).value) || 0;
    const freeCashFlow = value('freeCashFlow');
    const growthRate = value('growthRate') / 100;
    const discountRate = value('discountRate') / 100;
    const terminalGrowth = value('terminalGrowth') / 100;
    const forecasts = Array.from({ length: 5 }, (_, index) => {
      const year = index + 1;
      const cashFlow = freeCashFlow * (1 + growthRate) ** year;
      return { year, cashFlow, presentValue: cashFlow / (1 + discountRate) ** year };
    });
    const forecastValue = forecasts.reduce((sum, row) => sum + row.presentValue, 0);
    const finalCashFlow = forecasts.at(-1).cashFlow;
    const validTerminal = discountRate > terminalGrowth;
    const terminalValueAtYear5 = validTerminal ? finalCashFlow * (1 + terminalGrowth) / (discountRate - terminalGrowth) : 0;
    const terminalValue = validTerminal ? terminalValueAtYear5 / (1 + discountRate) ** 5 : 0;
    modal.querySelector('[data-dcf-output="forecastValue"]').textContent = `${format(forecastValue)}억 원`;
    modal.querySelector('[data-dcf-output="terminalValue"]').textContent = validTerminal ? `${format(terminalValue)}억 원` : '산정 어려움';
    modal.querySelector('[data-dcf-output="enterpriseValue"]').textContent = validTerminal ? `${format(forecastValue + terminalValue)}억 원` : '산정 어려움';
    modal.querySelector('[data-dcf-forecast]').innerHTML = forecasts.map(({ year, cashFlow, presentValue }) => `<div><span>${year}년차</span><b>FCF ${format(cashFlow)}억</b><strong>오늘값 ${format(presentValue)}억</strong></div>`).join('');
    modal.querySelector('[data-dcf-formula="terminal"]').textContent = validTerminal
      ? `5년 뒤 현금흐름 ${format(finalCashFlow)}억 원 × (1 + ${format(terminalGrowth * 100, 1)}%) ÷ (${format(discountRate * 100, 1)}% − ${format(terminalGrowth * 100, 1)}%) = 5년 시점 ${format(terminalValueAtYear5)}억 원 → 오늘값 ${format(terminalValue)}억 원`
      : '할인율을 영구성장률보다 크게 입력해 주세요.';
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-dcf-input]').forEach((input) => input.addEventListener('input', update));
  modal.querySelector('[data-dcf-reset]').addEventListener('click', () => { modal.querySelectorAll('[data-dcf-input]').forEach((input) => { input.value = input.defaultValue; }); update(); });
  update();
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installMacroNewsSimulator(root, docId) {
  const trigger = root.querySelector('[data-macro-news-simulator]');
  if (docId !== '03' || !trigger) return;

  const modal = document.createElement('div');
  modal.className = 'macro-news-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'macro-news-modal-title');
  modal.innerHTML = `
    <section class="macro-news-modal">
      <header class="macro-news-modal-header">
        <div><span class="macro-news-modal-icon"><i class="fa-solid fa-chart-line"></i></span><div><h2 id="macro-news-modal-title">경제 뉴스 미니 시뮬레이션</h2><p>숫자를 움직여 업종별 영향을 비교해 보세요.</p></div></div>
        <button type="button" class="macro-news-modal-close" aria-label="시뮬레이션 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="macro-news-controls">
        <label>금리 <output data-output="rate">0</output><input type="range" data-factor="rate" min="-2" max="2" step="1" value="0" aria-label="금리 변화"></label>
        <label>물가 <output data-output="inflation">0</output><input type="range" data-factor="inflation" min="-2" max="2" step="1" value="0" aria-label="물가 변화"></label>
        <label>환율 <output data-output="fx">0</output><input type="range" data-factor="fx" min="-2" max="2" step="1" value="0" aria-label="환율 변화"></label>
        <label>수출 <output data-output="exports">0</output><input type="range" data-factor="exports" min="-2" max="2" step="1" value="0" aria-label="수출 변화"></label>
      </div>
      <div class="macro-news-canvas-wrap"><canvas class="macro-news-canvas" height="270" aria-label="업종별 예상 영향 그래프"></canvas></div>
      <p class="macro-news-insight" aria-live="polite"></p>
      <p class="macro-news-disclaimer">학습용 단순 모델입니다. 실제 주가·수익률을 예측하거나 투자 판단을 제시하지 않습니다.</p>
    </section>`;
  document.body.appendChild(modal);

  const canvas = modal.querySelector('.macro-news-canvas');
  const insight = modal.querySelector('.macro-news-insight');
  const closeButton = modal.querySelector('.macro-news-modal-close');
  const state = { rate: 0, inflation: 0, fx: 0, exports: 0 };
  let lastFocused = null;

  const impacts = () => [
    { label: '수출 제조', value: -0.35 * state.rate - 0.25 * state.inflation + 0.85 * state.fx + 1.05 * state.exports },
    { label: '금융', value: 0.9 * state.rate - 0.35 * state.inflation - 0.1 * state.fx + 0.15 * state.exports },
    { label: '내수 소비', value: -0.75 * state.rate - 0.9 * state.inflation - 0.1 * state.fx + 0.35 * state.exports },
    { label: '수입 원가', value: -0.2 * state.rate - 0.95 * state.inflation - 1.0 * state.fx + 0.15 * state.exports },
  ];

  const draw = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(300, canvas.parentElement.clientWidth - 2);
    const height = 270;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);
    const pad = { left: 76, right: 26, top: 35, bottom: 26 };
    const chartWidth = width - pad.left - pad.right;
    const rows = impacts();
    const zeroX = pad.left + chartWidth / 2;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(zeroX, pad.top - 10); ctx.lineTo(zeroX, height - pad.bottom); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('부정적 영향', pad.left + chartWidth * .24, 18);
    ctx.fillText('긍정적 영향', pad.left + chartWidth * .76, 18);
    rows.forEach((row, index) => {
      const y = pad.top + index * 52;
      const amount = Math.max(-2.8, Math.min(2.8, row.value));
      const barWidth = Math.abs(amount) / 2.8 * (chartWidth / 2 - 8);
      const positive = amount >= 0;
      ctx.fillStyle = positive ? '#ef476f' : '#3979dc';
      ctx.fillRect(positive ? zeroX : zeroX - barWidth, y, barWidth, 28);
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'right';
      ctx.font = '700 12px Pretendard, sans-serif';
      ctx.fillText(row.label, pad.left - 12, y + 19);
      ctx.fillStyle = positive ? '#be123c' : '#1d4ed8';
      ctx.textAlign = positive ? 'left' : 'right';
      ctx.font = '700 11px Pretendard, sans-serif';
      const score = `${positive ? '+' : ''}${amount.toFixed(1)}`;
      ctx.fillText(score, positive ? zeroX + barWidth + 7 : zeroX - barWidth - 7, y + 19);
    });
    const best = [...rows].sort((a, b) => b.value - a.value)[0];
    const worst = [...rows].sort((a, b) => a.value - b.value)[0];
    insight.innerHTML = `<strong>${best.label}</strong>이(가) 상대적으로 유리하고, <strong>${worst.label}</strong>은(는) 부담이 큰 시나리오입니다. 영향 점수는 ${best.value.toFixed(1)} ~ ${worst.value.toFixed(1)}입니다.`;
  };

  const closeModal = () => {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
    lastFocused?.focus();
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape' && modal.classList.contains('show')) closeModal();
  };
  trigger.addEventListener('click', () => {
    lastFocused = trigger;
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    draw();
    closeButton.focus();
  });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('input[data-factor]').forEach((input) => {
    input.addEventListener('input', () => {
      state[input.dataset.factor] = Number(input.value);
      modal.querySelector(`[data-output="${input.dataset.factor}"]`).value = input.value > 0 ? `+${input.value}` : input.value;
      draw();
    });
  });
  window.addEventListener('resize', draw);
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => {
    previousCleanup?.();
    window.removeEventListener('resize', draw);
    document.removeEventListener('keydown', onKeydown);
    modal.remove();
  };
}

function installRsiMacdSimulator(root, docId) {
  const trigger = root.querySelector('[data-rsi-macd-simulator]');
  if (docId !== '05' || !trigger) return;
  const modal = document.createElement('div');
  modal.className = 'rsi-macd-modal-backdrop';
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'rsi-macd-modal-title');
  modal.innerHTML = `
    <section class="rsi-macd-modal">
      <header class="rsi-macd-modal-header"><div><span class="rsi-macd-modal-icon"><i class="fa-solid fa-wave-square"></i></span><div><h2 id="rsi-macd-modal-title">RSI·MACD 흐름 시뮬레이터</h2><p>슬라이더 2개만 움직여 보세요. 가격 흐름이 바뀌면 RSI·MACD가 어떻게 따라 바뀌는지 바로 보입니다.</p></div></div><button type="button" class="rsi-macd-modal-close" aria-label="RSI MACD 시뮬레이터 닫기"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="rsi-macd-simulator">
        <section class="rsi-macd-inputs"><div class="rsi-macd-input-grid">
          <label>가격 방향(추세)<input type="range" data-rsi-macd-input="trend" value="0.6" min="-3" max="3" step="0.1"><output data-rsi-macd-output="trend"></output></label>
          <label>흔들림(변동성)<input type="range" data-rsi-macd-input="volatility" value="0.8" min="0" max="3" step="0.1"><output data-rsi-macd-output="volatility"></output></label>
        </div></section>
        <section class="rsi-macd-chart-wrap"><canvas data-rsi-macd-chart aria-label="가상 가격과 MACD 흐름 차트"></canvas></section>
        <section class="rsi-macd-guide" aria-label="차트 읽는 법">
          <p><i style="background:#2563eb"></i><b>파란 선 = 가상 종가</b> — 슬라이더로 만든 30일 동안의 가격 흐름이에요. 위 칸이 가격, 아래 칸이 MACD예요.</p>
          <p><i style="background:#7c3aed"></i><b>보라 선 = MACD</b> — 최근 12일 평균 가격에서 26일 평균 가격을 뺀 값이에요. 0보다 위면 최근 가격이 예전 평균보다 높은 쪽, 즉 오르는 힘이 우세하다는 뜻이에요.</p>
          <p><i style="background:#f59e0b"></i><b>주황 선 = 시그널</b> — MACD를 다시 9일 동안 평균 낸 ‘느린 선’이에요. MACD가 잠깐 튄 것인지, 방향이 정말 바뀌는지 가늠하는 기준선이에요.</p>
          <p><b>읽는 법</b> — 보라 선이 주황 선을 아래에서 위로 넘으면 오르는 힘이 강해지는 신호, 위에서 아래로 내려가면 약해지는 신호로 참고해요. 어디까지나 참고 신호이지 매수·매도 결정은 아니에요.</p>
        </section>
        <section class="rsi-macd-results" aria-live="polite">
          <article><span>RSI</span><strong data-rsi-macd-output="rsi"></strong><small data-rsi-macd-badge></small></article>
          <article><span>MACD</span><strong data-rsi-macd-output="histogram"></strong><small data-rsi-macd-macd-badge></small></article>
        </section>
        <p class="rsi-macd-plain" data-rsi-macd-reading></p>
        <details class="rsi-macd-detail"><summary>계산 과정 자세히 보기</summary><ol><li><b>RSI</b><span data-rsi-macd-formula="rsi"></span></li><li><b>MACD</b><span data-rsi-macd-formula="macd"></span></li></ol></details>
        <footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>
      </div>
    </section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('[data-rsi-macd-chart]'); const closeButton = modal.querySelector('.rsi-macd-modal-close');
  let lastFocused = null;
  const format = (value, digits = 1) => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const ema = (values, period) => values.reduce((series, value, index) => { series.push(index ? value * (2 / (period + 1)) + series[index - 1] * (1 - 2 / (period + 1)) : value); return series; }, []);
  const draw = (prices, macdValues, signalValues) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(400, canvas.parentElement.clientWidth - 2); const height = 270;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const plot = (values, top, heightValue, color) => { const low = Math.min(...values); const high = Math.max(...values); const range = Math.max(.0001, high - low); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); values.forEach((value, index) => { const x = 40 + index * (width - 56) / (values.length - 1); const y = top + (high - value) / range * heightValue; index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); };
    ctx.strokeStyle = '#e2e8f0'; ctx.beginPath(); ctx.moveTo(40, 142); ctx.lineTo(width - 16, 142); ctx.stroke(); plot(prices, 18, 108, '#2563eb'); plot(macdValues, 158, 88, '#7c3aed'); plot(signalValues, 158, 88, '#f59e0b');
    ctx.fillStyle = '#64748b'; ctx.font = '600 11px Pretendard, sans-serif'; ctx.fillText('가상 종가', 10, 24); ctx.fillText('MACD', 10, 164); ctx.fillStyle = '#f59e0b'; ctx.fillText('시그널', width - 50, 154);
  };
  const update = () => {
    const value = (name) => Number(modal.querySelector(`[data-rsi-macd-input="${name}"]`).value) || 0;
    const trend = value('trend'); const volatility = value('volatility');
    const prices = [50000]; for (let index = 1; index < 31; index += 1) { const wave = Math.sin(index * 1.71) * volatility + Math.cos(index * .63) * volatility * .45; prices.push(Math.max(1, prices.at(-1) * (1 + (trend + wave) / 100))); }
    const changes = prices.slice(1).map((current, index) => current - prices[index]); const recent = changes.slice(-14); const averageGain = recent.filter((change) => change > 0).reduce((sum, change) => sum + change, 0) / 14; const averageLoss = Math.abs(recent.filter((change) => change < 0).reduce((sum, change) => sum + change, 0)) / 14;
    const rsi = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss); const fast = ema(prices, 12); const slow = ema(prices, 26); const macdValues = prices.map((_, index) => fast[index] - slow[index]); const signalValues = ema(macdValues, 9); const macd = macdValues.at(-1); const signal = signalValues.at(-1); const histogram = macd - signal;
    modal.querySelector('[data-rsi-macd-output="trend"]').value = `${trend >= 0 ? '+' : ''}${format(trend)}%`; modal.querySelector('[data-rsi-macd-output="volatility"]').value = `${format(volatility)}%`;
    modal.querySelector('[data-rsi-macd-output="rsi"]').textContent = format(rsi, 0);
    modal.querySelector('[data-rsi-macd-output="histogram"]').textContent = histogram >= 0 ? '상승 강화' : '하락 강화';
    const rsiBadge = rsi >= 70 ? '과열 구간' : rsi <= 30 ? '침체 구간' : '중립 구간';
    modal.querySelector('[data-rsi-macd-badge]').textContent = rsiBadge;
    modal.querySelector('[data-rsi-macd-macd-badge]').textContent = histogram >= 0 ? '단기선이 위' : '단기선이 아래';
    const rsiReading = rsi >= 70 ? '최근 상승폭이 커 RSI가 높은 구간입니다. 과열을 확정하는 숫자는 아니며, 강한 상승 추세에서는 높은 RSI가 이어질 수 있습니다.' : rsi <= 30 ? '최근 하락폭이 커 RSI가 낮은 구간입니다. 반등을 보장하지 않으므로 지지 구간과 거래량을 함께 봅니다.' : 'RSI가 중간 범위라 상승·하락 속도만으로는 방향을 판단하기 어렵습니다.';
    modal.querySelector('[data-rsi-macd-reading]').textContent = `${rsiReading} MACD는 ${histogram >= 0 ? '단기 평균이 장기 평균보다 위에서 더 벌어지는 중' : '단기 평균이 장기 평균보다 아래에서 더 벌어지는 중'}입니다.`;
    modal.querySelector('[data-rsi-macd-formula="rsi"]').textContent = `최근 14일 평균 상승폭 ${format(averageGain, 0)}원, 평균 하락폭 ${format(averageLoss, 0)}원 → RSI ${format(rsi, 1)}`;
    modal.querySelector('[data-rsi-macd-formula="macd"]').textContent = `12일 EMA ${format(fast.at(-1), 0)}원 − 26일 EMA ${format(slow.at(-1), 0)}원 = ${format(macd, 0)} · 시그널 ${format(signal, 0)}`;
    draw(prices, macdValues, signalValues);
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); update(); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-rsi-macd-input]').forEach((input) => input.addEventListener('input', update)); modal.querySelector('[data-rsi-macd-reset]').addEventListener('click', () => { modal.querySelectorAll('[data-rsi-macd-input]').forEach((input) => { input.value = input.defaultValue; }); update(); });
  window.addEventListener('resize', update); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); window.removeEventListener('resize', update); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installMaCrossSimulator(root, docId) {
  const trigger = root.querySelector('[data-ma-cross-simulator]');
  if (docId !== '05' || !trigger) return;
  const PERIODS = [5, 20, 60, 120];
  const COLORS = { 5: '#ef4444', 20: '#2563eb', 60: '#16a34a', 120: '#7c3aed' };
  const modal = document.createElement('div');
  modal.className = 'ma-cross-modal-backdrop';
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'ma-cross-modal-title');
  modal.innerHTML = `
    <section class="ma-cross-modal">
      <header class="ma-cross-modal-header">
        <div><span class="ma-cross-modal-icon"><i class="fa-solid fa-timeline"></i></span><div><h2 id="ma-cross-modal-title">이동평균 크로스 드로잉 시뮬레이터</h2><p>왼쪽에 가격 흐름을 직접 그리면 SMA·EMA(5·20·60·120)와 골든·데드크로스 구간을 확인합니다.</p></div></div>
        <button type="button" class="ma-cross-modal-close" aria-label="이동평균 크로스 시뮬레이터 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="ma-cross-toolbar"><span><i class="fa-solid fa-hand-pointer"></i> 왼쪽 영역을 길게 드래그해 가격선을 그려 보세요. (짧게 그리면 60·120일선은 계산되지 않습니다)</span><button type="button" data-ma-cross-clear><i class="fa-solid fa-eraser"></i> 지우기</button></div>
      <div class="ma-cross-legend">
        ${PERIODS.map((p) => `<span><i style="background:${COLORS[p]}"></i>SMA${p} 실선</span>`).join('')}
        <span><i style="background:#0f172a;border-radius:2px"></i>EMA 점선(동일 색상)</span>
        <span><i style="background:#f59e0b"></i>골든크로스</span>
        <span><i style="background:#1e293b"></i>데드크로스</span>
      </div>
      <div class="ma-cross-split">
        <section class="ma-cross-panel"><header><b>1. 내가 그린 가격 흐름</b><small>왼쪽 → 오른쪽은 시간, 위 → 아래는 가격</small></header><div class="ma-cross-canvas-wrap"><canvas data-ma-cross-input aria-label="가격 흐름을 직접 그리는 캔버스"></canvas></div></section>
        <section class="ma-cross-panel"><header><b>2. SMA·EMA와 크로스 구간</b><small>실선 SMA · 점선 EMA · 점은 크로스 발생 지점</small></header><div class="ma-cross-canvas-wrap"><canvas data-ma-cross-output aria-label="이동평균선과 크로스를 나타낸 캔버스"></canvas></div></section>
        <section class="ma-cross-stats" aria-live="polite"><header><b><i class="fa-solid fa-chart-simple"></i> 3. 이동평균별 평균·표준편차</b><small>그려진 구간 전체 기준</small></header><div class="ma-cross-stats-body" data-ma-cross-stats><p class="ma-cross-empty">선을 그리면 이동평균과 통계가 표시됩니다.</p></div></section>
      </div>
      <p class="ma-cross-note"><i class="fa-solid fa-circle-info"></i> SMA·EMA와 골든·데드크로스는 과거 가격을 정리해 보여 주는 참고 지표일 뿐, 매수·매도를 확정하거나 미래 가격을 보장하지 않습니다.</p>
    </section>`;
  document.body.appendChild(modal);

  const inputCanvas = modal.querySelector('[data-ma-cross-input]');
  const outputCanvas = modal.querySelector('[data-ma-cross-output]');
  const statsBody = modal.querySelector('[data-ma-cross-stats]');
  const closeButton = modal.querySelector('.ma-cross-modal-close');
  let points = [];
  let drawing = false;
  let lastFocused = null;

  const sizeCanvas = (canvas) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(280, canvas.parentElement.clientWidth - 2);
    const height = Math.max(280, Math.min(560, window.innerHeight * .5));
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  };
  const grid = (ctx, width, height, label) => {
    ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    for (let x = 38; x < width; x += (width - 54) / 6) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, height - 30); ctx.stroke(); }
    for (let y = 28; y < height - 20; y += (height - 58) / 5) { ctx.beginPath(); ctx.moveTo(38, y); ctx.lineTo(width - 16, y); ctx.stroke(); }
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 11px Pretendard, sans-serif'; ctx.fillText(label, 12, 17);
  };
  const drawInput = () => {
    const { ctx, width, height } = sizeCanvas(inputCanvas); grid(ctx, width, height, '가격');
    if (!points.length) {
      ctx.fillStyle = '#64748b'; ctx.font = '700 15px Pretendard, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('이 영역에 가격선을 그려 보세요', width / 2, height / 2 - 6);
      ctx.font = '500 12px Pretendard, sans-serif'; ctx.fillText('길게 그릴수록 장기 이동평균선까지 확인할 수 있어요', width / 2, height / 2 + 20); ctx.textAlign = 'start'; return;
    }
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
    points.forEach((point, index) => { const x = 38 + point.x * (width - 54); const y = 20 + point.y * (height - 50); index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  };
  const sma = (values, period) => values.map((_, index) => index < period - 1 ? null : values.slice(index - period + 1, index + 1).reduce((a, b) => a + b, 0) / period);
  const ema = (values, period) => {
    const k = 2 / (period + 1); let prev = null;
    return values.map((value, index) => {
      if (index < period - 1) return null;
      if (prev === null) { prev = values.slice(index - period + 1, index + 1).reduce((a, b) => a + b, 0) / period; return prev; }
      prev = value * k + prev * (1 - k); return prev;
    });
  };
  const meanStd = (arr) => {
    const valid = arr.filter((v) => v !== null);
    if (!valid.length) return { mean: null, std: null };
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    const std = Math.sqrt(valid.reduce((sum, v) => sum + (v - mean) ** 2, 0) / valid.length);
    return { mean, std };
  };
  const findCrosses = (shortArr, longArr) => {
    const crosses = [];
    for (let index = 1; index < shortArr.length; index += 1) {
      const s0 = shortArr[index - 1]; const s1 = shortArr[index]; const l0 = longArr[index - 1]; const l1 = longArr[index];
      if (s0 == null || s1 == null || l0 == null || l1 == null) continue;
      const prevDiff = s0 - l0; const currDiff = s1 - l1;
      if (prevDiff <= 0 && currDiff > 0) crosses.push({ index, type: 'golden' });
      else if (prevDiff >= 0 && currDiff < 0) crosses.push({ index, type: 'dead' });
    }
    return crosses;
  };
  const drawOutput = () => {
    const { ctx, width, height } = sizeCanvas(outputCanvas); grid(ctx, width, height, '주가');
    if (points.length < 2) { statsBody.innerHTML = '<p class="ma-cross-empty">선을 그리면 이동평균과 통계가 표시됩니다.</p>'; return; }
    const sampleCount = Math.max(40, Math.min(160, points.length));
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const closes = Array.from({ length: sampleCount }, (_, index) => {
      const x = index / (sampleCount - 1);
      const rightIndex = sorted.findIndex((point) => point.x >= x);
      let value;
      if (rightIndex < 0) value = sorted.at(-1).y;
      else if (rightIndex === 0) value = sorted[0].y;
      else { const left = sorted[rightIndex - 1]; const right = sorted[rightIndex]; const ratio = (x - left.x) / Math.max(.0001, right.x - left.x); value = left.y + (right.y - left.y) * ratio; }
      return 60 + (1 - value) * 80;
    });
    const smaLines = {}; const emaLines = {};
    PERIODS.forEach((period) => { smaLines[period] = sma(closes, period); emaLines[period] = ema(closes, period); });
    const allValues = [closes, ...Object.values(smaLines), ...Object.values(emaLines)].flat().filter((v) => v != null);
    const min = Math.min(...allValues) - 6; const max = Math.max(...allValues) + 6;
    const chartWidth = width - 58; const chartHeight = height - 54;
    const xFor = (index) => 42 + index * chartWidth / (sampleCount - 1);
    const yFor = (value) => 20 + (max - value) / (max - min) * chartHeight;

    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5; ctx.beginPath();
    closes.forEach((value, index) => { const x = xFor(index); const y = yFor(value); index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();

    const drawLine = (arr, color, dashed) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dashed ? [5, 3] : []);
      ctx.beginPath(); let started = false;
      arr.forEach((value, index) => { if (value == null) return; const x = xFor(index); const y = yFor(value); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
    };
    PERIODS.forEach((period) => drawLine(smaLines[period], COLORS[period], false));
    PERIODS.forEach((period) => drawLine(emaLines[period], COLORS[period], true));

    const pairs = [[5, 20], [20, 60], [60, 120]];
    const markCrosses = (shortArr, longArr) => {
      findCrosses(shortArr, longArr).forEach(({ index, type }) => {
        const x = xFor(index); const y = yFor(shortArr[index]);
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = type === 'golden' ? '#f59e0b' : '#1e293b'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      });
    };
    pairs.forEach(([shortPeriod, longPeriod]) => { markCrosses(smaLines[shortPeriod], smaLines[longPeriod]); markCrosses(emaLines[shortPeriod], emaLines[longPeriod]); });

    const rows = [
      ...PERIODS.map((period) => ({ label: `SMA${period}`, color: COLORS[period], ...meanStd(smaLines[period]) })),
      ...PERIODS.map((period) => ({ label: `EMA${period}`, color: COLORS[period], ...meanStd(emaLines[period]) })),
    ];
    statsBody.innerHTML = rows.map((row) => `<div class="ma-cross-stat-row"><span class="ma-cross-stat-dot" style="background:${row.color}"></span><b>${row.label}</b><span>평균 ${row.mean != null ? row.mean.toFixed(1) : '-'}</span><span>표준편차 ${row.std != null ? row.std.toFixed(1) : '-'}</span></div>`).join('');
  };
  const redraw = () => { drawInput(); drawOutput(); };
  const pointFromEvent = (event) => {
    const rect = inputCanvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left - 38) / Math.max(1, rect.width - 54))), y: Math.max(0, Math.min(1, (event.clientY - rect.top - 20) / Math.max(1, rect.height - 50))) };
  };
  inputCanvas.addEventListener('pointerdown', (event) => { drawing = true; points = [pointFromEvent(event)]; inputCanvas.setPointerCapture(event.pointerId); redraw(); });
  inputCanvas.addEventListener('pointermove', (event) => { if (!drawing) return; const point = pointFromEvent(event); const previous = points.at(-1); if (!previous || point.x - previous.x > .002) { points.push(point); redraw(); } });
  inputCanvas.addEventListener('pointerup', () => { drawing = false; redraw(); });
  modal.querySelector('[data-ma-cross-clear]').addEventListener('click', () => { points = []; redraw(); });
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', (event) => { event.preventDefault(); lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); redraw(); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  const handleResize = () => { if (modal.classList.contains('show')) redraw(); };
  window.addEventListener('resize', handleResize);
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); window.removeEventListener('resize', handleResize); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installTermModal(root, docId) {
  if (docId !== '05') return;
  const PHRASE = 'Convergence Divergence';
  const heading = [...root.querySelectorAll('h2, h3')].find((h) => h.textContent.includes(PHRASE));
  if (!heading) return;
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const textNode = [...(function* () { let n; while ((n = walker.nextNode())) yield n; })()].find((n) => n.nodeValue.includes(PHRASE));
  if (!textNode) return;
  const index = textNode.nodeValue.indexOf(PHRASE);
  const before = textNode.nodeValue.slice(0, index);
  const after = textNode.nodeValue.slice(index + PHRASE.length);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'vocabulary-term term-trigger';
  trigger.dataset.termModal = 'convergence-divergence';
  trigger.setAttribute('aria-label', `${PHRASE} 용어 설명 보기`);
  trigger.textContent = PHRASE;
  const fragment = document.createDocumentFragment();
  if (before) fragment.append(before);
  fragment.append(trigger);
  if (after) fragment.append(after);
  textNode.replaceWith(fragment);

  const modal = document.createElement('div');
  modal.className = 'vocabulary-modal-backdrop';
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'term-modal-cd-title');
  modal.innerHTML = `
    <section class="vocabulary-modal">
      <header class="vocabulary-modal-header">
        <div><span class="vocabulary-modal-icon"><i class="fa-solid fa-arrows-left-right-to-line"></i></span><div><p>주식 용어 바로 알기</p><h2 id="term-modal-cd-title">수렴(Convergence)과 발산(Divergence)</h2></div></div>
        <button type="button" class="vocabulary-modal-close" aria-label="설명 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="vocabulary-modal-content">
        <p>수렴(Convergence)과 발산(Divergence)은 두 개 이상의 요소가 하나의 점으로 모이거나(수렴), 반대로 서로 멀어지며 갈라지는 현상(발산)을 뜻합니다. 분야에 따라 핵심 의미가 달라집니다.</p>
        <section><h3><i class="fa-solid fa-chart-line"></i> 주식/트레이딩 (MACD)</h3><p>이동평균 수렴·발산 지표(MACD)에서 <b>수렴</b>은 단기/장기 이동평균선이 가까워지는 상태(추세 약화)를, <b>발산</b>은 두 선이 멀어지는 상태(추세 강화)를 의미합니다. 주가 방향과 지표 방향이 반대로 움직이는 '다이버전스(Divergence)'는 추세 전환 신호로 활용됩니다.</p></section>
        <section><h3><i class="fa-solid fa-square-root-variable"></i> 수학 및 미적분학</h3><p><b>수렴</b>은 수열이나 무한급수가 특정 수치에 한없이 가까워지는 상태를 뜻하며, <b>발산</b>은 값이 무한히 커지거나 특정한 값으로 모이지 않고 진동하는 상태를 의미합니다.</p></section>
        <section><h3><i class="fa-solid fa-dna"></i> 진화생물학</h3><p><b>수렴 진화</b>는 서로 다른 종이 비슷한 환경에 적응하며 닮아가는 현상(예: 새와 박쥐의 날개)이며, <b>분산(발산) 진화</b>는 같은 조상에서 갈라져 나온 종들이 서로 다른 형질로 변하는 현상입니다.</p></section>
        <section><h3><i class="fa-solid fa-lightbulb"></i> 광학 (렌즈)</h3><p>빛을 한 곳으로 모으는 렌즈를 <b>수렴렌즈(볼록렌즈)</b>, 빛을 퍼뜨리는 렌즈를 발산렌즈(오목렌즈)라고 합니다.</p></section>
      </div>
    </section>`;
  document.body.appendChild(modal);

  const closeButton = modal.querySelector('.vocabulary-modal-close');
  let lastFocused = null;
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installAtrSimulator(root, docId) {
  const trigger = root.querySelector('[data-atr-simulator]');
  if (docId !== '05' || !trigger) return;
  const modal = document.createElement('div');
  modal.className = 'atr-modal-backdrop';
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'atr-modal-title');
  modal.innerHTML = `
    <section class="atr-modal">
      <header class="atr-modal-header"><div><span class="atr-modal-icon"><i class="fa-solid fa-gauge-high"></i></span><div><h2 id="atr-modal-title">ATR 변동성 시뮬레이터</h2><p>슬라이더 2개만 움직여 보세요. 가격이 얼마나 거세게 흔들리는지(ATR)가 바로 바뀝니다.</p></div></div><button type="button" class="atr-modal-close" aria-label="ATR 시뮬레이터 닫기"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="atr-simulator">
        <section class="atr-howto" aria-label="사용법">
          <b>이렇게 써 보세요</b>
          <ol>
            <li><b>가격 방향(추세)</b> 슬라이더를 오른쪽으로 밀면 매일 조금씩 오르는 흐름, 왼쪽으로 밀면 내리는 흐름이 만들어져요.</li>
            <li><b>흔들림(변동성)</b> 슬라이더를 오른쪽으로 밀수록 하루하루 가격이 크게 출렁여요.</li>
            <li>아래 차트와 숫자가 바로 바뀌어요. <b>흔들림만 키워도 ATR이 커지고, 방향만 바꿔도 ATR은 거의 그대로</b>인 것을 직접 확인해 보세요.</li>
          </ol>
        </section>
        <section class="atr-inputs"><div class="atr-input-grid">
          <label>가격 방향(추세)<input type="range" data-atr-input="trend" value="0.6" min="-3" max="3" step="0.1"><output data-atr-output="trend"></output></label>
          <label>흔들림(변동성)<input type="range" data-atr-input="volatility" value="0.8" min="0.1" max="3" step="0.1"><output data-atr-output="volatility"></output></label>
        </div></section>
        <section class="atr-chart-wrap"><canvas data-atr-chart aria-label="가상 캔들과 ATR 흐름 차트"></canvas></section>
        <section class="atr-guide" aria-label="차트 읽는 법">
          <p><i style="background:#e11d48"></i><b>위 칸 = 30일 가상 캔들</b> — 빨간 캔들은 종가가 시가보다 높은 날(오른 날), <i style="background:#2563eb"></i>파란 캔들은 내린 날이에요. 캔들의 세로선(꼬리)은 그날 고가부터 저가까지 실제로 움직인 범위예요.</p>
          <p><i style="background:#b45309"></i><b>아래 칸 주황 선 = ATR(14)</b> — 최근 14일 동안 ‘하루에 움직인 폭’을 평균 낸 값이에요. 선이 올라가면 요즘 하루 변동폭이 커졌다는 뜻이고, 내려가면 잠잠해졌다는 뜻이에요. 가격이 오르는지 내리는지는 알려 주지 않아요.</p>
          <p><b>TR(진폭)이란?</b> — 그날의 ‘고가−저가’, ‘고가−전일 종가’, ‘저가−전일 종가’ 세 값 중 가장 큰 것이에요. 전날보다 크게 뛰어서 시작한 갭까지 포함해 “실제로 얼마나 움직였나”를 재요. ATR은 이 TR을 14일 평균한 값이에요.</p>
          <p><b>ATR ÷ 종가(%)는 왜 보나요?</b> — 5만원짜리 주식의 500원과 50만원짜리 주식의 500원은 의미가 다르니, 가격 대비 비율로 바꿔 비교해요. 이 시뮬레이터에서는 대략 1.2% 아래면 낮은 변동성, 1.2~3%면 보통, 3%를 넘으면 높은 변동성으로 표시해요.</p>
          <p><b>어디에 쓰나요?</b> — 손절 폭을 정할 때 ‘종가 − ATR×2’처럼 ATR의 배수를 쓰면, 평소 흔들림 범위 안에서 출렁이다 손절당하는 일을 줄일 수 있어요. 배수(1.5배·2배)는 예시일 뿐이며, 방향 판단은 이동평균선·추세·거래량과 함께 해야 해요.</p>
        </section>
        <section class="atr-results" aria-live="polite">
          <article><span>ATR(14)</span><strong data-atr-output="atr"></strong><small>최근 14일 평균 변동폭</small></article>
          <article><span>변동성 수준</span><strong data-atr-output="atrPct"></strong><small data-atr-badge></small></article>
        </section>
        <p class="atr-plain" data-atr-reading></p>
        <details class="atr-detail"><summary>계산 과정·참고 손절가 자세히 보기</summary>
          <ol>
            <li><b>TR</b><span data-atr-formula="tr"></span></li>
            <li><b>ATR</b><span data-atr-formula="atr"></span></li>
            <li><b>참고 손절가</b><span data-atr-formula="stop"></span></li>
          </ol>
        </details>
        <footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>
      </div>
    </section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('[data-atr-chart]'); const closeButton = modal.querySelector('.atr-modal-close');
  let lastFocused = null;
  const format = (value, digits = 1) => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const draw = (candles, atrValues) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(400, canvas.parentElement.clientWidth - 2); const height = 270;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 40; const right = 16; const priceTop = 18; const priceHeight = 108; const atrTop = 158; const atrHeight = 88;
    const highs = candles.map((c) => c.h); const lows = candles.map((c) => c.l);
    const priceLow = Math.min(...lows); const priceHigh = Math.max(...highs); const priceRange = Math.max(.0001, priceHigh - priceLow);
    const n = candles.length; const xFor = (index) => left + index * (width - left - right) / Math.max(n - 1, 1);
    const yForPrice = (value) => priceTop + (priceHigh - value) / priceRange * priceHeight;
    candles.forEach((c, index) => {
      const x = xFor(index); const up = c.c >= c.o;
      ctx.strokeStyle = up ? '#e11d48' : '#2563eb'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, yForPrice(c.h)); ctx.lineTo(x, yForPrice(c.l)); ctx.stroke();
      ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(x, yForPrice(c.o)); ctx.lineTo(x, yForPrice(c.c)); ctx.stroke();
    });
    const validAtr = atrValues.filter((v) => v != null); const atrLow = Math.min(...validAtr); const atrHigh = Math.max(...validAtr); const atrRange = Math.max(.0001, atrHigh - atrLow);
    ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2; ctx.beginPath();
    atrValues.forEach((value, index) => { if (value == null) return; const x = xFor(index); const y = atrTop + (atrHigh - value) / atrRange * atrHeight; (index === 0 || atrValues[index - 1] == null) ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '600 11px Pretendard, sans-serif'; ctx.fillText('가상 캔들', 10, 24); ctx.fillStyle = '#b45309'; ctx.fillText('ATR(14)', 10, 164);
  };
  const update = () => {
    const value = (name) => Number(modal.querySelector(`[data-atr-input="${name}"]`).value) || 0;
    const price = 50000; const trend = value('trend'); const volatility = Math.max(.1, value('volatility'));
    const closes = [price];
    for (let index = 1; index < 31; index += 1) { const wave = Math.sin(index * 1.71) * volatility + Math.cos(index * .63) * volatility * .45; closes.push(Math.max(1, closes.at(-1) * (1 + (trend + wave) / 100))); }
    const candles = closes.map((close, index) => {
      const open = index === 0 ? price : closes[index - 1]; const wiggle = volatility * .5 + .3;
      return { o: open, h: Math.max(open, close) * (1 + wiggle / 100), l: Math.min(open, close) * (1 - wiggle / 100), c: close };
    });
    const trValues = candles.map((c, index) => { const prevClose = index === 0 ? c.o : candles[index - 1].c; return Math.max(c.h - c.l, Math.abs(c.h - prevClose), Math.abs(c.l - prevClose)); });
    const atrValues = trValues.map((_, index) => (index < 13 ? null : trValues.slice(index - 13, index + 1).reduce((sum, v) => sum + v, 0) / 14));
    const lastClose = candles.at(-1).c; const lastTr = trValues.at(-1); const lastAtr = atrValues.at(-1); const atrPct = lastAtr / lastClose * 100;
    const stop2x = lastClose - 2 * lastAtr; const stop15x = lastClose - 1.5 * lastAtr;
    modal.querySelector('[data-atr-output="trend"]').value = `${trend >= 0 ? '+' : ''}${format(trend)}%`; modal.querySelector('[data-atr-output="volatility"]').value = `${format(volatility)}%`;
    modal.querySelector('[data-atr-output="atr"]').textContent = `${format(lastAtr, 0)}원`; modal.querySelector('[data-atr-output="atrPct"]').textContent = `${format(atrPct, 2)}%`;
    const level = atrPct >= 3 ? '높은' : atrPct >= 1.2 ? '보통' : '낮은';
    modal.querySelector('[data-atr-badge]').textContent = `${level} 변동성`;
    modal.querySelector('[data-atr-reading]').textContent = `현재 ATR은 종가의 약 ${format(atrPct, 2)}%로, 이 가상 흐름 기준으로는 비교적 ${level} 변동성 구간입니다. ATR이 커졌다고 상승이나 하락 어느 한쪽을 의미하지는 않으며, 하락이 거세질 때도 함께 커질 수 있습니다.`;
    modal.querySelector('[data-atr-formula="tr"]').textContent = `고가 ${format(candles.at(-1).h, 0)}원 − 저가 ${format(candles.at(-1).l, 0)}원, │고가−전일종가│, │저가−전일종가│ 중 최대값 = ${format(lastTr, 0)}원`;
    modal.querySelector('[data-atr-formula="atr"]').textContent = `최근 14일 TR 평균 = ${format(lastAtr, 0)}원`;
    modal.querySelector('[data-atr-formula="stop"]').textContent = `종가 − (2 × ATR) ≈ ${format(stop2x, 0)}원 · 종가 − (1.5 × ATR) ≈ ${format(stop15x, 0)}원 (예시 배수일 뿐 정답은 아닙니다)`;
    draw(candles, atrValues);
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); update(); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-atr-input]').forEach((input) => input.addEventListener('input', update)); modal.querySelector('[data-atr-reset]').addEventListener('click', () => { modal.querySelectorAll('[data-atr-input]').forEach((input) => { input.value = input.defaultValue; }); update(); });
  window.addEventListener('resize', update); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); window.removeEventListener('resize', update); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installOpeningSessionModal(root, docId) {
  const trigger = root.querySelector('[data-opening-session-simulator]');
  if (docId !== '05' || !trigger) return;
  const modal = document.createElement('div');
  modal.className = 'opening-session-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'opening-session-modal-title');
  modal.innerHTML = `
    <section class="opening-session-modal"><header class="opening-session-modal-header"><div><span class="opening-session-modal-icon"><i class="fa-solid fa-clock"></i></span><div><h2 id="opening-session-modal-title">최근 1개월 개장 직후 흐름</h2><p>한국 시간 09:00~09:30, 첫 30분 봉의 가격 변동과 거래량만 모아 봅니다.</p></div></div><button type="button" class="opening-session-modal-close" aria-label="개장 직후 차트 닫기"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="opening-session-tabs"><button type="button" data-opening-market="kospi200" class="is-active">KOSPI 200</button><button type="button" data-opening-market="kosdaq150">KOSDAQ 150</button></div>
    <div class="opening-session-body"><p class="opening-session-status" data-opening-status>데이터를 불러올 준비가 되었습니다.</p><section class="opening-session-chart-wrap"><canvas data-opening-chart aria-label="최근 한 달 개장 후 첫 30분 가격 변동과 거래량"></canvas></section><div class="opening-session-summary" data-opening-summary></div><p class="opening-session-note" data-opening-note></p></div></section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('[data-opening-chart]'); const status = modal.querySelector('[data-opening-status]');
  const summary = modal.querySelector('[data-opening-summary]'); const note = modal.querySelector('[data-opening-note]'); const closeButton = modal.querySelector('.opening-session-modal-close');
  let lastFocused = null; let currentMarket = 'kospi200'; let requestId = 0;
  const format = (value, digits = 1) => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const draw = (items) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(380, canvas.parentElement.clientWidth - 2); const height = 360;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 48; const right = 20; const chartWidth = width - left - right; const changes = items.map((item) => item.change_pct); const volumes = items.map((item) => item.volume); const maxChange = Math.max(.2, ...changes.map(Math.abs)); const maxVolume = Math.max(1, ...volumes);
    ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(left, 105); ctx.lineTo(width - right, 105); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#64748b'; ctx.font = '600 11px Pretendard, sans-serif'; ctx.fillText('09:00~09:30 가격 변동률', 10, 18); ctx.fillText('거래량', 10, 190);
    const xFor = (index) => left + (items.length === 1 ? chartWidth / 2 : index * chartWidth / (items.length - 1));
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.beginPath(); changes.forEach((change, index) => { const x = xFor(index); const y = 105 - change / maxChange * 74; index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    changes.forEach((change, index) => { const x = xFor(index); const y = 105 - change / maxChange * 74; ctx.fillStyle = change >= 0 ? '#ef476f' : '#3b82f6'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
    const barWidth = Math.max(3, chartWidth / items.length * .65); volumes.forEach((volume, index) => { const barHeight = volume / maxVolume * 118; ctx.fillStyle = changes[index] >= 0 ? 'rgba(239,71,111,.72)' : 'rgba(59,130,246,.72)'; ctx.fillRect(xFor(index) - barWidth / 2, 330 - barHeight, barWidth, barHeight); });
    if (barWidth >= 14) { ctx.fillStyle = '#64748b'; ctx.font = '600 9px Pretendard, sans-serif'; ctx.textAlign = 'center'; items.forEach((item, index) => { if (item.volume_share_pct == null) return; const barHeight = item.volume / maxVolume * 118; ctx.fillText(`${item.volume_share_pct.toFixed(1)}%`, xFor(index), 330 - barHeight - 4); }); }
    ctx.fillStyle = '#64748b'; ctx.font = '600 10px Pretendard, sans-serif'; ctx.textAlign = 'center'; items.forEach((item, index) => { if (index % Math.ceil(items.length / 6) === 0 || index === items.length - 1) ctx.fillText(item.date.slice(5), xFor(index), 350); }); ctx.textAlign = 'start';
  };
  const load = async () => {
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 최근 1개월 30분 봉을 불러오는 중…'; summary.replaceChildren();
    try {
      const response = await fetch(`/api/market/opening-session?market=${currentMarket}`); const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`); if (activeRequest !== requestId) return;
      draw(data.items); const averageChange = data.items.reduce((sum, item) => sum + item.change_pct, 0) / data.items.length; const averageVolume = data.items.reduce((sum, item) => sum + item.volume, 0) / data.items.length; const positiveDays = data.items.filter((item) => item.change_pct > 0).length;
      status.textContent = `${data.market_label} · ${data.label} · ${data.latest_data_at.slice(0, 10)} 기준`; summary.innerHTML = `<article><span>평균 30분 변동</span><strong>${averageChange >= 0 ? '+' : ''}${format(averageChange, 2)}%</strong></article><article><span>상승 마감 일수</span><strong>${positiveDays} / ${data.items.length}일</strong></article><article><span>평균 거래량</span><strong>${format(averageVolume, 0)}주</strong></article>`; note.textContent = `${data.note} ${data.source} 기준이며, 장중 데이터 지연·정정 여부와 실제 주문 가능 정보는 증권사 화면을 확인하세요.`;
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-opening-market]').forEach((button) => button.addEventListener('click', () => { currentMarket = button.dataset.openingMarket; modal.querySelectorAll('[data-opening-market]').forEach((tab) => tab.classList.toggle('is-active', tab === button)); load(); }));
  window.addEventListener('resize', () => { if (modal.classList.contains('show')) load(); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installSoxKoreaSemiconModal(root, docId) {
  const trigger = root.querySelector('[data-sox-korea-semicon]'); if (docId !== '05' || !trigger) return;
  const SECTOR_TABS = [
    { key: 'semicon', label: '반도체' }, { key: 'battery', label: '2차전지' }, { key: 'healthcare', label: '헬스케어·바이오' },
    { key: 'auto', label: '자동차' }, { key: 'finance', label: '금융' }, { key: 'cosmetics', label: '화장품·소비재' },
  ];
  const modal = document.createElement('div'); modal.className = 'sox-semicon-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'sox-semicon-modal-title');
  modal.innerHTML = `<section class="sox-semicon-modal"><header><div><span><i class="fa-solid fa-microchip"></i></span><div><h2 id="sox-semicon-modal-title">미국 vs 한국 섹터 비교</h2><p>미국 섹터 지수·ETF와 한국 섹터 ETF의 최근 흐름을 같은 기준(시작일=100)으로 비교합니다.</p></div></div><button type="button" data-sox-semicon-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="sox-semicon-tabs">${SECTOR_TABS.map((t, i) => `<button type="button" data-sox-sector="${t.key}" class="${i === 0 ? 'is-active' : ''}">${t.label}</button>`).join('')}</div>
    <main><p class="sox-semicon-status" data-sox-semicon-status>불러오는 중...</p><section class="sox-semicon-chart-wrap"><canvas data-sox-semicon-chart aria-label="미국·한국 섹터 지수화 비교 차트"></canvas></section><section class="sox-semicon-summary" data-sox-semicon-summary aria-live="polite"></section><p class="sox-semicon-note" data-sox-semicon-note></p></main></section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('[data-sox-semicon-chart]'); const status = modal.querySelector('[data-sox-semicon-status]');
  const summary = modal.querySelector('[data-sox-semicon-summary]'); const note = modal.querySelector('[data-sox-semicon-note]'); const closeButton = modal.querySelector('[data-sox-semicon-close]');
  let lastFocused = null; let requestId = 0; let currentSector = 'semicon';
  const draw = (usPoints, krPoints) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(380, canvas.parentElement.clientWidth - 2); const height = 420;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 48; const right = 16; const top = 24; const bottom = 34; const chartWidth = width - left - right; const chartHeight = height - top - bottom;
    const values = [...usPoints.map((p) => p.index), ...krPoints.map((p) => p.index)]; const min = Math.min(100, ...values) - 4; const max = Math.max(100, ...values) + 4; const gap = Math.max(max - min, 1);
    const n = Math.max(usPoints.length, krPoints.length);
    const x = (index) => left + index * chartWidth / Math.max(n - 1, 1); const y = (value) => top + (max - value) / gap * chartHeight;
    ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(left, y(100)); ctx.lineTo(width - right, y(100)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 10px Pretendard, sans-serif'; ctx.fillText('시작일 = 100', left, y(100) - 6);
    const plot = (points, color) => { ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.beginPath(); points.forEach((p, index) => { const px = x(index); const py = y(p.index); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); };
    plot(usPoints, '#7c3aed'); plot(krPoints, '#f97316');
    ctx.fillStyle = '#64748b'; ctx.font = '600 10px Pretendard, sans-serif'; ctx.textAlign = 'center';
    usPoints.forEach((p, index) => { if (index % Math.ceil(n / 6) === 0 || index === n - 1) ctx.fillText(p.date.slice(5), x(index), height - 12); }); ctx.textAlign = 'start';
  };
  const load = async (sector) => {
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 최근 6개월 데이터를 불러오는 중…'; summary.replaceChildren();
    try {
      const response = await fetch(`/api/market/sox-vs-korea-semicon?sector=${encodeURIComponent(sector)}&period=6mo`); const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`); if (activeRequest !== requestId) return;
      const us = data.series.us; const kr = data.series.kr;
      draw(us.points, kr.points);
      status.textContent = `${data.sector_label} · 최근 ${data.period} · Yahoo Finance 일봉 기준`;
      summary.innerHTML = `<article><span style="color:#7c3aed;">■</span> ${us.label}<strong>${us.period_return_pct >= 0 ? '+' : ''}${us.period_return_pct}%</strong></article><article><span style="color:#f97316;">■</span> ${kr.label}<strong>${kr.period_return_pct >= 0 ? '+' : ''}${kr.period_return_pct}%</strong></article>`;
      note.textContent = data.note;
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(currentSector); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-sox-sector]').forEach((button) => button.addEventListener('click', () => { currentSector = button.dataset.soxSector; modal.querySelectorAll('[data-sox-sector]').forEach((tab) => tab.classList.toggle('is-active', tab === button)); load(currentSector); }));
  window.addEventListener('resize', () => { if (modal.classList.contains('show')) load(currentSector); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installPatternVerifyModal(root, docId) {
  const trigger = root.querySelector('[data-pattern-verify]'); if (docId !== '05' || !trigger) return;
  const PATTERNS = [
    { key: 'cup_with_handle', label: '컵 위드 핸들' },
    { key: 'head_shoulders', label: '헤드 앤 숄더' },
    { key: 'inverse_head_shoulders', label: '역헤드 앤 숄더' },
    { key: 'double_top', label: '더블 탑' },
    { key: 'double_bottom', label: '더블 바텀' },
    { key: 'triangle', label: '삼각수렴' },
  ];
  const modal = document.createElement('div'); modal.className = 'pattern-verify-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'pattern-verify-modal-title');
  modal.innerHTML = `<section class="pattern-verify-modal"><header><div><span><i class="fa-solid fa-magnifying-glass-chart"></i></span><div><h2 id="pattern-verify-modal-title">실제 차트에서 패턴 검증하기</h2><p>국내 대표 종목 표본에서 각 패턴과 기하학적으로 가장 비슷한 실제 구간을 찾아 보여 줍니다.</p></div></div><button type="button" data-pattern-verify-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="pattern-verify-tabs">${PATTERNS.map((p, i) => `<button type="button" data-pv-pattern="${p.key}" class="${i === 0 ? 'is-active' : ''}">${p.label}</button>`).join('')}</div>
    <main><p class="pattern-verify-status" data-pv-status>불러오는 중...</p><section class="pattern-verify-chart-wrap"><canvas data-pv-chart aria-label="패턴 검증 차트"></canvas></section><div class="pattern-verify-summary" data-pv-summary></div><p class="pattern-verify-note" data-pv-note></p></main></section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('[data-pv-chart]'); const status = modal.querySelector('[data-pv-status]');
  const summary = modal.querySelector('[data-pv-summary]'); const note = modal.querySelector('[data-pv-note]'); const closeButton = modal.querySelector('[data-pattern-verify-close]');
  let lastFocused = null; let requestId = 0; let currentPattern = PATTERNS[0].key; const cache = new Map();

  const draw = (data) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(380, canvas.parentElement.clientWidth - 2); const height = 320;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 56; const right = 16; const top = 30; const bottom = 34; const chartWidth = width - left - right; const chartHeight = height - top - bottom;
    const closes = data.closes; const min = Math.min(...closes) * .97; const max = Math.max(...closes) * 1.03; const gap = Math.max(max - min, 1);
    const n = closes.length; const x = (index) => left + index * chartWidth / Math.max(n - 1, 1); const y = (value) => top + (max - value) / gap * chartHeight;
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.beginPath(); closes.forEach((v, index) => { const px = x(index); const py = y(v); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
    if (data.neckline) {
      const s = data.neckline.start; const e = data.neckline.end;
      ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x(s.index), y(s.price)); ctx.lineTo(x(e.index), y(e.price)); ctx.stroke(); ctx.setLineDash([]);
    }
    (data.key_points || []).forEach((kp) => {
      if (kp.index == null || kp.price == null) return; const px = x(kp.index); const py = y(kp.price);
      ctx.fillStyle = '#7c3aed'; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4c1d95'; ctx.font = '600 10px Pretendard, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(kp.label, px, py - 10);
    });
    if (data.breakout) {
      const px = x(data.breakout.index); const py = y(data.breakout.price);
      ctx.fillStyle = data.direction && data.direction.includes('매도') ? '#dc2626' : '#16a34a';
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, height - bottom); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#0f172a'; ctx.font = '700 10px Pretendard, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('돌파', px, top + 12);
    }
    ctx.fillStyle = '#64748b'; ctx.font = '600 10px Pretendard, sans-serif'; ctx.textAlign = 'center';
    data.dates.forEach((d, index) => { if (index % Math.ceil(n / 6) === 0 || index === n - 1) ctx.fillText(d.slice(2), x(index), height - 12); }); ctx.textAlign = 'start';
  };

  const render = (data) => {
    if (!data.found) { status.textContent = `${data.label} · 조건에 맞는 사례를 찾지 못했습니다`; summary.innerHTML = ''; note.textContent = data.note; canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return; }
    draw(data);
    status.textContent = `${data.label} (${data.label_en}) · ${data.name}(${data.ticker}) · ${data.dates[0]} ~ ${data.dates[data.dates.length - 1]}`;
    summary.innerHTML = `<article><span>패턴 방향</span><strong>${data.direction}</strong></article><article><span>탐지 근거</span><strong>${data.summary}</strong></article><article><span>유사도 점수</span><strong>${data.score}</strong></article>`;
    note.textContent = data.note;
  };

  const load = async (pattern) => {
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 실제 사례를 찾는 중… (수 초 정도 걸릴 수 있어요)'; summary.innerHTML = '';
    try {
      if (!cache.has(pattern)) {
        const response = await fetch(`/api/market/pattern-scan?pattern=${encodeURIComponent(pattern)}`);
        const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
        cache.set(pattern, data);
      }
      if (activeRequest !== requestId) return;
      render(cache.get(pattern));
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };

  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(currentPattern); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-pv-pattern]').forEach((button) => button.addEventListener('click', () => { currentPattern = button.dataset.pvPattern; modal.querySelectorAll('[data-pv-pattern]').forEach((tab) => tab.classList.toggle('is-active', tab === button)); load(currentPattern); }));
  window.addEventListener('resize', () => { if (modal.classList.contains('show') && cache.has(currentPattern)) render(cache.get(currentPattern)); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installMddHistoryModal(root, docId) {
  const trigger = root.querySelector('[data-mdd-history]'); if (docId !== '07' || !trigger) return;
  const modal = document.createElement('div'); modal.className = 'mdd-history-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'mdd-history-modal-title');
  modal.innerHTML = `<section class="mdd-history-modal"><header><div><span><i class="fa-solid fa-arrow-trend-down"></i></span><div><h2 id="mdd-history-modal-title">최근 10년 KOSPI 낙폭(드로다운) 차트</h2><p>이전 고점 대비 매일의 낙폭을 이어 그려, 최대낙폭(MDD)이 언제 나왔는지 확인합니다.</p></div></div><button type="button" data-mdd-history-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header><main><p class="mdd-history-status" data-mdd-history-status>불러오는 중...</p><section class="mdd-history-chart-wrap"><canvas data-mdd-history-chart aria-label="최근 10년 KOSPI 낙폭 곡선"></canvas></section><section class="mdd-history-summary" data-mdd-history-summary aria-live="polite"></section><p class="mdd-history-note" data-mdd-history-note></p></main></section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('[data-mdd-history-chart]'); const status = modal.querySelector('[data-mdd-history-status]');
  const summary = modal.querySelector('[data-mdd-history-summary]'); const note = modal.querySelector('[data-mdd-history-note]'); const closeButton = modal.querySelector('[data-mdd-history-close]');
  let lastFocused = null; let requestId = 0;
  const draw = (points, mdd) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(380, canvas.parentElement.clientWidth - 2); const height = 280;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 46; const right = 16; const top = 24; const bottom = 34; const chartWidth = width - left - right; const chartHeight = height - top - bottom;
    const values = points.map((p) => p.drawdown_pct); const min = Math.min(...values) * 1.1;
    const n = points.length; const x = (index) => left + index * chartWidth / Math.max(n - 1, 1); const y = (value) => top + (0 - value) / Math.max(-min, 1) * chartHeight;
    ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(left, y(0)); ctx.lineTo(width - right, y(0)); ctx.stroke();
    ctx.beginPath(); points.forEach((p, index) => { const px = x(index); const py = y(p.drawdown_pct); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.lineTo(x(n - 1), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath(); ctx.fillStyle = 'rgba(220,38,38,.14)'; ctx.fill();
    ctx.beginPath(); points.forEach((p, index) => { const px = x(index); const py = y(p.drawdown_pct); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.8; ctx.stroke();
    if (mdd?.date) { const mddIndex = points.findIndex((p) => p.date === mdd.date); if (mddIndex >= 0) { const px = x(mddIndex); const py = y(mdd.drawdown_pct); ctx.fillStyle = '#991b1b'; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.font = '700 11px Pretendard, sans-serif'; ctx.textAlign = mddIndex > n * .6 ? 'end' : 'start'; ctx.fillText(`${mdd.date} · MDD ${mdd.drawdown_pct}%`, mddIndex > n * .6 ? px - 8 : px + 8, py - 8); ctx.textAlign = 'start'; } }
    ctx.fillStyle = '#64748b'; ctx.font = '600 10px Pretendard, sans-serif'; ctx.textAlign = 'center'; points.forEach((p, index) => { if (index % Math.ceil(n / 8) === 0 || index === n - 1) ctx.fillText(p.date.slice(0, 7), x(index), height - 12); }); ctx.textAlign = 'start';
  };
  const load = async () => {
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 최근 10년 데이터를 불러오는 중…'; summary.replaceChildren();
    try {
      const response = await fetch('/api/market/mdd-history?ticker=%5EKS11&years=10'); const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`); if (activeRequest !== requestId) return;
      draw(data.points, data.mdd);
      status.textContent = `${data.label} · 최근 ${data.years}년 · Yahoo Finance 일봉 기준`;
      summary.innerHTML = `<article><span>최대낙폭(MDD)</span><strong>${data.mdd.drawdown_pct}%</strong></article><article><span>MDD 발생일</span><strong>${data.mdd.date}</strong></article>`;
      note.textContent = data.note;
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  window.addEventListener('resize', () => { if (modal.classList.contains('show')) load(); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installCircuitBreakerModal(root, docId) {
  const trigger = root.querySelector('[data-circuit-breaker]'); if (docId !== '05' || !trigger) return;
  const modal = document.createElement('div'); modal.className = 'circuit-breaker-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'circuit-breaker-modal-title');
  modal.innerHTML = `<section class="circuit-breaker-modal"><header><div><span><i class="fa-solid fa-triangle-exclamation"></i></span><div><h2 id="circuit-breaker-modal-title">최근 6개월 서킷브레이커·사이드카 추정 배지</h2><p>KOSPI·KOSDAQ은 서킷브레이커(전일 대비 8·15·20% 이상 하락), KOSPI200·KOSDAQ150 프록시는 사이드카(±5%·±6% 이상 등락) 요건을 함께 추정합니다.</p></div></div><button type="button" data-circuit-breaker-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header><main><p class="circuit-breaker-status" data-cb-status>불러오는 중...</p>
    <div class="cb-grid">
      <section class="cb-panel"><h3><i class="cb-dot cb-2"></i>KOSPI · 서킷브레이커 추정</h3><div class="circuit-breaker-chart-wrap"><canvas data-cb-chart="kospi" aria-label="KOSPI 종가와 서킷브레이커 추정 배지 차트"></canvas></div></section>
      <section class="cb-panel"><h3><i class="cb-dot cb-2"></i>KOSDAQ · 서킷브레이커 추정</h3><div class="circuit-breaker-chart-wrap"><canvas data-cb-chart="kosdaq" aria-label="KOSDAQ 종가와 서킷브레이커 추정 배지 차트"></canvas></div></section>
      <section class="cb-panel"><h3><i class="cb-dot cb-side"></i>KOSPI200 프록시 · 사이드카 추정</h3><div class="circuit-breaker-chart-wrap"><canvas data-side-chart="kospi200" aria-label="KOSPI200 프록시와 사이드카 추정 배지 차트"></canvas></div></section>
      <section class="cb-panel"><h3><i class="cb-dot cb-side"></i>KOSDAQ150 프록시 · 사이드카 추정</h3><div class="circuit-breaker-chart-wrap"><canvas data-side-chart="kosdaq150" aria-label="KOSDAQ150 프록시와 사이드카 추정 배지 차트"></canvas></div></section>
    </div>
    <div class="circuit-breaker-legend"><span><i class="cb-dot cb-1"></i>CB 1단계(-8%↓)</span><span><i class="cb-dot cb-2"></i>CB 2단계(-15%↓)</span><span><i class="cb-dot cb-3"></i>CB 3단계(-20%↓)</span><span><i class="cb-dot cb-side"></i>사이드카 추정(±5·6%)</span></div>
    <h3 class="cb-section-title">발생일과 뉴스로 원인 확인하기</h3>
    <ul class="circuit-breaker-list" data-cb-list></ul>
    <h3 class="cb-section-title">이런 큰 변동일에 흔히 함께 나타나는 원인</h3>
    <ul class="cb-causes" data-cb-causes></ul>
    <p class="circuit-breaker-note" data-cb-note></p>
  </main></section>`;
  document.body.appendChild(modal);
  const status = modal.querySelector('[data-cb-status]'); const list = modal.querySelector('[data-cb-list]');
  const causes = modal.querySelector('[data-cb-causes]'); const note = modal.querySelector('[data-cb-note]'); const closeButton = modal.querySelector('[data-circuit-breaker-close]');
  let lastFocused = null; let requestId = 0; let cachedData = null;
  const levelColor = { 1: '#f59e0b', 2: '#f97316', 3: '#ef4444' };
  const drawCb = (canvas, points) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(320, canvas.parentElement.clientWidth - 2); const height = 190;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 44; const right = 12; const top = 14; const bottom = 22; const chartWidth = width - left - right; const chartHeight = height - top - bottom;
    const closes = points.map((p) => p.close); const min = Math.min(...closes) * .97; const max = Math.max(...closes) * 1.03; const gap = Math.max(max - min, 1);
    const n = points.length; const x = (index) => left + index * chartWidth / Math.max(n - 1, 1); const y = (value) => top + (max - value) / gap * chartHeight;
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.8; ctx.beginPath(); points.forEach((p, index) => { const px = x(index); const py = y(p.close); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
    points.forEach((p, index) => {
      if (!p.cb_level) return; const px = x(index); const py = y(p.close); const color = levelColor[p.cb_level];
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, height - bottom); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 9px Pretendard, sans-serif'; ctx.textAlign = 'center';
    points.forEach((p, index) => { if (index % Math.ceil(n / 5) === 0 || index === n - 1) ctx.fillText(p.date.slice(5), x(index), height - 6); }); ctx.textAlign = 'start';
  };
  const drawSidecar = (canvas, points) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(320, canvas.parentElement.clientWidth - 2); const height = 190;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 44; const right = 12; const top = 14; const bottom = 22; const chartWidth = width - left - right; const chartHeight = height - top - bottom;
    const closes = points.map((p) => p.close); const min = Math.min(...closes) * .97; const max = Math.max(...closes) * 1.03; const gap = Math.max(max - min, 1);
    const n = points.length; const x = (index) => left + index * chartWidth / Math.max(n - 1, 1); const y = (value) => top + (max - value) / gap * chartHeight;
    ctx.strokeStyle = '#0d9488'; ctx.lineWidth = 1.8; ctx.beginPath(); points.forEach((p, index) => { const px = x(index); const py = y(p.close); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
    points.forEach((p, index) => {
      if (!p.triggered) return; const px = x(index); const py = y(p.close); const color = p.triggered === 'up' ? '#dc2626' : '#2563eb';
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, height - bottom); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.beginPath();
      if (p.triggered === 'up') { ctx.moveTo(px, py - 5); ctx.lineTo(px - 4, py + 3); ctx.lineTo(px + 4, py + 3); } else { ctx.moveTo(px, py + 5); ctx.lineTo(px - 4, py - 3); ctx.lineTo(px + 4, py - 3); }
      ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 9px Pretendard, sans-serif'; ctx.textAlign = 'center';
    points.forEach((p, index) => { if (index % Math.ceil(n / 5) === 0 || index === n - 1) ctx.fillText(p.date.slice(5), x(index), height - 6); }); ctx.textAlign = 'start';
  };
  const render = () => {
    if (!cachedData) return;
    drawCb(modal.querySelector('[data-cb-chart="kospi"]'), cachedData.series.kospi.points);
    drawCb(modal.querySelector('[data-cb-chart="kosdaq"]'), cachedData.series.kosdaq.points);
    drawSidecar(modal.querySelector('[data-side-chart="kospi200"]'), cachedData.sidecar.kospi200.points);
    drawSidecar(modal.querySelector('[data-side-chart="kosdaq150"]'), cachedData.sidecar.kosdaq150.points);
    status.textContent = `최근 ${cachedData.period} · Yahoo Finance 일봉 기준 (근사 추정치)`;
    const events = [
      ...cachedData.series.kospi.flagged.map((item) => ({ date: item.date, label: `KOSPI 서킷브레이커 ${item.cb_level}단계 추정 (저가 ${item.low_decline_pct}%)`, dotClass: `cb-${item.cb_level}`, url: item.news_search_url })),
      ...cachedData.series.kosdaq.flagged.map((item) => ({ date: item.date, label: `KOSDAQ 서킷브레이커 ${item.cb_level}단계 추정 (저가 ${item.low_decline_pct}%)`, dotClass: `cb-${item.cb_level}`, url: item.news_search_url })),
      ...cachedData.sidecar.kospi200.flagged.map((item) => ({ date: item.date, label: `KOSPI200 프록시 사이드카 추정 (${item.triggered === 'up' ? '상승' : '하락'} ${item.triggered === 'up' ? item.up_pct : item.down_pct}%)`, dotClass: 'cb-side', url: item.news_search_url })),
      ...cachedData.sidecar.kosdaq150.flagged.map((item) => ({ date: item.date, label: `KOSDAQ150 프록시 사이드카 추정 (${item.triggered === 'up' ? '상승' : '하락'} ${item.triggered === 'up' ? item.up_pct : item.down_pct}%)`, dotClass: 'cb-side', url: item.news_search_url })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    list.innerHTML = events.length
      ? events.map((event) => `<li><span class="cb-dot ${event.dotClass}"></span>${event.date} · ${event.label} <a href="${event.url}" target="_new" rel="noopener noreferrer">뉴스에서 확인 <i class="fa-solid fa-arrow-up-right-from-square"></i></a></li>`).join('')
      : '<li>이 기간에는 추정 조건에 해당하는 날이 없습니다.</li>';
    causes.innerHTML = cachedData.common_causes.map((cause) => `<li>${cause}</li>`).join('');
    note.textContent = cachedData.note;
  };
  const load = async () => {
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 최근 6개월 데이터를 불러오는 중…'; list.replaceChildren();
    try {
      const response = await fetch('/api/market/circuit-breaker-history?period=6mo'); const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`); if (activeRequest !== requestId) return;
      cachedData = data; render();
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  window.addEventListener('resize', () => { if (modal.classList.contains('show')) render(); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installVixKospiModal(root, docId) {
  const trigger = root.querySelector('[data-vix-kospi]'); if (docId !== '05' || !trigger) return;
  const modal = document.createElement('div'); modal.className = 'vix-kospi-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'vix-kospi-modal-title');
  modal.innerHTML = `<section class="vix-kospi-modal"><header><div><span><i class="fa-solid fa-gauge-high"></i></span><div><h2 id="vix-kospi-modal-title">VIX · VKOSPI vs KOSPI 지수</h2><p>미국 VIX(S&amp;P 500 옵션)와 한국 VKOSPI(코스피200 옵션) 변동성지수를 KOSPI 지수와 같은 화면에서 봅니다. 기간을 바꿔 변동성이 높았던 시기를 확인해 보세요.</p></div></div><button type="button" data-vix-kospi-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header><main><div class="vix-kospi-tabs" role="tablist" aria-label="조회 기간"><button type="button" data-vix-period="3mo" class="is-active">최근 3개월</button><button type="button" data-vix-period="6mo">최근 6개월</button><button type="button" data-vix-period="1y">최근 1년</button></div><p class="vix-kospi-status" data-vix-kospi-status>불러오는 중...</p><section class="vix-kospi-chart-wrap"><canvas data-vix-kospi-chart aria-label="VIX와 KOSPI 지수 이중축 비교 차트. VIX 위험도 기준선 15, 20, 30을 포함합니다."></canvas></section><section class="vix-kospi-summary" data-vix-kospi-summary aria-live="polite"></section><p class="vix-kospi-note" data-vix-kospi-note></p></main></section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('[data-vix-kospi-chart]'); const status = modal.querySelector('[data-vix-kospi-status]');
  let period = '3mo';
  modal.querySelectorAll('[data-vix-period]').forEach((button) => button.addEventListener('click', () => { period = button.dataset.vixPeriod; modal.querySelectorAll('[data-vix-period]').forEach((tab) => tab.classList.toggle('is-active', tab === button)); load(); }));
  const summary = modal.querySelector('[data-vix-kospi-summary]'); const note = modal.querySelector('[data-vix-kospi-note]'); const closeButton = modal.querySelector('[data-vix-kospi-close]');
  let lastFocused = null; let requestId = 0;
  const draw = (vixPoints, kospiPoints, vkospiPoints = []) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(380, canvas.parentElement.clientWidth - 2); const height = 320;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 46; const right = 46; const top = 24; const bottom = 34; const chartWidth = width - left - right; const chartHeight = height - top - bottom;
    const vixValues = [...vixPoints, ...vkospiPoints].map((p) => p.close); const kospiValues = kospiPoints.map((p) => p.close);
    // 15·20·30은 VIX를 읽을 때 자주 쓰는 대략적인 위험도 눈금입니다. 모든 기준선을
    // 같은 축에 보여 주기 위해 데이터 범위에도 포함합니다.
    const vixMin = Math.min(...vixValues, 15) * .9; const vixMax = Math.max(...vixValues, 30) * 1.1; const vixGap = Math.max(vixMax - vixMin, 1);
    const kospiMin = Math.min(...kospiValues) * .98; const kospiMax = Math.max(...kospiValues) * 1.02; const kospiGap = Math.max(kospiMax - kospiMin, 1);
    const n = Math.max(vixPoints.length, kospiPoints.length);
    const x = (index, length = n) => left + index * chartWidth / Math.max(length - 1, 1);
    const yVix = (value) => top + (vixMax - value) / vixGap * chartHeight; const yKospi = (value) => top + (kospiMax - value) / kospiGap * chartHeight;
    const riskLines = [
      { value: 15, label: '15 · 낮음', color: '#22c55e' },
      { value: 20, label: '20 · 경계', color: '#f59e0b' },
      { value: 30, label: '30 · 고위험', color: '#ef4444' },
    ];
    riskLines.forEach(({ value, label, color }) => {
      const py = yVix(value);
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = `${color}99`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(width - right, py); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = '700 10px Pretendard, sans-serif'; ctx.textAlign = 'start'; ctx.fillText(label, left + 5, py - 4); ctx.restore();
    });
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.2; ctx.beginPath(); vixPoints.forEach((p, index) => { const px = x(index, vixPoints.length); const py = yVix(p.close); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
    if (vkospiPoints.length) { ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2.2; ctx.beginPath(); vkospiPoints.forEach((p, index) => { const px = x(index, vkospiPoints.length); const py = yVix(p.close); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); }
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2.2; ctx.beginPath(); kospiPoints.forEach((p, index) => { const px = x(index, kospiPoints.length); const py = yKospi(p.close); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
    ctx.fillStyle = '#ef4444'; ctx.font = '600 10px Pretendard, sans-serif'; ctx.textAlign = 'start'; ctx.fillText('VIX(미국)', 4, top + 4); if (vkospiPoints.length) { ctx.fillStyle = '#7c3aed'; ctx.fillText('VKOSPI(한국)', 56, top + 4); }
    ctx.fillStyle = '#2563eb'; ctx.textAlign = 'end'; ctx.fillText('KOSPI', width - 4, top + 4);
    ctx.fillStyle = '#64748b'; ctx.textAlign = 'center'; vixPoints.forEach((p, index) => { if (index % Math.ceil(vixPoints.length / 6) === 0 || index === vixPoints.length - 1) ctx.fillText(p.date.slice(5), x(index, vixPoints.length), height - 12); }); ctx.textAlign = 'start';
  };
  const load = async () => {
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 최근 3개월 데이터를 불러오는 중…'; summary.replaceChildren();
    try {
      const response = await fetch(`/api/market/vix-vs-kospi?period=${period}`); const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`); if (activeRequest !== requestId) return;
      const vix = data.series.vix; const kospi = data.series.kospi; const vkospi = data.series.vkospi;
      draw(vix.points, kospi.points, vkospi ? vkospi.points : []);
      status.textContent = `${({ '1mo': '최근 1개월', '3mo': '최근 3개월', '6mo': '최근 6개월', '1y': '최근 1년' })[data.period] || data.period} · VIX·KOSPI: Yahoo Finance 일봉 · VKOSPI: 한국거래소 Open API${data.vkospi_error ? ` · ${data.vkospi_error}` : ''}`;
      const latestVix = Number(vix.latest_close);
      const risk = latestVix <= 15 ? ['낮은 변동성 기대', '#15803d'] : latestVix < 20 ? ['보통 수준', '#2563eb'] : latestVix < 30 ? ['변동성 경계', '#b45309'] : ['고변동성 경계', '#dc2626'];
      summary.innerHTML = `${vkospi ? `<article><span style="color:#7c3aed;">■</span> ${vkospi.label}<strong>${vkospi.latest_close} (${vkospi.period_change >= 0 ? '+' : ''}${vkospi.period_change})</strong></article>` : ''}<article><span style="color:#ef4444;">■</span> ${vix.label}<strong>${vix.latest_close} (${vix.period_change >= 0 ? '+' : ''}${vix.period_change})</strong></article><article><span style="color:#2563eb;">■</span> ${kospi.label}<strong>${Math.round(kospi.latest_close).toLocaleString('ko-KR')} (${kospi.period_change >= 0 ? '+' : ''}${Math.round(kospi.period_change).toLocaleString('ko-KR')})</strong></article><article class="vix-risk-reading"><span>VIX 위험도 눈금</span><strong style="color:${risk[1]};">${risk[0]}</strong><small>15 · 20 · 30 기준선 참고</small></article>`;
      note.textContent = data.note;
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  window.addEventListener('resize', () => { if (modal.classList.contains('show')) load(); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installThemeVolatilityModal(root, docId) {
  const trigger = root.querySelector('[data-theme-volatility]'); if (docId !== '05' || !trigger) return;
  // 테마로 널리 언급된 적이 있는 사례입니다. 투자 추천이나 테마의 사실 확인이 아닙니다.
  const marketOf = (ticker) => ticker.endsWith('.KS') ? 'KOSPI' : ticker.endsWith('.KQ') ? 'KOSDAQ' : '';
  const codeOf = (ticker) => ticker.split('.')[0];
  const stocks = [
    { ticker: '065350.KQ', name: '신성델타테크', theme: '초전도체 관련 기대', color: '#7c3aed' },
    { ticker: '250060.KQ', name: '모비스', theme: '핵융합 관련 기대', color: '#ea580c' },
    { ticker: '084650.KQ', name: '랩지노믹스', theme: '바이오·진단 관련 기대', color: '#0891b2' },
    { ticker: '277810.KQ', name: '레인보우로보틱스', theme: '로봇·AI 관련 기대', color: '#059669' },
    { ticker: '007660.KS', name: '이수페타시스', theme: 'AI 서버 기판 관련 기대', color: '#be185d' },
  ];
  const modal = document.createElement('div'); modal.className = 'theme-volatility-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'theme-volatility-modal-title');
  modal.innerHTML = `<section class="theme-volatility-modal"><header><div><span><i class="fa-solid fa-bolt"></i></span><div><h2 id="theme-volatility-modal-title">테마성 종목의 최근 1년 급등락</h2><p>사례 종목의 일봉 가격·거래량을 통해 변동성을 관찰합니다.</p></div></div><button type="button" data-theme-volatility-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header><div class="theme-volatility-tabs" role="tablist" aria-label="테마성 종목 선택">${stocks.map((stock, index) => `<button type="button" role="tab" aria-selected="${index === 0}" class="${index === 0 ? 'is-active' : ''}" data-theme-stock="${stock.ticker}"><b>${stock.name}</b><small>${codeOf(stock.ticker)} · ${marketOf(stock.ticker)}</small><small>${stock.theme}</small></button>`).join('')}</div><main><p class="theme-volatility-status" data-theme-volatility-status>최근 1년 일봉을 불러오는 중…</p><section class="theme-volatility-chart-wrap"><canvas data-theme-volatility-chart aria-label="선택한 테마성 종목의 최근 1년 가격과 거래량 차트"></canvas></section><section class="theme-volatility-summary" data-theme-volatility-summary aria-live="polite"></section><p class="theme-volatility-note" data-theme-volatility-note></p></main></section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('[data-theme-volatility-chart]'); const status = modal.querySelector('[data-theme-volatility-status]'); const summary = modal.querySelector('[data-theme-volatility-summary]'); const note = modal.querySelector('[data-theme-volatility-note]'); const closeButton = modal.querySelector('[data-theme-volatility-close]');
  let lastFocused = null; let selected = stocks[0]; let requestId = 0;
  const number = (value, digits = 0) => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const draw = (points) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(380, canvas.parentElement.clientWidth - 2); const height = 360;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 52; const right = 18; const top = 22; const priceHeight = 222; const volumeTop = 276; const volumeHeight = 56; const chartWidth = width - left - right;
    const lows = points.map((point) => point.l); const highs = points.map((point) => point.h); const priceMin = Math.min(...lows) * .97; const priceMax = Math.max(...highs) * 1.03; const priceGap = Math.max(priceMax - priceMin, 1); const maxVolume = Math.max(...points.map((point) => point.v), 1);
    const x = (index) => left + index * chartWidth / Math.max(points.length - 1, 1); const y = (price) => top + (priceMax - price) / priceGap * priceHeight;
    [0, .5, 1].forEach((ratio) => { const py = top + priceHeight * ratio; const value = priceMax - priceGap * ratio; ctx.strokeStyle = '#e2e8f0'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(width - right, py); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#64748b'; ctx.font = '10px Pretendard, sans-serif'; ctx.textAlign = 'end'; ctx.fillText(number(value), left - 7, py + 3); });
    const bodyWidth = Math.max(1, Math.min(5, chartWidth / points.length * .72));
    points.forEach((point, index) => { const px = x(index); const up = point.c >= point.o; const color = up ? '#ef4444' : '#2563eb'; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, y(point.h)); ctx.lineTo(px, y(point.l)); ctx.stroke(); ctx.fillStyle = color; const openY = y(point.o); const closeY = y(point.c); ctx.fillRect(px - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(1, Math.abs(closeY - openY))); const barHeight = point.v / maxVolume * volumeHeight; ctx.globalAlpha = .45; ctx.fillRect(px - bodyWidth / 2, volumeTop + volumeHeight - barHeight, bodyWidth, barHeight); ctx.globalAlpha = 1; });
    ctx.fillStyle = '#64748b'; ctx.font = '10px Pretendard, sans-serif'; ctx.textAlign = 'start'; ctx.fillText('가격', 5, top + 4); ctx.fillText('거래량', 5, volumeTop + 10); ctx.textAlign = 'center'; points.forEach((point, index) => { if (index % Math.ceil(points.length / 6) === 0 || index === points.length - 1) ctx.fillText(point.date.slice(5), x(index), height - 10); }); ctx.textAlign = 'start';
  };
  const load = async () => {
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 최근 1년 일봉을 불러오는 중…'; summary.replaceChildren(); note.textContent = '';
    try {
      const response = await fetch(`/api/home/market-candle?period=1y&ticker=${encodeURIComponent(selected.ticker)}`); const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`); if (activeRequest !== requestId) return;
      const points = (data.ohlcv || []).filter((point) => [point?.o, point?.h, point?.l, point?.c].every((value) => Number.isFinite(Number(value)))).map((point) => ({ ...point, o: Number(point.o), h: Number(point.h), l: Number(point.l), c: Number(point.c), v: Number(point.v) || 0 })); if (points.length < 2) throw new Error('표시할 가격 데이터가 부족합니다.');
      draw(points); const first = points[0]; const last = points.at(-1); const change = (last.c / first.c - 1) * 100; const high = Math.max(...points.map((point) => point.h)); const low = Math.min(...points.map((point) => point.l)); const range = (high / low - 1) * 100;
      status.textContent = `${selected.name}(${codeOf(selected.ticker)} · ${marketOf(selected.ticker)}) · ${points[0].date} ~ ${last.date} · 일봉 기준${data.is_simulated ? ' · 예시 데이터' : ''}`;
      summary.innerHTML = `<article><span>1년 등락률</span><strong class="${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change.toFixed(1)}%</strong><small>시작 종가와 마지막 종가 비교</small></article><article><span>연중 가격 범위</span><strong>${number(low)} ~ ${number(high)}</strong><small>고가·저가 기준 ${range.toFixed(1)}% 폭</small></article><article><span>읽는 순서</span><strong>가격 + 거래량 + 근거</strong><small>급등락의 이유는 공시·실적에서 확인</small></article>`;
      note.textContent = `${selected.theme}라는 시장의 분류는 사업 실적이나 수혜를 보장하지 않습니다. 이 차트는 변동성 관찰용 사례이며, 급등·급락 뒤의 매매 판단이나 수익을 예측하지 않습니다.`;
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(); closeButton.focus(); }); closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-theme-stock]').forEach((button) => button.addEventListener('click', () => { selected = stocks.find((stock) => stock.ticker === button.dataset.themeStock) || stocks[0]; modal.querySelectorAll('[data-theme-stock]').forEach((tab) => { const active = tab === button; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); }); load(); }));
  window.addEventListener('resize', () => { if (modal.classList.contains('show')) load(); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup; window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installMomentumPicksModal(root, docId) {
  const trigger = root.querySelector('[data-momentum-picks]'); if (docId !== '05' || !trigger) return;
  const marketOf = (ticker) => ticker.endsWith('.KS') ? 'KOSPI' : ticker.endsWith('.KQ') ? 'KOSDAQ' : '';
  const codeOf = (ticker) => ticker.split('.')[0];
  // 최근 산업 뉴스에서 자주 언급된 예시 종목입니다. 매수 추천이나 수익 보장이 아니며, 차트를 함께 읽는 연습용입니다.
  const stocks = [
    { ticker: '000660.KS', name: 'SK하이닉스', theme: 'AI 메모리 수요 관련 기대' },
    { ticker: '012450.KS', name: '한화에어로스페이스', theme: '방산 수출 관련 기대' },
    { ticker: '267260.KS', name: 'HD현대일렉트릭', theme: 'AI 데이터센터 전력기기 수요 관련 기대' },
    { ticker: '034020.KS', name: '두산에너빌리티', theme: '원전 관련 기대' },
    { ticker: '009540.KS', name: 'HD한국조선해양', theme: '조선 수주 관련 기대' },
  ];
  const modal = document.createElement('div'); modal.className = 'momentum-picks-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'momentum-picks-modal-title');
  modal.innerHTML = `<section class="momentum-picks-modal"><header><div><span><i class="fa-solid fa-chart-line"></i></span><div><h2 id="momentum-picks-modal-title">모멘텀 예시 종목 차트</h2><p>최근 산업 뉴스에서 자주 언급된 예시 종목의 최근 6개월 가격·거래량을 확인합니다.</p></div></div><button type="button" data-momentum-picks-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="momentum-picks-select-row"><label for="momentum-picks-select">종목 선택</label><select id="momentum-picks-select">${stocks.map((stock, index) => `<option value="${stock.ticker}" ${index === 0 ? 'selected' : ''}>${stock.name} (${codeOf(stock.ticker)} · ${marketOf(stock.ticker)}) — ${stock.theme}</option>`).join('')}</select></div>
    <main><p class="momentum-picks-status" data-momentum-picks-status>최근 6개월 일봉을 불러오는 중…</p><section class="momentum-picks-chart-wrap"><canvas data-momentum-picks-chart aria-label="선택한 모멘텀 예시 종목의 최근 6개월 가격과 거래량 차트"></canvas></section><section class="momentum-picks-summary" data-momentum-picks-summary aria-live="polite"></section><p class="momentum-picks-note" data-momentum-picks-note></p></main></section>`;
  document.body.appendChild(modal);
  const select = modal.querySelector('#momentum-picks-select');
  const canvas = modal.querySelector('[data-momentum-picks-chart]'); const status = modal.querySelector('[data-momentum-picks-status]'); const summary = modal.querySelector('[data-momentum-picks-summary]'); const note = modal.querySelector('[data-momentum-picks-note]'); const closeButton = modal.querySelector('[data-momentum-picks-close]');
  let lastFocused = null; let requestId = 0;
  const number = (value, digits = 0) => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  const draw = (points) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(380, canvas.parentElement.clientWidth - 2); const height = 360;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 52; const right = 18; const top = 22; const priceHeight = 222; const volumeTop = 276; const volumeHeight = 56; const chartWidth = width - left - right;
    const lows = points.map((point) => point.l); const highs = points.map((point) => point.h); const priceMin = Math.min(...lows) * .97; const priceMax = Math.max(...highs) * 1.03; const priceGap = Math.max(priceMax - priceMin, 1); const maxVolume = Math.max(...points.map((point) => point.v), 1);
    const x = (index) => left + index * chartWidth / Math.max(points.length - 1, 1); const y = (price) => top + (priceMax - price) / priceGap * priceHeight;
    [0, .5, 1].forEach((ratio) => { const py = top + priceHeight * ratio; const value = priceMax - priceGap * ratio; ctx.strokeStyle = '#e2e8f0'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(width - right, py); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#64748b'; ctx.font = '10px Pretendard, sans-serif'; ctx.textAlign = 'end'; ctx.fillText(number(value), left - 7, py + 3); });
    const bodyWidth = Math.max(1, Math.min(6, chartWidth / points.length * .72));
    points.forEach((point, index) => { const px = x(index); const up = point.c >= point.o; const color = up ? '#ef4444' : '#2563eb'; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, y(point.h)); ctx.lineTo(px, y(point.l)); ctx.stroke(); ctx.fillStyle = color; const openY = y(point.o); const closeY = y(point.c); ctx.fillRect(px - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(1, Math.abs(closeY - openY))); const barHeight = point.v / maxVolume * volumeHeight; ctx.globalAlpha = .45; ctx.fillRect(px - bodyWidth / 2, volumeTop + volumeHeight - barHeight, bodyWidth, barHeight); ctx.globalAlpha = 1; });
    ctx.fillStyle = '#64748b'; ctx.font = '10px Pretendard, sans-serif'; ctx.textAlign = 'start'; ctx.fillText('가격', 5, top + 4); ctx.fillText('거래량', 5, volumeTop + 10); ctx.textAlign = 'center'; points.forEach((point, index) => { if (index % Math.ceil(points.length / 6) === 0 || index === points.length - 1) ctx.fillText(point.date.slice(5), x(index), height - 10); }); ctx.textAlign = 'start';
  };
  const load = async () => {
    const stock = stocks.find((item) => item.ticker === select.value) || stocks[0];
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 최근 6개월 일봉을 불러오는 중…'; summary.replaceChildren(); note.textContent = '';
    try {
      const response = await fetch(`/api/home/market-candle?period=6mo&ticker=${encodeURIComponent(stock.ticker)}`); const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`); if (activeRequest !== requestId) return;
      const points = (data.ohlcv || []).filter((point) => [point?.o, point?.h, point?.l, point?.c].every((value) => Number.isFinite(Number(value)))).map((point) => ({ ...point, o: Number(point.o), h: Number(point.h), l: Number(point.l), c: Number(point.c), v: Number(point.v) || 0 })); if (points.length < 2) throw new Error('표시할 가격 데이터가 부족합니다.');
      draw(points); const first = points[0]; const last = points.at(-1); const change = (last.c / first.c - 1) * 100; const high = Math.max(...points.map((point) => point.h)); const low = Math.min(...points.map((point) => point.l)); const range = (high / low - 1) * 100;
      status.textContent = `${stock.name}(${codeOf(stock.ticker)} · ${marketOf(stock.ticker)}) · ${points[0].date} ~ ${last.date} · 일봉 기준${data.is_simulated ? ' · 예시 데이터' : ''}`;
      summary.innerHTML = `<article><span>6개월 등락률</span><strong class="${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change.toFixed(1)}%</strong><small>시작 종가와 마지막 종가 비교</small></article><article><span>기간 중 가격 범위</span><strong>${number(low)} ~ ${number(high)}</strong><small>고가·저가 기준 ${range.toFixed(1)}% 폭</small></article><article><span>읽는 순서</span><strong>가격 + 거래량 + 근거</strong><small>상승 이유는 실적·공시에서 확인</small></article>`;
      note.textContent = `${stock.theme}라는 시장의 관심은 사업 실적이나 수혜를 보장하지 않습니다. 이 차트는 모멘텀 개념을 연습하기 위한 예시이며, 매수·매도 추천이나 미래 수익을 예측하지 않습니다.`;
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(); closeButton.focus(); }); closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  select.addEventListener('change', load);
  window.addEventListener('resize', () => { if (modal.classList.contains('show')) load(); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup; window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installPercentChangeSimulator(root, docId) {
  const trigger = root.querySelector('[data-percent-change-simulator]');
  if (docId !== '05' || !trigger) return;
  const modal = document.createElement('div');
  modal.className = 'percent-change-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'percent-change-modal-title');
  modal.innerHTML = `<section class="percent-change-modal"><header><div><span><i class="fa-solid fa-calculator"></i></span><div><h2 id="percent-change-modal-title">수익률·회복률 미니 계산기</h2><p>퍼센트를 실제 내 돈의 변화와 원금 회복에 필요한 상승률로 바꿔 보세요.</p></div></div><button type="button" data-percent-change-close aria-label="계산기 닫기"><i class="fa-solid fa-xmark"></i></button></header><main><section class="percent-change-inputs"><label>투자 금액 (원)<input type="number" data-percent-input="amount" value="100000" min="0" step="10000"></label><label>가격 변화율 (%)<input type="number" data-percent-input="change" value="-50" min="-99.9" step="1"></label><label>매매·환전 등 비용 (%)<input type="number" data-percent-input="cost" value="0.3" min="0" step="0.1"></label></section><section class="percent-change-results" aria-live="polite"><article><span>변화 뒤 평가금액</span><strong data-percent-output="after"></strong></article><article><span>비용을 뺀 손익</span><strong data-percent-output="profit"></strong></article><article><span>원금 회복에 필요한 상승률</span><strong data-percent-output="recovery"></strong></article></section><section class="percent-change-reading"><h3>계산을 이렇게 읽어 보세요</h3><p data-percent-reading></p><div><b data-percent-formula="after"></b><b data-percent-formula="recovery"></b></div></section><footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer></main></section>`;
  document.body.appendChild(modal);
  const closeButton = modal.querySelector('[data-percent-change-close]'); let lastFocused = null;
  const money = (value) => `${Math.round(value).toLocaleString('ko-KR')}원`;
  const update = () => { const input = (name) => Number(modal.querySelector(`[data-percent-input="${name}"]`).value) || 0; const amount = input('amount'); const change = input('change'); const cost = input('cost'); const gross = amount * (1 + change / 100); const totalCost = amount * cost / 100; const after = gross - totalCost; const profit = after - amount; const recovery = after > 0 ? (amount / after - 1) * 100 : null;
    modal.querySelector('[data-percent-output="after"]').textContent = money(after); modal.querySelector('[data-percent-output="profit"]').textContent = `${profit >= 0 ? '+' : ''}${money(profit)}`; modal.querySelector('[data-percent-output="recovery"]').textContent = recovery === null ? '회복 불가' : `+${recovery.toFixed(1)}%`;
    modal.querySelector('[data-percent-reading]').textContent = change < 0 ? `${Math.abs(change).toFixed(1)}% 하락 뒤에는 같은 ${Math.abs(change).toFixed(1)}% 상승으로 원금이 회복되지 않습니다. 손실 폭이 클수록 필요한 회복률은 더 빠르게 커집니다.` : `상승률은 실제 손익 ${money(profit)}으로 바뀝니다. 비용을 제외한 금액과 감당 가능한 하락 폭을 함께 확인하세요.`;
    modal.querySelector('[data-percent-formula="after"]').textContent = `${money(amount)} × (1 ${change >= 0 ? '+' : '−'} ${Math.abs(change)}%) − 비용 ${money(totalCost)} = ${money(after)}`; modal.querySelector('[data-percent-formula="recovery"]').textContent = recovery === null ? '평가금액이 0 이하라 원금 회복률을 계산할 수 없습니다.' : `${money(after)}에서 ${money(amount)}으로 돌아가려면 +${recovery.toFixed(1)}% 필요`;
  };
  const close = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); }; const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) close(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); update(); closeButton.focus(); }); closeButton.addEventListener('click', close); modal.addEventListener('click', (event) => { if (event.target === modal) close(); }); modal.querySelectorAll('[data-percent-input]').forEach((element) => element.addEventListener('input', update)); modal.querySelector('[data-percent-reset]').addEventListener('click', () => { modal.querySelectorAll('[data-percent-input]').forEach((element) => { element.value = element.defaultValue; }); update(); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup; window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installNpsHoldingsModal(root, docId) {
  const trigger = root.querySelector('[data-nps-holdings]'); if (docId !== '07' || !trigger) return;
  const modal = document.createElement('div'); modal.className = 'nps-holdings-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'nps-holdings-title');
  modal.innerHTML = `<section class="nps-holdings-modal"><header><div><span><i class="fa-solid fa-landmark"></i></span><div><h2 id="nps-holdings-title">국민연금 국내주식 보유 현황</h2><p>연말 공개 자료로 보는 종목별 평가액·보유 비중·지분율입니다.</p></div></div><button type="button" data-nps-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header><main><div class="nps-holdings-tabs" data-nps-tabs></div><div class="nps-holdings-toolbar"><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-nps-search placeholder="종목명 검색 (예: 삼성)"></label><span data-nps-total></span></div><p class="nps-holdings-status" data-nps-status>자료를 불러오는 중입니다.</p><div class="nps-holdings-table-wrap"><table><thead><tr><th>종목명</th><th>평가액</th><th>국내주식 내 비중</th><th>지분율</th></tr></thead><tbody data-nps-body></tbody></table></div><p class="nps-holdings-note" data-nps-note></p></main></section>`;
  document.body.appendChild(modal); const body = modal.querySelector('[data-nps-body]'); const tabs = modal.querySelector('[data-nps-tabs]'); const status = modal.querySelector('[data-nps-status]'); const total = modal.querySelector('[data-nps-total]'); const note = modal.querySelector('[data-nps-note]'); const search = modal.querySelector('[data-nps-search]'); const closeButton = modal.querySelector('[data-nps-close]'); let currentYear = 2025; let availableYears = []; let timer = null; let lastFocused = null;
  const number = (value, digits = 2) => Number(value).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  const renderTabs = () => { const lastYear = Math.max(...availableYears, 2025); tabs.innerHTML = Array.from({ length: lastYear - 2023 + 1 }, (_, index) => 2023 + index).map((year) => `<button type="button" data-nps-year="${year}" class="${year === currentYear ? 'is-active' : ''}" ${availableYears.includes(year) ? '' : 'disabled title="이 화면에 불러온 파일이 없습니다"'}>${year}년 말</button>`).join(''); tabs.querySelectorAll('[data-nps-year]:not(:disabled)').forEach((button) => button.addEventListener('click', () => { currentYear = Number(button.dataset.npsYear); search.value = ''; load(); })); };
  const load = async () => { status.textContent = '자료를 불러오는 중입니다.'; body.innerHTML = ''; total.textContent = ''; try { const response = await fetch(`/api/nps/domestic-equity-holdings?year=${currentYear}&query=${encodeURIComponent(search.value.trim())}&limit=50`); const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`); availableYears = data.available_years; if (!availableYears.includes(currentYear)) currentYear = Math.max(...availableYears); renderTabs(); status.textContent = `${data.as_of} 기준 · ${data.source}`; total.textContent = search.value.trim() ? `검색 결과 ${data.total.toLocaleString()}개 중 50개` : `상위 ${data.items.length}개`;
      body.innerHTML = data.items.length ? data.items.map((item) => `<tr><td><b>${item.name}</b></td><td>${number(item.value_eok)}억 원</td><td>${number(item.weight_pct, 3)}%</td><td>${number(item.ownership_pct, 3)}%</td></tr>`).join('') : '<tr><td colspan="4">검색 결과가 없습니다.</td></tr>'; note.textContent = data.note;
    } catch (error) { status.textContent = `자료를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; } };
  const close = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); }; const key = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) close(); }; trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(); closeButton.focus(); }); closeButton.addEventListener('click', close); modal.addEventListener('click', (event) => { if (event.target === modal) close(); }); search.addEventListener('input', () => { window.clearTimeout(timer); timer = window.setTimeout(load, 240); }); document.addEventListener('keydown', key); const previousCleanup = window._viewCleanup; window._viewCleanup = () => { previousCleanup?.(); window.clearTimeout(timer); document.removeEventListener('keydown', key); modal.remove(); };
}

function installCapmSimulator(root, docId) {
  const trigger = root.querySelector('[data-capm-simulator]'); if (docId !== '07' || !trigger) return;
  const modal = document.createElement('div');
  modal.className = 'capm-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'capm-modal-title');
  modal.innerHTML = `<section class="capm-modal"><header><div><span><i class="fa-solid fa-calculator"></i></span><div><h2 id="capm-modal-title">CAPM 기대수익률 계산기</h2><p>무위험 이자율·시장 기대수익률·베타를 바꾸면 위험을 고려한 기대수익률이 어떻게 달라지는지 확인하세요.</p></div></div><button type="button" data-capm-close aria-label="계산기 닫기"><i class="fa-solid fa-xmark"></i></button></header><main><section class="capm-inputs"><label>무위험 이자율 (%)<input type="number" data-capm-input="riskFree" value="3" min="0" max="20" step="0.1"></label><label>시장 기대수익률 (%)<input type="number" data-capm-input="marketReturn" value="9" min="-20" max="30" step="0.1"></label><label>베타(β)<input type="number" data-capm-input="beta" value="1.2" min="-3" max="5" step="0.1"></label></section><section class="capm-results" aria-live="polite"><article><span>시장 위험 프리미엄</span><strong data-capm-output="premium"></strong></article><article><span>베타 반영 리스크 프리미엄</span><strong data-capm-output="weighted"></strong></article><article><span>CAPM 기대수익률</span><strong data-capm-output="expected"></strong></article></section><section class="capm-reading"><h3>계산을 이렇게 읽어 보세요</h3><p data-capm-reading></p><b data-capm-formula></b></section><footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer></main></section>`;
  document.body.appendChild(modal);
  const closeButton = modal.querySelector('[data-capm-close]'); let lastFocused = null;
  const update = () => {
    const input = (name) => Number(modal.querySelector(`[data-capm-input="${name}"]`).value) || 0;
    const riskFree = input('riskFree'); const marketReturn = input('marketReturn'); const beta = input('beta');
    const premium = marketReturn - riskFree; const weighted = premium * beta; const expected = riskFree + weighted;
    modal.querySelector('[data-capm-output="premium"]').textContent = `${premium >= 0 ? '+' : ''}${premium.toFixed(2)}%`;
    modal.querySelector('[data-capm-output="weighted"]').textContent = `${weighted >= 0 ? '+' : ''}${weighted.toFixed(2)}%`;
    modal.querySelector('[data-capm-output="expected"]').textContent = `${expected.toFixed(2)}%`;
    modal.querySelector('[data-capm-reading]').textContent = beta > 1
      ? `베타가 1보다 커서 시장보다 더 민감하게 움직인다고 가정했습니다. 시장 위험 프리미엄 ${premium.toFixed(2)}%를 베타만큼(${beta}배) 키워서 반영합니다.`
      : beta < 1
        ? `베타가 1보다 작아서 시장보다 덜 민감하게 움직인다고 가정했습니다. 시장 위험 프리미엄 ${premium.toFixed(2)}%를 베타만큼(${beta}배)만 반영합니다.`
        : `베타가 1이어서 시장과 비슷한 폭으로 움직인다고 가정했습니다. 시장 위험 프리미엄 ${premium.toFixed(2)}%가 그대로 반영됩니다.`;
    modal.querySelector('[data-capm-formula]').textContent = `${riskFree}% + (${marketReturn}% − ${riskFree}%) × ${beta} = ${expected.toFixed(2)}%`;
  };
  const close = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) close(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); update(); closeButton.focus(); });
  closeButton.addEventListener('click', close); modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelectorAll('[data-capm-input]').forEach((element) => element.addEventListener('input', update));
  modal.querySelector('[data-capm-reset]').addEventListener('click', () => { modal.querySelectorAll('[data-capm-input]').forEach((element) => { element.value = element.defaultValue; }); update(); });
  document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installBacktestSimulator(root, docId) {
  const trigger = root.querySelector('[data-backtest-simulator]'); if (docId !== '06' || !trigger) return;
  const modal = document.createElement('div'); modal.className = 'backtest-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'backtest-title');
  modal.innerHTML = `<section class="backtest-modal"><header><div><span><i class="fa-solid fa-flask"></i></span><div><h2 id="backtest-title">쉬운 백테스트 연습기</h2><p>가상의 매매 결과를 바꾸며 수익률과 낙폭이 함께 움직이는 모습을 확인하세요.</p></div></div><button type="button" data-backtest-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header><main><div class="backtest-step"><b>STEP 1</b><span>매매 규칙의 결과를 입력해 보세요</span></div><section class="backtest-inputs"><label>시작 금액 (원)<input type="number" data-backtest="capital" value="1000000" min="10000" step="10000"></label><label>총 거래 횟수<input type="number" data-backtest="trades" value="20" min="1" max="100" step="1"></label><label>승률 (%)<input type="number" data-backtest="winRate" value="55" min="0" max="100" step="1"></label><label>이긴 거래 수익률 (%)<input type="number" data-backtest="win" value="4" min="0" step="0.1"></label><label>진 거래 손실률 (%)<input type="number" data-backtest="loss" value="3" min="0" step="0.1"></label><label>거래당 비용 (%)<input type="number" data-backtest="cost" value="0.2" min="0" step="0.05"></label></section><section class="backtest-results" aria-live="polite"><article><small>마지막 평가금액</small><strong data-backtest-out="final"></strong></article><article><small>전체 수익률</small><strong data-backtest-out="return"></strong></article><article><small>최대 낙폭 (MDD)</small><strong data-backtest-out="mdd"></strong></article><article><small>승 / 패</small><strong data-backtest-out="record"></strong></article></section><section class="backtest-chart-wrap"><canvas data-backtest-chart aria-label="가상 백테스트 자산 변화 그래프"></canvas></section><section class="backtest-reading"><h3>이 결과를 이렇게 읽어요</h3><p data-backtest-reading></p><p data-backtest-formula></p></section><footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer></main></section>`;
  document.body.appendChild(modal); const closeButton = modal.querySelector('[data-backtest-close]'); const canvas = modal.querySelector('[data-backtest-chart]'); let lastFocused = null;
  const money = (value) => `${Math.round(value).toLocaleString('ko-KR')}원`; const num = (name) => Number(modal.querySelector(`[data-backtest="${name}"]`).value) || 0;
  const draw = (values) => { const width = Math.max(360, canvas.parentElement.clientWidth - 2); const height = 190; const dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); const min = Math.min(...values); const max = Math.max(...values); const gap = Math.max(max - min, 1); const x = (index) => 22 + index * (width - 44) / Math.max(values.length - 1, 1); const y = (value) => 18 + (max - value) / gap * (height - 48); ctx.strokeStyle = '#e2e8f0'; ctx.beginPath(); ctx.moveTo(22, height - 30); ctx.lineTo(width - 22, height - 30); ctx.stroke(); ctx.beginPath(); values.forEach((value, index) => index ? ctx.lineTo(x(index), y(value)) : ctx.moveTo(x(index), y(value))); ctx.lineTo(x(values.length - 1), height - 30); ctx.lineTo(x(0), height - 30); ctx.closePath(); ctx.fillStyle = 'rgba(37,99,235,.12)'; ctx.fill(); ctx.beginPath(); values.forEach((value, index) => index ? ctx.lineTo(x(index), y(value)) : ctx.moveTo(x(index), y(value))); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.fillStyle = '#64748b'; ctx.font = '600 11px sans-serif'; ctx.fillText('시작', 18, height - 10); ctx.fillText(`${values.length - 1}번째 거래`, width - 68, height - 10); };
  const update = () => { const capital = num('capital'); const trades = Math.min(100, Math.max(1, Math.round(num('trades')))); const winRate = Math.min(100, Math.max(0, num('winRate'))); const gain = num('win'); const loss = num('loss'); const cost = num('cost'); const wins = Math.round(trades * winRate / 100); const outcomes = Array.from({ length: trades }, (_, index) => index < wins ? gain - cost : -loss - cost).sort((a, b) => (Math.abs(a) % 3) - (Math.abs(b) % 3)); let amount = capital; let high = amount; let mdd = 0; const values = [amount]; outcomes.forEach((result) => { amount *= 1 + result / 100; high = Math.max(high, amount); mdd = Math.min(mdd, (amount / high - 1) * 100); values.push(amount); }); const totalReturn = capital ? (amount / capital - 1) * 100 : 0; modal.querySelector('[data-backtest-out="final"]').textContent = money(amount); modal.querySelector('[data-backtest-out="return"]').textContent = `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(1)}%`; modal.querySelector('[data-backtest-out="mdd"]').textContent = `${mdd.toFixed(1)}%`; modal.querySelector('[data-backtest-out="record"]').textContent = `${wins}승 / ${trades - wins}패`; modal.querySelector('[data-backtest-reading]').textContent = totalReturn >= 0 ? `수익이 났더라도 중간에 ${Math.abs(mdd).toFixed(1)}%까지 내려갈 수 있었습니다. 이 하락 폭을 견딜 수 있는지가 수익률만큼 중요합니다.` : `승률이 있어도 손실이 더 크거나 비용이 높으면 전체 결과는 마이너스가 될 수 있습니다. 승률만으로 전략을 판단하지 마세요.`; modal.querySelector('[data-backtest-formula]').textContent = `${trades}번 중 ${wins}번은 +${gain}%에서 비용 ${cost}%를 빼고, ${trades - wins}번은 −${loss}%와 비용 ${cost}%를 반영한 가상 결과입니다.`; draw(values); };
  const close = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); }; const key = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) close(); }; trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); update(); closeButton.focus(); }); closeButton.addEventListener('click', close); modal.addEventListener('click', (event) => { if (event.target === modal) close(); }); modal.querySelectorAll('[data-backtest]').forEach((input) => input.addEventListener('input', update)); modal.querySelector('[data-backtest-reset]').addEventListener('click', () => { modal.querySelectorAll('[data-backtest]').forEach((input) => { input.value = input.defaultValue; }); update(); }); window.addEventListener('resize', () => { if (modal.classList.contains('show')) update(); }); document.addEventListener('keydown', key); const previousCleanup = window._viewCleanup; window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', key); modal.remove(); };
}

function installSplitBuySimulator(root, docId) {
  const trigger = root.querySelector('[data-split-buy-simulator]'); if (docId !== '07' || !trigger) return;
  const modal = document.createElement('div'); modal.className = 'split-buy-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'split-buy-modal-title');
  modal.innerHTML = `<section class="split-buy-modal"><header><div><span><i class="fa-solid fa-layer-group"></i></span><div><h2 id="split-buy-modal-title">분할매수 평단 시뮬레이터</h2><p>여러 번에 나눠 살 때 평균 매수 단가(평단)가 어떻게 만들어지는지 확인해 보세요.</p></div></div><button type="button" data-split-buy-close aria-label="분할매수 시뮬레이터 닫기"><i class="fa-solid fa-xmark"></i></button></header><main><section class="split-buy-steps"><div class="split-buy-step"><label class="split-buy-toggle"><input type="checkbox" data-split-buy-enable="1" checked>1차</label><label>가격(원)<input type="number" data-split-buy-price="1" value="100000" min="0" step="1000"></label><label>투자금(원)<input type="number" data-split-buy-amount="1" value="400000" min="0" step="10000"></label></div><div class="split-buy-step"><label class="split-buy-toggle"><input type="checkbox" data-split-buy-enable="2" checked>2차</label><label>가격(원)<input type="number" data-split-buy-price="2" value="80000" min="0" step="1000"></label><label>투자금(원)<input type="number" data-split-buy-amount="2" value="400000" min="0" step="10000"></label></div><div class="split-buy-step"><label class="split-buy-toggle"><input type="checkbox" data-split-buy-enable="3" checked>3차</label><label>가격(원)<input type="number" data-split-buy-price="3" value="130000" min="0" step="1000"></label><label>투자금(원)<input type="number" data-split-buy-amount="3" value="400000" min="0" step="10000"></label></div><div class="split-buy-step"><label class="split-buy-toggle"><input type="checkbox" data-split-buy-enable="4">4차</label><label>가격(원)<input type="number" data-split-buy-price="4" value="110000" min="0" step="1000"></label><label>투자금(원)<input type="number" data-split-buy-amount="4" value="400000" min="0" step="10000"></label></div></section><label class="split-buy-now">현재가(원)<input type="number" data-split-buy-current value="80000" min="0" step="1000"></label><section class="split-buy-chart-wrap"><canvas data-split-buy-chart aria-label="매수 가격과 평단, 현재가의 위치를 보여주는 그래프"></canvas></section><div class="split-buy-table-wrap"><table class="split-buy-table"><thead><tr><th>차례</th><th>매수 가격</th><th>매수 수량</th><th>누적 투자금</th><th>누적 수량</th><th>평단</th></tr></thead><tbody data-split-buy-rows></tbody></table></div><section class="split-buy-summary" aria-live="polite"><article><span>총 투자금</span><strong data-split-buy-out="total"></strong></article><article><span>총 보유 수량</span><strong data-split-buy-out="qty"></strong></article><article><span>평단(평균 매수 단가)</span><strong data-split-buy-out="avg"></strong></article><article><span>현재가 대비 평가손익</span><strong data-split-buy-out="pl"></strong></article></section><p class="split-buy-reading" data-split-buy-reading></p></main><footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer></section>`;
  document.body.appendChild(modal);
  const closeButton = modal.querySelector('[data-split-buy-close]'); const canvas = modal.querySelector('[data-split-buy-chart]'); let lastFocused = null; const steps = [1, 2, 3, 4];
  const money = (value) => `${Math.round(value).toLocaleString('ko-KR')}원`;
  const draw = (points, avg, current) => {
    const width = Math.max(360, canvas.parentElement.clientWidth - 2); const height = 130; const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const all = [...points.map((p) => p.price), avg, current].filter((v) => v > 0);
    const min = all.length ? Math.min(...all) * 0.95 : 0; const max = all.length ? Math.max(...all) * 1.05 : 1; const gap = Math.max(max - min, 1);
    const x = (value) => 30 + (value - min) / gap * (width - 60); const axisY = 74;
    ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(20, axisY); ctx.lineTo(width - 20, axisY); ctx.stroke();
    points.forEach((p, index) => { const px = x(p.price); ctx.beginPath(); ctx.arc(px, axisY, 6, 0, Math.PI * 2); ctx.fillStyle = '#94a3b8'; ctx.fill(); ctx.fillStyle = '#475569'; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${index + 1}차`, px, axisY - 14); });
    if (avg > 0) { const ax = x(avg); ctx.strokeStyle = '#0f766e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ax, axisY - 34); ctx.lineTo(ax, axisY + 34); ctx.stroke(); ctx.fillStyle = '#0f766e'; ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('평단', ax, axisY + 50); }
    if (current > 0) { const cx = x(current); const rising = current >= avg; ctx.fillStyle = rising ? '#dc2626' : '#2563eb'; ctx.beginPath(); ctx.moveTo(cx, axisY - 40); ctx.lineTo(cx - 6, axisY - 30); ctx.lineTo(cx + 6, axisY - 30); ctx.closePath(); ctx.fill(); ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('현재가', cx, axisY - 46); }
  };
  const update = () => {
    let invested = 0; let qty = 0; const rows = []; const points = [];
    steps.forEach((step) => {
      const enabled = modal.querySelector(`[data-split-buy-enable="${step}"]`).checked;
      const price = Number(modal.querySelector(`[data-split-buy-price="${step}"]`).value) || 0;
      const amount = Number(modal.querySelector(`[data-split-buy-amount="${step}"]`).value) || 0;
      if (!enabled || price <= 0) return;
      const bought = Math.floor(amount / price); if (bought <= 0) return;
      invested += bought * price; qty += bought; points.push({ price });
      rows.push(`<tr><td>${rows.length + 1}차</td><td>${money(price)}</td><td>${bought.toLocaleString()}주</td><td>${money(invested)}</td><td>${qty.toLocaleString()}주</td><td>${money(invested / qty)}</td></tr>`);
    });
    modal.querySelector('[data-split-buy-rows]').innerHTML = rows.join('') || '<tr><td colspan="6">활성화된 매수 차례가 없습니다.</td></tr>';
    const avg = qty ? invested / qty : 0; const current = Number(modal.querySelector('[data-split-buy-current]').value) || 0; const pl = qty ? (current - avg) * qty : 0; const plPercent = avg ? (current / avg - 1) * 100 : 0;
    modal.querySelector('[data-split-buy-out="total"]').textContent = money(invested); modal.querySelector('[data-split-buy-out="qty"]').textContent = `${qty.toLocaleString()}주`; modal.querySelector('[data-split-buy-out="avg"]').textContent = qty ? money(avg) : '—';
    modal.querySelector('[data-split-buy-out="pl"]').textContent = qty ? `${pl >= 0 ? '+' : ''}${money(pl)} (${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(1)}%)` : '—';
    modal.querySelector('[data-split-buy-reading]').textContent = !qty ? '가격과 투자금을 입력하면 평단이 계산됩니다.' : pl >= 0 ? `현재가가 평단 ${money(avg)}보다 높아 평가이익 상태입니다. 평단은 특정 회차의 가격이 아니라, 수량으로 가중 평균한 값이라는 점을 확인하세요.` : `현재가가 평단 ${money(avg)}보다 낮아 평가손실 상태입니다. 평단이 낮아졌다고 해서 손실이 사라지거나 추가 매수가 항상 옳았다는 뜻은 아닙니다.`;
    draw(points, avg, current);
  };
  const close = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); }; const key = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) close(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); update(); closeButton.focus(); }); closeButton.addEventListener('click', close); modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelectorAll('input').forEach((input) => input.addEventListener('input', update));
  modal.querySelector('[data-split-buy-reset]').addEventListener('click', () => { modal.querySelectorAll('input[type="number"], input[type="checkbox"]').forEach((input) => { if (input.type === 'checkbox') input.checked = input.defaultChecked; else input.value = input.defaultValue; }); update(); });
  window.addEventListener('resize', () => { if (modal.classList.contains('show')) update(); });
  document.addEventListener('keydown', key); const previousCleanup = window._viewCleanup; window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', key); modal.remove(); };
}

function installDividendCalendarModal(root, docId) {
  const trigger = root.querySelector('[data-dividend-calendar]'); if (docId !== '07' || !trigger) return;
  const STOCKS = [
    { ticker: '005930.KS', name: '삼성전자' }, { ticker: '000660.KS', name: 'SK하이닉스' }, { ticker: '005380.KS', name: '현대차' },
    { ticker: '105560.KS', name: 'KB금융' }, { ticker: '005490.KS', name: 'POSCO홀딩스' },
  ];
  const modal = document.createElement('div'); modal.className = 'dividend-calendar-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'dividend-calendar-modal-title');
  modal.innerHTML = `<section class="dividend-calendar-modal"><header><div><span><i class="fa-solid fa-calendar-days"></i></span><div><h2 id="dividend-calendar-modal-title">주요 종목 배당 캘린더 (실제 이력 + 다음 배당 추정)</h2><p>야후 파이낸스의 실제 배당락일·배당금 이력과, 최근 주기를 바탕으로 추정한 다음 배당 일정을 확인합니다.</p></div></div><button type="button" data-dividend-calendar-close aria-label="배당 캘린더 닫기"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="dividend-calendar-tabs">${STOCKS.map((stock, index) => `<button type="button" data-dc-stock="${stock.ticker}" class="${index === 0 ? 'is-active' : ''}">${stock.name}</button>`).join('')}</div>
    <main><p class="dividend-calendar-status" data-dc-status>불러오는 중...</p>
      <section class="dividend-calendar-highlights" data-dc-highlights></section>
      <h3 class="dividend-calendar-subtitle">최근 배당 이력 (실제)</h3>
      <div class="dividend-calendar-table-wrap"><table class="dividend-calendar-table"><thead><tr><th>배당락일</th><th>배당기준일(추정)</th><th>주당배당금</th></tr></thead><tbody data-dc-history></tbody></table></div>
      <p class="dividend-calendar-note" data-dc-note></p>
    </main></section>`;
  document.body.appendChild(modal);
  const status = modal.querySelector('[data-dc-status]'); const highlights = modal.querySelector('[data-dc-highlights]');
  const historyBody = modal.querySelector('[data-dc-history]'); const note = modal.querySelector('[data-dc-note]'); const closeButton = modal.querySelector('[data-dividend-calendar-close]');
  let lastFocused = null; let requestId = 0; let currentTicker = STOCKS[0].ticker; const cache = new Map();
  const money = (value) => `${Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}원`;
  const render = (data) => {
    status.textContent = `${data.name} · ${data.as_of} 기준 · 최근 배당 ${data.history.length}회`;
    highlights.innerHTML = `
      <article><span>최근 배당락일</span><strong>${data.latest.ex_date}</strong></article>
      <article><span>최근 주당배당금</span><strong>${money(data.latest.amount)}</strong></article>
      <article class="is-estimate"><span>다음 배당락일(추정)</span><strong>${data.next_dividend.ex_date}</strong></article>
      <article class="is-estimate"><span>다음 예상 배당금(추정)</span><strong>${money(data.next_dividend.amount)}</strong></article>`;
    const rows = [...data.history].reverse().map((item) => `<tr><td>${item.ex_date}</td><td>${item.estimated_record_date}</td><td>${money(item.amount)}</td></tr>`).join('');
    const nextRow = `<tr class="is-estimate"><td>${data.next_dividend.ex_date}<small>추정</small></td><td>${data.next_dividend.estimated_record_date}<small>추정</small></td><td>${money(data.next_dividend.amount)}<small>추정</small></td></tr>`;
    historyBody.innerHTML = nextRow + rows;
    note.textContent = data.note;
  };
  const load = async (ticker) => {
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 배당 이력을 불러오는 중…'; highlights.innerHTML = ''; historyBody.innerHTML = '';
    try {
      if (!cache.has(ticker)) {
        const response = await fetch(`/api/market/dividend-history?ticker=${encodeURIComponent(ticker)}`);
        const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
        cache.set(ticker, data);
      }
      if (activeRequest !== requestId) return;
      render(cache.get(ticker));
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };
  const close = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); }; const key = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) close(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(currentTicker); closeButton.focus(); }); closeButton.addEventListener('click', close); modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelectorAll('[data-dc-stock]').forEach((button) => button.addEventListener('click', () => { currentTicker = button.dataset.dcStock; modal.querySelectorAll('[data-dc-stock]').forEach((tab) => tab.classList.toggle('is-active', tab === button)); load(currentTicker); }));
  document.addEventListener('keydown', key); const previousCleanup = window._viewCleanup; window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', key); modal.remove(); };
}

function installIpoChartModal(root, docId) {
  const trigger = root.querySelector('[data-ipo-chart]'); if (docId !== '07' || !trigger) return;
  const STOCKS = [
    { ticker: '064400.KS', label: 'LG CNS' }, { ticker: 'VG', label: 'Venture Global' }, { ticker: 'CRWV', label: 'CoreWeave' },
    { ticker: 'CRCL', label: 'Circle' }, { ticker: 'CHYM', label: 'Chime' }, { ticker: 'FIG', label: 'Figma' },
  ];
  const modal = document.createElement('div'); modal.className = 'ipo-chart-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'ipo-chart-modal-title');
  modal.innerHTML = `<section class="ipo-chart-modal"><header><div><span><i class="fa-solid fa-rocket"></i></span><div><h2 id="ipo-chart-modal-title">최근 국내·해외 IPO 종목 차트</h2><p>실제 거래 데이터로 확인된 최근 상장 종목의 상장일부터 지금까지 종가 흐름입니다.</p></div></div><button type="button" data-ipo-chart-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="ipo-chart-tabs">${STOCKS.map((s, i) => `<button type="button" data-ipo-ticker="${s.ticker}" class="${i === 0 ? 'is-active' : ''}">${s.label}</button>`).join('')}</div>
    <main><p class="ipo-chart-status" data-ipo-status>불러오는 중...</p><section class="ipo-chart-chart-wrap"><canvas data-ipo-chart-canvas aria-label="상장 이후 종가 흐름 차트"></canvas></section><section class="ipo-chart-summary" data-ipo-summary aria-live="polite"></section><p class="ipo-chart-note" data-ipo-note></p></main></section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('[data-ipo-chart-canvas]'); const status = modal.querySelector('[data-ipo-status]');
  const summary = modal.querySelector('[data-ipo-summary]'); const note = modal.querySelector('[data-ipo-note]'); const closeButton = modal.querySelector('[data-ipo-chart-close]');
  let lastFocused = null; let requestId = 0; let currentTicker = STOCKS[0].ticker; const cache = new Map();
  const draw = (points, ipoPrice) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(380, canvas.parentElement.clientWidth - 2); const height = 340;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 56; const right = 16; const top = 24; const bottom = 34; const chartWidth = width - left - right; const chartHeight = height - top - bottom;
    const closes = points.map((p) => p.close); const min = Math.min(...closes, ipoPrice) * .95; const max = Math.max(...closes, ipoPrice) * 1.05; const gap = Math.max(max - min, 1);
    const n = points.length; const x = (index) => left + index * chartWidth / Math.max(n - 1, 1); const y = (value) => top + (max - value) / gap * chartHeight;
    ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(left, y(ipoPrice)); ctx.lineTo(width - right, y(ipoPrice)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 10px Pretendard, sans-serif'; ctx.fillText('상장일 종가 기준선', left, y(ipoPrice) - 6);
    ctx.beginPath(); points.forEach((p, index) => { const px = x(index); const py = y(p.close); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.lineTo(x(n - 1), y(min)); ctx.lineTo(x(0), y(min)); ctx.closePath(); ctx.fillStyle = 'rgba(37,99,235,.1)'; ctx.fill();
    ctx.beginPath(); points.forEach((p, index) => { const px = x(index); const py = y(p.close); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '600 10px Pretendard, sans-serif'; ctx.textAlign = 'center';
    points.forEach((p, index) => { if (index % Math.ceil(n / 7) === 0 || index === n - 1) ctx.fillText(p.date.slice(0, 7), x(index), height - 12); }); ctx.textAlign = 'start';
  };
  const load = async (ticker) => {
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 상장 이후 데이터를 불러오는 중…'; summary.innerHTML = '';
    try {
      if (!cache.has(ticker)) {
        const response = await fetch(`/api/market/ipo-since-listing?ticker=${encodeURIComponent(ticker)}`);
        const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
        cache.set(ticker, data);
      }
      const data = cache.get(ticker); if (activeRequest !== requestId) return;
      draw(data.points, data.ipo_price);
      const priceLabel = data.market === 'KOSPI' ? '원' : '';
      status.textContent = `${data.name}(${data.market}, ${data.country}) · 상장일 ${data.listing_date}`;
      summary.innerHTML = `<article><span>상장 첫날 종가</span><strong>${data.ipo_price.toLocaleString('ko-KR')}${priceLabel}</strong></article><article><span>현재가</span><strong>${data.latest_price.toLocaleString('ko-KR')}${priceLabel}</strong></article><article><span>상장 이후 등락률</span><strong class="${data.performance_pct >= 0 ? 'up' : 'down'}">${data.performance_pct >= 0 ? '+' : ''}${data.performance_pct}%</strong></article><article><span>상장 이후 최고/최저</span><strong>${data.high.close.toLocaleString('ko-KR')} / ${data.low.close.toLocaleString('ko-KR')}</strong></article>`;
      note.textContent = data.note;
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(currentTicker); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-ipo-ticker]').forEach((button) => button.addEventListener('click', () => { currentTicker = button.dataset.ipoTicker; modal.querySelectorAll('[data-ipo-ticker]').forEach((tab) => tab.classList.toggle('is-active', tab === button)); load(currentTicker); }));
  window.addEventListener('resize', () => { if (modal.classList.contains('show') && cache.has(currentTicker)) draw(cache.get(currentTicker).points, cache.get(currentTicker).ipo_price); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installPennyStockRallyModal(root, docId) {
  const trigger = root.querySelector('[data-penny-stock-rally]'); if (docId !== '07' || !trigger) return;
  const STOCKS = [
    { ticker: '005360.KS', label: '모나미' }, { ticker: '014710.KS', label: '사조씨푸드' }, { ticker: '008040.KS', label: '사조동아원' },
  ];
  const modal = document.createElement('div'); modal.className = 'penny-rally-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'penny-rally-modal-title');
  modal.innerHTML = `<section class="penny-rally-modal"><header><div><span><i class="fa-solid fa-arrow-trend-up"></i></span><div><h2 id="penny-rally-modal-title">동전주였다가 크게 오른 사례</h2><p>최근 6개월 실제 가격·거래량으로, 낮은 가격의 종목이 얼마나 크게 흔들렸는지 확인합니다.</p></div></div><button type="button" data-penny-rally-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="penny-rally-tabs">${STOCKS.map((s, i) => `<button type="button" data-penny-ticker="${s.ticker}" class="${i === 0 ? 'is-active' : ''}">${s.label}</button>`).join('')}</div>
    <main><p class="penny-rally-status" data-penny-status>불러오는 중...</p><section class="penny-rally-chart-wrap"><canvas data-penny-chart aria-label="동전주 사례 종목의 가격·거래량 차트"></canvas></section><section class="penny-rally-summary" data-penny-summary aria-live="polite"></section><p class="penny-rally-note" data-penny-note></p></main></section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('[data-penny-chart]'); const status = modal.querySelector('[data-penny-status]');
  const summary = modal.querySelector('[data-penny-summary]'); const note = modal.querySelector('[data-penny-note]'); const closeButton = modal.querySelector('[data-penny-rally-close]');
  let lastFocused = null; let requestId = 0; let currentTicker = STOCKS[0].ticker; const cache = new Map();
  const draw = (points) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = Math.max(380, canvas.parentElement.clientWidth - 2); const height = 340;
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height);
    const left = 56; const right = 16; const top = 20; const priceHeight = 210; const volumeTop = 254; const volumeHeight = 60; const chartWidth = width - left - right;
    const closes = points.map((p) => p.close); const priceMin = Math.min(...closes) * .95; const priceMax = Math.max(...closes) * 1.05; const priceGap = Math.max(priceMax - priceMin, 1); const maxVolume = Math.max(...points.map((p) => p.volume), 1);
    const n = points.length; const x = (index) => left + index * chartWidth / Math.max(n - 1, 1); const y = (value) => top + (priceMax - value) / priceGap * priceHeight;
    ctx.beginPath(); points.forEach((p, index) => { const px = x(index); const py = y(p.close); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.stroke();
    const barWidth = Math.max(1, Math.min(5, chartWidth / n * .7));
    points.forEach((p, index) => { const px = x(index); const barHeight = p.volume / maxVolume * volumeHeight; ctx.fillStyle = 'rgba(220,38,38,.4)'; ctx.fillRect(px - barWidth / 2, volumeTop + volumeHeight - barHeight, barWidth, barHeight); });
    ctx.fillStyle = '#64748b'; ctx.font = '10px Pretendard, sans-serif'; ctx.textAlign = 'start'; ctx.fillText('가격', 5, top + 4); ctx.fillText('거래량', 5, volumeTop + 10);
    ctx.textAlign = 'center'; points.forEach((p, index) => { if (index % Math.ceil(n / 6) === 0 || index === n - 1) ctx.fillText(p.date.slice(5), x(index), height - 10); }); ctx.textAlign = 'start';
  };
  const load = async (ticker) => {
    const activeRequest = ++requestId; status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 최근 6개월 데이터를 불러오는 중…'; summary.innerHTML = '';
    try {
      if (!cache.has(ticker)) {
        const response = await fetch(`/api/market/penny-stock-rally?ticker=${encodeURIComponent(ticker)}`);
        const data = await response.json(); if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
        cache.set(ticker, data);
      }
      const data = cache.get(ticker); if (activeRequest !== requestId) return;
      draw(data.points);
      status.textContent = `${data.name} · ${data.points[0].date} ~ ${data.points[data.points.length - 1].date} · 일봉 기준`;
      summary.innerHTML = `<article><span>저점</span><strong>${data.low.close.toLocaleString('ko-KR')}원</strong><small>${data.low.date}</small></article><article><span>고점</span><strong>${data.high.close.toLocaleString('ko-KR')}원</strong><small>${data.high.date}</small></article><article><span>저점 대비 상승폭</span><strong class="up">+${data.rally_from_low_pct}%</strong></article><article><span>현재가 · 기간 등락률</span><strong>${data.latest_price.toLocaleString('ko-KR')}원 (${data.period_change_pct >= 0 ? '+' : ''}${data.period_change_pct}%)</strong></article>`;
      note.textContent = data.note;
    } catch (error) { if (activeRequest === requestId) status.textContent = `데이터를 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`; }
  };
  const closeModal = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); };
  trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); load(currentTicker); closeButton.focus(); });
  closeButton.addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  modal.querySelectorAll('[data-penny-ticker]').forEach((button) => button.addEventListener('click', () => { currentTicker = button.dataset.pennyTicker; modal.querySelectorAll('[data-penny-ticker]').forEach((tab) => tab.classList.toggle('is-active', tab === button)); load(currentTicker); }));
  window.addEventListener('resize', () => { if (modal.classList.contains('show') && cache.has(currentTicker)) draw(cache.get(currentTicker).points); }); document.addEventListener('keydown', onKeydown); const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', onKeydown); modal.remove(); };
}

function installOrderSimulator(root, docId) {
  const trigger = root.querySelector('[data-order-simulator]'); if (docId !== '07' || !trigger) return;
  const modal = document.createElement('div'); modal.className = 'order-modal-backdrop'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `<section class="order-modal"><header><div><i class="fa-solid fa-cart-shopping"></i><div><h2>주문창 시뮬레이터</h2><p>연습용 주문입니다. 실제 증권사 주문과 연결되지 않습니다.</p></div></div><button type="button" data-order-close aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header><main><section class="order-book"><b>삼성전자 <small>005930</small></b><span>매도 71,400원</span><strong>현재가 71,300원</strong><span>매수 71,200원</span></section><section class="order-inputs"><label>주문 구분<select data-order-input="type"><option value="limit">지정가</option><option value="market">시장가</option><option value="percent">기준가 대비 %</option></select></label><label>매수·매도<select data-order-input="side"><option value="buy">매수</option><option value="sell">매도</option></select></label><label>주문 수량<input type="number" data-order-input="quantity" value="10" min="1"></label><label data-order-price-label>주문 가격 (원)<input type="number" data-order-input="price" value="71200" min="1" step="100"></label></section><div class="order-quick"><button data-order-quick="-1">−1%</button><button data-order-quick="0">현재가</button><button data-order-quick="1">+1%</button></div><section class="order-result" aria-live="polite"><strong data-order-status></strong><p data-order-detail></p><dl><div><dt>예상 체결가</dt><dd data-order-price></dd></div><div><dt>체결 수량</dt><dd data-order-filled></dd></div><div><dt>미체결 수량</dt><dd data-order-unfilled></dd></div><div><dt>예상 주문금액</dt><dd data-order-total></dd></div></dl></section><footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer></main></section>`;
  document.body.appendChild(modal); const closeButton = modal.querySelector('[data-order-close]'); let lastFocused = null; const current = 71300; const format = (value) => `${Math.round(value).toLocaleString('ko-KR')}원`;
  const update = () => { const get = (name) => modal.querySelector(`[data-order-input="${name}"]`); const type = get('type').value; const side = get('side').value; const quantity = Number(get('quantity').value) || 0; const rawPrice = Number(get('price').value) || 0; const price = type === 'percent' ? current * (1 + rawPrice / 100) : rawPrice; const priceLabel = modal.querySelector('[data-order-price-label]'); priceLabel.firstChild.textContent = type === 'percent' ? '기준가 대비 (%)' : type === 'market' ? '시장가 주문 (가격 자동)' : '주문 가격 (원)'; get('price').step = type === 'percent' ? '0.1' : '100'; get('price').disabled = type === 'market';
    let filled = quantity; let executed = type === 'market' ? (side === 'buy' ? 71400 : 71200) : price; if (type === 'limit' && ((side === 'buy' && price < 71200) || (side === 'sell' && price > 71400))) filled = 0; else if (type !== 'market' && ((side === 'buy' && price === 71200) || (side === 'sell' && price === 71400))) filled = Math.ceil(quantity * .5); const unfilled = quantity - filled; const status = filled === 0 ? '미체결' : unfilled ? '부분체결' : '체결 가능'; modal.querySelector('[data-order-status]').textContent = status; modal.querySelector('[data-order-detail]').textContent = status === '미체결' ? '현재 호가와 가격이 맞지 않아 주문이 남아 있는 상황입니다.' : status === '부분체결' ? '일부 수량만 반대 주문과 맞았다고 가정한 연습 결과입니다.' : type === 'market' ? '시장가 주문은 가장 유리한 반대편 호가에 체결된다고 가정했습니다.' : '지정가와 반대 주문 가격이 맞는다고 가정했습니다.'; modal.querySelector('[data-order-price]').textContent = filled ? format(executed) : '—'; modal.querySelector('[data-order-filled]').textContent = `${filled.toLocaleString()}주`; modal.querySelector('[data-order-unfilled]').textContent = `${unfilled.toLocaleString()}주`; modal.querySelector('[data-order-total]').textContent = filled ? format(executed * filled) : '0원'; };
  const close = () => { modal.classList.remove('show'); document.body.classList.remove('modal-open'); lastFocused?.focus(); }; const key = (event) => { if (event.key === 'Escape') close(); }; trigger.addEventListener('click', () => { lastFocused = trigger; modal.classList.add('show'); document.body.classList.add('modal-open'); update(); closeButton.focus(); }); closeButton.addEventListener('click', close); modal.addEventListener('click', (event) => { if (event.target === modal) close(); }); modal.querySelectorAll('[data-order-input]').forEach((item) => item.addEventListener('input', update)); modal.querySelector('[data-order-input="type"]').addEventListener('change', (event) => { const price = modal.querySelector('[data-order-input="price"]'); price.value = event.target.value === 'percent' ? 0 : current; update(); }); modal.querySelectorAll('[data-order-quick]').forEach((button) => button.addEventListener('click', () => { const price = modal.querySelector('[data-order-input="price"]'); modal.querySelector('[data-order-input="type"]').value = 'limit'; price.value = Math.round(current * (1 + Number(button.dataset.orderQuick) / 100) / 100) * 100; update(); })); document.addEventListener('keydown', key); const previousCleanup = window._viewCleanup; window._viewCleanup = () => { previousCleanup?.(); document.removeEventListener('keydown', key); modal.remove(); };
}

/**
 * 주식 1 문서에서 다른 학습 문서로 옮겨진 두 주제는 페이지 이동 대신
 * 해당 절만 바로 읽을 수 있도록 모달로 보여 준다. 원문을 다시 요청하므로
 * 원본 문서가 보완돼도 팝업 내용은 자동으로 최신 상태를 따른다.
 */
function installIntegratedContentModal(root, docId) {
  if (docId !== '03') return;

  const topics = new Map([
    ['11.md#2-거시지표가-주가로-이어지는-네-단계', {
      sourceId: '11',
      heading: '2. 거시지표가 주가로 이어지는 네 단계',
      label: '거시경제와 주식시장 읽기',
    }],
    ['10-2.md#6-회사는-누가-결정하나요', {
      sourceId: '10-2',
      heading: '6. 회사는 누가 결정하나요?',
      label: '법인과 회사 구조 이해하기 2',
    }],
  ]);

  // marked는 한글 앵커를 percent-encoding하므로 원문 Markdown의 경로로 되돌려 비교한다.
  const topicForLink = (link) => {
    const href = link.getAttribute('href') || '';
    try {
      return topics.get(decodeURIComponent(href));
    } catch {
      return topics.get(href);
    }
  };
  const triggers = [...root.querySelectorAll('a[href]')].filter((link) => topicForLink(link));
  if (!triggers.length) return;

  const modal = document.createElement('div');
  modal.className = 'integrated-content-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'integrated-content-modal-title');
  modal.innerHTML = `
    <section class="integrated-content-modal">
      <header class="integrated-content-modal-header">
        <div><span class="integrated-content-modal-icon"><i class="fa-solid fa-book-open"></i></span><div><p data-integrated-content-source></p><h2 id="integrated-content-modal-title"></h2></div></div>
        <button type="button" class="integrated-content-modal-close" aria-label="학습 내용 닫기"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="integrated-content-modal-body md-body" aria-live="polite"></div>
    </section>`;
  document.body.appendChild(modal);

  const closeButton = modal.querySelector('.integrated-content-modal-close');
  const title = modal.querySelector('#integrated-content-modal-title');
  const source = modal.querySelector('[data-integrated-content-source]');
  const body = modal.querySelector('.integrated-content-modal-body');
  let lastFocused = null;
  let requestId = 0;

  const closeModal = () => {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
    lastFocused?.focus();
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape' && modal.classList.contains('show')) closeModal();
  };
  const sectionFromMarkdown = (markdown, heading) => {
    const lines = markdown.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
    if (start < 0) throw new Error('학습 내용을 찾지 못했습니다.');
    const end = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line));
    return lines.slice(start + 1, end < 0 ? undefined : start + 1 + end).join('\n').trim();
  };
  const openModal = async (topic, trigger) => {
    const currentRequest = ++requestId;
    lastFocused = trigger;
    source.textContent = topic.label;
    title.textContent = topic.heading;
    body.innerHTML = '<p class="integrated-content-modal-loading"><i class="fa-solid fa-spinner fa-spin"></i> 내용을 불러오는 중…</p>';
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    closeButton.focus();
    try {
      const response = await fetch(`/api/learn/doc/${encodeURIComponent(topic.sourceId)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (currentRequest !== requestId || !modal.classList.contains('show')) return;
      body.innerHTML = window.marked.parse(sectionFromMarkdown(data.content || '', topic.heading));
    } catch (error) {
      if (currentRequest !== requestId || !modal.classList.contains('show')) return;
      body.innerHTML = '<p class="integrated-content-modal-error">내용을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
      console.error('통합 학습 내용 로드 실패:', error);
    }
  };

  triggers.forEach((link) => {
    const topic = topicForLink(link);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'integrated-content-trigger';
    button.innerHTML = `${link.innerHTML}<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>`;
    button.setAttribute('aria-label', `${topic.heading} 내용 보기`);
    link.replaceWith(button);
    button.addEventListener('click', () => openModal(topic, button));
  });
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', onKeydown);
  const previousCleanup = window._viewCleanup;
  window._viewCleanup = () => {
    previousCleanup?.();
    document.removeEventListener('keydown', onKeydown);
    modal.remove();
  };
}

export function learnView(app, docId) {
  app.innerHTML = `
    <div class="loading-wrap">
      <div class="spinner"></div>
      <div class="loading-text">문서 로딩 중…</div>
    </div>`;

  const vocabularyRequest = docId === 'voca'
    ? Promise.resolve(new Map())
    : loadVocabularyEntries().catch((error) => {
      console.warn('단어장 정보를 불러오지 못했습니다:', error);
      return new Map();
    });

  Promise.all([
    ensureMarked(),
    fetch(`/api/learn/doc/${encodeURIComponent(docId)}`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
    vocabularyRequest,
  ]).then(([, data, vocabulary]) => {
    const html = window.marked.parse(data.content || '');

    app.innerHTML = `
      <div class="learn-container" id="learn-wrap">
        <div class="learn-body">
          <div class="md-body" id="md-content">${html}</div>
        </div>
        <button class="toc-toggle-btn" id="toc-toggle" type="button" aria-controls="learn-toc" aria-expanded="false">
          <i class="fa-solid fa-list-ul"></i> 목차
        </button>
        <div class="toc-overlay" id="toc-overlay"></div>
        <div id="toc-placeholder"></div>
      </div>`;

    // add heading IDs for TOC navigation
    const mdContent = app.querySelector('#md-content');
    mdContent.querySelectorAll('h2, h3').forEach((h, i) => {
      if (!h.id) h.id = `heading-${i}`;
    });

    // Mermaid 소스는 VIEW 배지로 표시하고 클릭 시 모달에서 렌더링한다.
    renderMermaidBlocks(mdContent).catch((err) => console.error('Mermaid 로드 실패:', err));
    installMacroNewsSimulator(mdContent, docId);
    installMaCrossSimulator(mdContent, docId);
    installRsiMacdSimulator(mdContent, docId);
    installAtrSimulator(mdContent, docId);
    installOpeningSessionModal(mdContent, docId);
    installSoxKoreaSemiconModal(mdContent, docId);
    installVixKospiModal(mdContent, docId);
    installThemeVolatilityModal(mdContent, docId);
    installCircuitBreakerModal(mdContent, docId);
    installMddHistoryModal(mdContent, docId);
    installPatternVerifyModal(mdContent, docId);
    installPercentChangeSimulator(mdContent, docId);
    installMomentumPicksModal(mdContent, docId);
    installNpsHoldingsModal(mdContent, docId);
    installBacktestSimulator(mdContent, docId);
    installOrderSimulator(mdContent, docId);
    installIpoChartModal(mdContent, docId);
    installPennyStockRallyModal(mdContent, docId);
    installSplitBuySimulator(mdContent, docId);
    installDividendCalendarModal(mdContent, docId);
    installFinancialStatementSamplesModal(mdContent, docId);
    installValuationSimulator(mdContent, docId);
    installPsrSimulator(mdContent, docId);
    installFinancialHealthSimulator(mdContent, docId);
    installRoeEpsSimulator(mdContent, docId);
    installDcfSimulator(mdContent, docId);
    installCapmSimulator(mdContent, docId);
    installVocabularyModal(mdContent, vocabulary);
    installTermModal(mdContent, docId);
    installIntegratedContentModal(mdContent, docId);

    // docs/*.md의 외부 홈페이지 링크는 학습 화면을 유지한 채 별도 창에서 연다.
    mdContent.querySelectorAll('a[href^="http://"], a[href^="https://"]').forEach((a) => {
      a.target = '_new';
      a.rel = 'noopener noreferrer';
    });

    // inject TOC (문서에 소제목이 없으면 목차 버튼도 숨김)
    const tocEl = app.querySelector('#toc-placeholder');
    const tocHtml = buildToc(mdContent);
    if (tocEl) tocEl.outerHTML = tocHtml;
    if (!tocHtml) app.querySelector('#toc-toggle')?.style.setProperty('display', 'none');

    // 목차 offcanvas 열기/닫기
    function openToc() {
      const toc = app.querySelector('#learn-toc');
      toc?.classList.add('open');
      toc?.setAttribute('aria-hidden', 'false');
      app.querySelector('#toc-overlay')?.classList.add('show');
      app.querySelector('#toc-toggle')?.setAttribute('aria-expanded', 'true');
    }
    function closeToc() {
      const toc = app.querySelector('#learn-toc');
      toc?.classList.remove('open');
      toc?.setAttribute('aria-hidden', 'true');
      app.querySelector('#toc-overlay')?.classList.remove('show');
      app.querySelector('#toc-toggle')?.setAttribute('aria-expanded', 'false');
    }
    const onKeydown = (event) => {
      if (event.key === 'Escape') closeToc();
    };
    document.addEventListener('keydown', onKeydown);

    // 화면 전환 시 열려 있던 목차와 observer/event listener를 정리한다.
    const previousCleanup = window._viewCleanup;
    window._viewCleanup = () => {
      previousCleanup?.();
      closeToc();
      observer.disconnect();
      document.removeEventListener('keydown', onKeydown);
    };
    app.querySelector('#toc-toggle')?.addEventListener('click', openToc);
    app.querySelector('#toc-overlay')?.addEventListener('click', closeToc);
    app.querySelector('#learn-toc-close')?.addEventListener('click', closeToc);

    // wire TOC clicks
    app.querySelectorAll('.toc-item').forEach(li => {
      li.addEventListener('click', () => {
        // 문서 밖에 같은 ID가 있더라도 현재 학습 문서 안의 제목으로만 이동한다.
        const target = mdContent.querySelector(`#${CSS.escape(li.dataset.id)}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.innerWidth <= 1024) closeToc();
      });
    });

    // TOC active tracking
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          app.querySelectorAll('.toc-item').forEach(li => li.classList.remove('active'));
          const li = app.querySelector(`.toc-item[data-id="${e.target.id}"]`);
          if (li) li.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    mdContent.querySelectorAll('h2, h3').forEach(h => observer.observe(h));

  }).catch(err => {
    app.innerHTML = `<div class="card">
      <p style="color:var(--red)">문서를 불러오지 못했습니다: ${err.message}</p>
      <p style="font-size:.82rem;color:var(--text-muted)">백엔드 서버가 실행 중인지 확인하세요.</p>
    </div>`;
  });
}
