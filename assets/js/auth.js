// Minimal Google Identity Services integration (client-only).
// Replace CLIENT_ID with your OAuth client ID from Google Cloud Console.
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;

console.log("Google Client ID:", CLIENT_ID);

function decodeJwtResponse(token) {
  const base64Url = token.split('.')[1] || '';
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return JSON.parse(decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join('')));
  } catch (e) { return {}; }
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

function updateUserUI(user){
  const area = document.getElementById('userArea');
  if(!area) return;
  if(user){
    area.innerHTML = `
      <div class="user-info">
        <img src="${escapeHtml(user.picture||'')}" alt="${escapeHtml(user.name||'')}" class="avatar" />
        <span class="user-name">${escapeHtml(user.name||user.email||'')}</span>
        <button id="signOutBtn" class="btn btn--ghost small">Sign out</button>
      </div>
    `;
    document.getElementById('signOutBtn')?.addEventListener('click', signOut);
  } else {
    area.innerHTML = `<div id="gSignIn"></div>`;
    if(window.google && window.google.accounts && window.google.accounts.id){
      window.google.accounts.id.renderButton(document.getElementById('gSignIn'), { theme:'outline', size:'small' });
      window.google.accounts.id.prompt();
    }
  }
}

function handleCredentialResponse(resp){
  if(!resp?.credential) return;
  const payload = decodeJwtResponse(resp.credential);
  const user = { name: payload.name, email: payload.email, picture: payload.picture, sub: payload.sub };
  localStorage.setItem('g_user', JSON.stringify(user));
  updateUserUI(user);
  window.dispatchEvent(new CustomEvent('g_user_signed_in',{detail:user}));
}

function signOut(){
  localStorage.removeItem('g_user');
  try{ window.google?.accounts?.id?.disableAutoSelect(); }catch(e){}
  updateUserUI(null);
  window.dispatchEvent(new CustomEvent('g_user_signed_out'));
}

function init(){
  const stored = localStorage.getItem('g_user');
  const user = stored ? JSON.parse(stored) : null;

  const initGIS = () => {
    if(window.google && window.google.accounts && window.google.accounts.id){
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleCredentialResponse, cancel_on_tap_outside: true });
      updateUserUI(user);
    } else {
      setTimeout(initGIS, 200);
    }
  };
  initGIS();
}

document.addEventListener('DOMContentLoaded', init);

export function getSignedInUser(){ const s = localStorage.getItem('g_user'); return s?JSON.parse(s):null; }