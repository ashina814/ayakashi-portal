/**
 * GET  /api/calendar/events?year=YYYY&month=M  — その月のイベント一覧（要ログイン）
 * POST /api/calendar/events                    — 新規作成（admin のみ）
 *
 * 日時は JST 基準で受け取り、timestamptz として保存する。
 */

import type { APIRoute } from "astro";
import { createDb } from "@ayakashi/db/client";
import { getEnv } from "../../../lib/auth/helpers";
import { isAdmin } from "../../../lib/auth/permissions";
import { getMemberRoleAliases } from "../../../lib/repos/membership";
import {
  listEventsInRange,
  createEvent,
  type EventInput,
} from "../../../lib/repos/events";

interface EventBody {
  title?: string;
  date?: string;
  time?: string | null;
  allDay?: boolean;
  category?: string | null;
  description?: string | null;
  highlight?: boolean;
}

/** 受け取った body を検証して EventInput に変換。失敗時は文字列メッセージ。 */
export function parseEventBody(body: EventBody | null): EventInput | string {
  if (!body || typeof body.title !== "string") return "title is required";
  const title = body.title.trim();
  if (title.length === 0 || title.length > 120) return "title length out of range";

  const date = body.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return "date must be YYYY-MM-DD";
  }
  const allDay = body.allDay === true;
  let startsAt: Date;
  if (allDay) {
    startsAt = new Date(`${date}T00:00:00+09:00`);
  } else {
    const time = body.time;
    if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
      return "time must be HH:MM";
    }
    startsAt = new Date(`${date}T${time}:00+09:00`);
  }
  if (Number.isNaN(startsAt.getTime())) return "invalid date/time";

  const category =
    typeof body.category === "string" && body.category.trim().length > 0
      ? body.category.trim().slice(0, 24)
      : null;
  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim().slice(0, 500)
      : null;

  return {
    title,
    startsAt,
    allDay,
    category,
    description,
    highlight: body.highlight === true,
  };
}

export const GET: APIRoute = async ({ locals, url }) => {
  const userId = (locals.session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month")); // 1-12
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return new Response("Bad year/month", { status: 400 });
  }

  const env = getEnv(locals);
  const db = createDb(env.DATABASE_URL);

  // JST のその月 [1日 00:00, 翌月1日 00:00)
  const from = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 1);

  const events = await listEventsInRange(db, from, to);
  return new Response(JSON.stringify({ events: events.map(serialize) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request, locals, url }) => {
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return new Response("Forbidden", { status: 403 });
  }
  const userId = (locals.session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const env = getEnv(locals);
  const db = createDb(env.DATABASE_URL);
  const aliases = await getMemberRoleAliases(db, userId);
  if (!isAdmin(aliases)) return new Response("Forbidden", { status: 403 });

  const body = (await request.json().catch(() => null)) as EventBody | null;
  const parsed = parseEventBody(body);
  if (typeof parsed === "string") return new Response(parsed, { status: 400 });

  const created = await createEvent(db, parsed, userId);
  return new Response(JSON.stringify({ event: serialize(created) }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};

/** クライアントが扱いやすい形に（JST の日付/時刻を分解して返す）。 */
function serialize(e: {
  id: string;
  title: string;
  startsAt: Date;
  allDay: boolean;
  category: string | null;
  description: string | null;
  highlight: boolean;
}) {
  // JST に変換して日・時刻を取り出す
  const jst = new Date(e.startsAt.getTime() + 9 * 3600 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return {
    id: e.id,
    title: e.title,
    year: y,
    month: m,
    day: d,
    time: e.allDay ? null : `${hh}:${mm}`,
    allDay: e.allDay,
    category: e.category,
    description: e.description,
    highlight: e.highlight,
  };
}
