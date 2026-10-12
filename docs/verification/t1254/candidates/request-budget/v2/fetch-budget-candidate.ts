export interface RequestConfig {
  url?: string
  method?: string
  headers?: Record<string, string>
  data?: unknown
  timeout?: number
}

// Some APIs (e.g. WeChat media/uploadimg) return a JSON body with a
// text/plain Content-Type. Mirror axios's forcedJSONParsing behavior so
// such responses are still parsed into objects.
function tryParseJson(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed.startsWith(`{`) && !trimmed.startsWith(`[`))
    return text
  try {
    return JSON.parse(trimmed)
  }
  catch {
    return text
  }
}

async function request<T = unknown>(config: RequestConfig): Promise<T> {
  const method = (config.method || `GET`).toUpperCase()
  const url = config.url || ``
  const headers: Record<string, string> = { ...config.headers }
  const controller = new AbortController()
  // SEMANTIC_BOUNDARY_ALLOW: 只校验独立请求预算与时间，不做内容理解或创作选择。
  const requestedTimeout = config.timeout
  const timeout = typeof requestedTimeout === `number` && Number.isFinite(requestedTimeout) && requestedTimeout >= 0
    ? Math.max(120_000, requestedTimeout)
    : 120_000
  // 宿主单个 timer 有 32 位上界；所有 tick 共用同一个出生时间与预算，不能续期。
  const bornAt = performance.now()
  const maxTimerDelay = 2_147_483_647
  const abortAtDeadline = () => {
    const remaining = timeout - (performance.now() - bornAt)
    if (remaining <= 0) {
      controller.abort()
      return
    }
    timer = setTimeout(abortAtDeadline, Math.min(remaining, maxTimerDelay))
  }
  let timer = setTimeout(abortAtDeadline, Math.min(timeout, maxTimerDelay))

  let body: BodyInit | undefined
  if (config.data !== undefined && method !== `GET` && method !== `HEAD`) {
    if (typeof FormData !== `undefined` && config.data instanceof FormData) {
      body = config.data
      // Browser sets multipart boundary; drop explicit multipart Content-Type
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === `content-type` && headers[key].includes(`multipart/form-data`))
          delete headers[key]
      }
    }
    else if (typeof config.data === `object` && config.data !== null && !(config.data instanceof Blob) && !(config.data instanceof ArrayBuffer)) {
      body = JSON.stringify(config.data)
      if (!Object.keys(headers).some(k => k.toLowerCase() === `content-type`))
        headers[`Content-Type`] = `application/json`
    }
    else {
      body = config.data as BodyInit
    }
  }

  try {
    const res = await globalThis.fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    })

    const contentType = res.headers.get(`content-type`) || ``
    const data = contentType.includes(`application/json`)
      ? await res.json()
      : tryParseJson(await res.text())

    if (!res.ok) {
      const err = Object.assign(new Error(`Request failed with status ${res.status}`), {
        response: { status: res.status, data },
        data,
        status: res.status,
      })
      return Promise.reject(err)
    }

    // Match previous axios interceptor: reject empty bodies
    if (data === null || data === undefined || data === ``)
      return Promise.reject(new Error(`Empty response`))

    return data as T
  }
  finally {
    clearTimeout(timer)
  }
}

function createDataMethod(method: string) {
  return <T = unknown>(url: string, data?: unknown, config?: Omit<RequestConfig, `url` | `method` | `data`>) =>
    request<T>({ ...config, url, method, data })
}

function createConfigMethod(method: string) {
  return <T = unknown>(url: string, config?: Omit<RequestConfig, `url` | `method`>) =>
    request<T>({ ...config, url, method })
}

interface FetchCallable {
  // Two type params kept for call-site compatibility (request body / response)
  <_TReq = unknown, TRes = unknown>(config: RequestConfig): Promise<TRes>
  <_TReq = unknown, TRes = unknown>(url: string, config?: RequestConfig): Promise<TRes>
  get: <T = unknown>(url: string, config?: Omit<RequestConfig, `url` | `method`>) => Promise<T>
  post: <T = unknown>(url: string, data?: unknown, config?: Omit<RequestConfig, `url` | `method` | `data`>) => Promise<T>
  put: <T = unknown>(url: string, data?: unknown, config?: Omit<RequestConfig, `url` | `method` | `data`>) => Promise<T>
  delete: <T = unknown>(url: string, config?: Omit<RequestConfig, `url` | `method`>) => Promise<T>
  patch: <T = unknown>(url: string, data?: unknown, config?: Omit<RequestConfig, `url` | `method` | `data`>) => Promise<T>
  request: typeof request
}

const service = (async function fetchLike(
  urlOrConfig: string | RequestConfig,
  maybeConfig?: RequestConfig,
): Promise<unknown> {
  if (typeof urlOrConfig === `string`)
    return request({ ...maybeConfig, url: urlOrConfig })
  return request(urlOrConfig)
}) as FetchCallable

service.get = createConfigMethod(`GET`)
service.post = createDataMethod(`POST`)
service.put = createDataMethod(`PUT`)
service.delete = createConfigMethod(`DELETE`)
service.patch = createDataMethod(`PATCH`)
service.request = request

export default service
