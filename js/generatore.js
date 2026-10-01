/* Il generatore: dal progetto al modulo window.A pronto da usare nel gioco. */
window.GEN = (function () {
  "use strict";

  const ST = window.ST;

  function n(x) {
    if (typeof x !== "number" || !isFinite(x)) return "0";
    let s = x.toFixed(5);
    s = s.replace(/0+$/, "");
    if (s.charAt(s.length - 1) === ".") s = s.slice(0, -1);
    if (s === "-0") s = "0";
    return s;
  }
  function s(v) { return JSON.stringify(String(v)); }
  function ind(t, k) {
    return String(t)
      .split("\n")
      .map(function (r) { return r.length ? new Array(k + 1).join(" ") + r : r; })
      .join("\n");
  }
  function tag(nome) {
    return String(nome).toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  }

  /* ---------------- impianto ---------------- */
  function impianto(op) {
    const sec = op.riverbero;
    return [
      "/* ---------- impianto ---------- */",
      "let ctx = null;",
      "let padroni = null, busMusica = null, busEffetti = null, riverbero = null;",
      "let rumore = null; // un solo buffer di rumore bianco, riusato ovunque",
      "let volBase = " + n(op.volume === undefined ? 0.9 : op.volume) + ";",
      "let aperta = {}; // i suoni lunghi che si devono chiudere: piatti, clappe",
      "",
      "function apre() {",
      "  if (ctx) {",
      "    if (ctx.state === 'suspended') ctx.resume();",
      "    return true;",
      "  }",
      "  const AC = window.AudioContext || window.webkitAudioContext;",
      "  if (!AC) return false; // browser vecchio: si gioca in silenzio",
      "  try {",
      "    ctx = new AC();",
      "  } catch (e) {",
      "    return false;",
      "  }",
      "  padroni = ctx.createGain();",
      "  padroni.gain.value = volBase;",
      "  padroni.connect(ctx.destination);",
      "",
      "  riverbero = ctx.createConvolver();",
      "  riverbero.buffer = impulso(" + n(sec) + ", 3.2);",
      "  const mando = ctx.createGain();",
      "  mando.gain.value = 0.34;",
      "  riverbero.connect(mando);",
      "  mando.connect(padroni);",
      "",
      "  busMusica = ctx.createGain();",
      "  busMusica.gain.value = 0.5;",
      "  busMusica.connect(padroni);",
      "  busMusica.connect(riverbero);",
      "  const comp = ctx.createDynamicsCompressor();",
      "  comp.threshold.setValueAtTime(-12, 0);",
      "  comp.knee.setValueAtTime(12, 0);",
      "  comp.ratio.setValueAtTime(4, 0);",
      "  comp.attack.setValueAtTime(0.003, 0);",
      "  comp.release.setValueAtTime(0.1, 0);",
      "  busMusica.disconnect(padroni);",
      "  busMusica.connect(comp);",
      "  comp.connect(padroni);",
      "",
      "  busEffetti = ctx.createGain();",
      "  busEffetti.gain.value = 0.85;",
      "  busEffetti.connect(padroni);",
      "  busEffetti.connect(riverbero);",
      "",
      "  rumore = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);",
      "  const d = rumore.getChannelData(0);",
      "  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;",
      "  return true;",
      "}",
      "",
      "function impulso(secondi, quanto) {",
      "  const nn = Math.floor(ctx.sampleRate * secondi);",
      "  const b = ctx.createBuffer(2, nn, ctx.sampleRate);",
      "  for (let canale = 0; canale < 2; canale++) {",
      "    const d = b.getChannelData(canale);",
      "    for (let i = 0; i < nn; i++) {",
      "      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nn, quanto);",
      "    }",
      "  }",
      "  return b;",
      "}",
      "const adesso = () => (ctx ? ctx.currentTime + 0.005 : 0);"
    ].join("\n");
  }

  /* ---------------- mattoni del suono ---------------- */
  function mattoni() {
    return [
      "/* ---------- mattoni del suono ---------- */",
      "function inv(now, picco, attacco, caduta, bus) {",
      "  const g = ctx.createGain();",
      "  g.gain.setValueAtTime(0.0001, now);",
      "  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, picco), now + attacco);",
      "  g.gain.exponentialRampToValueAtTime(0.0001, now + attacco + caduta);",
      "  g.connect(bus || busEffetti);",
      "  return g;",
      "}",
      "function tono(tipo, freq, quando, dur, picco, detune, bus) {",
      "  const o = ctx.createOscillator();",
      "  o.type = tipo;",
      "  o.frequency.setValueAtTime(freq, quando);",
      "  if (detune) o.detune.setValueAtTime(detune, quando);",
      "  o.connect(inv(quando, picco, 0.006, dur, bus));",
      "  o.start(quando);",
      "  o.stop(quando + dur + 0.06);",
      "  return o;",
      "}",
      "function soffio(quando, dur, picco, da, a, tipo, bus) {",
      "  const s = ctx.createBufferSource();",
      "  s.buffer = rumore;",
      "  s.loop = true;",
      "  const f = ctx.createBiquadFilter();",
      "  f.type = tipo || 'bandpass';",
      "  f.Q.value = 1.1;",
      "  f.frequency.setValueAtTime(da, quando);",
      "  f.frequency.exponentialRampToValueAtTime(Math.max(60, a), quando + dur);",
      "  s.connect(f);",
      "  f.connect(inv(quando, picco, dur * 0.22, dur * 0.78, bus));",
      "  s.start(quando);",
      "  s.stop(quando + dur + 0.08);",
      "  return f;",
      "}",
      "",
      "// Tre mattoni nuovi, per i suoni del sequencer.",
      "// Un involucro che non si collega: gli attacchi e le cadute delle voci.",
      "function involucro(now, picco, att, hold, cad) {",
      "  const g = ctx.createGain();",
      "  const p = Math.max(0.0002, picco);",
      "  const a = Math.max(0.0004, att);",
      "  g.gain.setValueAtTime(0.0001, now);",
      "  g.gain.exponentialRampToValueAtTime(p, now + a);",
      "  const t1 = now + a + Math.max(0, hold);",
      "  g.gain.setValueAtTime(p, t1);",
      "  g.gain.exponentialRampToValueAtTime(0.0001, t1 + Math.max(0.004, cad));",
      "  return g;",
      "}",
      "// Come sopra, ma la nota resta su fino alla fine della porta: campanelle, campane.",
      "function sostenuto(now, picco, att, gate, cad, sus) {",
      "  const g = ctx.createGain();",
      "  const p = Math.max(0.0002, picco);",
      "  const a = Math.max(0.0004, att);",
      "  g.gain.setValueAtTime(0.0001, now);",
      "  g.gain.exponentialRampToValueAtTime(p, now + a);",
      "  const t1 = now + a + Math.max(0, gate);",
      "  g.gain.linearRampToValueAtTime(Math.max(0.0002, p * sus), t1);",
      "  g.gain.exponentialRampToValueAtTime(0.0001, t1 + Math.max(0.004, cad));",
      "  return g;",
      "}",
      "// La curva della saturazione: più il bottone gira, più si schiaccia.",
      "function curva(k) {",
      "  const n2 = 512;",
      "  const c = new Float32Array(n2);",
      "  const g = Math.tanh(k);",
      "  for (let i = 0; i < n2; i++) {",
      "    const x = (i / (n2 - 1)) * 2 - 1;",
      "    c[i] = Math.tanh(k * x) / g;",
      "  }",
      "  return c;",
      "}",
      "// L'uscita di una voce: filtro, saturazione, panorama, mandata al riverbero.",
      "// cut0 e tempo fanno scendere (o salire) il filtro: il fiato del pedale.",
      "function post(t, nodo, tipo, cut, cut0, tempo, res, drive, pan, mando, bus) {",
      "  let a = nodo;",
      "  if (tipo && tipo !== 'nessuno') {",
      "    const f = ctx.createBiquadFilter();",
      "    f.type = tipo;",
      "    f.frequency.setValueAtTime(Math.max(30, cut0 > 0 ? cut0 : cut), t);",
      "    if (cut0 > 0 && tempo > 0) f.frequency.exponentialRampToValueAtTime(Math.max(30, cut), t + tempo);",
      "    f.Q.setValueAtTime(Math.max(0.0001, res), t);",
      "    a.connect(f);",
      "    a = f;",
      "  }",
      "  if (drive > 1.02) {",
      "    const w = ctx.createWaveShaper();",
      "    w.curve = curva(drive);",
      "    w.oversample = '2x';",
      "    a.connect(w);",
      "    a = w;",
      "  }",
      "  if (ctx.createStereoPanner) {",
      "    const p = ctx.createStereoPanner();",
      "    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);",
      "    a.connect(p);",
      "    a = p;",
      "  }",
      "  if (mando > 0.001 && riverbero) {",
      "    const m = ctx.createGain();",
      "    m.gain.setValueAtTime(mando, t);",
      "    a.connect(m);",
      "    m.connect(riverbero);",
      "  }",
      "  a.connect(bus || busMusica);",
      "  return a;",
      "}",
      "",
      "// Un suono che si chiude da solo quando un altro gli passa sopra.",
      "function chiudi(gruppo, t) {",
      "  const a = aperta[gruppo];",
      "  if (!a) return;",
      "  aperta[gruppo] = null;",
      "  try {",
      "    a.gain.cancelScheduledValues(t);",
      "    a.gain.setValueAtTime(Math.max(0.0001, a.gain.value), t);",
      "    a.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);",
      "    for (let i = 0; i < a.fonti.length; i++) a.fonti[i].stop(t + 0.04);",
      "  } catch (e) {",
      "    /* un suono già finito non è un problema */",
      "  }",
      "}",
      "function apri(gruppo, g, fonti) {",
      "  chiudi(gruppo, adesso());",
      "  aperta[gruppo] = { gain: g.gain, fonti: fonti };",
      "}"
    ].join("\n");
  }

  /* ---------------- una voce del kit ---------------- */
  function tagOsc(p) {
    return p.osc || "sine";
  }
  function tagFiltro(p) {
    return p.flt || "nessuno";
  }

  function sorgenti(p, mot, interno) {
    // Restituisce il pezzo di codice che crea oscillatori, rumore e clic.
    const r = [];
    const F = "F";
    const fine = "fine";
    const k2 = n(1 + 7 * p.pEnv);
    const sale = p.rev === "sì";

    if (mot === "sint" || mot === "intonato") {
      const tipo = tagOsc(p);
      if (p.pEnv > 0.001) {
        if (sale) {
          r.push(
            "  {",
            "    const o = ctx.createOscillator();",
            "    o.type = " + s(tipo) + ";",
            "    o.frequency.setValueAtTime(" + F + ", t);",
            "    o.frequency.exponentialRampToValueAtTime(" + F + " * " + k2 + ", t + att * 0.8);",
            "    o.connect(mix);",
            "    o.start(t);",
            "    o.stop(" + fine + ");",
            "    fonti.push(o);",
            "  }"
          );
        } else {
          r.push(
            "  {",
            "    const o = ctx.createOscillator();",
            "    o.type = " + s(tipo) + ";",
            "    o.frequency.setValueAtTime(" + F + " * " + k2 + ", t);",
            "    o.frequency.exponentialRampToValueAtTime(" + F + ", t + " + n(0.002 + 0.11 * p.pEnv) + ");",
            "    o.connect(mix);",
            "    o.start(t);",
            "    o.stop(" + fine + ");",
            "    fonti.push(o);",
            "  }"
          );
        }
      } else {
        r.push(
          "  {",
          "    const o = ctx.createOscillator();",
          "    o.type = " + s(tipo) + ";",
          "    o.frequency.setValueAtTime(" + F + ", t);",
          "    o.connect(mix);",
          "    o.start(t);",
          "    o.stop(" + fine + ");",
          "    fonti.push(o);",
          "  }"
        );
      }
    }

    if (mot === "intonato") {
      r.push(
        "  {",
        "    const o = ctx.createOscillator();",
        "    o.type = 'square';",
        "    o.frequency.setValueAtTime(" + F + " * " + n(p.ratio) + ", t);",
        "    const lv = ctx.createGain();",
        "    lv.gain.value = 0.5;",
        "    o.connect(lv);",
        "    lv.connect(mix);",
        "    o.start(t);",
        "    o.stop(" + fine + ");",
        "    fonti.push(o);",
        "  }"
      );
    }

    if (mot === "corda") {
      const tipo = tagOsc(p);
      r.push("  // La corda: il pitch parte in su e ricade, è quello che fa la chitarra.");
      if (p.pEnv > 0.001) {
        r.push(
          "  {",
          "    const o = ctx.createOscillator();",
          "    o.type = " + s(tipo) + ";",
          "    o.frequency.setValueAtTime(" + F + " * " + k2 + ", t);",
          "    o.frequency.exponentialRampToValueAtTime(" + F + ", t + " + n(0.002 + 0.11 * p.pEnv) + ");",
          "    o.connect(mix);",
          "    o.start(t);",
          "    o.stop(" + fine + ");",
          "    fonti.push(o);",
          "  }"
        );
      } else {
        r.push(
          "  {",
          "    const o = ctx.createOscillator();",
          "    o.type = " + s(tipo) + ";",
          "    o.frequency.setValueAtTime(" + F + ", t);",
          "    o.connect(mix);",
          "    o.start(t);",
          "    o.stop(" + fine + ");",
          "    fonti.push(o);",
          "  }"
        );
      }
      r.push("  // Due copie appena stonate: una corda sola suona troppo pulita.");
      r.push("  for (let i = 1; i <= 2; i++) {");
      r.push("    const o = ctx.createOscillator();");
      r.push("    o.type = " + s(tipo) + ";");
      r.push("    o.detune.setValueAtTime(i * CORO, t);");
      r.push("    o.frequency.setValueAtTime(" + F + ", t);");
      r.push("    const lv = ctx.createGain();");
      r.push("    lv.gain.value = 0.34 / i;");
      r.push("    o.connect(lv);");
      r.push("    lv.connect(mix);");
      r.push("    o.start(t);");
      r.push("    o.stop(" + fine + ");");
      r.push("    fonti.push(o);");
      r.push("  }");
    }

    if (mot === "archi" || mot === "pad") {
      r.push("  // " + (mot === "archi" ? "Gli archi: più corde insieme, l'attacco è lento e l'attaccato tiene." : "Il fondo: tre corde larghe, niente fretta."));
      r.push("  for (let i = -1; i <= 1; i++) {");
      r.push("    const o = ctx.createOscillator();");
      r.push("    o.type = " + s(tagOsc(p)) + ";");
      r.push("    o.detune.setValueAtTime(i * CORO, t);");
      r.push("    o.frequency.setValueAtTime(" + F + ", t);");
      r.push("    const lv = ctx.createGain();");
      r.push("    lv.gain.value = " + (mot === "archi" ? "0.5" : "0.62") + ";");
      r.push("    o.connect(lv);");
      r.push("    lv.connect(mix);");
      r.push("    o.start(t);");
      r.push("    o.stop(" + fine + ");");
      r.push("    fonti.push(o);");
      r.push("  }");
    }

    if (mot === "fiato") {
      r.push("  // Il fiato: la nota è pulita, il soffio le sta intorno.");
      r.push(
        "  {",
        "    const o = ctx.createOscillator();",
        "    o.type = " + s(tagOsc(p)) + ";",
        "    o.frequency.setValueAtTime(" + F + ", t);",
        "    o.connect(mix);",
        "    o.start(t);",
        "    o.stop(" + fine + ");",
        "    fonti.push(o);",
        "  }"
      );
      if (p.noise > 0.001) {
        r.push("  // Il soffio dell'aria, stretto intorno alla nota.");
        r.push(
          "  {",
          "    const s = ctx.createBufferSource();",
          "    s.buffer = rumore;",
          "    s.loop = true;",
          "    const bp = ctx.createBiquadFilter();",
          "    bp.type = 'bandpass';",
          "    bp.Q.value = 1.6;",
          "    bp.frequency.setValueAtTime(" + F + " * 2, t);",
          "    const lv = ctx.createGain();",
          "    lv.gain.setValueAtTime(" + n(p.noise) + ", t);",
          "    s.connect(bp);",
          "    bp.connect(lv);",
          "    lv.connect(mix);",
          "    s.start(t);",
          "    s.stop(" + fine + ");",
          "    fonti.push(s);",
          "  }"
        );
      }
    }

    if (mot === "campana") {
      r.push("  // La campana: parziali non armoniche, e le alte muoiono prima.");
      r.push("  for (let i = 0; i < NPAR; i++) {");
      r.push("    const o = ctx.createOscillator();");
      r.push("    o.type = 'sine';");
      r.push("    o.frequency.setValueAtTime(" + F + " * BELL[i], t);");
      r.push("    const lv = ctx.createGain();");
      r.push("    lv.gain.value = 1 / (1 + i * 0.9);");
      r.push("    const gv = ctx.createGain();");
      r.push("    gv.gain.setValueAtTime(1, t);");
      r.push("    gv.gain.exponentialRampToValueAtTime(0.0001, t + cad * " + n(1 + Math.max(0, Math.round(p.parz) - 1) * 0.25) + " * (1 + i * 0.55));");
      r.push("    o.connect(lv);");
      r.push("    lv.connect(gv);");
      r.push("    gv.connect(mix);");
      r.push("    o.start(t);");
      r.push("    o.stop(" + fine + ");");
      r.push("    fonti.push(o);");
      r.push("  }");
    }

    if (["sint", "corda", "pad"].indexOf(mot) >= 0 && p.sub > 0.001) {
      r.push(
        "  {",
        "    const o = ctx.createOscillator();",
        "    o.type = 'sine';",
        "    o.frequency.setValueAtTime(" + F + " * " + n(Math.pow(2, p.subSemi / 12)) + ", t);",
        "    const lv = ctx.createGain();",
        "    lv.gain.value = " + n(p.sub) + ";",
        "    o.connect(lv);",
        "    lv.connect(mix);",
        "    o.start(t);",
        "    o.stop(" + fine + ");",
        "    fonti.push(o);",
        "  }"
      );
    }

    if (mot === "metallico") {
      r.push(
        "  for (let i = 0; i < PARZIALI.length; i++) {",
        "    const o = ctx.createOscillator();",
        "    o.type = 'square';",
        "    o.frequency.setValueAtTime(" + F + " * PARZIALI[i], t);",
        "    const lv = ctx.createGain();",
        "    lv.gain.value = 1 / (i + 1.15);",
        "    o.connect(lv);",
        "    lv.connect(mix);",
        "    o.start(t);",
        "    o.stop(" + fine + ");",
        "    fonti.push(o);",
        "  }"
      );
    }

    if (mot === "rumore" && interno) {
      const centro = n(p.f0);
      const su = p.pEnv > 0.001;
      r.push(
        "  {",
        "    const s = ctx.createBufferSource();",
        "    s.buffer = rumore;",
        "    s.loop = true;",
        su
          ? "    const bp = ctx.createBiquadFilter();\n    bp.type = 'bandpass';\n    bp.Q.value = 1.1;\n    bp.frequency.setValueAtTime(" + centro + " * " + k2 + ", t);\n    bp.frequency.exponentialRampToValueAtTime(" + centro + ", t + " + n(0.01 + 0.25 * p.pEnv) + ");\n    s.connect(bp);\n    bp.connect(mix);"
          : "    const bp = ctx.createBiquadFilter();\n    bp.type = 'bandpass';\n    bp.Q.value = 1.1;\n    bp.frequency.setValueAtTime(" + centro + ", t);\n    s.connect(bp);\n    bp.connect(mix);",
        "    s.start(t);",
        "    s.stop(" + fine + ");",
        "    fonti.push(s);",
        "  }"
      );
    } else if (mot === "rumore") {
      r.push(
        "  {",
        "    const s = ctx.createBufferSource();",
        "    s.buffer = rumore;",
        "    s.loop = true;",
        "    s.connect(mix);",
        "    s.start(t);",
        "    s.stop(" + fine + ");",
        "    fonti.push(s);",
        "  }"
      );
    } else if (p.noise > 0.001 && mot !== "fiato") {
      r.push(
        "  {",
        "    const s = ctx.createBufferSource();",
        "    s.buffer = rumore;",
        "    s.loop = true;",
        "    s.playbackRate.setValueAtTime(" + n(0.75 + 0.7 * p.noise) + ", t);",
        "    const lv = ctx.createGain();",
        "    lv.gain.setValueAtTime(" + n(p.noise) + ", t);",
        "    s.connect(lv);",
        "    lv.connect(mix);",
        "    s.start(t);",
        "    s.stop(" + fine + ");",
        "    fonti.push(s);",
        "  }"
      );
    }

    if (p.click > 0.001 && p.rev !== "sì") {
      r.push(
        "  {",
        "    const s = ctx.createBufferSource();",
        "    s.buffer = rumore;",
        "    s.loop = true;",
        "    const hp = ctx.createBiquadFilter();",
        "    hp.type = 'highpass';",
        "    hp.frequency.setValueAtTime(2600, t);",
        "    const cg = ctx.createGain();",
        "    cg.gain.setValueAtTime(" + n(Math.max(0.0002, p.click)) + ", t);",
        "    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);",
        "    s.connect(hp);",
        "    hp.connect(cg);",
        "    cg.connect(mix);",
        "    s.start(t);",
        "    s.stop(t + 0.05);",
        "    fonti.push(s);",
        "  }"
      );
    }

    if (p.lfoAmt > 0.001) {
      r.push(
        "  {",
        "    const lo = ctx.createOscillator();",
        "    lo.type = 'sine';",
        "    lo.frequency.setValueAtTime(" + n(p.lfoRate > 0.05 ? p.lfoRate : 6) + ", t);",
        "    const lg = ctx.createGain();",
        "    lg.gain.setValueAtTime(" + n(p.lfoAmt) + ", t);",
        "    lo.connect(lg);",
        "    for (let i = 0; i < fonti.length; i++) {",
        "      if (fonti[i].detune) lg.connect(fonti[i].detune);",
        "    }",
        "    lo.start(t);",
        "    lo.stop(" + fine + ");",
        "  }"
      );
    }
    return r.join("\n");
  }

  function corpoVoce(v) {
    const p = v.p;
    const mot = v.mot;
    const rev = p.rev === "sì";
    const D = p.dec * p.len;
    const mel = ST.melodico(mot);
    const r = [];

    r.push("/* " + v.nome + " — " + motoreEtichetta(mot) + " */");
    r.push("function " + v.id + "(t, q, dur, bus, semi) {");
    // semi è l'altezza scritta nel sequencer: sale e scende di un semitono per volta.
    r.push("  const F = " + n(p.f0) + " * Math.pow(2, (" + n(p.tune) + " + (semi || 0)) / 12);");
    r.push("  const REV = " + (rev ? "true" : "false") + ";");
    r.push("  const att = REV ? Math.max(0.03, " + n(D) + ") : " + n(p.att) + ";");
    r.push("  const cad = REV ? Math.max(0.008, " + n(p.att) + ") : " + n(D) + ";");
    r.push("  const picco = Math.max(0.0002, " + n(p.level) + " * q);");
    r.push("  const fine = t + att + cad + 0.09;");
    if (["corda", "archi", "pad"].indexOf(mot) >= 0) {
      r.push("  const CORO = " + n(Math.max(3, p.coro || 0)) + "; // cent: quanto sono stonate fra loro le corde");
    }
    if (mot === "campana") {
      r.push("  const NPAR = " + (Math.round(p.parz) || 1) + "; // quante parziali ha la campana");
    }
    r.push("  const mix = ctx.createGain();");
    r.push("  mix.gain.value = 1;");
    r.push("  const fonti = [];");

    const flt = tagFiltro(p);
    const interno = mot === "rumore" && flt === "nessuno";
    const src = sorgenti(p, mot, interno);
    if (src) r.push(src);

    const vibVale = ST.P.vib.mot.indexOf(mot) >= 0 ? p.vib : 0;
    if (vibVale > 0.001) {
      r.push("  // Il vibrato: la mano non sta ferma, e la nota si mette a oscillare.");
      r.push("  {");
      r.push("    const lo = ctx.createOscillator();");
      r.push("    lo.type = 'sine';");
      r.push("    lo.frequency.setValueAtTime(" + n(p.vibR > 0.05 ? p.vibR : 5) + ", t);");
      r.push("    const lg = ctx.createGain();");
      r.push("    lg.gain.setValueAtTime(" + n(vibVale) + ", t);");
      r.push("    lo.connect(lg);");
      r.push("    for (let i = 0; i < fonti.length; i++) {");
      r.push("      if (fonti[i].detune) lg.connect(fonti[i].detune);");
      r.push("    }");
      r.push("    lo.start(t);");
      r.push("    lo.stop(fine);");
      r.push("  }");
    }

    if (mot === "rumore" && p.burst > 1) {
      r.push("  // " + p.burst + " colpi ravvicinati, poi la coda: il clap.");
      r.push("  const inv2 = ctx.createGain();");
      r.push("  inv2.gain.value = 1;");
      r.push("  inv2.connect(mix);");
      r.push("  for (let i = 0; i < " + p.burst + "; i++) {");
      r.push("    const g = involucro(t + i * " + n(p.burstGap) + ", picco, 0.0006, 0, i < " + (p.burst - 1) + " ? " + n(Math.max(0.004, p.burstGap * 0.8)) + " : " + n(Math.max(0.01, D)) + ");");
      r.push("    g.connect(inv2);");
      r.push("  }");
    }

    // Con il sustain la nota resta su fino alla fine della porta, invece di
    // spegnersi da sola: è quello che serve a un archetto o a un fiato.
    if (["intonato", "archi", "fiato", "pad"].indexOf(mot) >= 0 && p.sustain > 0.001) {
      r.push("  const g = sostenuto(t, picco, att, Math.max(0, dur), cad, " + n(p.sustain) + ");");
    } else {
      r.push("  const g = involucro(t, picco, att, " + n(p.hold) + ", cad);");
    }
    r.push("  mix.connect(g);");

    const cut = 40 * Math.pow(350, p.tone);
    let cut0 = 0;
    let tempo = 0;
    if (p.pEnv > 0.001 && !interno && (flt === "lowpass" || flt === "bandpass" || flt === "peaking")) {
      cut0 = cut * (1 + 5 * p.pEnv);
      tempo = 0.004 + 0.12 * p.pEnv;
    }
    r.push(
      "  post(t, g, " + s(flt) + ", " + n(cut) + ", " + n(cut0) + ", " + n(tempo) + ", " + n(p.res) +
        ", " + n(p.drive) + ", " + n(p.pan) + ", " + n(p.verb) + ", bus);"
    );
    if (p.choke && p.choke !== "nessuno") r.push("  apri(" + s(p.choke) + ", g, fonti);");
    r.push("}");
    return r.join("\n");
  }

  function motoreEtichetta(mot) {
    return {
      sint: "sintesi",
      rumore: "rumore filtrato",
      intonato: "due oscillatori",
      metallico: "parziali metallici",
      corda: "corda pizzicata",
      archi: "archi incollati",
      fiato: "fiato",
      campana: "campana",
      pad: "fondo"
    }[mot] || mot;
  }

  function kit(p) {
    const r = [];
    r.push("/* ---------- il kit: " + p.kit.length + " voci ---------- */");
    r.push("const PARZIALI = [1, 1.4471, 1.617, 1.9265, 2.5028, 2.6637];");
    r.push("const BELL = [1, 2.0, 2.97, 4.06, 5.4, 6.9]; // le parziali di una campana: stonate apposta");
    p.kit.forEach(function (v) {
      r.push(corpoVoce(v));
      r.push("");
    });
    r.push("const KIT = [");
    p.kit.forEach(function (v) {
      r.push(
        "  { id: " + s(v.id) + ", nome: " + s(v.nome) + ", gruppo: " + s(v.gruppo) + ", mot: " + s(v.mot) +
          ", mel: " + (ST.melodico(v.mot) ? "true" : "false") +
          ", choke: " + s(v.p.choke) + ", vol: " + n(v.vol) + ", muto: " + (v.muto ? "true" : "false") +
          ", solo: " + (v.solo ? "true" : "false") + ", suona: " + v.id + " },"
      );
    });
    r.push("];");
    r.push("function voce(id) {");
    r.push("  for (let i = 0; i < KIT.length; i++) if (KIT[i].id === id) return KIT[i];");
    r.push("  return null;");
    r.push("}");
    return r.join("\n");
  }

  /* ---------------- effetti del gioco ---------------- */
  function effetti() {
    return [
      "/* ---------- effetti ---------- */",
      "// Ogni effetto è una scena: più oscillatori, più soffi, con tempi diversi.",
      "const EFFETTI = {",
      "  tappo() {",
      "    const t = adesso();",
      "    soffio(t, 0.09, 0.5, 2600, 500, 'lowpass');",
      "    soffio(t + 0.02, 0.05, 0.28, 5200, 2200);",
      "    tono('sine', 180, t, 0.07, 0.32);",
      "  },",
      "  tiro() {",
      "    const t = adesso();",
      "    soffio(t, 0.14, 0.2, 1900, 620, 'bandpass');",
      "    tono('sine', 320, t, 0.06, 0.1);",
      "  },",
      "  tocco() {",
      "    const t = adesso();",
      "    tono('triangle', 760, t, 0.07, 0.16, 4);",
      "    tono('sine', 1520, t, 0.04, 0.05);",
      "  },",
      "  abbinamento(serie) {",
      "    const t = adesso();",
      "    const base = 700 * Math.pow(2, Math.min(6, serie - 1) / 7);",
      "    tono('sine', base, t, 0.34, 0.3);",
      "    tono('sine', base * 2.76, t, 0.26, 0.16, 6);",
      "    tono('triangle', base * 4.07, t + 0.005, 0.18, 0.07, -5);",
      "    tono('sine', base * 0.5, t, 0.4, 0.12);",
      "    soffio(t, 0.09, 0.13, 4200, 1600);",
      "  },",
      "  cascata(quante) {",
      "    const t = adesso();",
      "    const n2 = Math.min(7, 2 + Math.floor(quante / 3));",
      "    for (let i = 0; i < n2; i++) {",
      "      const f = 560 * Math.pow(0.78, i);",
      "      tono('sine', f, t + i * 0.045, 0.2, 0.15 - i * 0.012);",
      "    }",
      "    soffio(t + 0.05, 0.3, 0.1, 1400, 300, 'lowpass');",
      "  },",
      "  discesa() {",
      "    const t = adesso();",
      "    tono('sine', 96, t, 0.34, 0.36);",
      "    tono('sine', 64, t, 0.4, 0.24);",
      "    soffio(t, 0.24, 0.16, 900, 180, 'lowpass');",
      "  },",
      "  mancato() {",
      "    const t = adesso();",
      "    tono('triangle', 320, t, 0.11, 0.12);",
      "    tono('sine', 214, t + 0.05, 0.13, 0.1);",
      "  },",
      "  vuoto() {",
      "    const t = adesso();",
      "    soffio(t, 0.2, 0.12, 700, 160, 'lowpass');",
      "    tono('sine', 150, t + 0.1, 0.18, 0.09);",
      "  },",
      "  vinto() {",
      "    const t = adesso();",
      "    [0, 4, 7, 12].forEach(function (st, i) {",
      "      tono('sine', 523.25 * Math.pow(2, st / 12), t + i * 0.1, 0.6, 0.26);",
      "      tono('triangle', 523.25 * Math.pow(2, st / 12) * 2, t + i * 0.1, 0.3, 0.07);",
      "    });",
      "    tono('sine', 130.8, t, 1.1, 0.2);",
      "  },",
      "  perso() {",
      "    const t = adesso();",
      "    const o = ctx.createOscillator();",
      "    o.type = 'sine';",
      "    o.frequency.setValueAtTime(330, t);",
      "    o.frequency.exponentialRampToValueAtTime(110, t + 0.85);",
      "    o.connect(inv(t, 0.24, 0.05, 0.9));",
      "    o.start(t);",
      "    o.stop(t + 1);",
      "    tono('sine', 82, t + 0.1, 0.8, 0.2);",
      "  },",
      "  ui() {",
      "    const t = adesso();",
      "    tono('triangle', 1250, t, 0.05, 0.09);",
      "  }",
      "};",
      "",
      "function suona(nome, n2) {",
      "  if (!ctx || !padroni) return;",
      "  if (ctx.state === 'suspended') return;",
      "  if (!accesa('effetti')) return;",
      "  const f = EFFETTI[nome];",
      "  if (f) {",
      "    try {",
      "      f.call(EFFETTI, n2);",
      "    } catch (e) {",
      "      /* un suono rotto non ferma la partita */",
      "    }",
      "    return;",
      "  }",
      "  const k = voce(nome);",
      "  if (k) {",
      "    sveglia();",
      "    k.suona(adesso(), 1, 0.4, busEffetti);",
      "  }",
      "}"
    ].join("\n");
  }

  /* ---------------- il sequencer ---------------- */
  function sequencer(p) {
    const r = [];
    r.push("/* ---------- il sequencer ---------- */");
    r.push("const LIV = " + JSON.stringify(ST.LIVELLI) + ";");
    r.push("let bpm = " + n(p.bpm) + ", swing = " + n(p.swing) + ", lungo = " + p.lunghezza + ";");
    r.push("let sequenza = " + JSON.stringify(p.catena) + ", iSeq = 0, gira = false;");
    r.push("let passo = 0, prossimo = 0, timer = null, metr = " + (p.metr ? "true" : "false") + ";");
    r.push("let correnti = " + JSON.stringify(p.pattern) + ", ascoltatore = null;");
    r.push("");
    r.push("const PASSI = {");
    ST.LETTERE.forEach(function (L) {
      const righe = p.kit.map(function (v) {
        return "    " + v.id + ": " + JSON.stringify(p.passi[L][v.id]) ;
      });
      r.push("  " + L + ": {");
      r.push(righe.join(",\n"));
      r.push("  }" + (L === "D" ? "" : ","));
    });
    r.push("};");
    r.push("");
    // Le altezze, una riga per voce melodia e per pattern. Vuota se il kit è
    // tutto percussione: le percussioni non hanno note.
    const melodiche = p.kit.filter(function (v) { return ST.melodico(v.mot); });
    r.push("const NOTE = {");
    ST.LETTERE.forEach(function (L) {
      if (!melodiche.length) return;
      const righe = melodiche.map(function (v) {
        const a = (p.note && p.note[L] && p.note[L][v.id]) || new Array(16).fill(0);
        return "    " + v.id + ": " + JSON.stringify(a);
      });
      r.push("  " + L + ": {");
      r.push(righe.join(",\n"));
      r.push("  }" + (L === "D" ? "" : ","));
    });
    r.push("};");
    r.push("");
    r.push("function segnala(tipo, dato) {");
    r.push("  if (!ascoltatore) return;");
    r.push("  try {");
    r.push("    ascoltatore(tipo, dato);");
    r.push("  } catch (e) {}");
    r.push("}");
    r.push("function osserva(fn) { ascoltatore = fn; }");
    r.push("");
    r.push("function tic(quando, forte) {");
    r.push("  soffio(quando, 0.03, forte ? 0.16 : 0.09, forte ? 2400 : 3600, forte ? 1400 : 2600, 'bandpass', busMusica);");
    r.push("}");
    r.push("");
    r.push("function suonaPasso(n2, quando, unita) {");
    r.push("  const P = PASSI[correnti] || PASSI.A;");
    r.push("  let solo = false;");
    r.push("  for (let i = 0; i < KIT.length; i++) if (KIT[i].solo) solo = true;");
    r.push("  for (let i = 0; i < KIT.length; i++) {");
    r.push("    const k = KIT[i];");
    r.push("    const c = ((P[k.id] || [])[n2] | 0);");
    r.push("    if (!c) continue;");
    r.push("    if (k.muto || (solo && !k.solo)) continue;");
    r.push("    const v = LIV[(c & 7) - 1] || 1;");
    r.push("    const acc = c & 8 ? 1.32 : 1;");
    r.push("    const s = n2 % 2 ? swing : 0;");
    r.push("    try {");
    r.push("      k.suona(quando + s * unita, v * acc * k.vol, unita * 2, busMusica, k.mel ? ((NOTE[correnti] || {})[k.id] || [])[n2] || 0 : 0);");
    r.push("    } catch (e) {}");
    r.push("  }");
    r.push("  if (metr && n2 % 4 === 0) tic(quando, n2 % 16 === 0);");
    r.push("  segnala('passo', { passo: n2, pattern: correnti, quando: quando });");
    r.push("}");
    r.push("");
    r.push("function fineCiclo() {");
    r.push("  if (sequenza.length > 1) {");
    r.push("    iSeq = (iSeq + 1) % sequenza.length;");
    r.push("    correnti = sequenza[iSeq] || 'A';");
    r.push("  }");
    r.push("  segnala('ciclo', { pattern: correnti, indice: iSeq });");
    r.push("}");
    r.push("");
    r.push("function passa() {");
    r.push("  if (!ctx) return;");
    r.push("  const unita = 60 / bpm / 4; // un sedicesimo");
    r.push("  const limite = ctx.currentTime + 0.12;");
    r.push("  let guardia = 0;");
    r.push("  while (prossimo < limite && guardia++ < 96) {");
    r.push("    if (prossimo < ctx.currentTime) prossimo = ctx.currentTime + 0.01;");
    r.push("    suonaPasso(passo, prossimo, unita);");
    r.push("    passo++;");
    r.push("    if (passo >= lungo) {");
    r.push("      passo = 0;");
    r.push("      fineCiclo();");
    r.push("    }");
    r.push("    prossimo += unita;");
    r.push("  }");
    r.push("}");
    r.push("");
    r.push("function parte() {");
    r.push("  if (!apre()) return false;");
    r.push("  if (ctx.state === 'suspended') ctx.resume();");
    r.push("  gira = true;");
    r.push("  if (!timer) {");
    r.push("    passo = 0;");
    r.push("    prossimo = ctx.currentTime + 0.06;");
    r.push("    timer = setInterval(passa, 25);");
    r.push("  }");
    r.push("  return true;");
    r.push("}");
    r.push("function ferma() {");
    r.push("  gira = false;");
    r.push("  if (timer) {");
    r.push("    clearInterval(timer);");
    r.push("    timer = null;");
    r.push("  }");
    r.push("  for (const g in aperta) chiudi(g, adesso());");
    r.push("}");
    r.push("");
    r.push("// Un colpo immediato, o a un momento preciso: per provare le voci e per gli eventi.",
      "// L'ultimo parametro è l'altezza, in semitoni: serve per suonare una nota a scelta.",
      "function colpo(id, q, quando, semi) {",
      "  if (!apre()) return;",
      "  if (ctx.state === 'suspended') ctx.resume();",
      "  const k = voce(id);",
      "  if (!k) return;",
      "  k.suona(quando === undefined ? adesso() : quando, q === undefined ? 1 : q, 60 / bpm / 2, busMusica, semi || 0);",
      "}"
    );
    r.push("");
    r.push("function mettiBpm(v) { bpm = Math.max(40, Math.min(240, v || bpm)); segnala('bpm', bpm); }");
    r.push("function mettiSwing(v) { swing = Math.max(0, Math.min(0.7, v || 0)); }");
    r.push("function mettiLunghezza(v) { lungo = Math.max(1, Math.min(16, v | 0)); }");
    r.push("function mettiMetro(v) { metr = !!v; }");
    r.push("function mettiSequenza(l) { if (l && l.length) { sequenza = l.slice(0, 64); iSeq = 0; } }");
    r.push("function mettiPattern(q) { if (PASSI[q]) { correnti = q; segnala('pattern', q); } }");
    r.push("// Cambia l'altezza di un passo, per una voce che suona una nota.");
    r.push("function mettiNota(id, passo, semi) {");
    r.push("  const N = NOTE[correnti];");
    r.push("  if (!N || !N[id]) return;");
    r.push("  const i = passo | 0;");
    r.push("  if (i < 0 || i > 15) return;");
    r.push("  N[id][i] = Math.max(-24, Math.min(24, semi | 0));");
    r.push("}");
    r.push("function mettiVoce(id, campo, val) {");
    r.push("  const k = voce(id);");
    r.push("  if (!k) return;");
    r.push("  k[campo] = val;");
    r.push("}");
    return r.join("\n");
  }

  /* ---------------- la musica del gioco ---------------- */
  function musica() {
    return [
      "/* ---------- la musica ---------- */",
      "const hz = (st) => 261.63 * Math.pow(2, st / 12);",
      "const mel = (st) => 523.25 * Math.pow(2, st / 12);",
      "const FORMA = [",
      "  { r: -12, ch: [0, 4, 7] },",
      "  { r: -15, ch: [-3, 0, 4] },",
      "  { r: -19, ch: [-7, -3, 0] },",
      "  { r: -17, ch: [-5, -1, 2] },",
      "  { r: -12, ch: [0, 4, 7] },",
      "  { r: -15, ch: [-3, 0, 4] },",
      "  { r: -10, ch: [-3, 2, 5] },",
      "  { r: -17, ch: [-5, -1, 2] }",
      "];",
      "const TEMA = [",
      "  [[0, 7, 2], [2, 4, 1], [3, 7, 1], [4, 12, 3]],",
      "  [[0, 9, 2], [2, 7, 1], [3, 4, 1], [4, 4, 2], [6, 2, 2]],",
      "  [[0, 5, 2], [2, 9, 1], [3, 12, 1], [4, 9, 2], [6, 5, 2]],",
      "  [[0, 7, 2], [2, 11, 1], [3, 14, 1], [4, 11, 4]],",
      "  [[0, 7, 2], [2, 4, 1], [3, 7, 1], [4, 12, 2], [6, 16, 2]],",
      "  [[0, 16, 2], [2, 14, 1], [3, 12, 1], [4, 9, 4]],",
      "  [[0, 14, 2], [2, 12, 1], [3, 9, 1], [4, 5, 2], [6, 9, 2]],",
      "  [[0, 7, 2], [2, 5, 1], [3, 4, 1], [4, 2, 2], [6, -1, 2]]",
      "];",
      "const TIPI = {",
      "  cantina: { bpm: 84, basso: 0.5, shaker: 0.25, tick: 0, comping: 0.5, pad: 0.6, melodia: 0.8 },",
      "  partita: { bpm: 108, basso: 0.55, shaker: 0.45, tick: 0.5, comping: 0.6, pad: 0.4, melodia: 0.85 },",
      "  pericolo: { bpm: 132, basso: 0.6, shaker: 0.6, tick: 0.7, comping: 0.7, pad: 0.2, melodia: 1 }",
      "};",
      "const grana = (a, b) => {",
      "  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;",
      "  return x - Math.floor(x);",
      "};",
      "let musica = null;",
      "function mettiMusica(tipo) {",
      "  if (!partita) return;",
      "  if (musica && musica === tipo) return;",
      "  musica = tipo;",
      "  if (!ctx) return;",
      "  if (!timerMusica) {",
      "    passoMusica = 0;",
      "    prossimoMusica = ctx.currentTime + 0.08;",
      "    timerMusica = setInterval(passaMusica, 40);",
      "  }",
      "}",
      "function fermaMusica() {",
      "  musica = null;",
      "  if (timerMusica) {",
      "    clearInterval(timerMusica);",
      "    timerMusica = null;",
      "  }",
      "}",
      "let timerMusica = null, passoMusica = 0, prossimoMusica = 0;",
      "function passaMusica() {",
      "  if (!ctx || !musica) return;",
      "  const cfg = TIPI[musica] || TIPI.partita;",
      "  const unita = 60 / cfg.bpm / 2;",
      "  const fine = ctx.currentTime + Math.max(0.12, unita * 3);",
      "  while (prossimoMusica < fine) {",
      "    suonaPassoMusica(passoMusica, prossimoMusica, cfg, unita);",
      "    passoMusica++;",
      "    prossimoMusica += unita;",
      "  }",
      "}",
      "function suonaPassoMusica(n2, quando, cfg, unita) {",
      "  const battuta = Math.floor(n2 / 8) % FORMA.length;",
      "  const s = n2 % 8;",
      "  const giro = Math.floor(n2 / 64) % 2;",
      "  const acc = FORMA[battuta];",
      "  if (cfg.basso > 0) {",
      "    if (s === 0) bassoMusica(hz(acc.r), quando, unita * 3, 0.3 * cfg.basso);",
      "    else if (s === 4) bassoMusica(hz(acc.r + 7), quando, unita * 2.5, 0.24 * cfg.basso);",
      "    else if (s === 7 && grana(battuta, 3) > 0.55)",
      "      bassoMusica(hz(FORMA[(battuta + 1) % FORMA.length].r), quando, unita * 1.2, 0.16 * cfg.basso);",
      "  }",
      "  if (cfg.shaker > 0)",
      "    soffio(quando, 0.05, (s % 2 ? 0.03 : 0.05) * cfg.shaker, 6500, 9500, 'highpass', busMusica);",
      "  if (cfg.tick > 0 && (s === 2 || s === 6))",
      "    tono('triangle', 1650, quando, 0.035, 0.06 * cfg.tick, 0, busMusica);",
      "  if (cfg.comping > 0 && (s === 3 || s === 7 || (s === 0 && grana(battuta, 5) > 0.6)))",
      "    pluck(acc.ch, quando, (s === 0 ? 0.035 : 0.055) * cfg.comping);",
      "  if (cfg.pad > 0 && s === 0) padMusica(acc.ch, quando, unita * 8, 0.022 * cfg.pad);",
      "  if (cfg.melodia > 0) {",
      "    for (const nota of TEMA[battuta]) {",
      "      if (nota[0] !== s) continue;",
      "      campanella(mel(nota[1]), quando, unita * nota[2] * 1.3, 0.11 * cfg.melodia);",
      "      if (giro) campanella(mel(nota[1]), quando + unita * 1.5, unita * nota[2], 0.035 * cfg.melodia);",
      "    }",
      "  }",
      "}",
      "function bassoMusica(freq, quando, dur, quanto) {",
      "  const o = ctx.createOscillator();",
      "  o.type = 'triangle';",
      "  o.frequency.setValueAtTime(freq, quando);",
      "  const lp = ctx.createBiquadFilter();",
      "  lp.type = 'lowpass';",
      "  lp.frequency.setValueAtTime(600, quando);",
      "  lp.frequency.exponentialRampToValueAtTime(220, quando + dur);",
      "  o.connect(lp);",
      "  lp.connect(inv(quando, quanto, 0.014, dur, busMusica));",
      "  o.start(quando);",
      "  o.stop(quando + dur + 0.05);",
      "}",
      "function pluck(toni, quando, quanto) {",
      "  toni.forEach(function (st, i) {",
      "    const t = quando + i * 0.014;",
      "    const f = hz(st);",
      "    tono('triangle', f, t, 0.22, quanto * (1 - i * 0.12), 0, busMusica);",
      "    tono('sine', f * 2, t, 0.12, quanto * 0.3, 0, busMusica);",
      "  });",
      "}",
      "function campanella(f, quando, dur, quanto) {",
      "  tono('sine', f, quando, Math.max(0.3, dur), quanto, 0, busMusica);",
      "  tono('sine', f * 2, quando, Math.max(0.16, dur * 0.55), quanto * 0.35, 0, busMusica);",
      "  tono('sine', f * 3.01, quando, 0.12, quanto * 0.12, 3, busMusica);",
      "  tono('triangle', f * 4.02, quando, 0.06, quanto * 0.08, 0, busMusica);",
      "}",
      "function padMusica(toni, quando, dur, quanto) {",
      "  for (const st of toni) {",
      "    const o = ctx.createOscillator();",
      "    o.type = 'sine';",
      "    o.frequency.setValueAtTime(hz(st - 12), quando);",
      "    const g = ctx.createGain();",
      "    g.gain.setValueAtTime(0.0001, quando);",
      "    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, quanto), quando + dur * 0.35);",
      "    g.gain.exponentialRampToValueAtTime(0.0001, quando + dur);",
      "    o.connect(g);",
      "    g.connect(busMusica);",
      "    o.start(quando);",
      "    o.stop(quando + dur + 0.05);",
      "  }",
      "}"
    ].join("\n");
  }

  /* ---------- il file, tutto junto ---------- */
  function codice(p, op) {
    op = op || {};
    const nome = op.nome || "A";
    const ogg = op.commenti === false ? [] : [
      "/* ============================================================",
      "   " + p.nome,
      "   Sequencer: " + p.kit.length + " voci, " + p.bpm + " bpm, swing " +
        Math.round(p.swing * 100) + "%, catena " + p.catena.join("-"),
      "   Generato il " + new Date().toLocaleString("it-IT"),
      "   Uso:  window." + nome + ".sveglia();  " + nome + ".suona('tappo');  " + nome + ".parte();",
      "   ============================================================ */"
    ];
    if (op.json !== false) {
      ogg.push("/* PROGETTO: " + JSON.stringify(p) + " */");
    }
    ogg.push("window." + nome + " = (function () {");
    ogg.push("  'use strict';");
    ogg.push("  let partita = false;");
    ogg.push(ind(impianto(op), 2));
    ogg.push("");
    ogg.push(ind(mattoni(), 2));
    ogg.push("");
    if (op.sequencer !== false) {
      ogg.push(ind(kit(p), 2));
      ogg.push("");
      ogg.push(ind(sequencer(p), 2));
      ogg.push("");
    } else {
      ogg.push("/* ---------- il kit ---------- */");
      ogg.push("const KIT = [];");
      ogg.push("const NOTE = {};");
      ogg.push("function voce(id) { return null; }");
      ogg.push("// Nessun sequencer in questo modulo: le chiamate restano buone e mute.");
      ogg.push("let gira = false;");
      ogg.push("function parte() { return false; }");
      ogg.push("function ferma() { gira = false; }");
      ogg.push("function colpo() {}");
      ogg.push("function mettiNota() {}");
      ogg.push("function mettiVoce() {}");
      ogg.push("function osserva() {}");
      ogg.push("function sequenzaNote() { return NOTE; }");
      ogg.push("function lista() { return []; }");
      ogg.push("");
    }
    if (op.effetti !== false) {
      ogg.push(ind(effetti(), 2));
    } else {
      ogg.push("const EFFETTI = {};");
      ogg.push("function suona() {}");
    }
    ogg.push("");
    if (op.musica !== false) {
      ogg.push(ind(musica(), 2));
    } else {
      ogg.push("let musica = null;");
      ogg.push("function mettiMusica() {}");
      ogg.push("function fermaMusica() {}");
    }
    ogg.push("");
    ogg.push("/* ---------- le manopole ---------- */");
    ogg.push("function metti(which, acceso) {");
    ogg.push("  if (!apre()) return false;");
    ogg.push("  const g = which === 'musica' ? busMusica : busEffetti;");
    ogg.push("  if (!g) return false;");
    ogg.push("  g.gain.setTargetAtTime(acceso ? (which === 'musica' ? 0.5 : 0.85) : 0, ctx.currentTime, 0.05);");
    ogg.push("  return true;");
    ogg.push("}");
    ogg.push("function accesa(which) {");
    ogg.push("  const g = which === 'musica' ? busMusica : busEffetti;");
    ogg.push("  return !!g && g.gain.value > 0.01;");
    ogg.push("}");
    ogg.push("function volume(v) {");
    ogg.push("  if (!apre()) return volBase;");
    ogg.push("  volBase = Math.max(0, Math.min(1.2, v));");
    ogg.push("  padroni.gain.setTargetAtTime(volBase, ctx.currentTime, 0.04);");
    ogg.push("  return volBase;");
    ogg.push("}");
    ogg.push("function libera() {");
    ogg.push("  if (!ctx) return;");
    ogg.push("  for (const g in aperta) chiudi(g, adesso());");
    if (op.sequencer !== false) {
      ogg.push("  if (timer) { clearInterval(timer); timer = null; }");
      ogg.push("  gira = false;");
    }
    if (op.musica !== false) {
      ogg.push("  if (timerMusica) { clearInterval(timerMusica); timerMusica = null; }");
      ogg.push("  musica = null;");
      ogg.push("  partita = false;");
    }
    ogg.push("  try { padroni.disconnect(); } catch (e) { /* era già staccato */ }");
    ogg.push("  ctx = null;");
    ogg.push("  padroni = null;");
    ogg.push("  aperta = {};");
    ogg.push("}");
    ogg.push("");
    ogg.push("/* ---------- sveglia ---------- */");
    ogg.push("function sveglia() {");
    ogg.push("  if (!apre()) return;");
    ogg.push("  if (ctx.state === 'suspended') ctx.resume();");
    ogg.push("  if (!partita) {");
    ogg.push("    partita = true;");
    if (op.sequencer !== false) {
      ogg.push("    passo = 0;");
      ogg.push("    prossimo = ctx.currentTime + 0.08;");
    }
    ogg.push("  }");
    if (op.sequencer !== false) {
      ogg.push("  if (gira && !timer) timer = setInterval(passa, 25);");
      if (op.musica !== false) ogg.push("  if (musica && !timerMusica) timerMusica = setInterval(passaMusica, 40);");
    }
    ogg.push("}");
    ogg.push("");
    ogg.push("  return {");
    const api = ["sveglia", "suona", "metti", "accesa", "musica: mettiMusica", "silenzio: fermaMusica", "suoneria: Object.keys(EFFETTI)", "orologio: () => (ctx ? ctx.currentTime : 0)", "volume", "libera"];
    if (op.sequencer !== false) {
      api.push("// il sequencer");
      api.push("parte");
      api.push("ferma");
      api.push("colpo");
      api.push("bpm: mettiBpm");
      api.push("swing: mettiSwing");
      api.push("lunghezza: mettiLunghezza");
      api.push("metro: mettiMetro");
      api.push("sequenza: mettiSequenza");
      api.push("pattern: mettiPattern");
      api.push("nota: mettiNota");
      api.push("voce: mettiVoce");
      api.push("osserva");
      api.push("girando: () => gira");
      api.push("passo: () => passo");
      api.push("bpmChe: () => bpm");
      api.push("catena: () => sequenza.slice()");
      api.push("indiceCatena: () => iSeq");
      api.push("sequenzaPassi: () => PASSI");
      api.push("sequenzaNote: () => NOTE");
      api.push("lista: KIT.map((k) => ({ id: k.id, nome: k.nome, gruppo: k.gruppo, mot: k.mot, mel: k.mel }))");
    } else {
      api.push("// il sequencer: qui è muto, ma le chiamate ci sono lo stesso");
      api.push("parte");
      api.push("ferma");
      api.push("colpo");
      api.push("nota: mettiNota");
      api.push("voce: mettiVoce");
      api.push("osserva");
      api.push("girando: () => gira");
      api.push("sequenzaNote");
      api.push("lista");
    }
    api.forEach(function (riga, i) {
      ogg.push("    " + riga + (i < api.length - 1 ? "," : ""));
    });
    ogg.push("  };");
    ogg.push("})();");
    return ogg.join("\n") + "\n";
  }

  function involucrato(src) {
    return "<script>\n" + src + "</script>\n";
  }

  return { codice: codice, involucrato: involucrato, numero: n, motoreEtichetta: motoreEtichetta, tag: tag };
})();
