import crypto from 'node:crypto';

if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto;
}

export const webCryptoReady = Boolean(globalThis.crypto);
