interface ProposalPreviewProps {
  title?: string;
  text: string;
  customerName: string;
  customerEmail?: string;
  jobAddress?: string;
  className?: string;
}

function parseProposalToHtml(text: string): string {
  const lines = text.split("\n");
  const htmlParts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed === "---") {
      continue;
    }

    const isHeading =
      /^[\d]+[\.\)]\s+[A-Z]/.test(trimmed) ||
      /^[A-Z][A-Z\s\/&]+:?$/.test(trimmed) ||
      /^\*\*[^*]+\*\*$/.test(trimmed) ||
      /^#{1,3}\s/.test(trimmed);

    if (isHeading) {
      const headingText = trimmed
        .replace(/^#+\s/, "")
        .replace(/\*\*/g, "")
        .replace(/:$/, "");
      htmlParts.push(`<h3 class="proposal-heading">${escapeHtml(headingText)}</h3>`);
    } else if (/^\s*[-•*]\s+/.test(line)) {
      const indent = line.search(/\S/);
      const bulletText = trimmed.replace(/^[-•*]\s+/, "");
      const level = indent >= 4 ? "nested" : "top";
      htmlParts.push(`<li class="proposal-bullet proposal-bullet-${level}">${formatInlineText(bulletText)}</li>`);
    } else if (/^\d+\.\d+\s/.test(trimmed)) {
      htmlParts.push(`<p class="proposal-subheading">${formatInlineText(trimmed)}</p>`);
    } else {
      htmlParts.push(`<p class="proposal-paragraph">${formatInlineText(trimmed)}</p>`);
    }
  }

  let result = "";
  let inList = false;
  for (const part of htmlParts) {
    if (part.startsWith("<li")) {
      if (!inList) {
        result += '<ul class="proposal-list">';
        inList = true;
      }
      result += part;
    } else {
      if (inList) {
        result += "</ul>";
        inList = false;
      }
      result += part;
    }
  }
  if (inList) result += "</ul>";

  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInlineText(text: string): string {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/\[TBD[^\]]*\]/g, '<span class="proposal-tbd">$&</span>');
  return escaped;
}

export default function ProposalPreview({
  title,
  text,
  customerName,
  customerEmail,
  jobAddress,
  className = "",
}: ProposalPreviewProps) {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const bodyHtml = parseProposalToHtml(text);

  return (
    <div className={`proposal-preview-container ${className}`} data-testid="preview-proposal-text">
      <style>{`
        .proposal-preview-container {
          background: white;
          color: #1a1a1a;
          font-family: 'Calibri', 'Segoe UI', system-ui, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          padding: 24px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow-y: auto;
        }
        .proposal-preview-title {
          font-size: 20px;
          font-weight: 700;
          color: #0f490e;
          text-align: center;
          margin-bottom: 4px;
        }
        .proposal-preview-date {
          text-align: center;
          color: #666;
          font-size: 12px;
          margin-bottom: 16px;
        }
        .proposal-preview-divider {
          border: none;
          border-top: 2px solid #15a32a;
          margin: 16px 0;
        }
        .proposal-preview-prepared {
          font-size: 14px;
          font-weight: 700;
          color: #15a32a;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        .proposal-preview-customer {
          font-weight: 700;
          font-size: 15px;
          margin-bottom: 2px;
        }
        .proposal-preview-meta {
          color: #444;
          font-size: 13px;
          margin-bottom: 2px;
        }
        .proposal-heading {
          font-size: 15px;
          font-weight: 700;
          color: #15a32a;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-top: 20px;
          margin-bottom: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid #e5e7eb;
        }
        .proposal-subheading {
          font-weight: 600;
          margin-top: 12px;
          margin-bottom: 4px;
        }
        .proposal-paragraph {
          margin-bottom: 6px;
        }
        .proposal-list {
          list-style: none;
          padding-left: 0;
          margin: 6px 0;
        }
        .proposal-bullet {
          position: relative;
          padding-left: 18px;
          margin-bottom: 4px;
        }
        .proposal-bullet::before {
          content: "•";
          position: absolute;
          left: 4px;
          color: #15a32a;
          font-weight: bold;
        }
        .proposal-bullet-nested {
          padding-left: 36px;
          font-size: 13px;
        }
        .proposal-bullet-nested::before {
          left: 22px;
          content: "–";
          color: #6b7280;
          font-weight: normal;
        }
        .proposal-tbd {
          background: #fef3c7;
          color: #92400e;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 12px;
        }
        .proposal-preview-footer {
          border-top: 1px solid #ccc;
          margin-top: 20px;
          padding-top: 12px;
          text-align: center;
          color: #999;
          font-size: 11px;
          font-style: italic;
        }
      `}</style>

      <div className="proposal-preview-title" data-testid="preview-title">
        {title || "Proposal"}
      </div>
      <div className="proposal-preview-date">Date: {today}</div>
      <hr className="proposal-preview-divider" />
      <div className="proposal-preview-prepared">Prepared For</div>
      <div className="proposal-preview-customer">{customerName}</div>
      {customerEmail && <div className="proposal-preview-meta">{customerEmail}</div>}
      {jobAddress && <div className="proposal-preview-meta">Job Address: {jobAddress}</div>}
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <div className="proposal-preview-footer">
        Generated by Proposal Builder | {today}
      </div>
    </div>
  );
}
