/** Exact decimal values, not IEEE-754 numbers. No dependency or implicit coercion. */
export class LosslessJsonNumber {
  readonly #digits: string;
  readonly #scale: bigint;
  readonly #negative: boolean;
  private constructor(token: string) {
    if (token.length > 8192) throw new Error("JSON number token exceeds 8192 characters");
    const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?/.exec(token);
    if (!match || match[0] !== token) throw new Error("Invalid JSON number token");
    const exponent = BigInt(match[4] ?? "0");
    if (exponent < -1_000_000n || exponent > 1_000_000n) throw new Error("JSON decimal exponent exceeds bound");
    const fraction = match[3] ?? "";
    let digits = (match[2] + fraction).replace(/^0+/, "");
    let scale = exponent - BigInt(fraction.length);
    if (!digits) { digits = "0"; scale = 0n; }
    else { const trimmed = digits.replace(/0+$/, ""); scale += BigInt(digits.length - trimmed.length); digits = trimmed; }
    if (digits.length > 4096) throw new Error("JSON number exceeds 4096 significant digits");
    const order = BigInt(digits.length - 1) + scale;
    if (order < -1_000_000n || order > 1_000_000n) throw new Error("Normalized decimal exponent exceeds bound");
    this.#digits = digits; this.#scale = scale; this.#negative = match[1] === "-" && digits !== "0";
    Object.freeze(this);
  }
  static fromToken(token: string): LosslessJsonNumber { return new LosslessJsonNumber(token); }
  get canonical(): string {
    const digits = this.#digits;
    if (digits === "0") return "0";
    const order = BigInt(digits.length - 1) + this.#scale;
    let magnitude: string;
    if (order >= -6n && order <= 20n) {
      // Conversion is a bounded string index (-5..21), never the source value.
      const point = Number(order + 1n);
      magnitude = point <= 0 ? "0." + "0".repeat(-point) + digits :
        point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point);
    } else magnitude = digits[0] + (digits.length > 1 ? "." + digits.slice(1) : "") + "e" + order.toString();
    return (this.#negative ? "-" : "") + magnitude;
  }
  compare(other: LosslessJsonNumber): number {
    if (this.#negative !== other.#negative) return this.#negative ? -1 : 1;
    let result: number;
    if (this.#digits === "0" || other.#digits === "0") result = this.#digits === other.#digits ? 0 : this.#digits === "0" ? -1 : 1;
    else {
      const aOrder = BigInt(this.#digits.length) + this.#scale, bOrder = BigInt(other.#digits.length) + other.#scale;
      if (aOrder !== bOrder) result = aOrder < bOrder ? -1 : 1;
      else {
        const width = Math.max(this.#digits.length, other.#digits.length);
        const a = this.#digits.padEnd(width, "0"), b = other.#digits.padEnd(width, "0");
        result = a === b ? 0 : a < b ? -1 : 1;
      }
    }
    return this.#negative ? -result : result;
  }
  /** Only derived/control integers may cross this exact checked boundary. */
  toSafeInteger(): number {
    const result = Number(this.canonical);
    if (!Number.isSafeInteger(result) || this.compare(LosslessJsonNumber.fromToken(String(result))) !== 0) throw new Error("Not an exact safe control integer");
    return result;
  }
  [Symbol.toPrimitive](): never { throw new Error("Implicit decimal conversion forbidden"); }
  toJSON(): never { throw new Error("Use canonicalJson; native JSON.stringify of source decimals is forbidden"); }
}

/** Approximate, diagnostic math ONLY. Never feed this result back into source hashes. */
export function toDiagnosticNumber(value: LosslessJsonNumber): number {
  const result = Number(value.canonical);
  if (!Number.isFinite(result) || (result === 0 && value.canonical !== "0")) throw new Error("Diagnostic numeric range exceeded");
  return result;
}
