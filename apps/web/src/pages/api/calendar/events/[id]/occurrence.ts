/**
 * 繰り返しイベントの「この回だけ」操作（admin のみ）
 *
 * PATCH  /api/calendar/events/[id]/occurrence
 *   body: { date: "YYYY-MM-DD"(=occurrenceDate), title, time, allDay, category, description, highlight }
 *   → その回だけ差し替え（override を upsert）。日付は動かさない。
 *
 * DELETE /api/calendar/events/[id]/occurrence?date=YYYY-MM-DD&mode=cancel|revert
 *   mode=cancel … その回を中止（非表示）。
 *   mode=revert … その回の例外を解除しシリーズ既定へ戻す（中止・差し替えの取り消し）。
 *
 * [id] は繰り返しシリーズの calendar_events.id。
 */

import type { APIRoute } from "astro";
import { createDb } from "@ayakashi/db/client";
import { getEnv } from "../../../../../lib/auth/helpers";
import { isAdmin } from "../../../../../lib/auth/permissions";
import { getMemberRoleAliases } from "../../../../../lib/repos/membership";
import {
  cancelOccurrence,
  revertOccurrence,
  upsertOccurrenceOverride,
  isRecurringSeries,
} from "../../../../../lib/repos/events";
import { parseOverrideBody } from "../../events";

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

  if (!(await isRecurringSeries(guard.db, id))) {
    return new Response("Not a recurring series", { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOverrideBody(body);
  if (typeof parsed === "string") return new Response(parsed, { status: 400 });

  await upsertOccurrenceOverride(guard.db, id, parsed.occurrenceDate, parsed.input);
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

  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("date must be YYYY-MM-DD", { status: 400 });
  }
  const mode = url.searchParams.get("mode") === "revert" ? "revert" : "cancel";

  if (mode === "revert") {
    await revertOccurrence(guard.db, id, date);
  } else {
    await cancelOccurrence(guard.db, id, date);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
