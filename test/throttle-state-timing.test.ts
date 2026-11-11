import { test, describe, expect, afterAll } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runAutoUpdate, type AutoUpdateOptions } from '../src/update.js';
import { readThrottleState } from '../src/lock.js';

const createdDirs: string[] = [];
afterAll(async () => {
  for (const dir of createdDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeConfigDir(): Promise<string> {
  const dir = join(tmpdir(), `throttle-timing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

async function writeConfig(configDir: string, config: unknown): Promise<void> {
  await writeFile(join(configDir, 'opencode.json'), JSON.stringify(config, null, 2), 'utf-8');
}

async function collectLogs(
  configDir: string,
  options: AutoUpdateOptions = {}
): Promise<string[]> {
  const logs: string[] = [];
  await runAutoUpdate({ ...options, configDir, onLog: (message) => logs.push(message) });
  return logs;
}

async function collect(
  configDir: string,
  options: AutoUpdateOptions = {}
): Promise<{ logs: string[]; errors: string[] }> {
  const logs: string[] = [];
  const errors: string[] = [];
  await runAutoUpdate({
    ...options,
    configDir,
    onLog: (message) => logs.push(message),
    onError: (message) => errors.push(message),
  });
  return { logs, errors };
}

function isThrottled(logs: string[]): boolean {
  return logs.some((message) => message.includes('Throttled'));
}

describe('throttle state timing', () => {
  test('a successful run records lastRun at approximately now', async () => {
    const configDir = await makeConfigDir();
    await writeConfig(configDir, { plugin: ['./local-plugin'] });

    const before = Date.now();
    await collectLogs(configDir);
    const after = Date.now();

    const state = await readThrottleState({ configDir });
    expect(state.lastRun).toBeGreaterThanOrEqual(before);
    expect(state.lastRun).toBeLessThanOrEqual(after);
  });

  test('a second run within the interval is throttled', async () => {
    const configDir = await makeConfigDir();
    await writeConfig(configDir, { plugin: ['./local-plugin'] });

    await collectLogs(configDir);
    const state = await readThrottleState({ configDir });
    expect(state.lastRun).toBeGreaterThan(0);

    const logs = await collectLogs(configDir);
    expect(isThrottled(logs)).toBe(true);

    const reread = await readThrottleState({ configDir });
    expect(reread.lastRun).toBe(state.lastRun);
  });

  test('a crash in the update work does not poison the throttle window', async () => {
    const configDir = await makeConfigDir();
    await writeConfig(configDir, { plugin: [123] });

    const { logs, errors } = await collect(configDir);
    expect(errors.some((message) => message.includes('Failed to update'))).toBe(true);

    const state = await readThrottleState({ configDir });
    expect(state.lastRun).toBeUndefined();

    const second = await collect(configDir);
    expect(isThrottled(second.logs)).toBe(false);
    expect(second.errors.some((message) => message.includes('Failed to update'))).toBe(true);
  });

  test('a config with no plugins records lastRun and throttles the next run', async () => {
    const configDir = await makeConfigDir();
    await writeConfig(configDir, { });

    const logs = await collectLogs(configDir);
    expect(logs.some((message) => message.includes('No plugins found'))).toBe(true);

    const state = await readThrottleState({ configDir });
    expect(state.lastRun).toBeGreaterThan(0);

    const second = await collectLogs(configDir);
    expect(isThrottled(second)).toBe(true);
  });
});
