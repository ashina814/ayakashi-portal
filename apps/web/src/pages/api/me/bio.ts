/**
 * POST /api/me/bio
 *
 * 認証済みユーザーが自分の自己紹介を更新するエンドポイント。
 * application/x-www-form-urlencoded で `bio` フィールドを受け取る。
 * 成功時は /me に 303 リダイレクト。
 */

import type { APIRoute } from "astro";
import { createDb } from "@ayakashi/db/client";
import { getEnv } from "../../../lib/auth/helpers";
import {
  updateMemberBio,
  BIO_MAX_LENGTH,
} from "../../../lib/repos/membership";

export const POST: APIRoute = async ({ request, locals, url }) => {
  const session = locals.session;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // CSRF: 同一オリジンのフォーム POST のみ許可
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return new Response("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const bio = (form.get("bio") ?? "").toString();
  if (bio.length > BIO_MAX_LENGTH) {
    return new Response(
      `bio is too long (max ${BIO_MAX_LENGTH} chars)`,
      { status: 400 },
    );
  }

  const env = getEnv(locals);
  const db = createDb(env.DATABASE_URL);

  const updated = await updateMemberBio(db, userId, bio);
  if (!updated) {
    return new Response(
      "Member row not found. Sign in again to trigger guild sync.",
      { status: 409 },
    );
  }

  return new Response(null, {
    status: 303,
    headers: { Location: "/me" },
  });
};
