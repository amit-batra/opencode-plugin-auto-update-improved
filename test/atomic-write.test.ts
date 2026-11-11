import { test, describe, expect, afterAll } from 'bun:test';
import { mkdir, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeAtomic } from '../src/utils/atomic-write.js';
import { writeThrottleState, type ThrottleState } from '../src/lock.js';

const createdDirs: string[] = [];
afterAll(async () => {
  for (const dir of createdDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(): Promise<string> {
  const dir = join(tmpdir(), `atomic-write-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

describe('writeAtomic', () => {
  test('writes contents to the target file', async () => {
    const dir = await makeTempDir();
    const target = join(dir, 'target.json');

    await writeAtomic(target, '{"a":1}\n');

    const content = await readFile(target, 'utf-8');
    expect(content).toBe('{"a":1}\n');
  });

  test('overwrites an existing target and leaves no temp files behind', async () => {
    const dir = await makeTempDir();
    const target = join(dir, 'target.json');
    await writeAtomic(target, 'old');

    await writeAtomic(target, 'new');

    const content = await readFile(target, 'utf-8');
    expect(content).toBe('new');

    const entries = await readdir(dir);
    expect(entries).toEqual(['target.json']);
  });

  test('creates the parent directory when it does not exist', async () => {
    const dir = await makeTempDir();
    const target = join(dir, 'nested', 'sub', 'target.json');

    await writeAtomic(target, 'deep');

    const content = await readFile(target, 'utf-8');
    expect(content).toBe('deep');
  });
});

describe('writeThrottleState', () => {
  test('writes atomically and leaves no temp files in the config directory', async () => {
    const configDir = await makeTempDir();
    const state: ThrottleState = { lastRun: Date.now() };

    await writeThrottleState(state, { configDir });

    const entries = await readdir(configDir);
    expect(entries).toEqual(['.auto-update.json']);
  });
});
