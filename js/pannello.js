/* Il pannello: manopole, fader, la griglia dei passi e l'editor di una voce. */
window.UI = (function () {
  "use strict";

  const ST = window.ST;
  let app = null;
  let hostSeq = null;
  let hostVoce = null;
  const pad = {};
  const strip = {};
  const btnVoce = {};
  let spinta = null;
  let appunti = null;
  let nube = null;

  function el(t, classe, testo) {
    const e = document.createElement(t);
    if (classe) e.className = classe;
    if (testo !== undefined && testo !== null) e.textContent = testo;
    return e;
  }
  function forza(c) {
    if (!c) return 0;
    return (ST.LIVELLI[(c & 7) - 1] || 1) * (c & 8 ? 1.32 : 1);
  }
  function numero(v) {
    if (Math.abs(v) >= 100) return String(Math.round(v));
    if (Math.abs(v) >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }
  function formatta(v, spec) {
    if (spec.sel) return String(v);
    if (spec.un === "s") return v < 1 ? Math.round(v * 1000) + " ms" : numero(v) + " s";
    if (spec.un === "Hz") return v < 1000 ? Math.round(v) + " Hz" : numero(v / 1000) + " kHz";
    if (spec.un === "cent") return Math.round(v) + " ct";
    if (spec.un === "semi") return (v > 0 ? "+" : "") + Math.round(v);
    if (spec.un === "x") return numero(v) + "×";
    if (spec.max <= 2 && spec.min >= -1) return Math.round(v * 100) + "%";
    return numero(v);
  }

  /* ---------------- manopola ---------------- */
  function manopola(op) {
    const spec = op.spec;
    const g = Math.min(1, Math.max(0, ST.norm(op.valore, spec)));
    const wrap = el("div", "manopola" + (op.piccola ? " piccola" : ""));
    wrap.innerHTML =
      '<div class="quadrante">' +
      '<svg viewBox="0 0 44 44" class="anello">' +
      '<circle class="anello-fondo" cx="22" cy="22" r="15.5" transform="rotate(135 22 22)"/>' +
      '<circle class="anello-valore" cx="22" cy="22" r="15.5" transform="rotate(135 22 22)"/>' +
      "</svg>" +
      '<div class="corpo"><i></i></div>' +
      "</div>" +
      '<div class="etichetta"></div>' +
      '<div class="valore"></div>';
    const arco = wrap.querySelector(".anello-valore");
    const punta = wrap.querySelector(".corpo i");
    const et = wrap.querySelector(".etichetta");
    const val = wrap.querySelector(".valore");
    et.textContent = op.et;
    const giro = 15.5 * 2 * Math.PI;
    const giroUtil = giro * 0.75;

    function disegna(v) {
      const t = Math.min(1, Math.max(0, ST.norm(v, spec)));
      arco.style.strokeDasharray = (giroUtil * t).toFixed(2) + " " + giro.toFixed(2);
      punta.style.transform = "rotate(" + (-135 + 270 * t).toFixed(2) + "deg)";
      val.textContent = formatta(v, spec);
    }
    disegna(op.valore);

    let trascinato = false;
    let inizio = 0;
    wrap.addEventListener("pointerdown", function (ev) {
      trascinato = true;
      inizio = ev.clientY;
      try { wrap.setPointerCapture(ev.pointerId); } catch (e) { /* il browser non collabora */ }
      wrap.classList.add("preso");
      ev.preventDefault();
    });
    wrap.addEventListener("pointermove", function (ev) {
      if (!trascinato) return;
      const fine = 220;
      const delta = (inizio - ev.clientY) / fine;
      if (Math.abs(delta) < 0.004) return;
      inizio = ev.clientY;
      let t = ST.norm(op.leggi(), spec) + delta;
      t = Math.min(1, Math.max(0, t));
      op.cambia(ST.daNorm(t, spec));
      // la manopola si ridisegna da sé: così ogni chiamante la vede muovere
      disegna(op.leggi());
    });
    wrap.addEventListener("pointerup", function () {
      trascinato = false;
      wrap.classList.remove("preso");
    });
    wrap.addEventListener("pointercancel", function () {
      trascinato = false;
      wrap.classList.remove("preso");
    });
    wrap.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      const t = ST.norm(op.leggi(), spec) - Math.sign(ev.deltaY) * (ev.shiftKey ? 0.01 : 0.04);
      op.cambia(ST.daNorm(Math.min(1, Math.max(0, t)), spec));
      disegna(op.leggi());
    }, { passive: false });
    wrap.addEventListener("dblclick", function () {
      op.cambia(spec.def);
      disegna(op.leggi());
    });

    return {
      el: wrap,
      leggi: op.leggi,
      imposta: disegna,
      spenta: function () { wrap.classList.add("spenta"); },
      accendi: function () { wrap.classList.remove("spenta"); }
    };
  }

  /* ---------------- rotante (interruttore) ---------------- */
  function rotante(op) {
    const spec = op.spec;
    const wrap = el("div", "rotante");
    const b = el("button", "rot-bottone");
    b.appendChild(el("span", "rot-val"));
    b.appendChild(el("span", "rot-freccia", "◀"));
    wrap.appendChild(b);
    wrap.appendChild(el("div", "etichetta", op.et));
    const val = b.querySelector(".rot-val");
    function disegna(v) {
      val.textContent = v;
    }
    disegna(op.valore);
    b.addEventListener("click", function (ev) {
      const i = spec.sel.indexOf(op.leggi());
      const passo = ev.shiftKey ? -1 : 1;
      const nuovo = spec.sel[(i + passo + spec.sel.length) % spec.sel.length];
      op.cambia(nuovo);
      disegna(op.leggi());
    });
    return { el: wrap, leggi: op.leggi, imposta: disegna, spenta: function () { wrap.classList.add("spenta"); } };
  }

  /* ---------------- fader ---------------- */
  function fader(op) {
    const spec = op.spec;
    const wrap = el("div", "fader" + (op.orizontale ? " orizzontale" : ""));
    wrap.innerHTML = '<div class="f-binario"><div class="f-pieno"></div><div class="f-maniglia"></div></div>';
    const maniglia = wrap.querySelector(".f-maniglia");
    const pieno = wrap.querySelector(".f-pieno");
    function disegna(v) {
      const t = Math.min(1, Math.max(0, ST.norm(v, spec)));
      if (op.orizzontale) {
        maniglia.style.left = (t * 100) + "%";
        pieno.style.width = (t * 100) + "%";
      } else {
        maniglia.style.bottom = (t * 100) + "%";
        pieno.style.height = (t * 100) + "%";
      }
      wrap.title = formatta(v, spec);
    }
    disegna(op.valore);
    let trascinato = false;
    let inizio = 0;
    let inizioT = 0;
    wrap.addEventListener("pointerdown", function (ev) {
      trascinato = true;
      wrap.classList.add("preso");
      inizio = op.orizzontale ? ev.clientX : ev.clientY;
      const r = wrap.querySelector(".f-binario").getBoundingClientRect();
      const q = op.orizzontale ? (ev.clientX - r.left) / r.width : 1 - (ev.clientY - r.top) / r.height;
      inizioT = Math.min(1, Math.max(0, q));
      op.cambia(ST.daNorm(inizioT, spec));
      disegna(op.leggi());
      try { wrap.setPointerCapture(ev.pointerId); } catch (e) { /* il browser non collabora */ }
      ev.preventDefault();
    });
    wrap.addEventListener("pointermove", function (ev) {
      if (!trascinato) return;
      const t = inizioT + (op.orizzontale ? ev.clientX - inizio : inizio - ev.clientY) / 160;
      op.cambia(ST.daNorm(Math.min(1, Math.max(0, t)), spec));
      disegna(op.leggi());
    });
    wrap.addEventListener("pointerup", function () {
      trascinato = false;
      wrap.classList.remove("preso");
    });
    wrap.addEventListener("pointercancel", function () {
      trascinato = false;
      wrap.classList.remove("preso");
    });
    wrap.addEventListener("dblclick", function () { op.cambia(spec.def); disegna(op.leggi()); });
    return { el: wrap, imposta: disegna };
  }

  /* ---------------- la griglia ---------------- */
  function costruisciSequencer() {
    hostSeq.innerHTML = "";
    Object.keys(pad).forEach(function (id) { delete pad[id]; });
    Object.keys(strip).forEach(function (id) { delete strip[id]; });
    const p = app.prog();
    const cap = el("div", "cap-intest");
    cap.appendChild(el("div", "spazio", ""));
    for (let i = 0; i < 16; i++) {
      const b = el("button", "num" + (i % 4 === 0 ? " battuta" : ""), String(i + 1));
      b.title = "Lunghezza del pattern: " + (i + 1);
      b.addEventListener("click", function () {
        p.lunghezza = i + 1;
        app.salva();
        disegnaTutto();
      });
      cap.appendChild(b);
    }
    hostSeq.appendChild(cap);

    // La scala vale per tutte le voci che suonano una nota: le altezze si
    // agganciano ai gradini scelti, così una melodia non stona.
    const scala = el("div", "riga-scala");
    scala.appendChild(el("span", "etichetta-scala", "SCALA"));
    const selScala = el("select", "sel-scala");
    [["libera", "libera"], ["maggiore", "maggiore"], ["minore", "minore"], ["pentatonica", "pentatonica"]].forEach(function (s) {
      const o = el("option", null, s[1]);
      o.value = s[0];
      if (p.scala === s[0]) o.selected = true;
      selScala.appendChild(o);
    });
    selScala.addEventListener("change", function () {
      p.scala = selScala.value;
      app.salva();
      disegnaTutto();
      stato(p.scala === "libera" ? "scala libera" : "scala " + p.scala);
    });
    scala.appendChild(selScala);
    const aiuto = el("span", "suggerimento",
      "click per accendere · trascina in alto o in basso per l'altezza · di lato per verniciare · rotellina per il semitone");
    scala.appendChild(aiuto);
    hostSeq.appendChild(scala);

    ST.GRUPPI.forEach(function (g) {
      const sec = el("section", "blocco");
      const h = el("header", "blocco-tit");
      h.appendChild(el("span", "pallino"));
      h.querySelector(".pallino").style.background = g.colore;
      h.appendChild(el("h3", null, g.nome));
      const quante = attiveDelGruppo(p, g.id).length;
      h.appendChild(el("span", "conta", quante + (quante === 1 ? " strumento" : " strumenti")));
      const aggiungi = el("button", "bottone mini aggiungi", "+ strumento");
      aggiungi.addEventListener("click", function () { apriCatalogo(g, aggiungi); });
      h.appendChild(aggiungi);
      sec.appendChild(h);
      const gr = el("div", "griglia");
      attiveDelGruppo(p, g.id).forEach(function (id) {
        const v = ST.voce(p, id);
        const st = el("div", "striscia");
        const nome = el("button", "voce-nome" + (v.muto ? " spenta" : ""));
        nome.appendChild(el("b", null, id.toUpperCase()));
        nome.appendChild(el("span", null, v.nome));
        nome.addEventListener("click", function () {
          app.seleziona(id);
        });
        st.appendChild(nome);
        const tasti = el("div", "tasti");
        const m = el("button", "tasto m" + (v.muto ? " attivo" : ""), "M");
        m.title = "Muto";
        m.addEventListener("click", function () {
          v.muto = !v.muto;
          m.classList.toggle("attivo", v.muto);
          nome.classList.toggle("spenta", v.muto);
          app.salva();
        });
        const so = el("button", "tasto s" + (v.solo ? " attivo" : ""), "S");
        so.title = "Solo";
        so.addEventListener("click", function () {
          v.solo = !v.solo;
          so.classList.toggle("attivo", v.solo);
          app.salva();
        });
        const via = el("button", "tasto via", "−");
        via.title = "Togli «" + v.nome + "» dal progetto";
        via.addEventListener("click", function () {
          if (!window.confirm("Togliere «" + v.nome + "» e i suoi passi?")) return;
          ST.togliVoce(app.prog(), id);
          if (app.selezione() === id) app.seleziona(null);
          // anche in questo caso la griglia va rifatta, altrimenti la
          // striscia del suono tolto resta lì
          costruisciSequencer();
          costruisciVoce();
          app.salva();
          stato(v.nome + " tolto");
        });
        tasti.appendChild(m);
        tasti.appendChild(so);
        tasti.appendChild(via);
        st.appendChild(tasti);
        const f = fader({
          spec: { min: 0, max: 1.6, def: 1, curva: "lin" },
          valore: v.vol,
          orizzontale: true,
          // la voce può essere stata tolta mentre il puntatore era già su
          leggi: function () { const w = ST.voce(app.prog(), id); return w ? w.vol : 0; },
          cambia: function (val) { const w = ST.voce(app.prog(), id); if (w) w.vol = val; app.salva(); }
        });
        st.appendChild(f.el);
        gr.appendChild(st);
        strip[id] = { nome: nome, m: m, s: so, fader: f };

        const riga = [];
        const mel = ST.melodico(v.mot);
        for (let i = 0; i < 16; i++) {
          const cella = el("div", "passo" + (i % 4 === 0 ? " battuta" : "") + (mel ? " mel" : ""));
          cella.dataset.id = id;
          cella.dataset.i = String(i);
          if (mel) cella.appendChild(el("span", "nota"));
          gr.appendChild(cella);
          riga.push(cella);
        }
        pad[id] = riga;
      });
      sec.appendChild(gr);
      hostSeq.appendChild(sec);
    });

    griglia();
    disegnaTutto();
  }

  // Le voci di un gruppo che sono davvero nel progetto, nell'ordine del catalogo.
  function attiveDelGruppo(p, gruppo) {
    return p.kit.filter(function (v) { return v.gruppo === gruppo; })
      .map(function (v) { return v.id; });
  }

  // Il menù degli strumenti: qui si sceglie cosa aggiungere al progetto.
  function apriCatalogo(gruppo, ancora) {
    console.log("apriCatalogo gruppo:", gruppo);
    chiudiCatalogo();
    const scelte = ST.catalogoDi(gruppo.id)
      .map(function (id) { return ST.base(id); })
      .filter(function (v) { return !!v; })
      .map(function (v) {
        const m = ST.MOTORI.filter(function (x) { return x.id === v.mot; })[0];
        return { id: v.id, nome: v.nome, mot: v.mot, motore: m ? m.nome : v.mot };
      });
    console.log("scelte per gruppo " + gruppo.id + ":", scelte.map(s => s.id));
    const g = ST.GRUPPI.filter(function (x) { return x.id === gruppo.id; })[0] || gruppo;
    if (!scelte.length) { console.warn("nessuno strumento nel catalogo per", gruppo.id); return stato("in " + g.nome + " non c'è nient'altro da mettere"); }

    const prog = app.prog();
    const liberi = scelte.filter(function (b) { return !ST.voce(prog, b.id); });
    const sc = el("div", "nube-catalogo");
    sc.tabIndex = -1;
    const intest = el("div", "nube-cap");
    intest.appendChild(el("span", "pallino")).style.background = g.colore;
    intest.appendChild(el("b", null, "AGGIUNGI IN " + g.nome));
    intest.appendChild(el("span", "nube-conta", liberi.length
      ? liberi.length + " disponibili" : "già ci sono tutti"));
    const chiudi = el("button", "bottone mini", "chiudi");
    chiudi.addEventListener("click", chiudiCatalogo);
    intest.appendChild(chiudi);
    sc.appendChild(intest);

    scelte.forEach(function (b) {
      const riga = el("div", "riga-catalogo");
      const dentro = !!ST.voce(prog, b.id);
      riga.className = "riga-catalogo" + (dentro ? " dentro" : "");
      const et = el("div", "riga-dati");
      et.appendChild(el("b", null, b.id.toUpperCase()));
      et.appendChild(el("span", null, b.nome));
      et.appendChild(el("em", null, b.motore + (ST.melodico(b.mot) ? " · suona note" : "")));
      riga.appendChild(et);
      const puls = el("button", "bottone mini" + (dentro ? "" : " verde"), dentro ? "nel progetto" : "+ aggiungi");
      puls.disabled = dentro;
      puls.title = dentro ? b.nome + " è già nel progetto" : "Aggiungi " + b.nome + " al progetto";
      puls.addEventListener("click", function (ev) {
        try {
          if (!ST.aggiungiVoce(prog, b.id)) return;
          // prima costruisci la griglia: se la selezione poi fallisce,
          // la striscia nuova c'è già
          costruisciSequencer();
          app.seleziona(b.id);
          costruisciVoce();
          app.salva();
          stato(b.nome + " aggiunto");
          chiudiCatalogo();
        } catch (err) {
          console.error("aggiungi strumento fallito:", err);
          try { stato("Errore: " + err.message); } catch (_) {}
        }
      });
      riga.appendChild(puls);
      sc.appendChild(riga);
    });

    document.body.appendChild(sc);
    // crea e mostra il backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "nube-backdrop";
    document.body.appendChild(backdrop);
    // force reflow poi aggiunge classe per animazione
    void backdrop.offsetWidth;
    backdrop.classList.add("visibile");
    void sc.offsetWidth;
    sc.classList.add("visibile");
    nube = sc;
    nube.backdrop = backdrop;
    const r = ancora.getBoundingClientRect();
    const larghezza = 320;
    // se l'ancora non ha dimensioni (nascosta, non renderizzata), centriamo
    const haDimensioni = r.width > 0 && r.height > 0;
    let sinistra = haDimensioni
      ? Math.max(8, Math.min(r.left, window.innerWidth - larghezza - 12))
      : Math.max(8, (window.innerWidth - larghezza) / 2);
    const alto = sc.getBoundingClientRect().height || 300;
    let top = haDimensioni
      ? (r.bottom + 6 + alto > window.innerHeight - 12 && window.innerHeight - alto - 12 > r.top)
        ? Math.max(8, window.innerHeight - alto - 12)
        : Math.max(8, Math.min(r.bottom + 6, window.innerHeight - alto - 12))
      : Math.max(8, (window.innerHeight - alto) / 2);
    // clamp finale: la nuvola DEVE stare tutta dentro al viewport
    const maxLeft = Math.max(8, window.innerWidth - larghezza - 8);
    const maxTop = Math.max(8, window.innerHeight - alto - 8);
    sinistra = Math.min(Math.max(8, sinistra), maxLeft);
    top = Math.min(Math.max(8, top), maxTop);
    sc.style.left = sinistra + "px";
    sc.style.top = top + "px";
    // aggiunge i listener al prossimo tick per evitare race con il click d'apertura
    setTimeout(function () {
      document.addEventListener("pointerdown", fuori, true);
      document.addEventListener("keydown", scappa, true);
    }, 0);
    sc.focus();
  }
  function chiudiCatalogo() {
    if (nube) {
      // animazione di uscita
      nube.classList.remove("visibile");
      if (nube.backdrop) nube.backdrop.classList.remove("visibile");
      setTimeout(function () {
        if (nube && nube.parentNode) document.body.removeChild(nube);
        if (nube && nube.backdrop && nube.backdrop.parentNode) document.body.removeChild(nube.backdrop);
        document.removeEventListener("pointerdown", fuori, true);
        document.removeEventListener("keydown", scappa, true);
        nube = null;
      }, 160);
    }
  }
  function fuori(ev) {
    if (nube && !nube.contains(ev.target)) chiudiCatalogo();
  }
  function scappa(ev) {
    if (ev.key === "Escape") chiudiCatalogo();
  }

  function griglia() {
    if (griglia.pronta) return;
    griglia.pronta = true;
    hostSeq.addEventListener("pointerdown", function (ev) {
      const cella = ev.target.closest(".passo");
      if (!cella) return;
      const id = cella.dataset.id;
      const i = parseInt(cella.dataset.i, 10);
      const p = app.prog();
      const v0 = ST.voce(p, id);
      const arr = p.passi[p.pattern] && p.passi[p.pattern][id];
      if (!v0 || !arr) return;
      const stato = arr[i];
      const mel = ST.melodico(v0.mot);
      if (mel) {
        // Su una voce melodica il click accende e spegne, il trascinamento in alto
        // e in basso cambia l'altezza, quello di lato vernicia la durata.
        if (!(stato & 7)) {
          arr[i] = 3;
          app.salva();
          disegnaPad(id, i);
        }
        spinta = {
          mel: true,
          id: id,
          i: i,
          semi0: ST.leggiNota(p, id, i),
          y0: ev.clientY,
          x0: ev.clientX,
          mosso: false,
          azione: (stato & 7) ? "spegne" : "accende",
          cella: cella
        };
        cella.classList.add("trascinata");
        if (arr[i]) app.colpo(id, forza(arr[i]), undefined, ST.leggiNota(p, id, i));
        ev.preventDefault();
        return;
      }
      if (ev.shiftKey) {
        if (!stato) arr[i] = 3;
        arr[i] ^= 8;
      } else if (stato & 7) {
        arr[i] = ((stato & 7) % 4) + 1;
      } else {
        arr[i] = 3;
      }
      spinta = { mel: false, azione: (stato & 7) ? "spegne" : "accende" };
      app.salva();
      disegnaPad(id, i);
      if (arr[i]) app.colpo(id, forza(arr[i]));
    });
    window.addEventListener("pointerup", function (ev) {
      if (spinta && spinta.mel) {
        if (spinta.cella) spinta.cella.classList.remove("trascinata");
        // un click pulito su un pad già acceso lo spegne
        if (!spinta.mosso) {
          const p = app.prog();
          const arr = p.passi[p.pattern][spinta.id];
          if (arr[spinta.i] & 7) {
            arr[spinta.i] = 0;
            app.salva();
            disegnaPad(spinta.id, spinta.i);
          }
        }
      }
      spinta = null;
    });
    hostSeq.addEventListener("pointermove", function (ev) {
      if (!spinta) return;
      if (spinta.mel) {
        const p = app.prog();
        const dy = spinta.y0 - ev.clientY;
        const dx = ev.clientX - spinta.x0;
        if (!spinta.mosso) {
          if (Math.abs(dy) < 4 && Math.abs(dx) < 6) return;
          spinta.mosso = true;
        }
        if (Math.abs(dy) >= Math.abs(dx)) {
          // alto e basso: l'altezza, un semitono ogni quattro pixel
          const semi = ST.quantizza(
            Math.max(ST.SEMI_MIN, Math.min(ST.SEMI_MAX, spinta.semi0 + Math.round(dy / 4))),
            p.scala
          );
          if (semi !== ST.leggiNota(p, spinta.id, spinta.i)) {
            ST.impostaNota(p, spinta.id, spinta.i, semi);
            app.salva();
            disegnaPad(spinta.id, spinta.i);
            app.colpo(spinta.id, forza(p.passi[p.pattern][spinta.id][spinta.i]), undefined, semi);
          }
        } else {
          // di lato: vernicia la durata sui passi vicini
          const sotto = document.elementFromPoint ? document.elementFromPoint(ev.clientX, ev.clientY) : null;
          const cella = sotto && sotto.closest ? sotto.closest(".passo") : null;
          if (!cella || !hostSeq.contains(cella)) return;
          const cid = cella.dataset.id;
          const ci = parseInt(cella.dataset.i, 10);
          if (cid !== spinta.id) return;
          const arr = p.passi[p.pattern][cid];
          const c = arr[spinta.i] || 3;
          if (arr[ci] === c) return;
          arr[ci] = c;
          ST.impostaNota(p, cid, ci, ST.leggiNota(p, spinta.id, spinta.i));
          app.salva();
          disegnaPad(cid, ci);
        }
        return;
      }
      const sotto = document.elementFromPoint ? document.elementFromPoint(ev.clientX, ev.clientY) : ev.target;
      const cella = sotto && sotto.closest ? sotto.closest(".passo") : null;
      if (!cella || !hostSeq.contains(cella)) return;
      const id = cella.dataset.id;
      const i = parseInt(cella.dataset.i, 10);
      const arr = app.prog().passi[app.prog().pattern][id];
      const c = spinta.azione === "spegne" ? 0 : 3;
      if (arr[i] === c || (!c && !arr[i])) return;
      arr[i] = c;
      app.salva();
      disegnaPad(id, i);
    });
    hostSeq.addEventListener("contextmenu", function (ev) {
      const cella = ev.target.closest(".passo");
      if (!cella) return;
      ev.preventDefault();
      const id = cella.dataset.id;
      const i = parseInt(cella.dataset.i, 10);
      app.prog().passi[app.prog().pattern][id][i] = 0;
      app.salva();
      disegnaPad(id, i);
    });
    // la rotellina cambia l'altezza, senza toccare il resto
    hostSeq.addEventListener("wheel", function (ev) {
      const cella = ev.target.closest(".passo");
      if (!cella) return;
      const id = cella.dataset.id;
      const p = app.prog();
      if (!ST.melodico(ST.voce(p, id).mot)) return;
      ev.preventDefault();
      const i = parseInt(cella.dataset.i, 10);
      const semi = ST.quantizza(ST.leggiNota(p, id, i) + (ev.deltaY < 0 ? 1 : -1), p.scala);
      ST.impostaNota(p, id, i, semi);
      app.salva();
      disegnaPad(id, i);
      app.colpo(id, forza(p.passi[p.pattern][id][i]), undefined, semi);
    }, { passive: false });
  }

  function disegnaPad(id, i) {
    const cella = pad[id] && pad[id][i];
    if (!cella) return;
    const p = app.prog();
    // la cella può essere rimasta indietro dopo che la voce è stata tolta:
    // in quel caso il passo non c'è più e non c'è nemmeno la voce
    const v0 = ST.voce(p, id);
    const arr = p.passi[p.pattern] && p.passi[p.pattern][id];
    if (!v0 || !arr) { cella.className = "passo"; return; }
    const c = arr[i] | 0;
    const v = c & 7;
    const mel = ST.melodico(v0.mot);
    const inTrag = !!(spinta && spinta.mel && spinta.id === id && spinta.i === i);
    cella.className = "passo" + (i % 4 === 0 ? " battuta" : "") + (mel ? " mel" : "") +
      (v ? " acceso" : "") + (v ? " forza" + v : "") + (c & 8 ? " accento" : "") +
      (inTrag ? " trascinata" : "") + (i >= p.lunghezza ? " fuori" : "");
    if (mel) {
      const semi = ST.leggiNota(p, id, i);
      const et = cella.querySelector(".nota");
      if (et) et.textContent = v ? ST.notaNome(ST.notaFrequenza(v0, semi)) : "";
      // il colore segue l'altezza: più in alto è la nota, più chiaro il pad
      cella.style.setProperty("--alto", String(Math.round(((semi - ST.SEMI_MIN) / (ST.SEMI_MAX - ST.SEMI_MIN)) * 100)) + "%");
    }
  }

  function disegnaTutto() {
    const p = app.prog();
    Object.keys(pad).forEach(function (id) {
      for (let i = 0; i < 16; i++) disegnaPad(id, i);
    });
    Object.keys(strip).forEach(function (id) {
      const v = ST.voce(p, id);
      if (!v) return;
      strip[id].m.classList.toggle("attivo", v.muto);
      strip[id].s.classList.toggle("attivo", v.solo);
      strip[id].fader.imposta(v.vol);
      strip[id].nome.classList.toggle("spenta", v.muto);
      strip[id].nome.classList.toggle("scelta", id === app.selezione());
    });
    const numeri = hostSeq.querySelectorAll(".cap-intest .num");
    for (let i = 0; i < numeri.length; i++) {
      numeri[i].classList.toggle("fuori", i >= p.lunghezza);
    }
  }

  function lampegia(passo, pattern) {
    const p = app.prog();
    if (pattern !== p.pattern) return;
    Object.keys(pad).forEach(function (id) {
      const arr = p.passi[pattern][id];
      if (!arr) return;
      const cella = pad[id] && pad[id][passo];
      if (!cella || !arr[passo]) return;
      cella.classList.add("lamp");
      setTimeout(function () { cella.classList.remove("lamp"); }, 90);
    });
  }

  /* ---------------- l'editor di una voce ---------------- */
  function costruisciVoce() {
    const p = app.prog();
    const v = ST.voce(p, app.selezione());
    hostVoce.innerHTML = "";
    // la mappa dei bottoni si ricrea da zero: se no resterebbero dentro
    // strumenti che il progetto non ha più
    Object.keys(btnVoce).forEach(function (id) { delete btnVoce[id]; });

    // Il progetto può essere vuoto: si può togliere anche l'ultimo strumento.
    if (!v) {
      const vuoto = el("div", "voce-vuoto");
      vuoto.appendChild(el("b", null, "Nessuno strumento"));
      vuoto.appendChild(el("p", null, "Il progetto è vuoto. Aprili "
        + "un gruppo qui a sinistra e scegli cosa ci mettere."));
      hostVoce.appendChild(vuoto);
      return;
    }

    const lista = el("div", "lista-voci");
    ST.GRUPPI.forEach(function (g) {
      const t = el("div", "lista-gruppo");
      const pall = el("span", "pallino");
      pall.style.background = g.colore;
      t.appendChild(pall);
      t.appendChild(el("span", null, g.nome));
      lista.appendChild(t);
      attiveDelGruppo(p, g.id).forEach(function (id) {
        const w = ST.voce(p, id);
        const b = el("button", "voce-btn" + (id === v.id ? " attiva" : ""));
        b.appendChild(el("b", null, id.toUpperCase()));
        b.appendChild(el("span", null, w.nome));
        b.addEventListener("click", function () { app.seleziona(id); costruisciVoce(); });
        b.addEventListener("dblclick", function () { app.prova(id); });
        btnVoce[id] = b;
        lista.appendChild(b);
      });
    });
    hostVoce.appendChild(lista);

    const corpo = el("div", "voce-corpo");

    const testata = el("div", "voce-testata");
    const campoNome = el("input", "campo-nome");
    campoNome.value = v.nome;
    campoNome.addEventListener("input", function () {
      v.nome = campoNome.value;
      app.salva();
    });
    testata.appendChild(campoNome);
    const selMot = el("select", "sel-motore");
    ST.MOTORI.forEach(function (m) {
      const o = el("option", null, m.nome);
      o.value = m.id;
      if (v.mot === m.id) o.selected = true;
      selMot.appendChild(o);
    });
    selMot.addEventListener("change", function () {
      const eraMel = ST.melodico(v.mot);
      v.mot = selMot.value;
      app.salva();
      // cambiare il motore cambia il modo in cui i pad si comportano
      if (eraMel !== ST.melodico(v.mot)) costruisciSequencer();
      costruisciVoce();
    });
    testata.appendChild(selMot);
    corpo.appendChild(testata);

    const azioni = el("div", "azioni");
    const bAscolta = el("button", "bottone largo", "ASCOLTA");
    bAscolta.addEventListener("click", function () { app.prova(v.id); });
    azioni.appendChild(bAscolta);
    const bReset = el("button", "bottone", "AZZERA");
    bReset.addEventListener("click", function () {
      ST.parametriDi(v.mot).forEach(function (k) { v.p[k] = ST.P[k].sel ? ST.P[k].sel[0] : ST.P[k].def; });
      app.salva();
      costruisciVoce();
    });
    azioni.appendChild(bReset);
    const bCopia = el("button", "bottone", "COPIA");
    bCopia.addEventListener("click", function () {
      appunti = JSON.parse(JSON.stringify(v.p));
      stato("parametri copiati");
    });
    azioni.appendChild(bCopia);
    const bIncolla = el("button", "bottone", "INCOLLA");
    bIncolla.addEventListener("click", function () {
      if (!appunti) return stato("niente negli appunti");
      ST.parametriDi(v.mot).forEach(function (k) { if (k in appunti) v.p[k] = appunti[k]; });
      app.salva();
      costruisciVoce();
    });
    azioni.appendChild(bIncolla);
    const modelli = el("select", "sel-modello");
    modelli.appendChild(el("option", null, "modello…"));
    ST.modelli.forEach(function (m) {
      const o = el("option", null, m.toUpperCase());
      o.value = m;
      modelli.appendChild(o);
    });
    modelli.addEventListener("change", function () {
      if (!modelli.value) return;
      ST.applicaModello(app.prog(), modelli.value);
      modelli.value = "";
      app.salva();
      costruisciVoce();
      stato("kit ricalcato sul modello " + modelli.value);
    });
    azioni.appendChild(modelli);
    corpo.appendChild(azioni);

    const schermi = el("div", "schermi");
    const tela = el("canvas", "tela curva");
    tela.width = 520;
    tela.height = 170;
    schermi.appendChild(tela);
    schermi.appendChild(el("div", "didascalia", "inviluppo e filtro"));
    corpo.appendChild(schermi);

    const zone = el("div", "zone");
    const ordine = ["sorgente", "inviluppo", "filtro", "uscita"];
    const titoli = { sorgente: "SORGENTE", inviluppo: "INVILUPPO", filtro: "FILTRO", uscita: "USCITA" };
    const controlli = [];
    ordine.forEach(function (gruppo) {
      const chiavi = Object.keys(ST.P).filter(function (k) {
        return ST.P[k].gruppo === gruppo && ST.P[k].mot.indexOf(v.mot) >= 0;
      });
      if (!chiavi.length) return;
      const z = el("div", "zona");
      z.appendChild(el("h4", null, titoli[gruppo]));
      const sc = el("div", "sc-controlli");
      chiavi.forEach(function (k) {
        const spec = ST.P[k];
        const leggi = function () { return ST.voce(app.prog(), v.id).p[k]; };
        const cambia = function (val) {
          ST.voce(app.prog(), v.id).p[k] = val;
          app.salva();
          disegnaCurva(tela);
          aggiornaDipendenze();
        };
        const c = spec.sel ? rotante({ et: spec.et, spec: spec, valore: leggi(), leggi: leggi, cambia: cambia })
          : manopola({ et: spec.et, spec: spec, valore: leggi(), leggi: leggi, cambia: cambia });
        sc.appendChild(c.el);
        controlli.push({ chiave: k, ctrl: c });
      });
      z.appendChild(sc);
      zone.appendChild(z);
    });
    corpo.appendChild(zone);

    function aggiornaDipendenze() {
      controlli.forEach(function (c) {
        c.ctrl.imposta(leggiParam(c.chiave));
        if (c.chiave === "flt") {
          const rumore = v.mot === "rumore" && leggiParam("flt") !== "nessuno";
          controlli.forEach(function (d) {
            if (d.chiave === "f0") {
              if (rumore) d.ctrl.spenta();
              else d.ctrl.accendi();
            }
          });
        }
      });
    }
    function leggiParam(k) {
      return ST.voce(app.prog(), v.id).p[k];
    }

    hostVoce.appendChild(corpo);
    disegnaCurva(tela);
    aggiornaDipendenze();
  }

  function disegnaCurva(tela) {
    if (!tela) return;
    const p = app.prog();
    const v = ST.voce(p, app.selezione());
    const g = tela.getContext("2d");
    const W = tela.width;
    const H = tela.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#0b1a17";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(90,220,180,0.12)";
    g.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      g.beginPath();
      g.moveTo((W / 8) * i, 0);
      g.lineTo((W / 8) * i, H);
      g.stroke();
    }
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (H / 4) * i);
      g.lineTo(W, (H / 4) * i);
      g.stroke();
    }
    // il filtro
    const spec = ST.P.tone;
    const fc = 40 * Math.pow(350, v.p.tone);
    const q = v.p.res;
    const tipo = v.p.flt;
    g.strokeStyle = "#5adcb4";
    g.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const f = 20 * Math.pow(1000, x / W);
      const r = f / fc;
      const den = Math.pow(1 - r * r, 2) + Math.pow(r / q, 2);
      let h = 1 / Math.max(1e-6, den);
      if (tipo === "highpass") h *= r * r * r * r;
      else if (tipo === "bandpass") h *= r * r;
      else if (tipo === "notch") h *= Math.pow(r * r - 1, 2);
      else if (tipo === "peaking") h *= 1 + 6 * r * r * Math.exp(-r);
      const db = 10 * Math.log10(Math.max(1e-6, h));
      const y = H - 12 - Math.max(-48, Math.min(24, db)) * ((H - 24) / 72);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // l'inviluppo
    const att = v.p.rev === "sì" ? Math.max(0.03, v.p.dec * v.p.len) : v.p.att;
    const cad = v.p.rev === "sì" ? v.p.att : v.p.dec * v.p.len;
    const totale = att + v.p.hold + cad;
    const scalaX = Math.min(1, totale / 1.5) * (W - 40);
    const fondo = H - 8;
    const alto = 14;
    g.strokeStyle = "#ff8a3d";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(6, fondo);
    g.lineTo(6 + (att / totale) * scalaX, alto);
    g.lineTo(6 + ((att + v.p.hold) / totale) * scalaX, alto);
    g.lineTo(6 + scalaX, fondo);
    g.stroke();
    g.fillStyle = "rgba(255,138,61,0.85)";
    g.font = "11px monospace";
    g.fillText("inv: " + Math.round(att * 1000) + "+" + Math.round(v.p.hold * 1000) + "+" + Math.round(cad * 1000) + " ms", 8, 12);
    g.fillStyle = "rgba(90,220,180,0.85)";
    g.fillText("filtro: " + Math.round(fc) + " Hz  Q " + numero(q) + (v.p.drive > 1.02 ? "  drive " + numero(v.p.drive) : ""), 8, H - 6);
  }

  function aggiornaTutto() {
    disegnaTutto();
    const p = app.prog();
    Object.keys(btnVoce).forEach(function (id) {
      const v = ST.voce(p, id);
      if (!v) return;
      btnVoce[id].classList.toggle("attiva", id === app.selezione());
      btnVoce[id].lastChild.textContent = v.nome;
    });
  }

  function stato(txt) {
    if (app && app.messaggio) app.messaggio(txt);
    else {
      const s = document.getElementById("stato");
      if (s) s.textContent = txt;
    }
  }

  return {
    monta: function (a, host) {
      app = a;
      hostSeq = host.seq;
      hostVoce = host.voce;
      costruisciSequencer();
      costruisciVoce();
    },
    manopola: manopola,
    rotante: rotante,
    fader: fader,
    ricostruisciVoce: costruisciVoce,
    aggiorna: aggiornaTutto,
    disegnaTutto: disegnaTutto,
    lampegia: lampegia,
    stato: stato,
    forza: forza
  };
})();
