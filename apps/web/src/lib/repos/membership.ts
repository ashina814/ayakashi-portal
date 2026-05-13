/**
 * Membership Repository
 *
 * members / roles / member_roles テーブルの操作をカプセル化。
 * MVP段階では Discord OAuth ログイン時の同期処理を担う。
 */

import { eq, inArray, asc } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { members, roles, memberRoles, roleAliases } from "@ayakashi/db";

export interface MemberWithRoles {
  nickname: string | null;
  joinedAt: Date | null;
  bio: string | null;
  roles: { id: string; name: string; color: string | null; sortOrder: number }[];
}

/**
 * users.id から本人のメンバー情報（ニックネーム・入鯖日・ロール一覧）を取得する。
 * Bot 同期前でも OAuth ログイン時の syncGuildMember で書かれている前提。
 */
export async function getMemberWithRoles(
  db: NeonHttpDatabase<any>,
  userId: string,
): Promise<MemberWithRoles | null> {
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.userId, userId))
    .limit(1);

  if (!member) return null;

  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      color: roles.color,
      sortOrder: roles.sortOrder,
    })
    .from(memberRoles)
    .innerJoin(roles, eq(memberRoles.roleId, roles.id))
    .where(eq(memberRoles.memberId, member.id))
    .orderBy(asc(roles.sortOrder), asc(roles.name));

  return {
    nickname: member.nickname,
    joinedAt: member.joinedAt,
    bio: member.bio,
    roles: rows,
  };
}

/** members.bio の最大文字数（クライアント / サーバー両方で参照） */
export const BIO_MAX_LENGTH = 1000;

/** メンバー総数（admin ダッシュ用） */
export async function countMembers(
  db: NeonHttpDatabase<any>,
): Promise<number> {
  const rows = await db.select({ id: members.id }).from(members);
  return rows.length;
}

export interface MemberListItem {
  id: string;
  userId: string;
  userName: string | null;
  userImage: string | null;
  nickname: string | null;
  joinedAt: Date | null;
  roleCount: number;
}

/**
 * 全メンバーの一覧（admin 用）。ロール数は GROUP BY で集計。
 * Bot 未稼働時は roleCount = 0 のまま。
 */
export async function listAllMembers(
  db: NeonHttpDatabase<any>,
): Promise<MemberListItem[]> {
  // 二段クエリ: 行と roleCount を別取得して TS でマージ（neon-http は GROUP BY も使えるが
  // 集計関数の型推論が薄いので分離した方が安全）。
  const baseRows = await db
    .select({
      id: members.id,
      userId: members.userId,
      userName: users.name,
      userImage: users.image,
      nickname: members.nickname,
      joinedAt: members.joinedAt,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .orderBy(asc(members.joinedAt));

  const roleRows = await db
    .select({ memberId: memberRoles.memberId, roleId: memberRoles.roleId })
    .from(memberRoles);

  const counts = new Map<string, number>();
  for (const r of roleRows) {
    counts.set(r.memberId, (counts.get(r.memberId) ?? 0) + 1);
  }

  return baseRows.map((m) => ({
    ...m,
    roleCount: counts.get(m.id) ?? 0,
  }));
}

/**
 * ユーザーが保持するロールに紐づく alias 集合を返す。
 * members → member_roles → role_aliases の join。
 * members 行が無い（同期前）場合は空配列。
 */
export async function getMemberRoleAliases(
  db: NeonHttpDatabase<any>,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ alias: roleAliases.alias })
    .from(members)
    .innerJoin(memberRoles, eq(memberRoles.memberId, members.id))
    .innerJoin(roleAliases, eq(roleAliases.roleId, memberRoles.roleId))
    .where(eq(members.userId, userId));

  return Array.from(new Set(rows.map((r) => r.alias)));
}

/**
 * 自己紹介を更新する。同期処理を介さず本人のみが書き込む想定。
 * members 行が存在しない（同期前）場合は何もしないで false を返す。
 */
export async function updateMemberBio(
  db: NeonHttpDatabase<any>,
  userId: string,
  bio: string,
): Promise<boolean> {
  const normalized = bio.trim();
  if (normalized.length > BIO_MAX_LENGTH) {
    throw new Error(
      `bio is too long: ${normalized.length} > ${BIO_MAX_LENGTH}`,
    );
  }

  const result = await db
    .update(members)
    .set({
      bio: normalized.length === 0 ? null : normalized,
      updatedAt: new Date(),
    })
    .where(eq(members.userId, userId))
    .returning({ id: members.id });

  return result.length > 0;
}

/**
 * ログイン時に Discord のメンバー情報を DB に同期する
 */
export async function syncGuildMember(
  db: NeonHttpDatabase<any>,
  userId: string, // users.id (UUID)
  discordMember: { nick: string | null; joined_at: string; roles: string[] }
) {
  // 1. members テーブルの Upsert
  const [member] = await db
    .insert(members)
    .values({
      userId,
      nickname: discordMember.nick,
      joinedAt: new Date(discordMember.joined_at),
      lastRoleSyncAt: new Date(),
    })
    .onConflictDoUpdate({
      target: members.userId,
      set: {
        nickname: discordMember.nick,
        lastRoleSyncAt: new Date(),
      },
    })
    .returning();

  // 2. roles テーブルの解決（未登録のロールはプレースホルダーとして作成）
  if (discordMember.roles.length > 0) {
    const existingRoles = await db
      .select({ id: roles.id, discordRoleId: roles.discordRoleId })
      .from(roles)
      .where(inArray(roles.discordRoleId, discordMember.roles));

    const existingDiscordRoleIds = new Set(existingRoles.map(r => r.discordRoleId));
    const missingDiscordRoleIds = discordMember.roles.filter(id => !existingDiscordRoleIds.has(id));

    let allRoles = [...existingRoles];

    if (missingDiscordRoleIds.length > 0) {
      // Bot がまだ詳細を取り込んでいない未知のロールの場合、IDだけで仮登録する
      const insertedRoles = await db
        .insert(roles)
        .values(
          missingDiscordRoleIds.map(id => ({
            discordRoleId: id,
            name: `Unknown Role (${id})`,
          }))
        )
        .onConflictDoNothing()
        .returning({ id: roles.id, discordRoleId: roles.discordRoleId });

      allRoles = [...allRoles, ...insertedRoles];

      // onConflictDoNothing によって returning が漏れた場合の再取得
      if (allRoles.length < discordMember.roles.length) {
        allRoles = await db
          .select({ id: roles.id, discordRoleId: roles.discordRoleId })
          .from(roles)
          .where(inArray(roles.discordRoleId, discordMember.roles));
      }
    }

    // 3. member_roles テーブルの洗い替え
    await db.delete(memberRoles).where(eq(memberRoles.memberId, member.id));
    
    if (allRoles.length > 0) {
      await db.insert(memberRoles).values(
        allRoles.map(r => ({
          memberId: member.id,
          roleId: r.id,
        }))
      );
    }
  } else {
    // ロールが一つもない場合
    await db.delete(memberRoles).where(eq(memberRoles.memberId, member.id));
  }
}
