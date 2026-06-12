/**
 * LUXEL ポータル Bot — エントリポイント
 *
 * ロール同期に特化した軽量 bot。
 *  - 起動時: ギルドの全ロールを DB に同期（Unknown Role 解消）+ ログイン済み
 *    メンバーの member_roles を同期。
 *  - 常駐: ロールの作成/更新/削除、メンバーのロール変更をリアルタイム反映。
 *
 * 必要な権限: GUILD_MEMBERS 特権インテント（メンバーイベント用）。
 * メンバーの全キャッシュは保持しない設計（同期時に都度 fetch）。
 */

import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import { createDb } from "@ayakashi/db/client";
import {
  syncAllRoles,
  upsertRole,
  deleteRoleByDiscordId,
  syncMemberRoles,
} from "./sync.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN || !GUILD_ID || !DATABASE_URL) {
  console.error(
    "[bot] 環境変数が不足しています: DISCORD_BOT_TOKEN / GUILD_ID / DATABASE_URL",
  );
  process.exit(1);
}

const db = createDb(DATABASE_URL);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  // メンバーは常駐キャッシュせず、同期時に fetch する（省メモリ）
  partials: [Partials.GuildMember],
});

function log(...args: unknown[]) {
  console.log(`[bot ${new Date().toISOString()}]`, ...args);
}

client.once(Events.ClientReady, async (c) => {
  log(`logged in as ${c.user.tag}`);

  const guild = await c.guilds.fetch(GUILD_ID!).catch(() => null);
  if (!guild) {
    console.error(`[bot] guild ${GUILD_ID} に参加していません。招待を確認してください。`);
    return;
  }

  try {
    // ロールの完全同期
    await guild.roles.fetch();
    const n = await syncAllRoles(db, guild);
    log(`synced ${n} roles`);

    // ログイン済みメンバーの member_roles を同期
    const allMembers = await guild.members.fetch();
    let linked = 0;
    for (const member of allMembers.values()) {
      if (member.user.bot) continue;
      const ok = await syncMemberRoles(db, member);
      if (ok) linked++;
    }
    log(`synced roles for ${linked} portal-linked members (of ${allMembers.size})`);
  } catch (e) {
    console.error("[bot] 起動時同期に失敗:", e);
  }
});

// ─── ロールのリアルタイム同期 ───
client.on(Events.GuildRoleCreate, async (role) => {
  if (role.guild.id !== GUILD_ID) return;
  try {
    await upsertRole(db, role);
    log(`role created: ${role.name}`);
  } catch (e) {
    console.error("[bot] roleCreate sync 失敗:", e);
  }
});

client.on(Events.GuildRoleUpdate, async (_old, role) => {
  if (role.guild.id !== GUILD_ID) return;
  try {
    await upsertRole(db, role);
    log(`role updated: ${role.name}`);
  } catch (e) {
    console.error("[bot] roleUpdate sync 失敗:", e);
  }
});

client.on(Events.GuildRoleDelete, async (role) => {
  if (role.guild.id !== GUILD_ID) return;
  try {
    await deleteRoleByDiscordId(db, role.id);
    log(`role deleted: ${role.name}`);
  } catch (e) {
    console.error("[bot] roleDelete sync 失敗:", e);
  }
});

// ─── メンバーのロール変更 ───
client.on(Events.GuildMemberUpdate, async (_old, member) => {
  if (member.guild.id !== GUILD_ID || member.user.bot) return;
  try {
    const ok = await syncMemberRoles(db, member);
    if (ok) log(`member roles synced: ${member.user.tag}`);
  } catch (e) {
    console.error("[bot] guildMemberUpdate sync 失敗:", e);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== GUILD_ID || member.user.bot) return;
  try {
    // 参加直後はまだポータル未ログインのことが多い。連携があれば同期。
    await syncMemberRoles(db, member);
  } catch (e) {
    console.error("[bot] guildMemberAdd sync 失敗:", e);
  }
});

// ─── graceful shutdown ───
function shutdown(signal: string) {
  log(`received ${signal}, shutting down`);
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

client.login(TOKEN);
