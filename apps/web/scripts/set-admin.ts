import postgres from "postgres";

const targetEmail = process.argv[2] ?? process.env.TARGET_EMAIL;
if (!targetEmail) {
  throw new Error(
    "Missing target email. Pass it as the first CLI argument or set TARGET_EMAIL.",
  );
}
if (process.env.CONFIRM_SET_ADMIN !== "YES") {
  throw new Error(
    "Confirmation required. Set CONFIRM_SET_ADMIN=YES to run this script.",
  );
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const sql = postgres(databaseUrl);
const rows =
  await sql`UPDATE "user" SET role = 'admin' WHERE email = ${targetEmail} RETURNING id, email, role`;
console.log(`Updated ${rows.length} user(s) to admin for email: ${targetEmail}`);
console.log(rows);
await sql.end();
