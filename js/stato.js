/* Modello dati della workbench: parametri, kit, pattern, catena. */
window.ST = (function () {
  "use strict";

  const TIPI_OSC = ["sine", "triangle", "square", "sawtooth"];
  const TIPI_FILTRO = ["nessuno", "lowpass", "highpass", "bandpass", "notch", "peaking"];
  const TIPI_CHOKE = ["nessuno", "hat", "cymbal", "perc"];

  // I motori di sintesi. I primi quattro battono e basta; gli altri suonano
  // una nota, e quindi hanno bisogno di un'altezza per ogni passo.
  const MOTORI = [
    { id: "sint", nome: "sintesi (oscillatore)" },
    { id: "intonato", nome: "intonato (due oscillatori)" },
    { id: "rumore", nome: "rumore filtrato" },
    { id: "metallico", nome: "parziali metallici" },
    { id: "corda", nome: "corda pizzicata" },
    { id: "archi", nome: "archi incollati" },
    { id: "fiato", nome: "fiato" },
    { id: "campana", nome: "campana" },
    { id: "pad", nome: "fondo (pad)" }
  ];
  const MELODICI = ["corda", "archi", "fiato", "campana", "pad"];
  const TUTTI = MOTORI.map(function (m) { return m.id; });
  const SEMI_MIN = -24;
  const SEMI_MAX = 24;

  // Le scale per l'altezza: la tonica è la FREQ della voce, le altre note stanno
  // sopra e sotto, a tempo intero di semitoni.
  const SCALA = {
    maggiore: [0, 2, 4, 5, 7, 9, 11],
    minore: [0, 2, 3, 5, 7, 8, 10],
    pentatonica: [0, 2, 4, 7, 9]
  };
  const NOMI_NOTA = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function melodico(mot) {
    return MELODICI.indexOf(mot) >= 0;
  }
  function notaNome(freq) {
    if (!(freq > 0) || !isFinite(freq)) return "—";
    const midi = Math.round(69 + (12 * Math.log(freq / 440)) / Math.LN2);
    return NOMI_NOTA[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }
  function notaFrequenza(v, semi) {
    return v.p.f0 * Math.pow(2, ((v.p.tune || 0) + (semi || 0)) / 12);
  }
  // Arrotonda alla nota più vicina della scala scelta.
  function quantizza(semi, scala) {
    const gradi = SCALA[scala];
    if (!gradi) return semi;
    let migliore = semi;
    let distanza = 1e9;
    for (let ott = -3; ott <= 3; ott++) {
      for (let i = 0; i < gradi.length; i++) {
        const cand = gradi[i] + ott * 12;
        const d = Math.abs(cand - semi);
        if (d < distanza) {
          distanza = d;
          migliore = cand;
        }
      }
    }
    return migliore;
  }

  // Ogni parametro dice dove sta, quanto vale e se si applica a un certo motore.
  const P = {
    f0:      { et: "FREQ",    gruppo: "sorgente",  min: 30,   max: 3000, def: 100,  curva: "log", un: "Hz",   mot: TUTTI },
    tune:    { et: "TUNE",    gruppo: "sorgente",  min: -24,  max: 24,   def: 0,    curva: "lin",  un: "semi", mot: TUTTI },
    osc:     { et: "OSC",     gruppo: "sorgente",  sel: TIPI_OSC, def: "sine", mot: ["sint", "intonato", "corda", "archi", "fiato", "pad"] },
    ratio:   { et: "RATIO",   gruppo: "sorgente",  min: 0.5,  max: 4,    def: 1.5,  curva: "log", mot: ["intonato"] },
    sub:     { et: "SUB",     gruppo: "sorgente",  min: 0,    max: 1,    def: 0,    curva: "lin",  mot: ["sint", "corda", "pad"] },
    subSemi: { et: "SUB SEMI",gruppo: "sorgente",  min: -24,  max: -6,   def: -12,  curva: "lin",  un: "semi", mot: ["sint", "corda", "pad"] },
    pEnv:    { et: "P.ENV",   gruppo: "sorgente",  min: 0,    max: 1,    def: 0,    curva: "lin",  mot: ["sint", "intonato", "rumore", "corda", "archi", "pad"] },
    noise:   { et: "NOISE",   gruppo: "sorgente",  min: 0,    max: 1,    def: 0,    curva: "lin",  mot: ["sint", "intonato", "metallico", "fiato"] },
    click:   { et: "CLICK",   gruppo: "sorgente",  min: 0,    max: 1,    def: 0,    curva: "lin",  mot: ["sint", "intonato", "rumore", "metallico", "corda", "fiato", "campana"] },
    lfoRate: { et: "LFO",     gruppo: "sorgente",  min: 0,    max: 40,   def: 0,    curva: "lin",  un: "Hz",   mot: TUTTI },
    lfoAmt:  { et: "LFO AMT", gruppo: "sorgente",  min: 0,    max: 200,  def: 0,    curva: "lin",  un: "cent", mot: TUTTI },
    burst:   { et: "BURST",   gruppo: "sorgente",  min: 1,    max: 5,    def: 1,    curva: "lin",  passo: 1, mot: ["rumore"] },
    burstGap:{ et: "GAP",     gruppo: "sorgente",  min: 0,    max: 0.15, def: 0.02, curva: "lin",  un: "s",   mot: ["rumore"] },
    coro:    { et: "CORO",    gruppo: "sorgente",  min: 0,    max: 40,   def: 10,   curva: "lin",  un: "cent", mot: ["corda", "archi", "fiato", "pad"] },
    parz:    { et: "PARZIALI",gruppo: "sorgente",  min: 1,    max: 6,    def: 4,    curva: "lin",  passo: 1, mot: ["campana"] },

    att:     { et: "ATTACK",  gruppo: "inviluppo", min: 0.0005, max: 0.5, def: 0.002, curva: "exp", un: "s", mot: TUTTI },
    hold:    { et: "HOLD",    gruppo: "inviluppo", min: 0,    max: 0.5,  def: 0,    curva: "lin",  un: "s",   mot: TUTTI },
    dec:     { et: "DECAY",   gruppo: "inviluppo", min: 0.01, max: 3,    def: 0.4,  curva: "exp", un: "s",   mot: TUTTI },
    len:     { et: "LENGTH",  gruppo: "inviluppo", min: 0.05, max: 3,    def: 1,    curva: "exp", un: "x",   mot: TUTTI },
    sustain: { et: "SUSTAIN", gruppo: "inviluppo", min: 0,    max: 1,    def: 0,    curva: "lin",  mot: ["intonato", "archi", "fiato", "pad"] },
    vib:     { et: "VIBRATO", gruppo: "inviluppo", min: 0,    max: 60,   def: 8,    curva: "lin",  un: "cent", mot: ["corda", "archi", "fiato", "pad"] },
    vibR:    { et: "VIB RATE",gruppo: "inviluppo", min: 0.5,  max: 12,   def: 5,    curva: "lin",  un: "Hz",   mot: ["corda", "archi", "fiato", "pad"] },
    rev:     { et: "REVERSE", gruppo: "inviluppo", sel: ["no", "sì"], def: "no", mot: TUTTI },

    flt:     { et: "FILTER",  gruppo: "filtro",    sel: TIPI_FILTRO, def: "lowpass", mot: TUTTI },
    tone:    { et: "TONE",    gruppo: "filtro",    min: 0, max: 1, def: 0.5, curva: "log", mot: TUTTI },
    res:     { et: "RESO",    gruppo: "filtro",    min: 0.7, max: 14, def: 1, curva: "exp", mot: TUTTI },
    drive:   { et: "DRIVE",   gruppo: "filtro",    min: 1, max: 24, def: 1, curva: "exp", mot: TUTTI },

    level:   { et: "LEVEL",   gruppo: "uscita",    min: 0, max: 1.6, def: 0.9, curva: "lin", mot: TUTTI },
    pan:     { et: "PAN",     gruppo: "uscita",    min: -1, max: 1, def: 0, curva: "lin", mot: TUTTI },
    verb:    { et: "REVERB",  gruppo: "uscita",    min: 0, max: 1, def: 0.1, curva: "lin", mot: TUTTI },
    choke:   { et: "CHOKE",   gruppo: "uscita",    sel: TIPI_CHOKE, def: "nessuno", mot: TUTTI }
  };

  const GRUPPI = [
    { id: "basso", nome: "BASSO",   colore: "#ff6a13" },
    { id: "rima", nome: "RIMA",    colore: "#ffb020" },
    { id: "metalli", nome: "METALLI", colore: "#4aa3ff" },
    { id: "latino", nome: "LATINO", colore: "#9be04a" },
    { id: "tasti", nome: "TASTI",   colore: "#ff4f9a" },
    { id: "corde", nome: "CORDE",   colore: "#c48cff" },
    { id: "fiati", nome: "FIATI",   colore: "#38d6c0" },
    { id: "atmosfere", nome: "ATMOSFERE", colore: "#8ea2ff" }
  ];

  const GRUPPI_V = {
    basso: ["bd", "lt", "mt", "ht"],
    rima: ["sd", "rs", "cp", "cb"],
    metalli: ["oh", "ch", "cy", "tb"],
    latino: ["cl", "co", "ag", "gu"],
    tasti: ["bs", "pi", "gt", "clv", "or", "hrp", "kam"],
    corde: ["vi", "ar", "vl", "va", "pd"],
    fiati: ["fl", "af", "sa", "cl2", "ob", "fg", "tr", "arm"],
    atmosfere: ["cm", "ca", "pn", "gl", "tb2", "ch2", "dr"]
  };

  // Il posto di un gruppo nella lista, per tenere la griglia in ordine.
  function rango(gruppo) {
    for (let i = 0; i < GRUPPI.length; i++) if (GRUPPI[i].id === gruppo) return i;
    return GRUPPI.length;
  }

  // Il kit di partenza: dodici voci più quattro, tutte con valori sensati.
  const VOCI_BASE = [
    { id: "bd", nome: "Basso", gruppo: "basso", mot: "sint", p: { f0: 52, tone: 0.3, pEnv: 0.34, sub: 0.4, subSemi: -12, click: 0.06, att: 0.0015, hold: 0.012, dec: 0.42, len: 1.5, flt: "lowpass", res: 1.2, level: 1, verb: 0.06 } },
    { id: "lt", nome: "Tomo grave", gruppo: "basso", mot: "sint", p: { f0: 96, tone: 0.4, pEnv: 0.22, sub: 0.2, click: 0.1, att: 0.001, dec: 0.34, len: 1.3, flt: "lowpass", level: 0.85, verb: 0.12 } },
    { id: "mt", nome: "Tomo medio", gruppo: "basso", mot: "sint", p: { f0: 182, tone: 0.5, pEnv: 0.2, sub: 0.15, click: 0.12, att: 0.001, dec: 0.28, len: 1.2, flt: "lowpass", level: 0.8, verb: 0.14 } },
    { id: "ht", nome: "Tomo acuto", gruppo: "basso", mot: "sint", p: { f0: 300, tone: 0.62, pEnv: 0.18, click: 0.14, att: 0.001, dec: 0.24, len: 1.1, flt: "lowpass", level: 0.75, verb: 0.16 } },

    { id: "sd", nome: "Rima", gruppo: "rima", mot: "sint", p: { osc: "triangle", f0: 186, pEnv: 0.08, noise: 0.6, click: 0.35, att: 0.001, dec: 0.16, len: 1, flt: "bandpass", tone: 0.42, res: 1.6, drive: 1.6, level: 0.8, verb: 0.16 } },
    { id: "rs", nome: "Rim shot", gruppo: "rima", mot: "rumore", p: { noise: 1, click: 0.2, att: 0.0006, dec: 0.05, len: 1, flt: "bandpass", tone: 0.86, res: 3.4, level: 0.6, verb: 0.1 } },
    { id: "cp", nome: "Clap", gruppo: "rima", mot: "rumore", p: { noise: 1, burst: 4, burstGap: 0.011, att: 0.0008, dec: 0.22, len: 1, flt: "bandpass", tone: 0.45, res: 1.2, level: 0.7, verb: 0.24 } },
    { id: "cb", nome: "Cowbell", gruppo: "rima", mot: "intonato", p: { osc: "square", f0: 542, ratio: 1.48, att: 0.001, dec: 0.4, len: 1, flt: "lowpass", tone: 0.5, level: 0.5, verb: 0.14 } },

    { id: "oh", nome: "Piatti aperti", gruppo: "metalli", mot: "metallico", p: { f0: 250, att: 0.001, dec: 0.3, len: 2.4, flt: "highpass", tone: 0.52, res: 1.1, level: 0.45, verb: 0.2, choke: "hat" } },
    { id: "ch", nome: "Piatti chiusi", gruppo: "metalli", mot: "metallico", p: { f0: 250, att: 0.0008, dec: 0.055, len: 1, flt: "highpass", tone: 0.62, res: 1.4, level: 0.4, verb: 0.06, choke: "hat" } },
    { id: "cy", nome: "Cymbal", gruppo: "metalli", mot: "metallico", p: { f0: 250, att: 0.002, dec: 0.9, len: 2, flt: "highpass", tone: 0.24, res: 1, level: 0.34, verb: 0.3, choke: "cymbal" } },
    { id: "tb", nome: "Tamburello", gruppo: "metalli", mot: "rumore", p: { noise: 1, click: 0.25, att: 0.0006, dec: 0.07, len: 1, flt: "bandpass", tone: 0.9, res: 2.6, level: 0.5, verb: 0.1 } },

    { id: "cl", nome: "Clave", gruppo: "latino", mot: "sint", p: { f0: 2500, click: 0.2, att: 0.0008, dec: 0.055, len: 1, flt: "bandpass", tone: 0.8, res: 2, level: 0.55, verb: 0.14 } },
    { id: "co", nome: "Conga", gruppo: "latino", mot: "sint", p: { f0: 230, pEnv: 0.1, click: 0.12, att: 0.001, dec: 0.22, len: 1.1, flt: "lowpass", tone: 0.55, level: 0.6, verb: 0.16 } },
    { id: "ag", nome: "Agogo", gruppo: "latino", mot: "intonato", p: { osc: "square", f0: 880, ratio: 1.5, att: 0.001, dec: 0.42, len: 1.1, flt: "lowpass", tone: 0.62, level: 0.42, verb: 0.18 } },
    { id: "gu", nome: "Guiro", gruppo: "latino", mot: "rumore", p: { noise: 1, att: 0.02, dec: 0.7, len: 1.4, flt: "bandpass", tone: 0.3, res: 2.2, level: 0.4, verb: 0.2 } },

    /* ---- voci che suonano una nota: qui l'altezza la scegli tu ---- */
    { id: "bs", nome: "Basso", gruppo: "tasti", mot: "corda", p: { osc: "sawtooth", f0: 65.41, pEnv: 0.2, sub: 0.35, subSemi: -12, att: 0.004, dec: 0.5, len: 1.5, flt: "lowpass", tone: 0.3, coro: 6, vib: 4, vibR: 4.5, level: 0.9, verb: 0.06 } },
    { id: "pi", nome: "Pianoforte", gruppo: "tasti", mot: "corda", p: { osc: "sawtooth", f0: 130.81, pEnv: 0.14, sub: 0.3, click: 0.1, att: 0.002, dec: 0.9, len: 1.6, flt: "lowpass", tone: 0.44, coro: 5, verb: 0.22, level: 0.72 } },
    { id: "gt", nome: "Chitarra", gruppo: "tasti", mot: "corda", p: { osc: "sawtooth", f0: 196, pEnv: 0.5, click: 0.18, att: 0.0015, dec: 0.45, len: 1.3, flt: "lowpass", tone: 0.5, coro: 12, vib: 6, vibR: 5, drive: 1.6, verb: 0.2, level: 0.62 } },
    { id: "clv", nome: "Clavinet", gruppo: "tasti", mot: "corda", p: { osc: "square", f0: 196, pEnv: 0.6, click: 0.2, att: 0.0012, dec: 0.4, len: 1.1, flt: "lowpass", tone: 0.52, coro: 8, drive: 2.2, verb: 0.18, level: 0.6 } },
    { id: "or", nome: "Organo", gruppo: "tasti", mot: "fiato", p: { osc: "square", f0: 261.63, att: 0.03, hold: 0.1, dec: 0.3, len: 1.4, sustain: 0.92, flt: "lowpass", tone: 0.44, coro: 4, verb: 0.28, level: 0.52 } },
    { id: "hrp", nome: "Harp", gruppo: "tasti", mot: "archi", p: { osc: "triangle", f0: 349.23, att: 0.006, hold: 0.02, dec: 0.9, len: 1.8, sustain: 0.3, flt: "lowpass", tone: 0.56, verb: 0.36, level: 0.54 } },
    { id: "kam", nome: "Koto", gruppo: "tasti", mot: "corda", p: { osc: "sawtooth", f0: 392, pEnv: 0.4, click: 0.14, att: 0.0015, dec: 0.5, len: 1.5, flt: "lowpass", tone: 0.5, coro: 7, verb: 0.3, level: 0.58 } },

    { id: "vi", nome: "Violino", gruppo: "corde", mot: "archi", p: { osc: "sawtooth", f0: 392, att: 0.09, hold: 0.08, dec: 0.35, len: 1.3, sustain: 0.85, flt: "lowpass", tone: 0.6, coro: 14, vib: 18, vibR: 5.5, verb: 0.3, level: 0.55 } },
    { id: "ar", nome: "Arpa", gruppo: "corde", mot: "corda", p: { osc: "triangle", f0: 261.63, pEnv: 0.3, click: 0.06, att: 0.002, dec: 0.6, len: 1.6, flt: "lowpass", tone: 0.48, coro: 8, verb: 0.3, level: 0.6 } },
    { id: "vl", nome: "Violoncello", gruppo: "corde", mot: "archi", p: { osc: "sawtooth", f0: 98, att: 0.14, hold: 0.12, dec: 0.4, len: 1.5, sustain: 0.9, flt: "lowpass", tone: 0.5, coro: 16, vib: 12, vibR: 4.5, verb: 0.34, level: 0.58 } },
    { id: "va", nome: "Viola", gruppo: "corde", mot: "archi", p: { osc: "sawtooth", f0: 261.63, att: 0.1, hold: 0.1, dec: 0.38, len: 1.4, sustain: 0.86, flt: "lowpass", tone: 0.55, coro: 13, vib: 15, vibR: 5, verb: 0.32, level: 0.54 } },
    { id: "pd", nome: "Pad", gruppo: "corde", mot: "pad", p: { osc: "sawtooth", f0: 196, att: 0.45, hold: 0.2, dec: 0.8, len: 1.6, sustain: 0.9, flt: "lowpass", tone: 0.36, coro: 22, vib: 6, vibR: 0.8, verb: 0.4, level: 0.5 } },

    { id: "fl", nome: "Flauto", gruppo: "fiati", mot: "fiato", p: { osc: "sine", f0: 523.25, noise: 0.12, att: 0.06, hold: 0.04, dec: 0.3, len: 1.2, sustain: 0.9, flt: "lowpass", tone: 0.7, vib: 12, vibR: 5, verb: 0.3, level: 0.5 } },
    { id: "sa", nome: "Sassofono", gruppo: "fiati", mot: "fiato", p: { osc: "square", f0: 155.56, noise: 0.1, att: 0.03, hold: 0.03, dec: 0.3, len: 1.1, sustain: 0.8, flt: "lowpass", tone: 0.42, coro: 6, vib: 14, vibR: 5.2, verb: 0.24, level: 0.48 } },
    { id: "tr", nome: "Tromba", gruppo: "fiati", mot: "fiato", p: { osc: "square", f0: 233.08, noise: 0.05, att: 0.04, hold: 0.04, dec: 0.25, len: 1, sustain: 0.82, flt: "lowpass", tone: 0.46, vib: 8, vibR: 4.5, drive: 1.4, verb: 0.22, level: 0.46 } },
    { id: "ob", nome: "Oboe", gruppo: "fiati", mot: "fiato", p: { osc: "sawtooth", f0: 466.16, noise: 0.09, att: 0.05, hold: 0.05, dec: 0.28, len: 1.2, sustain: 0.88, flt: "lowpass", tone: 0.6, coro: 5, vib: 13, vibR: 5.4, verb: 0.3, level: 0.5 } },
    { id: "cl2", nome: "Clarinetto", gruppo: "fiati", mot: "fiato", p: { osc: "square", f0: 233.08, noise: 0.08, att: 0.045, hold: 0.045, dec: 0.3, len: 1.2, sustain: 0.85, flt: "lowpass", tone: 0.48, vib: 11, vibR: 5, verb: 0.28, level: 0.48 } },
    { id: "fg", nome: "Fagotto", gruppo: "fiati", mot: "fiato", p: { osc: "square", f0: 87.31, noise: 0.07, att: 0.06, hold: 0.06, dec: 0.3, len: 1.4, sustain: 0.88, flt: "lowpass", tone: 0.4, vib: 9, vibR: 4.2, verb: 0.3, level: 0.52 } },
    { id: "af", nome: "Flauto dolce", gruppo: "fiati", mot: "fiato", p: { osc: "sine", f0: 587.33, noise: 0.16, att: 0.04, hold: 0.03, dec: 0.26, len: 1.1, sustain: 0.9, flt: "lowpass", tone: 0.66, vib: 10, vibR: 4.8, verb: 0.32, level: 0.5 } },
    { id: "arm", nome: "Armonica", gruppo: "fiati", mot: "fiato", p: { osc: "square", f0: 392, noise: 0.24, att: 0.03, hold: 0.06, dec: 0.24, len: 1, sustain: 0.6, flt: "bandpass", tone: 0.62, res: 1.5, vib: 16, vibR: 6, verb: 0.26, level: 0.46 } },

    { id: "cm", nome: "Campanella", gruppo: "atmosfere", mot: "campana", p: { f0: 1046.5, parz: 5, click: 0.05, att: 0.001, dec: 1.2, len: 2, flt: "lowpass", tone: 0.8, verb: 0.4, level: 0.32 } },
    { id: "ca", nome: "Campana", gruppo: "atmosfere", mot: "campana", p: { f0: 220, parz: 6, click: 0.1, att: 0.002, dec: 1.8, len: 2.4, flt: "lowpass", tone: 0.7, verb: 0.45, level: 0.3 } },
    { id: "pn", nome: "Sintetizzatore", gruppo: "atmosfere", mot: "pad", p: { osc: "sawtooth", f0: 293.66, sub: 0.25, att: 0.2, hold: 0.1, dec: 0.6, len: 1.4, sustain: 0.85, flt: "lowpass", tone: 0.4, coro: 18, lfoRate: 0.4, lfoAmt: 30, vib: 0, verb: 0.32, level: 0.5 } },
    { id: "gl", nome: "Glockenspiel", gruppo: "atmosfere", mot: "campana", p: { f0: 1046.5, parz: 3, click: 0.03, att: 0.0008, dec: 0.8, len: 1.6, flt: "lowpass", tone: 0.9, verb: 0.42, level: 0.28 } },
    { id: "tb2", nome: "Timbalo", gruppo: "atmosfere", mot: "campana", p: { f0: 110, parz: 4, click: 0.08, att: 0.0015, dec: 0.7, len: 1.5, flt: "lowpass", tone: 0.6, verb: 0.3, level: 0.42 } },
    { id: "ch2", nome: "Coro", gruppo: "atmosfere", mot: "archi", p: { osc: "sawtooth", f0: 196, att: 0.35, hold: 0.2, dec: 0.7, len: 1.8, sustain: 0.9, flt: "lowpass", tone: 0.34, coro: 26, vib: 5, vibR: 0.7, verb: 0.44, level: 0.42 } },
    { id: "dr", nome: "Dron", gruppo: "atmosfere", mot: "pad", p: { osc: "sawtooth", f0: 65.41, sub: 0.4, att: 0.6, hold: 0.3, dec: 0.9, len: 2, sustain: 0.95, flt: "lowpass", tone: 0.3, coro: 20, lfoRate: 0.3, lfoAmt: 24, vib: 0, verb: 0.4, level: 0.46 } }
  ];

  // Il catalogo completo: qui ci sono gli strumenti che si possono scegliere,
  // anche quelli che nel progetto non sono ancora nel kit.
  const CATALOGO = {};
  VOCI_BASE.forEach(function (v) {
    (CATALOGO[v.gruppo] = CATALOGO[v.gruppo] || []).push(v.id);
  });

  // Il kit con cui si apre un progetto: il necessario per un groove, non tutto
  // il catalogo. Gli altri strumenti si aggiungono quando servono.
  const KIT_PARTENZA = [
    "bd", "lt", "mt", "ht",
    "sd", "rs", "cp", "cb",
    "oh", "ch", "cy", "tb",
    "cl", "co", "ag", "gu",
    "bs", "pi", "gt",
    "vi", "ar",
    "fl", "sa", "tr",
    "cm", "pn"
  ];

  const MODELLI = {
    vuoto: function () { return {}; },
    "808": {
      bd: { dec: 0.5, len: 1.6, tone: 0.24, sub: 0.5, click: 0.04, level: 1, verb: 0.04 },
      sd: { osc: "triangle", f0: 190, noise: 0.5, click: 0.45, dec: 0.18, tone: 0.38, res: 1.8, level: 0.75 },
      rs: { tone: 0.88, res: 4, dec: 0.045, level: 0.55 },
      lt: { f0: 100, dec: 0.38, len: 1.3 }, mt: { f0: 187, dec: 0.3 }, ht: { f0: 303, dec: 0.26 },
      cp: { burst: 4, burstGap: 0.01, dec: 0.24, tone: 0.4, level: 0.66 },
      cb: { f0: 540, ratio: 1.48, dec: 0.45, level: 0.45 },
      oh: { tone: 0.5, dec: 0.32, len: 2.4, level: 0.4 }, ch: { tone: 0.66, dec: 0.05, level: 0.36 },
      cy: { tone: 0.2, dec: 0.95, len: 2, level: 0.3 },
      tb: { tone: 0.92, res: 3, dec: 0.06, level: 0.45 },
      cl: { f0: 2600, dec: 0.05, level: 0.5 },
      co: { f0: 240, dec: 0.2, level: 0.55 }, ag: { f0: 900, level: 0.4 }, gu: { tone: 0.26, dec: 0.8 }
    },
    "909": {
      bd: { tone: 0.34, dec: 0.32, len: 1.3, click: 0.22, sub: 0.2, level: 1.05, verb: 0.05 },
      sd: { osc: "triangle", f0: 175, noise: 0.72, click: 0.3, dec: 0.13, flt: "highpass", tone: 0.5, res: 1.2, level: 0.78, verb: 0.14 },
      rs: { tone: 0.9, res: 5, dec: 0.035, level: 0.5 },
      cp: { burst: 3, burstGap: 0.008, dec: 0.18, tone: 0.55, res: 1.6, level: 0.66 },
      cb: { f0: 560, ratio: 1.5, dec: 0.32, level: 0.42 },
      oh: { tone: 0.58, dec: 0.24, len: 2.2, level: 0.4 }, ch: { tone: 0.7, dec: 0.04, level: 0.35 },
      cy: { tone: 0.3, dec: 0.6, len: 1.7, level: 0.3 },
      tb: { tone: 0.95, res: 3.4, dec: 0.05, level: 0.45 },
      cl: { f0: 2400, dec: 0.05, level: 0.5 },
      co: { f0: 260, dec: 0.2, level: 0.55 }, ag: { f0: 920, level: 0.4 }, gu: { tone: 0.32, dec: 0.6 }
    },
    cr78: {
      bd: { f0: 48, sub: 0.6, subSemi: -24, dec: 0.6, len: 1.7, tone: 0.2, click: 0.02, level: 0.95 },
      sd: { f0: 210, noise: 0.35, dec: 0.1, flt: "highpass", tone: 0.45, click: 0.2, level: 0.7 },
      rs: { tone: 0.8, res: 2, dec: 0.04, level: 0.4 },
      lt: { f0: 88, dec: 0.3 }, mt: { f0: 160, dec: 0.24 }, ht: { f0: 260, dec: 0.2 },
      cp: { burst: 1, dec: 0.12, tone: 0.6, level: 0.55 },
      cb: { f0: 560, ratio: 1.48, dec: 0.3, level: 0.35 },
      oh: { f0: 320, tone: 0.55, dec: 0.2, len: 1.8, level: 0.32 }, ch: { f0: 320, tone: 0.68, dec: 0.04, level: 0.3 },
      cy: { f0: 300, tone: 0.3, dec: 0.4, len: 1.5, level: 0.22 },
      tb: { tone: 0.9, dec: 0.05, level: 0.35 },
      cl: { f0: 2800, dec: 0.04, level: 0.45 },
      co: { f0: 250, dec: 0.18, level: 0.5 }, ag: { f0: 950, level: 0.32 }, gu: { tone: 0.35, dec: 0.5 }
    },
    "metallico": {
      bd: { f0: 48, dec: 0.28, len: 1.1, click: 0.5, sub: 0.1, level: 1.1, verb: 0.08 },
      sd: { f0: 200, noise: 0.85, dec: 0.12, flt: "highpass", tone: 0.55, res: 2, drive: 2, click: 0.4, level: 0.8 },
      rs: { tone: 0.92, res: 6, dec: 0.03, level: 0.5 },
      cp: { burst: 5, burstGap: 0.014, dec: 0.26, tone: 0.5, res: 1.4, level: 0.7 },
      cb: { f0: 700, ratio: 1.5, dec: 0.5, level: 0.4 },
      oh: { f0: 400, tone: 0.6, dec: 0.35, len: 2.6, level: 0.42 }, ch: { f0: 400, tone: 0.75, dec: 0.05, level: 0.4 },
      cy: { f0: 380, tone: 0.26, dec: 1, len: 2.2, level: 0.32 },
      tb: { tone: 0.96, res: 3.6, dec: 0.06, level: 0.45 },
      cl: { f0: 3000, dec: 0.04, level: 0.5 },
      co: { f0: 240, dec: 0.2, level: 0.55 }, ag: { f0: 1000, level: 0.38 }, gu: { tone: 0.3, dec: 0.7 }
    }
  };

  const LETTERE = ["A", "B", "C", "D"];
  const LIVELLI = [0.45, 0.62, 0.82, 1];

  function clonaParametri(def) {
    const out = {};
    Object.keys(P).forEach(function (k) {
      const s = P[k];
      out[k] = s.sel ? s.sel[0] : s.def;
    });
    if (def) Object.keys(def).forEach(function (k) { if (k in out) out[k] = def[k]; });
    return out;
  }

  // Un id può stare in un gruppo solo, e i nomi brevi devono restare unici:
  // sono loro le chiavi che il gioco usa per chiedere un suono.
  const PER_ID = {};
  VOCI_BASE.forEach(function (v) {
    if (PER_ID[v.id]) throw new Error("id di voce ripetuto: " + v.id);
    PER_ID[v.id] = v;
  });

  function voceBase(id) {
    return PER_ID[id] || null;
  }

  // Il kit di un progetto è un sottoinsieme del catalogo: qui si sceglie
  // quali strumenti ci sono, in che ordine, e con quali parametri.
  function kitBase(ids) {
    const scelti = Array.isArray(ids) ? ids : null;
    return VOCI_BASE.filter(function (v) {
      return !scelti || scelti.indexOf(v.id) >= 0;
    }).map(function (v) {
      return {
        id: v.id,
        nome: v.nome,
        gruppo: v.gruppo,
        mot: v.mot,
        vol: 1,
        muto: false,
        solo: false,
        p: clonaParametri(v.p)
      };
    });
  }

  // Mette uno strumento nel progetto. Le tabelle dei pattern seguono.
  function voce(p, id) {
    return p.kit.filter(function (v) { return v.id === id; })[0] || null;
  }

  function aggiungiVoce(p, id) {
    const base = voceBase(id);
    if (!base) return null;
    if (voce(p, id)) return voce(p, id);
    const v = {
      id: base.id,
      nome: base.nome,
      gruppo: base.gruppo,
      mot: base.mot,
      vol: 1,
      muto: false,
      solo: false,
      p: clonaParametri(base.p)
    };
    // si mette in fondo al suo gruppo, così la griglia resta in ordine
    const mio = rango(base.gruppo);
    let pos = 0;
    p.kit.forEach(function (altro, i) {
      if (rango(altro.gruppo) <= mio) pos = i + 1;
    });
    p.kit.splice(pos, 0, v);
    LETTERE.forEach(function (L) {
      if (!p.passi[L]) p.passi[L] = patternVuoto(p.kit);
      p.passi[L][id] = new Array(16).fill(0);
      if (melodico(base.mot)) {
        if (!p.note[L]) p.note[L] = noteVuoto(p.kit);
        p.note[L][id] = new Array(16).fill(0);
      }
    });
    return v;
  }

  // Tira fuori uno strumento. Si può arrivare anche a un progetto vuoto:
  // chi non vuole più sentire niente lo dice, e poi sceglie cosa metterci.
  function togliVoce(p, id) {
    const i = p.kit.map(function (v) { return v.id; }).indexOf(id);
    if (i < 0) return false;
    p.kit.splice(i, 1);
    LETTERE.forEach(function (L) {
      if (p.passi[L]) delete p.passi[L][id];
      if (p.note[L]) delete p.note[L][id];
    });
    return true;
  }

  function patternVuoto(kit) {
    const out = {};
    kit.forEach(function (v) {
      out[v.id] = new Array(16).fill(0);
    });
    return out;
  }

  // Le altezze stanno in una tabella a parte: solo le voci che suonano una
  // nota ne hanno bisogno, e ogni valore è un semitono rispetto alla FREQ.
  function noteVuoto(kit) {
    const out = {};
    kit.forEach(function (v) {
      if (melodico(v.mot)) out[v.id] = new Array(16).fill(0);
    });
    return out;
  }

  function noteDi(p, id) {
    if (!p.note) return null;
    if (!p.note[p.pattern]) return null;
    return p.note[p.pattern][id] || null;
  }

  function leggiNota(p, id, i) {
    const a = noteDi(p, id);
    return a ? (a[i] | 0) : 0;
  }

  function impostaNota(p, id, i, semi) {
    const v = Math.max(SEMI_MIN, Math.min(SEMI_MAX, semi | 0));
    if (!p.note) p.note = {};
    if (!p.note[p.pattern]) p.note[p.pattern] = noteVuoto(p.kit);
    const riga = p.note[p.pattern];
    if (!riga[id]) riga[id] = new Array(16).fill(0);
    riga[id][i] = v;
    return v;
  }

  function nuovo(nome, ids) {
    const kit = kitBase(ids || KIT_PARTENZA);
    const p = {
      formato: 2,
      nome: nome || "Nuovo progetto",
      bpm: 112,
      swing: 0.12,
      lunghezza: 16,
      volume: 0.9,
      scala: "libera",
      catena: ["A"],
      indiceCatena: 0,
      pattern: "A",
      metr: true,
      musica: "",
      kit: kit,
      passi: {},
      note: {}
    };
    LETTERE.forEach(function (L) {
      p.passi[L] = patternVuoto(kit);
      p.note[L] = noteVuoto(kit);
    });
    return p;
  }

  // Un groove di partenza, così l'app non parte dal silenzio.
  function demo(p) {
    const g = function (id, seq) {
      const arr = p.passi.A[id];
      // la voce può non essere nel progetto: il modello è lo stesso per tutti
      if (!arr) return;
      for (let i = 0; i < seq.length; i++) {
        const passo = seq[i].split(":");
        arr[parseInt(passo[0], 10)] = (parseInt(passo[1] || "2", 10) | 0) + (passo[2] === "!" ? 8 : 0);
      }
    };
    // idem con l'altezza: "passo:semitoni:forza[!]"
    const m = function (id, seq) {
      const arr = p.passi.A[id];
      const alt = p.note.A[id];
      if (!arr || !alt) return;
      seq.forEach(function (s) {
        const pezzi = s.split(":");
        const i = parseInt(pezzi[0], 10);
        alt[i] = parseInt(pezzi[1], 10) | 0;
        arr[i] = (parseInt(pezzi[2] || "3", 10) | 0) + (pezzi[3] === "!" ? 8 : 0);
      });
    };
    g("bd", ["0:4", "6:2", "8:4", "14:2"]);
    g("sd", ["4:4!", "12:4!"]);
    g("rs", ["7:1"]);
    g("cp", ["12:2"]);
    g("ch", ["0:2", "2:1", "3:1", "4:2", "6:1", "7:1", "8:2", "10:1", "11:1", "12:2", "14:1", "15:1"]);
    g("oh", ["2:1", "6:1", "10:1", "14:1"]);
    g("cb", ["5:1", "13:1"]);
    g("tb", ["1:1", "5:1", "9:1", "13:1"]);
    g("ag", ["11:1"]);
    m("bs", ["0:0:4", "3:3:2", "6:7:3", "8:0:4", "11:3:2", "14:10:2"]);
    m("fl", ["2:12:2", "4:15:2", "6:19:3", "9:19:2", "12:17:2", "14:15:2"]);
    m("cm", ["7:12:1", "15:19:1"]);
    return p;
  }

  // Il brano con cui parte la workbench: un valzer lento in 3/4.
  // La griglia resta in 4/4, ma con dodici sedicesimi la battita dura tre
  // quarti: il 3/4 è vero, non un'approssimazione.
  const KIT_VALZER = ["bd", "sd", "tb", "bs", "pi", "ar", "vi", "cm", "pn"];

  function valzer() {
    const p = nuovo("Valzer Notturno", KIT_VALZER);
    p.bpm = 116;
    p.swing = 0.05;
    p.lunghezza = 12;
    p.scala = "minore";
    p.catena = ["A", "B", "A", "C"];

    // "passo:forza" per la percussione, "passo:semitoni:forza" per le voci che
    // suonano una nota. Il punto esclamativo raddoppia la forza.
    function penna(L) {
      const P = p.passi[L];
      const N = p.note[L];
      return {
        batte: function (id, seq) {
          const arr = P[id];
          if (!arr) return;
          seq.forEach(function (s) {
            const f = s.split(":");
            arr[parseInt(f[0], 10)] = (parseInt(f[1] || "2", 10) | 0) + (f[2] === "!" ? 8 : 0);
          });
        },
        canta: function (id, seq) {
          const arr = P[id];
          const alt = N[id];
          if (!arr || !alt) return;
          seq.forEach(function (s) {
            const f = s.split(":");
            const i = parseInt(f[0], 10);
            alt[i] = parseInt(f[1], 10) | 0;
            arr[i] = (parseInt(f[2] || "3", 10) | 0) + (f[3] === "!" ? 8 : 0);
          });
        }
      };
    }

    // Il cuore del valzer è oom-pah-pah: basso sul uno, accordo sul due e sul tre.
    function oomPahPah(L, radice) {
      const x = penna(L);
      x.canta("bs", ["0:" + radice + ":4!"]);
      x.canta("pi", ["4:" + (radice + 3) + ":2", "8:" + (radice + 10) + ":2"]);
      x.canta("ar", ["6:" + (radice + 7) + ":1", "10:" + (radice + 12) + ":1"]);
      x.batte("bd", ["0:3", "4:1", "8:1"]);
      x.batte("sd", ["0:2"]);
      x.batte("tb", ["2:1", "6:1", "10:1"]);
    }

    // A: il tema, che entra piano e lascia spazio al silenzio.
    oomPahPah("A", 0);
    penna("A").canta("cm", [
      "0:7:3", "3:5:2", "4:3:2", "6:2:3", "8:3:2", "10:5:3", "11:7:2"
    ]);
    penna("A").canta("vi", ["0:-2:2"]);
    penna("A").canta("pn", ["0:0:3"]);

    // B: il tema una quinta più in alto, con il basso che cammina.
    oomPahPah("B", 0);
    penna("B").canta("bs", ["8:5:3"]);
    penna("B").canta("cm", [
      "0:14:3", "2:12:2", "4:10:2", "6:12:3", "8:15:3", "11:12:2"
    ]);
    penna("B").canta("vi", ["0:3:2", "8:-4:2"]);
    penna("B").canta("pn", ["0:0:3"]);

    // C: il riverbero, gli ultimi due colpi e nient'altro.
    penna("C").canta("cm", ["0:7:2", "6:5:2"]);
    penna("C").canta("pi", ["0:3:2", "6:10:1"]);
    penna("C").canta("vi", ["0:-2:2"]);
    penna("C").batte("bd", ["0:2"]);
    return p;
  }

  // House/Techno default — 126 BPM, four-on-the-floor, 16 steps
  function canzoneCompleta() {
    const kitHouse = [
      "bd","sd","rs","ch","oh",    // Drum kit (5)
      "bs","pi",                   // Bass + chord stabs (2)
      "pn","dr"                    // Pad + drone (2)
    ];
    const p = nuovo("Midnight Drive", kitHouse);
    p.bpm = 126;
    p.swing = 0.0;
    p.lunghezza = 16;
    p.scala = "minore";
    p.catena = ["A"];

    function penna(L) {
      const P = p.passi[L];
      const N = p.note[L];
      return {
        batte: function (id, seq) {
          const arr = P[id];
          if (!arr) return;
          seq.forEach(function (s) {
            const f = s.split(":");
            arr[parseInt(f[0], 10)] = (parseInt(f[1] || "2", 10) | 0) + (f[2] === "!" ? 8 : 0);
          });
        },
        canta: function (id, seq) {
          const arr = P[id];
          const alt = N[id];
          if (!arr || !alt) return;
          seq.forEach(function (s) {
            const f = s.split(":");
            const i = parseInt(f[0], 10);
            alt[i] = parseInt(f[1], 10) | 0;
            arr[i] = (parseInt(f[2] || "3", 10) | 0) + (f[3] === "!" ? 8 : 0);
          });
        }
      };
    }

    const x = penna("A");

    // FOUR-ON-THE-FLOOR KICK
    x.batte("bd", ["0:5!", "4:4", "8:5!", "12:4"]);

    // CLAP/SNARE su 2 e 4 (step 4 e 12)
    x.batte("sd", ["4:4!", "12:4!"]);
    x.batte("rs", ["2:1", "6:1", "10:1", "14:1"]); // ghost snares

    // OFF-BEAT CLOSED HI-HAT (classic house)
    x.batte("ch", [
      "1:3", "3:2", "5:3", "7:2", "9:3", "11:2", "13:3", "15:2"
    ]);

    // OPEN HI-HAT su ogni 4 battute
    x.batte("oh", ["0:2", "8:3"]);

    // BASSLINE: rolling 16ths con accenti (classic acid/techno)
    // Note: A1 (-12), ottava sotto per sub
    x.canta("bs", [
      "0:-12:5!", "1:-12:2", "2:-12:3", "3:-12:2",
      "4:-12:4!", "5:-12:2", "6:-12:3", "7:-12:2",
      "8:-12:5!", "9:-12:2", "10:-12:3", "11:-12:2",
      "12:-12:4!", "13:-12:2", "14:-12:3", "15:-12:2"
    ]);

    // CHORD STABS su pianoforte (off-beat, tipico house)
    // Accordi: Am7 -> Fmaj7 -> G -> Em (in A minore)
    x.canta("pi", [
      "1:0:4!", "3:4:3",           // Am7 (A C E G) - root + 7th
      "5:-12:3", "7:-8:3",         // Fmaj7 (F A C E) - transposto giù
      "9:0:4!", "11:4:3",          // Am7
      "13:-12:3", "15:-8:3"        // Fmaj7
    ]);

    // PAD atmosferico (drone lento, note lunghe)
    x.canta("pn", [
      "0:0:3!", "8:0:3!"           // A1 sostenuto
    ]);

    // DRONE sub (fondamentale profonda)
    x.canta("dr", [
      "0:-24:2!", "8:-24:2!"       // A0 sub
    ]);

    return p;
  }

  function normalizza(p) {
    const base = nuovo(p && p.nome);
    const q = p || {};
    const out = base;
    out.nome = typeof q.nome === "string" ? q.nome : base.nome;
    out.bpm = num(q.bpm, base.bpm, 40, 240);
    out.swing = num(q.swing, base.swing, 0, 0.7);
    out.lunghezza = Math.round(num(q.lunghezza, 16, 1, 16));
    out.volume = num(q.volume, base.volume, 0, 1.2);
    out.metr = q.metr !== false;
    out.musica = ["partita", "pericolo", "cantina"].indexOf(q.musica) >= 0 ? q.musica : "";
    out.scala = q.scala === "maggiore" || q.scala === "minore" || q.scala === "pentatonica" ? q.scala : "libera";
    out.catena = Array.isArray(q.catena) && q.catena.length ? q.catena.slice(0, 64) : ["A"];
    out.catena = out.catena.map(function (c) { return LETTERE.indexOf(c) >= 0 ? c : "A"; });
    out.indiceCatena = Math.max(0, Math.min(out.catena.length - 1, q.indiceCatena | 0));
    out.pattern = LETTERE.indexOf(q.pattern) >= 0 ? q.pattern : "A";
    if (Array.isArray(q.kit)) {
      // Il kit salvato dice anche quali strumenti ci sono: si parte da quello,
      // non dal catalogo intero, così un progetto alleggerito resta alleggerito.
      const noti = q.kit.filter(function (x) { return x && x.id && voceBase(x.id); });
      if (noti.length) {
        const scelti = [];
        noti.forEach(function (s) { if (scelti.indexOf(s.id) < 0) scelti.push(s.id); });
        out.kit = kitBase(scelti);
        scelti.forEach(function (id) {
          const v = voce(out, id);
          const s = noti.filter(function (x) { return x.id === id; })[0];
          if (typeof s.nome === "string" && s.nome) v.nome = s.nome;
          if (s.mot && TUTTI.indexOf(s.mot) >= 0) v.mot = s.mot;
          v.vol = num(s.vol, 1, 0, 1.6);
          v.muto = !!s.muto;
          v.solo = !!s.solo;
          if (s.p) {
            Object.keys(P).forEach(function (k) {
              if (!(k in s.p)) return;
              const sp = P[k];
              if (sp.sel) {
                if (sp.sel.indexOf(s.p[k]) >= 0) v.p[k] = s.p[k];
              } else {
                v.p[k] = num(s.p[k], sp.def, sp.min, sp.max);
              }
            });
          }
        });
        // se il motore è cambiato e la voce è diventata percussiva, le note non servono
        out.kit.forEach(function (v) {
          if (melodico(v.mot)) return;
          LETTERE.forEach(function (L) { delete out.note[L][v.id]; });
        });
      } else {
        // un kit salvato vuoto è una scelta, non un file rotto: si rispetta
        out.kit = [];
      }
    }
    LETTERE.forEach(function (L) {
      const src = q.passi && q.passi[L];
      const srcNote = q.note && q.note[L];
      out.passi[L] = patternVuoto(out.kit);
      out.note[L] = noteVuoto(out.kit);
      out.kit.forEach(function (v) {
        const a = src && src[v.id];
        if (Array.isArray(a)) {
          for (let i = 0; i < out.lunghezza && i < 16; i++) {
            const c = a[i] | 0;
            out.passi[L][v.id][i] = c >= 0 && c <= 12 ? c : 0;
          }
        }
        const b = srcNote && srcNote[v.id];
        if (melodico(v.mot) && Array.isArray(b)) {
          for (let i = 0; i < 16; i++) {
            const c = b[i] | 0;
            out.note[L][v.id][i] = c >= SEMI_MIN && c <= SEMI_MAX ? c : 0;
          }
        }
      });
    });
    return out;
  }

  function num(v, def, min, max) {
    var n = typeof v === "number" ? v : parseFloat(v);
    if (!isFinite(n)) n = def;
    return Math.min(max, Math.max(min, n));
  }

  function applicaModello(p, nome) {
    const m = MODELLI[nome];
    if (!m) return p;
    p.kit.forEach(function (v) {
      const d = m[v.id];
      if (d) Object.keys(d).forEach(function (k) { v.p[k] = d[k]; });
    });
    return p;
  }

  return {
    P: P,
    GRUPPI: GRUPPI,
    GRUPPI_V: GRUPPI_V,
    LETTERE: LETTERE,
    LIVELLI: LIVELLI,
    TIPI_CHOKE: TIPI_CHOKE,
    MOTORI: MOTORI,
    MELODICI: MELODICI,
    SEMI_MIN: SEMI_MIN,
    SEMI_MAX: SEMI_MAX,
    SCALA: SCALA,
    nuovo: nuovo,
    demo: demo,
    valzer: valzer,
    canzoneCompleta: canzoneCompleta,
    normalizza: normalizza,
    applicaModello: applicaModello,
    modelli: Object.keys(MODELLI),
    melodico: melodico,
    notaNome: notaNome,
    notaFrequenza: notaFrequenza,
    quantizza: quantizza,
    leggiNota: leggiNota,
    impostaNota: impostaNota,
    parametriDi: function (mot) {
      return Object.keys(P).filter(function (k) { return P[k].mot.indexOf(mot) >= 0; });
    },
    vociDi: function (gruppo) { return GRUPPI_V[gruppo] || []; },
    // Tutti gli strumenti disponibili, anche quelli non ancora nel progetto.
    catalogo: CATALOGO,
    catalogoDi: function (gruppo) { return (CATALOGO[gruppo] || []).slice(); },
    tutte: function () { return VOCI_BASE.map(function (v) { return { id: v.id, nome: v.nome, gruppo: v.gruppo, mot: v.mot }; }); },
    base: voceBase,
    aggiungiVoce: aggiungiVoce,
    togliVoce: togliVoce,
    voce: voce,
    curva: function (v, spec) {
      const t = (v - spec.min) / (spec.max - spec.min || 1);
      const x = Math.min(1, Math.max(0, t));
      if (spec.curva === "exp") return spec.min * Math.pow(spec.max / spec.min, x);
      if (spec.curva === "log") return spec.min * Math.pow(spec.max / spec.min, x);
      return spec.min + (spec.max - spec.min) * x;
    },
    norm: function (v, spec) {
      // Deve essere l'inverso esatto di daNorm: se la corsa della manopola
      // è lineare mentre il valore è esponenziale, la lancetta resta
      // incastrata a zero e il trascinamento sembra non fare niente.
      if (spec.curva === "exp" || spec.curva === "log") {
        if (v <= spec.min) return 0;
        if (spec.max <= spec.min) return 0;
        return Math.min(1, Math.max(0, Math.log(v / spec.min) / Math.log(spec.max / spec.min)));
      }
      const t = (v - spec.min) / (spec.max - spec.min || 1);
      return Math.min(1, Math.max(0, t));
    },
    daNorm: function (t, spec) {
      const x = Math.min(1, Math.max(0, t));
      if (spec.curva === "exp" || spec.curva === "log") {
        if (x <= 0) return spec.min;
        return spec.min * Math.pow(spec.max / spec.min, x);
      }
      return spec.min + (spec.max - spec.min) * x;
    }
  };
})();
