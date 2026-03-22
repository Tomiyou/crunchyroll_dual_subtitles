'use strict';

const fileInput       = document.getElementById('file-input');
const fileLabel       = document.getElementById('file-label');
const statusEl        = document.getElementById('status');
const offsetInput     = document.getElementById('offset-input');
const btnApplyOffset  = document.getElementById('btn-apply-offset');
const btnClear        = document.getElementById('btn-clear');
const noVideoWarning  = document.getElementById('no-video-warning');

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = type;
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(msg) {
  const tab = await getActiveTab();
  if (!tab) { setStatus('No active tab.', 'err'); return null; }
  try {
    return await browser.tabs.sendMessage(tab.id, msg);
  } catch {
    setStatus('Content script not ready. Reload the Crunchyroll tab.', 'err');
    return null;
  }
}

// Ping to check content script is alive
(async () => {
  const res = await sendToContent({ type: 'PING' });
  if (!res || !res.ok) {
    noVideoWarning.style.display = 'block';
    noVideoWarning.textContent = 'Content script not ready. Open a Crunchyroll tab first.';
  }
})();

// ── File loading ──────────────────────────────────────────────────────────────
fileLabel.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;
    fileLabel.textContent = file.name;
    setStatus('Sending…');

    const res = await sendToContent({ type: 'LOAD_SRT', content });
    if (!res) return;

    if (res.ok) {
      setStatus(`Loaded ${res.count} subtitle${res.count !== 1 ? 's' : ''}.`, 'ok');
      noVideoWarning.style.display = 'none';
    } else {
      setStatus(`Parse error: ${res.error}`, 'err');
    }
  };
  reader.onerror = () => setStatus('Could not read file.', 'err');
  reader.readAsText(file, 'UTF-8');
});

// ── Offset ────────────────────────────────────────────────────────────────────
btnApplyOffset.addEventListener('click', async () => {
  const seconds = parseFloat(offsetInput.value) || 0;
  const res = await sendToContent({ type: 'SET_OFFSET', seconds });
  if (res && res.ok) {
    setStatus(`Offset applied: ${seconds >= 0 ? '+' : ''}${seconds}s`, 'ok');
  }
});

// ── Clear ─────────────────────────────────────────────────────────────────────
btnClear.addEventListener('click', async () => {
  const res = await sendToContent({ type: 'CLEAR_SRT' });
  if (res && res.ok) {
    fileLabel.textContent = 'Click to load .srt file';
    fileInput.value = '';
    offsetInput.value = '0';
    setStatus('Subtitles cleared.', 'ok');
  }
});
