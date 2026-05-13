/**
 * POST /api/wiki/[slug]
 *
 * 既存ページの本文を更新する。リクエストボディ:
 *   { content: string (Tiptap JSON), expectedRevisionId: string | null }
 *
 * 楽観ロックで current_revision_id が一致しない場合 409 + 最新 id を返す。
 * 編集権限: wiki_editor alias を保持していること。
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { createDb } from "@ayakashi/db/client";
import { wikiPages } from "@ayakashi/db";
import { getEnv } from "../../../lib/auth/helpers";
import {
  deletePage,
  hasWikiEditorPermission,
  updatePageContent,
} from "../../../lib/repos/wiki";
import { getMemberRoleAliases } from "../../../lib/repos/membership";

export const POST: APIRoute = async ({ params, request, locals, url }) => {
  const session = locals.session;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return new Response("Forbidden", { status: 403 });
  }

  const slug = params.slug;
  if (!slug || typeof slug !== "string") {
    return new Response("Bad slug", { status: 400 });
  }

  const env = getEnv(locals);
  const db = createDb(env.DATABASE_URL);

  const aliases = await getMemberRoleAliases(db, userId);
  if (!hasWikiEditorPermission(aliases)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    content?: string;
    expectedRevisionId?: string | null;
  } | null;

  if (!body || typeof body.content !== "string") {
    return new Response("Bad body", { status: 400 });
  }

  if (body.content.length > 1024 * 1024) {
    return new Response("Content too large", { status: 413 });
  }

  const [page] = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(eq(wikiPages.slug, slug))
    .limit(1);
  if (!page) {
    return new Response("Not Found", { status: 404 });
  }

  const result = await updatePageContent(db, {
    pageId: page.id,
    content: body.content,
    authorId: userId,
    expectedRevisionId: body.expectedRevisionId ?? null,
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        error: "conflict",
        currentRevisionId: result.currentRevisionId,
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, currentRevisionId: result.currentRevisionId }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

export const DELETE: APIRoute = async ({ params, request, locals, url }) => {
  const session = locals.session;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return new Response("Forbidden", { status: 403 });
  }

  const slug = params.slug;
  if (!slug || typeof slug !== "string") {
    return new Response("Bad slug", { status: 400 });
  }

  const env = getEnv(locals);
  const db = createDb(env.DATABASE_URL);

  const aliases = await getMemberRoleAliases(db, userId);
  if (!hasWikiEditorPermission(aliases)) {
    return new Response("Forbidden", { status: 403 });
  }

  const [page] = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(eq(wikiPages.slug, slug))
    .limit(1);
  if (!page) return new Response("Not Found", { status: 404 });

  const result = await deletePage(db, page.id);
  if (!result.deleted) {
    return new Response("Delete failed", { status: 500 });
  }
  return new Response(null, { status: 204 });
};
