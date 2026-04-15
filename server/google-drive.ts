/**
 * Google Drive integration.
 * Prefers in-app OAuth token (stored in DB) when available.
 * Falls back to Replit Connectors SDK if no in-app token exists.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import { getStoredAccessToken, hasStoredToken, getStoredTokenEmail } from "./google-token";

interface DriveAbout {
  user?: { emailAddress?: string };
  error?: { message?: string };
}

interface DriveFileRef {
  id?: string;
}

interface DriveFileList {
  files?: DriveFileRef[];
  error?: { message?: string };
}

interface DriveFileCreated {
  id?: string;
  webViewLink?: string;
  error?: { message?: string };
}

interface DrivePermission {
  error?: { message?: string };
}

interface DriveUploadCreated {
  id?: string;
  webViewLink?: string;
  error?: { message?: string };
}

export async function isDriveConnected(): Promise<boolean> {
  const hasToken = await hasStoredToken();
  if (hasToken) return true;
  return !!process.env.REPLIT_CONNECTORS_HOSTNAME;
}

export async function testDriveConnection(): Promise<boolean> {
  try {
    const storedToken = await getStoredAccessToken();
    if (storedToken) {
      const resp = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      const data: DriveAbout = await resp.json() as DriveAbout;
      return !!data.user;
    }
    if (!process.env.REPLIT_CONNECTORS_HOSTNAME) return false;
    const connectors = getConnectors();
    const resp = await connectors.proxy("google-drive", "/drive/v3/about?fields=user", { method: "GET" });
    const data: DriveAbout = await resp.json() as DriveAbout;
    return !!data.user;
  } catch {
    return false;
  }
}

export async function getDriveUserEmail(): Promise<string | null> {
  try {
    const storedEmail = await getStoredTokenEmail();
    if (storedEmail) return storedEmail;
    if (!process.env.REPLIT_CONNECTORS_HOSTNAME) return null;
    const connectors = getConnectors();
    const resp = await connectors.proxy("google-drive", "/drive/v3/about?fields=user(emailAddress)", { method: "GET" });
    const data: DriveAbout = await resp.json() as DriveAbout;
    return data.user?.emailAddress ?? null;
  } catch {
    return null;
  }
}

function getConnectors() {
  return new ReplitConnectors();
}

async function driveRequest<T>(endpoint: string, options: RequestInit & { body?: unknown }): Promise<T> {
  const storedToken = await getStoredAccessToken();
  if (storedToken) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${storedToken}`,
      ...((options.headers as Record<string, string>) || {}),
    };
    const resp = await fetch(`https://www.googleapis.com${endpoint}`, {
      ...options,
      headers,
    });
    return resp.json() as Promise<T>;
  }
  if (!process.env.REPLIT_CONNECTORS_HOSTNAME) {
    throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
  }
  const connectors = getConnectors();
  const resp = await connectors.proxy("google-drive", endpoint, options as Parameters<typeof connectors.proxy>[2]);
  return resp.json() as Promise<T>;
}

async function driveRequestRaw(endpoint: string, options: RequestInit & { body?: unknown }): Promise<Response> {
  const storedToken = await getStoredAccessToken();
  if (storedToken) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${storedToken}`,
      ...((options.headers as Record<string, string>) || {}),
    };
    return fetch(`https://www.googleapis.com${endpoint}`, { ...options, headers });
  }
  if (!process.env.REPLIT_CONNECTORS_HOSTNAME) {
    throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
  }
  const connectors = getConnectors();
  return connectors.proxy("google-drive", endpoint, options as Parameters<typeof connectors.proxy>[2]);
}

async function findFolder(name: string, parentId: string | null): Promise<string | null> {
  const parentQuery = parentId ? ` and '${parentId}' in parents` : " and 'root' in parents";
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false${parentQuery}`
  );
  const data = await driveRequest<DriveFileList>(`/drive/v3/files?q=${q}&fields=files(id)`, { method: "GET" });
  if (data.files && data.files.length > 0) return data.files[0].id ?? null;
  return null;
}

async function createFolder(name: string, parentId: string | null): Promise<string> {
  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];
  const data = await driveRequest<DriveFileCreated>("/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  if (!data.id) throw new Error(`Failed to create folder "${name}": ${JSON.stringify(data)}`);
  return data.id;
}

async function findOrCreateFolder(name: string, parentId: string | null): Promise<string> {
  const existing = await findFolder(name, parentId);
  if (existing) return existing;
  return createFolder(name, parentId);
}

async function resolveFolder(customerName: string): Promise<string> {
  const rootId = await findOrCreateFolder("Proposals", null);
  return findOrCreateFolder(customerName, rootId);
}

export async function uploadToDrive(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  customerName?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const connected = await isDriveConnected();
  if (!connected) throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");

  let folderId: string | null = null;
  try {
    folderId = await resolveFolder(customerName || "Proposals");
  } catch (e) {
    console.warn("Could not resolve folder, uploading to root:", e);
  }

  const boundary = `proposal_builder_${Date.now()}`;
  const metadata: { name: string; parents?: string[] } = { name: filename };
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

  const uploadResp = await driveRequestRaw(
    "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary="${boundary}"`,
        "Content-Length": body.length.toString(),
      },
      body: body as unknown as BodyInit,
    }
  );

  const uploadData: DriveUploadCreated = await uploadResp.json() as DriveUploadCreated;
  if (!uploadData.id) throw new Error(`Drive upload failed: ${JSON.stringify(uploadData)}`);

  return {
    fileId: uploadData.id,
    webViewLink: uploadData.webViewLink ?? `https://drive.google.com/file/d/${uploadData.id}/view`,
  };
}

export async function setFilePublic(fileId: string): Promise<void> {
  try {
    const data = await driveRequest<DrivePermission>(`/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader" }),
    });
    if (data.error) console.error("Set permission error:", data.error);
  } catch (e) {
    console.warn("Could not set file public:", e);
  }
}
