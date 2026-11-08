import { test, describe, expect, afterAll } from 'bun:test';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendCircularLog,
  readCircularLog,
  formatLogEntry,
} from '../src/utils/circular-log.js';

const createdDirs: string[] = [];
afterAll(async () => {
  for (const dir of createdDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeLogPath(): Promise<string> {
  const dir = join(
    tmpdir(),
    `circular-log-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  createdDirs.push(dir);
  return join(dir, '.auto-update-history.json');
}

function makeEntry(index: number) {
  return formatLogEntry([`plugin-${index}`], [], 1, true);
}

describe('circular log', () => {
  test('appendCircularLog creates the parent directory and writes the entry', async () => {
    const logPath = await makeLogPath();

    await appendCircularLog(logPath, makeEntry(1));

    const log = await readCircularLog(logPath);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].pluginsUpdated).toEqual(['plugin-1']);
  });

  test('circular log keeps at most MAX_ENTRIES (5) entries', async () => {
    const logPath = await makeLogPath();

    for (let i = 0; i < 8; i += 1) {
      await appendCircularLog(logPath, makeEntry(i));
    }

    const log = await readCircularLog(logPath);
    expect(log.entries).toHaveLength(5);
    expect(log.entries[0].pluginsUpdated).toEqual(['plugin-3']);
    expect(log.entries[4].pluginsUpdated).toEqual(['plugin-7']);
  });

  test('readCircularLog returns an empty log for a non-existent path', async () => {
    const logPath = join(
      tmpdir(),
      `circular-log-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      '.auto-update-history.json'
    );

    const log = await readCircularLog(logPath);
    expect(log).toEqual({ entries: [] });
  });
});
