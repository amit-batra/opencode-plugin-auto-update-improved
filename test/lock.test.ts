import { test, describe, expect, afterAll } from 'bun:test';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireLock, type LockData } from '../src/lock.js';

const STALE_LOCK_MS = 2 * 60 * 60 * 1000; // must stay in sync with lock.ts

const createdDirs: string[] = [];
afterAll(async () => {
  for (const dir of createdDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeConfigDir(): Promise<string> {
  const dir = join(tmpdir(), `lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

async function writeLock(configDir: string, lockData: LockData): Promise<void> {
  const lockFile = join(configDir, '.auto-update.lock');
  await writeFile(lockFile, JSON.stringify(lockData, null, 2), 'utf-8');
}

async function readLock(configDir: string): Promise<LockData> {
  const lockFile = join(configDir, '.auto-update.lock');
  const content = await readFile(lockFile, 'utf-8');
  return JSON.parse(content) as LockData;
}

const FOREIGN_PID = 1;

describe('stale lock recovery', () => {
  test('a fresh lock held by another pid is respected (no force)', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, {
      pid: FOREIGN_PID,
      timestamp: Date.now(),
    });

    const acquired = await acquireLock({ debug: false, configDir });

    expect(acquired).toBe(false);
    const lock = await readLock(configDir);
    expect(lock.pid).toBe(FOREIGN_PID);
  });

  test('a fresh lock is respected even when force is set', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, {
      pid: FOREIGN_PID,
      timestamp: Date.now(),
    });

    const acquired = await acquireLock({ force: true, debug: false, configDir });

    expect(acquired).toBe(false);
    const lock = await readLock(configDir);
    expect(lock.pid).toBe(FOREIGN_PID);
  });

  test('a stale lock is recovered when force is set', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, {
      pid: FOREIGN_PID,
      timestamp: Date.now() - STALE_LOCK_MS - 60_000,
    });

    const acquired = await acquireLock({ force: true, debug: false, configDir });

    expect(acquired).toBe(true);
    const lock = await readLock(configDir);
    expect(lock.pid).toBe(process.pid);
    expect(lock.timestamp).toBeGreaterThan(Date.now() - 1000);
  });

  test('a stale lock is NOT recovered without force', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, {
      pid: FOREIGN_PID,
      timestamp: Date.now() - STALE_LOCK_MS - 60_000,
    });

    const acquired = await acquireLock({ force: false, debug: false, configDir });

    expect(acquired).toBe(false);
    const lock = await readLock(configDir);
    expect(lock.pid).toBe(FOREIGN_PID);
  });

  test('a corrupt (0-byte) lock is reclaimed so auto-updates are not wedged', async () => {
    const configDir = await makeConfigDir();
    await writeFile(join(configDir, '.auto-update.lock'), '');

    const acquired = await acquireLock({ force: true, debug: false, configDir });

    expect(acquired).toBe(true);
    const lock = await readLock(configDir);
    expect(lock.pid).toBe(process.pid);
    expect(lock.timestamp).toBeGreaterThan(Date.now() - 1000);
  });

  test('a corrupt (unparseable JSON) lock is reclaimed', async () => {
    const configDir = await makeConfigDir();
    await writeFile(join(configDir, '.auto-update.lock'), 'not-json');

    const acquired = await acquireLock({ force: true, debug: false, configDir });

    expect(acquired).toBe(true);
    const lock = await readLock(configDir);
    expect(lock.pid).toBe(process.pid);
  });
});
