/**
 * Google Drive integration via Replit Connectors SDK
 * Uses: connectors.proxy("google-drive", endpoint, options)
 * Connection ID: conn_google-drive_01KK2ZF93P7P2SGY6MJ22YKYB3
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

export function isDriveConnected(): boolean {
  return !!process.env.REPLIT_CONNECTORS_HOSTNAME;
}

export async function testDriveConnection(): Promise<boolean> {
  try {
    if (!isDriveConnected()) return false;
    const connectors = getConnectors();
    const resp = await connectors.proxy("google-drive", "/drive/v3/about?fields=user", {
      method: "GET",
    });
    const data = await resp.json() as any;
    return !!data.user;
  } catch {
    return false;
  }
}

export async function getDriveUserEmail(): Promise<string | null> {
  try {
    if (!isDriveConnected()) return null;
    const connectors = getConnectors();
    const resp = await connectors.proxy("google-drive", "/drive/v3/about?fields=user(emailAddress)", {
      method: "GET",
    });
    const data = await resp.json() as any;
    return data.user?.emailAddress || null;
  } catch {
    return null;
  }
}

/** Build a fresh connectors client — never cache, tokens expire */
function getConnectors() {
  return new ReplitConnectors();
}

/**
 * Find a folder by name within a parent. Returns the folder ID or null.
 */
async function findFolder(
  connectors: ReplitConnectors,
  name: string,
  parentId: string | null
): Promise<string | null> {
  const parentQuery = parentId ? ` and '${parentId}' in parents` : " and 'root' in parents";
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false${parentQuery}`
  );
  const resp = await connectors.proxy("google-drive", `/drive/v3/files?q=${q}&fields=files(id)`, {
    method: "GET",
  });
  const data = await resp.json() as any;
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Create a folder with a given name and optional parent.
 */
async function createFolder(
  connectors: ReplitConnectors,
  name: string,
  parentId: string | null
): Promise<string> {
  const metadata: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  const resp = await connectors.proxy("google-drive", "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  const data = await resp.json() as any;
  if (!data.id) throw new Error(`Failed to create folder "${name}": ${JSON.stringify(data)}`);
  return data.id;
}

/**
 * Find or create a folder. Returns the folder ID.
 */
async function findOrCreateFolder(
  connectors: ReplitConnectors,
  name: string,
  parentId: string | null
): Promise<string> {
  const existing = await findFolder(connectors, name, parentId);
  if (existing) return existing;
  return createFolder(connectors, name, parentId);
}

/**
 * Resolve (find or create) the full folder path:
 * Proposal Builder / Proposals / YYYY / Month / CustomerName
 */
async function resolveFolder(connectors: ReplitConnectors, customerName: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = now.toLocaleString("en-US", { month: "long" });

  const rootId = await findOrCreateFolder(connectors, "Proposal Builder", null);
  const proposalsId = await findOrCreateFolder(connectors, "Proposals", rootId);
  const yearId = await findOrCreateFolder(connectors, year, proposalsId);
  const monthId = await findOrCreateFolder(connectors, month, yearId);
  const customerFolderId = await findOrCreateFolder(connectors, customerName, monthId);
  return customerFolderId;
}

/**
 * Upload a file to Google Drive using multipart upload.
 * Returns the file ID and web view link.
 */
export async function uploadToDrive(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  customerName?: string
): Promise<{ fileId: string; webViewLink: string }> {
  if (!isDriveConnected()) throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");

  const connectors = getConnectors();

  // Resolve folder
  let folderId: string | null = null;
  try {
    folderId = await resolveFolder(connectors, customerName || "Proposals");
  } catch (e) {
    console.warn("Could not resolve folder, uploading to root:", e);
  }

  // Build multipart body
  const boundary = `proposal_builder_${Date.now()}`;
  const metadata: any = { name: filename };
  if (folderId) metadata.parents = [folderId];

  const metadataStr = JSON.stringify(metadata);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(metadataStr),
    Buffer.from(`\r\n--${boundary}\r\n`),
    Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadResp = await connectors.proxy(
    "google-drive",
    "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary="${boundary}"`,
        "Content-Length": body.length.toString(),
      },
      body: body as any,
    }
  );

  const uploadData = await uploadResp.json() as any;
  if (!uploadData.id) {
    throw new Error(`Drive upload failed: ${JSON.stringify(uploadData)}`);
  }

  return {
    fileId: uploadData.id,
    webViewLink: uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`,
  };
}

/**
 * Set a file's sharing permission to "anyone with the link can view".
 */
export async function setFilePublic(fileId: string): Promise<void> {
  if (!isDriveConnected()) throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");

  const connectors = getConnectors();
  const resp = await connectors.proxy(
    "google-drive",
    `/drive/v3/files/${fileId}/permissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader" }),
    }
  );

  const data = await resp.json() as any;
  if (data.error) {
    console.error("Set permission error:", data.error);
    // Non-fatal — don't throw, file is still uploaded
  }
}
