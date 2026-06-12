/**
 * @ayakashi/db — 全スキーマの re-export
 *
 * 利用側:
 *   import { users, members, wikiPages, ... } from '@ayakashi/db';
 *   import { createDb, type Database } from '@ayakashi/db/client';
 */

// Auth.js テーブル
export {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "./schema/auth";

// メンバー・ロール
export {
  members,
  roles,
  memberRoles,
  roleAliases,
} from "./schema/members";

// Wiki
export {
  wikiPages,
  wikiRevisions,
  wikiVisibility,
} from "./schema/wiki";

// 活動量（Bot 用、MVP は空運用）
export { activityDaily } from "./schema/activity";

// 通知キュー（Bot 用、MVP は空運用）
export {
  notificationStatusEnum,
  notifications,
} from "./schema/notifications";

// 監査ログ
export { auditLog } from "./schema/audit";

// カレンダーイベント
export { calendarEvents } from "./schema/calendar";
