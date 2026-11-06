// 一次性執行器：連 Supabase Postgres，跑 schema + seed
// 用法: node apply_db.mjs <host> <port> [password]
import pg from "pg";
import { readFileSync } from "node:fs";

const [host, port, pw] = process.argv.slice(2);
const conn = async () => {
  const client = new pg.Client({
    host, port: Number(port), user: "postgres.uhunwwvjzuaauklzzuwk",
    password: pw, database: "postgres", connectionTimeoutMillis: 8000,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  return client;
};

async function runFile(client, file) {
  const sql = readFileSync(file, "utf8");
  const r = await client.query(sql);
  return r;
}

const script = `
select 1 as ok
`.trim();

const c = await conn();
try {
  const t = await c.query("select current_user, version()");
  console.log("CONNECTED:", t.rows[0]);
  for (const f of ["supabase/schema.sql", "supabase/seed.sql"]) {
    await runFile(c, f);
    console.log("OK:", f);
  }
  const chk = await c.query(`
    select
      (select count(*) from act_groups) act_groups,
      (select count(*) from students) students,
      (select count(*) from points) points,
      (select count(*) from banners) banners
  `);
  console.log("CHECK:", chk.rows[0]);
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
