/* Приложение конспектов: чтение базы (library.js), мини-карточки, повторение, выгрузка из головы.
   Без фреймворков; работает с file:// и офлайн. Данные — только window.LIBRARY. */
(function () {
  "use strict";

  const LIB = window.LIBRARY || { chronicle: [], names: {}, pages: {} };
  const PAGES = LIB.pages, NAMES = LIB.names;
  const STORE_KEY = "konspekty.progress.v1";
  const LADDER = [0, 1, 3, 7, 16, 35, 90, 180];   // дни
  const TYPE_RU = { person: "Персоналия", concept: "Понятие", problem: "Проблема", lecture: "Лекция", character: "Персонаж" };
  const TYPE_PLURAL = { person: "Персоналии", concept: "Понятия", problem: "Проблемы", character: "Персонажи" };
  const TYPE_ICON = { person: "●", concept: "◆", problem: "⇄", character: "✦" };
  const CARD_RU = {
    definition: "определение", reverse: "обратная", person: "автор — тезис", contrast: "различие",
    why: "почему", contradiction: "противоречие", apply: "применение", cloze: "пропуск",
    explain: "объясни своими словами", sequence: "порядок", date: "дата", who: "кто это?"
  };
  const $view = document.getElementById("view");

  /* ================= хранилище ================= */
  const store = {
    data: null,
    load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { d = null; }
      this.data = Object.assign({ cards: {}, dumps: {}, settings: { newPerDay: 20 }, newToday: { date: "", count: 0 }, lastExport: "" }, d || {});
      return this.data;
    },
    save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { /* без хранилища — просто не помним */ } }
  };
  store.load();

  /* ================= утилиты ================= */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(y, m - 1, d + n); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); };
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const norm = s => String(s).toLowerCase().replace(/ё/g, "е");
  const resolve = name => NAMES[norm(String(name).trim())] || NAMES[String(name).trim().toLowerCase()];
  const pageOf = name => PAGES[resolve(name)];
  const initials = title => { const w = String(title).split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : w[0][0]).toUpperCase(); };
  const secOf = t => { const [h, m, s] = t.split(":").map(Number); return h * 3600 + m * 60 + s; };
  const lectureById = code => PAGES[NAMES[String(code).toLowerCase()]];
  function toast(msg) {
    const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  /* ================= разметка: строка ================= */
  const INLINE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\{\{(дата|труд|цитата|место|число|слово|\?):([^}]+)\}\}|\^([ЛИ]-\d+)(?:@(\d{1,2}:\d{2}:\d{2}))?(:конспект)?|\^синтез|\^справка|\*\*([^*]+)\*\*|`([^`]+)`/g;
  const OPS = { "⇒": "следует, поэтому", "⇐": "потому что", "≡": "это и есть, по определению", "→": "ведёт к, превращается в", "←": "восходит к, происходит из",
    "↔": "связаны взаимно", "⇄": "противостоят, спор", "≠": "не то же самое", "≈": "сродни, похоже", "∈": "входит в, часть",
    "∴": "итог", "✕": "неверно, отвергается", "↑": "рост", "↓": "упадок" };
  const OPS_RE = /[⇒⇐≡→←↔⇄≠≈∈∴✕↑↓]/g;
  const ops = s => esc(s).replace(OPS_RE, ch => `<span class="op${ch === "⇄" || ch === "✕" ? " neg" : ""}" title="${OPS[ch]}">${ch}</span>`);
  function inline(text) {
    let out = "", last = 0, m;
    INLINE.lastIndex = 0;
    while ((m = INLINE.exec(text))) {
      out += ops(text.slice(last, m.index)); last = INLINE.lastIndex;
      if (m[1]) out += entityLink(m[1], m[2] || m[1]);
      else if (m[3] === "дата") out += `<span class="e-date">${esc(m[4])}</span>`;
      else if (m[3] === "труд") out += `<span class="e-work">${esc(m[4])}</span>`;
      else if (m[3] === "цитата") out += `<span class="e-quote">${esc(m[4])}</span>`;
      else if (m[3] === "место") out += `<span class="e-place">${esc(m[4])}</span>`;
      else if (m[3] === "число") out += `<span class="e-num">${esc(m[4])}</span>`;
      else if (m[3] === "слово") out += `<span class="e-word">${esc(m[4])}</span>`;
      else if (m[3] === "?") out += `<span class="e-unclear" title="Нужно уточнить: так распозналось">${esc(m[4])}</span>`;
      else if (m[5]) out += provChip(m[5], m[6], !!m[7]);
      else if (m[0] === "^синтез") out += `<span class="e-prov" title="Сформулировано при разборе, не сказано на лекции">синтез</span>`;
      else if (m[0] === "^справка") out += `<span class="e-prov" title="Справочный факт не из лекции, проверен по источнику">справка</span>`;
      else if (m[8]) out += `<strong>${esc(m[8])}</strong>`;
      else if (m[9]) out += `<code>${esc(m[9])}</code>`;
    }
    return out + ops(text.slice(last));
  }
  function entityLink(target, label) {
    const id = resolve(target), p = PAGES[id];
    if (!p) return `<span class="e-missing" title="Страницы пока нет">${esc(label)}</span>`;
    if (p.type === "person") return `<button type="button" class="e-person" data-id="${id}"><span class="ini" aria-hidden="true">${esc(initials(p.title))}</span>${esc(label)}</button>`;
    if (p.type === "concept") return `<button type="button" class="e-concept" data-id="${id}">${esc(label)}</button>`;
    if (p.type === "problem") return `<button type="button" class="e-problem" data-id="${id}">${esc(label)}</button>`;
    if (p.type === "character") return `<button type="button" class="e-character" data-id="${id}">${esc(label)}</button>`;
    return `<a href="#/l/${id}">${esc(label)}</a>`;
  }
  function provChip(code, time, notes) {
    const lec = lectureById(code);
    const label = esc(code) + (time ? " · " + time.replace(/^00:/, "").replace(/^0(\d:)/, "$1") : "") + (notes ? " · конспект" : "");
    const audio = time && lec && lec.audio ? " has-audio" : "";
    return `<button type="button" class="e-prov${audio}" data-l="${esc(code)}"${time ? ` data-t="${time}"` : ""} aria-label="Источник: лекция ${esc(code)}${time ? ", " + time : ""}">${label}</button>`;
  }

  /* ================= разметка: блоки ================= */
  function splitSections(md) {
    const out = [{ title: "", md: [] }];
    for (const line of String(md || "").split("\n")) {
      const h = /^## (.+)$/.exec(line);
      if (h) out.push({ title: h[1].trim(), md: [] }); else out[out.length - 1].md.push(line);
    }
    return out.map(s => ({ title: s.title, md: s.md.join("\n").trim() })).filter(s => s.title || s.md);
  }
  function blocks(md) {
    const lines = String(md || "").split("\n"), html = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      let m;
      if ((m = /^### (.+)$/.exec(line))) { html.push(`<h3>${inline(m[1])}</h3>`); i++; continue; }
      if (/^>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^> ?/, ""));
        html.push(callout(buf)); continue;
      }
      if (/^\|/.test(line)) {
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
        html.push(table(rows)); continue;
      }
      if (/^(\d+\.|-) /.test(line)) {
        const ordered = /^\d+\./.test(line), items = [];
        while (i < lines.length && /^(\d+\.|-) /.test(lines[i])) items.push(lines[i++].replace(/^(\d+\.|-) /, ""));
        const tag = ordered ? "ol" : "ul";
        html.push(`<${tag}>${items.map(t => `<li>${inline(t)}</li>`).join("")}</${tag}>`); continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(>|\||#|(\d+\.|-) )/.test(lines[i])) buf.push(lines[i++].trim());
      html.push(`<p>${inline(buf.join(" "))}</p>`);
    }
    return html.join("");
  }
  // «|» внутри ссылки [[страница|подпись]] — не граница ячейки
  const splitCells = s => String(s).replace(/\[\[[^\]]*\]\]/g, m => m.replace(/\|/g, "\u0001")).split("|").map(c => c.replace(/\u0001/g, "|").trim());
  function table(rows) {
    const cells = r => splitCells(r.replace(/^\||\|$/g, ""));
    const body = rows.filter(r => !/^\|[\s:|-]+\|$/.test(r));
    const [head, ...rest] = body;
    return `<div class="table-wrap"><table><thead><tr>${cells(head).map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rest.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function callout(buf) {
    const head = /^\[!(\w+)\]\s*(.*)$/.exec(buf[0] || "");
    if (!head) return `<blockquote>${inline(buf.join(" "))}</blockquote>`;
    const kind = head[1], title = head[2], rest = buf.slice(1);
    if (kind === "recall") return recallBlock(title, rest.join("\n"));
    if (kind === "contradiction") return contraBlock(title, rest);
    if (kind === "conflict") return `<div class="conflict"><div class="title">${inline(title)}</div>${rest.map(r => `<div>${inline(r)}</div>`).join("")}</div>`;
    if (kind === "scheme") return schemeBlock(title, rest);
    if (kind === "def") return `<div class="b-def"><div class="b-label">Определение</div><div class="b-def-row"><span class="b-term">${inline(title)}</span><span class="op" title="${OPS["≡"]}">≡</span></div><div class="b-def-text">${rest.map(inline).join(" ")}</div></div>`;
    // заголовок блока не теряется никогда: у «главного» и «примера» он идёт подписью над текстом
    const sub = title ? `<div class="b-sub">${inline(title)}</div>` : "";
    if (kind === "key") return `<div class="b-key"><span class="b-key-mark" aria-label="Главное">!</span>${sub}<div>${rest.map(inline).join(" ")}</div></div>`;
    if (kind === "example") return `<div class="b-example"><span class="b-label">напр.</span><div>${sub}${rest.map(inline).join("<br>")}</div></div>`;
    if (kind === "quote") return `<figure class="b-quote"><blockquote>${rest.map(inline).join(" ")}</blockquote><figcaption>— ${title ? inline(title) : "лектор"}</figcaption></figure>`;
    if (kind === "chain") return chainBlock(title, rest);
    if (kind === "compare") return compareBlock(title, rest);
    if (kind === "list") return `<div class="b-list">${title ? `<div class="b-title">${inline(title)}</div>` : ""}<dl>${rest.map(l => { const i = l.indexOf(" — "); return i < 0 ? `<div><dt>${inline(l)}</dt></div>` : `<div><dt>${inline(l.slice(0, i))}</dt><dd>${inline(l.slice(i + 3))}</dd></div>`; }).join("")}</dl></div>`;
    return `<blockquote>${inline(buf.join(" "))}</blockquote>`;
  }
  function chainBlock(title, rest) {
    const out = []; let label = "";
    for (const l of rest) {
      const m = /^⇒\s*(.*)$/.exec(l.trim());
      if (m) { label = m[1]; continue; }
      if (out.length) out.push(`<li class="b-chain-arrow" aria-hidden="true"><span class="op" title="${OPS["⇒"]}">⇒</span>${label ? `<span class="b-chain-why">${inline(label)}</span>` : ""}</li>`);
      out.push(`<li class="b-chain-step">${inline(l)}</li>`); label = "";
    }
    return `<div class="b-chain">${title ? `<div class="b-title">${inline(title)}</div>` : ""}<ol>${out.join("")}</ol></div>`;
  }
  function compareBlock(title, rest) {
    const heads = splitCells(title);
    const rows = rest.map(splitCells);
    const withLabel = rows.some(r => r.length > heads.length);
    return `<div class="b-compare table-wrap"><table><thead><tr>${withLabel ? "<th></th>" : ""}${heads.map(h => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => withLabel && i === 0 ? `<th scope="row">${inline(c)}</th>` : `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function recallBlock(q, a) {
    return `<div class="recall"><div class="q">${inline(q)}</div><button type="button" class="reveal" data-act="reveal">Вспомни, затем нажми — показать ответ</button><div class="a" hidden>${multiline(a)}</div></div>`;
  }
  function multiline(text) {
    const lines = String(text || "").split("\n").map(s => s.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every(l => /^(\d+\.|-) /.test(l))) {
      const tag = /^\d/.test(lines[0]) ? "ol" : "ul";
      return `<${tag}>${lines.map(l => `<li>${inline(l.replace(/^(\d+\.|-) /, ""))}</li>`).join("")}</${tag}>`;
    }
    return `<p>${inline(lines.join(" "))}</p>`;
  }
  function parseContra(rest) {
    const get = p => (rest.find(r => r.startsWith(p)) || "").slice(p.length).trim();
    return { a: get("A:"), b: get("B:"), r: get("Как снимается:") };
  }
  function contraBlock(title, rest) {
    const c = parseContra(rest);
    return `<div class="contra"><div class="title">${inline(title)}</div><div class="sides"><div class="side"><b>A</b>${inline(c.a)}</div><div class="vs" aria-hidden="true">⇄</div><div class="side"><b>B</b>${inline(c.b)}</div></div>${c.r ? `<div class="resolve"><b>Как снимается.</b> ${inline(c.r)}</div>` : ""}</div>`;
  }

  /* ================= схема ================= */
  const SCHEMES = [];
  function parseScheme(rest) {
    const edges = [], nodes = [];
    const add = n => { if (!nodes.includes(n)) nodes.push(n); };
    for (const r of rest) {
      const m = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*(<->|->|<-)\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*(?::\s*(.*))?$/.exec(r.trim());
      if (!m) continue;
      let [, a, kind, b, label] = m;
      if (kind === "<-") { [a, b] = [b, a]; kind = "->"; }
      add(a); add(b); edges.push({ a, b, kind, label: label || "" });
    }
    return { nodes, edges };
  }
  function schemeBlock(title, rest) {
    const s = parseScheme(rest);
    if (!s.nodes.length) return "";
    const idx = SCHEMES.push(s) - 1;
    return `<figure class="scheme" data-scheme="${idx}"><div class="title">${inline(title)}</div><div class="svg-host"></div></figure>`;
  }
  function wrapText(text, maxChars) {
    const words = String(text).split(/\s+/), lines = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }
  function drawScheme(host, s, matched) {
    const W = Math.max(280, Math.min(host.clientWidth || 360, 720));
    const layer = {}; s.nodes.forEach(n => { layer[n] = 0; });
    for (let k = 0; k < s.nodes.length; k++)
      for (const e of s.edges) if (e.kind === "->" && layer[e.b] < layer[e.a] + 1) layer[e.b] = Math.min(layer[e.a] + 1, s.nodes.length);
    const perRow = W < 420 ? 2 : 3;
    const rowsByLayer = {};
    s.nodes.forEach(n => (rowsByLayer[layer[n]] = rowsByLayer[layer[n]] || []).push(n));
    const rows = [];
    Object.keys(rowsByLayer).map(Number).sort((a, b) => a - b).forEach(l => {
      const list = rowsByLayer[l];
      for (let i = 0; i < list.length; i += perRow) rows.push(list.slice(i, i + perRow));
    });
    const gapX = 12, gapY = 46, lineH = 15, pad = 10, pos = {};
    let y = 4;
    rows.forEach(row => {
      const nodeW = Math.min(170, (W - gapX * (row.length + 1)) / row.length);
      const maxChars = Math.max(8, Math.floor((nodeW - pad * 2) / 7.2));
      const metas = row.map(n => {
        const p = pageOf(n), label = (p && p.type === "concept" ? "◆ " : p && p.type === "character" ? "✦ " : "") + (p ? p.title : n) + (p && p.type === "problem" ? " ⇄" : "");
        return { n, p, lines: wrapText(label, maxChars) };
      });
      const tap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tap")) || 44;
      const h = Math.max(tap, Math.max(...metas.map(m => m.lines.length)) * lineH + pad * 2);   // узел — зона нажатия не меньше --tap
      const total = row.length * nodeW + (row.length - 1) * gapX;
      metas.forEach((m, i) => { pos[m.n] = { x: (W - total) / 2 + i * (nodeW + gapX), y, w: nodeW, h, ...m }; });
      y += h + gapY;
    });
    const H = y - gapY + 4;
    const svgEdges = s.edges.map(e => {
      const A = pos[e.a], B = pos[e.b];
      let x1, y1, x2, y2;
      if (Math.abs(A.y - B.y) < 1) {
        const leftFirst = A.x < B.x;
        x1 = leftFirst ? A.x + A.w : A.x; x2 = leftFirst ? B.x : B.x + B.w; y1 = y2 = A.y + A.h / 2;
      } else if (A.y < B.y) { x1 = A.x + A.w / 2; y1 = A.y + A.h; x2 = B.x + B.w / 2; y2 = B.y; }
      else { x1 = A.x + A.w / 2; y1 = A.y; x2 = B.x + B.w / 2; y2 = B.y + B.h; }
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const lw = Math.min(e.label.length * 5.6 + 8, W * 0.6);
      const label = e.label ? `<rect class="edge-label-bg" x="${mx - lw / 2}" y="${my - 8}" width="${lw}" height="15" rx="3"></rect><text class="edge-label" x="${mx}" y="${my + 3.5}" text-anchor="middle">${esc(e.label.length > 34 ? e.label.slice(0, 33) + "…" : e.label)}</text>` : "";
      return `<line class="edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#arr)"${e.kind === "<->" ? ' marker-start="url(#arr-s)"' : ""}></line>${label}`;
    }).join("");
    const svgNodes = s.nodes.map(n => {
      const P = pos[n], type = P.p ? P.p.type : "other";
      const cls = ["person", "concept", "problem", "character"].includes(type) ? type : "other";
      const dim = matched && !matched.has(n) ? " dim" : "";
      const id = P.p ? resolve(n) : "";
      const rx = cls === "person" || cls === "character" ? P.h / 2 : (cls === "concept" ? 4 : 10);
      const text = P.lines.map((l, i) => `<tspan x="${P.x + P.w / 2}" dy="${i ? 15 : 0}">${esc(l)}</tspan>`).join("");
      const ty = P.y + P.h / 2 - (P.lines.length - 1) * 7.5 + 4.5;
      return `<g class="node ${cls}${dim}" ${id ? `data-id="${id}" role="button" tabindex="0" aria-label="${esc(P.p.title)}"` : ""}><rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" rx="${rx}"></rect><text x="${P.x + P.w / 2}" y="${ty}" text-anchor="middle">${text}</text></g>`;
    }).join("");
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Схема связей"><defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z"></path></marker><marker id="arr-s" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0 L0,5 L10,10 z"></path></marker></defs>${svgEdges}${svgNodes}</svg>`;
  }
  function renderSchemes(root, matchedFor) {
    root.querySelectorAll("figure.scheme").forEach(f => {
      const s = SCHEMES[+f.dataset.scheme];
      drawScheme(f.querySelector(".svg-host"), s, matchedFor ? matchedFor(s) : null);
    });
  }

  /* ================= карточки ================= */
  const imgSrc = p => p && p.image ? "img/" + encodeURIComponent(p.image) : "";
  const hintsOf = c => Array.isArray(c.hints) ? c.hints : (c.hints ? [c.hints] : (c.hint ? [c.hint] : []));
  function whoCard(p) {
    const facts = [p.years, p.era].filter(Boolean).join(", ");
    return { id: "w-" + p.id, type: "who", rev: 1, page: p.id, front: "Кто это?", hints: p.clues, image: p.image || "",
      back: `**${p.title}**${facts ? " (" + facts + ")" : ""} — ${p.summary || ""}`, source: "^" + ((p.lectures || [])[0] || "") };
  }
  let ALL_CARDS = null;
  function allCards() {
    if (ALL_CARDS) return ALL_CARDS;
    const out = [];
    for (const id in PAGES) {
      const p = PAGES[id];
      for (const c of p.cards || []) out.push(c);
      if ((p.type === "person" || p.type === "character") && (p.clues || []).length >= 2) out.push(whoCard(p));
    }
    return (ALL_CARDS = out);
  }
  const cardLecture = c => { const m = /\^([ЛИ]-\d+)/.exec(c.source || ""); return m ? m[1] : ""; };
  // Откуда ответ: метки времени источника карточки; у «Кто это?» — метки из подсказок-clues.
  function cardMarks(c) {
    const re = /\^([ЛИ]-\d+)@(\d{1,2}:\d{2}:\d{2})/g, out = [], seen = new Set();
    const text = c.type === "who" ? ((PAGES[c.page] || {}).clues || []).join(" ") : String(c.source || "");
    for (const m of text.matchAll(re)) { const k = m[1] + m[2]; if (!seen.has(k)) { seen.add(k); out.push({ l: m[1], t: m[2] }); } }
    return out.slice(0, 3);
  }
  function listenRow(c) {
    const ms = cardMarks(c).filter(m => { const l = lectureById(m.l); return l && l.audio; });
    if (!ms.length) return "";
    const short = t => t.replace(/^00:/, "").replace(/^0(\d:)/, "$1");
    return `<div class="listen">${ms.map(m => `<button type="button" class="btn ghost small listen-btn" data-act="play" data-l="${esc(m.l)}" data-t="${m.t}" aria-label="Послушать фрагмент лекции ${esc(m.l)}, ${m.t}">▶ Послушать <span>${esc(m.l)} · ${short(m.t)}</span></button>`).join("")}</div>`;
  }
  function cardState(c) {
    const st = store.data.cards[c.id];
    if (!st || (st.rev || 1) < (c.rev || 1)) return null;   // новая или rev повышен — прогресс сброшен
    return st;
  }
  function newQuota() {
    const nt = store.data.newToday;
    const used = nt.date === today() ? nt.count : 0;
    return Math.max(0, (+store.data.settings.newPerDay || 20) - used);
  }
  function buildQueue(filter) {
    const t = today(), due = [], fresh = [];
    for (const c of allCards()) {
      if (filter && !filter(c)) continue;
      const st = cardState(c);
      if (!st) fresh.push(c); else if (st.due <= t) due.push(c);
    }
    return { due: shuffle(due), fresh: shuffle(fresh).slice(0, newQuota()), totalNew: fresh.length };
  }
  function grade(c, g, confident) {
    const t = today();
    const prev = cardState(c);
    const st = prev ? Object.assign({}, prev) : { step: 0, reps: 0, lapses: 0, confidentErrors: 0 };
    if (!prev) {
      const nt = store.data.newToday;
      store.data.newToday = { date: t, count: (nt.date === t ? nt.count : 0) + 1 };
    }
    if (g === "good") st.step = Math.min((prev ? st.step : 0) + 1, LADDER.length - 1);
    else if (g === "again") { st.step = 0; st.lapses++; if (confident) st.confidentErrors++; }
    st.rev = c.rev || 1; st.reps++; st.last = t; st.due = addDays(t, LADDER[st.step]);
    store.data.cards[c.id] = st; store.save();
  }

  /* ================= маршрутизация ================= */
  function route() {
    closeSheet();
    SCHEMES.length = 0;
    const h = decodeURIComponent(location.hash.replace(/^#/, "")) || "/";
    const parts = h.split("/").filter(Boolean);
    $view.classList.remove("wide");
    $view.classList.toggle("is-review", parts[0] === "review");
    if (parts[0] === "review") { audio.pause(); $player.hidden = true; }   // плеер не должен закрывать кнопки ответа
    if (!parts.length) homeView();
    else if (parts[0] === "l" && PAGES[parts[1]]) lectureView(PAGES[parts[1]]);
    else if (parts[0] === "p" && PAGES[parts[1]]) entityView(PAGES[parts[1]], parts[2]);
    else if (parts[0] === "review") reviewView(parts[1] || "today", parts[2]);
    else if (parts[0] === "search") searchView();
    else if (parts[0] === "people") peopleView(parts[1] || "person", parts[2] || "guess");
    else if (parts[0] === "legend") legendView();
    else homeView();
    $view.focus({ preventScroll: true });
    if (parts[0] !== "review") { window.scrollTo(0, 0); revealInit(); }
  }

  /* ================= появление слайдов при прокрутке и «рельс» навигации ================= */
  let REVEAL = null, RAIL = null;
  function revealInit() {
    const motion = "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.toggle("motion", motion);
    $view.querySelectorAll(".slide-body > *, .timeline > li").forEach(el => el.classList.add("reveal"));
    if (REVEAL) REVEAL.disconnect();
    if (RAIL) RAIL.disconnect();
    if (!motion) return;
    REVEAL = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); REVEAL.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    $view.querySelectorAll(".reveal").forEach(el => REVEAL.observe(el));
    const links = [...$view.querySelectorAll(".rail a")];
    if (!links.length) return;
    RAIL = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", a.dataset.to === e.target.id));
    }), { rootMargin: "-45% 0px -50% 0px" });
    $view.querySelectorAll(".slide[id]").forEach(s => RAIL.observe(s));
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("resize", () => { clearTimeout(route._r); route._r = setTimeout(() => renderSchemes($view, currentMatch), 150); });
  let currentMatch = null;

  /* ================= сцена: общие элементы оформления ================= */
  // Каждый экран — «презентация»: слайды с номером, меткой в скобках и заголовком-афишей.
  const tag = t => `<span class="tag">[ ${t} ]</span>`;
  const idx = i => `<span class="idx" aria-hidden="true">${String(i).padStart(2, "0")}</span>`;
  const accentTitle = t => { const s = esc(t), k = s.lastIndexOf(" "); return k < 0 ? `<em>${s}</em>` : `${s.slice(0, k)} <em>${s.slice(k + 1)}</em>`; };   // одно акцентное слово на экран
  const NAV = [["#/people", "Лица"], ["#/legend", "Знаки"], ["#/search", "Поиск"]];
  function nav(back) {
    return `<header class="nav">${back ? `<button type="button" class="nav-back" data-act="back" aria-label="Назад">←</button>` : ""}<a class="brand" href="#/">[ Конспекты ]</a><span class="spacer"></span><nav class="nav-links">${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}</nav></header>`;
  }
  function slideHead(i, label, title) {
    return `<div class="slide-head reveal">${idx(i)}<div>${tag(label)}<h2 class="display">${title}</h2></div></div>`;
  }
  // Лица на афише: главное крупно в кольце свечения, ещё два — спутники. Нажатие — мини-карточка.
  function faceArt(list) {
    const [main, ...rest] = list;
    const face = (p, cls) => `<button type="button" class="hface ${cls} e-face" data-id="${p.id}" aria-label="${esc(p.title)}"><img src="${imgSrc(p)}" alt=""><span class="face-name">${esc(p.title)}</span></button>`;
    return `<div class="art"><div class="ring" aria-hidden="true"></div>${main ? face(main, "main") : ""}${rest.slice(0, 2).map((p, i) => face(p, "sat s" + (i + 1))).join("")}</div>`;
  }
  const glyphArt = (g, cls) => `<div class="art glyph ${cls || ""}" aria-hidden="true"><div class="ring"></div><span class="glyph-t">${esc(g)}</span></div>`;
  // Закрытые карточки-вопросы: нажатие переворачивает, повторное — возвращает вопрос.
  function qcard(i, qHtml, aHtml, extra) {
    return `<div class="qcard reveal" role="button" tabindex="0" data-act="qflip" aria-pressed="false"><div class="qcard-in">
      <div class="qf front">${idx(i)}<div class="qt">${qHtml}</div><span class="qhint">вспомни · нажми</span></div>
      <div class="qf back"><div class="qa">${aHtml}</div>${extra || ""}<span class="qhint">↺ к вопросу</span></div></div></div>`;
  }
  function qcards(md) {
    const items = []; let cur = null;
    for (const l of String(md || "").split("\n")) {
      const m = /^> \[!recall\]\s*(.*)$/.exec(l);
      if (m) { cur = { q: m[1], a: [] }; items.push(cur); } else if (cur && /^>/.test(l)) cur.a.push(l.replace(/^> ?/, ""));
    }
    if (!items.length) return blocks(md);
    return `<div class="qgrid">${items.map((it, i) => qcard(i + 1, inline(it.q), multiline(it.a.join("\n")))).join("")}</div>`;
  }

  /* ================= главная ================= */
  function homeView() {
    currentMatch = null;
    const q = buildQueue(null), n = q.due.length + q.fresh.length;
    const chron = LIB.chronicle || [];
    const lectures = chron.slice().reverse().map(id => PAGES[id]);
    const all = Object.values(PAGES), count = t => all.filter(p => p.type === t).length;
    const faces = ["p-socrates", "p-plato", "p-aristotle"].map(id => PAGES[id]).filter(p => p && p.image);
    const hasProgress = Object.keys(store.data.cards).length > 0;
    const remind = hasProgress && (!store.data.lastExport || daysBetween(store.data.lastExport, today()) >= 7);
    const stats = [["Занятий", chron.length], ["Понятий", count("concept")], ["Лиц", count("person") + count("character")], ["Карточек", allCards().length]];
    $view.innerHTML = `${nav(false)}
      <section class="slide hero">
        <div class="hero-copy reveal">
          ${tag("философия · " + chron.length + " " + plural(chron.length, "занятие", "занятия", "занятий"))}
          <h1 class="display">Мышление начинается с <em>противоречия</em></h1>
          <p class="lead">Интерактивные конспекты курса. Каждая лекция — презентация: вопросы, ход мысли, спор, схема и голос лектора.</p>
          <div class="cta">
            <button type="button" class="btn primary glow" data-act="today"${n ? "" : " disabled"}>${n ? `Повторить сегодня · ${n}` : "На сегодня всё повторено"} <span aria-hidden="true">→</span></button>
            <a class="btn ghost" href="#/people">Лица <span aria-hidden="true">✦</span></a>
          </div>
          <p class="micro">${n ? `${q.due.length} по расписанию · ${q.fresh.length} новых, вперемешку из всех лекций` : `Новых осталось: ${q.totalNew}. Лимит в день — ${esc(store.data.settings.newPerDay)}.`}</p>
        </div>
        ${faces.length ? faceArt(faces) : glyphArt("Φ")}
      </section>
      <section class="slide stats">${stats.map(([t, v], i) => `<div class="stat glass reveal">${idx(i + 1)}<b>${v}</b><span>${t}</span></div>`).join("")}</section>
      ${remind ? `<div class="slide"><div class="banner glass"><span>Давно не было резервной копии прогресса.</span><button type="button" class="btn ghost small" data-act="export">Экспорт</button></div></div>` : ""}
      <section class="slide">
        ${slideHead(1, "курс", "Лекции")}
        <div class="lec-grid">${lectures.map(lecCard).join("") || `<p class="empty">Лекций пока нет.</p>`}</div>
      </section>
      <section class="slide">
        ${slideHead(2, "прогресс", "Память — <em>у тебя</em>")}
        <div class="panel glass reveal">
          ${/^https?:$/.test(location.protocol) ? offlinePanel() + `<hr class="sep">` + syncPanel() + `<hr class="sep">` : ""}
          <div class="tools"><button type="button" class="btn ghost small" data-act="export">Экспорт прогресса</button><button type="button" class="btn ghost small" data-act="import">Импорт</button></div>
          <label class="setting">Новых карточек в день <input type="number" min="0" max="200" inputmode="numeric" data-act="newPerDay" value="${esc(store.data.settings.newPerDay)}"></label>
          <p class="empty">${SYNC.token ? "Прогресс хранится в этом браузере и в твоём закрытом Gist; синхронизация — при запуске, после повторения и по кнопке." : "Прогресс хранится только в этом браузере. Включи синхронизацию или переноси экспортом."}</p>
        </div>
      </section>`;
    checkForUpdate();
  }
  function lecCard(l) {
    const face = (l.hero || []).map(id => PAGES[id]).find(p => p && p.image);
    return `<a class="lec-card glass reveal" href="#/l/${l.id}">
      <span class="lec-num" aria-hidden="true">${esc(String(l.lecture).replace(/^Л-/, ""))}</span>
      ${face ? `<img class="lec-img" src="${imgSrc(face)}" alt="" loading="lazy">` : ""}
      <span class="lec-meta"><span class="e-date">${esc(l.date || "")}</span><span class="tag">[ ${esc(l.lecture)} ]</span></span>
      <span class="lec-t">${esc(l.title)}</span>
      <span class="lec-q">${esc(l.question || "")}</span>
      <span class="lec-go" aria-hidden="true">→</span></a>`;
  }
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };

  /* ================= лекция ================= */
  function lectureView(p) {
    currentMatch = null;
    const sec = {}; splitSections(p.body_md).forEach(s => { sec[s.title] = s.md; });
    // «Что изменилось в базе» — служебный журнал, к учёбе не относится: на экране лекции не показывается
    // Порядок слайдов — как ход презентации: вопросы → ход мысли → спор → итоговая схема.
    const order = ["Вопросы перед чтением", "Ход лекции", "Противоречие", "Схема лекции"];
    const known = new Set([...order, "Нужно уточнить", "Выгрузка из головы", "Что изменилось в базе"]);
    const list = order.concat(Object.keys(sec).filter(t => t && !known.has(t)), ["Нужно уточнить"]).filter(t => sec[t]);
    const nCards = allCards().filter(c => cardLecture(c) === p.lecture).length;
    const dump = (store.data.dumps[p.id] || {}).text || "";
    const faces = (p.hero || []).map(id => PAGES[id]).filter(x => x && x.image);
    const slides = ["Начало", ...list, "Выгрузка из головы", "Повторение"], total = slides.length - 1;
    const body = t => t === "Ход лекции" ? timeline(sec[t]) : t === "Вопросы перед чтением" ? qcards(sec[t]) : blocks(sec[t]);
    const k = list.length + 1;
    $view.innerHTML = `${nav(true)}
      <nav class="rail" aria-label="Слайды">${slides.map((t, i) => `<a href="#s${i}" data-act="slide" data-to="s${i}"><i aria-hidden="true"></i><span>${esc(t)}</span></a>`).join("")}</nav>
      <section class="slide hero" id="s0">
        <div class="hero-copy reveal">
          ${tag(`${esc(p.lecture)} · ${esc(p.date || "")} · ${esc((p.courses || []).join(", "))}`)}
          <h1 class="display">${accentTitle(p.title)}</h1>
          ${p.summary ? `<p class="lead">${inline(p.summary)}</p>` : ""}
          ${p.question ? `<div class="question glass corners"><span class="q-label">Центральный вопрос</span><p>${inline(p.question)}</p></div>` : ""}
          <div class="cta">
            <a class="btn primary glow" href="#/review/lecture/${encodeURIComponent(p.lecture)}">Карточки · ${nCards} <span aria-hidden="true">→</span></a>
            ${p.audio ? `<button type="button" class="btn ghost" data-act="play" data-l="${esc(p.lecture)}" data-t="00:00:00">▶ Запись</button>` : ""}
          </div>
          ${p.teacher ? `<p class="micro">${esc(p.teacher)}</p>` : ""}
        </div>
        ${faces.length ? faceArt(faces) : glyphArt(String(p.lecture).replace(/^Л-/, ""), "num")}
        <a class="scroll-hint" href="#s1" data-act="slide" data-to="s1">листай <span aria-hidden="true">↓</span></a>
      </section>
      ${list.map((t, i) => `<section class="slide" id="s${i + 1}" data-sec="${esc(t)}">
        ${slideHead(i + 1, `${i + 1} / ${total}`, esc(t))}
        <div class="slide-body prose">${body(t)}</div></section>`).join("")}
      <section class="slide" id="s${k}">
        ${slideHead(k, `${k} / ${total}`, "Выгрузка из головы")}
        <div class="dump panel glass reveal">
          <p class="lead">${inline((sec["Выгрузка из головы"] || "Запиши всё, что помнишь по лекции.").split("\n")[0])}</p>
          <textarea data-dump="${p.id}" placeholder="Всё, что помню…">${esc(dump)}</textarea>
          <div class="row"><button type="button" class="btn ghost" data-act="compare" data-id="${p.id}">Сравнить со схемой</button></div>
          <div class="result" data-dump-result></div>
        </div>
      </section>
      <section class="slide finale" id="s${k + 1}">
        <div class="finale-in glass corners reveal">
          ${tag(`${k + 1} / ${total} · финал`)}
          <h2 class="display">Закрепи <em>память</em></h2>
          <p class="lead">${nCards} ${plural(nCards, "карточка", "карточки", "карточек")} этой лекции — с интервальным повторением.</p>
          <a class="btn primary glow" href="#/review/lecture/${encodeURIComponent(p.lecture)}">Начать повторение <span aria-hidden="true">→</span></a>
        </div>
      </section>`;
    renderSchemes($view);
  }
  function timeline(md) {
    const items = md.split("\n").filter(l => /^\d+\.\s/.test(l)).map(l => l.replace(/^\d+\.\s/, ""));
    if (!items.length) return blocks(md);
    return `<ol class="timeline">${items.map((text, i) => {
      const m = /\^([ЛИ]-\d+)@(\d{1,2}:\d{2}:\d{2})/.exec(text);
      const body = m ? text.replace(m[0], "").replace(/\s+\./, ".") : text;
      const tm = m ? m[2].replace(/^00:/, "").replace(/^0(\d:)/, "$1") : "";
      const time = m ? `<button type="button" class="tl-time e-prov${lectureById(m[1]) && lectureById(m[1]).audio ? " has-audio" : ""}" data-l="${esc(m[1])}" data-t="${m[2]}" aria-label="Фрагмент ${m[2]}">${tm}</button>` : "";
      return `<li><span class="tl-dot" aria-hidden="true"></span><div class="tl-card glass"><div class="tl-top">${idx(i + 1)}${time}</div><div class="tl-body">${inline(body)}</div></div></li>`;
    }).join("")}</ol>`;
  }
  function dumpCompare(p) {
    const ta = $view.querySelector(`textarea[data-dump="${p.id}"]`);
    const text = norm(ta.value);
    store.data.dumps[p.id] = { text: ta.value, date: today() }; store.save();
    const md = (splitSections(p.body_md).find(s => s.title === "Схема лекции") || {}).md || "";
    const rest = md.split("\n").filter(l => /^>/.test(l)).map(l => l.replace(/^> ?/, ""));
    const s = parseScheme(rest.slice(1));
    const stem = w => w.length > 5 ? w.slice(0, w.length - 2) : w;
    const hit = n => {
      const pg = pageOf(n), cands = [n, ...(pg ? [pg.title, ...(pg.aliases || [])] : [])];
      return cands.some(c => { const words = norm(c).split(/\s+/).filter(w => w.length > 2); return words.length && words.every(w => text.includes(stem(w))); });
    };
    const matched = new Set(s.nodes.filter(hit));
    const host = $view.querySelector("[data-dump-result]");
    SCHEMES.push(s);
    host.innerHTML = `<p class="stat">Упомянуто узлов схемы: ${matched.size} из ${s.nodes.length}. Тусклые — то, о чём ты не написал.</p><figure class="scheme" data-scheme="${SCHEMES.length - 1}"><div class="svg-host"></div></figure>`;
    drawScheme(host.querySelector(".svg-host"), s, matched);
    currentMatch = sc => sc === s ? matched : null;
  }

  /* ================= сущность ================= */
  function entityView(p, hlLecture) {
    currentMatch = null;
    const secs = splitSections(p.body_md);
    const base = ["Основные идеи", "Противоречия и споры", "Связи"];
    const ordered = [...secs.filter(s => s.title === "Основные идеи"), ...secs.filter(s => s.title && !base.includes(s.title) && s.title !== "Карточки"),
      ...secs.filter(s => s.title === "Противоречия и споры"), ...secs.filter(s => s.title === "Связи")];
    const facts = [p.years && `<span class="e-date">${esc(p.years)}</span>`, p.era && `<span>${esc(p.era)}</span>`].filter(Boolean).join("");
    const lectures = (p.lectures || []).map(code => lectureById(code)).filter(Boolean);
    const backs = (p.backlinks || []).map(id => PAGES[id]).filter(b => b && b.type !== "lecture");
    const art = p.image
      ? `<figure class="art portrait-art"><div class="ring" aria-hidden="true"></div><img src="${imgSrc(p)}" alt="${esc(p.title)}"><figcaption>${esc(p.image_credit || "")}</figcaption></figure>`
      : glyphArt(TYPE_ICON[p.type] || "◆", p.type);
    let n = 0;
    const clues = p.clues || [], cards = p.cards || [];
    $view.innerHTML = `${nav(true)}
      <section class="slide hero ent ent-${p.type}">
        <div class="hero-copy reveal">
          ${tag(`<span class="type-badge ${p.type}">${TYPE_ICON[p.type] || ""} ${TYPE_RU[p.type].toLowerCase()}</span>`)}
          <h1 class="display">${accentTitle(p.title)}</h1>
          ${facts ? `<div class="facts">${facts}</div>` : ""}
          <p class="lead">${inline(p.summary || "")}</p>
          ${lectures.length ? `<div class="chips"><span class="micro">Что добавила лекция:</span>${lectures.map(l => `<button type="button" class="btn ghost small" data-act="hl" data-l="${esc(l.lecture)}" aria-pressed="${hlLecture === l.lecture}">${esc(l.lecture)}</button>`).join("")}</div>` : ""}
        </div>
        ${art}
      </section>
      ${clues.length ? `<section class="slide">${slideHead(++n, "для узнавания", "Ключевое")}<div class="clue-grid">${clues.map((c, i) => `<div class="clue glass reveal">${idx(i + 1)}<p>${inline(c)}</p></div>`).join("")}</div></section>` : ""}
      ${ordered.map(s => `<section class="slide">${slideHead(++n, "раздел", esc(s.title))}<div class="slide-body prose">${blocks(s.md)}</div></section>`).join("")}
      ${cards.length ? `<section class="slide">${slideHead(++n, "самопроверка", "Карточки")}<div class="qgrid">${cards.map((c, i) => qcard(i + 1, inline(c.front), multiline(c.back), listenRow(c))).join("")}</div>
        <div class="cta"><a class="btn primary glow" href="#/review/page/${p.id}">Повторить по расписанию · ${cards.length} <span aria-hidden="true">→</span></a></div></section>` : ""}
      <section class="slide">${slideHead(++n, "связи", "Где встречалось")}
        <div class="lec-grid mini">${lectures.map(lecCard).join("")}</div>
        ${backs.length ? `<div class="chips links">${backs.map(b => entityLink(b.title, b.title)).join("")}</div>` : ""}
      </section>`;
    renderSchemes($view);
    if (hlLecture) highlightLecture(hlLecture);
  }
  function highlightLecture(code) {
    $view.querySelectorAll(".prose p, .prose li, .prose .side, .prose .resolve, .prose td").forEach(el => {
      const has = [...el.querySelectorAll(".e-prov")].some(b => b.dataset.l === code);
      el.classList.toggle("hl-lecture", has);
    });
  }

  /* ================= полоска шагов раскрытия: 1 · 2 · 3 · Фото · Имя ================= */
  // Каждая ступень — независимый переключатель: открыть и снова скрыть можно любую, в любом порядке.
  // Открытая ступень «горит» (заливка), следующая — контур акцентом, остальные — тихий контур.
  // noPhoto: у лица нет изображения — ступень «Фото» видна, но неактивна, чтобы было понятно почему.
  function stepStrip(labels, act, noPhoto) {
    const chips = labels.map((l, i) =>
      `<button type="button" class="step-chip${i === 0 ? " next" : ""}" data-act="${act}" data-slot="${i}" aria-pressed="false" aria-label="${l.length < 3 ? "Подсказка " + l : l}">${esc(l)}</button>`);
    if (noPhoto) chips.splice(labels.length - (labels[labels.length - 1] === "Имя" ? 1 : 0), 0, `<button type="button" class="step-chip none" disabled title="Изображения нет" aria-label="Изображения нет">Фото —</button>`);
    return `<div class="steps" role="group" aria-label="Ступени раскрытия"><span class="steps-label">Открыть:</span>${chips.join("")}</div>`;
  }
  function toggleSlot(root, i) {
    const el = root.querySelector(`[data-slot="${i}"]:not(.step-chip)`); if (!el) return;
    el.hidden = !el.hidden;
    const chips = [...root.querySelectorAll(".step-chip[data-slot]")];
    root.querySelector(`.step-chip[data-slot="${i}"]`).setAttribute("aria-pressed", String(!el.hidden));
    const next = chips.find(b => b.getAttribute("aria-pressed") !== "true");
    chips.forEach(b => b.classList.toggle("next", b === next));
    return el;
  }
  const hintLi = (html, i, hidden) => `<li class="hint" data-slot="${i}"${hidden ? " hidden" : ""}><b class="n">${i + 1}</b><span>${html}</span></li>`;

  /* ================= лица: личности и персонажи ================= */
  let peopleTab = "person", peopleMode = "guess";
  function peopleTile(p, open) {
    const clues = p.clues || [], img = imgSrc(p), n = clues.length;
    const facts = [p.years, p.era].filter(Boolean).join(" · ");
    const name = (slot) => `<div class="tile-name"${slot != null ? ` data-slot="${slot}" hidden` : ""}><a href="#/p/${p.id}">${esc(p.title)}</a>${facts ? `<span>${esc(facts)}</span>` : ""}</div>`;
    const pic = (slot) => img ? `<div class="tile-img"${slot != null ? ` data-slot="${slot}" hidden` : ""}><img src="${img}" alt="${slot != null ? "Изображение-подсказка" : esc(p.title)}" loading="lazy"></div>` : "";
    if (open) return `<article class="tile open" data-tile="${p.id}">${pic(null)}${name(null)}<ol class="ladder">${clues.map((c, i) => hintLi(inline(c), i, false)).join("")}</ol></article>`;
    return `<article class="tile" data-tile="${p.id}"><p class="tile-q">Кто это?</p><ol class="ladder">${clues.map((c, i) => hintLi(inline(c), i, true)).join("")}</ol>${pic(n)}${name(img ? n + 1 : n)}
      ${stepStrip(peopleLabels(p), "people-goto", !img)}<div class="tile-actions"><button type="button" class="btn quiet small" data-act="people-reset" aria-label="Скрыть всё раскрытое">Скрыть всё</button></div></article>`;
  }
  const peopleLabels = p => [...(p.clues || []).map((_, i) => String(i + 1)), ...(p.image ? ["Фото"] : []), "Имя"];
  function peopleToggle(tile, i) {
    const el = toggleSlot(tile, i), p = PAGES[tile.dataset.tile];
    if (el && el.classList.contains("tile-name")) { const im = tile.querySelector(".tile-img img"); if (im) im.alt = el.hidden ? "Изображение-подсказка" : p.title; }
  }
  function peopleView(tab, mode, reshuffle) {
    currentMatch = null; peopleTab = tab === "character" ? "character" : "person"; peopleMode = mode === "browse" ? "browse" : "guess";
    let list = Object.values(PAGES).filter(p => p.type === peopleTab);
    list = reshuffle || peopleMode === "guess" ? shuffle(list) : list.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    const nP = Object.values(PAGES).filter(p => p.type === "person").length, nC = Object.values(PAGES).filter(p => p.type === "character").length;
    $view.classList.add("wide");
    $view.innerHTML = `${nav(true)}
      <section class="slide hero short">
        <div class="hero-copy reveal">
        ${tag("личности и персонажи")}
        <h1 class="display">Кто <em>это?</em></h1>
        <p class="lead">Узнай по подсказкам: от наименее очевидной к самой очевидной, затем изображение, затем имя.</p>
        <div class="cta"><a class="btn primary glow" href="#/review/people">Повторить «Кто это?» <span aria-hidden="true">→</span></a></div>
        </div>
      </section>
      <section class="slide">
      <div class="seg" role="tablist"><button type="button" class="btn small" role="tab" data-act="people-tab" data-v="person" aria-pressed="${peopleTab === "person"}">Личности · ${nP}</button><button type="button" class="btn small" role="tab" data-act="people-tab" data-v="character" aria-pressed="${peopleTab === "character"}">Персонажи · ${nC}</button></div>
      <div class="seg"><button type="button" class="btn small" data-act="people-mode" data-v="guess" aria-pressed="${peopleMode === "guess"}">Угадывать</button><button type="button" class="btn small" data-act="people-mode" data-v="browse" aria-pressed="${peopleMode === "browse"}">Просмотр</button>${peopleMode === "guess" ? `<button type="button" class="btn quiet small" data-act="people-shuffle">Перемешать</button>` : ""}</div>
      <div class="tiles">${list.map(p => peopleTile(p, peopleMode === "browse")).join("")}</div>
      </section>`;
  }

  /* ================= обозначения (легенда конспектного языка) ================= */
  function legendView() {
    currentMatch = null;
    const ex = (md, what) => `<tr><td>${inline(md)}</td><td>${what}</td></tr>`;
    const pick = type => Object.values(PAGES).find(p => p.type === type);
    const pp = pick("person"), cc = pick("concept"), pr = pick("problem"), ch = pick("character");
    $view.innerHTML = `${nav(true)}
      <section class="slide hero short"><div class="hero-copy reveal">
        ${tag("конспектный язык")}
        <h1 class="display">Знаки и <em>формы</em></h1>
        <p class="lead">Каждая категория слов везде выглядит одинаково: узнаёшь её взглядом, не читая.</p>
      </div></section>
      <section class="slide legend-slide prose">
      <h2>Кто и что</h2>
      <div class="table-wrap prose"><table class="legend"><tbody>
        ${pp ? ex(`[[${pp.title}]]`, "философ, учёный, писатель — нажми: годы, портрет, суть") : ""}
        ${ch ? ex(`[[${ch.title}]]`, "персонаж мифа или литературы") : ""}
        ${cc ? ex(`[[${cc.title}]]`, "понятие — нажми: сначала вопрос «что это?»") : ""}
        ${pr ? ex(`[[${pr.title}]]`, "проблема, спор — нажми: позиции A ⇄ B") : ""}
        ${ex("{{дата:XV в.}}", "дата, век, эпоха, стиль")}
        ${ex("{{место:Египет}}", "место")}
        ${ex("{{число:160 доказательств}}", "число, мера")}
        ${ex("{{труд:Золотая ветвь}}", "книга, труд, произведение")}
        ${ex("{{слово:φύσις}}", "иноязычное слово, термин в оригинале")}
        ${ex("{{цитата:Нет ощущений, нет мыслей}}", "слова лектора дословно")}
        ${ex("{{?:Цзэ}}", "неясное место записи — нужно уточнить")}
      </tbody></table></div>
      <h2>Откуда факт</h2>
      <div class="table-wrap prose"><table class="legend"><tbody>
        ${ex("^Л-01@00:24:41", "сказано на лекции; ▶ — послушать фрагмент")}
        ${ex("^справка", "проверенный справочный факт не из лекции")}
        ${ex("^синтез", "вывод при разборе, не слова лектора")}
      </tbody></table></div>
      <h2>Связки между мыслями</h2>
      <div class="table-wrap prose"><table class="legend ops"><tbody>
        ${Object.entries(OPS).map(([k, v]) => `<tr><td>${ops(k)}</td><td>${esc(v)}</td></tr>`).join("")}
      </tbody></table></div>
      <h2>Форма мысли</h2>
      <div class="prose">
        ${blocks("> [!def] Термин\n> Формулировка определения")}
        ${blocks("> [!key]\n> Главная мысль раздела — то, что надо унести с собой")}
        ${blocks("> [!chain] Цепочка вывода\n> Первый шаг\n> ⇒ почему\n> Второй шаг\n> Вывод")}
        ${blocks("> [!compare] A | B\n> признак | у A | у B")}
        ${blocks("> [!example]\n> Пример, иллюстрация")}
        ${blocks("> [!quote]\n> Слова лектора крупно")}
        ${blocks("> [!list] Перечень\n> Пункт — пояснение\n> Пункт — пояснение")}
        ${blocks("> [!contradiction] Спор\n> A: одна позиция\n> B: другая позиция\n> Как снимается: решение")}
        ${blocks("> [!recall] Вопрос самопроверки\n> Ответ скрыт до нажатия")}
      </div></section>`;
  }

  /* ================= поиск и указатель ================= */
  function searchView() {
    currentMatch = null;
    $view.innerHTML = `${nav(true)}
      <section class="slide hero short"><div class="hero-copy reveal">
        ${tag("указатель")}
        <h1 class="display">Найти <em>мысль</em></h1>
        <div class="search"><input type="search" placeholder="Имя, понятие, синоним…" aria-label="Поиск" autocomplete="off"></div>
      </div></section>
      <section class="slide"><div data-results></div></section>`;
    const input = $view.querySelector("input"), out = $view.querySelector("[data-results]");
    const draw = () => {
      const q = norm(input.value.trim());
      const hits = Object.values(PAGES).filter(p => p.type !== "lecture" && (!q || [p.title, ...(p.aliases || [])].some(n => norm(n).includes(q))));
      out.innerHTML = ["concept", "problem", "person", "character"].map(t => {
        const list = hits.filter(p => p.type === t).sort((a, b) => a.title.localeCompare(b.title, "ru"));
        return list.length ? `<div class="group"><div class="gt">${TYPE_PLURAL[t]} · ${list.length}</div><ul>${list.map(p => `<li>${entityLink(p.title, p.title)}</li>`).join("")}</ul></div>` : "";
      }).join("") || `<p class="empty">Ничего не найдено.</p>`;
    };
    input.addEventListener("input", draw); draw();
  }

  /* ================= мини-карточка ================= */
  const $sheet = document.getElementById("sheet"), $back = document.getElementById("sheet-backdrop");
  function openSheet(html) {
    $sheet.innerHTML = `<div class="grab" aria-hidden="true"></div>${html}`;
    $sheet.hidden = false; $back.hidden = false;
    const f = $sheet.querySelector("button, a"); if (f) f.focus({ preventScroll: true });
  }
  function closeSheet() { $sheet.hidden = true; $back.hidden = true; $sheet.innerHTML = ""; }
  function entitySheet(id) {
    const p = PAGES[id]; if (!p) return;
    const open = `<a class="btn" href="#/p/${id}">Открыть страницу</a>`;
    if (p.type === "person" || p.type === "character") {
      const facts = [p.years && `<span class="e-date">${esc(p.years)}</span>`, p.era && esc(p.era)].filter(Boolean).join(" · ");
      const img = p.image ? `<img class="sheet-img" src="${imgSrc(p)}" alt="${esc(p.title)}">` : "";
      openSheet(`<div class="sheet-head">${img}<div><p class="eyebrow"><span class="type-badge ${p.type}">${TYPE_ICON[p.type]} ${TYPE_RU[p.type]}</span></p><h3>${esc(p.title)}</h3>${facts ? `<p class="facts">${facts}</p>` : ""}</div></div><div class="body">${inline(p.summary || "")}</div><div class="actions">${open}<button type="button" class="btn quiet" data-act="close">Закрыть</button></div>`);
    } else if (p.type === "concept") {
      openSheet(`<p class="eyebrow"><span class="type-badge concept">◆ Понятие</span></p><h3>Что такое «${esc(p.title)}»?</h3><p class="empty">Сначала вспомни сам.</p><div class="body" data-answer hidden>${inline(p.summary || "")}</div><div class="actions"><button type="button" class="btn primary" data-act="sheet-reveal">Показать</button>${open}</div>`);
    } else if (p.type === "problem") {
      const md = (p.body_md.split("\n").join("\n").match(/> \[!contradiction\][^\n]*\n((?:>[^\n]*\n?)+)/) || [])[1] || "";
      const c = parseContra(md.split("\n").map(l => l.replace(/^> ?/, "")));
      openSheet(`<p class="eyebrow"><span class="type-badge problem">⇄ Проблема</span></p><h3>${esc(p.title)}</h3>${c.a ? `<div class="contra"><div class="sides"><div class="side"><b>A</b>${inline(c.a)}</div><div class="vs">⇄</div><div class="side"><b>B</b>${inline(c.b)}</div></div></div>` : `<div class="body">${inline(p.summary || "")}</div>`}<div class="actions">${open}<button type="button" class="btn quiet" data-act="close">Закрыть</button></div>`);
    }
  }
  function provSheet(code, time) {
    const lec = lectureById(code);
    const canPlay = time && lec && lec.audio;
    openSheet(`<p class="eyebrow">Источник</p><h3>${esc(code)}${lec ? " · " + esc(lec.title) : ""}</h3><div class="body">${time ? `Сказано на лекции, отметка <span class="e-date">${esc(time)}</span>.` : "Сказано на лекции."}</div><div class="actions">${canPlay ? `<button type="button" class="btn primary" data-act="play" data-l="${esc(code)}" data-t="${esc(time)}">▶ Послушать фрагмент</button>` : ""}${lec ? `<a class="btn" href="#/l/${lec.id}">Открыть лекцию</a>` : ""}</div>`);
  }

  /* ================= аудио ================= */
  const audio = new Audio(); audio.preload = "none";
  const $player = document.getElementById("player");
  function play(code, time) {
    const lec = lectureById(code); if (!lec || !lec.audio) return;
    // сначала копия внутри приложения, затем папка лекций рядом с app/
    const cands = ["audio/" + encodeURIComponent(code) + ".m4a", "../Лекции/" + lec.audio.split("/").map(encodeURIComponent).join("/")];
    const start = Math.max(0, secOf(time) - 2);
    if (audio.dataset.lec === code && audio.dataset.ok === "1") { try { audio.currentTime = start; } catch (e) {} audio.play().catch(() => {}); }
    else {
      audio.dataset.lec = code; audio.dataset.ok = ""; audio.dataset.i = "0"; audio.dataset.start = start;
      // сначала запись из памяти устройства (офлайн), потом сеть
      cachedAudio(code).then(local => { audio.dataset.cands = JSON.stringify(local ? [local, ...cands] : cands); loadAudio(); });
    }
    $player.hidden = false;
    $player.innerHTML = `<span class="label">▶ ${esc(code)} · ${esc(time)}</span><button type="button" data-act="pause" aria-label="Пауза">❚❚</button><button type="button" data-act="stop" aria-label="Закрыть плеер">✕</button>`;
    closeSheet();
  }
  function loadAudio() {
    const cands = JSON.parse(audio.dataset.cands || "[]"), i = +audio.dataset.i;
    audio.src = cands[i]; audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => { audio.dataset.ok = "1"; try { audio.currentTime = +audio.dataset.start; } catch (e) {} audio.play().catch(() => {}); }, { once: true });
    audio.load();
  }
  audio.addEventListener("error", () => {
    const cands = JSON.parse(audio.dataset.cands || "[]"), i = +audio.dataset.i + 1;
    if (i < cands.length) { audio.dataset.i = i; return loadAudio(); }
    $player.hidden = true;
    if (!navigator.onLine) return toast("Этой записи нет на устройстве. При интернете нажми на главной «Обновить базу и записи».");
    // Частая причина — приложение открыто из кэша, а локальный сервер не запущен: записи в кэш не входят.
    fetch("index.html", { method: "HEAD", cache: "no-store" })
      .then(r => { if (!r.ok) throw 0; toast("Запись не найдена: " + cands.map(decodeURIComponent).join(" и ") + ". Положи AAC-копию лекции в app/audio/."); })
      .catch(() => toast("Запись играет только с компьютера, где запущен сервер конспектов: открой «Открыть конспекты.bat» в папке проекта."));
  });

  /* ================= повторение ================= */
  let session = null;
  function reviewView(mode, arg) {
    currentMatch = null;
    let filter = null, title = "Повторить сегодня", backTo = "#/";
    if (mode === "lecture") { const code = decodeURIComponent(arg || ""); filter = c => cardLecture(c) === code; title = "Карточки " + code; const l = lectureById(code); if (l) backTo = "#/l/" + l.id; }
    if (mode === "page") { filter = c => c.page === arg; title = PAGES[arg] ? PAGES[arg].title : "Карточки"; backTo = "#/p/" + arg; }
    if (mode === "people") { filter = c => c.type === "who"; title = "Кто это?"; backTo = "#/people"; }
    const cram = mode === "cram";
    if (cram) { const [m2, a2] = (arg || "").split(":"); if (m2 === "lecture") filter = c => cardLecture(c) === a2; if (m2 === "page") filter = c => c.page === a2; title = "Прогон без расписания"; }
    const q = cram ? { due: shuffle(allCards().filter(c => !filter || filter(c))), fresh: [] } : buildQueue(filter);
    session = { queue: shuffle([...q.due, ...q.fresh]), i: 0, title, backTo, cram, stats: { good: 0, hard: 0, again: 0 }, confErrors: [], seen: new Set(), arg: mode + (arg ? ":" + arg : "") };
    session.total = session.queue.length;
    drawCard();
  }
  function drawCard() {
    const s = session;
    if (s.i >= s.queue.length) return drawDone();
    const c = s.queue[s.i], explain = c.type === "explain", pg = PAGES[c.page];
    const img = c.type === "who" ? imgSrc(pg) : "";
    s.conf = null; s.flipped = false;
    s.steps = [...hintsOf(c).map(h => ({ kind: "hint", html: inline(h) })), ...(img ? [{ kind: "img", html: `<img src="${img}" alt="Изображение-подсказка">` }] : [])];
    const where = c.type === "who" ? (pg ? TYPE_RU[pg.type] : "") : (pg ? pg.title : "");
    const doneN = s.seen.size, pct = s.total ? Math.round(doneN / s.total * 100) : 0;
    $view.innerHTML = `
      <div class="review">
        <div class="bar"><a class="link-btn" href="${s.backTo}" aria-label="Закончить">✕</a><div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div><span class="count">${doneN} / ${s.total}</span></div>
        <div class="stage"><div class="flip" data-flip>
          <div class="face front">
            <div class="kind">${esc(CARD_RU[c.type] || c.type)} · ${esc(where)}${s.cram ? " · без расписания" : ""}</div>
            <div class="front-text">${inline(c.front)}</div>
            ${s.steps.length ? `<ol class="ladder" data-ladder>${s.steps.map((st, i) => st.kind === "hint" ? hintLi(st.html, i, true) : `<li class="img" data-slot="${i}" hidden><span>${st.html}</span></li>`).join("")}</ol>${stepStrip(s.steps.map((st, i) => st.kind === "img" ? "Фото" : String(i + 1)), "goto", c.type === "who" && !img)}` : ""}
            ${explain ? `<textarea aria-label="Ответь своими словами" placeholder="Ответь своими словами (можно пропустить)"></textarea>` : ""}
          </div>
          <div class="face back">
            <div class="back-q">${inline(c.front)}</div>
            ${img ? `<img class="who-img" src="${img}" alt="">` : ""}
            <div class="back-text">${multiline(c.back)}</div>
            ${listenRow(c)}
            ${c.checklist && c.checklist.length ? `<ul class="checklist">${c.checklist.map(it => `<li><button type="button" class="btn small" data-act="check" aria-pressed="false">назвал?</button><span>${inline(it)}</span></li>`).join("")}</ul>` : ""}
            ${c.more ? `<button type="button" class="btn quiet small" data-act="more">Подробнее</button><div class="more" hidden>${inline(c.more)}</div>` : ""}
          </div>
        </div></div>
        <div class="actions" data-actions>
          <p class="note">Ответь в голове. Насколько уверен?</p>
          <div class="row2"><button type="button" class="btn" data-act="conf" data-v="1" aria-pressed="false">Уверен</button><button type="button" class="btn" data-act="conf" data-v="0" aria-pressed="false">Не уверен</button></div>
          <button type="button" class="btn primary block" data-act="flip" disabled>Показать ответ</button>
        </div>
      </div>`;
  }
  function showGrades() {
    const s = session, c = s.queue[s.i];
    s.flipped = true;
    $view.querySelector("[data-flip]").classList.add("flipped");
    $view.querySelector("[data-actions]").innerHTML = `
      <p class="note">${s.conf ? "Ты был уверен." : "Ты не был уверен."} Как ответил?</p>
      <button type="button" class="btn quiet small" data-act="toggle-flip">↺ Вернуться к вопросу</button>
      <div class="row3"><button type="button" class="btn grade-again" data-act="grade" data-g="again">Не знал</button><button type="button" class="btn" data-act="grade" data-g="hard">С трудом</button><button type="button" class="btn primary" data-act="grade" data-g="good">Знал</button></div>`;
    const ta = $view.querySelector(".face.front textarea");
    if (ta && ta.value.trim()) $view.querySelector(".back-text").insertAdjacentHTML("afterbegin", `<p class="back-q">Твой ответ: ${esc(ta.value.trim())}</p>`);
    void c;
  }
  function applyGrade(g) {
    const s = session, c = s.queue[s.i];
    if (!s.cram) grade(c, g, s.conf);
    s.stats[g]++; s.seen.add(c.id);
    if (g === "again") {
      if (s.conf) { s.confErrors.push(c); s.queue.splice(Math.min(s.i + 4, s.queue.length), 0, c); }   // уверенная ошибка — через 3–4 карточки
      else s.queue.push(c);                                                                           // в конец сессии
      s.total = Math.max(s.total, s.seen.size);
    }
    s.i++;
    drawCard();
  }
  function drawDone() {
    const s = session, st = s.stats;
    syncNow(true);
    const uniq = [...new Map(s.confErrors.map(c => [c.id, c])).values()];
    $view.innerHTML = `
      <div class="done">
        <p class="eyebrow">${esc(s.title)}</p>
        ${s.total ? `<p class="num">Готово: ${s.seen.size} ${plural(s.seen.size, "карточка", "карточки", "карточек")}</p>
        <p class="empty">Знал — ${st.good} · С трудом — ${st.hard} · Не знал — ${st.again}</p>
        ${uniq.length ? `<h2>Уверенные ошибки</h2><ul>${uniq.map(c => `<li>${inline(c.front)}</li>`).join("")}</ul>` : ""}`
        : `<p class="num">Сейчас повторять нечего</p><p class="empty">Карточки по расписанию появятся в свой день. Новые ограничены лимитом в день.</p>
           ${s.arg !== "today" ? `<a class="btn" href="#/review/cram/${esc(s.arg.replace(/^(lecture|page):/, "$1:"))}">Прогнать все без расписания</a>` : ""}`}
        <p><a class="btn primary" href="${s.backTo}">Вернуться</a></p>
      </div>`;
  }

  /* ================= экспорт / импорт ================= */
  function exportProgress() {
    store.data.lastExport = today(); store.save();
    const data =JSON.stringify({ app: "konspekty", version: 1, exported: new Date().toISOString(), progress: store.data }, null, 1);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = `konspekty-progress-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Файл прогресса сохранён.");
    if (!location.hash || location.hash === "#/") route();
  }
  function importProgress() {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      f.text().then(t => {
        const j = JSON.parse(t), p = j.progress || j;
        if (!p || typeof p.cards !== "object") throw new Error("format");
        store.data = Object.assign(store.load(), p); store.save();
        toast(`Импортировано: ${Object.keys(p.cards).length} карточек.`); route();
      }).catch(() => toast("Не удалось прочитать файл прогресса."));
    };
    inp.click();
  }

  /* ================= события ================= */
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-act], .e-person, .e-character, .e-concept, .e-problem, .e-face, .e-prov[data-l], .scheme .node[data-id]");
    if (!t) { if (e.target === $back) closeSheet(); return; }
    const act = t.dataset.act;
    if (!act) {
      if (t.classList.contains("e-prov")) return provSheet(t.dataset.l, t.dataset.t);
      return entitySheet(t.dataset.id);
    }
    switch (act) {
      case "reveal": { const a = t.nextElementSibling; a.hidden = false; t.hidden = true; break; }
      case "qflip": { if (getSelection && String(getSelection()).length) break; const on = t.getAttribute("aria-pressed") !== "true"; t.setAttribute("aria-pressed", String(on)); break; }
      case "slide": { e.preventDefault(); const s = document.getElementById(t.dataset.to); if (s) s.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); break; }
      case "today": location.hash = "#/review/today"; break;
      case "export": exportProgress(); break;
      case "update-base": updateBase(t); break;
      case "sync": syncNow(false).then(route); break;
      case "sync-on": { const v = ($view.querySelector("[data-token]") || {}).value || ""; if (!v.trim()) { toast("Вставь токен GitHub."); break; } SYNC = { token: v.trim() }; saveSync(); t.disabled = true; syncNow(false).then(() => { if (!SYNC.gistId) { SYNC = {}; saveSync(); } route(); }); break; }
      case "sync-off": SYNC = {}; saveSync(); route(); toast("Синхронизация на этом устройстве отключена."); break;
      case "import": importProgress(); break;
      case "compare": dumpCompare(PAGES[t.dataset.id]); break;
      case "back": history.length > 1 ? history.back() : (location.hash = "#/"); break;
      case "hl": { const on = t.getAttribute("aria-pressed") !== "true"; $view.querySelectorAll('[data-act="hl"]').forEach(b => b.setAttribute("aria-pressed", "false")); t.setAttribute("aria-pressed", String(on)); if (on) highlightLecture(t.dataset.l); else $view.querySelectorAll(".hl-lecture").forEach(el => el.classList.remove("hl-lecture")); break; }
      case "close": closeSheet(); break;
      case "sheet-reveal": { $sheet.querySelector("[data-answer]").hidden = false; t.remove(); break; }
      case "play": play(t.dataset.l, t.dataset.t); break;
      case "pause": if (audio.paused) { audio.play().catch(() => {}); t.textContent = "❚❚"; } else { audio.pause(); t.textContent = "▶"; } break;
      case "stop": audio.pause(); $player.hidden = true; break;
      case "hint": { t.nextElementSibling.hidden = false; t.remove(); break; }
      case "goto": toggleSlot($view.querySelector(".face.front"), +t.dataset.slot); break;
      case "people-goto": peopleToggle(t.closest("[data-tile]"), +t.dataset.slot); break;
      case "toggle-flip": { const f = $view.querySelector("[data-flip]"); const back = f.classList.toggle("flipped"); t.textContent = back ? "↺ Вернуться к вопросу" : "↻ Снова к ответу"; break; }
      case "people-reset": { const tile = t.closest("[data-tile]"); tile.outerHTML = peopleTile(PAGES[tile.dataset.tile], false); break; }
      case "people-tab": location.hash = "#/people/" + t.dataset.v + "/" + (peopleMode || "guess"); break;
      case "people-mode": location.hash = "#/people/" + (peopleTab || "person") + "/" + t.dataset.v; break;
      case "people-shuffle": peopleView(peopleTab, peopleMode, true); break;
      case "more": { t.nextElementSibling.hidden = false; t.remove(); break; }
      case "conf": { session.conf = t.dataset.v === "1"; $view.querySelectorAll('[data-act="conf"]').forEach(b => b.setAttribute("aria-pressed", String(b === t))); $view.querySelector('[data-act="flip"]').disabled = false; break; }
      case "flip": showGrades(); break;
      case "grade": applyGrade(t.dataset.g); break;
      case "check": { const on = t.getAttribute("aria-pressed") !== "true"; t.setAttribute("aria-pressed", String(on)); t.textContent = on ? "назвал" : "назвал?"; break; }
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$sheet.hidden) return closeSheet();
    if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("qcard")) { e.preventDefault(); e.target.click(); return; }
    const n = e.target.closest && e.target.closest(".scheme .node[data-id]");
    if (n && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); entitySheet(n.dataset.id); }
  });
  document.addEventListener("change", e => {
    if (e.target.dataset && e.target.dataset.act === "newPerDay") {
      const v = Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0));
      store.data.settings.newPerDay = v; store.save(); route();
    }
  });
  document.addEventListener("input", e => {
    const id = e.target.dataset && e.target.dataset.dump;
    if (id) { store.data.dumps[id] = { text: e.target.value, date: today() }; store.save(); }
  });

  /* ================= офлайн (только по http/https; с file:// не нужен) ================= */
  /* ================= офлайн: записи на устройстве и обновление базы ================= */
  // Записи (по ~40 МБ) лежат в отдельном кэше и переживают обновления приложения.
  // Играются из кэша как blob: перемотка к метке работает без сети и без поддержки Range в SW.
  const AUDIO_CACHE = "konspekty-audio";
  const audioUrl = code => new URL("audio/" + encodeURIComponent(code) + ".m4a", location.href).href;
  const blobUrls = {};
  const canCache = "caches" in window && /^https?:$/.test(location.protocol);
  async function cachedAudio(code) {
    if (!canCache) return "";
    if (blobUrls[code]) return blobUrls[code];
    try {
      const hit = await (await caches.open(AUDIO_CACHE)).match(audioUrl(code));
      if (!hit) return "";
      return (blobUrls[code] = URL.createObjectURL(await hit.blob()));
    } catch (e) { return ""; }
  }
  let REMOTE = null;   // version.json: { built, version, audio: [{ code, file, size }] }
  async function remoteInfo() {
    try { const r = await fetch("version.json", { cache: "no-store" }); if (r.ok) REMOTE = await r.json(); } catch (e) { /* без сети */ }
    return REMOTE;
  }
  async function audioStatus() {
    const list = (REMOTE && REMOTE.audio) || (LIB.chronicle || []).map(id => ({ code: PAGES[id].lecture, size: 0 }));
    if (!canCache) return { have: 0, total: list.length, list, missing: list };
    const cache = await caches.open(AUDIO_CACHE), missing = [];
    for (const a of list) {
      const hit = await cache.match(audioUrl(a.code));
      if (!hit || (a.size && +(hit.headers.get("x-size") || 0) !== a.size)) missing.push(a);
    }
    return { have: list.length - missing.length, total: list.length, list, missing };
  }
  async function downloadAudio(onProgress) {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    await remoteInfo();
    const st = await audioStatus(), cache = await caches.open(AUDIO_CACHE);
    let i = 0; const failed = [];
    for (const a of st.missing) {
      onProgress(`Скачиваю запись ${a.code} (${++i} из ${st.missing.length})…`);
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {   // большие файлы: сеть может оборваться — повторить
        try {
          const r = await fetch(audioUrl(a.code), { cache: "no-store" });
          if (!r.ok) throw new Error(String(r.status));
          const blob = await r.blob();
          if (a.size && blob.size !== a.size) throw new Error("неполный файл");
          await cache.put(audioUrl(a.code), new Response(blob, { headers: { "Content-Type": "audio/mp4", "x-size": String(blob.size) } }));
          delete blobUrls[a.code]; ok = true;
        } catch (e) { if (attempt < 3) { onProgress(`Повтор ${a.code}…`); await new Promise(res => setTimeout(res, 2000 * attempt)); } }
      }
      if (!ok) failed.push(a.code);
    }
    if (failed.length) throw new Error("не скачались записи " + failed.join(", ") + " — нажми ещё раз");
  }
  // «Обновить базу»: новые записи → новая версия приложения (service worker) → перезагрузка.
  async function updateBase(btn) {
    const say = t => { btn.textContent = t; };
    btn.disabled = true;
    try {
      if (!navigator.onLine) throw new Error("offline");
      await downloadAudio(say);
      say("Проверяю новую версию…");
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        const nw = reg.installing || reg.waiting;
        if (nw) {
          say("Загружаю новую версию…");
          await new Promise(res => { if (nw.state === "activated") res(); nw.addEventListener("statechange", () => nw.state === "activated" && res()); setTimeout(res, 60000); });
          if (SYNC.token) await syncNow(true);
          location.reload(); return;
        }
      }
      if (SYNC.token) await syncNow(true);
      toast("База и записи — последней версии."); route();
    } catch (e) {
      toast(e.message === "offline" ? "Нет интернета — обновиться можно при подключении." : "Не удалось обновить: " + e.message + ". Попробуй ещё раз.");
      btn.disabled = false; route();
    }
  }
  async function checkForUpdate() {
    if (!navigator.onLine || !/^https?:$/.test(location.protocol)) return;
    const info = await remoteInfo();
    const el = document.querySelector("[data-update-note]");
    // текущая версия — имя кэша приложения (его создаёт service worker своей версии)
    const cur = canCache ? (await caches.keys()).find(k => k.startsWith("konspekty-") && k !== AUDIO_CACHE) : "";
    const outdated = info && ((cur && info.version && info.version !== cur) || (info.built && info.built !== LIB.built));
    if (outdated && el) { el.hidden = false; el.textContent = "Вышло обновление — нажми «Обновить базу и записи»."; }
    const st = await audioStatus(), a = document.querySelector("[data-audio-note]");
    if (a) a.textContent = st.total ? `Записи на устройстве: ${st.have} из ${st.total}` : "";
  }

  /* ================= синхронизация прогресса между устройствами (закрытый GitHub Gist) ================= */
  // Токен GitHub с правом gist вводит сам пользователь на каждом устройстве; хранится только в этом браузере.
  const SYNC_KEY = "konspekty.sync.v1", GIST_DESC = "konspekty-progress", GIST_FILE = "konspekty-progress.json";
  let SYNC = {};
  try { SYNC = JSON.parse(localStorage.getItem(SYNC_KEY) || "{}") || {}; } catch (e) { SYNC = {}; }
  const saveSync = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(SYNC)); } catch (e) { /* без хранилища */ } };
  async function gh(path, opts) {
    const r = await fetch("https://api.github.com" + path, Object.assign({}, opts, {
      headers: { Authorization: "Bearer " + SYNC.token, Accept: "application/vnd.github+json", "Content-Type": "application/json" } }));
    if (r.status === 401) throw new Error("токен не подходит");
    if (!r.ok) throw new Error("GitHub ответил " + r.status);
    return r.json();
  }
  function mergeProgress(a, b) {
    const out = Object.assign({}, a, { cards: Object.assign({}, a.cards), dumps: Object.assign({}, a.dumps) });
    const newer = (x, y) => !x ? y : !y ? x : ((y.last || "") > (x.last || "") || ((y.last || "") === (x.last || "") && (y.reps || 0) > (x.reps || 0))) ? y : x;
    for (const id in (b.cards || {})) out.cards[id] = newer(out.cards[id], b.cards[id]);
    for (const id in (b.dumps || {})) { const x = out.dumps[id], y = b.dumps[id]; out.dumps[id] = !x || (y.date || "") > (x.date || "") ? y : x; }
    const nt = a.newToday || {}, rt = b.newToday || {};
    out.newToday = rt.date > (nt.date || "") ? rt : rt.date === nt.date ? { date: nt.date, count: Math.max(nt.count || 0, rt.count || 0) } : nt;
    return out;
  }
  async function syncNow(quiet) {
    if (!SYNC.token || !navigator.onLine) return;
    try {
      if (!SYNC.gistId) {
        const list = await gh("/gists?per_page=100");
        const g = list.find(x => x.description === GIST_DESC);
        SYNC.gistId = g ? g.id : (await gh("/gists", { method: "POST", body: JSON.stringify({ description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: "{}" } } }) })).id;
      }
      const g = await gh("/gists/" + SYNC.gistId), f = g.files && g.files[GIST_FILE];
      let remote = {};
      if (f) remote = JSON.parse((f.truncated ? await (await fetch(f.raw_url)).text() : f.content) || "{}");
      store.data = mergeProgress(store.data, remote.cards ? remote : { cards: {}, dumps: {} }); store.save();
      await gh("/gists/" + SYNC.gistId, { method: "PATCH", body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(store.data) } } }) });
      SYNC.last = new Date().toISOString(); saveSync();
      if (!quiet) toast("Прогресс синхронизирован.");
    } catch (e) {
      if (!quiet) toast("Синхронизация не удалась: " + e.message);
    }
  }
  function syncPanel() {
    const last = SYNC.last ? new Date(SYNC.last).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    return SYNC.token
      ? `<p class="setting">Синхронизация включена${last ? ` · последняя: ${esc(last)}` : ""}</p>
         <div class="tools"><button type="button" class="btn ghost small" data-act="sync">Синхронизировать сейчас</button><button type="button" class="btn quiet small" data-act="sync-off">Отключить на этом устройстве</button></div>`
      : `<p class="setting">Синхронизация между устройствами — через твой закрытый GitHub Gist. Нужен токен GitHub с правом <code>gist</code> (вводится один раз на каждом устройстве).</p>
         <div class="tools"><input class="token" type="password" autocomplete="off" spellcheck="false" placeholder="Токен GitHub (ghp_…)" data-token aria-label="Токен GitHub"><button type="button" class="btn ghost small" data-act="sync-on">Подключить</button></div>`;
  }
  function offlinePanel() {
    return `<p class="setting" data-audio-note></p><p class="setting accent" data-update-note hidden></p>
      <div class="tools"><button type="button" class="btn primary glow small" data-act="update-base">Обновить базу и записи</button></div>`;
  }
  window.addEventListener("online", () => { checkForUpdate(); syncNow(true); });

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(() => {});

  route();
  if (SYNC.token) syncNow(true).then(() => { if (!location.hash || location.hash === "#/") route(); });
})();
