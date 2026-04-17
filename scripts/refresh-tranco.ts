/**
 * Refresh the bundled Tranco top-1M snapshot.
 *
 * Usage:
 *   tsx scripts/refresh-tranco.ts
 *
 * Pulls the latest list from https://tranco-list.eu/top-1m.csv.zip, extracts
 * just the domain column, gzips it to data/tranco-top-1m.txt.gz, and writes
 * a small data/tranco-version.json marker so runtime can surface the
 * snapshot date in logs / debug UI.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

import axios from 'axios';

const TRANCO_URL = 'https://tranco-list.eu/top-1m.csv.zip';

async function main(): Promise<void> {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  process.stdout.write(`Downloading Tranco list from ${TRANCO_URL} ...\n`);
  const start = Date.now();
  const resp = await axios.get<ArrayBuffer>(TRANCO_URL, {
    responseType: 'arraybuffer',
    timeout: 120_000,
  });
  process.stdout.write(
    `  downloaded ${resp.data.byteLength} bytes in ${Date.now() - start}ms\n`
  );

  // The payload is a ZIP containing a single CSV (rank,domain). We avoid
  // pulling in a zip dep by looking for the central directory and streaming
  // the first entry. Easier: fall back to requiring `unzipper` if present;
  // otherwise fail with a clear message.
  let unzipper: typeof import('unzipper') | null = null;
  try {
    unzipper = await import('unzipper');
  } catch {
    unzipper = null;
  }

  const zipPath = path.join(dataDir, 'tranco-top-1m.csv.zip');
  fs.writeFileSync(zipPath, Buffer.from(resp.data));

  let csvText: string;
  if (unzipper) {
    const directory = await unzipper.Open.file(zipPath);
    const entry = directory.files.find((f) => f.path.endsWith('.csv'));
    if (!entry) {
      throw new Error('No .csv entry found inside Tranco zip');
    }
    csvText = (await entry.buffer()).toString('utf8');
  } else {
    throw new Error(
      'unzipper module not installed. Run `npm install --save-dev unzipper @types/unzipper` and re-run this script.'
    );
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  process.stdout.write(`  parsed ${lines.length} entries\n`);

  // Keep rank,domain so runtime can reason about rank tiers.
  const gz = zlib.gzipSync(Buffer.from(lines.join('\n'), 'utf8'));
  const outPath = path.join(dataDir, 'tranco-top-1m.txt.gz');
  fs.writeFileSync(outPath, gz);

  const metaPath = path.join(dataDir, 'tranco-version.json');
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        version: `tranco-${new Date().toISOString().slice(0, 10)}`,
        generatedAt: new Date().toISOString(),
        size: lines.length,
        sourceUrl: TRANCO_URL,
      },
      null,
      2
    )
  );

  fs.unlinkSync(zipPath);

  process.stdout.write(
    `Wrote ${outPath} (${gz.byteLength} bytes) and ${metaPath}. ` +
      `Elapsed ${Date.now() - start}ms.\n`
  );
}

main().catch((err) => {
  process.stderr.write(`refresh-tranco failed: ${(err as Error).message}\n`);
  process.exit(1);
});
