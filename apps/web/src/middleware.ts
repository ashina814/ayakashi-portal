/**
 * Astro ミドルウェア — セッション情報を locals に注入
 *
 * 全リクエストに対して Auth.js セッションを取得し、
 * Astro.locals.session として利用可能にする。
 * 保護ルートのチェックはここで行わず、各ページ側で判定する。
 */

import { defineMiddleware } from "astro:middleware";
import { getSession } from "./lib/auth/helpers";

export const onRequest = defineMiddleware(async (context, next) => {
  // /api/auth/* は Auth.js が処理するのでスキップ
  if (context.url.pathname.startsWith("/api/auth")) {
    return next();
  }

  // セッション取得（未認証なら null）
  const session = await getSession(context.request, context.locals);
  context.locals.session = session;

  return next();
});
