function formRank(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('upper sixth') || n.includes('upper 6')) return 70;
  if (n.includes('lower sixth') || n.includes('lower 6')) return 60;
  if (/(?:form|class)\s*one\b/.test(n) || /\b1\b/.test(n)) return 10;
  if (/(?:form|class)\s*two\b/.test(n) || /\b2\b/.test(n)) return 20;
  if (/(?:form|class)\s*three\b/.test(n) || /\b3\b/.test(n)) return 30;
  if (/(?:form|class)\s*four\b/.test(n) || /\b4\b/.test(n)) return 40;
  if (/(?:form|class)\s*five\b/.test(n) || /\b5\b/.test(n)) return 50;
  return 90;
}

function streamRank(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('grammar')) return 1;
  if (n.includes('technical')) return 2;
  if (n.includes('commercial')) return 3;
  if (n.includes('science')) return 4;
  if (n.includes('arts')) return 5;
  return 9;
}

function classSortKey(name) {
  return [formRank(name), streamRank(name), String(name || '').toLowerCase()];
}

function compareClassNames(a, b) {
  const ka = classSortKey(a);
  const kb = classSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0;
}

function sortClasses(rows) {
  return [...(rows || [])].sort((a, b) => compareClassNames(a?.name, b?.name));
}

module.exports = {
  formRank,
  streamRank,
  compareClassNames,
  sortClasses,
};
