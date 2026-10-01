/* L'applicazione: trasporto, motore in anteprima, generazione e file. */
window.APP = (function () {
  "use strict";

  const ST = window.ST;
  const GEN = window.GEN;
  const ED = window.ED;
  const UI = window.UI;

  const SPEC_BPM = { et: "BPM", min: 40, max: 240, def: 112, curva: "lin" };
  const SPEC_SWING = { et: "SWING", min: 0, max: 0.7, def: 0.12, curva: "lin" };
  const SPEC_VOL = { et: "VOLUME", min: 0, max: 1.2, def: 0.9, curva: "lin" };

  // La prima voce del progetto, o null se il progetto Ã¨ vuoto: si puÃ² togliere
  // anche l'ultimo strumento, e allora la selezione semplicemente non c'Ã¨.
  function primaVoce() {
    return prog.kit.length ? prog.kit[0].id : null;
  }
  function allineaSelezione() {
    if (!ST.voce(prog, sel)) sel = primaVoce();
  }

  let prog = ST.canzoneCompleta();
  let opzioni = {
    nome: "A", script: true, commenti: true, json: true,
    effetti: true, musica: true, sequencer: true, riverbero: 1.9
  };
  let sel = "bd";
  let motore = null;
  let ctx = null;
  let sandbox = null;
  let metroBus = null;
  let codice = "";
  let srcCaricata = ""; // l'ultimo codice caricato a mano, da tenere
  let nostro = true; // il modulo che suona Ã¨ quello generato da noi?
  let sporco = true;
  let attesa = null;
  let editor = null;
  let inCorso = false;
  let passo = 0;
  let prossimo = 0;
  let timer = null;
  let coda = [];
  let appuntiPat = null;
  let appuntiNote = {};
  let tempi = [];
  let passoMostrato = -1;
  let controlli = {};

  const $ = function (id) { return document.getElementById(id); };

  function scrivi(txt, errore) {
    const c = $("console");
    if (!c) return;
    const r = document.createElement("div");
    if (errore) r.className = "err";
    const d = new Date();
    r.textContent = d.toLocaleTimeString("it-IT") + "  " + txt;
    c.appendChild(r);
    while (c.childNodes.length > 80) c.removeChild(c.firstChild);
    c.scrollTop = c.scrollHeight;
  }

  function messaggio(txt, errore) {
    const s = $("stato");
    if (!s) return;
    s.textContent = txt;
    s.className = errore ? "stato err" : "stato";
    clearTimeout(messaggio.timer);
    messaggio.timer = setTimeout(function () { scrivi(txt, errore); }, 900);
  }

  /* ---------- l'audio ---------- */
  function contesto() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        scrivi("il browser non ha AudioContext: il sequencer resta muto", 1);
        return null;
      }
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
      sandbox = Object.create(window);
      const trucco = function () {
        if (!ctx) throw new Error("audio non pronto");
        return ctx;
      };
      sandbox.AudioContext = trucco;
      sandbox.webkitAudioContext = trucco;
      metroBus = ctx.createGain();
      metroBus.gain.value = 0.45;
      metroBus.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function assicura() {
    const prima = !!ctx;
    const c = contesto();
    if (c && !prima) {
      // Il contesto Ã¨ nato adesso: va ricaricato il modulo, perchÃ© il primo
      // caricamento Ã¨ avvenuto senza audio. Ma se il modulo Ã¨ uno caricato a
      // mano, non si deve sovrascrivere con il nostro.
      if (nostro) rigenera(false);
      else if (srcCaricata) carica(srcCaricata, false);
    }
    return c;
  }

  function spoglia(src) {
    return String(src)
      .replace(/^\s*<\s*script[^>]*>/i, "")
      .replace(/<\s*\/\s*script\s*>\s*$/i, "")
      .replace(/<\s*\/\s*script\s*>/gi, "");
  }

  function carica(src, diNoi) {
    let nome = (opzioni.nome || "A").replace(/[^A-Za-z0-9_$]/g, "") || "A";
    try {
      const fun = new Function("window", spoglia(src));
      const win = ctx ? sandbox : {};
      if (!ctx) { win.AudioContext = undefined; win.webkitAudioContext = undefined; }
      if (motore && motore.libera) motore.libera();
      fun(win);
      if (!win[nome]) throw new Error("il codice non crea window." + nome);
      motore = win[nome];
      nostro = diNoi !== false;
      srcCaricata = nostro ? "" : String(src);
      if (motore.sveglia) motore.sveglia();
      if (motore.volume) motore.volume(prog.volume);
      campionato();
      descrivi();
      return true;
    } catch (e) {
      motore = null;
      messaggio("codice non valido: " + e.message, true);
      scrivi("codice non valido: " + e.message, 1);
      return false;
    }
  }

  /* Un modulo caricato da fuori puÃ² non avere tutto: il foglio originale, per
     esempio, non ha nÃ© l'orologio nÃ© le voci del sequencer. Si chiede ogni volta,
     e se manca si dice una volta sola cosa manca. */
  function sa(nome) {
    return !!(motore && typeof motore[nome] === "function");
  }

  let descritto = ""; // per non ripetere lo stesso messaggio a ogni rigenerata

  function descrivi() {
    if (!motore) return;
    const cose = [];
    if (sa("colpo")) cose.push("voci");
    if (sa("nota")) cose.push("altezze");
    if (sa("parte")) cose.push("sequencer proprio");
    if (sa("suona")) {
      const n = Array.isArray(motore.suoneria) ? motore.suoneria.length : null;
      cose.push(n === null ? "effetti" : "effetti: " + n);
    }
    if (sa("musica")) cose.push("musica");
    if (sa("volume")) cose.push("volume");
    if (sa("orologio")) cose.push("orologio");
    const righe = [
      (nostro ? "modulo generato. " : "modulo caricato. ") + "Cosa sa fare: " + (cose.length ? cose.join(", ") : "niente che serva qui")
    ];
    if (!sa("colpo") && !sa("parte")) {
      righe.push("  â†’ i pad del sequencer non suonano con questo modulo: ci vuole colpo(id, forza, quando) oppure parte().");
    }
    if (!sa("orologio")) righe.push("  â†’ il trasporto userÃ  il proprio orologio.");
    if (sa("musica")) righe.push("  â†’ per sentirlo: scegli Musica e premi Play.");
    if (sa("colpo") && !sa("nota") && prog.kit.some(function (v) { return ST.melodico(v.mot); })) {
      righe.push("  â†’ questo modulo non ha le altezze: le voci melodiche suonano tutte alla FREQ di base.");
    }
    if (righe.join("|") === descritto) return;
    descritto = righe.join("|");
    scrivi(righe[0], 0);
    for (let i = 1; i < righe.length; i++) scrivi(righe[i], 0);
    if (!sa("colpo") && !sa("parte")) messaggio("questo modulo non ha le voci del sequencer: i pad restano muti", true);
  }

  function ora() {
    if (motore && typeof motore.orologio === "function") {
      try {
        return motore.orologio();
      } catch (e) { /* il modulo Ã¨ rotto: si usa il nostro orologio */ }
    }
    return ctx ? ctx.currentTime : 0;
  }

  function campionato() {
    const c = $("campione");
    if (!c) return;
    if (ctx) c.textContent = "audio: " + Math.round(ctx.sampleRate / 100) / 10 + " kHz";
    else c.textContent = "audio: non aperto";
  }

  function rigenera(scriviEditor) {
    clearTimeout(attesa);
    codice = GEN.codice(prog, opzioni);
    if (scriviEditor !== false && editor) editor.scrivi(codice, true);
    if (carica(codice, true)) sporco = false;
    lcd();
  }

  function sporca() {
    sporco = true;
    lcd();
    clearTimeout(attesa);
    attesa = setTimeout(function () { rigenera(); }, 220);
  }

  function colpo(id, q, quando, semi) {
    if (!assicura()) return;
    if (sporco) rigenera(false);
    if (!motore) return;
    try {
      if (sa("colpo")) {
        motore.colpo(id, q, quando, semi || 0);
        return;
      }
      // un modulo senza voci puÃ² comunque avere gli effetti del gioco
      if (sa("suona") && (!motore.suoneria || motore.suoneria.indexOf(id) >= 0)) {
        motore.suona(id, Math.max(1, Math.round(q * 8)));
      }
    } catch (e) {
      scrivi("colpo non riuscito: " + e.message, 1);
    }
  }

  function tic(quando, forte) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(forte ? 1500 : 2300, quando);
    g.gain.setValueAtTime(forte ? 0.13 : 0.07, quando);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + 0.035);
    o.connect(g);
    g.connect(metroBus);
    o.start(quando);
    o.stop(quando + 0.06);
  }

  /* ---------- il trasporto ---------- */
  function play() {
    if (!assicura()) return;
    if (sporco) rigenera(false);
    if (!motore) return;
    inCorso = true;
    passo = 0;
    coda = [];
    prossimo = ora() + 0.08;
    if (sa("parte")) motore.parte();
    if (prog.musica && sa("musica")) {
      motore.musica(prog.musica);
      if (!sa("colpo") && !sa("parte")) messaggio("suona la musica del modulo: non ha un sequencer proprio");
    }
    if (!timer) timer = setInterval(schedula, 25);
    $("btnPlay").classList.add("premuto");
    $("btnStop").classList.add("premuto");
    if (!sa("colpo") && !sa("parte")) scrivi("trasporto avviato sul nostro orologio: le voci del modulo non ci sono", 0);
    else messaggio("sta suonando");
    lcd();
    requestAnimationFrame(frame);
  }

  function stop() {
    inCorso = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    coda = [];
    passoMostrato = -1;
    if (motore) {
      try {
        if (sa("ferma")) motore.ferma();
        if (!sa("colpo") && sa("silenzio")) motore.silenzio();
      } catch (e) { /* non importa */ }
    }
    const b1 = $("btnPlay"), b2 = $("btnStop");
    if (b1) b1.classList.remove("premuto");
    if (b2) b2.classList.remove("premuto");
    lcd();
  }

  function schedula() {
    if (!inCorso || !motore) return;
    const t = ora();
    const unita = 60 / prog.bpm / 4;
    const limite = t + 0.15;
    let guarda = 0;
    while (prossimo < limite && guarda++ < 64) {
      if (prossimo < t) prossimo = t + 0.01;
      programma(passo, prossimo, unita);
      passo++;
      if (passo >= prog.lunghezza) {
        passo = 0;
        ciclo();
      }
      prossimo += unita;
    }
  }

  function programma(n, t, unita) {
    const P = prog.passi[prog.pattern];
    const conVoci = sa("colpo") || sa("parte");
    if (conVoci) {
      let solo = false;
      for (let i = 0; i < prog.kit.length; i++) if (prog.kit[i].solo) solo = true;
      for (let i = 0; i < prog.kit.length; i++) {
        const v = prog.kit[i];
        const c = P[v.id][n] | 0;
        if (!c) continue;
        if (v.muto || (solo && !v.solo)) continue;
        const q = UI.forza(c) * v.vol;
        if (q <= 0) continue;
        const semi = ST.melodico(v.mot) ? ST.leggiNota(prog, v.id, n) : 0;
        try {
          if (sa("colpo")) motore.colpo(v.id, q, t + (n % 2 ? prog.swing * unita : 0), semi);
        } catch (e) { /* una voce rotta non ferma il resto */ }
      }
    }
    if (prog.metr && n % 4 === 0) tic(t, n % 16 === 0);
    coda.push({ t: t, n: n, p: prog.pattern });
  }

  function ciclo() {
    if (prog.catena.length > 1) {
      prog.indiceCatena = (prog.indiceCatena + 1) % prog.catena.length;
      prog.pattern = prog.catena[prog.indiceCatena];
      UI.disegnaTutto();
      disegnaCatena();
    }
  }

  function frame() {
    if (!inCorso) return;
    const t = ora();
    while (coda.length && coda[0].t <= t) {
      const e = coda.shift();
      UI.lampegia(e.n, e.p);
      lcdPasso(e.n);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- il display ---------- */
  function lcd() {
    const p = prog;
    $("lcdPat").textContent = "PAT " + p.pattern;
    $("lcdBpm").textContent = String(Math.round(p.bpm));
    $("lcdSw").textContent = "SW " + Math.round(p.swing * 100) + "%";
    $("lcdLun").textContent = p.lunghezza + "/16";
    $("lcdCatena").textContent = p.catena.length ? p.catena.join("-") : "â€”";
    $("lcdNome").textContent = p.nome + "  Â·  " + p.kit.length + " voci  Â·  " + p.lunghezza + " passi";
    $("lcdInfo").textContent = inCorso ? "IN CORSO" : (ctx ? "PRONTO" : "AUDIO CHIUSO");
    $("viste").textContent = p.kit.length + " voci Â· 16 passi Â· " + ST.LETTERE.length + " pattern";
    $("btnAudio").classList.toggle("acceso", !!ctx);
    disegnaCatena();
  }

  function lcdPasso(n) {
    if (n === passoMostrato) return;
    passoMostrato = n;
    $("lcdPasso").textContent = "â™ª " + (n + 1) + "/" + prog.lunghezza;
  }

  function disegnaCatena() {
    const cs = $("catenaScelte");
    if (!cs) return;
    cs.innerHTML = "";
    prog.catena.forEach(function (L, i) {
      const b = document.createElement("button");
      b.className = "lettera" + (i === prog.indiceCatena ? " attiva" : "");
      b.textContent = L;
      b.title = "Posizione " + (i + 1) + " della catena";
      b.addEventListener("click", function () {
        prog.indiceCatena = i;
        prog.pattern = L;
        UI.disegnaTutto();
        disegnaPattern();
        sporca();
      });
      cs.appendChild(b);
    });
  }

  function disegnaPattern() {
    ST.LETTERE.forEach(function (L) {
      const b = $("pat" + L);
      if (b) b.classList.toggle("attiva", L === prog.pattern);
    });
  }

  /* ---------- le utilitÃ  del pattern ---------- */
  function azzera() {
    if (!window.confirm("Buttare via i passi del pattern " + prog.pattern + "?")) return;
    prog.kit.forEach(function (v) {
      prog.passi[prog.pattern][v.id].fill(0);
      if (ST.melodico(v.mot)) {
        for (let i = 0; i < 16; i++) ST.impostaNota(prog, v.id, i, 0);
      }
    });
    sporca();
    UI.disegnaTutto();
  }
  function copiaPat() {
    appuntiPat = JSON.parse(JSON.stringify(prog.passi[prog.pattern]));
    appuntiNote = JSON.parse(JSON.stringify(prog.note[prog.pattern] || {}));
    messaggio("pattern " + prog.pattern + " negli appunti");
  }
  function incollaPat() {
    if (!appuntiPat) return messaggio("gli appunti sono vuoti", true);
    // se il kit Ã¨ cambiato dopo la copia, una voce puÃ² non essere negli appunti
    prog.kit.forEach(function (v) {
      if (appuntiPat[v.id]) prog.passi[prog.pattern][v.id] = appuntiPat[v.id].slice();
    });
    prog.kit.forEach(function (v) {
      if (!ST.melodico(v.mot)) return;
      ST.impostaNota(prog, v.id, 0, 0);
      const riga = appuntiNote[v.id] || new Array(16).fill(0);
      for (let i = 0; i < 16; i++) ST.impostaNota(prog, v.id, i, riga[i] | 0);
    });
    sporca();
    UI.disegnaTutto();
  }
  // Un camminamento casuale dentro la scala: suona meglio di numeri a caso.
  function notaCasuale(precedente) {
    const gradi = ST.SCALA[prog.scala];
    if (!gradi) {
      const su = [0, 3, 5, 7, 10, 12];
      return Math.max(ST.SEMI_MIN, Math.min(ST.SEMI_MAX, precedente + su[Math.floor(Math.random() * su.length)]));
    }
    const ottava = Math.round(precedente / 12);
    const gr = gradi[Math.floor(Math.random() * gradi.length)];
    return Math.max(ST.SEMI_MIN, Math.min(ST.SEMI_MAX, ottava * 12 + gr));
  }
  function casuale() {
    const P = prog.passi[prog.pattern];
    prog.kit.forEach(function (v) {
      const denso = v.gruppo === "metalli" ? 0.5 : v.gruppo === "basso" ? 0.24 : 0.14;
      for (let i = 0; i < 16; i++) {
        P[v.id][i] = Math.random() < denso ? 1 + Math.floor(Math.random() * 4) : 0;
      }
      if (!ST.melodico(v.mot)) return;
      let semi = 0;
      for (let i = 0; i < 16; i++) {
        if (P[v.id][i]) semi = notaCasuale(semi);
        ST.impostaNota(prog, v.id, i, semi);
      }
    });
    sporca();
    UI.disegnaTutto();
    messaggio("pattern a caso");
  }
  function sposta(dx) {
    const P = prog.passi[prog.pattern];
    prog.kit.forEach(function (v) {
      const a = P[v.id].slice();
      for (let i = 0; i < 16; i++) P[v.id][(i + dx + 16) % 16] = a[i];
      if (!ST.melodico(v.mot)) return;
      const n = [];
      for (let i = 0; i < 16; i++) n.push(ST.leggiNota(prog, v.id, i));
      for (let i = 0; i < 16; i++) ST.impostaNota(prog, v.id, (i + dx + 16) % 16, n[i]);
    });
    sporca();
    UI.disegnaTutto();
  }
  function chiusura() {
    const P = perId(prog.passi[prog.pattern]);
    const fine = prog.lunghezza;
    for (let i = Math.max(0, fine - 4); i < fine; i++) {
      P.ch[i] = 1 + ((i + 1) % 3);
      if (i % 2 === 0) P.tb[i] = 2;
    }
    for (let i = Math.max(0, fine - 2); i < fine; i++) {
      P.sd[i] = 3;
      P.bd[i] = 3;
    }
    P.sd[Math.max(0, fine - 1)] = 4 | 8;
    sporca();
    UI.disegnaTutto();
    messaggio("chiusura aggiunta");
  }
  function viaForza() {
    const P = prog.passi[prog.pattern];
    prog.kit.forEach(function (v) {
      for (let i = 0; i < 16; i++) {
        const c = P[v.id][i];
        if (c & 7 && (c & 7) > 1) P[v.id][i] = (c & 8) | ((c & 7) - 1);
      }
    });
    sporca();
    UI.disegnaTutto();
  }

  const GROOVE = {
    quattro: function (P) {
      P.bd[0] = 4; P.bd[4] = 3; P.bd[8] = 4; P.bd[12] = 3;
      P.sd[4] = 4 | 8; P.sd[12] = 4 | 8;
      for (let i = 0; i < 16; i += 2) P.ch[i] = i % 4 === 0 ? 3 : 2;
      P.oh[2] = 2; P.oh[6] = 2; P.oh[10] = 2; P.oh[14] = 2;
      P.cb[7] = 2; P.cb[15] = 1;
    },
    break: function (P) {
      P.bd[0] = 4; P.bd[3] = 2; P.bd[6] = 3; P.bd[8] = 4; P.bd[10] = 2; P.bd[14] = 3;
      P.sd[4] = 4 | 8; P.sd[7] = 2; P.sd[12] = 4 | 8; P.sd[15] = 2;
      P.rs[11] = 3;
      for (let i = 0; i < 16; i++) if (i % 2 === 0) P.ch[i] = 2;
      P.tb[2] = 1; P.tb[6] = 1; P.tb[10] = 1; P.tb[13] = 2;
      P.cp[12] = 2;
    },
    boogie: function (P) {
      [0, 3, 6, 8, 11, 14].forEach(function (i) { P.bd[i] = i === 0 || i === 8 ? 4 : 3; });
      P.sd[4] = 4 | 8; P.sd[12] = 4 | 8;
      P.oh[0] = 3; P.oh[4] = 2; P.oh[8] = 3; P.oh[12] = 2;
      for (let i = 0; i < 16; i += 2) P.tb[i] = 1;
      P.cl[7] = 2; P.cl[15] = 2;
    },
    bossa: function (P) {
      P.bd[0] = 4; P.bd[6] = 2; P.bd[7] = 2; P.bd[8] = 3;
      P.rs[4] = 3; P.rs[12] = 3;
      P.cl[0] = 2; P.cl[3] = 2; P.cl[6] = 2; P.cl[10] = 2; P.cl[12] = 2;
      for (let i = 0; i < 16; i += 2) P.tb[i] = 1;
      P.cb[6] = 2;
    }
  };

  // Alcune funzioni scrivono su voci fisse (bd, sd, ch...). Se una di queste non
  // Ã¨ nel progetto la scrittura finisce in un cestino e viene buttata: cosÃ¬ il
  // kit puÃ² essere alleggerito senza che niente smetta di funzionare.
  function perId(P) {
    const scarti = {};
    return new Proxy(P, {
      get: function (t, k) {
        if (k in t) return t[k];
        if (typeof k !== "string") return undefined;
        return (scarti[k] = new Array(16).fill(0));
      }
    });
  }

  function groove(nome) {
    const P = prog.passi[prog.pattern];
    // un groove di batteria non deve cancellare le voci che suonano una nota
    prog.kit.forEach(function (v) { if (!ST.melodico(v.mot)) P[v.id].fill(0); });
    (GROOVE[nome] || function () { })(perId(P));
    sporca();
    UI.disegnaTutto();
    messaggio("groove " + nome);
  }

  /* ---------- i file ---------- */
  function scarica(txt, nome, tipo) {
    try {
      const b = new Blob([txt], { type: tipo || "text/plain;charset=utf-8" });
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 3000);
    } catch (e) {
      copia(txt);
      messaggio("il download non Ã¨ disponibile: il testo Ã¨ negli appunti", true);
    }
  }

  function nomeFile(est) {
    const base = (prog.nome || "kit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "kit";
    return base + "-" + new Date().toISOString().slice(0, 10) + "." + est;
  }

  function testoEsportato() {
    return GEN.codice(prog, opzioni);
  }

  function daEsportare(txt) {
    const t = String(txt || "");
    if (opzioni.script && !/^\s*<\s*script/i.test(t)) return GEN.involucrato(t);
    return t;
  }

  function leggiOpzioni() {
    opzioni.nome = $("optNome").value || "A";
    opzioni.script = $("optScript").checked;
    opzioni.commenti = $("optCommenti").checked;
    opzioni.json = $("optJson").checked;
    opzioni.effetti = $("optEffetti").checked;
    opzioni.musica = $("optMusica").checked;
    opzioni.sequencer = $("optSequencer").checked;
    opzioni.riverbero = Math.max(0.2, Math.min(6, parseFloat($("optRiverbero").value) || 1.9));
  }

  function importaDaCodice(txt) {
    const m = /\/\*\s*PROGETTO:\s*([\s\S]*?)\s*\*\//.exec(txt);
    if (!m) return messaggio("nel codice non ci sono i dati del progetto", true);
    try {
      const q = JSON.parse(m[1]);
      prog = ST.normalizza(q);
      allineaSelezione();
      ricostruisciTutto();
      rigenera();
      messaggio("progetto importato dal codice");
    } catch (e) {
      messaggio("dati del progetto illeggibili: " + e.message, true);
    }
  }

  function leggiFile(file, cosa) {
    const lettore = new FileReader();
    lettore.onload = function () {
      const txt = String(lettore.result);
      if (cosa === "json") {
        try {
      prog = ST.normalizza(JSON.parse(txt));
      allineaSelezione();
      ricostruisciTutto();
          rigenera();
          messaggio("progetto caricato da " + file.name);
        } catch (e) {
          messaggio("file non valido: " + e.message, true);
        }
      } else {
        if (editor) editor.scrivi(txt);
        const m = /\/\*\s*PROGETTO:\s*([\s\S]*?)\s*\*\//.exec(txt);
        if (m) importaDaCodice(txt);
        if (carica(txt, false)) {
          sporco = false;
          vaiSez("sezCodice");
          messaggio(file.name + " Ã¨ in prova: Ã¨ lui che suona");
        }
      }
    };
    lettore.onerror = function () { messaggio("non riesco a leggere il file", true); };
    lettore.readAsText(file);
  }

  function apriFile(estensioni) {
    const inp = $("fileIn");
    inp.accept = estensioni;
    inp.onchange = function () {
      if (inp.files && inp.files[0]) leggiFile(inp.files[0], estensioni.indexOf("json") >= 0 ? "json" : "js");
      inp.value = "";
    };
    inp.click();
  }

  /* ---------- l'impaginazione ---------- */
  function vaiSez(id) {
    const sez = document.querySelectorAll(".sezione");
    for (let i = 0; i < sez.length; i++) sez[i].classList.toggle("attiva", sez[i].id === id);
    const lin = document.querySelectorAll(".linguetta");
    for (let i = 0; i < lin.length; i++) lin[i].classList.toggle("attiva", lin[i].dataset.sez === id);
    if (id === "sezVoce") UI.ricostruisciVoce();
  }

  function costruisciPattern() {
    const host = $("patScelte");
    host.innerHTML = "";
    ST.LETTERE.forEach(function (L) {
      const b = document.createElement("button");
      b.id = "pat" + L;
      b.className = "lettera" + (L === prog.pattern ? " attiva" : "");
      b.textContent = L;
      b.addEventListener("click", function () {
        prog.pattern = L;
        disegnaPattern();
        UI.disegnaTutto();
        lcd();
      });
      host.appendChild(b);
    });
    disegnaCatena();
  }

  function ricostruisciTutto() {
    costruisciPattern();
    UI.monta(api, { seq: $("hostSeq"), voce: $("hostVoce") });
    controlli.bpm.imposta(prog.bpm);
    controlli.swing.imposta(prog.swing);
    controlli.vol.imposta(prog.volume);
    $("lcdNome").textContent = prog.nome;
    lcd();
  }

  /* ---------- l'interfaccia per il pannello ---------- */
  const api = {
    prog: function () { return prog; },
    selezione: function () { return sel; },
    seleziona: function (id) {
      // se la voce non Ã¨ piÃ¹ nel progetto si ripiega sulla prima
      if (!ST.voce(prog, id)) id = primaVoce();
      sel = id;
      UI.disegnaTutto();
      vaiSez("sezVoce");
    },
    salva: sporca,
    colpo: colpo,
    // Prova una voce: per le melodiche sceglie l'altezza del passo sotto il
    // puntatore, altrimenti un grado della scala, cosÃ¬ si sente qualcosa di diverso.
    prova: function (id) {
      const p = prog;
      if (ST.melodico(ST.voce(p, id).mot)) {
        const gradi = ST.SCALA[p.scala] || [0];
        const i = passoMostrato >= 0 ? passoMostrato : 0;
        const semi = p.passi[p.pattern][id][i]
          ? ST.leggiNota(p, id, i)
          : gradi[Math.floor(Math.random() * gradi.length)] - 12;
        colpo(id, 1, undefined, semi);
        return;
      }
      colpo(id, 1);
    }
  };

  /* ---------- l'avvio ---------- */
  function avvia() {
    editor = ED.monta($("editor"), {
      cambio: function () {
        messaggio("codice modificato a mano: Â«GeneraÂ» lo riscrive");
      },
      salva: function () { scaricaCodice(); }
    });

    controlli.bpm = UI.manopola({
      et: "BPM", spec: SPEC_BPM, valore: prog.bpm,
      leggi: function () { return prog.bpm; },
      cambia: function (v) { prog.bpm = v; lcd(); sporca(); }
    });
    controlli.swing = UI.manopola({
      et: "SWING", spec: SPEC_SWING, piccola: true, valore: prog.swing,
      leggi: function () { return prog.swing; },
      cambia: function (v) { prog.swing = v; lcd(); sporca(); }
    });
    controlli.vol = UI.manopola({
      et: "VOLUME", spec: SPEC_VOL, piccola: true, valore: prog.volume,
      leggi: function () { return prog.volume; },
      cambia: function (v) {
        prog.volume = v;
        sporca();
        if (motore && motore.volume) motore.volume(v);
      }
    });
    $("slotBpm").appendChild(controlli.bpm.el);
    $("slotSwing").appendChild(controlli.swing.el);
    $("slotVol").appendChild(controlli.vol.el);

    UI.monta(api, { seq: $("hostSeq"), voce: $("hostVoce") });
    costruisciPattern();

    const lin = document.querySelectorAll(".linguetta");
    for (let i = 0; i < lin.length; i++) {
      lin[i].addEventListener("click", function (ev) { vaiSez(ev.currentTarget.dataset.sez); });
    }

    $("btnPlay").addEventListener("click", function () { play(); });
    $("btnStop").addEventListener("click", function () { stop(); });
    $("btnAudio").addEventListener("click", function () {
      assicura();
      campionato();
      colpo("rs", 0.7);
      messaggio("audio aperto");
    });
    $("btnTap").addEventListener("click", function () {
      const adesso = performance.now();
      tempi = tempi.filter(function (t) { return adesso - t < 2400; });
      tempi.push(adesso);
      if (tempi.length > 4) tempi.shift();
      if (tempi.length >= 2) {
        let somma = 0;
        for (let i = 1; i < tempi.length; i++) somma += tempi[i] - tempi[i - 1];
        const bpm = 60000 / (somma / (tempi.length - 1));
        prog.bpm = Math.round(Math.max(40, Math.min(240, bpm)));
        controlli.bpm.imposta(prog.bpm);
        lcd();
        sporca();
        messaggio("tempo " + prog.bpm);
      }
    });

    $("btnMetro").addEventListener("click", function () {
      prog.metr = !prog.metr;
      this.classList.toggle("acceso", prog.metr);
      sporca();
    });
    $("btnMetro").classList.toggle("acceso", prog.metr);

    $("btnPulisci").addEventListener("click", azzera);
    $("btnCopiaPat").addEventListener("click", copiaPat);
    $("btnIncollaPat").addEventListener("click", incollaPat);
    $("btnCasuale").addEventListener("click", casuale);
    $("btnRaddoppia").addEventListener("click", function () { sposta(-1); });
    $("btnChiudi").addEventListener("click", function () { chiusura(); });
    $("btnVia").addEventListener("click", viaForza);
    $("btnCatenaPiu").addEventListener("click", function () {
      prog.catena.push(prog.pattern);
      sporca();
    });
    $("btnCatenaVia").addEventListener("click", function () {
      if (prog.catena.length < 2) return;
      prog.catena.splice(prog.indiceCatena, 1);
      prog.indiceCatena = 0;
      sporca();
    });
    $("selGroove").addEventListener("change", function () {
      if (!this.value) return;
      groove(this.value);
      this.value = "";
    });
    $("selMusica").addEventListener("change", function () {
      prog.musica = this.value;
      if (!motore) return;
      if (!this.value) {
        if (sa("silenzio")) motore.silenzio();
        messaggio("musica spenta");
        return;
      }
      if (assicura() && sa("musica")) {
        motore.musica(this.value);
        messaggio("musica: " + this.value);
      } else {
        messaggio("questo modulo non ha la musica", true);
      }
    });

    // le opzioni di esportazione
    const campi = ["optNome", "optScript", "optCommenti", "optJson", "optEffetti", "optMusica", "optSequencer", "optRiverbero"];
    campi.forEach(function (id) {
      $(id).addEventListener("change", function () { leggiOpzioni(); rigenera(); });
    });
    $("btnGenera").addEventListener("click", function () { leggiOpzioni(); rigenera(); messaggio("codice generato"); });
    $("btnCopia").addEventListener("click", function () {
      leggiOpzioni();
      const txt = editor ? editor.leggi() : testoEsportato();
      copia(daEsportare(txt));
    });
    $("btnScarica").addEventListener("click", function () { leggiOpzioni(); scaricaCodice(); });
    $("btnCarica").addEventListener("click", function () {
      const txt = editor ? editor.leggi() : "";
      if (!txt) return messaggio("l'editor Ã¨ vuoto", true);
      clearTimeout(attesa); // niente riscritture in arrivo
      if (carica(txt, false)) {
        sporco = false;
        messaggio("codice caricato: Ã¨ lui che suona");
        if (!inCorso) colpo("bd", 1);
      }
    });
    $("btnImporta").addEventListener("click", function () { importaDaCodice(editor ? editor.leggi() : ""); });
    $("btnNuovo").addEventListener("click", function () {
      if (!window.confirm("Un progetto nuovo? Quello aperto va perso.")) return;
      prog = ST.nuovo("Nuovo progetto");
      ricostruisciTutto();
      rigenera();
    });
    $("btnApri").addEventListener("click", function () { apriFile(".json,application/json"); });
    $("btnApriJs").addEventListener("click", function () { apriFile(".js,text/javascript"); });
    $("btnSalva").addEventListener("click", function () {
      scarica(JSON.stringify(prog, null, 1), nomeFile("json"), "application/json");
      messaggio("progetto salvato");
    });

    document.addEventListener("keydown", function (ev) {
      const t = ev.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (ev.key === " ") {
        ev.preventDefault();
        if (inCorso) stop();
        else play();
      } else if (ev.key >= "1" && ev.key <= "4") {
        prog.pattern = ST.LETTERE[parseInt(ev.key, 10) - 1];
        disegnaPattern();
        UI.disegnaTutto();
        lcd();
      } else if (ev.key === "s" && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        scaricaCodice();
      }
    });

    rigenera();
    scrivi("modulo generato: " + (codice.split("\n").length) + " righe. Premi Play.");
  }

  function codiceDaScaricare() {
    leggiOpzioni();
    const nelEditor = editor ? editor.leggi() : "";
    if (nelEditor && nelEditor !== codice) return nelEditor;
    rigenera(false);
    return codice;
  }

  function scaricaCodice() {
    scarica(daEsportare(codiceDaScaricare()), nomeFile("js"), "text/javascript;charset=utf-8");
    messaggio("modulo scaricato");
  }

  function copia(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(
        function () { messaggio("copiato negli appunti"); },
        function () { messaggio("il browser non ha fatto la copia", true); }
      );
    } else {
      const a = document.createElement("textarea");
      a.value = txt;
      document.body.appendChild(a);
      a.select();
      try {
        document.execCommand("copy");
        messaggio("copiato negli appunti");
      } catch (e) {
        messaggio("copia non riuscita", true);
      }
      a.remove();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", avvia);
  else avvia();

  return {
    play: play,
    stop: stop,
    rigenera: rigenera,
    importaDaCodice: importaDaCodice,
    seleziona: function (id) { sel = id; },
    progetto: function () { return prog; },
    opzioni: function () { return opzioni; },
    motore: function () { return motore; },
    messaggio: messaggio,
    suona: colpo
  };
})();
