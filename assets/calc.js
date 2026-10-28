// Natural increase + doubling time calculator (reading 2.1-2.2) and gravity model
// calculator (reading 3.3-3.5).
// Loaded once in <head>; binds to the calculator on whichever page has one, and re-binds
// on turbo:load because Turbo Drive swaps pages without reloading this file. The "bound"
// mark is a JS property, not a data- attribute: Turbo restores Back/Forward pages from a
// cloned snapshot, which keeps attributes but drops listeners, so an attribute would make
// the restored copy look already set up when it isn't.

(function () {
  if (window.__calcInit) return;
  window.__calcInit = true;

  function fmt(n) {
    return (Math.round(n * 100) / 100).toLocaleString("en-US");
  }

  function setup() {
    const root = document.getElementById("nir-calc");
    if (!root || root._bound) return;
    root._bound = true;

    const cbrIn = document.getElementById("calc-cbr");
    const cdrIn = document.getElementById("calc-cdr");
    const nirOut = document.getElementById("calc-nir");
    const dtOut = document.getElementById("calc-dt");

    function update() {
      const cbr = parseFloat(cbrIn.value);
      const cdr = parseFloat(cdrIn.value);
      if (isNaN(cbr) || isNaN(cdr)) {
        nirOut.textContent = "–";
        dtOut.textContent = "–";
        return;
      }
      const perThousand = cbr - cdr;
      const pct = perThousand / 10;
      nirOut.textContent = fmt(perThousand) + " per 1,000 = " + fmt(pct) + "% a year";

      if (pct > 0) {
        dtOut.textContent = "about " + Math.round(70 / pct).toLocaleString("en-US") + " years";
      } else if (pct === 0) {
        dtOut.textContent = "never (zero population growth)";
      } else {
        dtOut.textContent = "never: shrinking, would halve in about " +
          Math.round(70 / -pct).toLocaleString("en-US") + " years";
      }
    }

    root.querySelectorAll(".calc-presets button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        cbrIn.value = btn.dataset.cbr;
        cdrIn.value = btn.dataset.cdr;
        update();
      });
    });
    cbrIn.addEventListener("input", update);
    cdrIn.addEventListener("input", update);
    update();
  }

  // Gravity model: population x population / distance, the book's version (no squaring).
  // Compares two destinations for the same home town, so the raw numbers only matter
  // relative to each other.
  function big(n) {
    if (n >= 1e12) return fmt(n / 1e12) + " trillion";
    if (n >= 1e9) return fmt(n / 1e9) + " billion";
    if (n >= 1e6) return fmt(n / 1e6) + " million";
    return Math.round(n).toLocaleString("en-US");
  }

  function setupGravity() {
    const root = document.getElementById("gravity-calc");
    if (!root || root._bound) return;
    root._bound = true;

    const home = document.getElementById("grav-home");
    const a = document.getElementById("grav-a");
    const ad = document.getElementById("grav-ad");
    const b = document.getElementById("grav-b");
    const bd = document.getElementById("grav-bd");
    const outA = document.getElementById("grav-out-a");
    const outB = document.getElementById("grav-out-b");
    const out = document.getElementById("grav-out");

    function update() {
      const h = parseFloat(home.value), pa = parseFloat(a.value), da = parseFloat(ad.value);
      const pb = parseFloat(b.value), db = parseFloat(bd.value);
      if ([h, pa, da, pb, db].some(function (v) { return isNaN(v) || v <= 0; })) {
        outA.textContent = outB.textContent = out.textContent = "–";
        return;
      }
      const ga = h * pa / da, gb = h * pb / db;
      outA.textContent = big(ga);
      outB.textContent = big(gb);
      const r = ga > gb ? ga / gb : gb / ga;
      if (Math.abs(r - 1) < 0.005) out.textContent = "an even split between A and B";
      else out.textContent = (ga > gb ? "A" : "B") + " draws about " + fmt(r) + " times as many migrants as " + (ga > gb ? "B" : "A");
    }

    root.querySelectorAll(".calc-presets button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        a.value = btn.dataset.a; ad.value = btn.dataset.ad;
        b.value = btn.dataset.b; bd.value = btn.dataset.bd;
        update();
      });
    });
    [home, a, ad, b, bd].forEach(function (el) { el.addEventListener("input", update); });
    update();
  }

  function setupAll() { setup(); setupGravity(); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupAll);
  else setupAll();
  document.addEventListener("turbo:load", setupAll);
})();
