/**
 * Auth.js catch-all API route
 *
 * すべての /api/auth/* リクエストを Auth.js (@auth/core) に委譲する。
 * - GET /api/auth/signin       → サインインページ（Discord へリダイレクト）
 * - GET /api/auth/signout      → サインアウト
 * - GET /api/auth/session      → セッション取得
 * - GET /api/auth/csrf         → CSRF トークン取得
 * - POST /api/auth/signin/*    → プロバイダーごとのサインイン処理
 * - POST /api/auth/signout     → サインアウト処理
 * - GET /api/auth/callback/*   → OAuth コールバック
 */

import { Auth } from "@auth/core";
import type { APIRoute } from "astro";
import { createAuthConfig } from "../../../lib/auth/config";
import { getEnv } from "../../../lib/auth/helpers";

/**
 * Astro の catch-all route handler。
 * GET / POST 両方を ALL で処理。
 */
const handler: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  const config = createAuthConfig(env);

  return Auth(request, config);
};

// Astro は HTTP メソッドごとに export する
export const GET = handler;
export const POST = handler;
