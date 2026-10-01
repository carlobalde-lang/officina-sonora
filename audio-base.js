    <script>
      window.A = (function () {
        let ctx = null;
        let padroni = null; // { musica, effetti }: due manopole indipendenti
        let busMusica = null,
          busEffetti = null,
          riverbero = null;
        let rumore = null; // un solo buffer di rumore bianco, riusato ovunque
        let volBase = 0.9;

        let musica = null; // stato dello spartito
        let timer = null;
        let passo = 0; // indice del passo battevole
        let prossimo = 0; // quando suona il prossimo passo
        let partita = false; // il gioco ha chiesto la musica

        /* ---------- impianto ---------- */
        function apre() {
          if (ctx) {
            if (ctx.state === "suspended") ctx.resume();
            return true;
          }
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false; // browser vecchio: si gioca in silenzio
          try {
            ctx = new AC();
          } catch (e) {
            return false;
          }

          padroni = ctx.createGain();
          padroni.gain.value = volBase;
          padroni.connect(ctx.destination);

          // Riverbero: una cantina è di pietra, e la pietza tira. Un impulso di
          // rumore che cala lentamente fa più o meno quello, e costa niente.
          riverbero = ctx.createConvolver();
          riverbero.buffer = impulso(1.9, 3.2);
          const mando = ctx.createGain();
          mando.gain.value = 0.34;
          riverbero.connect(mando);
          mando.connect(padroni);

          busMusica = ctx.createGain();
          busMusica.gain.value = 0.5;
          busMusica.connect(padroni);
          busMusica.connect(riverbero);

          busEffetti = ctx.createGain();
          busEffetti.gain.value = 0.85;
          busEffetti.connect(padroni);
          busEffetti.connect(riverbero);

          rumore = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
          const d = rumore.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          return true;
        }

        // Un impulso di riverbero: rumore che si spegne. Meno si placa, più la sala
        // suona grande e vuota.
        function impulso(secondi, quanto) {
          const n = Math.floor(ctx.sampleRate * secondi);
          const b = ctx.createBuffer(2, n, ctx.sampleRate);
          for (let canale = 0; canale < 2; canale++) {
            const d = b.getChannelData(canale);
            for (let i = 0; i < n; i++) {
              d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, quanto);
            }
          }
          return b;
        }

        /* ---------- mattoni del suono ---------- */
        // Ogni suono è un involucro con la sua forma: attacco e caduta. Va sempre
        // su un bus: sennò gli effetti finirebbero in testa alla musica.
        function inv(now, picco, attacco, caduta, bus) {
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(Math.max(0.0002, picco), now + attacco);
          g.gain.exponentialRampToValueAtTime(0.0001, now + attacco + caduta);
          g.connect(bus || busEffetti);
          return g;
        }
        function tono(tipo, freq, quando, dur, picco, detune, bus) {
          const o = ctx.createOscillator();
          o.type = tipo;
          o.frequency.setValueAtTime(freq, quando);
          if (detune) o.detune.setValueAtTime(detune, quando);
          o.connect(inv(quando, picco, 0.006, dur, bus));
          o.start(quando);
          o.stop(quando + dur + 0.06);
          return o;
        }
        // Un soffio di rumore filtrato: serve per il versare, per lo scorrere e per
        // il rumore di una sala che si stringe.
        function soffio(quando, dur, picco, da, a, tipo, bus) {
          const s = ctx.createBufferSource();
          s.buffer = rumore;
          s.loop = true;
          const f = ctx.createBiquadFilter();
          f.type = tipo || "bandpass";
          f.Q.value = 1.1;
          f.frequency.setValueAtTime(da, quando);
          f.frequency.exponentialRampToValueAtTime(Math.max(60, a), quando + dur);
          s.connect(f);
          f.connect(inv(quando, picco, dur * 0.22, dur * 0.78, bus));
          s.start(quando);
          s.stop(quando + dur + 0.08);
          return f;
        }
        const adesso = () => ctx.currentTime + 0.005;

        /* ---------- effetti ---------- */
        // Ogni effetto è una scena: più oscillatori, più soffi, con tempi diversi.
        // Il tappo che salta è un colpo secco; il vetro è un suono acuto e breve; la
        // cascata scende di tono perché le gocce cadono.
        const EFFETTI = {
          // Il tappo che salta dalla bottiglia: due colpi secchi, poi l'aria.
          tappo() {
            const t = adesso();
            soffio(t, 0.09, 0.5, 2600, 500, "lowpass");
            soffio(t + 0.02, 0.05, 0.28, 5200, 2200);
            tono("sine", 180, t, 0.07, 0.32);
          },
          // Il colpo che parte: il vino che scivola lungo il vetro.
          tiro() {
            const t = adesso();
            soffio(t, 0.14, 0.2, 1900, 620, "bandpass");
            tono("sine", 320, t, 0.06, 0.1);
          },
          // La goccia che tocca le altre: un dito sul vetro.
          tocco() {
            const t = adesso();
            tono("triangle", 760, t, 0.07, 0.16, 4);
            tono("sine", 1520, t, 0.04, 0.05);
          },
          // Tre gocce che si uniscono: bicchiere. Più alta la serie, più suona.
          abbinamento(serie) {
            const t = adesso();
            const base = 700 * Math.pow(2, Math.min(6, serie - 1) / 7);
            tono("sine", base, t, 0.34, 0.3);
            tono("sine", base * 2.76, t, 0.26, 0.16, 6);
            tono("triangle", base * 4.07, t + 0.005, 0.18, 0.07, -5);
            tono("sine", base * 0.5, t, 0.4, 0.12);
            soffio(t, 0.09, 0.13, 4200, 1600);
          },
          // Le gocce che non reggono e vengono giù: un passo che scende.
          cascata(quante) {
            const t = adesso();
            const n = Math.min(7, 2 + Math.floor(quante / 3));
            for (let i = 0; i < n; i++) {
              const f = 560 * Math.pow(0.78, i);
              tono("sine", f, t + i * 0.045, 0.2, 0.15 - i * 0.012);
            }
            soffio(t + 0.05, 0.3, 0.1, 1400, 300, "lowpass");
          },
          // La sala che si stringe: un tonfo di botte e un gemito di legno.
          discesa() {
            const t = adesso();
            tono("sine", 96, t, 0.34, 0.36);
            tono("sine", 64, t, 0.4, 0.24);
            soffio(t, 0.24, 0.16, 900, 180, "lowpass");
          },
          // Una combinazione non c'è: due colpi smorzati, niente di allegro.
          mancato() {
            const t = adesso();
            tono("triangle", 320, t, 0.11, 0.12);
            tono("sine", 214, t + 0.05, 0.13, 0.1);
          },
          // Il colpo è andato a vuoto: un tonfo lontano, e poi silenzio.
          vuoto() {
            const t = adesso();
            soffio(t, 0.2, 0.12, 700, 160, "lowpass");
            tono("sine", 150, t + 0.1, 0.18, 0.09);
          },
          // Livello completato: quattro note, come un bicchiere battuto sul tavolo.
          vinto() {
            const t = adesso();
            [0, 4, 7, 12].forEach((s, i) => {
              tono("sine", 523.25 * Math.pow(2, s / 12), t + i * 0.1, 0.6, 0.26);
              tono("triangle", 523.25 * Math.pow(2, s / 12) * 2, t + i * 0.1, 0.3, 0.07);
            });
            tono("sine", 130.8, t, 1.1, 0.2); // sotto, la botte
          },
          // Serata finita: un sospiro che scende.
          perso() {
            const t = adesso();
            const o = ctx.createOscillator();
            o.type = "sine";
            o.frequency.setValueAtTime(330, t);
            o.frequency.exponentialRampToValueAtTime(110, t + 0.85);
            o.connect(inv(t, 0.24, 0.05, 0.9));
            o.start(t);
            o.stop(t + 1);
            tono("sine", 82, t + 0.1, 0.8, 0.2);
          },
          // Un pulsante: un ticchettio di bicchiere.
          ui() {
            const t = adesso();
            tono("triangle", 1250, t, 0.05, 0.09);
          }
        };

        function suona(nome, n) {
          if (!ctx || !padroni) return;
          if (ctx.state === "suspended") return;
          if (!accesa("effetti")) return;
          const f = EFFETTI[nome];
          if (f) {
            try {
              f.call(EFFETTI, n);
            } catch (e) {
              /* un suono rotto non ferma la partita */
            }
          }
        }
        /* ---------- la musica ---------- */
        // Una canzoncina in do maggiore, otto battute che girano: basso a pizzico,
        // chitarra sul controtempo, shaker, un pad morbido e il tema suonato da un
        // carillon. Al secondo giro il carillon si fa l'eco da solo.
        const hz = (s) => 261.63 * Math.pow(2, s / 12); // semitoni da do4
        const mel = (s) => 523.25 * Math.pow(2, s / 12); // semitoni da do5
        const FORMA = [
          { r: -12, ch: [0, 4, 7] }, // C
          { r: -15, ch: [-3, 0, 4] }, // Am
          { r: -19, ch: [-7, -3, 0] }, // F
          { r: -17, ch: [-5, -1, 2] }, // G
          { r: -12, ch: [0, 4, 7] }, // C
          { r: -15, ch: [-3, 0, 4] }, // Am
          { r: -10, ch: [-3, 2, 5] }, // Dm
          { r: -17, ch: [-5, -1, 2] } // G
        ];
        // Il tema: [ottavo della battuta, semitoni da do5, durata in ottavi]
        const TEMA = [
          [
            [0, 7, 2],
            [2, 4, 1],
            [3, 7, 1],
            [4, 12, 3]
          ],
          [
            [0, 9, 2],
            [2, 7, 1],
            [3, 4, 1],
            [4, 4, 2],
            [6, 2, 2]
          ],
          [
            [0, 5, 2],
            [2, 9, 1],
            [3, 12, 1],
            [4, 9, 2],
            [6, 5, 2]
          ],
          [
            [0, 7, 2],
            [2, 11, 1],
            [3, 14, 1],
            [4, 11, 4]
          ],
          [
            [0, 7, 2],
            [2, 4, 1],
            [3, 7, 1],
            [4, 12, 2],
            [6, 16, 2]
          ],
          [
            [0, 16, 2],
            [2, 14, 1],
            [3, 12, 1],
            [4, 9, 4]
          ],
          [
            [0, 14, 2],
            [2, 12, 1],
            [3, 9, 1],
            [4, 5, 2],
            [6, 9, 2]
          ],
          [
            [0, 7, 2],
            [2, 5, 1],
            [3, 4, 1],
            [4, 2, 2],
            [6, -1, 2]
          ]
        ];
        const TIPI = {
          cantina: { bpm: 84, basso: 0.5, shaker: 0.25, tick: 0, comping: 0.5, pad: 0.6, melodia: 0.8 },
          partita: { bpm: 108, basso: 0.55, shaker: 0.45, tick: 0.5, comping: 0.6, pad: 0.4, melodia: 0.85 },
          pericolo: { bpm: 132, basso: 0.6, shaker: 0.6, tick: 0.7, comping: 0.7, pad: 0.2, melodia: 1 }
        };
        const grana = (a, b) => {
          const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };

        function mettiMusica(tipo) {
          if (!partita) return;
          if (musica && musica === tipo) return;
          musica = tipo;
          if (!ctx) return;
          if (!timer) {
            passo = 0;
            prossimo = ctx.currentTime + 0.08;
            timer = setInterval(passa, 40);
          }
        }
        function fermaMusica() {
          musica = null;
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }
        function passa() {
          if (!ctx || !musica) return;
          const cfg = TIPI[musica] || TIPI.partita;
          const unita = 60 / cfg.bpm / 2; // otto ottavi per battuta
          const fine = ctx.currentTime + Math.max(0.12, unita * 3);
          while (prossimo < fine) {
            suonaPasso(passo, prossimo, cfg, unita);
            passo++;
            prossimo += unita;
          }
        }
        function suonaPasso(n, quando, cfg, unita) {
          const battuta = Math.floor(n / 8) % FORMA.length;
          const s = n % 8;
          const giro = Math.floor(n / 64) % 2;
          const acc = FORMA[battuta];

          if (cfg.basso > 0) {
            if (s === 0) basso(hz(acc.r), quando, unita * 3, 0.3 * cfg.basso);
            else if (s === 4) basso(hz(acc.r + 7), quando, unita * 2.5, 0.24 * cfg.basso);
            else if (s === 7 && grana(battuta, 3) > 0.55)
              basso(hz(FORMA[(battuta + 1) % FORMA.length].r), quando, unita * 1.2, 0.16 * cfg.basso);
          }
          if (cfg.shaker > 0)
            soffio(quando, 0.05, (s % 2 ? 0.03 : 0.05) * cfg.shaker, 6500, 9500, "highpass", busMusica);
          if (cfg.tick > 0 && (s === 2 || s === 6))
            tono("triangle", 1650, quando, 0.035, 0.06 * cfg.tick, 0, busMusica);
          if (cfg.comping > 0 && (s === 3 || s === 7 || (s === 0 && grana(battuta, 5) > 0.6))) {
            pluck(acc.ch, quando, (s === 0 ? 0.035 : 0.055) * cfg.comping);
          }
          if (cfg.pad > 0 && s === 0) pad(acc.ch, quando, unita * 8, 0.022 * cfg.pad);
          if (cfg.melodia > 0) {
            for (const [a, semi, lung] of TEMA[battuta]) {
              if (a !== s) continue;
              campanella(mel(semi), quando, unita * lung * 1.3, 0.11 * cfg.melodia);
              if (giro) campanella(mel(semi), quando + unita * 1.5, unita * lung, 0.035 * cfg.melodia);
            }
          }
        }

        /* ---------- voci ---------- */
        function basso(freq, quando, dur, quanto) {
          const o = ctx.createOscillator();
          o.type = "triangle";
          o.frequency.setValueAtTime(freq, quando);
          const lp = ctx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.setValueAtTime(600, quando);
          lp.frequency.exponentialRampToValueAtTime(220, quando + dur);
          o.connect(lp);
          lp.connect(inv(quando, quanto, 0.014, dur, busMusica));
          o.start(quando);
          o.stop(quando + dur + 0.05);
        }
        // Una chitarrina: le tre note dell'accordo, appena sfalsate come una strimpellata.
        function pluck(toni, quando, quanto) {
          toni.forEach((st, i) => {
            const t = quando + i * 0.014,
              f = hz(st);
            tono("triangle", f, t, 0.22, quanto * (1 - i * 0.12), 0, busMusica);
            tono("sine", f * 2, t, 0.12, quanto * 0.3, 0, busMusica);
          });
        }
        // Il carillon: una nota pura con due armonici che si spengono in fretta.
        function campanella(f, quando, dur, quanto) {
          tono("sine", f, quando, Math.max(0.3, dur), quanto, 0, busMusica);
          tono("sine", f * 2, quando, Math.max(0.16, dur * 0.55), quanto * 0.35, 0, busMusica);
          tono("sine", f * 3.01, quando, 0.12, quanto * 0.12, 3, busMusica);
          tono("triangle", f * 4.02, quando, 0.06, quanto * 0.08, 0, busMusica);
        }
        // Il pad: le note dell'accordo un'ottava sotto, entrano piano e se ne vanno piano.
        function pad(toni, quando, dur, quanto) {
          for (const st of toni) {
            const o = ctx.createOscillator();
            o.type = "sine";
            o.frequency.setValueAtTime(hz(st - 12), quando);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, quando);
            g.gain.exponentialRampToValueAtTime(Math.max(0.0002, quanto), quando + dur * 0.35);
            g.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
            o.connect(g);
            g.connect(busMusica);
            o.start(quando);
            o.stop(quando + dur + 0.05);
          }
        }

        /* ---------- manopole ---------- */
        function metti(which, acceso) {
          if (!apre()) return false;
          const g = which === "musica" ? busMusica : busEffetti;
          if (!g) return false;
          g.gain.setTargetAtTime(acceso ? (which === "musica" ? 0.5 : 0.85) : 0, ctx.currentTime, 0.05);
          return true;
        }
        function accesa(which) {
          const g = which === "musica" ? busMusica : busEffetti;
          return !!g && g.gain.value > 0.01;
        }

        // Apre l'audio e lo tiene aperto: i browser lo sospendono da soli, e senza
        // un gesto dell'utente non si può fare niente. Si chiama una volta sola.
        function sveglia() {
          if (!apre()) return;
          if (ctx.state === "suspended") ctx.resume();
          if (!partita) {
            partita = true;
            passo = 0;
            prossimo = ctx.currentTime + 0.08;
          }
          if (musica && !timer) timer = setInterval(passa, 40);
        }

        return {
          sveglia,
          suona,
          metti,
          accesa,
          musica: mettiMusica,
          silenzio: fermaMusica,
          suoneria: Object.keys(EFFETTI)
        };
      })();
    </script>