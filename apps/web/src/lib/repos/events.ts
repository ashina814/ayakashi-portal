/**
 * カレンダーイベント Repository
 *
 * calendar_events テーブルの読み書きをカプセル化。
 * 表示は starts_at の範囲（その月）で引く。編集系は admin 限定（API 側で保護）。
 */

import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { calendarEvents } from "@ayakashi/db";

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: Date;
  allDay: boolean;
  category: string | null;
  description: string | null;
  highlight: boolean;
}

export interface EventInput {
  title: string;
  startsAt: Date;
  allDay: boolean;
  category: string | null;
  description: string | null;
  highlight: boolean;
}

/**
 * [from, to) の範囲に開始するイベントを開始日時の昇順で返す。
 */
export async function listEventsInRange(
  db: NeonHttpDatabase<any>,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  const rows = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startsAt: calendarEvents.startsAt,
      allDay: calendarEvents.allDay,
      category: calendarEvents.category,
      description: calendarEvents.description,
      highlight: calendarEvents.highlight,
    })
    .from(calendarEvents)
    .where(and(gte(calendarEvents.startsAt, from), lt(calendarEvents.startsAt, to)))
    .orderBy(asc(calendarEvents.startsAt));
  return rows;
}

export async function createEvent(
  db: NeonHttpDatabase<any>,
  input: EventInput,
  createdBy: string | null,
): Promise<CalendarEvent> {
  const [row] = await db
    .insert(calendarEvents)
    .values({ ...input, createdBy })
    .returning({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startsAt: calendarEvents.startsAt,
      allDay: calendarEvents.allDay,
      category: calendarEvents.category,
      description: calendarEvents.description,
      highlight: calendarEvents.highlight,
    });
  return row;
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
    .returning({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startsAt: calendarEvents.startsAt,
      allDay: calendarEvents.allDay,
      category: calendarEvents.category,
      description: calendarEvents.description,
      highlight: calendarEvents.highlight,
    });
  return row ?? null;
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
