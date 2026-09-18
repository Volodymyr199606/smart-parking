/** Offline verification: injected fetch, sleep, and clock; no ingest imports. */
import assert from "node:assert/strict";
import { fetchDataSfJson } from "./fetch-datasf-json";

const URL = "https://data.sfgov.org/resource/hi6h-neyh.json?$offset=4000&$limit=1000";
const NOW = Date.parse("2026-09-18T00:00:00Z");
let cases = 0;

function harness(reply: (attempt: number) => Response | Promise<Response>) {
  let calls = 0;
  const delays: number[] = [];
  const logs: string[] = [];
  const run = () => fetchDataSfJson(URL, (message) => logs.push(message), {
    fetch: async (input, init) => {
      assert.equal(input, URL, "retry must preserve the full page URL");
      assert.deepEqual(init, { headers: { Accept: "application/json" } });
      return reply(++calls);
    },
    sleep: async (ms) => { delays.push(ms); },
    now: () => NOW,
  });
  return { run, delays, logs, calls: () => calls };
}

function success(): Response {
  return new Response('[{"objectid":"123"}]');
}

function networkError(code: string): Error {
  return new TypeError("fetch failed", { cause: Object.assign(new Error("transport"), { code }) });
}

async function main(): Promise<void> {
  for (const status of [425, 429, 500, 502, 503, 504]) {
    const test = harness((attempt) => attempt === 1
      ? new Response("transient response body", { status }) : success());
    assert.deepEqual(await test.run(), [{ objectid: "123" }]);
    assert.equal(test.calls(), 2);
    assert.deepEqual(test.delays, [1000]);
    assert.equal(test.logs.length, 1);
    assert.match(test.logs[0], new RegExp(`hi6h-neyh offset=4000 HTTP ${status}; retry 1/4 in 1000ms`));
    assert(!test.logs[0].includes("transient response body"));
    cases += 1;
  }

  const exhausted = harness((attempt) => new Response(`failure ${attempt}`, { status: 425 }));
  await assert.rejects(exhausted.run(), /DataSF hi6h-neyh offset=4000 HTTP 425: failure 5/);
  assert.equal(exhausted.calls(), 5);
  assert.deepEqual(exhausted.delays, [1000, 2000, 4000, 8000]);
  assert.equal(exhausted.logs.length, 4, "no retry log or sleep after final attempt");
  cases += 1;

  for (const status of [400, 401, 403, 404, 501, 505]) {
    const test = harness(() => new Response("permanent error", { status }));
    await assert.rejects(test.run(), new RegExp(`HTTP ${status}: permanent error`));
    assert.equal(test.calls(), 1);
    assert.deepEqual(test.delays, []);
    assert.deepEqual(test.logs, []);
    cases += 1;
  }

  const immediate = harness(success);
  await immediate.run();
  assert.equal(immediate.calls(), 1);
  assert.deepEqual(immediate.delays, []);
  assert.deepEqual(immediate.logs, []);
  cases += 1;

  for (const [header, delay] of [
    ["7", 7000],
    [new Date(NOW + 12_000).toUTCString(), 12_000],
    ["60", 60_000],
    ["0", 1000],
    [new Date(NOW - 1000).toUTCString(), 1000],
    ["not a date", 1000],
    ["-1", 1000],
    ["1.5", 1000],
  ] as const) {
    const test = harness((attempt) => attempt === 1
      ? new Response("busy", { status: 429, headers: { "Retry-After": header } }) : success());
    await test.run();
    assert.deepEqual(test.delays, [delay]);
    cases += 1;
  }

  const tooLong = harness(() => new Response("come back later", {
    status: 503, headers: { "Retry-After": "61" },
  }));
  await assert.rejects(tooLong.run(), /HTTP 503: come back later/);
  assert.equal(tooLong.calls(), 1);
  assert.deepEqual(tooLong.delays, []);
  assert.match(tooLong.logs[0], /Retry-After exceeds 60000ms; stopping/);
  cases += 1;

  for (const code of ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"]) {
    const error = networkError(code);
    const test = harness((attempt) => { if (attempt === 1) throw error; return success(); });
    await test.run();
    assert.equal(test.calls(), 2);
    assert.deepEqual(test.delays, [1000]);
    assert.match(test.logs[0], new RegExp(`offset=4000 network ${code}`));
    cases += 1;
  }

  const original = networkError("ECONNRESET");
  const networkExhausted = harness(() => { throw original; });
  await assert.rejects(networkExhausted.run(), (error) => error === original);
  assert.equal(networkExhausted.calls(), 5);
  assert.deepEqual(networkExhausted.delays, [1000, 2000, 4000, 8000]);
  cases += 1;

  for (const error of [new TypeError("programming error"), new SyntaxError("data error"),
    new DOMException("cancelled", "AbortError"), networkError("ENOTFOUND"),
    networkError("ECONNREFUSED"), networkError("CERT_HAS_EXPIRED")]) {
    const test = harness(() => { throw error; });
    await assert.rejects(test.run(), (actual) => actual === error);
    assert.equal(test.calls(), 1);
    assert.deepEqual(test.delays, []);
    cases += 1;
  }

  const malformed = harness(() => new Response("not JSON"));
  await assert.rejects(malformed.run(), SyntaxError);
  assert.equal(malformed.calls(), 1);
  assert.deepEqual(malformed.delays, []);
  cases += 1;

  const bodyFailure = harness((attempt) => attempt === 1
    ? Object.assign(success(), { json: async () => { throw networkError("UND_ERR_SOCKET"); } })
    : success());
  await bodyFailure.run();
  assert.equal(bodyFailure.calls(), 2);
  assert.deepEqual(bodyFailure.delays, [1000]);
  cases += 1;

  const eventually = harness((attempt) => attempt < 5
    ? new Response("busy", { status: 503 }) : success());
  await eventually.run();
  assert.equal(eventually.calls(), 5);
  assert.deepEqual(eventually.delays, [1000, 2000, 4000, 8000]);
  cases += 1;

  console.log(`[verify] DataSF retry: ${cases} cases passed (mock fetch/sleep only; no network or database).`);
}

main().catch((error) => {
  console.error("[verify] FAIL:", error);
  process.exitCode = 1;
});
