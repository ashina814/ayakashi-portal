/**
 * Astro ミドルウェア — セッション情報を locals に注入
 *
 * 全リクエストに対して Auth.js セッションを取得し、
 * Astro.locals.session として利用可能にする。
 * 保護ルートのチェックはここで行わず、各ページ側で判定する。
 */

import { defineMiddleware } from "astro:middleware";
import { getSession } from "./lib/auth/helpers";

/** セッション取得をスキップするパス */
const SKIP_PATHS = [
  "/api/auth",  // Auth.js が処理する
  "/api/health", // ヘルスチェック
];

export const onRequest = defineMiddleware(async (context, next) => {
  // Auth.js 関連パスやヘルスチェックはスキップ
  const pathname = context.url.pathname;
  if (SKIP_PATHS.some((p) => pathname.startsWith(p))) {
    return next();
  }

  // セッション取得を try-catch で囲む
  // 環境変数未設定やDB未接続でもページが500にならないようにする
  try {
    const session = await getSession(context.request, context.locals);
    context.locals.session = session;
  } catch (error) {
    // セッション取得失敗 = 未認証扱い
    console.error("[middleware] Session fetch failed:", error);
    context.locals.session = null;
  }

  return next();
});
