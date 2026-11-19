import { vi } from 'vitest'

export interface Call {
  url: string
  method: string
  headers: Record<string, string>
  // tests read nested request fields freely
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any
  signal?: AbortSignal
}

export type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | Error

/** A fetch that records each request and answers with whatever the handler returns */
export function mockFetch(handler: (call: Call, index: number) => Reply | Promise<Reply> = () => ({ body: {} })) {
  const calls: Call[] = []
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      signal: init.signal ?? undefined,
    }
    calls.push(call)
    const reply = await handler(call, calls.length - 1)
    if (reply instanceof Error) throw reply
    const body = reply.body === undefined ? '' : typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body)
    return new Response(body, { status: reply.status ?? 200, headers: reply.headers })
  })
  return { fetch, calls }
}

/** A handler that never answers until the request is aborted */
export const hang = (call: Call) =>
  new Promise<Reply>((_, reject) => {
    call.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
  })

export const query = (url: string) => Object.fromEntries(new URL(url).searchParams)

export const googleError = (code: number, status: string, message: string) => ({ status: code, body: { error: { code, message, status } } })
