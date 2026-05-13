/**
 * POST /api/wiki/[slug]/visibility
 *
 * { aliases: string[] } で wiki_visibility 行を replace-all する。
 * 空配列を渡すと public（行を全削除）になる。
 * wiki_editor or admin が必要。
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { createDb } from "@ayakashi/db/client";
import { wikiPages } from "@ayakashi/db";
import { getEnv } from "../../../../lib/auth/helpers";
import { canEditWiki } from "../../../../lib/auth/permissions";
import { setPageVisibility } from "../../../../lib/repos/wiki";
import { getMemberRoleAliases } from "../../../../lib/repos/membership";

export const POST: APIRoute = async ({ params, request, locals, url }) => {
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
  if (!canEditWiki(aliases)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    aliases?: unknown;
  } | null;
  if (!body || !Array.isArray(body.aliases)) {
    return new Response("Bad body", { status: 400 });
  }
  if (!body.aliases.every((a) => typeof a === "string")) {
    return new Response("aliases must be strings", { status: 400 });
  }

  const [page] = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(eq(wikiPages.slug, slug))
    .limit(1);
  if (!page) return new Response("Not Found", { status: 404 });

  await setPageVisibility(db, page.id, body.aliases as string[]);
  return new Response(null, { status: 204 });
};
