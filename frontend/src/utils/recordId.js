let sequence = 0;
// Local draft IDs also work on an internal HTTP host. Backend creates authoritative IDs.
export function newRecordId(prefix = 'LOCAL', random = globalThis.crypto) {
  if (typeof random?.randomUUID === 'function') return `${prefix}-${random.randomUUID()}`;
  if (typeof random?.getRandomValues === 'function') {
    const bytes = random.getRandomValues(new Uint8Array(16));
    return `${prefix}-${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')}`;
  }
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}
