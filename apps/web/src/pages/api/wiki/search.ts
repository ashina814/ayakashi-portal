/**
 * GET /api/wiki/search?q=...
 *
 * 閲覧可能な wiki ページから title 部分一致を返す。最大 20 件。
 * 検索モーダル (⌘K) から fetch される下準備。
 * 本文全文検索は未対応 — タイトルのみ。
 */

import type { APIRoute } from "astro";
import { createDb } from "@ayakashi/db/client";
import { getEnv } from "../../../lib/auth/helpers";
import { listPages } from "../../../lib/repos/wiki";
import { getMemberRoleAliases } from "../../../lib/repos/membership";

const LIMIT = 20;

export const GET: APIRoute = async ({ locals, url }) => {
  const session = locals.session;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const env = getEnv(locals);
  const db = createDb(env.DATABASE_URL);

  const aliases = await getMemberRoleAliases(db, userId);
  const pages = await listPages(db, aliases);

  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const matched = q
    ? pages.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q),
      )
    : pages;

  const results = matched.slice(0, LIMIT).map((p) => ({
    slug: p.slug,
    title: p.title,
    updatedAt: p.updatedAt.toISOString(),
  }));

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
