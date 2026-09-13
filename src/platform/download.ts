/**
 * Handing a file to the user.
 *
 * An object URL and a synthetic click is the only route that works in an
 * installed PWA with no server behind it. The URL is revoked on the next tick,
 * once the browser has taken the blob.
 */
export function downloadFile(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Read a file the user picked. */
export function readTextFile(file: File): Promise<string> {
  return file.text();
}
