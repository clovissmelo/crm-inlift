import { initDb } from "../lib/db";

async function main() {
  await initDb();
  console.log("Migrações aplicadas com sucesso.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
