// Only platform-aware layer: file bytes in/out via the Tauri fs plugin.
// On Android the plugin transparently handles content:// URIs returned by
// the system file picker, so callers never branch on platform.
import { readFile, writeFile } from "@tauri-apps/plugin-fs";

export async function readFileBytes(path: string): Promise<Uint8Array> {
  return readFile(path);
}

export async function writeFileBytes(
  path: string,
  bytes: Uint8Array
): Promise<void> {
  await writeFile(path, bytes);
}

export function baseName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}
