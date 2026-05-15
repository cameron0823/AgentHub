import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { agents, chatSessions, messages, memoryEntries, files } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";

export const runtime = "nodejs";

// Minimal ZIP writer (STORE method — no compression, no external deps)
function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const now = dosDateTime();

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);   // signature
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0, 6);             // flags
    local.writeUInt16LE(0, 8);             // compression: STORE
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);         // compressed size
    local.writeUInt32LE(size, 22);         // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);            // extra field length
    nameBytes.copy(local, 30);

    localHeaders.push(local);
    localHeaders.push(entry.data);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);  // signature
    central.writeUInt16LE(20, 4);           // version made by
    central.writeUInt16LE(20, 6);           // version needed
    central.writeUInt16LE(0, 8);            // flags
    central.writeUInt16LE(0, 10);           // compression: STORE
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);        // compressed size
    central.writeUInt32LE(size, 24);        // uncompressed size
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);           // extra length
    central.writeUInt16LE(0, 32);           // comment length
    central.writeUInt16LE(0, 34);           // disk start
    central.writeUInt16LE(0, 36);           // internal attrs
    central.writeUInt32LE(0, 38);           // external attrs
    central.writeUInt32LE(offset, 42);      // local header offset
    nameBytes.copy(central, 46);

    centralDirs.push(central);
    offset += local.length + size;
  }

  const centralBuf = Buffer.concat(centralDirs);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);  // signature
  endRecord.writeUInt16LE(0, 4);            // disk number
  endRecord.writeUInt16LE(0, 6);            // start disk
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralBuf.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);           // comment length

  return Buffer.concat([...localHeaders, centralBuf, endRecord]);
}

function dosDateTime() {
  const d = new Date();
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date, time };
}

function crc32(buf: Buffer): number {
  const table = crc32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32Table(): number[] {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}

export async function GET(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [userAgents, userSessions, userMemory, userFiles] = await Promise.all([
    db.select().from(agents).where(eq(agents.userId, userId)),
    db.select().from(chatSessions).where(eq(chatSessions.userId, userId)),
    db.select().from(memoryEntries).where(eq(memoryEntries.userId, userId)),
    db.select().from(files).where(eq(files.userId, userId)),
  ]);

  // Fetch messages for all sessions
  const sessionIds = userSessions.map((s) => s.id);
  const allMessages = sessionIds.length > 0
    ? await Promise.all(
        sessionIds.map((sid) =>
          db.select().from(messages).where(eq(messages.sessionId, sid))
        )
      )
    : [];

  const sessionsWithMessages = userSessions.map((s, i) => ({
    ...s,
    messages: allMessages[i] ?? [],
  }));

  const zipEntries: { name: string; data: Buffer }[] = [
    {
      name: "agents.json",
      data: Buffer.from(JSON.stringify(userAgents, null, 2), "utf8"),
    },
    {
      name: "sessions.jsonl",
      data: Buffer.from(
        sessionsWithMessages.map((s) => JSON.stringify(s)).join("\n"),
        "utf8"
      ),
    },
    {
      name: "memory.json",
      data: Buffer.from(JSON.stringify(userMemory, null, 2), "utf8"),
    },
    {
      name: "files.json",
      data: Buffer.from(
        JSON.stringify(
          userFiles.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, createdAt: f.createdAt })),
          null,
          2
        ),
        "utf8"
      ),
    },
  ];

  const zip = buildZip(zipEntries);
  const ts = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="agenthub-export-${ts}.zip"`,
      "Content-Length": String(zip.length),
    },
  });
}
