export function poReferences(record) {
  if (Array.isArray(record.poIds)) return record.poIds;
  const value = String(record.poId || '').trim();
  if (!value || value === '—') return [];
  const match = /^PO-(\d{4})-(.+)$/.exec(value);
  if (!match) return value.split(/\s*\/\s*/).filter(Boolean);
  const tokens = match[2].split(/\s*\/\s*/).filter(Boolean);
  const first = tokens[0];
  return tokens.map(token => token.startsWith('PO-') ? token : `PO-${match[1]}-${/^[A-Z]$/i.test(token) ? first.replace(/[A-Z]$/i, '') + token : token}`);
}

export function linkedItems(record, items) {
  if (record.poLineId !== undefined && record.poLineId !== null && record.poLineId !== '') return items.filter(item => item.rowId === Number(record.poLineId));
  const refs = poReferences(record);
  if (refs.length) return items.filter(item => refs.includes(item.poId));
  if (record.poId && record.poId !== '—') return [];
  const vendors = String(record.vendorNo || '').split(/\s*\/\s*/);
  return items.filter(item => vendors.includes(item.vendorNo) || String(record.vendorRef || '').startsWith(item.vendorNo + ' -'));
}
