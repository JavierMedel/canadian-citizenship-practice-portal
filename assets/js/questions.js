// Dedicated quiz logic for questions.html

const $ = (sel) => document.querySelector(sel);
const $all = (sel) => Array.from(document.querySelectorAll(sel));

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function show(el) { el?.classList.remove('hidden'); }
function hide(el) { el?.classList.add('hidden'); }

function pretty(obj) { return JSON.stringify(obj, null, 2); }

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>",']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function insertFeedback(el, shortText, explanationText) {
  const s = escapeHtml(shortText || '');
  const ex = escapeHtml(explanationText || '');
  if (!ex) {
    el.innerHTML = `<span class="short">${s}</span>`;
  } else {
    el.innerHTML = `<span class="short">${s}</span><span class="explanation">${ex}</span>`;
  }
}

// Persistence helpers: store progress per test in localStorage
let quizTimerInterval = null;
function storageKeyForTest(test) {
  return `quiz_progress:${test}`;
}
function saveProgress(key, payload) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (_) {}
}
function loadProgress(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}
function clearProgress(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}

function parseQuery() {
  const url = new URL(window.location.href);
  return Object.fromEntries(url.searchParams.entries());
}

function ensureQuestionFilename(q) {
  if (!q) return null;
  let s = String(q).trim();
  const m = s.match(/^\d+$/);
  if (m) return `question_${s}.json`;
  if (s.toLowerCase().endsWith('.json')) return s;
  const num = (s.match(/(\d+)$/) || [])[1];
  if (num) return `question_${num}.json`;
  return s;
}

function normalizeTestSet(raw, name) {
  const title = raw?.title || raw?.name || name || 'Untitled Test';
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (Array.isArray(raw?.questions)) list = raw.questions;
  else if (Array.isArray(raw?.items)) list = raw.items;
  else if (Array.isArray(raw?.tests)) list = raw.tests;
  const entries = list.map((q, idx) => {
    if (typeof q === 'string') return { file: q, id: idx };
    if (q?.file) return { file: q.file, id: q.id ?? idx };
    if (q?.path) return { file: q.path, id: q.id ?? idx };
    if (q?.question_file) return { file: q.question_file, id: q.id ?? idx };
    return { file: q?.file || q?.path || q?.question_file || '', id: idx };
  }).filter(e => e.file);
  return { title, entries };
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path} (${res.status})`);
  return res.json();
}

function normalizeQuestion(raw) {
  const stem = raw.main_question ?? raw.question ?? raw.title ?? raw.text ?? raw.prompt ?? 'Untitled question';
  let choices = raw.possible_answers ?? raw.options ?? raw.choices ?? raw.answers ?? raw.alternatives ?? [];
  if (!Array.isArray(choices)) choices = [];
  const explanation = raw.explanatory_sentence ?? raw.explanation ?? raw.explanatory ?? raw.note ?? '';
  const question_number = raw.question_number ?? raw.number ?? raw.id ?? '';

  const toLabel = (c) => (typeof c === 'string' ? c : (c?.label ?? c?.text ?? String(c)));
  const labels = choices.map(toLabel);

  function stripLetterPrefix(s) {
    if (typeof s !== 'string') return String(s);
    const m = s.trim().match(/^([A-Za-z])\s*[\.)-]?\s*(.*)$/);
    return m ? m[2].trim() : s.trim();
  }

  function indexFromLetter(letter) {
    if (!letter || typeof letter !== 'string') return -1;
    const ch = letter.trim().toUpperCase();
    if (ch.length !== 1 || ch < 'A' || ch > 'Z') return -1;
    const idx = ch.charCodeAt(0) - 'A'.charCodeAt(0);
    return idx >= 0 && idx < labels.length ? idx : -1;
  }

  let correctIndex = -1;
  if (typeof raw.correct_index === 'number') correctIndex = raw.correct_index;
  else if (typeof raw.correctIdx === 'number') correctIndex = raw.correctIdx;
  else if (typeof raw.correct === 'number') correctIndex = raw.correct;
  if (correctIndex < 0 && typeof raw.correct_answer === 'string') {
    correctIndex = indexFromLetter(raw.correct_answer);
    if (correctIndex < 0) {
      const needle = raw.correct_answer.toString().trim();
      let idx = labels.findIndex(l => l.trim() === needle);
      if (idx < 0) {
        const strippedNeedle = stripLetterPrefix(needle);
        idx = labels.findIndex(l => stripLetterPrefix(l) === strippedNeedle);
      }
      correctIndex = idx;
    }
  }
  if (correctIndex < 0 && typeof raw.answer === 'string') {
    const needle = raw.answer.toString().trim();
    let idx = labels.findIndex(l => l.trim() === needle);
    if (idx < 0) {
      const strippedNeedle = stripLetterPrefix(needle);
      idx = labels.findIndex(l => stripLetterPrefix(l) === strippedNeedle);
    }
    correctIndex = idx;
  }
  if (correctIndex < 0) {
    const idx = choices.findIndex(c => typeof c === 'object' && (c.correct === true || c.isCorrect === true));
    correctIndex = idx;
  }

  const normalizedChoices = labels.map((label) => ({ label }));
  return { stem, choices: normalizedChoices, correctIndex, explanation, question_number };
}

async function loadQuestionsForTest(testFile) {
  const rawSet = await fetchJSON(`test_sets/${testFile}`);
  const { entries } = normalizeTestSet(rawSet, testFile);
  const qs = [];
  for (const entry of entries) {
    const qRaw = await fetchJSON(`question_json/${entry.file}`);
    qs.push(normalizeQuestion(qRaw));
  }
  return qs;
}

function renderQuestion(q, index, total, state) {
  const titleEl = $('#questionTitle');
  const textEl = $('#questionText');
  const answersEl = $('#answers');
  const feedbackEl = $('#feedback');
  const progressEl = $('#progressText');
  const nextBtn = $('#nextBtn');
  const prevBtn = $('#prevBtn');

  setText(progressEl, `Question ${index + 1} of ${total}`);
  setText(titleEl, q.stem);
  setText(textEl, '');
  answersEl.innerHTML = '';
  hide(feedbackEl);
  const sourceEl = $('#questionSource');
  if (sourceEl) {
    if (q.question_number) setText(sourceEl, `Source: question_${q.question_number}`);
    else setText(sourceEl, 'Source: —');
  }
  nextBtn.disabled = true;

  q.choices.forEach((choice, i) => {
    const id = `ans_${index}_${i}`;
    const wrapper = document.createElement('label');
    wrapper.className = 'answer';
    wrapper.setAttribute('data-index', String(i));
    wrapper.htmlFor = id;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `q_${index}`;
    input.id = id;
    input.value = String(i);

    const span = document.createElement('span');
    span.className = 'answer__label';
    span.textContent = choice.label;

    wrapper.appendChild(input);
    wrapper.appendChild(span);
    answersEl.appendChild(wrapper);

    wrapper.addEventListener('click', () => {
      if (state.locked) return;
      state.locked = true;
      const selected = i;
      const correct = q.correctIndex;
      const correctEl = answersEl.querySelector(`label[data-index="${correct}"]`);
      const selectedEl = answersEl.querySelector(`label[data-index="${selected}"]`);
      correctEl?.classList.add('answer--correct');
      let fb = '';
      if (selected !== correct) {
        selectedEl?.classList.add('answer--wrong');
        fb = 'Incorrect';
        feedbackEl.setAttribute('data-type', 'error');
      } else {
        fb = 'Correct';
        feedbackEl.setAttribute('data-type', 'success');
        state.score += 1;
      }
      insertFeedback(feedbackEl, fb, q.explanation);
      show(feedbackEl);
      $all('.answer').forEach(el => el.classList.add('disabled'));
      nextBtn.disabled = false;
      updateScore(state);
    });
  });

  prevBtn.disabled = index === 0;
}

function updateScore(state) {
  setText($('#scoreText'), `Score: ${state.score}`);
}

function formatTimeSeconds(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function showResults(state) {
  hide($('.question'));
  show($('#results'));
  const passThreshold = 15;
  const passed = state.score >= passThreshold;
  const passText = passed ? 'PASSED' : 'FAILED';
  const details = `You scored ${state.score} out of ${state.total}.`;
  setText($('#resultsText'), `${passText} — ${details} (${passThreshold} required to pass)`);
}

async function init() {
  const { test } = parseQuery();
  const qparam = (parseQuery().question || parseQuery().q || '').toString();

  if (!test) {
    if (qparam) {
      const qfile = ensureQuestionFilename(qparam);
      let qRaw;
      try {
        qRaw = await fetchJSON(`question_json/${qfile}`);
      } catch (e) {
        setText($('#questionTitle'), 'Failed to load question.');
        setText($('#questionText'), String(e));
        hide($('.actions'));
        return;
      }
      const question = normalizeQuestion(qRaw);
      const state = { idx: 0, total: 1, score: 0, locked: false };
      updateScore(state);
      renderQuestion(question, 0, 1, state);
      $('#prevBtn').disabled = true;
      $('#nextBtn').disabled = true;
      return;
    }
    setText($('#questionTitle'), 'No test specified.');
    hide($('.actions'));
    return;
  }

  let questions = [];
  try {
    questions = await loadQuestionsForTest(test);
  } catch (e) {
    setText($('#questionTitle'), 'Failed to load test.');
    setText($('#questionText'), String(e));
    hide($('.actions'));
    return;
  }

  const state = { idx: 0, total: questions.length, score: 0, locked: false };

  // Always start fresh
  const storageKey = storageKeyForTest(test);
  clearProgress(storageKey);
  state._storageKey = storageKey;
  updateScore(state);

  // Timer: 20 minutes
  const totalTime = 20 * 60;
  let remaining = totalTime;
  const timerBar = $('#timerBar');
  const timerCount = $('#timerCount');
  timerCount.textContent = formatTimeSeconds(remaining);

  const timerInterval = setInterval(() => {
    remaining -= 1;
    if (timerBar) timerBar.style.width = `${((totalTime - remaining) / totalTime) * 100}%`;
    if (timerCount) timerCount.textContent = formatTimeSeconds(remaining);
    if (remaining <= 0) {
      clearInterval(timerInterval);
      showResults(state);
    }
  }, 1000);

  quizTimerInterval = timerInterval;

  const nextBtn = $('#nextBtn');
  const prevBtn = $('#prevBtn');

  function renderCurrent() {
    state.locked = false;
    if (state.idx >= state.total) { showResults(state); return; }
    renderQuestion(questions[state.idx], state.idx, state.total, state);
  }

  nextBtn.addEventListener('click', () => {
    state.idx += 1;
    renderCurrent();
  });
  prevBtn.addEventListener('click', () => {
    if (state.idx > 0) state.idx -= 1;
    renderCurrent();
  });

  renderCurrent();
}

init();
