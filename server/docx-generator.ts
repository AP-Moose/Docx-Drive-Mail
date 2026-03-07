import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from "docx";
import type { Proposal } from "@shared/schema";

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
  // Try to split on numbered or titled sections
  const sectionPatterns = [
    /^(\d+\.\s+[A-Z][A-Z\s\/]+)[:]*\s*$/m,
    /^([A-Z][A-Z\s\/]+):$/m,
    /^\*\*([^*]+)\*\*$/m,
  ];

  // Simple line-by-line parsing
  const lines = body.split("\n");
  const sections: { heading: string; content: string }[] = [];
  let current: { heading: string; content: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) current.content.push("");
      continue;
    }

    // Check if line looks like a heading (all-caps, or starts with number, or ends with colon)
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
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const docChildren: any[] = [
    // Title
    new Paragraph({
      text: proposal.proposalTitle || "Proposal",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),

    // Date line
    new Paragraph({
      children: [
        new TextRun({ text: `Date: ${today}`, color: "666666", size: 20 }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),

    // Divider
    new Paragraph({
      border: { bottom: { color: "2563EB", size: 6, style: BorderStyle.SINGLE } },
      spacing: { after: 300 },
    }),

    // Customer Info section
    new Paragraph({
      text: "PREPARED FOR",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 150 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: proposal.customerName, bold: true, size: 24 }),
      ],
      spacing: { after: 100 },
    }),
  ];

  if (proposal.customerEmail) {
    docChildren.push(
      new Paragraph({
        children: [new TextRun({ text: proposal.customerEmail, color: "444444" })],
        spacing: { after: 100 },
      })
    );
  }

  if (proposal.jobAddress) {
    docChildren.push(
      new Paragraph({
        children: [new TextRun({ text: `Job Address: ${proposal.jobAddress}`, color: "444444" })],
        spacing: { after: 100 },
      })
    );
  }

  docChildren.push(
    new Paragraph({ text: "", spacing: { after: 200 } })
  );

  // If we have parsed sections, add them properly
  if (sections.length > 0) {
    for (const section of sections) {
      if (section.heading) {
        docChildren.push(
          new Paragraph({
            text: section.heading.toUpperCase(),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          })
        );
      }

      // Add content lines
      const contentLines = section.content.split("\n");
      for (const line of contentLines) {
        const trimmed = line.trim();
        if (!trimmed) {
          docChildren.push(new Paragraph({ text: "", spacing: { after: 100 } }));
          continue;
        }

        // Check if bullet-like
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
    // Fallback: just dump the text
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

  // Footer separator
  docChildren.push(
    new Paragraph({
      border: { top: { color: "CCCCCC", size: 4, style: BorderStyle.SINGLE } },
      spacing: { before: 400, after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated by Proposal Builder | ${today}`,
          color: "999999",
          size: 18,
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

  const doc = new Document({
    creator: "Proposal Builder",
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
          run: { font: "Calibri", size: 32, bold: true, color: "1A3A6B" },
        },
        heading2: {
          run: { font: "Calibri", size: 24, bold: true, color: "2563EB" },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer, filename };
}
