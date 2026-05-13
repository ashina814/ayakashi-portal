/**
 * Auth.js 設定（Cloudflare Workers 対応）
 *
 * - Discord OAuth provider (scope: identify email guilds.members.read)
 * - Drizzle adapter (Neon Serverless HTTP)
 * - DB セッション管理
 *
 * Cloudflare Workers では process.env が使えないため、
 * 環境変数は呼び出し側から注入する。
 */

import Discord from "@auth/core/providers/discord";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { createDb } from "@ayakashi/db/client";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@ayakashi/db";
import type { AuthConfig } from "@auth/core";
import { fetchGuildMember } from "../discord/api";
import { syncGuildMember } from "../repos/membership";

/** Discord OAuth scope: identify + email + guilds.members.read */
const DISCORD_SCOPES = "identify email guilds.members.read";

/**
 * 環境変数から AuthConfig を生成する。
 * Cloudflare Workers では request ごとに env が渡されるため、
 * ファクトリ関数にする。
 */
export function createAuthConfig(env: {
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  AUTH_SECRET: string;
  DATABASE_URL: string;
  GUILD_ID: string;
}): AuthConfig {
  const db = createDb(env.DATABASE_URL);

  return {
    // DB セッション管理
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),

    providers: [
      Discord({
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        // Auth.js の merge() は string → object の型変換をサポートしていないため
        // object 形式の override は無視される。string で渡すことで上書き可能。
        authorization: `https://discord.com/api/oauth2/authorize?scope=${encodeURIComponent(DISCORD_SCOPES)}&prompt=consent`,
      }),
    ],

    // セッション戦略: DB（JWT ではなくサーバーサイド）
    session: {
      strategy: "database",
      // 引き継ぎ資料: 有効期限 1〜2 週間
      maxAge: 14 * 24 * 60 * 60, // 14 days
    },

    trustHost: true,
    secret: env.AUTH_SECRET,
    basePath: "/api/auth",

    // カスタムページ
    pages: {
      signIn: "/login",
      signOut: "/logout",
      // error はデフォルトのままで OK
    },

    callbacks: {
      /**
       * サインイン時に Discord のメンバー情報を取得し DB に同期する。
       * サーバー未参加なら拒否、同期失敗はログだけ吐いて通す。
       */
      async signIn({ user, account }) {
        if (
          account?.provider === "discord" &&
          account.access_token &&
          env.GUILD_ID &&
          user.id
        ) {
          try {
            const discordMember = await fetchGuildMember(
              account.access_token,
              env.GUILD_ID,
            );
            if (discordMember) {
              await syncGuildMember(db, user.id, discordMember);
            } else {
              console.warn(`[auth] User ${user.id} is not in guild ${env.GUILD_ID}`);
              return false;
            }
          } catch (e) {
            console.error("[auth] Failed to sync guild member on sign in:", e);
          }
        }
        return true;
      },

      /**
       * セッションに userId を含める（DB セッション戦略の場合 user は自動で含まれる）
       */
      session({ session, user }) {
        if (session.user && user) {
          session.user.id = user.id;
        }
        return session;
      },
    },
  };
}
