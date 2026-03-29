import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { appConfig, hasDatabaseConfig } from "./config";

const pool = hasDatabaseConfig()
  ? new Pool({
      connectionString: appConfig.databaseUrl,
    })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;
export const hasDatabase = Boolean(db);
