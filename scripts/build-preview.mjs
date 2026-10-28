// Builds tickmark-preview.html: index.html without its document skeleton, for publishing as a claude.ai Artifact.
// The Artifact host adds <!doctype>, <html>, <head> and <body> itself.
import { readFileSync, writeFileSync } from 'node:fs';

let h = readFileSync('index.html', 'utf8');
h = h.replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '').replace(/\s*<\/html>\s*$/i, '\n')
  .replace(/<head>\s*/i, '').replace(/\s*<\/head>\s*/i, '\n')
  .replace(/<body>\s*/i, '').replace(/\s*<\/body>/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<title>[^<]*<\/title>/i, '<title>Tickmark</title>');
writeFileSync('tickmark-preview.html', h);
console.log('tickmark-preview.html', h.length, 'bytes');
