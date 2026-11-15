import {build} from 'esbuild';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
await mkdir('dist', {recursive:true});
await build({entryPoints:['src/card.js'], outfile:'dist/smart-heating-scheduler-card.js', bundle:true, format:'iife', target:'es2022', legalComments:'none'});
console.log('Built self-contained card: dist/smart-heating-scheduler-card.js');
if (process.argv.includes('--inline-preview')) {
  const path = process.argv[process.argv.indexOf('--inline-preview') + 1];
  const template = await readFile('demo/inline-template.html','utf8');
  const bundle = (await readFile('dist/smart-heating-scheduler-card.js','utf8')).replaceAll('</script', '<\\/script');
  await writeFile(path, template.replace('/* CARD_BUNDLE */', bundle));
  console.log('Updated conversation preview');
}
