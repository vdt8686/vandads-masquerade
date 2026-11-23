(() => {
  "use strict";

  const CONFIG = window.MASQ_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isPhone = window.matchMedia("(max-width: 860px)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- Scroll-scrubbed film ---------- */
  const journey = $("top");
  const video = $("film");
  const bar = $("progress-bar");
  const topbar = document.querySelector(".topbar");
  const navButtons = Array.from(document.querySelectorAll(".chapters button"));
  const chapters = Array.from(journey.querySelectorAll(".chapter"));
  const floatRsvp = $("float-rsvp");
  const rsvpSection = $("rsvp");

  let duration = 15;
  let target = 0;
  let shown = 0;
  let ready = false;
  let running = false;
  let active = -1;
  let ticking = false;

  function progress() {
    const total = journey.offsetHeight - window.innerHeight;
    return total > 0 ? clamp(-journey.getBoundingClientRect().top / total) : 0;
  }

  function update() {
    ticking = false;
    const p = progress();
    target = p * duration;
    bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    const idx = Math.min(chapters.length - 1, Math.floor(p * chapters.length + 0.0001));
    if (idx !== active) {
      active = idx;
      navButtons.forEach((b, i) => (i === idx ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
    }
    const pastFilm = journey.getBoundingClientRect().bottom < window.innerHeight * 0.4;
    topbar.classList.toggle("is-hidden", pastFilm);
    const rsvpTop = rsvpSection.getBoundingClientRect().top;
    const footerTop = document.querySelector(".footer").getBoundingClientRect().top;
    floatRsvp.classList.toggle("is-hidden", p < 0.2 || (rsvpTop < window.innerHeight * 0.85 && footerTop > 0));
    if (ready && !running) { running = true; requestAnimationFrame(loop); }
  }

  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }

  function loop() {
    shown += (target - shown) * 0.2;
    if (Math.abs(target - shown) < 0.003) shown = target;
    if (!video.seeking && Math.abs(video.currentTime - shown) > 1 / 50) {
      try { video.currentTime = shown; } catch (e) { /* not seekable yet */ }
    }
    if (shown !== target || video.seeking) requestAnimationFrame(loop);
    else running = false;
  }

  function loadFilm() {
    if (reduceMotion) return;
    const url = isPhone ? video.dataset.phone : video.dataset.desktop;
    video.addEventListener("loadeddata", () => {
      if (isFinite(video.duration) && video.duration > 0) duration = video.duration - 0.05;
      ready = true;
      video.classList.add("is-ready");
      update();
    }, { once: true });
    const use = (src) => { video.src = src; video.load(); };
    // Pull the whole clip into memory so scrubbing both ways is instant.
    fetch(url, { mode: "cors" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => use(URL.createObjectURL(b)))
      .catch(() => use(url));
  }

  // iOS paints seeked frames only after one play() from a gesture.
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
      window.scrollTo({ top: journey.offsetTop + (total * (i + 0.05)) / chapters.length, behavior: reduceMotion ? "auto" : "smooth" });
    });
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
  if (document.readyState === "complete") loadFilm();
  else window.addEventListener("load", loadFilm, { once: true });

  /* ---------- Sound ---------- */
  const track = $("track");
  const soundBtn = $("sound");
  track.volume = 0.6;
  soundBtn.addEventListener("click", () => {
    const on = soundBtn.getAttribute("aria-pressed") !== "true";
    if (on) {
      const p = track.play();
      if (p && p.catch) p.catch(() => setSound(false));
    } else {
      track.pause();
    }
    setSound(on);
  });
  function setSound(on) {
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.querySelector(".sound__label").textContent = on ? "Sound on" : "Sound off";
  }

  /* ---------- Countdown ---------- */
  const MIDNIGHT = new Date(2027, 0, 1, 0, 0, 0).getTime();
  const cells = {};
  document.querySelectorAll("[data-unit]").forEach((el) => { cells[el.dataset.unit] = el; });
  const pad2 = (n) => String(n).padStart(2, "0");
  function tick() {
    const left = MIDNIGHT - Date.now();
    if (left <= 0) { $("countdown").hidden = true; $("count-done").hidden = false; return; }
    const s = Math.floor(left / 1000);
    cells.d.textContent = pad2(Math.floor(s / 86400));
    cells.h.textContent = pad2(Math.floor((s % 86400) / 3600));
    cells.m.textContent = pad2(Math.floor((s % 3600) / 60));
    cells.s.textContent = pad2(s % 60);
  }
  tick();
  setInterval(tick, 1000);

  /* ---------- Guest board ---------- */
  const endpoint = (CONFIG.rsvpEndpoint || "").trim();

  function li(text, cls) {
    const el = document.createElement("li");
    if (cls) el.className = cls;
    el.textContent = text;
    return el;
  }

  function renderBoard(d) {
    if (!d || !d.ok) return;
    $("going-count").textContent = String(d.going || 0);
    $("maybe-line").textContent = d.maybe ? ", " + d.maybe + " maybe" : "";
    const names = $("names");
    names.replaceChildren(...(d.names && d.names.length ? d.names.map((n) => li(n)) : [li("Nobody yet. Be first.", "names__empty")]));
    const songs = $("songs");
    songs.replaceChildren(...(d.songs && d.songs.length
      ? d.songs.map((s) => {
          const el = document.createElement("li");
          const wrap = document.createElement("div");
          const t = document.createElement("span"); t.className = "song"; t.textContent = s.song;
          wrap.append(t);
          if (s.by) { const b = document.createElement("span"); b.className = "by"; b.textContent = "from " + s.by; wrap.append(b); }
          el.append(wrap);
          return el;
        })
      : [li("Add a song with your RSVP.", "empty")]));
    const wall = $("wall");
    wall.replaceChildren(...(d.wall && d.wall.length
      ? d.wall.map((m) => {
          const el = document.createElement("li");
          const b = document.createElement("span"); b.className = "by"; b.textContent = m.by;
          const t = document.createElement("span"); t.textContent = m.text;
          el.append(b, t);
          return el;
        })
      : [li("Quiet so far.", "empty")]));
  }

  function loadBoard() {
    if (!endpoint) return;
    fetch(endpoint).then((r) => r.json()).then(renderBoard).catch(() => {});
  }
  loadBoard();
  setInterval(() => { if (document.visibilityState === "visible") loadBoard(); }, 45000);

  /* ---------- RSVP ---------- */
  const form = $("form");
  const plusWrap = $("plus-wrap");
  const statusValue = () => form.querySelector('input[name="status"]:checked').value;
  form.querySelectorAll('input[name="status"]').forEach((r) => r.addEventListener("change", () => {
    plusWrap.hidden = statusValue() === "no";
  }));

  let lastName = "";
  let lastStatus = "going";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("f-name").value.trim();
    if (!name) {
      $("name-error").hidden = false;
      $("f-name").setAttribute("aria-invalid", "true");
      $("f-name").focus();
      return;
    }
    $("name-error").hidden = true;
    $("f-name").removeAttribute("aria-invalid");
    const err = $("send-error");
    err.hidden = true;
    if (!endpoint) {
      err.textContent = "RSVPs open in a moment. Text Vandad for now.";
      err.hidden = false;
      return;
    }
    const status = statusValue();
    const payload = {
      name,
      status,
      plusOne: status !== "no" && $("f-plus").checked,
      song: $("f-song").value.trim(),
      message: $("f-msg").value.trim(),
      showName: $("f-show").checked,
      website: $("f-website").value,
    };
    const btn = $("send");
    btn.disabled = true;
    btn.textContent = "Sending...";
    try {
      // Plain text body keeps this a simple request that Apps Script accepts.
      const res = await fetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.ok) throw new Error("failed");
      renderBoard(data);
      lastName = name;
      lastStatus = status;
      showDone(name, status, data.updated);
    } catch (x) {
      err.textContent = "That didn't send. Try again in a sec.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Send RSVP";
    }
  });

  function showDone(name, status, updated) {
    const first = name.split(" ")[0];
    const titles = { going: "You're in, " + first + ".", maybe: "Noted, " + first + ".", no: "Next time, " + first + "." };
    const bodies = {
      going: "The location drops Dec 30. Make a story so people know.",
      maybe: "Lock it in when you know. Same name updates your RSVP.",
      no: "If plans change, come back and switch it.",
    };
    $("done-title").textContent = titles[status];
    $("done-body").textContent = (updated ? "Updated. " : "") + bodies[status];
    form.hidden = true;
    $("done").hidden = false;
    $("storycard").hidden = status === "no";
    if (status !== "no") drawStory(first, status);
    $("done").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  $("again").addEventListener("click", () => {
    $("done").hidden = true;
    form.hidden = false;
    $("f-name").focus();
  });

  /* ---------- Story card ---------- */
  const canvas = $("story-canvas");
  let storyBlob = null;
  const storyBg = new Image();
  storyBg.crossOrigin = "anonymous";

  function loadBg() {
    return new Promise((resolve) => {
      if (storyBg.complete && storyBg.naturalWidth) return resolve(true);
      storyBg.onload = () => resolve(true);
      storyBg.onerror = () => resolve(false);
      if (!storyBg.src) storyBg.src = CONFIG.storyBackground;
    });
  }

  async function drawStory(first, status) {
    const ctx = canvas.getContext("2d");
    const W = 1080, H = 1920;
    try { await Promise.all([document.fonts.load("600 120px Cinzel"), document.fonts.load("500 48px Outfit")]); } catch (e) { /* fallback fonts */ }
    const hasBg = await loadBg();
    ctx.fillStyle = "#0c1526";
    ctx.fillRect(0, 0, W, H);
    if (hasBg) ctx.drawImage(storyBg, 0, 0, W, H);
    let g = ctx.createLinearGradient(0, 0, 0, 640);
    g.addColorStop(0, "rgba(8,16,29,0.92)"); g.addColorStop(1, "rgba(8,16,29,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 640);
    g = ctx.createLinearGradient(0, H - 900, 0, H);
    g.addColorStop(0, "rgba(8,16,29,0)"); g.addColorStop(0.45, "rgba(8,16,29,0.85)"); g.addColorStop(1, "rgba(8,16,29,0.98)");
    ctx.fillStyle = g; ctx.fillRect(0, H - 900, W, 900);

    ctx.textAlign = "center";
    ctx.fillStyle = "#eef1f6";
    ctx.font = "600 64px Cinzel, Georgia, serif";
    ctx.fillText("VANDAD'S", W / 2, 230);
    ctx.font = "600 92px Cinzel, Georgia, serif";
    ctx.fillText("NEW YEAR'S", W / 2, 350);
    ctx.fillText("MASQUERADE", W / 2, 460);

    ctx.fillStyle = "#e35d7b";
    ctx.font = "600 150px Cinzel, Georgia, serif";
    ctx.fillText(status === "going" ? "I'M IN" : "MAYBE", W / 2, H - 520);
    ctx.fillStyle = "#eef1f6";
    ctx.font = "500 60px Outfit, sans-serif";
    ctx.fillText(first, W / 2, H - 410);
    ctx.fillStyle = "#c9d1dd";
    ctx.font = "500 40px Outfit, sans-serif";
    ctx.fillText("DEC 31   MASKS ON TILL MIDNIGHT", W / 2, H - 300);
    ctx.fillStyle = "#a9b4c6";
    ctx.font = "400 34px Outfit, sans-serif";
    ctx.fillText(location.host + location.pathname.replace(/\/$/, ""), W / 2, H - 200);

    storyBlob = await new Promise((resolve) => {
      try { canvas.toBlob((b) => resolve(b), "image/png"); } catch (e) { resolve(null); }
    });
  }

  function saveStory() {
    if (!storyBlob) return;
    const url = URL.createObjectURL(storyBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vandads-masquerade-story.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  $("share-story").addEventListener("click", async () => {
    if (!storyBlob) return;
    const file = new File([storyBlob], "vandads-masquerade.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    saveStory();
  });
  $("save-story").addEventListener("click", saveStory);

  /* ---------- Calendar ---------- */
  $("ics").addEventListener("click", () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vandad//Masquerade//EN",
      "BEGIN:VEVENT", "UID:vandads-masquerade-2026@invite", "DTSTAMP:" + stamp,
      "DTSTART:20261231T210000", "DTEND:20270101T030000",
      "SUMMARY:Vandad's New Year's Masquerade",
      "DESCRIPTION:Masks on till midnight. Location drops Dec 30. " + location.href.split("#")[0],
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Find your mask.", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "vandads-masquerade.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
})();
