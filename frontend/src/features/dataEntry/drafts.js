const keyFor = actorId => `uv-entry-draft-v1:${actorId}`;
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

// Excel terminates a copied range with a newline. Trailing tabs are cells,
// including an empty cell that must overwrite a value in the destination.
export function clipboardRows(text) {
  const rows = text.split(/\r\n|\n|\r/);
  if (rows.length > 1 && rows.at(-1) === '') rows.pop();
  return rows.map(row => row.split('\t'));
}
