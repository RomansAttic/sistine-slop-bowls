(() => {
  const PLACES = [
    { id: "chipotle",    name: "Chipotle",     latin: "Sanctus Chipotlus",       color: "#b8392b", title: "Archduke of Guac" },
    { id: "noodlelab",   name: "Noodle Lab",   latin: "Laboratorium Noodlorum",  color: "#d19a2e", title: "Pontiff of Noodles" },
    { id: "cava",        name: "Cava",         latin: "Cava Maxima",             color: "#3a59b8", title: "Doge of Cava" },
    { id: "naya",        name: "Naya",         latin: "Naya Divina",             color: "#2e8a63", title: "Medici of Naya" },
    { id: "lifealive",   name: "Life Alive",   latin: "Vita Viva",               color: "#c9708a", title: "Saint of the Living Grain" },
    { id: "sweetgreen",  name: "Sweetgreen",   latin: "Viridis Dulcis",          color: "#7d9c3c", title: "Cardinal Kale" },
    { id: "dig",         name: "Dig Inn",      latin: "Fodere Intus",            color: "#a5673f", title: "Duke of Dig" },
    { id: "easternedge", name: "Eastern Edge", latin: "Aula Orientalis",         color: "#7d4a91", title: "Marco Polo of the Food Hall" },
  ];
  const PLACE = Object.fromEntries(PLACES.map(p => [p.id, p]));
  const LIKENESS = ["Anna", "Jurgis", "Roman", "Jason", "Ionel", "Ionut", "a monk", "a nun", "a king"];
  const DAY = 864e5;
  const PORTRAIT_PX = 400;       // uploaded faces are cropped square and shrunk to this
  const PORTRAIT_MAX_BYTES = 200000;
  const $ = id => document.getElementById(id);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  }
  // `who` is a profile ({portrait, image}) or a likeness index. `extra`: true adds the
  // duplicated-strip glitch; "whole" shows the full painting instead of a head crop.
  function face(who, extra) {
    const p = typeof who === "object" && who ? who : { portrait: who };
    let el;
    if (p.image) {
      el = h("span", { class: "face photo", style: `background-image:url("${p.image}")` });
    } else {
      const n = ((p.portrait | 0) % 9 + 9) % 9, col = n % 3, row = Math.floor(n / 3);
      el = extra === "whole"
        ? h("span", { class: "face", style: `background-position:${col * 50}% ${row * 50}%` })
        : h("span", { class: "face", style: `background-size:450% 450%;background-position:${[7.1, 50, 92.9][col]}% ${[-4, 38.9, 85.1][row]}%` });
    }
    if (extra === true) el.append(h("i"));
    return el;
  }
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  function hash(str) { let x = 2166136261; for (const c of String(str)) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return (x >>> 0) / 4294967296; }
  function ago(ts) {
    const d = Math.floor((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
    if (d <= 0) return "today"; if (d === 1) return "yesterday"; if (d < 14) return d + " days ago";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function isoDay(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  /* ---------- state ---------- */
  const S = { db: null, ready: false, profiles: [], entries: [], me: store.get("slop.me") };

  // Invented patrons, shown only while no real profile exists. Never written to storage.
  function demoData() {
    const names = [["Fra Quinoa", 6, "Blessed are the grains"], ["Caterina Sforzando", 7, "Dressing on the side, vengeance on top"], ["Lorenzo de' Bowlici", 8, "Extra guac is a human right"]];
    const weights = [[9, 1, 5, 2, 0, 3, 1, 2], [3, 6, 2, 1, 1, 0, 2, 5], [1, 0, 7, 4, 3, 8, 2, 0]];
    const profiles = names.map(([name, portrait, motto], i) => ({ id: "demo" + i, name, portrait, motto }));
    const entries = [];
    weights.forEach((w, i) => w.forEach((n, j) => { for (let k = 0; k < n; k++) entries.push({ id: `d${i}-${j}-${k}`, profileId: "demo" + i, place: PLACES[j].id, ts: Date.now() - Math.floor(hash(`${i}.${j}.${k}`) * 70) * DAY - 36e5 }); }));
    return { profiles, entries };
  }

  function view() {
    const demo = S.profiles.length === 0;
    if (demo) return { demo, ...demoData() };
    const known = new Set(S.profiles.map(p => p.id));
    return { demo, profiles: S.profiles, entries: S.entries.filter(e => known.has(e.profileId) && PLACE[e.place]) };
  }

  /* ---------- storage (Firestore) ---------- */
  function explain(e) {
    const code = e && e.code;
    if (code === "permission-denied") return "The ledger refused that entry. Check the Firestore rules.";
    if (code === "resource-exhausted") return "The free quota is spent for today. Try again tomorrow.";
    if (code === "unavailable") return "The scribe is offline. Try again in a moment.";
    return "The scribe dropped his quill. Try again in a moment.";
  }

  function boot() {
    render();
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.projectId || !window.firebase) { S.ready = true; render(); return; }
    firebase.initializeApp(cfg);
    S.db = firebase.firestore();
    S.ready = true;
    const dead = e => status(explain(e));
    S.db.collection("profiles").onSnapshot(snap => {
      S.profiles = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      if (!S.profiles.some(p => p.id === S.me)) S.me = null;
      render();
    }, dead);
    S.db.collection("entries").onSnapshot(snap => { S.entries = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, dead);
  }

  /* ---------- rendering ---------- */
  function status(msg) { const el = $("status"); el.hidden = !msg; el.textContent = msg || ""; }

  function render() {
    const V = view();
    const me = V.demo ? null : V.profiles.find(p => p.id === S.me) || null;
    const canWrite = !!S.db;

    if (!S.ready) status("Unrolling the ledger…");
    else if (!S.db) status("Exemplum. No database is configured (firebase-config.js), so these are invented patrons and nothing is saved.");
    else if (V.demo) status("Exemplum. These three patrons are invented and vanish the moment someone commissions the first real portrait.");
    else status("");

    // who art thou
    const who = $("whoami"); who.replaceChildren();
    for (const p of V.profiles) {
      who.append(h("button", { type: "button", class: "chip", "aria-pressed": String(!!me && p.id === me.id), disabled: V.demo, onclick: () => { S.me = p.id; store.set("slop.me", p.id); render(); } }, face(p), h("span", {}, p.name || "Anonymous")));
    }
    if (canWrite) who.append(h("button", { type: "button", class: "chip new", onclick: () => openDialog(null) }, "+ Commission a portrait"));

    // offerings
    const counts = tally(V.entries);
    const bowls = $("bowls"); bowls.replaceChildren();
    PLACES.forEach((pl, i) => {
      const n = me ? (counts[me.id]?.[pl.id] || 0) : 0;
      bowls.append(h("button", { type: "button", class: "bowl", style: `--pig:${pl.color}`, disabled: !(me && canWrite), "aria-label": `Log one ${pl.name} bowl`, onclick: () => logBowl(pl) },
        h("span", { class: "still", style: `background-position:${(i % 4) * 33.333}% ${i < 4 ? 5 : 95}%` }),
        h("span", { class: "meta" }, h("span", { class: "nm" }, pl.name, h("span", { class: "lat" }, pl.latin)), h("span", { class: "ct" }, me ? String(n) : ""))));
    });
    $("loghint").textContent = me ? `Logging as ${me.name}. Change the date to confess an older bowl.` : canWrite ? "Pick or commission a portrait above before logging." : "";

    renderFresco(V, counts);
    renderMine(V, counts, me, canWrite);
    renderMatrix(V, counts);
    renderChronicle(V, me, canWrite);
  }

  function tally(entries) {
    const t = {};
    for (const e of entries) { (t[e.profileId] ||= {})[e.place] = (t[e.profileId][e.place] || 0) + 1; }
    return t;
  }
  const total = c => Object.values(c || {}).reduce((a, b) => a + b, 0);
  function topPlace(c) { let best = null; for (const pl of PLACES) if ((c?.[pl.id] || 0) > (best ? c[best.id] : 0)) best = pl; return best; }

  function renderFresco(V, counts) {
    const box = $("pillars"); box.replaceChildren();
    const ranked = V.profiles.map(p => ({ p, n: total(counts[p.id]) })).sort((a, b) => b.n - a.n);
    const max = Math.max(1, ...ranked.map(r => r.n));
    const unit = Math.ceil(max / 36); // bowls drawn per painted bowl, so towers stay on the wall
    const bh = Math.max(7, Math.min(18, Math.floor(300 / Math.ceil(max / unit))));
    ranked.forEach((r, idx) => {
      const mine = V.entries.filter(e => e.profileId === r.p.id).sort((a, b) => a.ts - b.ts);
      const stack = h("div", { class: "stack" });
      for (let i = 0; i < mine.length; i += unit) {
        const e = mine[i], j = hash(e.id);
        stack.append(h("div", { class: "b", title: PLACE[e.place].name, style: `--pig:${PLACE[e.place].color};--bh:${bh}px;--ov:${-Math.round(bh * .3)}px;--bw:${54 + Math.round(j * 18)}px;transform:translateX(${Math.round((j - .5) * 14)}px) rotate(${((hash(e.id + "r") - .5) * 9).toFixed(1)}deg)` }));
      }
      const first = idx === 0 && r.n > 0, last = ranked.length > 1 && idx === ranked.length - 1 && r.n < ranked[0].n;
      const sz = Math.round(54 + 58 * (r.n / max)); // devotion enlarges the head
      const saint = h("div", { class: "saint" + (first ? " first" : "") + (last ? " last" : ""), style: `--sz:${sz}px;animation-delay:${-(hash(r.p.id) * 3).toFixed(2)}s` },
        h("span", { class: "halo" }), face(r.p, true), first ? h("span", { class: "tag" }, "Most Devout") : last ? h("span", { class: "tag" }, "Heretic") : null);
      box.append(h("div", { class: "pillar" }, saint, stack, h("div", { class: "plinth" }, h("b", {}, String(r.n)), h("span", {}, r.p.name || "Anonymous"))));
    });
    const lg = $("legend"); lg.replaceChildren(...PLACES.map(pl => h("span", { style: `--pig:${pl.color}` }, h("i"), pl.name)));
    if (unit > 1) lg.append(h("span", {}, `Each painted bowl stands for ${unit} real ones.`));
  }

  function renderMine(V, counts, me, canWrite) {
    const box = $("mine"); box.replaceChildren();
    const who = me || (V.demo ? V.profiles[0] : null);
    if (!who) { box.append(h("p", { class: "note" }, "Pick your portrait above to see your devotions.")); return; }
    const c = counts[who.id] || {}, n = total(c), top = topPlace(c);
    const mine = V.entries.filter(e => e.profileId === who.id);
    const week = mine.filter(e => e.ts >= startOfDay(Date.now()) - 6 * DAY).length;
    const visited = PLACES.filter(pl => c[pl.id]).length;
    const lastTs = Math.max(0, ...mine.map(e => e.ts));
    box.append(
      h("div", { class: "portrait" }, face(who, "whole"),
        h("div", { class: "nm" }, who.name || "Anonymous"),
        h("div", { class: "ttl" }, top ? top.title : "Unbowled Novice"),
        who.motto ? h("div", { class: "motto" }, "“" + who.motto + "”") : null,
        me && canWrite ? h("button", { type: "button", class: "linkbtn", onclick: () => openDialog(me) }, "Retouch portrait") : null),
      h("div", {},
        h("dl", { class: "tiles" },
          tile("Bowls consumed", String(n), `roughly ${n * 7} fingers rendered`),
          tile("Reigning bowl", top ? top.name : "none", top ? `${Math.round(100 * c[top.id] / n)}% of all offerings` : "no offerings yet"),
          tile("Last seven days", String(week), lastTs ? "latest: " + ago(lastTs) : "the fast continues"),
          tile("Pilgrimage", `${visited}/${PLACES.length}`, visited === PLACES.length ? "every shrine visited" : "shrines visited")),
        bars(c)));
  }
  function tile(label, value, sub) { return h("div", { class: "tile" }, h("dt", {}, label), h("dd", {}, value, h("small", {}, sub))); }
  function bars(c) {
    const max = Math.max(1, ...PLACES.map(pl => c[pl.id] || 0));
    const box = h("div", { class: "bars", role: "img", "aria-label": "Bowls per restaurant: " + PLACES.map(pl => `${pl.name} ${c[pl.id] || 0}`).join(", ") });
    for (const pl of [...PLACES].sort((a, b) => (c[b.id] || 0) - (c[a.id] || 0))) {
      const n = c[pl.id] || 0;
      box.append(h("span", { class: "lab" }, pl.name), h("span", { class: "track" }, n ? h("span", { class: "fill", style: `display:block;width:${100 * n / max}%;--pig:${pl.color}` }) : null), h("span", { class: "n" }, String(n)));
    }
    return box;
  }

  function renderMatrix(V, counts) {
    const t = $("matrix"); t.replaceChildren();
    const ps = V.profiles;
    t.append(h("thead", {}, h("tr", {}, h("th", {}), ...ps.map(p => h("th", { scope: "col" }, face(p), p.name || "Anonymous")))));
    const body = h("tbody");
    for (const pl of PLACES) {
      const row = ps.map(p => counts[p.id]?.[pl.id] || 0), max = Math.max(...row, 0);
      const leaders = row.filter(n => n === max).length;
      body.append(h("tr", { style: `--pig:${pl.color}` }, h("th", { scope: "row" }, h("i"), pl.name),
        ...row.map(n => h("td", { class: "cell" + (n && n === max && leaders === 1 ? " lead" : ""), style: `--heat:${max ? (n / max).toFixed(2) : 0}` }, n ? String(n) : "·"))));
    }
    t.append(body, h("tfoot", {}, h("tr", {}, h("th", { scope: "row" }, "Total"), ...ps.map(p => h("td", {}, String(total(counts[p.id])))))));
  }

  function renderChronicle(V, me, canWrite) {
    const ul = $("chron"); ul.replaceChildren();
    const byId = Object.fromEntries(V.profiles.map(p => [p.id, p]));
    const recent = [...V.entries].sort((a, b) => b.ts - a.ts).slice(0, 14);
    if (!recent.length) { ul.append(h("li", {}, h("span", { class: "txt note" }, "No offerings yet. The altar is bare."))); return; }
    for (const e of recent) {
      const p = byId[e.profileId];
      ul.append(h("li", {}, face(p), h("span", { class: "txt" }, h("b", {}, p.name || "Anonymous"), " partook of ", h("span", { style: `color:${PLACE[e.place].color};filter:brightness(1.5)` }, PLACE[e.place].name)),
        h("time", {}, ago(e.ts)),
        me && canWrite && e.profileId === me.id ? h("button", { type: "button", class: "x", "aria-label": `Remove this ${PLACE[e.place].name} entry`, onclick: () => S.db.collection("entries").doc(e.id).delete().catch(err => toast(explain(err))) }, "×") : null));
    }
  }

  /* ---------- actions ---------- */
  let toastTimer;
  function toast(msg, undo) {
    $("toast-msg").textContent = msg;
    const u = $("toast-undo"); u.hidden = !undo; u.onclick = undo ? () => { $("toast").hidden = true; undo(); } : null;
    $("toast").hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $("toast").hidden = true; }, 6000);
  }

  async function logBowl(pl) {
    const meId = S.me; if (!meId || !S.db) return;
    const chosen = $("when").value, today = isoDay(new Date());
    let ts = Date.now();
    if (chosen && chosen !== today) { const [y, m, d] = chosen.split("-").map(Number); ts = new Date(y, m - 1, d, 12, 0, 0).getTime(); }
    if (ts > Date.now() + DAY) { toast("That bowl is in the future. Prophecy is not accepted."); return; }
    try {
      const ref = await S.db.collection("entries").add({ profileId: meId, place: pl.id, ts });
      toast(`One ${pl.name} bowl recorded${chosen && chosen !== today ? " for " + ago(ts) : ""}.`, () => ref.delete().catch(err => toast(explain(err))));
    } catch (e) { toast(explain(e)); }
  }

  // Shrink an uploaded photo to a small square JPEG so it fits inside the profile document.
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
        const c = document.createElement("canvas"); c.width = c.height = PORTRAIT_PX;
        c.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, PORTRAIT_PX, PORTRAIT_PX);
        let q = 0.85, out = c.toDataURL("image/jpeg", q);
        while (out.length > PORTRAIT_MAX_BYTES && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
      img.src = url;
    });
  }

  let editing = null, picked = 0, uploaded = null;
  function openDialog(profile) {
    editing = profile; uploaded = profile ? profile.image || null : null;
    picked = uploaded ? null : profile ? (profile.portrait | 0) : Math.floor(Math.random() * 9);
    $("dlg-title").textContent = profile ? "Retouch Portrait" : "Commission a Portrait";
    $("pname").value = profile ? profile.name || "" : ""; $("pmotto").value = profile ? profile.motto || "" : ""; $("perr").textContent = ""; $("pfile").value = "";
    drawPick(); $("dlg").showModal(); $("pname").focus();
  }
  function drawPick() {
    const cells = Array.from({ length: 9 }, (_, i) => h("button", { type: "button", "aria-pressed": String(i === picked), "aria-label": LIKENESS[i], onclick: () => { picked = i; uploaded = null; drawPick(); } }, face(i, "whole")));
    if (uploaded) cells.unshift(h("button", { type: "button", "aria-pressed": String(picked === null), "aria-label": "Your uploaded photo", onclick: () => { picked = null; drawPick(); } }, face({ image: uploaded }, "whole")));
    $("pick").replaceChildren(...cells);
  }
  $("pfile").addEventListener("change", async ev => {
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    $("perr").textContent = "";
    try { uploaded = await shrinkImage(f); picked = null; drawPick(); }
    catch { $("perr").textContent = "That file could not be read as an image."; }
  });
  $("pcancel").addEventListener("click", () => $("dlg").close());
  $("pform").addEventListener("submit", async ev => {
    ev.preventDefault();
    const name = $("pname").value.trim(), motto = $("pmotto").value.trim();
    if (!name) { $("perr").textContent = "A portrait needs a name."; return; }
    if (!editing && S.profiles.some(p => (p.name || "").toLowerCase() === name.toLowerCase())) { $("perr").textContent = "That name is already hanging in the gallery."; return; }
    $("psave").disabled = true;
    const data = { name, motto, portrait: picked === null ? null : picked, image: uploaded || null };
    try {
      if (editing) await S.db.collection("profiles").doc(editing.id).update(data);
      else {
        const ref = await S.db.collection("profiles").add({ ...data, createdAt: Date.now() });
        S.me = ref.id; store.set("slop.me", ref.id);
      }
      $("dlg").close(); render();
    } catch (e) { $("perr").textContent = explain(e); }
    $("psave").disabled = false;
  });

  $("when").value = isoDay(new Date()); $("when").max = isoDay(new Date());
  boot();
})();
