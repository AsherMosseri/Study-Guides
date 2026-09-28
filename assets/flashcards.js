// Flashcards: one card at a time. Tap (or Space) flips it; swipe or press → / ← to sort it into
// "Got it" or "Review"; "Explain it" (or E) opens the reading guide's own note on that fact.
//
// Storage, all in this browser only:
//   data-store  (localStorage)   each card's last mark, "got" or "review"; the options page
//                                reads it for its progress line
//   data-srs    (localStorage)   spaced repetition: each card's box and when it's next due
//   "fcdeck:" + store (sessionStorage)   the deck in progress, so leaving for the reading and
//                                coming back lands on the same card, flipped the same way
//
// Turbo: listeners are added once on the document. A page restored by Back/Forward is a clone,
// so the deck also lives in data-state (an attribute survives the clone; a JS property would
// not), and everything is redrawn on every turbo:load.

(function () {
  if (window.__fcInit) return;
  window.__fcInit = true;

  const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";
  const THROW = "cubic-bezier(.45,0,.8,.3)";
  const SPRING = "cubic-bezier(.2,1.5,.4,1)";

  // Spaced repetition (Leitner boxes). "Got it" moves a card up a box and schedules it that many
  // days out; "Review" drops it to box 0 and brings it back REQUEUE_GAP cards later this session.
  const DAY = 24 * 60 * 60 * 1000;
  const BOX_DAYS = [0, 1, 3, 7, 14, 30];
  const REQUEUE_GAP = 4;

  function calm() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function play(el, frames, ms, easing) {
    if (!el.animate) return null;
    return el.animate(frames, { duration: calm() ? 0 : ms, easing: easing });
  }

  function load(key, store) {
    try { return JSON.parse((store || localStorage).getItem(key)) || {}; } catch (err) { return {}; }
  }
  function save(key, value, store) {
    try { (store || localStorage).setItem(key, JSON.stringify(value)); } catch (err) { /* storage unavailable */ }
  }

  // One-time carry-over from the old tick-box lists (data-legacy names their keys): a ticked
  // box marks every card that grew out of it as "got". Skipped once the new key exists, which
  // is why "Clear all marks" saves {} rather than removing the key.
  function migrate(page) {
    const key = page.dataset.store;
    try { if (localStorage.getItem(key) === null) migrateTicks(page, key); } catch (err) { return; }
    // Cards marked before spaced repetition existed get a schedule: known ones are due
    // tomorrow, ones to review are due now.
    const marks = load(key), srs = load(page.dataset.srs);
    let changed = false;
    Object.keys(marks).forEach(function (id) {
      if (srs[id]) return;
      srs[id] = marks[id] === "got" ? { b: 1, d: Date.now() + DAY } : { b: 0, d: 0 };
      changed = true;
    });
    if (changed) save(page.dataset.srs, srs);
  }
  function migrateTicks(page, key) {
    const ticked = {};
    (page.dataset.legacy || "").split(/\s+/).filter(Boolean).forEach(function (k) {
      const old = load(k);
      Object.keys(old).forEach(function (id) { if (old[id]) ticked[id] = true; });
    });
    if (!Object.keys(ticked).length) return;
    const marks = {};
    page.querySelectorAll(".fc-item[data-legacy]").forEach(function (it) {
      if (ticked[it.dataset.legacy]) marks[it.id] = "got";
    });
    save(key, marks);
  }

  function isDue(srs, id, now) { return !srs[id] || srs[id].d <= now; }

  function getState(page) {
    try { return JSON.parse(page.dataset.state || "null"); } catch (err) { return null; }
  }
  function setState(page, s) {
    page.dataset.state = JSON.stringify(s);
    save("fcdeck:" + page.dataset.store, s, sessionStorage);
  }
  function savedDeck(page) {
    const s = load("fcdeck:" + page.dataset.store, sessionStorage);
    return s.order ? s : null;
  }

  function inSection(it, section) {
    if (!section) return true;
    const sec = it.closest("[data-sec]");
    return sec.dataset.sec === section || sec.dataset.part === section;
  }
  function inFocus(it, focus) { return !focus || focus === "all" || it.dataset.focus === focus; }
  function markOf(marks, id) { return marks[id] === "got" || marks[id] === "review" ? marks[id] : "none"; }

  // Press one button of a group and release the others.
  function pick(page, selector, value) {
    page.querySelectorAll(selector).forEach(function (b) {
      const v = b.dataset.deck || b.dataset.focusPick;
      b.setAttribute("aria-pressed", String(v === value));
    });
  }

  // Read the controls into options, or write options back into them.
  function readOpts(page) {
    const deck = page.querySelector("[data-deck][aria-pressed='true']");
    const focus = page.querySelector("[data-focus-pick][aria-pressed='true']");
    return {
      section: page.querySelector(".fc-section").value,
      focus: focus ? focus.dataset.focusPick : "all",
      deck: deck ? deck.dataset.deck : "due",
      shuffle: page.querySelector("[data-fc='shuffle']").getAttribute("aria-pressed") === "true",
    };
  }
  function writeOpts(page, o) {
    const sel = page.querySelector(".fc-section");
    sel.value = o.section;
    if (sel.value !== o.section) sel.value = "";
    pick(page, "[data-deck]", o.deck || "due");
    pick(page, "[data-focus-pick]", o.focus || "all");
    page.querySelector("[data-fc='shuffle']").setAttribute("aria-pressed", String(!!o.shuffle));
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function build(page) {
    const o = readOpts(page);
    const marks = load(page.dataset.store);
    const srs = load(page.dataset.srs);
    const now = Date.now();
    let seen = [], fresh = [];
    page.querySelectorAll(".fc-item").forEach(function (it) {
      if (!inSection(it, o.section) || !inFocus(it, o.focus)) return;
      if (o.deck === "due") {
        if (isDue(srs, it.id, now)) (srs[it.id] ? seen : fresh).push(it.id);
      } else if (o.deck === "all" || o.deck === markOf(marks, it.id)) {
        seen.push(it.id);
      }
    });
    // The Due deck goes over cards you've seen before (the ones slipping away) before new ones.
    if (o.shuffle) { shuffle(seen); shuffle(fresh); }
    const s = { opts: o, order: seen.concat(fresh), index: 0, flipped: false, history: [], got: 0, review: 0 };
    setState(page, s);
    return s;
  }

  function setFlipped(card, flipped, animate) {
    if (!animate) card.classList.add("no-anim");
    card.classList.toggle("is-flipped", flipped);
    card.querySelector(".fc-front").setAttribute("aria-hidden", String(flipped));
    card.querySelector(".fc-back").setAttribute("aria-hidden", String(!flipped));
    if (!animate) { void card.offsetWidth; card.classList.remove("no-anim"); }
  }

  // "in 5 hours", "tomorrow", "in 3 days"
  function whenText(ms) {
    const h = Math.max(1, Math.round(ms / 3600000));
    if (h < 20) return "in " + h + (h === 1 ? " hour" : " hours");
    const d = Math.round(ms / DAY);
    return d <= 1 ? "tomorrow" : "in " + d + " days";
  }

  // Link to the card's spot in the reading, marked so the reading shows "Back to flashcards".
  function readingHref(href) {
    const i = href.indexOf("#");
    return i < 0 ? href + "?from=flashcards" : href.slice(0, i) + "?from=flashcards" + href.slice(i);
  }

  // Draw the page from the state: the current card, progress, counts and the end screen.
  function draw(page, s) {
    const card = page.querySelector(".fc-card");
    const done = page.querySelector(".fc-done");
    const total = s.order.length;
    const finished = s.index >= total;
    const left = total - s.index;
    const marks = load(page.dataset.store);
    const srs = load(page.dataset.srs);
    const now = Date.now();

    card.hidden = finished;
    card.style.transform = "";
    card.querySelectorAll(".fc-stamp").forEach(function (st) { st.style.opacity = ""; });
    page.querySelector(".fc-ghost.g1").hidden = left < 2;
    page.querySelector(".fc-ghost.g2").hidden = left < 3;
    done.hidden = !finished;
    page.querySelectorAll("[data-fc='got'], [data-fc='review'], [data-fc='flip']").forEach(function (b) { b.disabled = finished; });
    page.querySelector("[data-fc='undo']").disabled = !s.history.length;

    if (!finished) {
      const it = document.getElementById(s.order[s.index]);
      card.querySelector(".fc-sec").textContent = it.closest("[data-sec]").dataset.title;
      const kind = card.querySelector(".fc-kind");
      kind.textContent = it.dataset.focus === "ap" ? "AP concept" : "Reading detail";
      kind.className = "fc-kind " + it.dataset.focus;
      card.querySelector(".fc-q").innerHTML = it.querySelector(".q").innerHTML;
      card.querySelector(".fc-a").innerHTML = it.querySelector(".a").innerHTML;
      card.querySelector(".fc-link").href = readingHref(it.dataset.href);
      card.querySelector(".fc-explain").hidden = !it.dataset.notes;
      const m = markOf(marks, it.id);
      const tag = card.querySelector(".fc-was");
      tag.textContent = m === "got" ? "Got it before" : m === "review" ? "Marked review" : "New";
      tag.className = "fc-was " + m;
      setFlipped(card, s.flipped, false);
    }

    // Counts for the current section: the focus buttons count every card in it; the deck
    // chips and the tally count the cards in the chosen focus.
    const counts = { got: 0, review: 0, none: 0, due: 0 };
    const kinds = { all: 0, ap: 0, detail: 0 };
    let nextDue = Infinity;
    page.querySelectorAll(".fc-item").forEach(function (it) {
      if (!inSection(it, s.opts.section)) return;
      kinds.all++;
      kinds[it.dataset.focus]++;
      if (!inFocus(it, s.opts.focus)) return;
      counts[markOf(marks, it.id)]++;
      if (isDue(srs, it.id, now)) counts.due++;
      else nextDue = Math.min(nextDue, srs[it.id].d);
    });
    page.querySelectorAll("[data-focus-pick] .n").forEach(function (n) {
      n.textContent = kinds[n.closest("[data-focus-pick]").dataset.focusPick];
    });
    const note = page.querySelector(".fc-focus-note");
    note.textContent = FOCUS_NOTE[s.opts.focus] || "";
    note.hidden = !note.textContent;
    page.querySelectorAll("[data-deck] .n").forEach(function (n) {
      const d = n.closest("[data-deck]").dataset.deck;
      n.textContent = d === "all" ? counts.got + counts.review + counts.none : counts[d];
    });
    page.querySelector(".fc-bar span").style.width = total ? (100 * Math.min(s.index, total) / total) + "%" : "0";
    page.querySelector(".fc-count").textContent = !total ? "No cards" : finished ? total + " of " + total : "Card " + (s.index + 1) + " of " + total;
    page.querySelector(".fc-tally").innerHTML =
      '<span class="t-got">' + counts.got + " got it</span> · " + '<span class="t-review">' + counts.review + " to review</span>";

    if (finished) {
      const title = done.querySelector(".fc-done-title");
      const text = done.querySelector(".fc-done-text");
      const later = nextDue < Infinity ? " The next card is due " + whenText(nextDue - now) + "." : "";
      if (!total && s.opts.deck === "due") {
        title.textContent = "All caught up";
        text.textContent = "Nothing is due right now." + later;
      } else if (!total) {
        title.textContent = "No cards here";
        text.textContent = s.opts.deck === "review" ? "Nothing to review in these cards. Nice work."
          : s.opts.deck === "none" ? "You've marked every one of these cards." : "";
      } else {
        title.textContent = "Deck done";
        text.textContent = "This round: " + s.got + " got it, " + s.review + " to review." + (s.opts.deck === "due" ? later : "");
      }
      const missed = done.querySelector("[data-fc='missed']");
      missed.hidden = !counts.review;
      missed.textContent = "Go over the " + counts.review + " to review";
      done.querySelector("[data-fc='restart']").hidden = !total || s.opts.deck === "due";
      done.querySelector("[data-fc='studyall']").hidden = s.opts.deck !== "due";
    }
  }

  const FOCUS_NOTE = {
    ap: "Ideas an AP question could ask you to apply to a map, graph or scenario.",
    detail: "The reading's stories, field notes and exact numbers: worth knowing if the quiz is written from the book.",
  };

  function card(page) { return page.querySelector(".fc-card"); }

  // The next card rises from the stack.
  function rise(page) {
    const c = card(page);
    if (!c.hidden) play(c, [{ transform: "translateY(14px) scale(.95)", opacity: 0.4 }, { transform: "none", opacity: 1 }], 380, EASE_OUT);
    const done = page.querySelector(".fc-done");
    if (!done.hidden) play(done, [{ transform: "scale(.94)", opacity: 0 }, { transform: "none", opacity: 1 }], 420, EASE_OUT);
  }

  // Throw a copy of the current card off to one side, from wherever the drag left it.
  function throwAway(page, dir) {
    const c = card(page);
    if (calm() || !c.animate) return;
    const flyer = c.cloneNode(true);
    flyer.classList.add("fc-flyer");
    flyer.classList.remove("is-dragging");
    flyer.setAttribute("aria-hidden", "true");
    flyer.removeAttribute("tabindex");
    flyer.style.width = c.offsetWidth + "px";
    c.parentNode.appendChild(flyer);
    const from = c.style.transform || "none";
    const x = dir * (c.offsetWidth + window.innerWidth / 2);
    const a = flyer.animate([
      { transform: from, opacity: 1 },
      { transform: "translateX(" + x + "px) translateY(40px) rotate(" + dir * 24 + "deg)", opacity: 0.2 },
    ], { duration: 460, easing: THROW });
    a.onfinish = function () { flyer.remove(); };
  }

  function mark(page, kind) {
    const s = getState(page);
    if (!s || s.index >= s.order.length) return;
    const id = s.order[s.index];
    const marks = load(page.dataset.store);
    const srs = load(page.dataset.srs);
    const entry = { id: id, prev: marks[id] || null, prevSrs: srs[id] || null, kind: kind, requeued: -1 };

    marks[id] = kind;
    if (kind === "got") {
      const b = Math.min((srs[id] ? srs[id].b : 0) + 1, BOX_DAYS.length - 1);
      srs[id] = { b: b, d: Date.now() + BOX_DAYS[b] * DAY };
    } else {
      srs[id] = { b: 0, d: 0 };
      // Bring it back a few cards from now, while it's still fresh.
      const at = Math.min(s.index + 1 + REQUEUE_GAP, s.order.length);
      s.order.splice(at, 0, id);
      entry.requeued = at;
    }
    save(page.dataset.store, marks);
    save(page.dataset.srs, srs);
    s.history.push(entry);
    s[kind]++;
    s.index++;
    s.flipped = false;
    setState(page, s);
    throwAway(page, kind === "got" ? 1 : -1);
    draw(page, s);
    rise(page);
    if (s.index < s.order.length && page.contains(document.activeElement) && document.activeElement.matches(".fc-card")) {
      card(page).focus({ preventScroll: true });
    }
  }

  function undo(page) {
    const s = getState(page);
    const h = s && s.history.pop();
    if (!h) return;
    const marks = load(page.dataset.store);
    const srs = load(page.dataset.srs);
    if (h.prev) marks[h.id] = h.prev; else delete marks[h.id];
    if (h.prevSrs) srs[h.id] = h.prevSrs; else delete srs[h.id];
    save(page.dataset.store, marks);
    save(page.dataset.srs, srs);
    if (h.requeued >= 0 && s.order[h.requeued] === h.id) s.order.splice(h.requeued, 1);
    s[h.kind]--;
    s.index--;
    s.flipped = false;
    setState(page, s);
    draw(page, s);
    const c = card(page);
    const dir = h.kind === "got" ? 1 : -1;
    play(c, [
      { transform: "translateX(" + dir * (c.offsetWidth + 60) + "px) rotate(" + dir * 18 + "deg)", opacity: 0 },
      { transform: "none", opacity: 1 },
    ], 480, EASE_OUT);
  }

  function flip(page) {
    const s = getState(page);
    if (!s || s.index >= s.order.length) return;
    s.flipped = !s.flipped;
    setState(page, s);
    setFlipped(card(page), s.flipped, true);
  }

  function restart(page) {
    draw(page, build(page));
    rise(page);
  }

  // "Explain it": the reading guide's own notes on this card (loaded by notes.js).
  function explain(page, trigger) {
    const s = getState(page);
    if (!s || s.index >= s.order.length || !window.siteExplain) return;
    const id = s.order[s.index];
    const ids = (document.getElementById(id).dataset.notes || "").split(/\s+/).filter(Boolean);
    window.siteExplain("fc-" + id, ids, page.dataset.notesFrom, trigger, page);
  }

  function panelOpen() {
    const p = document.getElementById("panel");
    return !!(p && p.classList.contains("open"));
  }

  // ---------- Dragging a card ----------
  let drag = null;

  document.addEventListener("pointerdown", function (e) {
    const c = e.target.closest && e.target.closest(".fc-card");
    if (!c || c.classList.contains("fc-flyer") || e.target.closest("a, button") || e.button > 0) return;
    drag = { card: c, x: e.clientX, y: e.clientY, dx: 0, moved: false, id: e.pointerId };
  });

  document.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }   // a scroll, not a swipe
      drag.moved = true;
      try { drag.card.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
      drag.card.classList.add("is-dragging");
    }
    drag.dx = dx;
    drag.card.style.transform = "translateX(" + dx + "px) rotate(" + dx / 16 + "deg)";
    const k = Math.min(1, Math.abs(dx) / 110);
    drag.card.querySelector(".fc-stamp.got").style.opacity = dx > 0 ? k : 0;
    drag.card.querySelector(".fc-stamp.review").style.opacity = dx < 0 ? k : 0;
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    d.card._dragged = true;                         // swallow the click that follows the release
    setTimeout(function () { d.card._dragged = false; }, 350);
    d.card.classList.remove("is-dragging");
    const page = d.card.closest(".fc-page");
    const far = Math.abs(d.dx) > Math.min(120, d.card.offsetWidth * 0.28);
    if (e.type === "pointerup" && far) { mark(page, d.dx > 0 ? "got" : "review"); return; }
    // Not far enough: spring back to the middle.
    const from = d.card.style.transform;
    d.card.style.transform = "";
    d.card.querySelectorAll(".fc-stamp").forEach(function (st) { st.style.opacity = ""; });
    play(d.card, [{ transform: from }, { transform: "none" }], 500, SPRING);
  }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  // ---------- Buttons, keys and controls ----------
  // A click outside the open panel only closes it (notes.js does that); note it here, in the
  // capture phase, so the same click doesn't also flip the card underneath.
  let closingPanel = false;
  document.addEventListener("click", function (e) {
    const p = document.getElementById("panel");
    closingPanel = panelOpen() && !p.contains(e.target);
  }, true);

  document.addEventListener("click", function (e) {
    const page = e.target.closest && e.target.closest(".fc-page");
    if (!page || closingPanel) return;
    const c = e.target.closest(".fc-card");
    if (c && !e.target.closest("a, button")) {
      if (!c._dragged) flip(page);
      return;
    }
    const deck = e.target.closest("[data-deck]");
    if (deck) {
      pick(page, "[data-deck]", deck.dataset.deck);
      restart(page);
      return;
    }
    const focus = e.target.closest("[data-focus-pick]");
    if (focus) {
      pick(page, "[data-focus-pick]", focus.dataset.focusPick);
      restart(page);
      return;
    }
    const act = e.target.closest("[data-fc]");
    if (!act || act.disabled) return;
    switch (act.dataset.fc) {
      case "flip": flip(page); break;
      case "got": mark(page, "got"); break;
      case "review": mark(page, "review"); break;
      case "undo": undo(page); break;
      case "explain": explain(page, act); break;
      case "restart": restart(page); break;
      case "shuffle":
        act.setAttribute("aria-pressed", String(act.getAttribute("aria-pressed") !== "true"));
        restart(page);
        break;
      case "missed":
        pick(page, "[data-deck]", "review");
        restart(page);
        break;
      case "studyall":
        pick(page, "[data-deck]", "all");
        restart(page);
        break;
      case "reset":
        window.siteConfirm({
          title: "Clear all marks?",
          text: "This removes every Got it and Review mark for this reading on this device, and starts every card's schedule over. It can't be undone.",
          ok: "Clear marks",
          cancel: "Keep them",
          danger: true,
        }).then(function (yes) {
          if (!yes || !document.contains(page)) return;
          save(page.dataset.store, {});
          save(page.dataset.srs, {});
          pick(page, "[data-deck]", "due");
          restart(page);
        });
        break;
    }
  });

  document.addEventListener("change", function (e) {
    if (!e.target.matches || !e.target.matches(".fc-section")) return;
    restart(e.target.closest(".fc-page"));
  });

  document.addEventListener("keydown", function (e) {
    const page = document.querySelector(".fc-page.fc-ready");
    if (!page || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]") || panelOpen()) return;
    const t = e.target;
    if (t.closest && t.closest("select, input, textarea, a")) return;
    const onButton = t.closest && t.closest("button");
    if (e.key === "ArrowRight") { e.preventDefault(); mark(page, "got"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); mark(page, "review"); }
    else if (e.key === "e" || e.key === "E") {
      const b = page.querySelector(".fc-explain");
      if (!card(page).hidden && !b.hidden) { e.preventDefault(); explain(page, b); }
    }
    else if ((e.key === " " || e.key === "Enter") && !onButton) { e.preventDefault(); flip(page); }
  });

  // Progress line on an options-page card: "12 of 109 got it · 5 to review · 30 due now".
  function progress() {
    document.querySelectorAll("[data-progress]").forEach(function (el) {
      const marks = load(el.dataset.progress);
      const srs = el.dataset.srs ? load(el.dataset.srs) : {};
      const now = Date.now();
      let got = 0, review = 0, later = 0;
      Object.keys(marks).forEach(function (id) {
        if (marks[id] === "got") got++;
        else if (marks[id] === "review") review++;
      });
      Object.keys(srs).forEach(function (id) { if (srs[id].d > now) later++; });
      const due = Number(el.dataset.total) - later;
      el.hidden = !(got || review);
      el.textContent = got + " of " + el.dataset.total + " got it" + (review ? " · " + review + " to review" : "") +
        (el.dataset.srs ? " · " + due + " due now" : "");
    });
  }

  // On the reading page, reached from a card's "In the reading": a button back to the deck.
  // The deck itself was saved in sessionStorage, so it reopens on the same card.
  function returnButton() {
    if (new URLSearchParams(location.search).get("from") !== "flashcards") return;
    if (document.querySelector(".fc-page") || document.querySelector(".fc-return")) return;
    const a = document.createElement("a");
    a.className = "fc-return";
    a.href = location.pathname.replace(/[^/]+\/$/, "flashcard/");
    a.innerHTML = '<span aria-hidden="true">←</span> Back to flashcards';
    document.body.appendChild(a);
  }

  function setup() {
    document.querySelectorAll(".fc-page").forEach(function (page) {
      migrate(page);
      page.classList.add("fc-ready");
      // Priority: this page's own state (a Back/Forward restore), then the deck saved in this
      // tab (coming back from the reading), then a fresh deck.
      let s = getState(page) || savedDeck(page);
      // A link like flashcard/#part-2-2 opens a fresh deck on that part (once per page visit).
      const hash = decodeURIComponent(location.hash.slice(1));
      const sel = page.querySelector(".fc-section");
      if (hash && page.dataset.hashUsed !== hash && Array.prototype.some.call(sel.options, function (o) { return o.value === hash; })) {
        page.dataset.hashUsed = hash;
        sel.value = hash;
        s = null;
      }
      if (s && s.opts && s.order.every(function (id) { return document.getElementById(id); })) {
        writeOpts(page, s.opts);
        setState(page, s);
      } else {
        s = build(page);
      }
      draw(page, s);
    });
    progress();
    returnButton();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
  document.addEventListener("turbo:load", setup);
})();
