/**
 * quiz.js — 주식상식 시험 퀴즈 뷰
 * 주식 1~5별 4문항(총 20문항), 정오답 표기, 해설, 문항 편집 기능
 */

const DAY_TOPICS = {
  1: '주식 1',
  2: '주식 2',
  3: '주식 3',
  4: '주식 4',
  5: '주식 5',
};
const QUESTIONS_PER_DAY = 4;
const TOTAL_DAYS = Object.keys(DAY_TOPICS).length;
const QUIZ_CONTENT_VERSION = 'stock-learning-2026-08-01-v1';

// 문항 개편 뒤 처음 접속한 사용자는 이전 문항 ID로 저장된 답안을 제거한다.
// 같은 버전에서는 다시 지우지 않아 학습 중인 답안은 유지된다.
function resetProgressForNewQuizVersion() {
  try {
    if (localStorage.getItem('quiz_content_version') === QUIZ_CONTENT_VERSION) return;
    Object.keys(localStorage)
      .filter((key) => key.startsWith('quiz_progress_day'))
      .forEach((key) => localStorage.removeItem(key));
    localStorage.setItem('quiz_content_version', QUIZ_CONTENT_VERSION);
  } catch {
    // 저장소를 사용할 수 없는 환경에서는 기존처럼 현재 세션에서만 동작한다.
  }
}

resetProgressForNewQuizVersion();

// progress stored per-day in localStorage
function loadProgress(day) {
  try {
    return JSON.parse(localStorage.getItem(`quiz_progress_day${day}`) || 'null');
  } catch { return null; }
}
function saveProgress(day, data) {
  localStorage.setItem(`quiz_progress_day${day}`, JSON.stringify(data));
}
function clearProgress(day) {
  localStorage.removeItem(`quiz_progress_day${day}`);
}

/* ─── QUIZ HOME ─────────────────────── */
export function quizHomeView(app, navigate) {
  const cards = Object.entries(DAY_TOPICS).map(([d, topic]) => {
    const prog = loadProgress(Number(d));
    const done = prog && prog.finished;
    const answered = prog ? Object.keys(prog.answers || {}).length : 0;
    const pct = prog ? Math.round(answered / QUESTIONS_PER_DAY * 100) : 0;
    return `
      <div class="plan-card${done ? ' done' : ''}" onclick="navigate('quiz-day-${d}')">
      <div class="plan-day">주식 ${d}</div>
        <div class="plan-topic">${topic}</div>
        <div class="plan-count">
          ${done
            ? `<span class="badge badge-green"><i class="fa-solid fa-check"></i> 완료 · ${prog.score}/${QUESTIONS_PER_DAY}</span>`
            : answered > 0
            ? `<span class="badge badge-blue">${answered}/${QUESTIONS_PER_DAY} 진행 중</span>`
              : `<span class="badge badge-gray">${QUESTIONS_PER_DAY}문항</span>`}
        </div>
        ${answered > 0 && !done ? `
          <div class="plan-prog">
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          </div>` : ''}
      </div>`;
  }).join('');

  // overall stats
  let totalDone = 0, totalScore = 0;
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    const p = loadProgress(d);
    if (p && p.finished) { totalDone++; totalScore += p.score || 0; }
  }

  app.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="margin:0 0 4px;font-weight:800">
        <i class="fa-solid fa-calendar-check" style="color:var(--primary);margin-right:8px;"></i>
        주식 기초 통합 퀴즈
      </h2>
      <p style="font-size:.85rem;color:var(--text-muted);margin:0">
        주식 1~5별 4문항, 총 20문항 · 정오답 즉시 확인 · 해설 보기
      </p>
    </div>

    <div class="grid-4" style="margin-bottom:28px;">
      <div class="stat-box">
        <div class="stat-label">완료 일차</div>
        <div class="stat-value">${totalDone}<span style="font-size:1rem;font-weight:500;color:var(--text-muted)"> / ${TOTAL_DAYS}</span></div>
      </div>
      <div class="stat-box">
        <div class="stat-label">전체 정답 수</div>
        <div class="stat-value">${totalScore}<span style="font-size:1rem;font-weight:500;color:var(--text-muted)"> / ${totalDone*QUESTIONS_PER_DAY}</span></div>
      </div>
      <div class="stat-box">
        <div class="stat-label">평균 정답률</div>
        <div class="stat-value">${totalDone > 0 ? Math.round(totalScore/(totalDone*QUESTIONS_PER_DAY)*100) : 0}<span style="font-size:1rem;font-weight:500;color:var(--text-muted)">%</span></div>
      </div>
      <div class="stat-box">
        <div class="stat-label">남은 일차</div>
        <div class="stat-value">${TOTAL_DAYS - totalDone}</div>
      </div>
    </div>

    <div class="plan-grid" id="plan-grid">${cards}</div>`;

  // wire plan card clicks
  app.querySelectorAll('.plan-card').forEach((card, i) => {
    card.onclick = () => navigate(`quiz-day-${Object.keys(DAY_TOPICS)[i]}`);
  });
}

/* ─── QUIZ DAY VIEW ─────────────────────────────── */
export function quizDayView(app, day, navigate) {
  if (day > 1 && !loadProgress(day - 1)?.finished) {
    app.innerHTML = `
      <div class="card" style="text-align:center;padding:48px 24px;">
        <div style="font-size:2.5rem;margin-bottom:16px;"><i class="fa-solid fa-lock" style="color:var(--text-muted)"></i></div>
        <h3 style="margin:0 0 8px;font-size:1.1rem;font-weight:800">주식 ${day} 잠금됨</h3>
        <p style="font-size:.88rem;color:var(--text-muted);margin:0 0 24px;">
          주식 ${day - 1} 퀴즈를 완료해야 접근할 수 있습니다.
        </p>
        <button class="btn btn-primary" id="go-prev-day">
          <i class="fa-solid fa-arrow-left"></i> 주식 ${day - 1} 퀴즈 보러 가기
        </button>
      </div>`;
    app.querySelector('#go-prev-day').onclick = () => navigate(`quiz-day-${day - 1}`);
    return;
  }

  app.innerHTML = `<div class="loading-wrap"><div class="spinner"></div><div class="loading-text">문제 로딩 중…</div></div>`;

  fetch(`/api/quiz/day/${day}`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(questions => {
      if (!questions.length) {
        app.innerHTML = `<div class="card">
          <p style="color:var(--text-muted)">문항이 없습니다.</p>
          <p style="font-size:.82rem;color:var(--text-muted)">
            루트에서 <code>./scripts/init_quiz_mongodb.sh</code> 실행 후 다시 시도하세요.
          </p>
        </div>`;
        return;
      }
      renderQuiz(app, day, questions, navigate);
    })
    .catch(err => {
      app.innerHTML = `<div class="card">
        <p style="color:var(--red)"><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</p>
        <p style="font-size:.82rem;color:var(--text-muted)">백엔드 및 MongoDB가 실행 중인지 확인하세요.</p>
      </div>`;
    });
}

function renderQuiz(app, day, questions, navigate) {
  const topic = DAY_TOPICS[day] || `주식 ${day}`;
  const prog = loadProgress(day) || { answers: {}, score: 0, finished: false };

  // state
  let current = 0;
  // find first unanswered if resuming
  for (let i = 0; i < questions.length; i++) {
    if (prog.answers[questions[i]._id] === undefined) { current = i; break; }
    if (i === questions.length - 1) current = 0; // all done
  }
  if (prog.finished) current = 0;

  function render() {
    if (prog.finished) { renderResult(); return; }
    const q = questions[current];
    const answered = prog.answers[q._id];
    const isAnswered = answered !== undefined;

    const correctCount = Object.values(prog.answers).filter((a, idx) => {
      const qid = Object.keys(prog.answers)[idx];
      const qq = questions.find(x => x._id === qid);
      return qq && a === qq.answer;
    }).length;

    app.innerHTML = `
      <div class="quiz-header">
        <div>
          <h2 style="margin:0 0 2px;font-weight:800">
            <i class="fa-solid fa-circle-question" style="color:var(--primary);margin-right:7px;"></i>
            주식 ${day} · ${topic}
          </h2>
          <div style="font-size:.78rem;color:var(--text-muted)">${QUESTIONS_PER_DAY}문항 · 주식상식 대비</div>
        </div>
        <div class="quiz-score-bar">
          <span><i class="fa-solid fa-check" style="color:var(--green)"></i> <span class="score-correct">${correctCount}</span></span>
          <span><i class="fa-solid fa-xmark" style="color:var(--red)"></i> <span class="score-wrong">${Object.keys(prog.answers).length - correctCount}</span></span>
          <button class="btn btn-secondary btn-sm" onclick="resetQuiz()">
            <i class="fa-solid fa-rotate-left"></i> 초기화
          </button>
        </div>
      </div>

      <div class="quiz-progress-wrap" style="margin-bottom:20px;">
        <div class="quiz-progress-label">
          <span>문제 ${current + 1} / ${questions.length}</span>
          <span>${Math.round(Object.keys(prog.answers).length / questions.length * 100)}% 완료</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${Object.keys(prog.answers).length / questions.length * 100}%"></div>
        </div>
      </div>

      <div class="question-card" id="qcard">
        <div class="q-num">
          <span class="badge badge-blue">Q${current + 1}</span>
          <span style="color:var(--text-muted);font-size:.72rem;">${q.topic || topic}</span>
          <button class="btn btn-secondary btn-sm" style="margin-left:auto;font-size:.7rem;" onclick="openEditModal('${q._id}')">
            <i class="fa-solid fa-pen-to-square"></i> 수정
          </button>
        </div>
        <div class="q-text">${q.question}</div>
        <div class="choices" id="choices">
          ${q.choices.map((c, i) => `
            <button class="choice-btn${isAnswered ? (i === q.answer ? ' correct' : (i === answered ? ' wrong' : '')) : ''}"
              data-idx="${i}" ${isAnswered ? 'disabled' : ''}>
              <span class="choice-idx">${['①','②','③','④'][i]}</span>
              <span>${c}</span>
            </button>`).join('')}
        </div>
        ${isAnswered ? `
          <div class="explanation show ${answered !== q.answer ? 'wrong-exp' : ''}">
            <div class="exp-label">
              ${answered === q.answer
                ? '<i class="fa-solid fa-circle-check" style="color:var(--green)"></i> 정답입니다!'
                : `<i class="fa-solid fa-circle-xmark" style="color:var(--red)"></i> 오답 · 정답: ${['①','②','③','④'][q.answer]}`}
            </div>
            ${q.explanation || '해설이 없습니다.'}
          </div>` : ''}
      </div>

      <div class="quiz-nav">
        <button class="btn btn-secondary" onclick="prevQ()" ${current === 0 ? 'disabled' : ''}>
          <i class="fa-solid fa-arrow-left"></i> 이전
        </button>
        <div style="display:flex;gap:8px;">
          ${isAnswered && current < questions.length - 1
            ? `<button class="btn btn-primary" onclick="nextQ()">다음 <i class="fa-solid fa-arrow-right"></i></button>`
            : isAnswered && current === questions.length - 1
              ? `<button class="btn btn-success" onclick="finishQuiz()"><i class="fa-solid fa-flag-checkered"></i> 결과 보기</button>`
              : ''}
        </div>
      </div>

      ${renderEditModal()}`;

    // wire choice buttons
    if (!isAnswered) {
      app.querySelectorAll('.choice-btn').forEach(btn => {
        btn.addEventListener('click', () => handleAnswer(Number(btn.dataset.idx)));
      });
    }

    // global helpers
    window.prevQ = () => { if (current > 0) { current--; render(); } };
    window.nextQ = () => { if (current < questions.length - 1) { current++; render(); } };
    window.resetQuiz = () => {
      if (confirm(`주식 ${day} 퀴즈 진행 상황을 초기화하시겠습니까?`)) {
        clearProgress(day); prog.answers = {}; prog.score = 0; prog.finished = false; current = 0; render();
      }
    };
    window.finishQuiz = () => {
      prog.finished = true;
      const correct = Object.entries(prog.answers).filter(([id, a]) => {
        const qq = questions.find(x => x._id === id); return qq && a === qq.answer;
      }).length;
      prog.score = correct;
      saveProgress(day, prog);
      renderResult();
    };
    window.openEditModal = (qid) => {
      const qq = questions.find(x => x._id === qid);
      if (!qq) return;
      openEditModal(qq, () => {
        // re-fetch after save
        fetch(`/api/quiz/day/${day}`)
          .then(r => r.json())
          .then(qs => { questions.length = 0; qs.forEach(q => questions.push(q)); render(); });
      });
    };
  }

  function handleAnswer(idx) {
    const q = questions[current];
    prog.answers[q._id] = idx;
    if (idx === q.answer) prog.score = (prog.score || 0) + 1;
    saveProgress(day, prog);
    render();
  }

  function renderResult() {
    const total = questions.length;
    const correct = Object.entries(prog.answers).filter(([id, a]) => {
      const q = questions.find(x => x._id === id); return q && a === q.answer;
    }).length;
    const pct = Math.round(correct / total * 100);
    const grade = pct >= 90 ? '우수' : pct >= 70 ? '합격' : pct >= 50 ? '보통' : '재시험 필요';
    const gradeColor = pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';

    app.innerHTML = `
      <div class="quiz-result">
        <div style="font-size:.85rem;color:var(--text-muted);margin-bottom:8px;">주식 ${day} · ${topic} 결과</div>
        <div class="result-score">${pct}%</div>
        <div class="result-label" style="color:${gradeColor};">${grade}</div>
        <div class="result-stats">
          <div class="result-stat">
            <div class="val" style="color:var(--green)">${correct}</div>
            <div class="lbl">정답</div>
          </div>
          <div class="result-stat">
            <div class="val" style="color:var(--red)">${total - correct}</div>
            <div class="lbl">오답</div>
          </div>
          <div class="result-stat">
            <div class="val">${total}</div>
            <div class="lbl">전체</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="resetAndRetry()">
            <i class="fa-solid fa-rotate-left"></i> 다시 풀기
          </button>
          <button class="btn btn-primary" onclick="reviewWrong()">
            <i class="fa-solid fa-list-check"></i> 오답 복습
          </button>
          ${day < TOTAL_DAYS
            ? `<button class="btn btn-success" onclick="goNextDay()">
                주식 ${day + 1} 시작 <i class="fa-solid fa-arrow-right"></i>
              </button>`
            : `<button class="btn btn-success" onclick="navigate('quiz-home')">
                <i class="fa-solid fa-trophy"></i> 전체 결과
              </button>`}
        </div>
      </div>
      ${renderEditModal()}`;

    window.resetAndRetry = () => {
      clearProgress(day);
      prog.answers = {}; prog.score = 0; prog.finished = false;
      current = 0; render();
    };
    window.reviewWrong = () => {
      const wrongs = questions.filter(q => prog.answers[q._id] !== undefined && prog.answers[q._id] !== q.answer);
      if (!wrongs.length) { alert('틀린 문항이 없습니다!'); return; }
      renderWrongReview(wrongs);
    };
    window.goNextDay = () => navigate(`quiz-day-${day + 1}`);
  }

  function renderWrongReview(wrongs) {
    app.innerHTML = `
      <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;">
        <h2 style="margin:0;font-weight:800">
          <i class="fa-solid fa-list-check" style="color:var(--red);margin-right:7px;"></i>
          오답 복습 (${wrongs.length}문항)
        </h2>
        <button class="btn btn-secondary btn-sm" onclick="backToResult()">
          <i class="fa-solid fa-arrow-left"></i> 결과로
        </button>
      </div>
      ${wrongs.map((q, i) => `
        <div class="question-card" style="margin-bottom:16px;">
          <div class="q-num"><span class="badge badge-red">오답 ${i + 1}</span></div>
          <div class="q-text">${q.question}</div>
          <div class="choices">
            ${q.choices.map((c, idx) => `
              <button class="choice-btn${idx === q.answer ? ' correct' : (idx === prog.answers[q._id] ? ' wrong' : '')}" disabled>
                <span class="choice-idx">${['①','②','③','④'][idx]}</span>
                <span>${c}</span>
              </button>`).join('')}
          </div>
          <div class="explanation show">
            <div class="exp-label">
              <i class="fa-solid fa-circle-check" style="color:var(--green)"></i>
              정답: ${['①','②','③','④'][q.answer]}
              &nbsp;|&nbsp; 내 답: <span style="color:var(--red)">${['①','②','③','④'][prog.answers[q._id]]}</span>
            </div>
            ${q.explanation || '해설이 없습니다.'}
          </div>
        </div>`).join('')}
      ${renderEditModal()}`;

    window.backToResult = () => renderResult();
  }

  function renderEditModal() {
    return `
      <div class="modal-backdrop" id="edit-modal">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-pen-to-square" style="color:var(--primary);margin-right:7px;"></i>문항 수정</div>
            <button class="modal-close" onclick="closeEditModal()"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <form id="edit-form">
            <input type="hidden" id="edit-qid" />
            <div class="modal-field">
              <label class="modal-label">문제</label>
              <textarea class="modal-textarea" id="edit-question" rows="3"></textarea>
            </div>
            <div class="modal-field">
              <label class="modal-label">① 보기</label>
              <input class="modal-input" id="edit-c0" />
            </div>
            <div class="modal-field">
              <label class="modal-label">② 보기</label>
              <input class="modal-input" id="edit-c1" />
            </div>
            <div class="modal-field">
              <label class="modal-label">③ 보기</label>
              <input class="modal-input" id="edit-c2" />
            </div>
            <div class="modal-field">
              <label class="modal-label">④ 보기</label>
              <input class="modal-input" id="edit-c3" />
            </div>
            <div class="modal-field">
              <label class="modal-label">정답 (0~3)</label>
              <select class="modal-select" id="edit-answer">
                <option value="0">① 첫 번째</option>
                <option value="1">② 두 번째</option>
                <option value="2">③ 세 번째</option>
                <option value="3">④ 네 번째</option>
              </select>
            </div>
            <div class="modal-field">
              <label class="modal-label">해설</label>
              <textarea class="modal-textarea" id="edit-explanation" rows="3"></textarea>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="closeEditModal()">취소</button>
              <button type="submit" class="btn btn-primary">저장</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  function openEditModal(q, onSave) {
    const m = document.getElementById('edit-modal');
    if (!m) return;
    document.getElementById('edit-qid').value = q._id;
    document.getElementById('edit-question').value = q.question;
    q.choices.forEach((c, i) => { document.getElementById(`edit-c${i}`).value = c; });
    document.getElementById('edit-answer').value = q.answer;
    document.getElementById('edit-explanation').value = q.explanation || '';
    m.classList.add('show');

    document.getElementById('edit-form').onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        question: document.getElementById('edit-question').value,
        choices: [0,1,2,3].map(i => document.getElementById(`edit-c${i}`).value),
        answer: Number(document.getElementById('edit-answer').value),
        explanation: document.getElementById('edit-explanation').value,
      };
      try {
        const res = await fetch(`/api/quiz/questions/${q._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        closeEditModal();
        if (onSave) onSave();
      } catch (err) {
        alert('저장 실패: ' + err.message);
      }
    };
  }

  window.closeEditModal = () => {
    const m = document.getElementById('edit-modal');
    if (m) m.classList.remove('show');
  };

  render();
}
