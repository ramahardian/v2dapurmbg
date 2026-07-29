let idleTimer = null;
const IDLE_TIMEOUT = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(logoutIdle, IDLE_TIMEOUT);
}

async function logoutIdle() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (_) {}
  window.location.href = '/login?timeout=1';
}

function initIdleTimeout() {
  if (window.location.pathname === '/login') return;
  ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
  resetIdleTimer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIdleTimeout);
} else {
  initIdleTimeout();
}
