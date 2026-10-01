// Blank DTM practice: draw the demographic transition chart and fill in its text from memory.
// The page has three kinds of things to do:
//   - text blanks (.bd-blank with data-answer), checked word for word;
//   - drawing on the chart (one canvas, pen = birth rate, death rate or total population), scored
//     against the model's curves;
//   - drawing the five population pyramids (one canvas per stage), compared by eye with the key.
// Everything is kept in localStorage under the page's data-store. Turbo swaps <main> without a
// reload, so setup runs on turbo:load, looks elements up fresh, and marks a page done with a JS
// property (a Back/Forward clone keeps attributes but drops listeners and properties).

(function () {
  if (window.__dtmInit) return;
  window.__dtmInit = true;

  // ---------- the model, in chart units: x = 0..5 (one unit per stage), y = per 1,000 ----------
  const CURVES = {
    birth: [[0, 40], [1, 40], [1.4, 39.9], [1.7, 39.5], [2, 39], [2.3, 37.5], [2.6, 34], [2.85, 29], [3, 24.5],
      [3.2, 18], [3.4, 13.5], [3.6, 11.3], [3.8, 10.4], [4, 10]],
    death: [[0, 39], [1, 38.8], [1.15, 37.5], [1.3, 34.5], [1.5, 29], [1.75, 22.5], [2, 15.7], [2.2, 12.3], [2.4, 10.9],
      [2.7, 10.4], [3, 10.15], [4, 10], [5, 10]],
    pop: [[0, 8.1], [0.6, 8.2], [1, 9], [1.2, 10.5], [1.4, 13.5], [1.75, 20.5], [2, 25.8], [2.3, 30.5], [2.6, 34], [3, 37.8],
      [3.5, 40.2], [4, 41.5]],
  };
  // Stage 5 is "yet to be seen": either branch counts.
  const BRANCHES = {
    birth: [[[4, 10], [4.5, 10.8], [5, 13]], [[4, 10], [4.5, 9], [5, 6.7]]],
    death: [],
    pop: [[[4, 41.5], [4.5, 42.9], [5, 44.4]], [[4, 41.5], [4.5, 40.1], [5, 38.6]]],
  };
  const NAMES = { birth: "Birth rate", death: "Death rate", pop: "Total population" };
  const PEN_NAMES = { birth: "Green", death: "Purple", pop: "Blue" };

  // Chart geometry in SVG/viewBox units (1000 × 440).
  const X0 = 110, X1 = 990, Y0 = 420, PER = 9.3;
  const px = (x) => X0 + x * (X1 - X0) / 5;
  const py = (v) => Y0 - v * PER;
  const ux = (p) => (p - X0) * 5 / (X1 - X0);
  const uy = (p) => (Y0 - p) / PER;

  // Monotone cubic interpolation (Fritsch-Carlson), so the curves never overshoot.
  function spline(pts) {
    const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const d = [], m = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }
  const F = {}, FB = {};
  Object.keys(CURVES).forEach((k) => {
    F[k] = spline(CURVES[k]);
    FB[k] = BRANCHES[k].map(spline);
  });
  // Where each curve is defined: birth and population split into branches after stage 4.
  const END = { birth: 4, death: 5, pop: 4 };

  function pathOf(f, a, b) {
    let s = "";
    for (let x = a; x <= b + 1e-9; x += 0.02) s += (s ? "L" : "M") + px(x).toFixed(1) + " " + py(f(x)).toFixed(1);
    return s;
  }

  // ---------- storage ----------
  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  // ---------- text blanks ----------
  function norm(s, exactCase) {
    s = (s || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");
    s = s.replace(/[(),.]/g, " ").replace(/\s+/g, " ").trim();
    return exactCase ? s : s.toLowerCase();
  }

  // ---------- drawing ----------
  function color(page, name) { return getComputedStyle(page).getPropertyValue(name).trim() || "#888"; }
  const PEN = { birth: "--bd-birth", death: "--bd-death", pop: "--bd-pop", ink: "--bd-ink" };

  function render(page, canvas) {
    const box = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const vw = Number(canvas.dataset.vw), vh = Number(canvas.dataset.vh);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(w / vw, 0, 0, h / vh, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const strokes = page._dtm.state.strokes[canvas.dataset.surface] || [];
    strokes.forEach((s) => {
      if (s.pts.length < 1) return;
      ctx.strokeStyle = color(page, PEN[s.pen] || PEN.ink);
      ctx.lineWidth = Number(canvas.dataset.width) || 3;
      ctx.beginPath();
      ctx.moveTo(s.pts[0][0], s.pts[0][1]);
      s.pts.forEach((p) => ctx.lineTo(p[0], p[1]));
      if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.01, s.pts[0][1]);
      ctx.stroke();
    });
  }
  function renderAll(page) { page.querySelectorAll("canvas.bd-draw").forEach((c) => render(page, c)); }

  // The eraser removes whole strokes it touches. A drag removes as many as it crosses, and the
  // whole drag is one undo step: history holds { surface, removed: [[index, stroke], ...] }.
  // A plain string in history is the surface a stroke was added to.
  function eraseAt(page, canvas, e, removed) {
    const r = canvas.getBoundingClientRect();
    const sx = r.width / Number(canvas.dataset.vw), sy = r.height / Number(canvas.dataset.vh);
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const reach = e.pointerType === "mouse" ? 9 : 16;
    const strokes = page._dtm.state.strokes[canvas.dataset.surface] || [];
    function near(a, b) {
      const ax = a[0] * sx, ay = a[1] * sy, bx = b[0] * sx, by = b[1] * sy;
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= reach;
    }
    let hit = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const pts = strokes[i].pts;
      const touched = pts.length === 1 ? near(pts[0], pts[0]) : pts.some((q, k) => k > 0 && near(pts[k - 1], q));
      if (touched) { removed.push([i, strokes[i]]); strokes.splice(i, 1); hit = true; }
    }
    if (hit) render(page, canvas);
  }

  function bindCanvas(page, canvas) {
    let cur = null, erasing = null;
    function point(e) {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * Number(canvas.dataset.vw) / r.width, (e.clientY - r.top) * Number(canvas.dataset.vh) / r.height];
    }
    canvas.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button > 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const surface = canvas.dataset.surface;
      if (page._dtm.tool === "erase") { erasing = []; eraseAt(page, canvas, e, erasing); return; }
      const pen = surface === "chart" ? page._dtm.state.pen : "ink";
      cur = { pen: pen, pts: [point(e)] };
      const st = page._dtm.state;
      (st.strokes[surface] = st.strokes[surface] || []).push(cur);
      st.history.push(surface);
      render(page, canvas);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (erasing) { eraseAt(page, canvas, e, erasing); return; }
      if (!cur) return;
      const p = point(e), last = cur.pts[cur.pts.length - 1];
      if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 1.2) return;
      cur.pts.push(p);
      render(page, canvas);
    });
    function end() {
      if (erasing) {
        if (erasing.length) { page._dtm.state.history.push({ surface: canvas.dataset.surface, removed: erasing }); persist(page); clearDrawScore(page); }
        erasing = null;
        return;
      }
      if (!cur) return;
      cur = null;
      persist(page);
      clearDrawScore(page);
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  // Score the strokes drawn with one pen against one of the model's lines: how much of the chart it covers, and how far it sits from the model.
  function scoreLine(page, pen, key) {
    const strokes = (page._dtm.state.strokes.chart || []).filter((s) => s.pen === pen);
    const bins = 100, sums = new Array(bins).fill(0), counts = new Array(bins).fill(0);
    // Fill in between recorded points, so a quick swipe (few pointer events) still covers the
    // stretch of chart it crossed.
    function add(x, y) {
      if (x < 0 || x > 5) return;
      const b = Math.min(bins - 1, Math.floor(x / 5 * bins));
      sums[b] += y; counts[b]++;
    }
    strokes.forEach((s) => s.pts.forEach((p, i) => {
      const x = ux(p[0]), y = uy(p[1]);
      if (i === 0) { add(x, y); return; }
      const qx = ux(s.pts[i - 1][0]), qy = uy(s.pts[i - 1][1]);
      const steps = Math.max(1, Math.ceil(Math.abs(x - qx) / 0.02));
      for (let k = 1; k <= steps; k++) add(qx + (x - qx) * k / steps, qy + (y - qy) * k / steps);
    }));
    let covered = 0, err = 0;
    for (let b = 0; b < bins; b++) {
      if (!counts[b]) continue;
      const x = (b + 0.5) * 5 / bins, y = sums[b] / counts[b];
      let target = [];
      if (x <= END[key]) target = [F[key](x)];
      else target = FB[key].map((f) => f(x));
      if (!target.length) target = [F[key](x)];
      err += Math.min.apply(null, target.map((t) => Math.abs(t - y)));
      covered++;
    }
    if (!covered) return null;
    const meanErr = err / covered, coverage = covered / bins;
    return { score: Math.round(100 * coverage * Math.max(0, 1 - meanErr / 10)), coverage: Math.round(coverage * 100), err: meanErr };
  }

  // ---------- state ----------
  function persist(page) { save(page.dataset.store, page._dtm.state); }

  function readInputs(page) {
    const vals = {};
    page.querySelectorAll(".bd-blank").forEach((b) => { vals[b.dataset.id] = b.querySelector("input, textarea").value; });
    page._dtm.state.text = vals;
  }

  function applyMode(page) {
    const mode = page._dtm.state.mode;
    page.dataset.mode = mode;
    page.querySelectorAll("[data-bd-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.bdMode === mode)));
    const erase = page._dtm.tool === "erase";
    page.dataset.tool = erase ? "erase" : "pen";
    page.querySelectorAll("[data-bd-pen]").forEach((b) => b.setAttribute("aria-pressed", String(!erase && b.dataset.bdPen === page._dtm.state.pen)));
    page.querySelectorAll("[data-bd-tool='erase']").forEach((b) => b.setAttribute("aria-pressed", String(erase)));
    page.querySelector("[data-bd='exact']").checked = !!page._dtm.state.exact;
  }

  function isActive(page, blank) {
    const mode = page._dtm.state.mode, kind = blank.dataset.kind;
    if (mode === "all") return true;
    if (mode === "test") return kind === "cell" || kind === "line"; // as on the test
    return kind === "cell"; // "easy": the lines and their labels are given
  }

  function clearMarks(page) {
    page.querySelectorAll(".bd-blank").forEach((b) => b.classList.remove("ok", "bad"));
    const out = page.querySelector(".bd-text-score"); if (out) out.textContent = "";
  }
  function clearDrawScore(page) { const out = page.querySelector(".bd-draw-score"); if (out) out.textContent = ""; }

  function checkText(page) {
    const exact = !!page._dtm.state.exact;
    let right = 0, total = 0;
    page.querySelectorAll(".bd-blank").forEach((b) => {
      b.classList.remove("ok", "bad");
      if (!isActive(page, b)) return;
      total++;
      const v = b.querySelector("input, textarea").value;
      const good = norm(v, exact) === norm(b.dataset.answer, exact);
      b.classList.add(good ? "ok" : "bad");
      if (good) right++;
    });
    page.querySelector(".bd-text-score").textContent = "Text: " + right + " of " + total + " right" +
      (right === total ? ". Every blank word for word." : ". Red boxes are off; tap Show answers to compare.");
  }

  // The pens aren't labeled (naming them would give the lines away), so any color can be any line.
  // Each color is matched to the model line it fits, trying every one-to-one pairing and keeping
  // the best total.
  const LINES = ["birth", "death", "pop"];
  const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  function checkDrawing(page) {
    const fit = LINES.map((pen) => LINES.map((key) => scoreLine(page, pen, key)));
    let best = null, bestSum = -1;
    PERMS.forEach((perm) => {
      const sum = LINES.reduce((t, pen, i) => t + (fit[i][perm[i]] ? fit[i][perm[i]].score + 1 : 0), 0);
      if (sum > bestSum) { bestSum = sum; best = perm; }
    });
    const parts = [], matched = {};
    LINES.forEach((pen, i) => {
      const r = fit[i][best[i]];
      if (!r) return;
      matched[LINES[best[i]]] = true;
      parts.push(PEN_NAMES[pen] + " line looks like the " + NAMES[LINES[best[i]]].toLowerCase() + ": " + r.score + "% match (covers " + r.coverage +
        "% of the chart, off by about " + r.err.toFixed(1) + " on average)");
    });
    LINES.forEach((key) => { if (!matched[key]) parts.push(NAMES[key] + ": not drawn yet"); });
    page.querySelector(".bd-draw-score").textContent = parts.join(" · ");
  }

  function setup() {
    document.querySelectorAll(".bd-page").forEach(function (page) {
      if (page._dtm) { renderAll(page); return; }
      const saved = load(page.dataset.store) || {};
      // Version 3: "Like the test" (draw the lines, label them, fill the table) is the default.
      page._dtm = { state: { v: 3, mode: saved.v === 3 && saved.mode ? saved.mode : "test", pen: saved.pen || "birth", exact: !!saved.exact,
        text: saved.text || {}, strokes: saved.strokes || {}, history: saved.history || [] }, tool: "pen" };

      // the model's curves, drawn once into the hidden key layer
      const key = page.querySelector(".bd-key");
      const area = (f, a, b) => {
        let top = "", bottom = "";
        for (let x = a; x <= b + 1e-9; x += 0.02) {
          top += (top ? "L" : "M") + px(x).toFixed(1) + " " + py(F.birth(x)).toFixed(1);
          bottom = "L" + px(x).toFixed(1) + " " + py(F.death(x)).toFixed(1) + bottom;
        }
        return top + bottom + "Z";
      };
      let popArea = pathOf(F.pop, 0, 4) + "L" + px(4) + " " + Y0 + "L" + px(0) + " " + Y0 + "Z";
      key.innerHTML =
        '<path class="bd-k-popfill" d="' + popArea + '"/>' +
        '<path class="bd-k-ni" d="' + area(null, 0.9, 4) + '"/>' +
        '<path class="bd-k-line pop" d="' + pathOf(F.pop, 0, 4) + '"/>' +
        FB.pop.map((f) => '<path class="bd-k-line pop branch" d="' + pathOf(f, 4, 5) + '"/>').join("") +
        '<path class="bd-k-line death" d="' + pathOf(F.death, 0, 5) + '"/>' +
        '<path class="bd-k-line birth" d="' + pathOf(F.birth, 0, 4) + '"/>' +
        FB.birth.map((f) => '<path class="bd-k-line birth branch" d="' + pathOf(f, 4, 5) + '"/>').join("") +
        [[44.4], [38.6], [13], [6.7]].map((v) => '<text class="bd-k-q" x="' + (px(5) + 4) + '" y="' + (py(v[0]) + 5) + '">?</text>').join("");

      // restore text
      page.querySelectorAll(".bd-blank").forEach((b) => {
        const el = b.querySelector("input, textarea");
        if (page._dtm.state.text[b.dataset.id] !== undefined) el.value = page._dtm.state.text[b.dataset.id];
        el.addEventListener("input", function () { readInputs(page); b.classList.remove("ok", "bad"); persist(page); });
      });

      page.querySelectorAll("canvas.bd-draw").forEach((c) => bindCanvas(page, c));
      applyMode(page);
      renderAll(page);
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(function () { renderAll(page); });
        page.querySelectorAll("canvas.bd-draw").forEach((c) => ro.observe(c));
      }
    });
  }

  document.addEventListener("click", function (e) {
    const page = e.target.closest && e.target.closest(".bd-page");
    if (!page || !page._dtm) return;
    const st = page._dtm.state;
    const mode = e.target.closest("[data-bd-mode]");
    if (mode) { st.mode = mode.dataset.bdMode; applyMode(page); clearMarks(page); persist(page); return; }
    const pen = e.target.closest("[data-bd-pen]");
    if (pen) { st.pen = pen.dataset.bdPen; page._dtm.tool = "pen"; applyMode(page); persist(page); return; }
    if (e.target.closest("[data-bd-tool='erase']")) { page._dtm.tool = page._dtm.tool === "erase" ? "pen" : "erase"; applyMode(page); return; }
    const act = e.target.closest("[data-bd]");
    if (!act) return;
    const what = act.dataset.bd;
    if (what === "check") { checkText(page); if (st.mode === "easy") clearDrawScore(page); else checkDrawing(page); }
    else if (what === "key") {
      const on = !page.classList.contains("bd-show");
      page.classList.toggle("bd-show", on);
      act.setAttribute("aria-pressed", String(on));
      act.textContent = on ? "Hide answers" : "Show answers";
    }
    else if (what === "undo") {
      const step = st.history.pop();
      if (typeof step === "string") { if (st.strokes[step]) st.strokes[step].pop(); }
      else if (step && step.removed) {
        const list = (st.strokes[step.surface] = st.strokes[step.surface] || []);
        for (let i = step.removed.length - 1; i >= 0; i--) list.splice(step.removed[i][0], 0, step.removed[i][1]);
      }
      renderAll(page); persist(page); clearDrawScore(page);
    }
    else if (what === "clear-draw" || what === "clear-text" || what === "clear-all") {
      const ask = {
        "clear-draw": { title: "Erase your drawing?", text: "Every line and pyramid you've drawn will be erased.", ok: "Erase" },
        "clear-text": { title: "Clear every blank?", text: "Everything you've typed will be erased.", ok: "Clear" },
        "clear-all": { title: "Start over?", text: "Everything you've drawn and typed will be erased, and the answers will be hidden.", ok: "Clear all" },
      }[what];
      window.siteConfirm({ title: ask.title, text: ask.text, ok: ask.ok, cancel: "Keep it", danger: true }).then(function (yes) {
        if (!yes) return;
        if (what !== "clear-text") { st.strokes = {}; st.history = []; renderAll(page); clearDrawScore(page); }
        if (what !== "clear-draw") { page.querySelectorAll(".bd-blank input, .bd-blank textarea").forEach((el) => { el.value = ""; }); st.text = {}; clearMarks(page); }
        if (what === "clear-all") {
          page.classList.remove("bd-show");
          const key = page.querySelector('[data-bd="key"]');
          if (key) { key.setAttribute("aria-pressed", "false"); key.textContent = "Show answers"; }
        }
        persist(page);
      });
    }
  });
  document.addEventListener("change", function (e) {
    if (!e.target.matches || !e.target.matches("[data-bd='exact']")) return;
    const page = e.target.closest(".bd-page");
    page._dtm.state.exact = e.target.checked; clearMarks(page); persist(page);
  });
  addEventListener("tjd:themechange", function () { document.querySelectorAll(".bd-page").forEach((p) => p._dtm && renderAll(p)); });

  document.addEventListener("DOMContentLoaded", setup);
  document.addEventListener("turbo:load", setup);
})();
