/** Extract a user-facing message from unknown thrown/rejected values. */
export function getErrorMessage(
  err: unknown,
  fallback = "Something went wrong."
): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}
