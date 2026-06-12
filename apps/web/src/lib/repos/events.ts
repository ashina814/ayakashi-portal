/**
 * カレンダーイベント Repository
 *
 * calendar_events テーブルの読み書きをカプセル化。
 * 表示は starts_at の範囲（その月）で引く。編集系は admin 限定（API 側で保護）。
 *
 * 繰り返しイベント（recurrence != 'none'）は DB に 1 行だけ持ち、
 * listEventsInRange が要求された範囲の該当日へ「展開（occurrence）」して返す。
 * シリーズ全体の編集・削除は各 occurrence が共有する元行の id を操作する。
 *
 * 「この回だけ」の編集・削除は calendar_event_overrides で表現する:
 * - cancelled=true … その回を中止（admin には薄く表示、一般には非表示）。
 * - cancelled=false … その回だけ別内容に差し替え。
 * 突合キーは (series_id, occurrence_date=JST日付)。日付は動かさない。
 */

import { and, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { calendarEvents, calendarEventOverrides } from "@ayakashi/db";

export type Recurrence = "none" | "weekly" | "monthly";

/** occurrence に同梱するシリーズ元の値（「シリーズ全体」編集の初期値用）。 */
export interface OccurrenceSeriesBase {
  title: string;
  startsAt: Date;
  allDay: boolean;
  category: string | null;
  description: string | null;
  highlight: boolean;
}

/**
 * 表示用の 1 回分（occurrence）。
 * - startsAt … その回の日時（展開・上書き後）。
 * - occurrenceDate … その回の JST 日付（YYYY-MM-DD）。例外の突合キー。
 * - isOverride … この回が override を持つか。
 * - cancelled … この回が中止か（admin 表示用）。
 * - seriesStartsAt … シリーズの起点（= DB の starts_at）。
 * - series … 繰り返しのときシリーズ元の値（単発は null）。
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
  occurrenceDate: string;
  isOverride: boolean;
  cancelled: boolean;
  series: OccurrenceSeriesBase | null;
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

/** 「この回だけ」差し替えの入力（日付は occurrenceDate 側で固定）。 */
export interface OverrideInput {
  title: string;
  startsAt: Date;
  allDay: boolean;
  category: string | null;
  description: string | null;
  highlight: boolean;
}

type SeriesRow = {
  id: string;
  title: string;
  startsAt: Date;
  allDay: boolean;
  category: string | null;
  description: string | null;
  highlight: boolean;
  recurrence: Recurrence;
  recurrenceUntil: Date | null;
};

type OverrideRow = {
  seriesId: string;
  occurrenceDate: string;
  cancelled: boolean;
  title: string | null;
  startsAt: Date | null;
  allDay: boolean | null;
  category: string | null;
  description: string | null;
  highlight: boolean | null;
};

const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3600 * 1000;

/** 暴走防止（毎週でも数年分は超えない）。 */
const MAX_OCCURRENCES = 800;

/** JST 基準の YYYY-MM-DD を返す。 */
function jstDateKey(d: Date): string {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  const y = j.getUTCFullYear();
  const m = String(j.getUTCMonth() + 1).padStart(2, "0");
  const day = String(j.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 単発行 → occurrence（展開なし）。 */
function singleOccurrence(row: SeriesRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.startsAt,
    allDay: row.allDay,
    category: row.category,
    description: row.description,
    highlight: row.highlight,
    recurrence: row.recurrence,
    seriesStartsAt: row.startsAt,
    recurrenceUntil: row.recurrenceUntil,
    occurrenceDate: jstDateKey(row.startsAt),
    isOverride: false,
    cancelled: false,
    series: null,
  };
}

/** シリーズ行の 1 回分を occurrence へ（override があれば反映）。 */
function recurringOccurrence(
  row: SeriesRow,
  startsAt: Date,
  override: OverrideRow | undefined,
): CalendarEvent {
  const base: OccurrenceSeriesBase = {
    title: row.title,
    startsAt: row.startsAt,
    allDay: row.allDay,
    category: row.category,
    description: row.description,
    highlight: row.highlight,
  };
  const occurrenceDate = jstDateKey(startsAt);

  if (override && !override.cancelled) {
    // 差し替え: スナップショット列を採用（null はシリーズ値にフォールバック）
    return {
      id: row.id,
      title: override.title ?? row.title,
      startsAt: override.startsAt ?? startsAt,
      allDay: override.allDay ?? row.allDay,
      category: override.category,
      description: override.description,
      highlight: override.highlight ?? row.highlight,
      recurrence: row.recurrence,
      seriesStartsAt: row.startsAt,
      recurrenceUntil: row.recurrenceUntil,
      occurrenceDate,
      isOverride: true,
      cancelled: false,
      series: base,
    };
  }

  // 通常 or 中止（中止はシリーズ値で表示し cancelled フラグを立てる）
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
    occurrenceDate,
    isOverride: Boolean(override),
    cancelled: Boolean(override?.cancelled),
    series: base,
  };
}

/**
 * 繰り返し行を [from, to) に重なる occurrence へ展開する。
 * 日本は固定 +09:00 なので、起点に「週/月」を足せば曜日・日・時刻は保たれる。
 */
function expand(
  row: SeriesRow,
  from: Date,
  to: Date,
  overrides: Map<string, OverrideRow>,
): CalendarEvent[] {
  const anchor = row.startsAt;
  const untilExclusive = row.recurrenceUntil
    ? new Date(row.recurrenceUntil.getTime() + DAY_MS)
    : null;
  const out: CalendarEvent[] = [];
  const push = (t: number) => {
    const startsAt = new Date(t);
    out.push(recurringOccurrence(row, startsAt, overrides.get(jstDateKey(startsAt))));
  };

  if (row.recurrence === "weekly") {
    let t = anchor.getTime();
    if (t < from.getTime()) {
      const steps = Math.ceil((from.getTime() - t) / (7 * DAY_MS));
      t += steps * 7 * DAY_MS;
    }
    for (let i = 0; i < MAX_OCCURRENCES && t < to.getTime(); i++) {
      if (untilExclusive && t >= untilExclusive.getTime()) break;
      push(t);
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
      const t = Date.UTC(y, m, day, hh, mm) - JST_OFFSET_MS;
      if (t >= to.getTime()) break;
      if (t >= from.getTime() && t >= anchor.getTime()) {
        if (untilExclusive && t >= untilExclusive.getTime()) break;
        push(t);
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

const SERIES_COLS = {
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

/**
 * [from, to) の範囲に該当するイベント（繰り返しは展開 + 例外反映）を
 * 開始日時の昇順で返す。中止（cancelled）も含めて返すので、
 * 一般ユーザー向けには呼び出し側で cancelled を除外すること。
 */
export async function listEventsInRange(
  db: NeonHttpDatabase<any>,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  const rows = (await db
    .select(SERIES_COLS)
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
    )) as SeriesRow[];

  const seriesIds = rows.filter((r) => r.recurrence !== "none").map((r) => r.id);

  // 例外（override）をまとめて取得し series 毎にマップ化。
  const bySeries = new Map<string, Map<string, OverrideRow>>();
  if (seriesIds.length > 0) {
    const fromKey = jstDateKey(from);
    const toKey = jstDateKey(to);
    const ovRows = (await db
      .select({
        seriesId: calendarEventOverrides.seriesId,
        occurrenceDate: calendarEventOverrides.occurrenceDate,
        cancelled: calendarEventOverrides.cancelled,
        title: calendarEventOverrides.title,
        startsAt: calendarEventOverrides.startsAt,
        allDay: calendarEventOverrides.allDay,
        category: calendarEventOverrides.category,
        description: calendarEventOverrides.description,
        highlight: calendarEventOverrides.highlight,
      })
      .from(calendarEventOverrides)
      .where(
        and(
          inArray(calendarEventOverrides.seriesId, seriesIds),
          gte(calendarEventOverrides.occurrenceDate, fromKey),
          lt(calendarEventOverrides.occurrenceDate, toKey),
        ),
      )) as OverrideRow[];
    for (const ov of ovRows) {
      let m = bySeries.get(ov.seriesId);
      if (!m) {
        m = new Map();
        bySeries.set(ov.seriesId, m);
      }
      m.set(ov.occurrenceDate, ov);
    }
  }

  const out: CalendarEvent[] = [];
  for (const row of rows) {
    if (row.recurrence === "none") {
      out.push(singleOccurrence(row));
    } else {
      if (row.recurrenceUntil && row.recurrenceUntil.getTime() + DAY_MS <= from.getTime()) {
        continue;
      }
      out.push(...expand(row, from, to, bySeries.get(row.id) ?? new Map()));
    }
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}

const RETURN_COLS = {
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
    .returning(RETURN_COLS);
  return singleOccurrence(row as SeriesRow);
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
    .returning(RETURN_COLS);
  if (!row) return null;
  return singleOccurrence(row as SeriesRow);
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

/** シリーズが繰り返し（recurrence != 'none'）か確認。例外操作の前提チェック用。 */
export async function isRecurringSeries(
  db: NeonHttpDatabase<any>,
  id: string,
): Promise<boolean> {
  const [row] = await db
    .select({ recurrence: calendarEvents.recurrence })
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id));
  return Boolean(row) && row.recurrence !== "none";
}

/**
 * 「この回だけ」差し替えを upsert（(series_id, occurrence_date) で一意）。
 * occurrenceDate は YYYY-MM-DD（JST）。cancelled は false に戻す。
 */
export async function upsertOccurrenceOverride(
  db: NeonHttpDatabase<any>,
  seriesId: string,
  occurrenceDate: string,
  input: OverrideInput,
): Promise<void> {
  await db
    .insert(calendarEventOverrides)
    .values({
      seriesId,
      occurrenceDate,
      cancelled: false,
      title: input.title,
      startsAt: input.startsAt,
      allDay: input.allDay,
      category: input.category,
      description: input.description,
      highlight: input.highlight,
    })
    .onConflictDoUpdate({
      target: [
        calendarEventOverrides.seriesId,
        calendarEventOverrides.occurrenceDate,
      ],
      set: {
        cancelled: false,
        title: input.title,
        startsAt: input.startsAt,
        allDay: input.allDay,
        category: input.category,
        description: input.description,
        highlight: input.highlight,
        updatedAt: new Date(),
      },
    });
}

/** 「この回だけ中止」。cancelled=true で upsert。 */
export async function cancelOccurrence(
  db: NeonHttpDatabase<any>,
  seriesId: string,
  occurrenceDate: string,
): Promise<void> {
  await db
    .insert(calendarEventOverrides)
    .values({ seriesId, occurrenceDate, cancelled: true })
    .onConflictDoUpdate({
      target: [
        calendarEventOverrides.seriesId,
        calendarEventOverrides.occurrenceDate,
      ],
      set: {
        cancelled: true,
        title: null,
        startsAt: null,
        allDay: null,
        category: null,
        description: null,
        highlight: null,
        updatedAt: new Date(),
      },
    });
}

/** この回の例外を解除してシリーズ既定へ戻す（差し替え・中止の取り消し）。 */
export async function revertOccurrence(
  db: NeonHttpDatabase<any>,
  seriesId: string,
  occurrenceDate: string,
): Promise<void> {
  await db
    .delete(calendarEventOverrides)
    .where(
      and(
        eq(calendarEventOverrides.seriesId, seriesId),
        eq(calendarEventOverrides.occurrenceDate, occurrenceDate),
      ),
    );
}
