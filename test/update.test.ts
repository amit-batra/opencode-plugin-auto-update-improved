import { test, describe, expect, afterAll } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runAutoUpdate, type AutoUpdateOptions } from '../src/update.js';
import { readThrottleState, writeThrottleState } from '../src/lock.js';

const HOUR_MS = 60 * 60 * 1000;

const createdDirs: string[] = [];
afterAll(async () => {
  for (const dir of createdDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeConfigDir(): Promise<string> {
  const dir = join(tmpdir(), `auto-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

async function seedThrottle(configDir: string, lastRun: number): Promise<void> {
  await writeThrottleState({ lastRun }, { configDir });
}

async function collectLogs(
  configDir: string,
  options: AutoUpdateOptions = {}
): Promise<string[]> {
  const logs: string[] = [];
  await runAutoUpdate({ ...options, configDir, onLog: (message) => logs.push(message) });
  return logs;
}

function isThrottled(logs: string[]): boolean {
  return logs.some((message) => message.includes('Throttled'));
}

describe('throttle default interval', () => {
  test('is throttled on a second run within the default 24h interval', async () => {
    delete process.env.OPENCODE_AUTO_UPDATE_INTERVAL_HOURS;
    const configDir = await makeConfigDir();
    const now = Date.now();
    await seedThrottle(configDir, now);

    const logs = await collectLogs(configDir);

    expect(isThrottled(logs)).toBe(true);
    const state = await readThrottleState({ configDir });
    expect(state.lastRun).toBe(now);
  });

  test('is NOT throttled after the default 24h interval has elapsed', async () => {
    delete process.env.OPENCODE_AUTO_UPDATE_INTERVAL_HOURS;
    const configDir = await makeConfigDir();
    const oldRun = Date.now() - 25 * HOUR_MS;
    await seedThrottle(configDir, oldRun);

    const logs = await collectLogs(configDir);

    expect(isThrottled(logs)).toBe(false);
    const state = await readThrottleState({ configDir });
    expect(state.lastRun).toBeGreaterThan(oldRun);
  });

  test('proves the default interval is 24h (not 0)', async () => {
    delete process.env.OPENCODE_AUTO_UPDATE_INTERVAL_HOURS;

    const withinDir = await makeConfigDir();
    const withinRun = Date.now() - 23 * HOUR_MS;
    await seedThrottle(withinDir, withinRun);
    const withinLogs = await collectLogs(withinDir);
    expect(isThrottled(withinLogs)).toBe(true);

    const afterDir = await makeConfigDir();
    const afterRun = Date.now() - 25 * HOUR_MS;
    await seedThrottle(afterDir, afterRun);
    const afterLogs = await collectLogs(afterDir);
    expect(isThrottled(afterLogs)).toBe(false);
  });

  test('ignoreThrottle bypasses the throttle even within the interval', async () => {
    delete process.env.OPENCODE_AUTO_UPDATE_INTERVAL_HOURS;
    const configDir = await makeConfigDir();
    const within = Date.now() - 1 * HOUR_MS;
    await seedThrottle(configDir, within);

    const logs = await collectLogs(configDir, { ignoreThrottle: true });

    expect(isThrottled(logs)).toBe(false);
    const state = await readThrottleState({ configDir });
    expect(state.lastRun).toBeGreaterThan(within + 1000);
  });

  test('a custom intervalHours is honored', async () => {
    delete process.env.OPENCODE_AUTO_UPDATE_INTERVAL_HOURS;

    const withinDir = await makeConfigDir();
    const within = Date.now() - 1 * HOUR_MS;
    await seedThrottle(withinDir, within);
    const throttledLogs = await collectLogs(withinDir, { intervalHours: 6 });
    expect(isThrottled(throttledLogs)).toBe(true);

    const afterDir = await makeConfigDir();
    const after = Date.now() - 7 * HOUR_MS;
    await seedThrottle(afterDir, after);
    const afterLogs = await collectLogs(afterDir, { intervalHours: 6 });
    expect(isThrottled(afterLogs)).toBe(false);
  });
});
