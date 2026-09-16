import { createClient, type Client, type InValue } from "@libsql/client"

export type SqlRow = Record<string, unknown>

export type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<SqlRow[]>
  query: (query: string, args?: unknown[]) => Promise<SqlRow[]>
}

/** Soft ceiling so a hung Turso connect doesn't pin a whole SSR request. */
const QUERY_TIMEOUT_MS = 8_000
const QUERY_RETRIES = 1

let _client: Client | null = null

export function tursoConfigured(): boolean {
  const url =
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_URL ||
    process.env.LIBSQL_URL
  return Boolean(url?.trim())
}

function getClient(): Client {
  if (_client) return _client

  const url = (
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_URL ||
    process.env.LIBSQL_URL ||
    ""
  ).trim()

  const authToken = (
    process.env.TURSO_AUTH_TOKEN ||
    process.env.LIBSQL_AUTH_TOKEN ||
    ""
  ).trim()

  if (!url) {
    throw new Error(
      "Turso database URL is not set. Configure TURSO_DATABASE_URL.",
    )
  }

  _client = createClient({
    url,
    authToken: authToken || undefined,
  })
  return _client
}

/** Drop cached client so the next query opens a fresh connection. */
export function resetSqlClient(): void {
  try {
    _client?.close()
  } catch {
    /* ignore */
  }
  _client = null
}

function buildTemplateQuery(
  strings: TemplateStringsArray,
  values: unknown[],
): { sql: string; args: InValue[] } {
  let sql = ""
  const args: InValue[] = []

  for (let i = 0; i < strings.length; i++) {
    sql += strings[i]
    if (i >= values.length) continue
    const value = values[i]
    if (typeof value === "boolean") {
      sql += "?"
      args.push(value ? 1 : 0)
      continue
    }
    sql += "?"
    args.push(value as InValue)
  }

  return { sql, args }
}

function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const err = error as {
    message?: string
    code?: string
    cause?: { code?: string; message?: string; name?: string }
    name?: string
  }
  const haystack = [
    err.message,
    err.code,
    err.name,
    err.cause?.code,
    err.cause?.message,
    err.cause?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return (
    haystack.includes("timeout") ||
    haystack.includes("connect") ||
    haystack.includes("fetch failed") ||
    haystack.includes("econnreset") ||
    haystack.includes("enotfound") ||
    haystack.includes("socket") ||
    haystack.includes("network") ||
    haystack.includes("undici")
  )
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `Turso query timed out after ${ms}ms (${label})`,
            ),
          )
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function executeOnce(
  query: string,
  args: unknown[] = [],
): Promise<SqlRow[]> {
  const client = getClient()
  const result = await withTimeout(
    client.execute({
      sql: query,
      args: args as InValue[],
    }),
    QUERY_TIMEOUT_MS,
    query.slice(0, 48),
  )
  return result.rows as unknown as SqlRow[]
}

async function executeQuery(
  query: string,
  args: unknown[] = [],
): Promise<SqlRow[]> {
  let lastError: unknown
  for (let attempt = 0; attempt <= QUERY_RETRIES; attempt++) {
    try {
      return await executeOnce(query, args)
    } catch (error) {
      lastError = error
      if (attempt >= QUERY_RETRIES || !isTransientDbError(error)) {
        throw error
      }
      console.warn(
        `[db] transient Turso error, retrying (${attempt + 1}/${QUERY_RETRIES})`,
        error instanceof Error ? error.message : error,
      )
      resetSqlClient()
    }
  }
  throw lastError
}

async function sqlTag(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<SqlRow[]> {
  const { sql, args } = buildTemplateQuery(strings, values)
  return executeQuery(sql, args)
}

export const sql = new Proxy(function () {} as unknown as SqlClient, {
  apply(_target, _thisArg, args: unknown[]) {
    const strings = args[0] as TemplateStringsArray
    const values = args.slice(1)
    return sqlTag(strings, ...values)
  },
  get(_target, prop: string | symbol) {
    if (prop === "query") return executeQuery
    return undefined
  },
}) as SqlClient

export function getSql(): SqlClient {
  return sql
}
