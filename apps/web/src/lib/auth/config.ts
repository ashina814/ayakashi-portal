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
import { neon } from "@neondatabase/serverless";
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
export function createAuthConfig(
  env: {
    DISCORD_CLIENT_ID: string;
    DISCORD_CLIENT_SECRET: string;
    AUTH_SECRET: string;
    DATABASE_URL: string;
  },
  waitUntil?: (p: Promise<unknown>) => void,
): AuthConfig {
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
        authorization: {
          params: {
            scope: DISCORD_SCOPES,
          },
        },
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
      // error, signOut はデフォルトのままで OK
    },

    callbacks: {
      /**
       * サインイン時に Discord のメンバー情報を取得し DB に同期する
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
              return false; // サーバーに未参加の場合はログインを拒否
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

    // エラー調査用に debug を有効化し、ロガーを設定
    debug: true,
    logger: {
      error(code, ...message) {
        console.error("[AuthError]", code, ...message);

        // 再帰的に Error の cause チェーンを文字列化する。
        // AdapterError の cause は Error or 任意のオブジェクトのことが多い。
        const serializeCause = (c: unknown, depth = 0): string => {
          if (c == null) return "";
          if (depth > 5) return "<max depth>";
          if (c instanceof Error) {
            const inner = (c as any).cause;
            const innerStr = inner != null ? ` <- ${serializeCause(inner, depth + 1)}` : "";
            return `${c.name}: ${c.message}${innerStr}`;
          }
          if (typeof c === "object") {
            try {
              return JSON.stringify(c, Object.getOwnPropertyNames(c));
            } catch {
              return "<unserializable>";
            }
          }
          return String(c);
        };

        let name = "Error";
        let msg = "";
        let cause = "";
        let stack = "";
        if (code instanceof Error) {
          name = code.name;
          msg = code.message;
          cause = serializeCause((code as any).cause);
          stack = code.stack ?? "";
        } else {
          msg = String(code);
        }

        // Cloudflare Pages の isolate 間で globalThis は共有されないため
        // /api/debug から拾えるよう Neon に永続化する。
        // waitUntil で Cloudflare に書き込み完了まで isolate を生かしてもらう。
        const sql = neon(env.DATABASE_URL);
        const writeJob = (async () => {
          try {
            await sql`CREATE TABLE IF NOT EXISTS auth_error_log (
              id SERIAL PRIMARY KEY,
              name TEXT,
              message TEXT,
              cause TEXT,
              stack TEXT,
              extra TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`;
            const extraStr = JSON.stringify(
              message,
              (_k, v) => {
                if (v instanceof Error) {
                  return {
                    name: v.name,
                    message: v.message,
                    cause: serializeCause((v as any).cause),
                    stack: v.stack,
                  };
                }
                return v;
              },
            );
            await sql`INSERT INTO auth_error_log (name, message, cause, stack, extra)
              VALUES (${name}, ${msg}, ${cause}, ${stack}, ${extraStr})`;
          } catch (e) {
            console.error("[AuthError] failed to persist error to neon:", e);
          }
        })();
        if (waitUntil) {
          waitUntil(writeJob);
        }
      },
      warn(code, ...message) {
        console.warn("[AuthWarn]", code, ...message);
      },
      debug(code, ...message) {
        console.log("[AuthDebug]", code, ...message);
      },
    },
  };
}
