(() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let subtitles = [];   // [{ start, end, text }]
  let subtitles2 = [];  // [{ start, end, text }]
  let overlay = null;   // the subtitle div
  let video = null;     // the <video> element
  let rafId = null;     // requestAnimationFrame id

  // ── SRT Parsing ────────────────────────────────────────────────────────────
  function parseTime(ts) {
    // "HH:MM:SS,mmm"
    const [hms, ms] = ts.trim().split(',');
    const [h, m, s] = hms.split(':').map(Number);
    return h * 3600 + m * 60 + s + Number(ms) / 1000;
  }

  function parseSRT(raw) {
    const blocks = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split(/\n\s*\n/);
    const result = [];
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      // Find the timecode line (skip the sequence number line)
      let timeLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(lines[i])) {
          timeLine = i;
          break;
        }
      }
      if (timeLine === -1) continue;

      const match = lines[timeLine].match(
        /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/
      );
      if (!match) continue;

      const text = lines.slice(timeLine + 1).join('\n').trim();
      if (!text) continue;

      result.push({
        start: parseTime(match[1].replace('.', ',')),
        end:   parseTime(match[2].replace('.', ',')),
        text,
      });
    }
    return result;
  }

  // ── Overlay ────────────────────────────────────────────────────────────────
  function createOverlay() {
    const el = document.createElement('div');
    el.id = 'crc-subtitle-overlay';
    el.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      text-align: center;
      width: 100%;
      color: #ffffff;
      font-size: 20rem;
    `;
    el.innerHTML = "Heroin za zajtrk...";
    return el;
  }

  function getPlayerContainer() {
    // Crunchyroll player containers (may change with site updates)
    const selectors = [
      // '[class*="video-player"]',
      // '[class*="player-container"]',
      '#player-container',
      // '.video-container',
      // 'div[data-testid*="player"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Fallback: the video element's parent
    return video ? video.parentElement : document.body;
  }

  function attachOverlay() {
    if (!overlay) return;
    // Remove from wherever it currently lives
    overlay.remove();

    const fs = document.fullscreenElement;
    if (fs) {
      // Must be inside the fullscreen element to be visible
      fs.style.position = fs.style.position || 'relative';
      fs.appendChild(overlay);
    } else {
      const container = getPlayerContainer();
      if (container) {
        // Ensure the container is positioned so `position:absolute` works
        const pos = getComputedStyle(container).position;
        if (pos === 'static') container.style.position = 'relative';
        container.appendChild(overlay);
      }
    }
    positionOverlay();
  }

  function positionOverlay() {
    if (!video || !overlay) return;
    const rect = video.getBoundingClientRect();
    overlay.style.bottom = (window.innerHeight - rect.bottom + 16) + 'px';
  }

  function cleanSubtitle(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\{[^}]*\}/g, '')      // remove SSA tags like {\an8}
      .replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/gis, '<b>$1</b>')
      .replace(/&lt;i&gt;(.*?)&lt;\/i&gt;/gis, '<i>$1</i>')
      .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gis, '<u>$1</u>');
  }

  // ── Subtitle rendering loop ────────────────────────────────────────────────
  function renderLoop() {
    if (!video || !overlay || subtitles.length === 0) {
      rafId = requestAnimationFrame(renderLoop);
      return;
    }

    const t = video.currentTime;
    // Binary-search-ish: just linear scan is fine for typical SRT sizes
    let active = null;
    for (const sub of subtitles) {
      if (t >= sub.start && t <= sub.end) {
        active = sub;
        break;
      }
    }
    let active2 = null;
    for (const sub of subtitles2) {
      if (t >= sub.start && t <= sub.end) {
        active2 = sub;
        break;
      }
    }

    if (active || active2) {
      // Sanitise HTML tags that some SRT files use (bold/italic)
      let subtitleHtml = (active) ? cleanSubtitle(active.text) : "";
      if (active2) {
        if (subtitleHtml !== "") {
          subtitleHtml += "<br>"
        }
        subtitleHtml += cleanSubtitle(active2.text);
      }
      overlay.innerHTML = subtitleHtml;
      overlay.style.display = 'block';
    } else {
      overlay.style.display = 'none';
    }

    rafId = requestAnimationFrame(renderLoop);
  }

  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(renderLoop);
  }

  // ── Video detection ────────────────────────────────────────────────────────
  function findVideo() {
    return document.querySelector('video');
  }

  function init() {
    console.log("subtitle extension init()");

    video = findVideo();
    if (!video) {
      console.log("VIDEO NOT FOUND!!!");
      return false;
    }

    if (!overlay) {
      console.log("Creating overlay");
      overlay = createOverlay();
    }
    attachOverlay();
    startLoop();
    return true;
  }

  // Poll for the video element (Crunchyroll is a SPA, video appears after navigation)
  let initInterval = setInterval(() => {
    if (init()) clearInterval(initInterval);
  }, 1000);

  // Re-init on SPA navigation
  let lastUrl = location.href;
  const navObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      video = null;
      subtitles = [];
      subtitles2 = [];
      if (overlay) { overlay.remove(); overlay = null; }
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      clearInterval(initInterval);
      initInterval = setInterval(() => {
        if (init()) clearInterval(initInterval);
      }, 1000);
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  // Re-attach overlay when fullscreen changes
  document.addEventListener('fullscreenchange', () => {
    // Small delay to let the browser settle the fullscreen element
    setTimeout(attachOverlay, 50);
  });

  // ── Message listener (from popup) ─────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'LOAD_SRT') {
      try {
        let subtitleLength = 0;
        if (msg.primary) {
          subtitles = parseSRT(msg.content);
          subtitleLength = subtitles.length;
        } else {
          subtitles2 = parseSRT(msg.content);
          subtitleLength = subtitles2.length;
        }
        if (!video) video = findVideo();
        if (!overlay) {
          overlay = createOverlay();
          attachOverlay();
        }
        startLoop();
        sendResponse({ ok: true, count: subtitleLength });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    } else if (msg.type === 'CLEAR_SRT') {
      subtitles = [];
      subtitles2 = [];
      if (overlay) overlay.style.display = 'none';
      sendResponse({ ok: true });
    } else if (msg.type === 'SET_OFFSET') {
      // Shift all subtitle times by `msg.seconds`
      subtitles = subtitles.map(s => ({
        ...s,
        start: Math.max(0, s.start + msg.seconds),
        end:   Math.max(0, s.end   + msg.seconds),
      }));
      subtitles2 = subtitles2.map(s => ({
        ...s,
        start: Math.max(0, s.start + msg.seconds),
        end:   Math.max(0, s.end   + msg.seconds),
      }));
      sendResponse({ ok: true });
    } else if (msg.type === 'PING') {
      sendResponse({ ok: true });
    }
  });
})();
