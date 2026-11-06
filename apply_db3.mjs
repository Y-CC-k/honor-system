import pg from "pg";
import { readFileSync } from "node:fs";
import dns from "node:dns";

const { Client } = pg;
const pw = "klnes26562684";

// 強制 IPv4 解析
const addr = await new Promise((resolve, reject) => {
  dns.lookup("db.uhunwwvjzuaauklzzuwk.supabase.co", { family: 4 }, (err, addr) => {
    if (err) reject(err);
    else resolve(addr);
  });
});
console.log("Resolved IPv4:", addr);

const cs =
  "postgresql://postgres:" +
  pw +
  "@" +
  addr +
  ":5432/postgres?sslmode=require";
const c = new Client({ connectionString: cs, connectionTimeoutMillis: 20000 });

async function main() {
  await c.connect();
  console.log("CONNECTED OK");
  for (const f of ["supabase/schema.sql", "supabase/seed.sql"]) {
    await c.query(readFileSync(f, "utf8"));
    console.log("OK", f);
  }
  const chk = await c.query(
    "select (select count(*) from act_groups) as act_groups,(select count(*) from students) as students,(select count(*) from points) as points,(select count(*) from banners) as banners"
  );
  console.log("CHECK", JSON.stringify(chk.rows[0]));
  const stu = await c.query(
    "select stu_id, stu_name, card_id from students where stu_id = $1",
    ["110047"]
  );
  console.log("STUDENT", JSON.stringify(stu.rows[0]));
  await c.end();
}
main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
