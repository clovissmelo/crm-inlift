import bcrypt from "bcryptjs";
import { all, get, initDb, nowIso, run } from "../lib/db";
import { setUserRoles } from "../lib/users";

async function main() {
  await initDb();

  const name = process.env.ADMIN_NAME?.trim() || "Administrador";
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "Defina ADMIN_EMAIL e ADMIN_PASSWORD no ambiente antes de executar.\nExemplo:\n  set ADMIN_EMAIL=voce@inlift.com.br\n  set ADMIN_PASSWORD=********\n  npm run create-admin"
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("ADMIN_PASSWORD deve ter no mínimo 8 caracteres.");
    process.exit(1);
  }

  const existingUsers = await all<{ id: number }>("SELECT id FROM users LIMIT 1");
  const existingEmail = await get<{ id: number }>("SELECT id FROM users WHERE lower(email) = lower(@email)", { email });

  if (existingEmail) {
    console.error("Já existe usuário com este e-mail.");
    process.exit(1);
  }

  if (existingUsers.length > 0) {
    console.error("Já existem usuários no sistema. Use a tela de Cadastros para novos usuários.");
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = await run(
    `
      INSERT INTO users (name, email, status, password_hash, created_at)
      VALUES (@name, @email, 'active', @passwordHash, @createdAt)
    `,
    { name, email, passwordHash, createdAt: nowIso() }
  );

  const userId = result.lastInsertRowid;
  if (!userId) {
    console.error("Falha ao criar usuário.");
    process.exit(1);
  }

  await setUserRoles(userId, ["bdr", "product_owner", "manager", "admin"]);
  console.log(`Usuário administrador inicial criado: ${email}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
