import { afterEach, describe, expect, it, vi } from 'vitest'
import fetch from './fetch'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': `application/json`, ...init?.headers },
  })
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)))
  vi.stubGlobal(`fetch`, mock)
  return mock
}

describe(`fetch utils`, () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it(`parses application/json responses`, async () => {
    stubFetch(() => jsonResponse({ url: `https://example.com/a.png` }))

    const res = await fetch<any, { url: string }>(`https://api.example.com/upload`, { method: `POST` })
    expect(res.url).toBe(`https://example.com/a.png`)
  })

  // Regression test for doocs/md#1877: WeChat media/uploadimg answers a JSON
  // body with Content-Type text/plain, which must still be parsed as JSON
  it(`parses JSON bodies returned with a text/plain Content-Type`, async () => {
    stubFetch(() => new Response(JSON.stringify({ url: `https://mmbiz.qpic.cn/pic` }), {
      status: 200,
      headers: { 'content-type': `text/plain` },
    }))

    const res = await fetch<any, { url: string }>(`https://api.weixin.qq.com/cgi-bin/media/uploadimg`, { method: `POST` })
    expect(res.url).toBe(`https://mmbiz.qpic.cn/pic`)
  })

  it(`returns non-JSON text bodies as strings`, async () => {
    stubFetch(() => new Response(`plain text`, {
      status: 200,
      headers: { 'content-type': `text/plain` },
    }))

    const res = await fetch(`https://api.example.com/raw`)
    expect(res).toBe(`plain text`)
  })

  it(`keeps malformed JSON-looking text as a string`, async () => {
    stubFetch(() => new Response(`{broken`, {
      status: 200,
      headers: { 'content-type': `text/plain` },
    }))

    const res = await fetch(`https://api.example.com/raw`)
    expect(res).toBe(`{broken`)
  })

  it(`rejects on empty response bodies`, async () => {
    stubFetch(() => new Response(``, {
      status: 200,
      headers: { 'content-type': `text/plain` },
    }))

    await expect(fetch(`https://api.example.com/empty`)).rejects.toThrow(`Empty response`)
  })

  it(`rejects with the status code on non-OK responses`, async () => {
    stubFetch(() => jsonResponse({ errcode: 40013 }, { status: 401 }))

    await expect(fetch(`https://api.example.com/fail`)).rejects.toThrow(`Request failed with status 401`)
  })

  it(`serializes object bodies as JSON with a Content-Type header`, async () => {
    const mock = stubFetch(() => jsonResponse({ ok: true }))

    await fetch(`https://api.example.com/post`, { method: `POST`, data: { a: 1 } })

    const init = mock.mock.calls[0][1]
    expect(init?.body).toBe(JSON.stringify({ a: 1 }))
    expect((init?.headers as Record<string, string>)[`Content-Type`]).toBe(`application/json`)
  })

  it(`passes FormData bodies through without a manual Content-Type`, async () => {
    const mock = stubFetch(() => jsonResponse({ ok: true }))

    const form = new FormData()
    form.append(`media`, new Blob([`x`]), `a.png`)
    await fetch(`https://api.example.com/upload`, {
      method: `POST`,
      headers: { 'content-type': `multipart/form-data` },
      data: form,
    })

    const init = mock.mock.calls[0][1]
    expect(init?.body).toBe(form)
    expect((init?.headers as Record<string, string>)[`content-type`]).toBeUndefined()
  })
})

describe(`CreatorOS 独立请求预算`, () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([
    [`默认`, undefined, 120_000],
    [`null`, null, 120_000],
    [`零`, 0, 120_000],
    [`短值`, 30_000, 120_000],
    [`较长`, 180_000, 180_000],
    [`负数`, -1, 120_000],
    [`NaN`, Number.NaN, 120_000],
    [`Infinity`, Number.POSITIVE_INFINITY, 120_000],
    [`非数字`, `180000`, 120_000],
    [`超宿主单 timer 上界`, 2_147_483_647 + 120_000, 2_147_483_647 + 120_000],
  ] as const)(`%s 保完整出生预算与单请求`, async (_name, timeout, expectedMs) => {
    vi.useFakeTimers({ toFake: [`setTimeout`, `clearTimeout`, `performance`] })
    const config = { url: `http://127.0.0.1:1/owned-budget-unit` }
    Reflect.set(config, `timeout`, timeout)
    let receivedSignal: AbortSignal | null = null
    const readSignal = (): AbortSignal | null => receivedSignal
    const mock = stubFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal)
        throw new Error(`missing actual request signal`)
      receivedSignal = signal
      signal.addEventListener(`abort`, () => reject(new DOMException(`Aborted`, `AbortError`)), { once: true })
    }))
    const observed = fetch.request(config).then(value => ({ value, error: null }), error => ({ value: null, error }))
    await vi.advanceTimersByTimeAsync(expectedMs - 1)
    expect(readSignal()).not.toBeNull()
    expect(readSignal()!.aborted).toBe(false)
    expect(mock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    const settled = await observed
    expect(settled.error).toBeInstanceOf(DOMException)
    expect(settled.error?.name).toBe(`AbortError`)
    expect(readSignal()!.aborted).toBe(true)
    expect(mock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  }, 180_000)

  it(`响应头之后仍以同出生预算监督完整 body`, async () => {
    vi.useFakeTimers({ toFake: [`setTimeout`, `clearTimeout`, `performance`] })
    let actualSignal: AbortSignal | null = null
    const readBodySignal = (): AbortSignal | null => actualSignal
    const mock = stubFetch((_url, init) => {
      const signal = init?.signal
      if (!signal)
        throw new Error(`missing actual request signal`)
      actualSignal = signal
      const response = jsonResponse({ ok: true })
      vi.spyOn(response, `json`).mockImplementation(() => new Promise((_resolve, reject) => {
        signal.addEventListener(`abort`, () => reject(new DOMException(`Body aborted`, `AbortError`)), { once: true })
      }))
      return response
    })
    const observed = fetch.get(`http://127.0.0.1:1/owned-body-unit`).then(value => ({ value, error: null }), error => ({ value: null, error }))
    await vi.advanceTimersByTimeAsync(119_999)
    expect(readBodySignal()).not.toBeNull()
    expect(readBodySignal()!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((await observed).error?.name).toBe(`AbortError`)
    expect(mock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  }, 180_000)

  it.each([`成功`, `HTTP错误`, `空响应`, `body读取错误`])(`%s finally 清理最后 timer`, async (mode) => {
    vi.useFakeTimers({ toFake: [`setTimeout`, `clearTimeout`, `performance`] })
    const mock = stubFetch(() => {
      const response = mode === `空响应` ? new Response(``, { status: 200 }) : jsonResponse({ ok: true }, { status: mode === `HTTP错误` ? 503 : 200 })
      if (mode === `body读取错误`)
        vi.spyOn(response, `json`).mockRejectedValue(new Error(`owned body read failed`))
      return response
    })
    if (mode === `成功`)
      await expect(fetch.get(`http://127.0.0.1:1/owned-finally-unit`)).resolves.toEqual({ ok: true })
    else
      await expect(fetch.get(`http://127.0.0.1:1/owned-finally-unit`)).rejects.toBeInstanceOf(Error)
    expect(mock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  }, 180_000)
})
