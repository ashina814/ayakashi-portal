import { createDb } from "./packages/db/src/client.js";
import { users } from "./packages/db/src/schema/auth.js";
import * as dotenv from "dotenv";

dotenv.config();

async function testDb() {
  try {
    console.log("Connecting to DB...");
    const db = createDb(process.env.DATABASE_URL!);
    console.log("DB instance created");
    
    // Test a simple query
    const allUsers = await db.select().from(users).limit(1);
    console.log("Query success:", allUsers);
  } catch (e) {
    console.error("DB Error:", e);
  }
}
testDb();
