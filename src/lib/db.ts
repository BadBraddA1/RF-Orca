import { createClient, type Client, type InValue } from "@libsql/client"

export type SqlRow = Record<string, unknown>

export type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<SqlRow[]>
  query: (query: string, args?: unknown[]) => Promise<SqlRow[]>
}

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

async function executeQuery(
  query: string,
  args: unknown[] = [],
): Promise<SqlRow[]> {
  const client = getClient()
  const result = await client.execute({
    sql: query,
    args: args as InValue[],
  })
  return result.rows as unknown as SqlRow[]
}

async function sqlTag(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<SqlRow[]> {
  const { sql, args } = buildTemplateQuery(strings, values)
  const client = getClient()
  const result = await client.execute({ sql, args })
  return result.rows as unknown as SqlRow[]
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
