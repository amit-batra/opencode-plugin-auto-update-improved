import { test, describe, expect, afterAll } from 'bun:test';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runAutoUpdate } from '../src/update.js';
import { acquireLock } from '../src/lock.js';

const createdDirs: string[] = [];
afterAll(async () => {
  for (const dir of createdDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeConfigDir(): Promise<string> {
  const dir = join(
    tmpdir(),
    `dead-data-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

describe('dead data cleanup', () => {
  test('a written throttle state does not contain a lastSuccess field', async () => {
    const configDir = await makeConfigDir();
    await writeFile(
      join(configDir, 'opencode.json'),
      JSON.stringify({ plugin: ['./local-plugin'] }, null, 2),
      'utf-8'
    );

    await runAutoUpdate({ configDir });

    const throttleFile = join(configDir, '.auto-update.json');
    const parsed = JSON.parse(await readFile(throttleFile, 'utf-8'));
    expect(parsed).toHaveProperty('lastRun');
    expect(parsed).not.toHaveProperty('lastSuccess');
  });

  test('a written lock file does not contain a hostname field', async () => {
    const configDir = await makeConfigDir();

    const acquired = await acquireLock({ debug: false, configDir });
    expect(acquired).toBe(true);

    const lockFile = join(configDir, '.auto-update.lock');
    const parsed = JSON.parse(await readFile(lockFile, 'utf-8'));
    expect(parsed).toHaveProperty('pid');
    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).not.toHaveProperty('hostname');
  });
});
