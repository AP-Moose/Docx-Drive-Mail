import logoPath from "@assets/Inspiringservices_1772928567649.avif";

interface ProposalPreviewProps {
  title?: string;
  text: string;
  customerName: string;
  customerEmail?: string;
  jobAddress?: string;
  className?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInlineText(value: string): string {
  return escapeHtml(value).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function parseProposalToHtml(text: string): string {
  const lines = text.split("\n");
  const htmlParts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;

    const isHeading =
      /^[\d]+[\.\)]\s+[A-Z]/.test(trimmed) ||
      /^[A-Z][A-Z\s/&]+:?$/.test(trimmed) ||
      /^\*\*[^*]+\*\*$/.test(trimmed) ||
      /^#{1,3}\s/.test(trimmed);

    if (isHeading) {
      const headingText = trimmed
        .replace(/^#+\s/, "")
        .replace(/\*\*/g, "")
        .replace(/:$/, "");
      htmlParts.push(`<h3 class="proposal-heading">${escapeHtml(headingText)}</h3>`);
      continue;
    }

    if (/^\s*[-•*]\s+/.test(line)) {
      const indent = line.search(/\S/);
      const bulletText = trimmed.replace(/^[-•*]\s+/, "");
      const level = indent >= 4 ? "nested" : "top";
      htmlParts.push(`<li class="proposal-bullet proposal-bullet-${level}">${formatInlineText(bulletText)}</li>`);
      continue;
    }

    if (/^\d+\.\d+\s/.test(trimmed)) {
      htmlParts.push(`<p class="proposal-subheading">${formatInlineText(trimmed)}</p>`);
      continue;
    }

    htmlParts.push(`<p class="proposal-paragraph">${formatInlineText(trimmed)}</p>`);
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

export default function ProposalPreview({
  title,
  text,
  customerName,
  customerEmail,
  jobAddress,
  className = "",
}: ProposalPreviewProps) {
  const bodyHtml = parseProposalToHtml(text);
  const titleLines = (title || "Proposal").split("\n");

  return (
    <div
      className={`proposal-preview-container ${className}`}
      data-testid="preview-proposal-text"
    >
      <style>{`
        .proposal-preview-container {
          background: linear-gradient(180deg, #fffcf6 0%, #ffffff 14%);
          color: #182118;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 15px;
          line-height: 1.75;
          padding: 28px 28px 32px;
          border: 1px solid #e8ebe4;
          border-radius: 24px;
          overflow-y: auto;
          box-shadow: 0 30px 70px -45px rgba(15, 23, 42, 0.35);
        }
        .proposal-preview-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e5eadf;
        }
        .proposal-preview-logo {
          display: block;
          max-width: 154px;
          height: auto;
        }
        .proposal-preview-meta {
          text-align: right;
          font-family: "Open Sans", "Segoe UI", sans-serif;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #647166;
        }
        .proposal-preview-title {
          font-size: 25px;
          font-weight: 700;
          color: #113f18;
          text-align: center;
          margin-bottom: 8px;
          letter-spacing: -0.02em;
        }
        .proposal-preview-address {
          text-align: center;
          color: #5e675d;
          font-family: "Open Sans", "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1.5;
          margin-bottom: 24px;
        }
        .proposal-heading {
          font-family: "Open Sans", "Segoe UI", sans-serif;
          font-size: 11px;
          font-weight: 700;
          color: #166534;
          text-transform: uppercase;
          letter-spacing: 0.24em;
          margin-top: 26px;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e8ebe4;
        }
        .proposal-subheading {
          font-family: "Open Sans", "Segoe UI", sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: #1f2937;
          margin-top: 12px;
          margin-bottom: 6px;
        }
        .proposal-paragraph {
          margin-bottom: 10px;
          color: #1f2937;
        }
        .proposal-list {
          list-style: none;
          padding-left: 0;
          margin: 10px 0 12px;
        }
        .proposal-bullet {
          position: relative;
          padding-left: 20px;
          margin-bottom: 6px;
          color: #1f2937;
        }
        .proposal-bullet::before {
          content: "•";
          position: absolute;
          left: 3px;
          color: #166534;
          font-weight: bold;
        }
        .proposal-bullet-nested {
          padding-left: 34px;
          font-size: 14px;
          color: #4b5563;
        }
        .proposal-bullet-nested::before {
          left: 18px;
          content: "–";
          color: #6b7280;
          font-weight: normal;
        }
        .proposal-preview-customer {
          margin-top: 22px;
          padding-top: 16px;
          border-top: 1px solid #e8ebe4;
          font-family: "Open Sans", "Segoe UI", sans-serif;
          color: #4b5563;
          font-size: 12px;
          line-height: 1.6;
        }
      `}</style>

      <div className="proposal-preview-topbar">
        <img
          src={logoPath}
          alt="Inspiring Services"
          className="proposal-preview-logo"
          data-testid="preview-logo"
        />
        <div className="proposal-preview-meta">
          <div>Prepared for</div>
          <div>{customerName}</div>
        </div>
      </div>

      <div className="proposal-preview-title" data-testid="preview-title">
        {titleLines[0]}
      </div>

      {titleLines.length > 1 ? (
        <div className="proposal-preview-address">{titleLines[1]}</div>
      ) : jobAddress ? (
        <div className="proposal-preview-address">{jobAddress}</div>
      ) : null}

      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />

      {(customerEmail || jobAddress) && (
        <div className="proposal-preview-customer">
          {jobAddress && <div>{jobAddress}</div>}
          {customerEmail && <div>{customerEmail}</div>}
        </div>
      )}
    </div>
  );
}
