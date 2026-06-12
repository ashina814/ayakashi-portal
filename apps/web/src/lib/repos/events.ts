/**
 * カレンダーイベント Repository
 *
 * calendar_events テーブルの読み書きをカプセル化。
 * 表示は starts_at の範囲（その月）で引く。編集系は admin 限定（API 側で保護）。
 *
 * 繰り返しイベント（recurrence != 'none'）は DB に 1 行だけ持ち、
 * listEventsInRange が要求された範囲の該当日へ「展開（occurrence）」して返す。
 * 編集・削除はシリーズ全体に適用するため、各 occurrence は元行の id を共有する。
 */

import { and, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { calendarEvents } from "@ayakashi/db";

export type Recurrence = "none" | "weekly" | "monthly";

/**
 * 表示用の 1 回分（occurrence）。
 * - startsAt … その回の日時（展開後）。
 * - seriesStartsAt … シリーズの起点（= DB の starts_at）。編集フォームの基準。
 * 単発イベントでは startsAt と seriesStartsAt は一致する。
 */
export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: Date;
  allDay: boolean;
  category: string | null;
  description: string | null;
  highlight: boolean;
  recurrence: Recurrence;
  seriesStartsAt: Date;
  recurrenceUntil: Date | null;
}

export interface EventInput {
  title: string;
  startsAt: Date;
  allDay: boolean;
  category: string | null;
  description: string | null;
  highlight: boolean;
  recurrence: Recurrence;
  recurrenceUntil: Date | null;
}

/** DB 行 → 単発 occurrence（展開なし）。 */
function rowToOccurrence(
  row: {
    id: string;
    title: string;
    startsAt: Date;
    allDay: boolean;
    category: string | null;
    description: string | null;
    highlight: boolean;
    recurrence: Recurrence;
    recurrenceUntil: Date | null;
  },
  startsAt: Date,
): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    startsAt,
    allDay: row.allDay,
    category: row.category,
    description: row.description,
    highlight: row.highlight,
    recurrence: row.recurrence,
    seriesStartsAt: row.startsAt,
    recurrenceUntil: row.recurrenceUntil,
  };
}

const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3600 * 1000;

/** 暴走防止（毎週でも数年分は超えない）。 */
const MAX_OCCURRENCES = 800;

/**
 * 繰り返し行を [from, to) に重なる occurrence へ展開する。
 * 日本は固定 +09:00 なので、起点に「週/月」を足せば曜日・日・時刻は保たれる。
 */
function expand(
  row: {
    id: string;
    title: string;
    startsAt: Date;
    allDay: boolean;
    category: string | null;
    description: string | null;
    highlight: boolean;
    recurrence: Recurrence;
    recurrenceUntil: Date | null;
  },
  from: Date,
  to: Date,
): CalendarEvent[] {
  const anchor = row.startsAt;
  // until は「その日まで含む」。終端を翌日 00:00(JST) として比較する。
  const untilExclusive = row.recurrenceUntil
    ? new Date(row.recurrenceUntil.getTime() + DAY_MS)
    : null;
  const out: CalendarEvent[] = [];

  if (row.recurrence === "weekly") {
    // anchor 以降で from 以上になる最初の回まで一気に進める。
    let t = anchor.getTime();
    if (t < from.getTime()) {
      const steps = Math.ceil((from.getTime() - t) / (7 * DAY_MS));
      t += steps * 7 * DAY_MS;
    }
    for (let i = 0; i < MAX_OCCURRENCES && t < to.getTime(); i++) {
      if (untilExclusive && t >= untilExclusive.getTime()) break;
      out.push(rowToOccurrence(row, new Date(t)));
      t += 7 * DAY_MS;
    }
    return out;
  }

  // monthly: JST の年月を進め、同じ日（存在しなければスキップ）・同時刻で生成。
  const j = new Date(anchor.getTime() + JST_OFFSET_MS);
  const day = j.getUTCDate();
  const hh = j.getUTCHours();
  const mm = j.getUTCMinutes();
  let y = j.getUTCFullYear();
  let m = j.getUTCMonth(); // 0-11
  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    if (day <= daysInMonth) {
      // JST の壁時計 → UTC instant
      const t = Date.UTC(y, m, day, hh, mm) - JST_OFFSET_MS;
      if (t >= to.getTime()) break;
      if (t >= from.getTime() && t >= anchor.getTime()) {
        if (untilExclusive && t >= untilExclusive.getTime()) break;
        out.push(rowToOccurrence(row, new Date(t)));
      }
    }
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/**
 * [from, to) の範囲に該当するイベント（繰り返しは展開）を開始日時の昇順で返す。
 */
export async function listEventsInRange(
  db: NeonHttpDatabase<any>,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  const cols = {
    id: calendarEvents.id,
    title: calendarEvents.title,
    startsAt: calendarEvents.startsAt,
    allDay: calendarEvents.allDay,
    category: calendarEvents.category,
    description: calendarEvents.description,
    highlight: calendarEvents.highlight,
    recurrence: calendarEvents.recurrence,
    recurrenceUntil: calendarEvents.recurrenceUntil,
  };

  const rows = await db
    .select(cols)
    .from(calendarEvents)
    .where(
      or(
        // 単発: その月に開始
        and(
          eq(calendarEvents.recurrence, "none"),
          gte(calendarEvents.startsAt, from),
          lt(calendarEvents.startsAt, to),
        ),
        // 繰り返し: 範囲開始より前に始まり、until 無期限か範囲開始以降まで続く
        and(
          ne(calendarEvents.recurrence, "none"),
          lt(calendarEvents.startsAt, to),
          or(
            isNull(calendarEvents.recurrenceUntil),
            gte(calendarEvents.recurrenceUntil, from),
          ),
        ),
      ),
    );

  const out: CalendarEvent[] = [];
  for (const row of rows as Array<(typeof rows)[number] & { recurrence: Recurrence }>) {
    if (row.recurrence === "none") {
      out.push(rowToOccurrence(row, row.startsAt));
    } else {
      // until が範囲開始より前なら展開しても 0 件なので軽くスキップ
      if (row.recurrenceUntil && row.recurrenceUntil.getTime() + DAY_MS <= from.getTime()) {
        continue;
      }
      out.push(...expand(row, from, to));
    }
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}

const returning = {
  id: calendarEvents.id,
  title: calendarEvents.title,
  startsAt: calendarEvents.startsAt,
  allDay: calendarEvents.allDay,
  category: calendarEvents.category,
  description: calendarEvents.description,
  highlight: calendarEvents.highlight,
  recurrence: calendarEvents.recurrence,
  recurrenceUntil: calendarEvents.recurrenceUntil,
} as const;

export async function createEvent(
  db: NeonHttpDatabase<any>,
  input: EventInput,
  createdBy: string | null,
): Promise<CalendarEvent> {
  const [row] = await db
    .insert(calendarEvents)
    .values({ ...input, createdBy })
    .returning(returning);
  return rowToOccurrence(row as typeof row & { recurrence: Recurrence }, row.startsAt);
}

export async function updateEvent(
  db: NeonHttpDatabase<any>,
  id: string,
  input: EventInput,
): Promise<CalendarEvent | null> {
  const [row] = await db
    .update(calendarEvents)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(calendarEvents.id, id))
    .returning(returning);
  if (!row) return null;
  return rowToOccurrence(row as typeof row & { recurrence: Recurrence }, row.startsAt);
}

export async function deleteEvent(
  db: NeonHttpDatabase<any>,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .returning({ id: calendarEvents.id });
  return rows.length > 0;
}
