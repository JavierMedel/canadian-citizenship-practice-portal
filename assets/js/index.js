// Auto-discovery and loading of test sets and questions from server folders

const qs = (sel) => document.querySelector(sel);
const statusEl = qs('#load-status');
const containerEl = qs('#question-container');
const gridEl = qs('#test-set-grid');
const gridStatusEl = qs('#grid-status');

function setStatus(msg, type = 'info') {
  if (statusEl) {
    statusEl.textContent = msg || '';
    statusEl.dataset.type = type;
  }
}

function setGridStatus(msg) {
  if (gridStatusEl) gridStatusEl.textContent = msg || '';
}

function pretty(obj) {
  try { return JSON.stringify(obj, null, 2); } catch (_) { return String(obj); }
}

function normalizeTestSet(json) {
  if (!json) return [];
  const pickFromObject = (o) => {
    if (!o) return null;
    if (typeof o === 'string') return o;
    if (o.filename) return o.filename;
    if (o.file) return o.file;
    if (o.path) return o.path;
    if (o.id) return o.id;
    if (o.question && typeof o.question === 'string') return o.question;
    return null;
  };
  if (Array.isArray(json)) return json.map(pickFromObject).filter(Boolean);
  if (Array.isArray(json.questions)) return json.questions.map(pickFromObject).filter(Boolean);
  if (typeof json === 'object') return Object.values(json).map(pickFromObject).filter(Boolean);
  return [];
}

function ensureJsonName(entry) {
  if (!entry) return null;
  const base = String(entry).trim();
  return base.toLowerCase().endsWith('.json') ? base : base + '.json';
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function listJsonFilesIn(path) {
  // Uses static server directory listing HTML to discover files.
  const html = await fetchText(path);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  const files = new Set();
  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    // Skip parent directory links
    if (href === '../' || href.endsWith('/')) continue;
    if (!href.toLowerCase().endsWith('.json')) continue;
    try {
      const u = new URL(href, location.origin + '/' + path.replace(/^\/?/, ''));
      const parts = u.pathname.split('/');
      const name = decodeURIComponent(parts[parts.length - 1]);
      files.add(name);
    } catch (_) {}
  }
  return Array.from(files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function renderTestGrid(files) {
  gridEl.innerHTML = '';
  if (!files.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No test sets found in \'test_sets\'. Add .json files to that folder.';
    gridEl.appendChild(p);
    return;
  }
  files.forEach((name, idx) => {
    const item = document.createElement('button');
    item.className = 'test-card';
    item.setAttribute('role', 'listitem');
    const label = `Test ${idx + 1}`;
    item.title = `Open ${label}`;
    item.innerHTML = `
      <span class="test-name">${label}</span>
    `;
    item.addEventListener('click', () => {
      // Navigate to the new dedicated questions page with selected test
      window.location.href = `questions.html?test=${encodeURIComponent(name)}`;
    });
    gridEl.appendChild(item);
  });
}

// Note: Question rendering on index is kept for fallback/manual checks.

function renderQuestions(questions) {
  containerEl.innerHTML = '';
  if (!questions?.length) {
    containerEl.innerHTML = '<p class="muted">No questions to display.</p>';
    return;
  }
  for (const q of questions) {
    const card = document.createElement('article');
    card.className = 'question-card';
    const title = q.title || q.question || q.text || q.prompt || '(Untitled question)';
    const stemEl = document.createElement('h3');
    stemEl.className = 'question-title';
    stemEl.textContent = title;
    card.appendChild(stemEl);
    const options = q.options || q.choices || q.answers || q.alternatives || null;
    if (Array.isArray(options)) {
      const list = document.createElement('ul');
      list.className = 'options';
      for (const opt of options) {
        const li = document.createElement('li');
        li.className = 'option';
        const label = typeof opt === 'string' ? opt : (opt.text || opt.label || pretty(opt));
        li.textContent = label;
        list.appendChild(li);
      }
      card.appendChild(list);
    } else {
      const pre = document.createElement('pre');
      pre.className = 'raw';
      pre.textContent = pretty(q);
      card.appendChild(pre);
    }
    containerEl.appendChild(card);
  }
}

async function init() {
  try {
    setGridStatus('Discovering available tests…');
    const files = await listJsonFilesIn('test_sets/');
    renderTestGrid(files);
    setGridStatus(files.length ? '' : '');
  } catch (e) {
    console.error(e);
    setGridStatus('Failed to list tests in \'test_sets\'.');
  }
}

init();