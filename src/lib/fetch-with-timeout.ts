export class RequestTimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "RequestTimeoutError";
  }
}

/** fetch() that also aborts after `timeoutMs`, honoring an outer abort signal. */
export async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: string | URL,
  init: RequestInit & { signal?: AbortSignal },
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const outer = init.signal;
  const forwardAbort = () => controller.abort();
  outer?.addEventListener("abort", forwardAbort, { once: true });
  try {
    if (outer?.aborted) controller.abort();
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", forwardAbort);
  }
}
