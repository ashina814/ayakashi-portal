/**
 * POST /api/wiki/new
 *
 * 新しい wiki ページを作る。ボディ:
 *   { slug: string, title: string, parentSlug: string|null, content: string }
 *
 * 編集権限: wiki_editor alias 必須。
 * slug 衝突は 409。
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { createDb } from "@ayakashi/db/client";
import { wikiPages } from "@ayakashi/db";
import { getEnv } from "../../../lib/auth/helpers";
import {
  createPage,
  hasWikiEditorPermission,
} from "../../../lib/repos/wiki";
import { getMemberRoleAliases } from "../../../lib/repos/membership";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const session = locals.session;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return new Response("Forbidden", { status: 403 });
  }

  const env = getEnv(locals);
  const db = createDb(env.DATABASE_URL);

  const aliases = await getMemberRoleAliases(db, userId);
  if (!hasWikiEditorPermission(aliases)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    slug?: string;
    title?: string;
    parentSlug?: string | null;
    content?: string;
  } | null;

  if (
    !body ||
    typeof body.slug !== "string" ||
    typeof body.title !== "string" ||
    typeof body.content !== "string"
  ) {
    return new Response("Bad body", { status: 400 });
  }

  const slug = body.slug.trim();
  const title = body.title.trim();

  if (!SLUG_RE.test(slug)) {
    return new Response(
      "Slug must be lowercase letters/digits/hyphens (1-64 chars)",
      { status: 400 },
    );
  }
  if (title.length === 0 || title.length > 200) {
    return new Response("Title length out of range", { status: 400 });
  }

  // slug 衝突チェック
  const [existing] = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(eq(wikiPages.slug, slug))
    .limit(1);
  if (existing) {
    return new Response("Slug already in use", { status: 409 });
  }

  // parent 解決
  let parentId: string | null = null;
  if (body.parentSlug) {
    const [parent] = await db
      .select({ id: wikiPages.id })
      .from(wikiPages)
      .where(eq(wikiPages.slug, body.parentSlug))
      .limit(1);
    if (!parent) {
      return new Response("Parent not found", { status: 404 });
    }
    parentId = parent.id;
  }

  const created = await createPage(db, {
    slug,
    title,
    parentId,
    content: body.content,
    authorId: userId,
  });

  return new Response(
    JSON.stringify({ ok: true, slug: created.slug }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
};
