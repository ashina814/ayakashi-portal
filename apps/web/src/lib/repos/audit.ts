/**
 * Audit Log Repository
 *
 * audit_log テーブルの読み取り。書き込みは各操作の API 側で行う想定で、
 * まだ運用上は空に近い。運営ダッシュで直近 N 件を出すための薄いヘルパ。
 */

import { desc, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { auditLog, users } from "@ayakashi/db";

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string | null;
  action: string;
  target: unknown;
  at: Date;
}

/** 直近 N 件の監査ログを user の表示名込みで取得 */
export async function listRecentAuditLog(
  db: NeonHttpDatabase<any>,
  limit = 20,
): Promise<AuditLogEntry[]> {
  return await db
    .select({
      id: auditLog.id,
      userId: auditLog.userId,
      userName: users.name,
      action: auditLog.action,
      target: auditLog.target,
      at: auditLog.at,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.at))
    .limit(limit);
}

/** 行数だけ取得（管理ダッシュ用） */
export async function countAuditLog(db: NeonHttpDatabase<any>): Promise<number> {
  const rows = await db.select({ id: auditLog.id }).from(auditLog);
  return rows.length;
}
