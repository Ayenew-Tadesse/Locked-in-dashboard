// Sets the password for the dashboard's lock screen.
//
//   node tools/set-password.mjs
//
// You type the password twice (it isn't shown). Only its SHA-256
// fingerprint is written into index.html, never the password itself.
// Note: this is a lock screen, not encryption; the page's data is still
// readable in its source.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const page = new URL('../index.html', import.meta.url);

// One reader for both questions; typed characters show as *.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
rl._writeToOutput = (text) => {
  if (!muted) rl.output.write(text);
  else if (text !== '\r\n' && text !== '\n') rl.output.write('*');
};
// Queue lines as they arrive, so an answer typed (or pasted) early isn't lost.
const lines = [];
let waiting = null;
rl.on('line', (line) => {
  if (waiting) {
    const resolve = waiting;
    waiting = null;
    resolve(line);
  } else lines.push(line);
});
rl.on('close', () => waiting && waiting(''));
function askHidden(question) {
  muted = false;
  rl.output.write(question);
  muted = true;
  return new Promise((resolve) => {
    const done = (answer) => {
      process.stdout.write('\n');
      resolve(answer);
    };
    if (lines.length) done(lines.shift());
    else waiting = done;
  });
}
function stop(message) {
  console.error(message);
  rl.close();
  process.exit(1);
}

const pw = await askHidden('New dashboard password: ');
if (pw.length < 6) stop('Use at least 6 characters. Nothing was changed.');
const again = await askHidden('Type it again: ');
rl.close();
if (pw !== again) stop("The two passwords don't match. Nothing was changed.");

const hash = createHash('sha256').update('locked-in:' + pw).digest('hex');
const html = readFileSync(page, 'utf8');
const pattern = /var ACCESS_HASH = "[0-9a-f]*";/;
if (!pattern.test(html)) stop("Couldn't find the password line in index.html. Nothing was changed.");
writeFileSync(page, html.replace(pattern, `var ACCESS_HASH = "${hash}";`));
console.log('Password set. Tell Claude it is done so the dashboard can be published.');
