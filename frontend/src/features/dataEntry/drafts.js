const DRAFT_KEY_PREFIX = 'uv-entry-draft-v1:';
const keyFor = actorId => `${DRAFT_KEY_PREFIX}${actorId}`;
const temporaryDrafts = new Map();
export const entryDraftIsTemporary = actorId => temporaryDrafts.has(actorId);

export function readEntryDraft(actorId) {
  if (temporaryDrafts.has(actorId)) return temporaryDrafts.get(actorId);
  try {
    const draft = JSON.parse(globalThis.sessionStorage.getItem(keyFor(actorId)));
    if (draft?.sheets && typeof draft.sheets === 'object') return draft;
    return { sheets: {} };
  } catch {
    return { sheets: {} };
  }
}

export function storeEntryDraft(actorId, draft) {
  try {
    if (Object.keys(draft.sheets).length) globalThis.sessionStorage.setItem(keyFor(actorId), JSON.stringify(draft));
    else globalThis.sessionStorage.removeItem(keyFor(actorId));
    temporaryDrafts.delete(actorId);
    return true;
  } catch {
    temporaryDrafts.set(actorId, draft);
    return false;
  }
}

// S13 Fix: Xóa toàn bộ bản nháp nghiệp vụ trong sessionStorage và bộ nhớ tạm khi đăng xuất hoặc hết hạn phiên
export function clearEntryDrafts(actorId) {
  if (actorId) {
    temporaryDrafts.delete(actorId);
  } else {
    temporaryDrafts.clear();
  }
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;
    if (actorId) {
      storage.removeItem(keyFor(actorId));
    }
    const keysToRemove = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith(DRAFT_KEY_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      storage.removeItem(k);
    }
  } catch {
    // Ignore sessionStorage cleanup errors in restricted environments
  }
}

// Excel terminates a copied range with a newline. Trailing tabs are cells,
// including an empty cell that must overwrite a value in the destination.
export function clipboardRows(text) {
  const rows = text.split(/\r\n|\n|\r/);
  if (rows.length > 1 && rows.at(-1) === '') rows.pop();
  return rows.map(row => row.split('\t'));
}
