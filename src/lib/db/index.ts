import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

let _client: Client | undefined;

function getClient(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL is not configured");
    _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return _client;
}

type DrizzleInstance = ReturnType<typeof drizzle<typeof schema>>;

export const db = new Proxy({} as DrizzleInstance, {
  get(_target, prop: string | symbol) {
    const instance = drizzle(getClient(), { schema });
    return (instance as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export { schema };
