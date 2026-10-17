// End-to-end encryption for shared projects (AES-256-GCM via the browser's WebCrypto).
// The key is generated in the browser and only ever travels inside invite links,
// after the "#", which browsers never send to any server — so the relay only sees ciphertext.

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('This browser has no secure crypto (open Open Gate over https or localhost).');
  return s;
};

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export function randomSecret(bytes = 24): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await subtle().digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function newKey(): Promise<string> {
  const k = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return b64url(new Uint8Array(await subtle().exportKey('raw', k)));
}

const keyCache = new Map<string, Promise<CryptoKey>>();
export function importKey(raw: string): Promise<CryptoKey> {
  let k = keyCache.get(raw);
  if (!k) {
    k = subtle().importKey('raw', fromB64url(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    keyCache.set(raw, k);
  }
  return k;
}

/** iv (12 bytes) + ciphertext. */
export async function encrypt(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

export async function decrypt(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: data.subarray(0, 12) }, key, data.subarray(12)));
}

export async function encryptToString(key: CryptoKey, data: Uint8Array): Promise<string> {
  return b64url(await encrypt(key, data));
}

export async function decryptString(key: CryptoKey, s: string): Promise<Uint8Array> {
  return decrypt(key, fromB64url(s));
}

// ---- Envelope: who made an update, plus the update bytes ----

export interface Author { n: string; c: number; t: number }

export function seal(author: Author, payload: Uint8Array): Uint8Array {
  const head = new TextEncoder().encode(JSON.stringify(author));
  const out = new Uint8Array(3 + head.length + payload.length);
  out[0] = 1;
  out[1] = head.length >> 8;
  out[2] = head.length & 255;
  out.set(head, 3);
  out.set(payload, 3 + head.length);
  return out;
}

export function unseal(data: Uint8Array): { author: Author; payload: Uint8Array } {
  if (data[0] !== 1) throw new Error('Unknown update format');
  const len = (data[1] << 8) | data[2];
  const author = JSON.parse(new TextDecoder().decode(data.subarray(3, 3 + len))) as Author;
  return { author, payload: data.subarray(3 + len) };
}
