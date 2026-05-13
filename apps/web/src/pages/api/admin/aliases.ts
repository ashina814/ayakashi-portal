/**
 * POST   /api/admin/aliases       — { alias, roleId } を追加
 * DELETE /api/admin/aliases?id=…  — id 指定で1件削除
 *
 * いずれも ADMIN_ALIAS 必須。
 */

import type { APIRoute } from "astro";
import { createDb } from "@ayakashi/db/client";
import { getEnv } from "../../../lib/auth/helpers";
import { isAdmin } from "../../../lib/auth/permissions";
import {
  createRoleAlias,
  deleteRoleAlias,
} from "../../../lib/repos/admin";
import { getMemberRoleAliases } from "../../../lib/repos/membership";

const ALIAS_RE = /^[a-z][a-z0-9_]{1,31}$/;

async function ensureAdmin(locals: App.Locals): Promise<
  | { ok: true; db: ReturnType<typeof createDb>; userId: string }
  | { ok: false; res: Response }
> {
  const userId = (locals.session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return { ok: false, res: new Response("Unauthorized", { status: 401 }) };
  }
  const env = getEnv(locals);
  const db = createDb(env.DATABASE_URL);
  const aliases = await getMemberRoleAliases(db, userId);
  if (!isAdmin(aliases)) {
    return { ok: false, res: new Response("Forbidden", { status: 403 }) };
  }
  return { ok: true, db, userId };
}

function checkOrigin(request: Request, url: URL): Response | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

export const POST: APIRoute = async ({ request, locals, url }) => {
  const csrf = checkOrigin(request, url);
  if (csrf) return csrf;

  const guard = await ensureAdmin(locals);
  if (!guard.ok) return guard.res;

  const body = (await request.json().catch(() => null)) as {
    alias?: string;
    roleId?: string;
  } | null;
  if (!body || typeof body.alias !== "string" || typeof body.roleId !== "string") {
    return new Response("Bad body", { status: 400 });
  }

  const alias = body.alias.trim();
  if (!ALIAS_RE.test(alias)) {
    return new Response(
      "alias must match /^[a-z][a-z0-9_]{1,31}$/",
      { status: 400 },
    );
  }

  try {
    const created = await createRoleAlias(guard.db, alias, body.roleId);
    return new Response(
      JSON.stringify({ ok: true, id: created.id }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    // unique 制約違反など
    const msg = e?.message ?? String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return new Response("alias already in use", { status: 409 });
    }
    return new Response(msg, { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, locals, url }) => {
  const csrf = checkOrigin(request, url);
  if (csrf) return csrf;

  const guard = await ensureAdmin(locals);
  if (!guard.ok) return guard.res;

  const id = url.searchParams.get("id");
  if (!id) return new Response("missing id", { status: 400 });

  const result = await deleteRoleAlias(guard.db, id);
  if (!result.deleted) return new Response("Not Found", { status: 404 });
  return new Response(null, { status: 204 });
};
