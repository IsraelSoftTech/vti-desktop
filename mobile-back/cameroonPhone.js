/** Cameroon mobile numbers for parent login (username = phone). */

function digitsOnly(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Canonical E.164: +2376XXXXXXXX.
 * Accepts 6XXXXXXXX, 06XXXXXXXX, 2376XXXXXXXX, +237 6XX XX XX XX.
 * Mobiles are 9 national digits starting with 6.
 */
function normalizeCameroonPhone(raw) {
  const digits = digitsOnly(raw);
  if (!digits) return null;

  let national = '';
  if (digits.startsWith('237') && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length === 10) {
    national = digits.slice(1);
  } else if (digits.length === 9) {
    national = digits;
  } else {
    return null;
  }

  if (!/^6\d{8}$/.test(national)) return null;
  return `+237${national}`;
}

function isCameroonPhone(raw) {
  return Boolean(normalizeCameroonPhone(raw));
}

/** Last 9 Cameroon mobile digits, or null. */
function nationalNine(raw) {
  const canonical = normalizeCameroonPhone(raw);
  if (canonical) return digitsOnly(canonical).slice(-9);
  const d = digitsOnly(raw);
  if (d.length >= 9) {
    const last = d.slice(-9);
    if (/^6\d{8}$/.test(last)) return last;
  }
  return null;
}

function phonesMatch(a, b) {
  const left = nationalNine(a);
  const right = nationalNine(b);
  return Boolean(left && right && left === right);
}

module.exports = {
  digitsOnly,
  normalizeCameroonPhone,
  isCameroonPhone,
  nationalNine,
  phonesMatch,
};
