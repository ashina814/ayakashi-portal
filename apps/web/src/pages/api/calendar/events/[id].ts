/**
 * PATCH  /api/calendar/events/[id]  — 更新（admin のみ）
 * DELETE /api/calendar/events/[id]  — 削除（admin のみ）
 */

import type { APIRoute } from "astro";
import { createDb } from "@ayakashi/db/client";
import { getEnv } from "../../../../lib/auth/helpers";
import { isAdmin } from "../../../../lib/auth/permissions";
import { getMemberRoleAliases } from "../../../../lib/repos/membership";
import { updateEvent, deleteEvent } from "../../../../lib/repos/events";
import { parseEventBody } from "../events";

async function ensureAdmin(request: Request, url: URL, locals: App.Locals) {
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return { ok: false as const, res: new Response("Forbidden", { status: 403 }) };
  }
  const userId = (locals.session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return { ok: false as const, res: new Response("Unauthorized", { status: 401 }) };
  }
  const env = getEnv(locals);
  const db = createDb(env.DATABASE_URL);
  const aliases = await getMemberRoleAliases(db, userId);
  if (!isAdmin(aliases)) {
    return { ok: false as const, res: new Response("Forbidden", { status: 403 }) };
  }
  return { ok: true as const, db };
}

export const PATCH: APIRoute = async ({ request, locals, url, params }) => {
  const guard = await ensureAdmin(request, url, locals);
  if (!guard.ok) return guard.res;
  const id = params.id;
  if (!id) return new Response("Bad id", { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = parseEventBody(body);
  if (typeof parsed === "string") return new Response(parsed, { status: 400 });

  const updated = await updateEvent(guard.db, id, parsed);
  if (!updated) return new Response("Not Found", { status: 404 });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ request, locals, url, params }) => {
  const guard = await ensureAdmin(request, url, locals);
  if (!guard.ok) return guard.res;
  const id = params.id;
  if (!id) return new Response("Bad id", { status: 400 });

  const ok = await deleteEvent(guard.db, id);
  if (!ok) return new Response("Not Found", { status: 404 });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
