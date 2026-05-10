import { Auth } from "@auth/core";
import { createAuthConfig } from "./apps/web/src/lib/auth/config.js";

async function test() {
  const env = {
    DISCORD_CLIENT_ID: "test",
    DISCORD_CLIENT_SECRET: "test",
    AUTH_SECRET: "12345678901234567890123456789012",
    DATABASE_URL: "postgres://postgres:password@localhost/postgres",
    GUILD_ID: "test",
  };
  const config = createAuthConfig(env);
  const request = new Request("https://ayakashi-portal.pages.dev/api/auth/csrf");
  const response = await Auth(request, config);
  console.log("Status:", response.status);
  console.log("Body:", await response.text());
}
test();
