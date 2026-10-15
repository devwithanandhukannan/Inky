/**
 * Host matching and resolution logic.
 * Fast O(1) hash lookup with domain hierarchy fallback.
 */

/**
 * Normalizes a URL or hostname to a clean hostname string.
 * @param {string} input
 * @returns {string}
 */
export function normalizeHost(input) {
  if (!input || typeof input !== 'string') return '';
  let str = input.trim().toLowerCase();

  // Strip protocol
  const protoIndex = str.indexOf('://');
  if (protoIndex !== -1) {
    str = str.slice(protoIndex + 3);
  }

  // Strip auth/userinfo if present
  const atIndex = str.indexOf('@');
  if (atIndex !== -1) {
    str = str.slice(atIndex + 1);
  }

  // Strip path and query/hash
  const slashIndex = str.indexOf('/');
  if (slashIndex !== -1) {
    str = str.slice(0, slashIndex);
  }
  const queryIndex = str.indexOf('?');
  if (queryIndex !== -1) {
    str = str.slice(0, queryIndex);
  }

  // Strip port
  const colonIndex = str.indexOf(':');
  if (colonIndex !== -1) {
    str = str.slice(0, colonIndex);
  }

  return str;
}

/**
 * Generates hierarchy candidates for a host, e.g.:
 * 'a.b.example.com' -> ['a.b.example.com', 'b.example.com', 'example.com']
 * Max depth ~4 steps.
 * @param {string} host
 * @returns {string[]}
 */
export function getHostCandidates(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return [];

  // Don't split IP addresses or localhost
  if (normalized === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(normalized)) {
    return [normalized];
  }

  const parts = normalized.split('.');
  const candidates = [];

  // We keep at least 2 parts (e.g. 'example.com')
  for (let i = 0; i <= parts.length - 2 && i < 4; i++) {
    candidates.push(parts.slice(i).join('.'));
  }

  return candidates.length > 0 ? candidates : [normalized];
}

/**
 * Resolves whether dark mode is enabled for a given host according to site rules and global setting.
 * @param {string} host
 * @param {Record<string, boolean>} sites Map of host -> boolean override
 * @param {boolean} globalEnabled
 * @returns {boolean}
 */
export function resolve(host, sites = {}, globalEnabled = true) {
  const candidates = getHostCandidates(host);
  for (const candidate of candidates) {
    if (sites && Object.prototype.hasOwnProperty.call(sites, candidate) && sites[candidate] !== undefined) {
      return Boolean(sites[candidate]);
    }
  }
  return Boolean(globalEnabled);
}
