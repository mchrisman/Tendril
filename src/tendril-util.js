// tendril-util.js — shared utility functions

/**
 * SameValueZero equality (same semantics as Map/Set keys)
 * - NaN equals NaN (unlike ===)
 * - 0 equals -0 (like ===, unlike Object.is)
 */
export function sameValueZero(a, b) {
  if (a === b) return true;
  // Only remaining case where we want true: NaN === NaN
  return Number.isNaN(a) && Number.isNaN(b);
}

/**
 * Deep equality check for structural comparison
 * Uses SameValueZero for primitive comparison
 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return sameValueZero(a, b);

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}
