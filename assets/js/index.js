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
  const signed = Boolean(getSignedInUser());
  files.forEach((name, idx) => {
    const item = document.createElement('button');
    item.className = 'test-card';
    item.setAttribute('role', 'listitem');
    item.dataset.index = String(idx);
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
      // continue rendering all tests; access limits are applied later
  });
  // after rendering, update access limits (in case auth state known)
  setTimeout(() => applyAccessLimits(), 0);
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

// new: import helper to check signed-in user
import { getSignedInUser } from './auth.js';

// new: apply access limits for unsigned users (lock cards after first 30)
function applyAccessLimits() {
  const signed = Boolean(getSignedInUser());
  // adjust selector if your card element uses a different class/selector
  const cards = document.querySelectorAll('.test-card');
  cards.forEach((card, i) => {
    // allow unsigned users to access tests 1-5 (indexes 0-4)
    // lock tests 6-30 (indexes 5-29) for unsigned users
    const locked = !signed && i >= 5;
    if (locked) {
      card.classList.add('locked');
      // disable the button so any attached click handlers won't fire
      try { card.disabled = true; } catch (e) {}

      // add overlay if not present
      if (!card.querySelector('.lock-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'lock-overlay';
        overlay.innerHTML = `
          <div class="lock-inner">
            <div class="lock-icon">🔒</div>
            <div class="lock-text">Sign in to unlock</div>
          </div>
        `;
        card.style.position = card.style.position || 'relative';
        card.appendChild(overlay);
        // clicking overlay invites sign-in and shows a toast
        overlay.addEventListener('click', (e) => {
          e.stopPropagation();
          showSignInToast('Sign in to unlock more tests');
          preventSignInPrompt(e);
        }, { passive: false });
      }

    } else {
      card.classList.remove('locked');
      try { card.disabled = false; } catch (e) {}
      const overlay = card.querySelector('.lock-overlay');
      overlay?.remove();
    }
  });
}

// small toast helper shown when user attempts a locked action
function showSignInToast(text) {
  let toast = document.getElementById('signin-toast');
  if (toast) {
    toast.textContent = text;
    toast.classList.remove('hidden');
  } else {
    toast = document.createElement('div');
    toast.id = 'signin-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(0,0,0,0.85)';
    toast.style.color = '#fff';
    toast.style.padding = '0.6rem 1rem';
    toast.style.borderRadius = '6px';
    toast.style.zIndex = 9999;
    toast.textContent = text;
    document.body.appendChild(toast);
  }
  // auto-hide after 3s
  setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}

function preventSignInPrompt(e) {
  e.preventDefault();
  // simple prompt: guide user to sign-in area
  // you can replace this with a nicer modal or scroll-to header
  const userArea = document.getElementById('userArea');
  if (userArea) {
    userArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // Optionally show a temporary tooltip or toast
}

// initial application (some pages render cards after load; delay safe)
document.addEventListener('DOMContentLoaded', () => {
  // initial attempt
  setTimeout(applyAccessLimits, 300);
  // ensure re-apply after 1s in case render is async
  setTimeout(applyAccessLimits, 1000);
});

// re-apply when sign-in state changes
window.addEventListener('g_user_signed_in', applyAccessLimits);
window.addEventListener('g_user_signed_out', applyAccessLimits);

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