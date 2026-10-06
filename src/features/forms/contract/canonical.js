// Restricted RFC 8785/JCS encoder for immutable manifests. Manifests contain
// only I-JSON strings, booleans, nulls and safe integers (no binary fractions).
// Keeping that restriction explicit avoids platform-dependent number formatting.
function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('Manifest numbers must be safe integers');
    return String(value);
  }
  if (typeof value === 'string') {
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('Unpaired surrogate');
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new TypeError('Unpaired surrogate');
      }
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) throw new TypeError('Sparse manifest array');
    }
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value).sort(); // ECMAScript UTF-16 order specified by JCS.
    return `{${keys.map(key => `${canonicalize(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new TypeError('Unsupported manifest value');
}

// UTF-8 and SHA-256 are pure so the bundled registry verifies offline in RN
// without Node crypto, network access, native modules, or mutable global state.
function utf8(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    let point = text.codePointAt(i);
    if (point > 0xffff) i += 1;
    if (point <= 0x7f) bytes.push(point);
    else if (point <= 0x7ff) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 63));
    else if (point <= 0xffff) bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    else bytes.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 63), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
  }
  return bytes;
}

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const rotate = (x, n) => (x >>> n) | (x << (32 - n));

function sha256(text) {
  const bytes = utf8(text);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (const word of [high, low]) bytes.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255);
  const state = INITIAL.slice();
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i += 1) {
      const p = offset + 4 * i;
      w[i] = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotate(w[i - 15], 7) ^ rotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotate(w[i - 2], 17) ^ rotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choose + K[i] + w[i]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((word, i) => { state[i] = (state[i] + word) >>> 0; });
  }
  return state.map(word => word.toString(16).padStart(8, '0')).join('');
}

module.exports = { canonicalize, sha256 };
