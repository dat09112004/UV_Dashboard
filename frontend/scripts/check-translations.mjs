import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { translate } from '../src/locales/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vietnamese = /[À-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]/u;
const failures = [];
let checked = 0;
let files = 0;
const report = (file, node, message) => failures.push(`${path.relative(root, file)}:${node.loc.start.line}: ${message}`);

function walk(node, parent, file) {
  if (!node || typeof node !== 'object') return;
  const isObjectKey = (parent?.type === 'ObjectProperty' || parent?.type === 'ObjectMethod') && parent.key === node;
  const value = node.type === 'StringLiteral' ? node.value
    : node.type === 'TemplateLiteral' ? node.quasis.map((part, i) => part.value.cooked + (i < node.expressions.length ? `${12000 + i}` : '')).join('')
      : null;
  if (!isObjectKey && typeof value === 'string' && vietnamese.test(value)) {
    checked += 1;
    if (vietnamese.test(translate(value, 'en'))) report(file, node, `Missing or incomplete English translation: ${JSON.stringify(value)}`);
  }
  if (node.type === 'JSXText' && vietnamese.test(node.value)) {
    report(file, node, `Hard-coded JSX text: ${JSON.stringify(node.value.trim())}`);
  }
  // Native element attributes must call the translator. Custom components can
  // also translate internally (for example, FormWindowDialog and MoneyField).
  if (node.type === 'JSXOpeningElement' && /^[a-z]/.test(node.name.name || '')) {
    for (const attr of node.attributes) {
      if (['title', 'placeholder', 'alt', 'aria-label'].includes(attr.name?.name)
        && attr.value?.type === 'StringLiteral' && vietnamese.test(attr.value.value)) {
        report(file, attr, `Hard-coded ${attr.name.name}: ${JSON.stringify(attr.value.value)}`);
      }
    }
  }
  for (const [key, child] of Object.entries(node)) {
    if (['loc', 'comments', 'tokens', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    if (Array.isArray(child)) child.forEach(item => walk(item, node, file));
    else if (child && typeof child === 'object') walk(child, node, file);
  }
}

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    if (!/\.jsx?$/.test(file) || /[/\\]locales[/\\](messages|partnerNames|LanguageSwitch)\./.test(file)) continue;
    files += 1;
    const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    walk(ast, null, file);
  }
}

// Duplicate literal keys are lost when JavaScript evaluates the dictionary,
// so inspect its AST as well as checking the rendered translations.
const dictionaryFile = path.join(root, 'src/locales/messages.js');
const dictionaryAst = parse(fs.readFileSync(dictionaryFile, 'utf8'), { sourceType: 'module' });
const declaration = dictionaryAst.program.body.find(node => node.type === 'ExportNamedDeclaration').declaration;
const sourceKeys = new Set();
for (const property of declaration.declarations[0].init.properties) {
  const key = property.key.value;
  const canonical = key.trim().normalize('NFC');
  if (sourceKeys.has(canonical)) report(dictionaryFile, property, `Duplicate translation key: ${JSON.stringify(key)}`);
  if (key !== canonical) report(dictionaryFile, property, `Non-canonical translation key: ${JSON.stringify(key)}`);
  sourceKeys.add(canonical);
}

scan(path.join(root, 'src'));
if (failures.length) {
  process.stderr.write(failures.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`Translation audit passed: ${files} source files, ${checked} Vietnamese literals/templates, no missing translations or hard-coded Vietnamese UI text.\n`);
}
