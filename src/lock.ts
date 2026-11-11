/**
 * Lock and throttle utilities for auto-update operations
 * 
 * Provides file-based locking mechanism with stale lock detection
 * and JSON-based throttle state management.
 */

import { open, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'opencode');
const STALE_LOCK_MS = 2 * 60 * 60 * 1000; // 2 hours
const ACQUIRE_MAX_ATTEMPTS = 3;
const ACQUIRE_RETRY_DELAY_MS = 25;

export interface LockData {
  pid: number;
  timestamp: number;
}

export interface ThrottleState {
  lastRun?: number;
}

interface LockPaths {
  configDir: string;
  lockFile: string;
  throttleFile: string;
}

function resolvePaths(configDir?: string): LockPaths {
  const resolvedConfigDir = configDir ?? DEFAULT_CONFIG_DIR;
  return {
    configDir: resolvedConfigDir,
    lockFile: join(resolvedConfigDir, '.auto-update.lock'),
    throttleFile: join(resolvedConfigDir, '.auto-update.json'),
  };
}

/**
 * Compute whether an already-parsed lock is stale (older than 2 hours).
 *
 * Pure helper: no IO, so callers that have already read the lock file can
 * reuse the same data instead of re-reading (avoids a TOCTOU window).
 */
export function isStaleLockData(lockData: LockData, now: number = Date.now()): boolean {
  const age = now - lockData.timestamp;
  return age > STALE_LOCK_MS;
}

/**
 * Check if a lock file is stale (older than 2 hours)
 */
export async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const content = await readFile(lockPath, 'utf-8');
    const lockData: LockData = JSON.parse(content);
    return isStaleLockData(lockData);
  } catch (error) {
    // If file doesn't exist or can't be read, it's not stale
    return false;
  }
}

/**
 * Acquire a lock for auto-update operations
 * 
 * @param options - Lock options
 * @param options.force - Force acquire even if lock exists but is stale
 * @param options.debug - Enable debug logging
 * @returns true if lock was acquired, false otherwise
 */
export async function acquireLock(options: {
  force?: boolean;
  debug?: boolean;
  configDir?: string;
} = {}): Promise<boolean> {
  const { force = false, debug = false, configDir } = options;
  const { configDir: resolvedConfigDir, lockFile } = resolvePaths(configDir);

  try {
    // Ensure config directory exists
    await mkdir(resolvedConfigDir, { recursive: true });

    for (let attempt = 0; attempt < ACQUIRE_MAX_ATTEMPTS; attempt += 1) {
      try {
        // Exclusive-create the lock file atomically. 'wx' fails with EEXIST if
        // another run created it first, so only one concurrent run can win.
        const handle = await open(lockFile, 'wx');
        await handle.write(
          JSON.stringify(
            { pid: process.pid, timestamp: Date.now() } satisfies LockData,
            null,
            2
          )
        );
        await handle.close();

        if (debug) {
          console.log(`[lock] Lock acquired by pid ${process.pid}`);
        }
        return true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') {
          if (debug) {
            console.error('[lock] Failed to acquire lock:', error);
          }
          return false;
        }

        // Another run created the lock. Decide whether to respect it.
        const existingLock = await readLockData(lockFile);
        if (!existingLock) {
          // The file exists but does not parse as a lock. A valid lock always
          // parses, so a persistently unparseable file is not a live lock. Back
          // off on early attempts in case a concurrent writer is mid-write, but
          // on the final attempt reclaim it so a corrupt/0-byte lock can never
          // wedge auto-updates permanently.
          if (attempt + 1 < ACQUIRE_MAX_ATTEMPTS) {
            if (debug) {
              console.log('[lock] Lock file partially written, retrying');
            }
            await delay(ACQUIRE_RETRY_DELAY_MS);
            continue;
          }
          if (debug) {
            console.log('[lock] Lock file is corrupt, reclaiming');
          }
          await reclaimLock(lockFile, debug);
          return true;
        }

        const stale = isStaleLockData(existingLock);

        if (stale && force) {
          if (debug) {
            console.log(`[lock] Stale lock detected (pid: ${existingLock.pid}), forcing acquisition`);
          }
          await reclaimLock(lockFile, debug);
          return true;
        }

        if (debug) {
          if (stale) {
            console.log(`[lock] Stale lock exists but force=false`);
          } else {
            console.log(`[lock] Lock already held by pid ${existingLock.pid}`);
          }
        }
        return false;
      }
    }

    if (debug) {
      console.error('[lock] Failed to acquire lock after retries');
    }
    return false;
  } catch (error) {
    if (debug) {
      console.error('[lock] Failed to acquire lock:', error);
    }
    return false;
  }
}

async function readLockData(lockPath: string): Promise<LockData | null> {
  try {
    const content = await readFile(lockPath, 'utf-8');
    return JSON.parse(content) as LockData;
  } catch {
    return null;
  }
}

/**
 * Reclaim a lock that is corrupt (unparseable) or stale-and-forced by
 * atomically replacing it with a fresh one. Removes the existing file first,
 * then exclusive-creates a new lock; a concurrent winner is detected via EEXIST.
 */
async function reclaimLock(lockPath: string, debug: boolean): Promise<void> {
  try {
    await unlink(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  const handle = await open(lockPath, 'wx');
  await handle.write(
    JSON.stringify(
      { pid: process.pid, timestamp: Date.now() } satisfies LockData,
      null,
      2
    )
  );
  await handle.close();
  if (debug) {
    console.log(`[lock] Lock reclaimed by pid ${process.pid}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Release the lock file
 * 
 * @param options - Release options
 * @param options.debug - Enable debug logging
 */
export async function releaseLock(options: {
  debug?: boolean;
  configDir?: string;
} = {}): Promise<void> {
  const { debug = false, configDir } = options;
  const { lockFile } = resolvePaths(configDir);

  try {
    await unlink(lockFile);
    if (debug) {
      console.log(`[lock] Lock released by pid ${process.pid}`);
    }
  } catch (error) {
    // Ignore errors if lock file doesn't exist
    if (debug && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[lock] Failed to release lock:', error);
    }
  }
}

/**
 * Read the throttle state from disk
 * 
 * @returns The throttle state object, or an empty object if file doesn't exist
 */
export async function readThrottleState(options: {
  configDir?: string;
} = {}): Promise<ThrottleState> {
  const { configDir } = options;
  const { throttleFile } = resolvePaths(configDir);
  try {
    const data = await readFile(throttleFile, 'utf-8');
    return JSON.parse(data) as ThrottleState;
  } catch (error) {
    // Return empty state if file doesn't exist or is invalid
    return {};
  }
}

/**
 * Write the throttle state to disk
 * 
 * @param state - The throttle state to persist
 * @param options - Write options
 * @param options.debug - Enable debug logging
 */
export async function writeThrottleState(
  state: ThrottleState,
  options: { debug?: boolean; configDir?: string } = {}
): Promise<void> {
  const { debug = false, configDir } = options;
  const { configDir: resolvedConfigDir, throttleFile } = resolvePaths(configDir);

  try {
    // Ensure config directory exists
    await mkdir(resolvedConfigDir, { recursive: true });

    await writeFile(throttleFile, JSON.stringify(state, null, 2), 'utf-8');
    
    if (debug) {
      console.log('[throttle] State written:', state);
    }
  } catch (error) {
    if (debug) {
      console.error('[throttle] Failed to write state:', error);
    }
    throw error;
  }
}
