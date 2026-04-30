import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const rows =
  await sql`UPDATE "user" SET role = 'admin' WHERE email = 'orbasker@gmail.com' RETURNING id, email, role`;
console.log(rows);
await sql.end();
