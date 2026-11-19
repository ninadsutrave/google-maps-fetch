export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ClientOptions {
  /** Google Maps Platform API key */
  key: string
  /** Defaults to the global fetch */
  fetch?: FetchLike
  /** Milliseconds before a single attempt is abandoned. Default 10000 */
  timeout?: number
  /** Extra attempts after a network error, timeout, 429 or 5xx. Default 2 */
  retries?: number
  /** Sent with every request */
  headers?: Record<string, string>
}

export interface CallOptions {
  signal?: AbortSignal
  /** Overrides the client's timeout for this call */
  timeout?: number
}

export interface FieldOptions extends CallOptions {
  /** Field mask: which fields Google returns, and so which billing tier you pay for */
  fields?: string | string[]
}

export class MapsError extends Error {
  override name = 'MapsError'
  constructor(
    message: string,
    /** HTTP status, or 0 when no response arrived */
    readonly status: number,
    /** Google's error status, e.g. INVALID_ARGUMENT or REQUEST_DENIED, or TIMEOUT / NETWORK_ERROR */
    readonly code: string,
    /** The response body, if there was one */
    readonly body?: unknown,
  ) {
    super(message)
  }

  /** Same shape as an axios error's response, for code written against axios-based clients */
  get response(): { status: number; data: unknown } | undefined {
    return this.status ? { status: this.status, data: this.body } : undefined
  }
}

export interface Request {
  method: 'GET' | 'POST'
  url: string
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  fields?: string | string[]
  /** v1 APIs take the key in a header; the older JSON APIs take it in the query string */
  keyIn?: 'header' | 'query'
}

export type Send = <T>(request: Request, call?: CallOptions) => Promise<T>

const retryable = new Set([429, 500, 502, 503, 504])

// gRPC status names Google returns in error.status, by HTTP code, for bodies that don't carry one
const httpCodes: Record<number, string> = {
  400: 'INVALID_ARGUMENT',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  429: 'RESOURCE_EXHAUSTED',
  500: 'INTERNAL',
  503: 'UNAVAILABLE',
  504: 'DEADLINE_EXCEEDED',
}

export const fieldMask = (fields: string | string[]) => (Array.isArray(fields) ? fields.join(',') : fields)

export const withQuery = (url: string, query: Request['query'] = {}) => {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v))
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })

// 250ms, 500ms, 1s... with a little jitter so parallel callers don't retry in step
const backoff = (attempt: number) => 250 * 2 ** attempt + Math.random() * 100

export function createTransport({ key, fetch: f = globalThis.fetch, timeout = 10_000, retries = 2, headers = {} }: ClientOptions): Send {
  if (!key) throw new Error('google-maps-fetch: an API key is required')
  if (typeof f !== 'function') throw new Error('google-maps-fetch: no fetch available; pass one with the fetch option')

  return async function send<T>(request: Request, call: CallOptions = {}): Promise<T> {
    const { method, body, fields, keyIn = 'header' } = request
    const url = withQuery(request.url, keyIn === 'query' ? { ...request.query, key } : request.query)
    const requestHeaders: Record<string, string> = { ...headers }
    if (keyIn === 'header') requestHeaders['X-Goog-Api-Key'] = key
    if (fields !== undefined) requestHeaders['X-Goog-FieldMask'] = fieldMask(fields)
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json'
    const ms = call.timeout ?? timeout

    for (let attempt = 0; ; attempt++) {
      if (call.signal?.aborted) throw call.signal.reason
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, ms)
      const onAbort = () => controller.abort()
      call.signal?.addEventListener('abort', onAbort, { once: true })

      let error: MapsError
      try {
        const res = await f(url, {
          method,
          headers: requestHeaders,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        })
        const text = await res.text()
        const data = text ? parse(text) : undefined
        if (res.ok) return data as T
        const e = (data as { error?: { message?: string; status?: string } } | undefined)?.error
        error = new MapsError(e?.message ?? `HTTP ${res.status}`, res.status, e?.status ?? httpCodes[res.status] ?? 'UNKNOWN', data)
        if (!retryable.has(res.status)) throw error
      } catch (e) {
        if (e instanceof MapsError) throw e
        // the caller cancelled: don't retry, rethrow their reason
        if (call.signal?.aborted) throw call.signal.reason
        error = timedOut
          ? new MapsError(`google-maps-fetch: no response within ${ms}ms`, 0, 'TIMEOUT')
          : new MapsError(`google-maps-fetch: ${(e as Error)?.message ?? 'network error'}`, 0, 'NETWORK_ERROR', e)
      } finally {
        clearTimeout(timer)
        call.signal?.removeEventListener('abort', onAbort)
      }
      if (attempt >= retries) throw error
      await wait(backoff(attempt), call.signal)
    }
  }
}
