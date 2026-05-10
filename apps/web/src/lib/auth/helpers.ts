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
 * Astro の locals から CloudflareEnv を取得する。
 *
 * Cloudflare Pages: Astro.locals.runtime.env に環境変数が入る。
 * ローカル dev（platformProxy 有効時）: 同じパスで .dev.vars から読まれる。
 */
export function getEnv(locals: App.Locals): CloudflareEnv {
  // Astro + @astrojs/cloudflare: locals.runtime.env
  const runtime = locals.runtime;
  if (runtime?.env) {
    return runtime.env as CloudflareEnv;
  }

  // フォールバック（万が一 runtime が無い場合）
  throw new Error(
    "[auth] Cloudflare runtime.env not found. " +
    "Ensure @astrojs/cloudflare adapter is configured with platformProxy enabled.",
  );
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
