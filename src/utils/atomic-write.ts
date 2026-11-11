import { rename, unlink, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Write `contents` to `target` atomically.
 *
 * Writes to a sibling temp file first, then `rename`s it into place. Because
 * `rename` is atomic on POSIX filesystems, a concurrent reader never observes a
 * half-written or truncated target — it sees either the old contents or the new
 * one. The temp file lives in the same directory as the target so the rename
 * stays on one filesystem (an atomic operation).
 */
export async function writeAtomic(target: string, contents: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const tempPath = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, contents, 'utf-8');
    await rename(tempPath, target);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
