/* L'editor: un textarea trasparente sopra il testo colorato. */
window.ED = (function () {
  "use strict";

  const CHIAVI = /\b(const|let|var|function|return|if|else|for|while|new|true|false|null|undefined|typeof|this|class|do|switch|case|break|continue|of|in|void|try|catch|finally|throw|delete|instanceof)\b/;
  const RIC = new RegExp(
    "(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)" + // commenti
    "|('(?:\\\\.|[^'\\\\\\n])*'|\"(?:\\\\.|[^\"\\\\\\n])*\"|`(?:\\\\.|[^`\\\\])*`)" + // stringhe
    "|\\b(0x[\\da-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b" + // numeri
    "|\\b([A-Za-z_$][\\w$]*)\\b" + // parole
    "|(=>|[-+*/%<>=!&|?:~^]{1,3})" + // operatori
    "|[{}()\\[\\];,.]", // segni
    "g"
  );

  function esc(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function colora(txt) {
    const g = esc(txt);
    return g.replace(RIC, function (m, comm, str, num, parola, segno) {
      if (comm) return '<span class="t-com">' + comm + "</span>";
      if (str) return '<span class="t-str">' + str + "</span>";
      if (num) return '<span class="t-num">' + num + "</span>";
      if (parola) {
        if (CHIAVI.test(parola)) return '<span class="t-key">' + parola + "</span>";
        if (/^[A-Z]/.test(parola)) return '<span class="t-const">' + parola + "</span>";
        if (g.charAt(m.index + parola.length) === "(") return '<span class="t-fn">' + parola + "</span>";
        return parola;
      }
      if (segno) return '<span class="t-seg">' + segno + "</span>";
      return m;
    });
  }

  function monta(host, opzioni) {
    opzioni = opzioni || {};
    host.innerHTML =
      '<div class="ed-nr"></div>' +
      '<div class="ed-box">' +
      '<pre class="ed-pre" aria-hidden="true"></pre>' +
      '<textarea class="ed-ta" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea>' +
      "</div>";
    const nr = host.querySelector(".ed-nr");
    const pre = host.querySelector(".ed-pre");
    const ta = host.querySelector(".ed-ta");

    let numero = 0;

    function disegna() {
      const txt = ta.value;
      if (numero !== txt.length) {
        const righe = txt.split("\n").length;
        let s = "";
        for (let i = 1; i <= righe; i++) s += i + "\n";
        nr.textContent = s;
        numero = txt.length;
      }
      pre.innerHTML = colora(txt) + "\n";
    }

    function scrivi(txt, silenzioso) {
      ta.value = txt;
      numero = 0;
      disegna();
      if (!silenzioso && opzioni.cambio) opzioni.cambio(txt);
    }

    ta.addEventListener("input", function () {
      numero = 0;
      disegna();
      if (opzioni.cambio) opzioni.cambio(ta.value);
    });
    ta.addEventListener("scroll", function () {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
      nr.scrollTop = ta.scrollTop;
    });
    ta.addEventListener("keydown", function (ev) {
      if (ev.key === "Tab") {
        ev.preventDefault();
        const a = ta.selectionStart;
        const b = ta.selectionEnd;
        ta.value = ta.value.slice(0, a) + "  " + ta.value.slice(b);
        ta.selectionStart = ta.selectionEnd = a + 2;
        numero = 0;
        disegna();
        if (opzioni.cambio) opzioni.cambio(ta.value);
      } else if (ev.key === "s" && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        if (opzioni.salva) opzioni.salva();
      }
    });

    disegna();
    return {
      leggi: function () { return ta.value; },
      scrivi: scrivi,
      pulito: function () {
        const a = ta.selectionStart;
        ta.focus();
        ta.setSelectionRange(0, 0);
        if (a) ta.setSelectionRange(a, a);
      }
    };
  }

  return { monta: monta, colora: colora };
})();
