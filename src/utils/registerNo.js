// "  abc 123 " -> "ABC123". Allows letters, digits, / and -
const VALID = /^[A-Z0-9/-]{3,30}$/;

function normalizeRegisterNo(input) {
  if (input === undefined || input === null) return null;
  const v = String(input).replace(/\s+/g, '').toUpperCase();
  return VALID.test(v) ? v : null;
}

module.exports = { normalizeRegisterNo };
