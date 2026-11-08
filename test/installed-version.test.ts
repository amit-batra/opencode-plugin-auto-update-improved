import { test, describe, expect, afterAll } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readInstalledVersion } from '../src/update.js';

const createdDirs: string[] = [];
afterAll(async () => {
  for (const dir of createdDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeConfigDir(): Promise<string> {
  const dir = join(tmpdir(), `installed-version-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

async function writePackageJson(configDir: string, name: string, version: string): Promise<void> {
  const parts = name.startsWith('@') ? name.split('/') : [name];
  const packageDir = join(configDir, 'node_modules', ...parts);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({ name, version }, null, 2),
    'utf-8',
  );
}

describe('readInstalledVersion', () => {
  test('reads the version of an unscoped package', async () => {
    const configDir = await makeConfigDir();
    await writePackageJson(configDir, 'some-plugin', '1.2.3');

    const version = await readInstalledVersion('some-plugin', configDir);
    expect(version).toBe('1.2.3');
  });

  test('reads the version of a scoped package', async () => {
    const configDir = await makeConfigDir();
    await writePackageJson(configDir, '@scope/plugin', '4.5.6');

    const version = await readInstalledVersion('@scope/plugin', configDir);
    expect(version).toBe('4.5.6');
  });

  test('returns null when the package is not installed', async () => {
    const configDir = await makeConfigDir();

    const version = await readInstalledVersion('missing-plugin', configDir);
    expect(version).toBeNull();
  });

  test('returns null when a scoped package is not installed', async () => {
    const configDir = await makeConfigDir();

    const version = await readInstalledVersion('@scope/missing', configDir);
    expect(version).toBeNull();
  });
});
