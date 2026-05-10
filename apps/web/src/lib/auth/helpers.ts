/**
 * Auth.js ヘルパ — Astro 向けの薄いラッパ
 */

import { Auth } from "@auth/core";
import { createAuthConfig } from "./config";
import type { Session } from "@auth/core/types";

export interface CloudflareEnv {
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  AUTH_SECRET: string;
  DATABASE_URL: string;
  GUILD_ID: string;
  TOKEN_ENCRYPTION_KEY?: string;
}

export function getEnv(locals: App.Locals): CloudflareEnv {
  const runtime = locals.runtime;
  if (runtime?.env) {
    return runtime.env as CloudflareEnv;
  }
  throw new Error("[auth] Cloudflare runtime.env not found.");
}

export async function getSession(
  request: Request,
  locals: App.Locals,
): Promise<Session | null> {
  const env = getEnv(locals);
  const config = createAuthConfig(env);

  const url = new URL("/api/auth/session", request.url);
  const sessionRequest = new Request(url, { headers: request.headers });

  const response = await Auth(sessionRequest, config);
  const data = await response.json();

  if (!data || !("user" in data) || !data.user) {
    return null;
  }

  return data as Session;
}

/**
 * カスタムログインフォーム用の CSRF トークンを取得する。
 */
export async function getCsrfToken(
  request: Request,
  locals: App.Locals,
): Promise<string> {
  const env = getEnv(locals);
  const config = createAuthConfig(env);

  const url = new URL("/api/auth/csrf", request.url);
  const csrfRequest = new Request(url, { headers: request.headers });

  const response = await Auth(csrfRequest, config);
  const data = await response.json();

  return data.csrfToken ?? "";
}
