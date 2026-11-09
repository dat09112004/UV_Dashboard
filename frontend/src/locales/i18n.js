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
const templates = Object.keys(english).filter(key => key.includes('§'))
  .sort((a, b) => b.replaceAll('§', '').length - a.replaceAll('§', '').length)
  .map(key => [
  key, new RegExp('^' + key.split('§').map(escapeRegex).join('([\\s\\S]*?)') + '$'),
]);

function interpolate(template, values) {
  let index = 0;
  return template.replace(/§/g, () => values[index++] ?? '');
}

function englishGrammar(message) {
  return message.replace(/(?<![\d.,])1 (days|items|documents|alerts|balances|product categories)\b/g, (_, noun) =>
    '1 ' + (noun === 'product categories' ? 'product category' : noun.slice(0, -1)));
}

const englishLabel = value => Object.hasOwn(english, value) ? english[value] : englishPartnerName(value);

export function translate(value, target = language) {
  if (target !== 'en' || typeof value !== 'string' || !value.trim()) return value;
  const key = value.trim();
  const lead = value.slice(0, value.indexOf(key));
  const tail = value.slice(lead.length + key.length);
  const label = englishLabel(key);
  if (label !== undefined) return lead + label + tail;
  // Historic audit messages and business statuses are stored in Vietnamese.
  // Translate known sentence patterns without changing captured references or notes.
  if (!/[À-ỹ]/.test(key)) return value;
  for (const [source, pattern] of templates) {
    const match = pattern.exec(key);
    if (match) {
      const values = match.slice(1).map(part => englishLabel(part) ?? part);
      return lead + englishGrammar(interpolate(english[source], values)) + tail;
    }
  }
  return value;
}

export const t = value => translate(value);

export function phrase(source, ...values) {
  const message = interpolate(language === 'en' ? (english[source] ?? source) : source, values);
  return language === 'en' ? englishGrammar(message) : message;
}
