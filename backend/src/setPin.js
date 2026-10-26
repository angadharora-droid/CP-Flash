/**
 * Sets the dashboard login PIN. Stores a salted scrypt hash in MongoDB when
 * MONGODB_URI is set (the same database the cloud backend reads), otherwise in
 * data/access-pin.json. Once stored, DAILYFLASH_PIN can be removed from the host.
 *
 * Local:   npm run set-pin
 * Print:   npm run set-pin -- --print   (prints a query to paste into Atlas / Compass /
 *          mongosh instead of writing; it carries the hash, never the PIN)
 */
import 'dotenv/config';
import readline from 'node:readline';
import { MongoClient } from 'mongodb';
import { PIN_PATTERN, buildPinRecord, isWeakPin, writePin } from './accessPin.js';

// No terminal: the first line is the PIN. Resolves at the first Enter rather than end of
// input, so a console that isn't a TTY but is being typed into still finishes.
function readPiped() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    rl.once('line', (line) => {
      // Resolve before close(): close() fires the 'close' handler below synchronously.
      resolve(line.trim());
      rl.close();
    });
    rl.once('close', () => resolve(''));
  });
}

// Reads the PIN twice in raw mode and echoes * per digit: the PIN never reaches the screen
// or scrollback, yet each keypress visibly registers. Enter finishes, Backspace erases,
// Ctrl+C aborts. Lines are queued, so a pasted "PIN<Enter>PIN<Enter>" isn't lost.
async function promptTwice() {
  const { stdin, stdout } = process;
  const lines = [];
  let current = '';
  let lastWasCr = false;
  let ended = false;
  let wake = null;
  const onData = (chunk) => {
    for (const ch of chunk) {
      if (ch === '\n' && lastWasCr) {
        lastWasCr = false;
        continue;
      }
      lastWasCr = ch === '\r';
      if (ch === '\u0003') {
        stdin.setRawMode?.(false);
        stdout.write('\n');
        process.exit(130);
      } else if (ch === '\r' || ch === '\n') {
        lines.push(current);
        current = '';
        stdout.write('\n');
        wake?.();
      } else if (ch === '\b' || ch === '\u007f') {
        if (current) {
          current = current.slice(0, -1);
          stdout.write('\b \b');
        }
      } else if (ch >= '0' && ch <= '9') {
        current += ch;
        stdout.write('*');
      }
    }
  };
  const onEnd = () => {
    ended = true;
    wake?.();
  };
  const nextLine = async (question) => {
    stdout.write(question);
    while (!lines.length && !ended) await new Promise((resolve) => { wake = resolve; });
    return lines.shift() ?? '';
  };
  stdin.setRawMode?.(true);
  stdin.setEncoding('utf8');
  stdin.on('data', onData);
  stdin.on('end', onEnd);
  stdin.resume();
  try {
    return [await nextLine('New 6-digit PIN: '), await nextLine('Repeat it: ')];
  } finally {
    stdin.off('data', onData);
    stdin.off('end', onEnd);
    stdin.setRawMode?.(false);
    stdin.pause();
  }
}

function mongoHost(uri) {
  try {
    return new URL(uri).host || 'MONGODB_URI';
  } catch {
    return 'MONGODB_URI';
  }
}

let client = null;
// Unlike the server's getDb this throws instead of falling back to a local file, so a
// bad MONGODB_URI can't leave the cloud PIN unchanged while reporting success.
async function getDb() {
  if (!process.env.MONGODB_URI) return null;
  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  return client.db('dailyflash');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  // Piped input (no terminal) takes the first line as the PIN, without a confirmation.
  const [pin, repeat] = process.stdin.isTTY ? await promptTwice() : [await readPiped(), null];
  if (!PIN_PATTERN.test(pin)) fail('The PIN must be exactly 6 digits — the login screen accepts nothing else. Nothing was saved.');
  if (isWeakPin(pin)) fail('That PIN is repeated or sequential digits, which are guessed first. Pick another. Nothing was saved.');
  if (repeat !== null && repeat !== pin) fail('The two entries did not match. Nothing was saved.');

  if (process.argv.includes('--print')) {
    const record = await buildPinRecord(pin);
    console.log('\nPaste this into mongosh, or the Compass / Atlas shell (creates or replaces the PIN):\n');
    console.log(`db.getSiblingDB('dailyflash').accessPin.replaceOne({ _id: 'singleton' }, ${JSON.stringify(record)}, { upsert: true })`);
    console.log('\nOr, in Atlas Data Explorer, open dailyflash > accessPin > Insert Document and paste this');
    console.log('(delete any existing accessPin document first):\n');
    console.log(JSON.stringify({ _id: 'singleton', ...record }, null, 2));
    return;
  }

  const target = await writePin(pin, getDb);
  console.log(target === 'mongo'
    ? `PIN saved to MongoDB (${mongoHost(process.env.MONGODB_URI)}, database "dailyflash"). It applies to the next login; open sessions stay valid.`
    : `PIN saved to ${target} (no MONGODB_URI set, so only this machine's backend uses it).`);
  console.log('DAILYFLASH_PIN can now be deleted from the cloud host. Keep it in a local .env only where the email fetcher syncs to CLOUD_API_URL, set to this new PIN.');
}

main()
  .catch((err) => {
    console.error(`Failed to save the PIN: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => client?.close());
