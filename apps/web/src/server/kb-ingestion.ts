import yauzl from "yauzl";

export const SUPPORTED_KB_DOCUMENT_KINDS = [
  "pdf",
  "docx",
  "csv",
  "xlsx",
  "audio-transcript",
  "video-transcript",
  "code",
  "markdown",
  "text",
] as const;

export type KbDocumentKind = (typeof SUPPORTED_KB_DOCUMENT_KINDS)[number];

export interface ParsedDocumentSection {
  text: string;
  label?: string;
  page?: number;
  sheet?: string;
  rowStart?: number;
  lineStart?: number;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedKnowledgeDocument {
  kind: KbDocumentKind;
  text: string;
  sections: ParsedDocumentSection[];
  metadata: Record<string, unknown>;
}

export interface ParsedDocumentChunk {
  content: string;
  citation: string;
  metadata: Record<string, unknown>;
}

interface ParseInput {
  name: string;
  mimeType: string;
  content?: string | null;
  data?: Buffer | ArrayBuffer | null;
}

const CODE_EXTENSIONS = new Set([
  ".c",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".lua",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".swift",
  ".ts",
  ".tsx",
  ".vue",
  ".yaml",
  ".yml",
]);

function extensionOf(name: string) {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot);
}

function cleanWhitespace(value: string) {
  return value
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function bufferToText(input: ParseInput) {
  if (input.content) return input.content;
  if (!input.data) return "";
  const buffer = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data);
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

export function inferDocumentKind(name: string, mimeType: string): KbDocumentKind {
  const ext = extensionOf(name);
  const type = mimeType.toLowerCase();

  if (type === "application/pdf" || ext === ".pdf") return "pdf";
  if (type.includes("wordprocessingml.document") || ext === ".docx") return "docx";
  if (type.includes("spreadsheetml.sheet") || ext === ".xlsx") return "xlsx";
  if (type.includes("csv") || ext === ".csv") return "csv";
  if (ext === ".md" || ext === ".markdown" || type.includes("markdown")) return "markdown";
  if (type === "text/vtt" || ext === ".vtt" || ext === ".srt")
    return name.toLowerCase().includes("video") ? "video-transcript" : "audio-transcript";
  if (ext === ".json" && name.toLowerCase().includes("keyframe")) return "video-transcript";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  return "text";
}

async function readStreamText(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readZipTextEntries(buffer: Buffer, shouldRead: (fileName: string) => boolean) {
  return new Promise<Record<string, string>>((resolve, reject) => {
    const entries: Record<string, string> = {};
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error("Could not open Office document archive"));
        return;
      }

      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName) || !shouldRead(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            zipfile.close();
            reject(streamErr ?? new Error(`Could not read ${entry.fileName}`));
            return;
          }

          readStreamText(stream)
            .then((text) => {
              entries[entry.fileName] = text;
              zipfile.readEntry();
            })
            .catch((readErr: unknown) => {
              zipfile.close();
              reject(readErr);
            });
        });
      });
      zipfile.once("end", () => {
        zipfile.close();
        resolve(entries);
      });
      zipfile.once("error", reject);
    });
  });
}

function parsePdfText(input: ParseInput): ParsedDocumentSection[] {
  const text = bufferToText(input);
  const literalMatches = [...text.matchAll(/\((?:\\.|[^\\)]){2,}\)/g)]
    .map((match) => match[0].slice(1, -1).replace(/\\([\\()nrtbf])/g, " "))
    .filter((value) => /[A-Za-z0-9]/.test(value));
  const extracted = cleanWhitespace(literalMatches.join(" "));
  return [{ text: extracted || cleanWhitespace(text), page: 1, label: "PDF text" }];
}

async function parseDocx(input: ParseInput): Promise<ParsedDocumentSection[]> {
  if (!input.data) return [{ text: cleanWhitespace(input.content ?? ""), label: "DOCX text" }];
  const buffer = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data);
  const entries = await readZipTextEntries(buffer, (fileName) => fileName === "word/document.xml");
  const xml = entries["word/document.xml"] ?? "";
  const sections = [...xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((paragraph, index) => {
      const text = [...paragraph[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((match) => decodeXmlEntities(match[1]))
        .join("");
      return { text: cleanWhitespace(text), label: `Paragraph ${index + 1}` };
    })
    .filter((section) => section.text);
  return sections.length > 0 ? sections : [{ text: cleanWhitespace(bufferToText(input)), label: "DOCX text" }];
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some(Boolean));
}

function parseCsv(text: string): ParsedDocumentSection[] {
  return parseCsvRows(text).map((row, index) => ({
    text: row.join(" | "),
    rowStart: index + 1,
    label: `Row ${index + 1}`,
  }));
}

async function parseXlsx(input: ParseInput): Promise<ParsedDocumentSection[]> {
  if (!input.data) return parseCsv(input.content ?? "");
  const buffer = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data);
  const entries = await readZipTextEntries(
    buffer,
    (fileName) => fileName === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(fileName),
  );
  const sharedStrings = [...(entries["xl/sharedStrings.xml"] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) =>
    cleanWhitespace(decodeXmlEntities(match[1])),
  );
  const sections: ParsedDocumentSection[] = [];

  for (const [fileName, xml] of Object.entries(entries).filter(([fileName]) => fileName.startsWith("xl/worksheets/"))) {
    const sheet = fileName.match(/sheet(\d+)\.xml$/)?.[1] ?? "1";
    for (const rowMatch of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(rowMatch[1]);
      const cells = [...rowMatch[2].matchAll(/<c[^>]*(?:t="([^"]+)")?[^>]*>[\s\S]*?<v>([\s\S]*?)<\/v>[\s\S]*?<\/c>/g)]
        .map((cellMatch) => {
          const cellType = cellMatch[1];
          const value = decodeXmlEntities(cellMatch[2]);
          if (cellType === "s") return sharedStrings[Number(value)] ?? value;
          return value;
        })
        .filter(Boolean);
      if (cells.length) {
        sections.push({
          text: cells.join(" | "),
          sheet: `Sheet ${sheet}`,
          rowStart: rowNumber,
          label: `Sheet ${sheet} row ${rowNumber}`,
        });
      }
    }
  }

  return sections.length > 0 ? sections : [{ text: cleanWhitespace(bufferToText(input)), label: "XLSX text" }];
}

export function parseTranscript(text: string): ParsedDocumentSection[] {
  return text
    .split(/\n{2,}/)
    .map((block, index) => {
      const lines = block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const timestamp = lines.find((line) => /-->|^\d{1,2}:\d{2}/.test(line));
      const body = lines
        .filter((line) => !/^WEBVTT/i.test(line))
        .filter((line) => !/^\d+$/.test(line))
        .filter((line) => !/-->|^\d{1,2}:\d{2}/.test(line))
        .join(" ");
      return { text: cleanWhitespace(body), timestamp, label: `Transcript segment ${index + 1}` };
    })
    .filter((section) => section.text);
}

export function parseVideoKeyframes(text: string): ParsedDocumentSection[] {
  try {
    const parsed = JSON.parse(text) as { keyframes?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.keyframes)) return [];
    return parsed.keyframes
      .map((frame, index) => {
        const timestamp = String(frame.timestamp ?? frame.time ?? "");
        const description = String(frame.description ?? frame.text ?? frame.caption ?? "");
        return {
          text: cleanWhitespace(description),
          timestamp,
          label: `Keyframe ${index + 1}`,
          metadata: { keyframe: true },
        };
      })
      .filter((section) => section.text);
  } catch {
    return [];
  }
}

function parseCode(text: string): ParsedDocumentSection[] {
  const lines = text.split(/\r?\n/);
  const sections: ParsedDocumentSection[] = [];
  for (let start = 0; start < lines.length; start += 80) {
    const slice = lines.slice(start, start + 100).join("\n");
    if (slice.trim())
      sections.push({
        text: slice.trim(),
        lineStart: start + 1,
        label: `Lines ${start + 1}-${Math.min(lines.length, start + 100)}`,
      });
  }
  return sections;
}

function parseMarkdown(text: string): ParsedDocumentSection[] {
  const blocks = text
    .split(/\n(?=#{1,6}\s+)/)
    .map((block) => cleanWhitespace(block))
    .filter(Boolean);
  return blocks.map((block, index) => ({
    text: block.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
    label: block.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? `Section ${index + 1}`,
  }));
}

export async function parseKnowledgeDocument(input: ParseInput): Promise<ParsedKnowledgeDocument> {
  const kind = inferDocumentKind(input.name, input.mimeType);
  const text = bufferToText(input);
  let sections: ParsedDocumentSection[] = [];

  if (kind === "pdf") sections = parsePdfText(input);
  else if (kind === "docx") sections = await parseDocx(input);
  else if (kind === "csv") sections = parseCsv(text);
  else if (kind === "xlsx") sections = await parseXlsx(input);
  else if (kind === "audio-transcript") sections = parseTranscript(text);
  else if (kind === "video-transcript") sections = parseVideoKeyframes(text).concat(parseTranscript(text));
  else if (kind === "code") sections = parseCode(text);
  else if (kind === "markdown") sections = parseMarkdown(text);
  else sections = [{ text: cleanWhitespace(text), label: "Text" }];

  const cleanedSections = sections.filter((section) => section.text.trim());
  const joinedText = cleanWhitespace(cleanedSections.map((section) => section.text).join("\n\n"));
  return {
    kind,
    text: joinedText,
    sections: cleanedSections.length ? cleanedSections : [{ text: joinedText, label: "Document" }],
    metadata: { sourceType: kind },
  };
}

export function createChunkCitation(sourceName: string, metadata: Record<string, unknown>) {
  const parts = [sourceName];
  if (typeof metadata.page === "number") parts.push(`p. ${metadata.page}`);
  if (typeof metadata.sheet === "string") parts.push(metadata.sheet);
  if (typeof metadata.rowStart === "number") parts.push(`row ${metadata.rowStart}`);
  if (typeof metadata.lineStart === "number") parts.push(`line ${metadata.lineStart}`);
  if (typeof metadata.timestamp === "string" && metadata.timestamp) parts.push(metadata.timestamp);
  if (typeof metadata.index === "number") parts.push(`chunk ${metadata.index + 1}`);
  return parts.join(" - ");
}

export function chunkParsedDocument(
  parsed: ParsedKnowledgeDocument,
  sourceName: string,
  chunkSize: number,
  overlap: number,
): ParsedDocumentChunk[] {
  const chunks: ParsedDocumentChunk[] = [];
  const step = Math.max(1, chunkSize - overlap);

  for (const section of parsed.sections) {
    const text = cleanWhitespace(section.text);
    if (!text) continue;
    for (let start = 0; start < text.length; start += step) {
      const content = text.slice(start, start + chunkSize).trim();
      if (!content) continue;
      const metadata = {
        ...parsed.metadata,
        ...section.metadata,
        page: section.page,
        sheet: section.sheet,
        rowStart: section.rowStart,
        lineStart: section.lineStart,
        timestamp: section.timestamp,
        label: section.label,
        sourceType: parsed.kind,
        offset: start,
        index: chunks.length,
      };
      chunks.push({
        content,
        citation: createChunkCitation(sourceName, metadata),
        metadata,
      });
      if (start + chunkSize >= text.length) break;
    }
  }

  return chunks;
}
