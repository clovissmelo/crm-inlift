import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { get, nowIso, run } from "@/lib/db";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg"
]);

const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"];

function storageRoot() {
  return path.join(process.cwd(), "storage", "proposals");
}

export function validateProposalFile(file: File) {
  if (file.size > MAX_BYTES) return "Arquivo excede 15 MB";
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return "Tipo de arquivo não permitido";
  if (file.type && !ALLOWED_MIME.has(file.type) && file.type !== "application/octet-stream") {
    return "Tipo MIME não permitido";
  }
  return null;
}

export async function addProposalVersion(input: {
  opportunity_id: number;
  file: File;
  user_id: number;
  proposed_value?: number | null;
  valid_until?: string | null;
  notes?: string | null;
}) {
  const err = validateProposalFile(input.file);
  if (err) throw new Error(err);

  const last = await get<{ version_number: number }>(
    `SELECT version_number FROM opportunity_proposals WHERE opportunity_id = @id ORDER BY version_number DESC LIMIT 1`,
    { id: input.opportunity_id }
  );
  const version = (last?.version_number ?? 0) + 1;

  const safeName = input.file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  const token = crypto.randomBytes(16).toString("hex");
  const dir = path.join(storageRoot(), String(input.opportunity_id));
  await fs.mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, `${token}_${safeName}`);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  await fs.writeFile(storagePath, buffer);

  const relativePath = path.relative(process.cwd(), storagePath).split(path.sep).join("/");

  const r = await run(
    `
      INSERT INTO opportunity_proposals (
        opportunity_id, version_number, original_filename, storage_path, mime_type, file_size_bytes,
        proposed_value, valid_until, notes, status, uploaded_by_user_id, created_at
      ) VALUES (
        @oppId, @version, @filename, @storagePath, @mime, @size,
        @value, @validUntil, @notes, 'draft', @userId, @now
      )
    `,
    {
      oppId: input.opportunity_id,
      version,
      filename: input.file.name,
      storagePath: relativePath,
      mime: input.file.type || null,
      size: input.file.size,
      value: input.proposed_value ?? null,
      validUntil: input.valid_until ?? null,
      notes: input.notes ?? null,
      userId: input.user_id,
      now: nowIso()
    }
  );
  return { id: r.lastInsertRowid, version_number: version };
}

export async function markProposalSent(input: {
  proposal_id: number;
  opportunity_id: number;
  sent_at: string;
  sent_channel: string;
  user_id: number;
}) {
  await run(
    `
      UPDATE opportunity_proposals SET status = 'sent', sent_at = @sentAt, sent_channel = @channel
      WHERE id = @id AND opportunity_id = @oppId
    `,
    {
      id: input.proposal_id,
      oppId: input.opportunity_id,
      sentAt: input.sent_at,
      channel: input.sent_channel
    }
  );

  await run(
    `
      UPDATE opportunity_proposals SET status = 'superseded'
      WHERE opportunity_id = @oppId AND id <> @id AND status IN ('draft', 'sent')
    `,
    { oppId: input.opportunity_id, id: input.proposal_id }
  );
}

export async function getProposalFile(proposalId: number, opportunityId: number) {
  const row = await get<{ storage_path: string; original_filename: string; mime_type: string | null }>(
    `SELECT storage_path, original_filename, mime_type FROM opportunity_proposals WHERE id = @id AND opportunity_id = @oppId`,
    { id: proposalId, oppId: opportunityId }
  );
  if (!row) return null;
  const abs = path.join(process.cwd(), row.storage_path);
  return { absPath: abs, filename: row.original_filename, mime: row.mime_type ?? "application/octet-stream" };
}
