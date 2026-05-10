/**
 * DB 接続ヘルパ（Cloudflare Workers / Neon Serverless 用）
 *
 * CF Workers では TCP ソケットが使えないため、
 * @neondatabase/serverless の HTTP ドライバを使用する。
 *
 * 使い方:
 *   const db = createDb(env.DATABASE_URL);
 *   const rows = await db.select().from(users);
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./index";

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
