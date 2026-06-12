/**
 * カレンダーイベント
 *
 * 運営（admin）が登録・編集する単発イベント。繰り返しは持たない。
 * 公開カレンダー（/calendar）が starts_at の月で引いて表示する。
 *
 * - all_day=true の時は時刻を無視して「終日」表示。
 * - category は自由テキスト（定例 / 雑談 / 大集会 / システム 等）。
 * - highlight=true は映え用の暖色強調（満月祭のような大きな集い）。
 *
 * 繰り返し（recurrence）:
 * - 'none'    … 単発（starts_at の日だけ）。
 * - 'weekly'  … starts_at と同じ曜日・時刻で毎週。
 * - 'monthly' … starts_at と同じ日（毎月N日）・時刻で毎月。
 *   曜日 / 日は starts_at から導出するので追加列は持たない。
 * - recurrence_until … シリーズの終端（含む。JST 基準）。null は無期限。
 *   各月の表示時に該当日へ展開する（listEventsInRange）。
 *   シリーズ全体の編集・削除は calendar_events 行を直接操作する。
 *   「この回だけ」の編集・削除は calendar_event_overrides で表現する。
 */

import {
  pgTable,
  text,
  uuid,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    /** 開始日時（終日イベントでも日付の基準として使う） */
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    /** 区分ラベル（チップ表示）。空可 */
    category: text("category"),
    /** 補足説明（アジェンダのメタ行）。空可 */
    description: text("description"),
    /** 暖色強調（大きな集い） */
    highlight: boolean("highlight").notNull().default(false),
    /** 繰り返し種別。曜日/日は starts_at から導出 */
    recurrence: text("recurrence", { enum: ["none", "weekly", "monthly"] })
      .notNull()
      .default("none"),
    /** シリーズ終端（含む / JST）。null は無期限 */
    recurrenceUntil: timestamp("recurrence_until", {
      withTimezone: true,
      mode: "date",
    }),
    /** 作成した運営の users.id（任意） */
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    startsAtIdx: index("calendar_events_starts_at_idx").on(table.startsAt),
  }),
);

/**
 * 繰り返しイベントの「この回だけ」例外（override / exception）
 *
 * (series_id, occurrence_date) で 1 回分を一意に指す。occurrence_date は
 * その回が本来並ぶ JST の日付（シリーズ展開のキー）。日付は動かさない方針なので、
 * 時刻変更は同じ日の中で starts_at に反映する。
 *
 * - cancelled=true … その回を中止（非表示）。スナップショット列は無視。
 * - cancelled=false … その回だけ別内容に差し替え。各列にスナップショットを持つ。
 *
 * シリーズ行（calendar_events）が消えたら CASCADE で例外も消える。
 */
export const calendarEventOverrides = pgTable(
  "calendar_event_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 対象シリーズ（calendar_events.id） */
    seriesId: uuid("series_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    /** 本来並ぶ回の JST 日付（YYYY-MM-DD）。展開時の突合キー */
    occurrenceDate: date("occurrence_date").notNull(),
    /** その回を中止（非表示）にする */
    cancelled: boolean("cancelled").notNull().default(false),
    // ── 差し替え用スナップショット（cancelled=false の時に使用）──
    title: text("title"),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    allDay: boolean("all_day"),
    category: text("category"),
    description: text("description"),
    highlight: boolean("highlight"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    seriesDateUq: uniqueIndex("calendar_event_overrides_series_date_uq").on(
      table.seriesId,
      table.occurrenceDate,
    ),
  }),
);
