// Quiz page logic: loads a test set, displays questions and validates answers

const $ = (s) => document.querySelector(s);

const els = {
  qText: $('#question-text'),
  form: $('#answers-form'),
  feedback: $('#feedback'),
  nextBtn: $('#next-btn'),
  qNumber: $('#q-number'),
  qTotal: $('#q-total'),
  score: $('#score'),
  resultsSection: $('#results'),
  resultCorrect: $('#result-correct'),
  resultTotal: $('#result-total'),
  resultStatus: $('#result-status'),
};

const params = new URLSearchParams(location.search);
const testFile = params.get('test');

function pretty(o) { try { return JSON.stringify(o, null, 2); } catch { return String(o); } }

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function normalizeTestSet(json) {
  if (!json) return [];
  const pick = (o) => {
    if (!o) return null;
    if (typeof o === 'string') return o;
    if (o.filename) return o.filename;
    if (o.file) return o.file;
    if (o.path) return o.path;
    if (o.id) return o.id;
    if (o.question && typeof o.question === 'string') return o.question;
    return null;
  };
  if (Array.isArray(json)) return json.map(pick).filter(Boolean);
  if (Array.isArray(json.questions)) return json.questions.map(pick).filter(Boolean);
  if (typeof json === 'object') return Object.values(json).map(pick).filter(Boolean);
  return [];
}

function ensureJsonName(name) {
  if (!name) return null;
  return name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
}

function normalizeQuestion(q) {
  // Stem
  const stem = q.question || q.title || q.text || q.prompt || '(Untitled question)';

  // Choices (supports different keys)
  const choicesRaw = q.possible_answers || q.options || q.choices || q.answers || q.alternatives || [];

  let correctIndex = null;
  let labels = [];

  if (Array.isArray(choicesRaw) && choicesRaw.length) {
    // Array of strings
    if (typeof choicesRaw[0] === 'string') {
      labels = choicesRaw.map((s) => String(s));
      const correctText = q.correct_answer || q.answer || null; // string
      const correctIdx = q.correct_index ?? q.correctIdx ?? q.correct ?? null; // number or index-like
      if (Number.isInteger(correctIdx)) {
        correctIndex = Math.max(0, Math.min(labels.length - 1, Number(correctIdx)));
      } else if (typeof correctText === 'string') {
        const idx = labels.findIndex((x) => x.trim().toLowerCase() === correctText.trim().toLowerCase());
        if (idx >= 0) correctIndex = idx;
      }
    } else {
      // Array of objects
      labels = choicesRaw.map((o) => o.text || o.label || o.answer || pretty(o));
      const idx = choicesRaw.findIndex((o) => o.correct === true || o.isCorrect === true);
      if (idx >= 0) correctIndex = idx;
      // fallback: if correct_answer string provided, match to label
      if (correctIndex == null && typeof q.correct_answer === 'string') {
        const matchIdx = labels.findIndex((x) => x.trim().toLowerCase() === q.correct_answer.trim().toLowerCase());
        if (matchIdx >= 0) correctIndex = matchIdx;
      }
    }
  }

  // Final normalized structure
  return {
    stem,
    choices: labels.map((label, i) => ({ label, isCorrect: i === correctIndex })),
  };
}

async function loadQuestionsForTest(fileName) {
  if (!fileName) throw new Error('Missing test file name');
  const test = await fetchJson(`test_sets/${encodeURIComponent(fileName)}`);
  const entries = normalizeTestSet(test).map(ensureJsonName).filter(Boolean);
  const questions = [];
  for (const fname of entries) {
    try {
      const q = await fetchJson(`question_json/${encodeURIComponent(fname)}`);
      questions.push(normalizeQuestion(q));
    } catch (e) {
      // skip missing or invalid
    }
  }
  return questions;
}

const state = {
  questions: [],
  i: 0,
  score: 0,
  answered: false,
};

function renderProgress() {
  els.qNumber.textContent = String(state.i + 1);
  els.qTotal.textContent = String(state.questions.length);
  els.score.textContent = String(state.score);
}

function renderCurrent() {
  const q = state.questions[state.i];
  els.qText.textContent = q?.stem || '(Question)';
  els.form.innerHTML = '';
  els.feedback.textContent = '';
  els.nextBtn.disabled = true;
  state.answered = false;

  q.choices.forEach((ch, idx) => {
    const id = `ans_${state.i}_${idx}`;
    const label = document.createElement('label');
    label.className = 'answer';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'answer';
    input.id = id;
    input.value = String(idx);
    const span = document.createElement('span');
    span.className = 'answer__label';
    span.textContent = ch.label;
    label.appendChild(input);
    label.appendChild(span);
    label.addEventListener('click', (ev) => {
      // Only handle once
      if (state.answered) return;
      onAnswer(idx);
    });
    els.form.appendChild(label);
  });

  renderProgress();
}

function onAnswer(selectedIdx) {
  const q = state.questions[state.i];
  const correctIdx = q.choices.findIndex((c) => c.isCorrect);
  const isCorrect = selectedIdx === correctIdx;
  state.answered = true;
  if (isCorrect) state.score += 1;
  els.score.textContent = String(state.score);

  // Visual feedback
  const labels = Array.from(els.form.querySelectorAll('.answer'));
  labels.forEach((lbl, idx) => {
    lbl.classList.add('disabled');
    if (idx === correctIdx) lbl.classList.add('answer--correct');
    if (idx === selectedIdx && !isCorrect) lbl.classList.add('answer--wrong');
  });

  els.feedback.textContent = isCorrect ? 'Correct!' : `Incorrect. Correct answer highlighted.`;
  els.feedback.dataset.type = isCorrect ? 'success' : 'error';
  els.nextBtn.disabled = false;
}

function onNext() {
  if (state.i < state.questions.length - 1) {
    state.i += 1;
    renderCurrent();
  } else {
    showResults();
  }
}

function showResults() {
  els.resultCorrect.textContent = String(state.score);
  els.resultTotal.textContent = String(state.questions.length);
  const pct = state.questions.length ? Math.round((state.score / state.questions.length) * 100) : 0;
  els.resultStatus.textContent = `Score: ${pct}%`;
  els.resultsSection.classList.remove('hidden');
  // Scroll to results
  els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function attachEvents() {
  els.nextBtn.addEventListener('click', onNext);
  const restartBtn = document.querySelector('#restart-btn');
  restartBtn?.addEventListener('click', () => {
    state.i = 0;
    state.score = 0;
    state.answered = false;
    els.resultsSection.classList.add('hidden');
    renderCurrent();
  });
}

async function init() {
  if (!testFile) {
    // No test selected; go back
    location.replace('index.html');
    return;
  }
  try {
    state.questions = await loadQuestionsForTest(testFile);
    if (!state.questions.length) {
      els.qText.textContent = 'No questions found for this test.';
      els.form.innerHTML = '';
      return;
    }
    attachEvents();
    renderCurrent();
  } catch (e) {
    els.qText.textContent = 'Failed to load test.';
  }
}

init();