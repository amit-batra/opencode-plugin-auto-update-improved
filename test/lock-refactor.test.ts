import { test, describe, expect, afterAll } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  acquireLock,
  releaseLock,
  isStaleLockData,
  isProcessAlive,
  type LockData,
} from '../src/lock.js';

const STALE_LOCK_MS = 2 * 60 * 60 * 1000; // must stay in sync with lock.ts

const createdDirs: string[] = [];
afterAll(async () => {
  for (const dir of createdDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeConfigDir(): Promise<string> {
  const dir = join(tmpdir(), `lock-refactor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

async function writeLock(configDir: string, lockData: LockData): Promise<void> {
  const lockFile = join(configDir, '.auto-update.lock');
  await writeFile(lockFile, JSON.stringify(lockData, null, 2), 'utf-8');
}

const FOREIGN_PID = 1;

describe('isStaleLockData (pure helper)', () => {
  test('a fresh lock is not stale', () => {
    expect(isStaleLockData({ pid: FOREIGN_PID, timestamp: Date.now() })).toBe(false);
  });

  test('a lock older than the threshold is stale', () => {
    const old = Date.now() - STALE_LOCK_MS - 60_000;
    expect(isStaleLockData({ pid: FOREIGN_PID, timestamp: old })).toBe(true);
  });

  test('respects an injected clock', () => {
    const clock = Date.now();
    expect(isStaleLockData({ pid: FOREIGN_PID, timestamp: clock }, clock)).toBe(false);
    expect(isStaleLockData({ pid: FOREIGN_PID, timestamp: clock }, clock + STALE_LOCK_MS + 1)).toBe(true);
  });
});

describe('isProcessAlive (pure helper)', () => {
  test('the current process is alive', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  test('a non-positive pid is dead', () => {
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
  });

  test('a non-integer pid is dead', () => {
    expect(isProcessAlive(1.5)).toBe(false);
  });

  test('a high unused pid is dead', () => {
    expect(isProcessAlive(2_000_000_000)).toBe(false);
  });
});

describe('acquireLock reclaims a crashed holder by pid liveness', () => {
  const DEAD_PID = 2_000_000_000;

  test('a fresh-timestamp lock from a dead pid is reclaimed when forced', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, { pid: DEAD_PID, timestamp: Date.now() });

    const acquired = await acquireLock({ force: true, debug: false, configDir });

    expect(acquired).toBe(true);
    await releaseLock({ debug: false, configDir });
  });

  test('a fresh-timestamp lock from a dead pid is NOT reclaimed without force', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, { pid: DEAD_PID, timestamp: Date.now() });

    const acquired = await acquireLock({ force: false, debug: false, configDir });

    expect(acquired).toBe(false);
  });

  test('a fresh-timestamp lock from a live pid is respected even when forced', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, { pid: process.pid, timestamp: Date.now() });

    const acquired = await acquireLock({ force: true, debug: false, configDir });

    expect(acquired).toBe(false);
  });
});

describe('acquireLock reuses the single read (no TOCTOU re-read)', () => {
  test('a fresh lock held by another pid is respected (no force)', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, { pid: FOREIGN_PID, timestamp: Date.now() });

    const acquired = await acquireLock({ debug: false, configDir });

    expect(acquired).toBe(false);
  });

  test('a fresh lock is respected even when force is set', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, { pid: FOREIGN_PID, timestamp: Date.now() });

    const acquired = await acquireLock({ force: true, debug: false, configDir });

    expect(acquired).toBe(false);
  });

  test('a stale lock is recovered when force is set', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, { pid: FOREIGN_PID, timestamp: Date.now() - STALE_LOCK_MS - 60_000 });

    const acquired = await acquireLock({ force: true, debug: false, configDir });

    expect(acquired).toBe(true);
    await releaseLock({ debug: false, configDir });
  });

  test('a stale lock is NOT recovered without force', async () => {
    const configDir = await makeConfigDir();
    await writeLock(configDir, { pid: FOREIGN_PID, timestamp: Date.now() - STALE_LOCK_MS - 60_000 });

    const acquired = await acquireLock({ force: false, debug: false, configDir });

    expect(acquired).toBe(false);
  });

  test('acquire then release succeeds with no pre-existing lock', async () => {
    const configDir = await makeConfigDir();

    const acquired = await acquireLock({ debug: false, configDir });
    expect(acquired).toBe(true);

    await releaseLock({ debug: false, configDir });
    const reacquired = await acquireLock({ debug: false, configDir });
    expect(reacquired).toBe(true);
  });
});
