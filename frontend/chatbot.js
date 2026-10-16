/* 포털 첫 화면(frontend/index.html) 우측 하단 「AI 투자 도우미」 (Amazon Lex V2, 6-11).
   investment-native/js/sidebarUI.js 의 ensureSidebarChatbot 를 포털용으로 옮긴 것 — 그 파일은 사이드바 DOM 을 전제해 그대로 못 쓴다.
   스타일은 이미 로드되는 /static/investment-native/styles.css 의 .floating-chatbot* 를 쓴다.
   서버 /api/lex/chat(app/api/routes/lex.py) 이 Lex 대화 상태(dialog_action·slot_to_elicit·session_attributes)를 돌려주므로
   슬롯을 묻는 중이면 입력창 힌트를 바꾸고, 확인 단계면 네/아니요 버튼을 보여 준다(Lex ko_KR 은 '아니오' 를 부정으로 인식하지 못한다). */
(function () {
  if (document.getElementById('floating-chatbot')) return;
  const SESSION_KEY = 'investment_analysis_lex_session_id';
  const makeSessionId = () => `web-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  let sessionId = localStorage.getItem(SESSION_KEY) || makeSessionId();
  let sessionAttributes = {};
  try { localStorage.setItem(SESSION_KEY, sessionId); } catch (e) { /* 저장 불가 환경이면 메모리만 */ }

  document.body.insertAdjacentHTML('beforeend', `
    <section class="floating-chatbot" id="floating-chatbot" aria-label="AI 투자 도우미">
      <div class="floating-chatbot-panel" id="floating-chatbot-panel" hidden>
        <header class="floating-chatbot-head">
          <span><i class="fa-solid fa-robot" aria-hidden="true"></i> AI 투자 도우미</span>
          <button type="button" id="floating-chatbot-close" aria-label="대화창 닫기"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span class="sr-only">닫기</span></button>
        </header>
        <div class="floating-chatbot-messages" id="floating-chatbot-messages" aria-live="polite">
          <p class="floating-chatbot-welcome">할 수 있는 것 — 주문: "삼성전자 1주 시장가 매수" · 시세: "한화오션 현재가" · 잔고: "잔고 알려줘" · 체결: "주문 확인" · 계좌: "예수금이 마이너스인데 가능해?" · 장 시간: "미국장 시간" · 휴장일: "올해 휴장일" · 랭킹: "랭킹 알려줘" · 환율: "오늘 환율" · 투자 기초(포트폴리오·금리). 종목명만 입력해도 시세를 보여줍니다. 그 밖의 질문은 AI 가 잔고·시세·안내 문서를 찾아 답합니다. 주문 입력 중 "취소"라고 하면 멈춥니다. KIS 모의계좌(공용 1개)로만 주문합니다.</p>
        </div>
        <div id="floating-chatbot-quick" class="floating-chatbot-quick" hidden>
          <button type="button" data-say="네">네</button><button type="button" data-say="아니요">아니요</button>
        </div>
        <form class="floating-chatbot-form" id="floating-chatbot-form">
          <input id="floating-chatbot-input" type="text" maxlength="300" placeholder="질문을 입력하세요" aria-label="챗봇 질문" autocomplete="off" />
          <button type="submit" aria-label="질문 보내기"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
        </form>
      </div>
      <button type="button" class="floating-chatbot-trigger" id="floating-chatbot-trigger" aria-label="AI 투자 도우미 열기" aria-expanded="false">
        <i class="fa-solid fa-comment-dots" aria-hidden="true"></i><span>AI 투자 도우미</span>
      </button>
    </section>`);

  const panel = document.getElementById('floating-chatbot-panel');
  const trigger = document.getElementById('floating-chatbot-trigger');
  const closeBtn = document.getElementById('floating-chatbot-close');
  const form = document.getElementById('floating-chatbot-form');
  const input = document.getElementById('floating-chatbot-input');
  const submit = form.querySelector('button[type="submit"]');
  const messages = document.getElementById('floating-chatbot-messages');
  const quick = document.getElementById('floating-chatbot-quick');
  const PLACEHOLDER = '질문을 입력하세요';
  const SLOT_HINT = { Side: '매수 / 매도', Ticker: '종목명 또는 6자리 종목코드', Quantity: '수량(주)', OrderType: '시장가 / 지정가', Price: '지정가 1주 가격(원)', OrderNo: '주문번호', Currency: '통화(달러/엔/유로/위안)' };

  const appendMessage = (text, className) => {
    const p = document.createElement('p');
    p.className = `floating-chatbot-message ${className}`;
    p.textContent = text;
    messages.append(p);
    messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
  };
  const setOpen = (open) => {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? 'AI 투자 도우미 닫기' : 'AI 투자 도우미 열기');
    if (open) input.focus();
  };
  const applyState = (payload) => {
    sessionAttributes = payload.session_attributes || {};
    quick.hidden = payload.dialog_action !== 'ConfirmIntent';
    input.placeholder = payload.dialog_action === 'ElicitSlot' && SLOT_HINT[payload.slot_to_elicit]
      ? `${SLOT_HINT[payload.slot_to_elicit]} 를 입력하세요` : PLACEHOLDER;
  };

  async function send(question) {
    if (!question) return;
    appendMessage(question, 'is-user');
    input.value = '';
    input.disabled = true; submit.disabled = true; quick.hidden = true;
    try {
      const response = await fetch('/api/lex/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, session_id: sessionId, session_attributes: sessionAttributes }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || '투자 도우미 응답을 받지 못했습니다.');
      sessionId = payload.session_id || sessionId;
      try { localStorage.setItem(SESSION_KEY, sessionId); } catch (e) { /* ignore */ }
      (payload.messages || []).forEach((m) => appendMessage(m, 'is-enterprise'));
      applyState(payload);
    } catch (error) {
      appendMessage(error.message || '투자 도우미 연결에 실패했습니다.', 'is-enterprise');
    } finally {
      input.disabled = false; submit.disabled = false; input.focus();
    }
  }

  trigger.addEventListener('click', () => setOpen(panel.hidden));
  closeBtn.addEventListener('click', () => setOpen(false));
  form.addEventListener('submit', (event) => { event.preventDefault(); send(input.value.trim()); });
  quick.querySelectorAll('button[data-say]').forEach((b) => b.addEventListener('click', () => send(b.dataset.say)));
})();
