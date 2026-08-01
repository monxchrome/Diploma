import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

import type { ExportFormat, ExportOptions, ReportSnapshotContent } from "@dip/contracts";

export function renderReport(input: {
  content: ReportSnapshotContent;
  contentHash: string;
  format: ExportFormat;
  generatedAt: Date;
  options: ExportOptions;
  title: string;
  versionNumber: number;
}): { body: Buffer; contentType: string; extension: string } {
  const markdown = renderMarkdown(input);
  if (input.format === "MARKDOWN")
    return {
      body: Buffer.from(markdown),
      contentType: "text/markdown; charset=utf-8",
      extension: "md",
    };
  if (input.format === "PRINT_HTML")
    return {
      body: Buffer.from(renderHtml(input)),
      contentType: "text/html; charset=utf-8",
      extension: "html",
    };
  if (input.format === "PDF")
    return { body: renderPdf(markdown), contentType: "application/pdf", extension: "pdf" };
  return {
    body: renderDocx(input, markdown),
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  };
}

export function renderMarkdown(input: {
  content: ReportSnapshotContent;
  contentHash: string;
  generatedAt: Date;
  options: ExportOptions;
  title: string;
  versionNumber: number;
}): string {
  const lines = [`# ${escapeMarkdown(input.title)}`, "", `Report version: ${input.versionNumber}`];
  if (input.options.showGeneratedAt) lines.push(`Generated: ${input.generatedAt.toISOString()}`);
  if (input.options.showContentHash) lines.push(`Content hash: ${input.contentHash}`);
  lines.push("", "## Recommendation", "", input.content.recommendation, "");
  if (input.options.includeExecutiveSummary && input.content.summary)
    lines.push("## Executive summary", "", input.content.summary, "");
  if (input.options.includeFullAnalysis) {
    for (const section of input.content.sections.filter(
      (section) =>
        section.anchor !== "section:recommendation" &&
        section.anchor !== "section:executive-summary",
    )) {
      lines.push(`## ${escapeMarkdown(section.title)}`, "", section.content, "");
    }
  }
  if (input.content.risks.length)
    lines.push("## Risks", "", ...input.content.risks.map((risk) => `- ${risk}`), "");
  if (input.content.nextSteps.length)
    lines.push("## Next steps", "", ...input.content.nextSteps.map((step) => `- ${step}`), "");
  if (input.content.limitations.length)
    lines.push("## Limitations", "", ...input.content.limitations.map((item) => `- ${item}`), "");
  if (input.options.includeSources && input.content.citations.length) {
    lines.push("## Sources", "");
    for (const citation of input.content.citations)
      lines.push(`- [${citation.evidenceId}] ${citation.excerpt}`);
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function renderHtml(input: Parameters<typeof renderMarkdown>[0]): string {
  const body = renderMarkdown(input)
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith("- ")) return `<li>${escapeHtml(line.slice(2))}</li>`;
      return line ? `<p>${escapeHtml(line)}</p>` : "";
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,noarchive"><title>${escapeHtml(input.title)}</title><style>body{font:12pt/1.5 system-ui,sans-serif;max-width:8in;margin:1in auto;color:#111}h1{font-size:24pt}h2{margin-top:24pt}li{margin:.25rem 0}@media print{body{margin:.6in}}</style></head><body>${body}</body></html>`;
}

function renderPdf(markdown: string): Buffer {
  const lines = markdown
    .replace(/[#*_`]/g, "")
    .split("\n")
    .flatMap((line) => wrap(line, 90));
  const pageLines = 48;
  const pages = Array.from(
    { length: Math.max(1, Math.ceil(lines.length / pageLines)) },
    (_, index) => lines.slice(index * pageLines, (index + 1) * pageLines),
  );
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index] ?? [];
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const stream = [
      "BT",
      "/F1 10 Tf",
      "50 760 Td",
      ...page.map((line, i) => `${i ? "0 -15 Td" : ""} (${pdfText(line)}) Tj`),
      "ET",
    ].join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 595 842] /Contents ${contentObject} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  let size = Buffer.byteLength(chunks[0] ?? "");
  objects.forEach((object, index) => {
    offsets.push(size);
    const value = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(value);
    size += Buffer.byteLength(value);
  });
  const xref = size;
  chunks.push(
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join(
        "",
      )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  return Buffer.from(chunks.join(""), "utf8");
}

function renderDocx(input: Parameters<typeof renderMarkdown>[0], markdown: string): Buffer {
  const paragraphs = markdown
    .split("\n")
    .filter(Boolean)
    .map(
      (line) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line.replace(/^#+\s*/, ""))}</w:t></w:r></w:p>`,
    )
    .join("");
  const entries = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><cp:title>${escapeXml(input.title)}</cp:title></cp:coreProperties>`,
  };
  return zip(entries);
}

function zip(entries: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const file = Buffer.from(content);
    const compressed = deflateRawSync(file);
    const nameBuffer = Buffer.from(name);
    const crc = crc32(file);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    parts.push(local, nameBuffer, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(file.length, 24);
    directory.writeUInt16LE(nameBuffer.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function wrap(value: string, width: number): string[] {
  if (!value) return [""];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  return [...lines, line].filter(Boolean);
}
function pdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[()]/g, "\\$&")
    .replace(/[^\x20-\x7E]/g, "?");
}
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character,
  );
}
function escapeXml(value: string): string {
  return escapeHtml(value).replace(/'/g, "&apos;");
}
function escapeMarkdown(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function checksum(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}
