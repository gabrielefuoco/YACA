export function encodeConfig(config: object): string {
  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/**
 * Decodes a config string from either:
 * - 'c1' prefix (zlib deflate + base64url, used by the server UserConfig)
 * - Standard base64 (legacy format)
 * Returns null if decoding fails.
 *
 * Note: The 'c1' format requires the DecompressionStream API (Chrome 80+, Firefox 113+,
 * Safari 16.4+). This mirrors the same requirement in the original vanilla HTML frontend.
 */
export async function decodeConfigAsync(base64: string): Promise<object | null> {
  try {
    if (base64.startsWith('c1')) {
      // Server format: 'c1' + base64url + zlib deflate
      const b64 = base64.slice(2).replace(/-/g, '+').replace(/_/g, '/');
      const binString = atob(b64);
      const bytes = Uint8Array.from(binString, (c) => c.charCodeAt(0));
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const arrayBuffer = await new Response(ds.readable).arrayBuffer();
      return JSON.parse(new TextDecoder().decode(arrayBuffer));
    } else {
      // Legacy: standard base64 or base64url
      const b64 = base64.replace(/-/g, '+').replace(/_/g, '/');
      const binString = atob(b64);
      const bytes = new Uint8Array(binString.length);
      for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    }
  } catch {
    return null;
  }
}

/** Synchronous decode for legacy base64 configs (not 'c1' format). Returns null on error. */
export function decodeConfig(base64: string): object | null {
  if (base64.startsWith('c1')) return null; // Must use decodeConfigAsync for compressed format
  try {
    const b64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}
