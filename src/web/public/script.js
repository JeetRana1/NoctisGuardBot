// Mobile nav toggle and smooth scrolling
const navToggle = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');
if (navToggle) {
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    navMenu.classList.toggle('show');
  });
}

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // hide mobile menu after click
    if (navMenu && navMenu.classList.contains('show')) navMenu.classList.remove('show');
  });
});

// simple reveal on scroll
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('show');
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// API base: if page served via Live Server (port 5500), use localhost:3000 for API
const API_BASE = (window.location.port === '5500') ? 'http://localhost:3000' : window.location.origin;

// Ensure invite/dashboard links point to API server so they work when previewing with Live Server
document.querySelectorAll('a[href="/invite"], a[href="/invite-now"], a[href="/auth"], a[href="/dashboard"]').forEach(a => {
  a.href = API_BASE + a.getAttribute('href');
});

// Helper to fetch JSON safely and handle non-JSON / errors
async function safeFetch(url, options = {}){
  try{
    const res = await fetch(url, options);
    if (!res.ok){
      let body = '';
      try{ body = await res.text(); }catch(e){ body = ''; }
      return { ok: false, status: res.status, body };
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')){
      try { const data = await res.json(); return { ok: true, data }; } catch(e) { return { ok: true, data: {} }; }
    } else {
      const body = await res.text();
      return { ok: true, data: { message: body } };
    }
  }catch(err){
    return { ok: false, error: err };
  }
}

// Live reload client (listens for 'reload' event from socket.io and reloads)
let socket;
if (typeof io !== 'undefined') {
  try {
    socket = io();
    socket.on('reload', () => {
      console.log('Live reload: reloading page');
      window.location.reload();
    });
  } catch (e) {
    console.warn('Socket.io not available:', e);
  }
}

// Player controls (frontend) - sends requests to server API
const btnPlay = document.getElementById('btn-play');
const btnNext = document.getElementById('btn-next');
const btnPrev = document.getElementById('btn-prev');
const nowSong = document.getElementById('now-song');
const playModal = document.getElementById('play-modal');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const playForm = document.getElementById('play-form');
const songQuery = document.getElementById('song-query');
const toast = document.getElementById('toast');

function showToast(msg){
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'), 3000);
}

btnPlay?.addEventListener('click', ()=>{
  // open modal to get a song query
  if (playModal) playModal.setAttribute('aria-hidden','false');
  songQuery?.focus();
});
modalClose?.addEventListener('click', ()=>playModal?.setAttribute('aria-hidden','true'));
modalCancel?.addEventListener('click', ()=>playModal?.setAttribute('aria-hidden','true'));

playForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const q = songQuery.value.trim();
  if (!q) return showToast('Please enter a song or URL');
  showToast('Sending play request...');
  const res = await safeFetch(`${API_BASE}/api/play`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q})});
  if (!res.ok) {
    showToast(res.body || res.error?.message || `Request failed (${res.status})`);
    return;
  }
  const data = res.data;
  nowSong.textContent = data.message || 'Queued';
  showToast('Requested: ' + (data.message||q));
  playModal?.setAttribute('aria-hidden','true');
  songQuery.value = '';
});

btnNext?.addEventListener('click', async ()=>{
  showToast('Sending skip request...');
  const res = await safeFetch(`${API_BASE}/api/next`, {method:'POST'});
  if (!res.ok) return showToast(res.body || res.error?.message || `Request failed (${res.status})`);
  showToast(res.data.message || 'Skipped');
});

btnPrev?.addEventListener('click', async ()=>{
  showToast('Sending previous request...');
  const res = await safeFetch(`${API_BASE}/api/previous`, {method:'POST'});
  if (!res.ok) return showToast(res.body || res.error?.message || `Request failed (${res.status})`);
  showToast(res.data.message || 'Previous');
});