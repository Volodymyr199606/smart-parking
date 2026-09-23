/** Shared DataSF GET policy. No environment, Supabase, or import-time work. */
const MAX_ATTEMPTS = 5;
const MAX_RETRY_AFTER_MS = 60_000;
const RETRYABLE_HTTP = new Set([425, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

interface Dependencies {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  // Raw archive callers supply a byte reader; existing JSON callers keep their behavior.
  readBody: (response: Response) => Promise<unknown>;
}

function transientNetworkCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  for (const candidate of [error, error.cause]) {
    if (candidate && typeof candidate === "object" && "code" in candidate) {
      const code = candidate.code;
      if (typeof code === "string" && RETRYABLE_NETWORK.has(code)) return code;
    }
  }
  return null;
}

function retryAfterMs(header: string | null, now: () => number): number | null {
  if (!header?.trim()) return null;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  // Reject invalid numeric delays rather than interpreting them as dates.
  if (!Number.isNaN(Number(value))) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now()) : null;
}

export async function fetchDataSfJson(
  url: string,
  log: (message: string) => void,
  dependencies: Partial<Dependencies> = {}
): Promise<unknown> {
  const fetch = dependencies.fetch ?? globalThis.fetch;
  const sleep = dependencies.sleep ?? ((ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = dependencies.now ?? Date.now;
  const parsed = new URL(url);
  const dataset = parsed.pathname.split("/").pop()?.replace(/\.json$/, "");
  const context = `DataSF ${dataset} offset=${parsed.searchParams.get("$offset") ?? "n/a"}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let failure: unknown;
    let reason: string;
    let retryAfter: number | null = null;
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      // Body transport failures can be transient; malformed JSON is not.
      if (response.ok) return await (dependencies.readBody ? dependencies.readBody(response) : response.json());
      const body = await response.text().catch(() => "");
      failure = new Error(`${context} HTTP ${response.status}: ${body.slice(0, 200)}`);
      if (!RETRYABLE_HTTP.has(response.status) || attempt === MAX_ATTEMPTS) {
        throw failure;
      }
      reason = `HTTP ${response.status}`;
      retryAfter = retryAfterMs(response.headers.get("Retry-After"), now);
    } catch (error) {
      const code = transientNetworkCode(error);
      if (!code || attempt === MAX_ATTEMPTS) throw error;
      failure = error;
      reason = `network ${code}`;
    }

    // Deterministic exponential backoff: 1, 2, 4, 8 s (four retries maximum).
    // Retry-After is a minimum; stop instead of retrying early if impractical.
    if (retryAfter !== null && retryAfter > MAX_RETRY_AFTER_MS) {
      log(`${context} ${reason}; Retry-After exceeds ${MAX_RETRY_AFTER_MS}ms; stopping`);
      throw failure;
    }
    const delay = Math.max(1000 * 2 ** (attempt - 1), retryAfter ?? 0);
    log(`transient ${context} ${reason}; retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delay}ms`);
    await sleep(delay);
  }
  throw new Error(`${context}: retry loop exhausted`); // Unreachable: final failure throws above.
}
