(() => {
  "use strict";

  const CONFIG = window.MASQ_CONFIG || {};
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- Scroll-scrubbed film ---------- */
  const journey = document.getElementById("top");
  const video = document.getElementById("film");
  const bar = document.getElementById("progress-bar");
  const nav = document.querySelector(".chapters");
  const navButtons = Array.from(nav.querySelectorAll("button[data-go]"));
  const chapters = Array.from(journey.querySelectorAll(".chapter"));
  const isMobile = window.matchMedia("(max-width: 860px), (hover: none) and (pointer: coarse)").matches;

  let duration = 15;
  let target = 0;
  let shown = 0;
  let ready = false;
  let running = false;
  let active = -1;

  function journeyProgress() {
    const rect = journey.getBoundingClientRect();
    const total = journey.offsetHeight - window.innerHeight;
    return total > 0 ? clamp(-rect.top / total) : 0;
  }

  function onScroll() {
    const p = journeyProgress();
    target = p * duration;
    bar.style.transform = `scaleX(${p.toFixed(4)})`;
    const idx = Math.min(chapters.length - 1, Math.floor(p * chapters.length + 0.0001));
    if (idx !== active) {
      active = idx;
      navButtons.forEach((b, i) => {
        if (i === idx) b.setAttribute("aria-current", "step");
        else b.removeAttribute("aria-current");
      });
    }
    const pastJourney = journey.getBoundingClientRect().bottom < window.innerHeight * 0.5;
    nav.classList.toggle("is-hidden", pastJourney);
    if (ready && !running) startLoop();
  }

  function loop() {
    if (!ready) { running = false; return; }
    shown += (target - shown) * 0.18;
    if (Math.abs(target - shown) < 0.002) shown = target;
    if (!video.seeking && Math.abs(video.currentTime - shown) > 1 / 60) {
      try { video.currentTime = shown; } catch (e) { /* not seekable yet */ }
    }
    if (Math.abs(target - shown) > 0.001 || video.seeking) {
      requestAnimationFrame(loop);
    } else {
      running = false;
    }
  }

  function startLoop() {
    running = true;
    requestAnimationFrame(loop);
  }

  function setSource(url) {
    video.src = url;
    video.load();
  }

  function loadFilm() {
    if (isMobile && video.dataset.mobilePoster) video.poster = video.dataset.mobilePoster;
    if (reduceMotion) return; // poster only, no video download
    const url = isMobile ? video.dataset.mobile : video.dataset.desktop;
    video.addEventListener("loadedmetadata", () => {
      if (isFinite(video.duration) && video.duration > 0) duration = video.duration - 0.05;
      ready = true;
      onScroll();
    }, { once: true });
    // Download the whole clip first so scrubbing back and forth is instant.
    fetch(url, { mode: "cors" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((blob) => setSource(URL.createObjectURL(blob)))
      .catch(() => setSource(url));
  }

  // iOS only paints frames after the video has played once.
  function prime() {
    const p = video.play();
    if (p && p.then) p.then(() => video.pause()).catch(() => {});
    window.removeEventListener("touchstart", prime);
  }
  window.addEventListener("touchstart", prime, { passive: true });

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.go);
      const total = journey.offsetHeight - window.innerHeight;
      const y = journey.offsetTop + (total * (i + 0.02)) / chapters.length;
      window.scrollTo({ top: y, behavior: reduceMotion ? "auto" : "smooth" });
    });
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
  loadFilm();

  /* ---------- Countdown to midnight ---------- */
  const MIDNIGHT = new Date(2027, 0, 1, 0, 0, 0).getTime();
  const countEl = document.getElementById("countdown");
  const doneEl = document.getElementById("count-done");
  const cells = {};
  countEl.querySelectorAll("[data-unit]").forEach((el) => { cells[el.dataset.unit] = el; });
  const pad = (n) => String(n).padStart(2, "0");
  function tick() {
    const left = MIDNIGHT - Date.now();
    if (left <= 0) {
      countEl.hidden = true;
      doneEl.hidden = false;
      return;
    }
    const s = Math.floor(left / 1000);
    cells.d.textContent = pad(Math.floor(s / 86400));
    cells.h.textContent = pad(Math.floor((s % 86400) / 3600));
    cells.m.textContent = pad(Math.floor((s % 3600) / 60));
    cells.s.textContent = pad(s % 60);
  }
  tick();
  setInterval(tick, 1000);

  /* ---------- Calendar ---------- */
  const EVENT = {
    title: "Vandad's New Year's Masquerade",
    details: "A masked ball to see out 2026. Black tie and a mask. The address is sent privately once you reply. " + window.location.href.split("#")[0],
    start: "20261231T200000",
    end: "20270101T020000",
  };
  document.getElementById("gcal").href =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent(EVENT.title) +
    "&dates=" + EVENT.start + "/" + EVENT.end +
    "&details=" + encodeURIComponent(EVENT.details);

  document.getElementById("ics").addEventListener("click", () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const esc = (t) => t.replace(/([,;\\])/g, "\\$1");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vandad//Masquerade//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT", "UID:vandads-masquerade-2026@invite", "DTSTAMP:" + stamp,
      "DTSTART:" + EVENT.start, "DTEND:" + EVENT.end,
      "SUMMARY:" + esc(EVENT.title), "DESCRIPTION:" + esc(EVENT.details),
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Masquerade tomorrow. Find your mask.", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "vandads-masquerade.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  /* ---------- RSVP ---------- */
  const endpoint = (CONFIG.rsvpEndpoint || "").trim();
  const form = document.getElementById("rsvp");
  const nameInput = document.getElementById("rsvp-name");
  const nameError = document.getElementById("name-error");
  const partyField = document.getElementById("party-field");
  const partySelect = document.getElementById("rsvp-party");
  const noteInput = document.getElementById("rsvp-note");
  const trapInput = document.getElementById("rsvp-website");
  const sendBtn = document.getElementById("send");
  const sendError = document.getElementById("send-error");
  const done = document.getElementById("done");
  const headcount = document.getElementById("headcount");

  function showCount(n) {
    headcount.textContent = "";
    if (typeof n !== "number" || n <= 0) {
      headcount.textContent = "Be the first mask on the list.";
      return;
    }
    const strong = document.createElement("strong");
    strong.textContent = String(n);
    headcount.append(strong, n === 1 ? " guest has said yes so far." : " guests have said yes so far.");
  }

  if (endpoint) {
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => showCount(d.guests))
      .catch(() => showCount(0));
  } else {
    showCount(0);
  }

  form.querySelectorAll('input[name="attending"]').forEach((r) => {
    r.addEventListener("change", () => {
      partyField.hidden = !document.getElementById("rsvp-yes").checked;
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameError.hidden = false;
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.focus();
      return;
    }
    nameError.hidden = true;
    nameInput.removeAttribute("aria-invalid");
    sendError.hidden = true;

    if (!endpoint) {
      sendError.textContent = "Replies aren't switched on yet. Message Vandad directly for now.";
      sendError.hidden = false;
      return;
    }

    const attending = document.getElementById("rsvp-yes").checked;
    const payload = {
      name,
      attending,
      party: attending ? Number(partySelect.value) : 0,
      note: noteInput.value.trim(),
      website: trapInput.value,
    };

    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";
    try {
      // text/plain keeps this a simple request, which Google Apps Script accepts without CORS preflight.
      const res = await fetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "failed");
      if (typeof data.guests === "number") showCount(data.guests);
      const first = name.split(" ")[0];
      document.getElementById("done-title").textContent = attending ? `See you at midnight, ${first}.` : `We'll miss you, ${first}.`;
      document.getElementById("done-body").textContent = attending
        ? `Your reply is ${data.updated ? "updated" : "in"}. Vandad will send you the address privately before the night.`
        : `Your reply is ${data.updated ? "updated" : "in"}. If plans change, come back and reply again.`;
      form.hidden = true;
      done.hidden = false;
    } catch (err) {
      sendError.textContent = "That didn't go through. Please try again in a moment.";
      sendError.hidden = false;
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send reply";
    }
  });

  document.getElementById("again").addEventListener("click", () => {
    done.hidden = true;
    form.hidden = false;
    nameInput.focus();
  });
})();
