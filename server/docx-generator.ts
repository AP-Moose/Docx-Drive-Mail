import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ImageRun,
} from "docx";
import type { Proposal } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";

const logoPath = path.resolve("attached_assets/prolynk-logo.png");
let logoBuffer: Buffer | null = null;
try {
  logoBuffer = fs.readFileSync(logoPath);
} catch (e) {
  console.warn("Logo file not found at", logoPath);
}

function buildFilename(proposal: Proposal): string {
  const name = proposal.customerName.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  const type = proposal.projectType !== "General" ? proposal.projectType : "";
  const addr = (proposal.jobAddress || "").replace(/[^a-zA-Z0-9 ]/g, "").trim().substring(0, 30);
  const date = new Date().toISOString().split("T")[0];
  const version = `v${proposal.version}`;
  const parts = [name, type, addr, date, version].filter(Boolean);
  return `${parts.join(" - ")}.docx`;
}

function parseProposalSections(body: string): { heading: string; content: string }[] {
  const lines = body.split("\n");
  const sections: { heading: string; content: string }[] = [];
  let current: { heading: string; content: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) current.content.push("");
      continue;
    }

    const isHeading =
      /^[\d]+[\.\)]\s+[A-Z]/.test(trimmed) ||
      /^[A-Z][A-Z\s\/&]+:?$/.test(trimmed) ||
      /^\*\*[^*]+\*\*$/.test(trimmed) ||
      /^#{1,3}\s/.test(trimmed);

    if (isHeading) {
      if (current) {
        sections.push({ heading: current.heading, content: current.content.join("\n").trim() });
      }
      current = { heading: trimmed.replace(/^#+\s/, "").replace(/\*\*/g, "").replace(/:$/, ""), content: [] };
    } else {
      if (current) {
        current.content.push(line);
      } else {
        current = { heading: "", content: [line] };
      }
    }
  }

  if (current) {
    sections.push({ heading: current.heading, content: current.content.join("\n").trim() });
  }

  return sections.filter((s) => s.content.trim().length > 0);
}

export async function generateDocx(proposal: Proposal): Promise<{ buffer: Buffer; filename: string }> {
  const filename = buildFilename(proposal);
  const sections = parseProposalSections(proposal.proposalText || "");

  const docChildren: any[] = [];

  if (logoBuffer) {
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: { width: 420, height: 180 },
            type: "png",
          }),
        ],
      })
    );
  }

  const titleLines = (proposal.proposalTitle || "Proposal").split("\n");
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: titleLines[0], bold: true, size: 32, font: "Calibri", color: "1a1c3a" }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: titleLines.length > 1 ? 100 : 200 },
    })
  );

  if (titleLines.length > 1) {
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({ text: titleLines[1], size: 24, font: "Calibri", color: "444444" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );
  }

  if (sections.length > 0) {
    for (const section of sections) {
      if (section.heading) {
        docChildren.push(
          new Paragraph({ text: "", spacing: { after: 100 } })
        );
        docChildren.push(
          new Paragraph({
            text: section.heading.toUpperCase(),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 150 },
          })
        );
      }

      const contentLines = section.content.split("\n");
      for (const line of contentLines) {
        const trimmed = line.trim();
        if (!trimmed) {
          docChildren.push(new Paragraph({ text: "", spacing: { after: 100 } }));
          continue;
        }

        if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
          docChildren.push(
            new Paragraph({
              text: trimmed.replace(/^[-•*]\s+/, ""),
              bullet: { level: 0 },
              spacing: { after: 80 },
            })
          );
        } else {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: trimmed, size: 22 })],
              spacing: { after: 100 },
            })
          );
        }
      }
    }
  } else {
    const lines = (proposal.proposalText || "").split("\n");
    for (const line of lines) {
      docChildren.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 22 })],
          spacing: { after: 100 },
        })
      );
    }
  }

  const doc = new Document({
    creator: "ProLynk",
    title: proposal.proposalTitle || "Proposal",
    description: `Proposal for ${proposal.customerName}`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: docChildren,
      },
    ],
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "1A1A1A" },
        },
        heading1: {
          run: { font: "Calibri", size: 32, bold: true, color: "1a1c3a" },
        },
        heading2: {
          run: { font: "Calibri", size: 24, bold: true, color: "6366FF" },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer, filename };
}
