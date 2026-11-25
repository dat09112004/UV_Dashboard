import { english } from './messages.js';
import { englishPartnerName } from './partnerNames.js';

const storageKey = 'uv-language';
const listeners = new Set();

function initialLanguage() {
  try { return globalThis.localStorage?.getItem(storageKey) === 'en' ? 'en' : 'vi'; }
  catch { return 'vi'; }
}

let language = initialLanguage();
export const getLanguage = () => language;
export const locale = () => language === 'en' ? 'en-GB' : 'vi-VN';

export function subscribeLanguage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLanguage(next) {
  if (next === language || (next !== 'en' && next !== 'vi')) return;
  language = next;
  try { globalThis.localStorage?.setItem(storageKey, next); } catch { /* Keep the preference for this session. */ }
  listeners.forEach(listener => listener());
}

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whitespace belongs to the rendered sentence, not to its dictionary key.
// Normalising both sides also supports decomposed Vietnamese Unicode from APIs.
const normalise = value => value.trim().normalize('NFC');
const labels = new Map(Object.entries(english).map(([source, target]) => [normalise(source), target.trim()]));
const templates = [...labels.keys()].filter(key => key.includes('§'))
  .sort((a, b) => b.replaceAll('§', '').length - a.replaceAll('§', '').length)
  .map(key => {
    // A counter must never consume a whole business status or sentence. This
    // avoids interpreting 'Cần tách chứng từ' as a document count.
    const numericLead = /^§(?: (?:dòng|báo động đỏ|chứng từ|công việc cảnh báo|mã hàng|ngành hàng|triệu VND|việc cần theo dõi|khoản|chưa đủ xác nhận giao|phiếu giao)|\/§)/.test(key);
    const chunks = key.split('§').map(escapeRegex);
    const pattern = chunks.reduce((result, chunk, index) => result + (index === 0 ? ''
      : numericLead && index === 1 ? '([\\d.,\\s]+)' : '([\\s\\S]*?)') + chunk, '');
    return [key, new RegExp('^' + pattern + '$')];
  });

function interpolate(template, values) {
  let index = 0;
  // A callback preserves literal dollar signs and replacement tokens in user data.
  return template.replace(/§/g, () => values[index++] ?? '');
}

function englishGrammar(message) {
  const singular = {
    days: 'day', items: 'item', documents: 'document', alerts: 'alert', balances: 'balance',
    'product categories': 'product category', 'delivery notes': 'delivery note',
    rows: 'row', orders: 'order', tasks: 'task', reminders: 'reminder',
    records: 'record', times: 'time', seconds: 'second', worksheets: 'worksheet',
  };
  return message.replace(/(?<![\d.,])1 ((?:new |draft |critical |PO line )?)(product categories|delivery notes|days|items|documents|alerts|balances|rows|orders|tasks|reminders|records|times|seconds|worksheets)\b/g,
    (_, modifier, noun) => '1 ' + modifier + singular[noun]);
}

const englishLabel = value => labels.get(normalise(value)) ?? englishPartnerName(value);

export function translate(value, target = language, depth = 0) {
  if (target !== 'en' || typeof value !== 'string' || !value.trim()) return value;
  const trimmed = value.trim();
  const key = trimmed.normalize('NFC');
  const lead = value.slice(0, value.indexOf(trimmed));
  const tail = value.slice(lead.length + trimmed.length);
  const label = englishLabel(key);
  if (label !== undefined) return lead + label + tail;
  if (!/[À-ỹ]/.test(key) || depth >= 8) return value;
  // More specific patterns win. Translate nested system messages while leaving
  // unknown names, document codes and free-form text intact.
  for (const [source, pattern] of templates) {
    const match = pattern.exec(key);
    if (match) {
      const values = match.slice(1).map(part => translate(part, target, depth + 1));
      return lead + englishGrammar(interpolate(labels.get(source), values)) + tail;
    }
  }
  if (key.startsWith('· ')) {
    return lead + '· ' + translate(key.slice(2), target, depth + 1) + tail;
  }
  // Legacy summaries concatenate status, due date, note and reminder fragments.
  // Preserve their separators, and translate each recognised fragment separately.
  const fragments = key.split(/(?=\s+·\s+)/);
  if (fragments.length > 1) {
    return lead + fragments.map(part => translate(part, target, depth + 1)).join('') + tail;
  }
  return value;
}

export const t = value => translate(value);

export function phrase(source, ...values) {
  if (language !== 'en') return interpolate(source, values);
  const template = englishLabel(source) ?? source;
  return englishGrammar(interpolate(template, values.map(value => translate(value))));
}
