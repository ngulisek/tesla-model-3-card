import { readFileSync, writeFileSync } from 'node:fs';
const sources = ['data.js', 'conditions.js', 'car.js', 'editor.js', 'card.js'];
const bundle = sources.map(name => readFileSync(new URL(`src/${name}`, import.meta.url), 'utf8')
  .replace(/^import .*?;\s*$/gm, '')
  .replace(/^export (?=(?:const|let|function|class)\b)/gm, ''));
const javascript = `/* Tesla Model 3 Card v1.1.0 • Local assets; Home Assistant entities only. */\n${bundle.join('\n\n')}`;
writeFileSync(new URL('tesla-model-3-card.js', import.meta.url), javascript);
const demo = readFileSync(new URL('demo.html', import.meta.url), 'utf8');
writeFileSync(new URL('preview.html', import.meta.url), demo.replace("import './tesla-model-3-card.js';", () => javascript));
console.log('Built tesla-model-3-card.js');
