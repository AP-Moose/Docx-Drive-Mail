import logoPath from "@assets/prolynk-logo.png";

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
          background: linear-gradient(180deg, #F5F7FF 0%, #ffffff 14%);
          color: #0E1020;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 15px;
          line-height: 1.75;
          padding: 28px 28px 32px;
          border: 1px solid #D4D7E8;
          border-radius: 24px;
          overflow-y: auto;
          box-shadow: 0 30px 70px -45px rgba(99, 102, 255, 0.18);
        }
        @media (max-width: 420px) {
          .proposal-preview-container {
            padding: 18px 16px 22px;
            font-size: 13.5px;
            border-radius: 18px;
          }
          .proposal-preview-topbar {
            gap: 10px;
            margin-bottom: 14px;
            padding-bottom: 12px;
          }
          .proposal-preview-logo {
            max-height: 52px;
          }
          .proposal-preview-title {
            font-size: 20px;
          }
          .proposal-preview-address {
            font-size: 12px;
            margin-bottom: 18px;
          }
          .proposal-heading {
            font-size: 10px;
            margin-top: 20px;
          }
          .proposal-bullet {
            padding-left: 16px;
            margin-bottom: 4px;
          }
          .proposal-preview-customer {
            margin-top: 16px;
            padding-top: 12px;
            font-size: 11px;
          }
        }
        .proposal-preview-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
          padding-bottom: 18px;
          border-bottom: 1px solid #D4D7E8;
        }
        .proposal-preview-logo {
          display: block;
          max-height: 72px;
          width: auto;
        }
        .proposal-preview-meta {
          text-align: right;
          font-family: "Open Sans", "Segoe UI", sans-serif;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #4A5080;
        }
        .proposal-preview-title {
          font-size: 25px;
          font-weight: 700;
          color: #1a1c3a;
          text-align: center;
          margin-bottom: 8px;
          letter-spacing: -0.02em;
        }
        .proposal-preview-address {
          text-align: center;
          color: #4A5080;
          font-family: "Open Sans", "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1.5;
          margin-bottom: 24px;
        }
        .proposal-heading {
          font-family: "Open Sans", "Segoe UI", sans-serif;
          font-size: 11px;
          font-weight: 700;
          color: #6366FF;
          text-transform: uppercase;
          letter-spacing: 0.24em;
          margin-top: 26px;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #D4D7E8;
        }
        .proposal-subheading {
          font-family: "Open Sans", "Segoe UI", sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: #1a1c3a;
          margin-top: 12px;
          margin-bottom: 6px;
        }
        .proposal-paragraph {
          margin-bottom: 10px;
          color: #1a1c3a;
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
          color: #1a1c3a;
        }
        .proposal-bullet::before {
          content: "•";
          position: absolute;
          left: 3px;
          color: #6366FF;
          font-weight: bold;
        }
        .proposal-bullet-nested {
          padding-left: 34px;
          font-size: 14px;
          color: #4A5080;
        }
        .proposal-bullet-nested::before {
          left: 18px;
          content: "–";
          color: #A1A7C4;
          font-weight: normal;
        }
        .proposal-preview-customer {
          margin-top: 22px;
          padding-top: 16px;
          border-top: 1px solid #D4D7E8;
          font-family: "Open Sans", "Segoe UI", sans-serif;
          color: #4A5080;
          font-size: 12px;
          line-height: 1.6;
        }
      `}</style>

      <div className="proposal-preview-topbar">
        <img
          src={logoPath}
          alt="ProLynk"
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
