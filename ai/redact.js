// Tickmark Hybrid: on-device redaction. Runs in the browser before anything can be sent to a cloud model,
// and works with no model at all, so a device without Gemini Nano still never sends raw customer data.
// It removes who and where (names, account and loan numbers, addresses, contact details, government IDs)
// and keeps what the rules need (amounts, dates, rates, document types). Every replacement gets a stable
// token such as [ACCOUNT_1]; the map stays on the device so an answer from the cloud can be read back with
// the real values, locally. The page loads it as window.TickmarkRedact; the tests load it with require().
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TickmarkRedact = api;
})(typeof self !== 'undefined' ? self : this, () => {
  // Labels that introduce a person or company name on finance documents (statements, wires, payout notices).
  const NAME_LABELS = ['borrower', 'borrowers', 'co-borrower', 'mortgagor', 'mortgagors', 'client', 'customer', 'payee', 'payor', 'beneficiary', 'remitter', 'ordering customer', 'account holder', 'account name', 'applicant', 'guarantor', 'vendor', 'purchaser', 'seller', 'buyer', 'estate of', 'executor', 'attention', 'attn', 'prepared for', 'lawyer', 'solicitor', 'contact'];
  // Labels that introduce an identifier. Values after them are replaced even when they are short.
  const ID_LABELS = [
    ['ACCOUNT', ['account', 'account no', 'account number', 'acct', 'acct no', 'a/c', 'beneficiary account', 'deposit account']],
    ['LOAN', ['loan', 'loan no', 'loan number', 'mortgage', 'mortgage no', 'mortgage number', 'mortgage account', 'file', 'file no', 'file number', 'our file', 'your file', 'matter', 'matter no', 'reference', 'ref', 'ref no']],
    ['TRANSIT', ['transit', 'transit no', 'transit number', 'branch transit', 'institution', 'institution no', 'routing', 'routing number', 'aba', 'swift', 'bic']],
    ['PIN', ['pin', 'property identifier', 'legal description', 'instrument', 'instrument no', 'registration no']],
  ];
  const STREET = '(?:' + ['street', 'st', 'avenue', 'ave', 'road', 'rd', 'boulevard', 'blvd', 'drive', 'dr', 'crescent', 'cres', 'court', 'ct', 'lane', 'ln', 'way', 'place', 'pl', 'parkway', 'pkwy', 'circle', 'cir', 'trail', 'terrace', 'square', 'sq', 'highway', 'hwy'].map((w) => `[${w[0]}${w[0].toUpperCase()}]${w.slice(1)}`).join('|') + ')';
  // A name is capitalised words or initials ("J."), joined by spaces, "and", "&" or a comma. A word followed
  // by ":" is the next label, not part of the name, and a full stop after a word ends the name.
  const NAME_WORD = "(?:[A-Z]\\.|[A-Z][A-Za-z'-]+)";
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  // Case-insensitive labels inside a case-sensitive pattern, so labels match in any case but names must start with a capital.
  const ci = (s) => s.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
  const labelRe = (labels) => labels.map(esc).sort((a, b) => b.length - a.length).map(ci).join('|');

  // Each rule finds spans; the value group (1) is replaced, the label before it is kept.
  const RULES = [
    { type: 'EMAIL', re: /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi },
    { type: 'SIN', re: /\b(\d{3}[ -]\d{3}[ -]\d{3})\b/g },
    { type: 'CARD', re: /\b((?:\d[ -]?){13,19})\b/g, check: luhn },
    { type: 'PHONE', re: /((?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?:\s*(?:x|ext\.?)\s*\d{1,5})?)/gi },
    { type: 'IBAN', re: /\b([A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?)\b/g },
    { type: 'POSTAL', re: /\b([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d)\b/gi },
    { type: 'ADDRESS', re: new RegExp(`\\b((?:(?:unit|suite|apt)\\s*\\d+[A-Z]?[, -]+)?\\d{1,6}[A-Z]?\\s+(?:[A-Z][a-z]+\\s+){1,4}${STREET}\\.?(?:\\s+(?:north|south|east|west|n|s|e|w)\\b)?)`, 'g') },
    ...ID_LABELS.map(([type, labels]) => ({ type, re: new RegExp(`\\b(?:${labelRe(labels)})\\b\\s*(?:#|no\\.?|number)?\\s*[:#]?\\s*([A-Z0-9][A-Z0-9-/]{2,})`, 'gi'), needsDigit: true })),
    { type: 'NAME', re: new RegExp(`\\b(?:${labelRe(NAME_LABELS)})\\b\\s*[:\\-]\\s*(${NAME_WORD}(?:(?:\\s+and\\s+|\\s*&\\s*|,\\s+|\\s+)${NAME_WORD}(?!\\s*:)){0,5})`, 'g') },
    { type: 'NAME', re: /\b((?:Mr|Mrs|Ms|Miss|Dr|Mx)\.?\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2})\b/g },
  ];

  function luhn(raw) {
    const d = raw.replace(/\D/g, '');
    if (d.length < 13 || d.length > 19) return false;
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      let n = +d[d.length - 1 - i];
      if (i % 2) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    return sum % 10 === 0;
  }

  // Redact `text`. Returns the safe text, the entities found (kept on device) and counts by type.
  // Options: `known` lists extra strings to always remove (for example the names on the case file).
  function redact(text, { known = [] } = {}) {
    const src = String(text || '');
    const spans = [];
    const add = (type, start, end, value) => {
      if (end <= start) return;
      if (spans.some((s) => start < s.end && end > s.start)) return; // first rule to claim a span wins
      spans.push({ type, start, end, value });
    };
    known.filter((k) => k && k.trim().length >= 3).forEach((k) => {
      const re = new RegExp(esc(k.trim()), 'gi');
      let m;
      while ((m = re.exec(src))) add('NAME', m.index, m.index + m[0].length, m[0]);
    });
    RULES.forEach((rule) => {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(src))) {
        const value = rule.type === 'NAME' ? m[1].replace(/[.,'s-]+$/, '') : m[1];
        if (rule.check && !rule.check(value)) continue;
        if (rule.needsDigit && !/\d/.test(value)) continue;
        const start = m.index + m[0].lastIndexOf(value);
        add(rule.type, start, start + value.length, value);
      }
    });
    spans.sort((a, b) => a.start - b.start);
    const counter = {}, tokenOf = new Map(), entities = [];
    let out = '', at = 0;
    spans.forEach((s) => {
      const key = s.type + '|' + s.value.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!tokenOf.has(key)) { counter[s.type] = (counter[s.type] || 0) + 1; tokenOf.set(key, `[${s.type}_${counter[s.type]}]`); }
      const token = tokenOf.get(key);
      entities.push({ type: s.type, token, value: s.value, start: s.start, end: s.end });
      out += src.slice(at, s.start) + token;
      at = s.end;
    });
    out += src.slice(at);
    return { text: out, entities, counts: counter, removed: entities.length };
  }

  // Put the real values back into a reply, on the device. Unknown tokens are left as they are.
  function restore(text, entities) {
    const map = new Map(entities.map((e) => [e.token, e.value]));
    return String(text || '').replace(/\[[A-Z]+_\d+\]/g, (t) => (map.has(t) ? map.get(t) : t));
  }

  // A last check before a payload leaves the device: anything that still looks like an identifier.
  function leaks(text) {
    const found = [];
    RULES.filter((r) => ['EMAIL', 'SIN', 'CARD', 'PHONE', 'POSTAL', 'IBAN'].includes(r.type)).forEach((rule) => {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text))) if (!rule.check || rule.check(m[1])) found.push({ type: rule.type, value: m[1] });
    });
    return found;
  }

  return { redact, restore, leaks, luhn };
});
