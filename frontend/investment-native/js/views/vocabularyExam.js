const STORAGE_KEY = 'vocabulary_exam_submission_2026_08_v2';
const PROFILE_KEY = 'vocabulary_exam_profile_2026_08_v1';
const LETTERS = ['①', '②', '③', '④'];

function savedSubmissionId() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function saveSubmissionId(id) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ }
}

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || { name: '', region: '' }; } catch { return { name: '', region: '' }; }
}

function saveProfile(profile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* storage unavailable */ }
}

function formatKst(iso) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'long', timeStyle: 'short', hour12: false }).format(new Date(iso));
}

export function vocabularyExamView(app, navigate) {
  app.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div class="loading-text">시험 정보를 확인하고 있어요…</div></div>';
  fetch('/api/vocabulary-exam')
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.detail?.code || data.detail || '시험을 불러올 수 없습니다.'), { data });
      return data;
    })
    .then((exam) => renderExam(exam))
    .catch((error) => {
      const opensAt = error.data?.detail?.opens_at;
      if (error.data?.detail?.code === 'exam_not_open') {
        app.innerHTML = `<div class="card" style="text-align:center;padding:52px 24px;"><div style="font-size:2.5rem;margin-bottom:16px;"><i class="fa-solid fa-lock" style="color:var(--primary)"></i></div><h2 style="margin:0 0 10px;">단어장 시험 준비 중</h2><p style="margin:0;color:var(--text-muted);">시험은 <strong>${formatKst(opensAt)}</strong>부터 응시할 수 있어요.</p></div>`;
        return;
      }
      app.innerHTML = `<div class="card"><p style="color:var(--red)"><i class="fa-solid fa-triangle-exclamation"></i> 시험 정보를 불러오지 못했습니다.</p><p style="color:var(--text-muted);font-size:.85rem;">${error.message}</p></div>`;
    });

  function renderExam(exam) {
    const { questions, answer_release_at: releaseAt } = exam;
    const submissionId = savedSubmissionId();
    const profile = loadProfile();
    const answers = {};
    let current = 0;
    let result = null;

    const loadResult = submissionId && new Date() >= new Date(releaseAt)
      ? fetch(`/api/vocabulary-exam/submissions/${encodeURIComponent(submissionId)}`).then((r) => r.ok ? r.json() : null)
      : Promise.resolve(null);
    loadResult.then((data) => { result = data; if (data) Object.assign(answers, Object.fromEntries(data.questions.map((q, i) => [i, q.selected]))); render(); });

    function render() {
      const submitted = Boolean(submissionId);
      const reviewAvailable = Boolean(result);
      const question = reviewAvailable ? result.questions[current] : questions[current];
      const answered = Object.keys(answers).length;
      app.innerHTML = `<div class="quiz-header"><div><h2 style="margin:0 0 4px;font-weight:800"><i class="fa-solid fa-spell-check" style="color:var(--primary);margin-right:8px;"></i>주식 기초 단어장 모의시험</h2><p style="margin:0;color:var(--text-muted);font-size:.85rem;">voca.md 기반 4지선다 30문항 · 정답·해설 공개 ${formatKst(releaseAt)}</p></div><div class="quiz-score-bar"><span>${reviewAvailable ? `결과 · ${result.score} / ${result.total}점` : submitted ? `제출 완료 · 공개 ${formatKst(releaseAt)}` : `${answered} / ${questions.length}문항 응답`}</span></div></div>
      ${submitted ? '' : `<div class="card" style="margin:0 0 20px;"><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;"><label style="font-size:.88rem;font-weight:700;">이름<input id="exam-name" type="text" maxlength="40" value="${profile.name.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')}" placeholder="이름을 입력하세요" style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font:inherit;"></label><label style="font-size:.88rem;font-weight:700;">사는 지역<select id="exam-region" style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font:inherit;"><option value="">시·도 선택</option>${exam.regions.map((region) => `<option value="${region}" ${profile.region === region ? 'selected' : ''}>${region}</option>`).join('')}</select></label></div><p style="font-size:.78rem;color:var(--text-muted);margin:10px 0 0;">지역은 17개 시·도 중에서만 선택할 수 있어요.</p></div>`}
      ${reviewAvailable ? `<div class="card" style="margin:0 0 20px;border-left:4px solid var(--primary);"><strong>결과: ${result.score} / ${result.total}점</strong><span style="color:var(--text-muted);margin-left:8px;">해설을 읽고 단어장을 다시 확인해 보세요.</span></div>` : submitted ? `<div class="card" style="margin:0 0 20px;border-left:4px solid var(--primary);"><strong>답안이 제출되었습니다.</strong><span style="color:var(--text-muted);margin-left:8px;">정답과 해설은 ${formatKst(releaseAt)}부터 확인할 수 있어요.</span></div>` : ''}
      <div class="quiz-progress-wrap" style="margin-bottom:18px;"><div class="quiz-progress-label"><span>문제 ${current + 1} / ${questions.length}</span><span>${reviewAvailable ? '채점 결과' : `${Math.round(answered / questions.length * 100)}% 완료`}</span></div><div class="progress-bar"><div class="progress-fill" style="width:${reviewAvailable ? 100 : answered / questions.length * 100}%"></div></div></div>
      <div class="question-card"><div class="q-num"><span class="badge badge-blue">Q${current + 1}</span><span style="color:var(--text-muted);font-size:.76rem;">주식 기초 용어</span></div><div class="q-text">${question.question}</div><div class="choices">${question.choices.map((choice, index) => { const selected = answers[current]; const style = reviewAvailable ? (index === question.answer ? ' correct' : (index === selected ? ' wrong' : '')) : (index === selected ? ' selected' : ''); return `<button class="choice-btn${style}" data-choice="${index}" ${submitted ? 'disabled' : ''}><span class="choice-idx">${LETTERS[index]}</span><span>${choice}</span></button>`; }).join('')}</div>${reviewAvailable ? `<div class="explanation show ${answers[current] !== question.answer ? 'wrong-exp' : ''}"><div class="exp-label">${answers[current] === question.answer ? '정답입니다!' : `정답: ${LETTERS[question.answer]} ${question.choices[question.answer]}`}</div>${question.explanation}</div>` : ''}</div>
      <div class="quiz-nav"><button class="btn btn-secondary" id="prev" ${current === 0 ? 'disabled' : ''}>이전</button>${current < questions.length - 1 ? '<button class="btn btn-primary" id="next">다음</button>' : submitted ? '<button class="btn btn-secondary" id="home">퀴즈 메뉴</button>' : `<button class="btn btn-success" id="submit" ${answered < questions.length ? 'disabled' : ''}>시험 제출</button>`}</div>`;
      app.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => { answers[current] = Number(button.dataset.choice); render(); }));
      app.querySelector('#exam-name')?.addEventListener('input', (event) => { profile.name = event.target.value; saveProfile(profile); });
      app.querySelector('#exam-region')?.addEventListener('change', (event) => { profile.region = event.target.value; saveProfile(profile); });
      app.querySelector('#prev')?.addEventListener('click', () => { current--; render(); });
      app.querySelector('#next')?.addEventListener('click', () => { current++; render(); });
      app.querySelector('#home')?.addEventListener('click', () => navigate('quiz-home'));
      app.querySelector('#submit')?.addEventListener('click', async () => {
        const name = app.querySelector('#exam-name')?.value.trim() || '';
        const region = app.querySelector('#exam-region')?.value || '';
        if (!name || !region) { alert('이름과 사는 지역을 모두 입력해 주세요.'); return; }
        saveProfile({ name, region });
        const response = await fetch('/api/vocabulary-exam/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, region, answers: questions.map((_, i) => answers[i]) }) });
        if (!response.ok) { const data = await response.json().catch(() => ({})); alert(data.detail || '답안 제출에 실패했습니다. 잠시 후 다시 시도해 주세요.'); return; }
        saveSubmissionId((await response.json()).submission_id); window.location.reload();
      });
    }
    render();
  }
}
