// A simplified version of deep-equal that:
//
// a) Treats undefined as null as different
//    (since they produce different JSON output)
//
// b) Treats a missing property and an undefined property as equal
//    (since they produce the same JSON output)
//
// c) Does NOT handle regexes since they never show up in the content we're
//    trying to serialize to JSON and in order to implement that deep-equal
//    has the following dependency chain:
//
//    deep-equal -> is-regex -> has -> function-bind
//
//    and function-bind does eval() (actually Function(<string>)) which causes
//    problems for CSP (including Web Extensions which have a default CSP policy
//    applied, and deviating from that can cause difficulties when submitting
//    the extension).
//
//    ... and in fact doesn't deal with anything other than POD since we
//    currently don't need it, and if we're comparing things in a JSON context
//    we probably don't expect to deal with Date objects etc.
//
// It also drops a bunch of dependencies and is tailored to use browser APIs
// where commonly available.
//
// So, for example, it uses native Object.is because only IE doesn't support it
// and none of our projects care about IE.

export function jsonEqualish(actual: any, expected: any) {
  if (Object.is(actual, expected)) {
    return true;
  }

  // For non-objects, use Object.is. This will cause 'undefined' and 'null' to
  // be different, as desired.
  if (
    !actual ||
    !expected ||
    (typeof actual !== 'object' && typeof expected !== 'object')
  ) {
    // Except for numbers, since we want '-0' and '+0' to be equivalent
    //
    // (We should really just use JSON.stringify here. Might be slower but would
    // it matter?)
    return typeof actual === 'number'
      ? actual === expected
      : Object.is(actual, expected);
  }

  return objEquiv(actual, expected);
}

function objEquiv(a: any, b: any) {
  if (typeof a !== typeof b) {
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  // We only deal with POD at the moment.
  if (
    (a.constructor !== Object && a.constructor !== Array) ||
    (b.constructor !== Object && b.constructor !== Array)
  ) {
    throw new Error('Trying to compare something fancy');
  }

  const aKeys = definedKeys(a);
  const bKeys = definedKeys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  aKeys.sort();
  bKeys.sort();

  // Compare keys first
  for (let i = 0; i < aKeys.length; ++i) {
    if (aKeys[i] != bKeys[i]) {
      return false;
    }
  }

  // Compare values
  for (const key of aKeys) {
    if (!jsonEqualish(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

function definedKeys(a: any) {
  return Object.keys(a).filter(key => typeof a[key] !== 'undefined');
}
