// Inline the production build into one self-contained page (dist/artifact.html)
// suitable for publishing as a claude.ai Artifact: CSS and JS inlined, and the
// document wrapper removed (the host adds its own <html>/<head>/<body>).
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/g, (_, file) => {
  const css = fs.readFileSync(path.join(dist, file), 'utf8');
  return `<style>\n${css}\n</style>`;
});

let js = '';
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, file) => {
  js = fs.readFileSync(path.join(dist, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return '';
});

const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .trim();
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].trim();

const out = `${head}\n${body}\n<script type="module">\n${js}\n</script>\n`;
fs.writeFileSync(path.join(dist, 'artifact.html'), out);
console.log(`dist/artifact.html  ${(out.length / 1024).toFixed(0)} KB`);
