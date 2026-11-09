const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

async function passwordVerifier(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, key, 256);
  return toHex(new Uint8Array(bits));
}

export async function matchesPassword(account, password, saved) {
  if (saved === null) return password === account.password;
  const { salt, verifier } = JSON.parse(saved) ?? {};
  if (typeof salt !== 'string' || typeof verifier !== 'string' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(verifier)) {
    throw new Error('Invalid demo credential record');
  }
  const saltBytes = Uint8Array.from(salt.match(/../g), byte => parseInt(byte, 16));
  return await passwordVerifier(password, saltBytes) === verifier;
}

export async function createPasswordRecord(password) {
  if (!globalThis.crypto?.subtle) throw new Error('Cần mở bản thử nghiệm qua HTTPS hoặc localhost.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier = await passwordVerifier(password, salt);
  return JSON.stringify({ salt: toHex(salt), verifier });
}

export const validNewPassword = password =>
  typeof password === 'string' && password.trim().length >= 8 && password.length <= 128;
