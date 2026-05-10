/// <reference types="astro/client" />

import type { Session } from "@auth/core/types";

declare namespace App {
  interface Locals {
    /** Auth.js セッション（ミドルウェアで注入） */
    session: Session | null;

    /** Cloudflare Pages runtime（adapter が自動注入） */
    runtime: {
      env: {
        DISCORD_CLIENT_ID: string;
        DISCORD_CLIENT_SECRET: string;
        AUTH_SECRET: string;
        DATABASE_URL: string;
        GUILD_ID: string;
        TOKEN_ENCRYPTION_KEY?: string;
      };
    };
  }
}
