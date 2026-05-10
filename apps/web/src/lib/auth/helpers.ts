/**
 * Auth.js ヘルパ — Astro 向けの薄いラッパ
 *
 * Astro の APIContext / AstroGlobal から
 * Auth.js の Auth() を呼ぶためのユーティリティ。
 */

import { Auth } from "@auth/core";
import { createAuthConfig } from "./config";
import type { Session } from "@auth/core/types";

/** Cloudflare Pages の runtime env 型 */
export interface CloudflareEnv {
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  AUTH_SECRET: string;
  DATABASE_URL: string;
  GUILD_ID: string;
  TOKEN_ENCRYPTION_KEY?: string;
}

/**
 * Astro の locals.runtime.env から CloudflareEnv を取得する。
 * ローカル開発時は process.env からフォールバック。
 */
export function getEnv(locals: App.Locals): CloudflareEnv {
  // Cloudflare Pages: locals.runtime.env に環境変数が入る
  const runtime = (locals as Record<string, unknown>).runtime as
    | { env: Record<string, string> }
    | undefined;

  if (runtime?.env) {
    return runtime.env as unknown as CloudflareEnv;
  }

  // ローカル dev サーバーのフォールバック
  return {
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID ?? "",
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET ?? "",
    AUTH_SECRET: process.env.AUTH_SECRET ?? "",
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    GUILD_ID: process.env.GUILD_ID ?? "",
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  };
}

/**
 * 現在のリクエストからセッションを取得する。
 *
 * @example
 * ```ts
 * // .astro ページ or API route
 * const session = await getSession(Astro.request, Astro.locals);
 * if (!session) return Astro.redirect("/login");
 * ```
 */
export async function getSession(
  request: Request,
  locals: App.Locals,
): Promise<Session | null> {
  const env = getEnv(locals);
  const config = createAuthConfig(env);

  // Auth.js は GET /api/auth/session でセッション取得する
  const url = new URL("/api/auth/session", request.url);
  const sessionRequest = new Request(url, {
    headers: request.headers,
  });

  const response = await Auth(sessionRequest, config);
  const data = await response.json();

  // Auth.js は空オブジェクト {} を返す場合がある
  if (!data || !("user" in data) || !data.user) {
    return null;
  }

  return data as Session;
}
