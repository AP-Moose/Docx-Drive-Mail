import { google } from "googleapis";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { appConfig } from "./config";
import { getGoogleProviderMode, getOAuthClient } from "./google-auth";
import { Readable } from "stream";

type DriveClient = ReturnType<typeof google.drive>;

function getConnectors() {
  return new ReplitConnectors();
}

async function getDriveClient(): Promise<DriveClient> {
  const auth = await getOAuthClient();
  return google.drive({ version: "v3", auth });
}

export function isDriveConnected(): boolean {
  return getGoogleProviderMode() !== "none";
}

export async function testDriveConnection(): Promise<boolean> {
  try {
    if (!isDriveConnected()) return false;
    const mode = getGoogleProviderMode();

    if (mode === "oauth") {
      const drive = await getDriveClient();
      const result = await drive.about.get({ fields: "user(emailAddress)" });
      return Boolean(result.data.user?.emailAddress);
    }

    const connectors = getConnectors();
    const resp = await connectors.proxy("google-drive", "/drive/v3/about?fields=user", {
      method: "GET",
    });
    const data = (await resp.json()) as { user?: { emailAddress?: string } };
    return Boolean(data.user);
  } catch {
    return false;
  }
}

export async function getDriveUserEmail(): Promise<string | null> {
  try {
    if (!isDriveConnected()) return null;
    const mode = getGoogleProviderMode();

    if (mode === "oauth") {
      const drive = await getDriveClient();
      const result = await drive.about.get({ fields: "user(emailAddress)" });
      return result.data.user?.emailAddress || null;
    }

    const connectors = getConnectors();
    const resp = await connectors.proxy(
      "google-drive",
      "/drive/v3/about?fields=user(emailAddress)",
      { method: "GET" },
    );
    const data = (await resp.json()) as { user?: { emailAddress?: string } };
    return data.user?.emailAddress || null;
  } catch {
    return null;
  }
}

async function findFolderOAuth(
  drive: DriveClient,
  name: string,
  parentId: string | null,
): Promise<string | null> {
  const parentQuery = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const response = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false and ${parentQuery}`,
    fields: "files(id)",
    spaces: "drive",
  });

  return response.data.files?.[0]?.id || null;
}

async function createFolderOAuth(
  drive: DriveClient,
  name: string,
  parentId: string | null,
): Promise<string> {
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });

  if (!response.data.id) throw new Error(`Failed to create folder "${name}"`);
  return response.data.id;
}

async function findOrCreateFolderOAuth(
  drive: DriveClient,
  name: string,
  parentId: string | null,
) {
  const existing = await findFolderOAuth(drive, name, parentId);
  if (existing) return existing;
  return createFolderOAuth(drive, name, parentId);
}

async function resolveFolderOAuth(drive: DriveClient, customerName: string) {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = now.toLocaleString("en-US", { month: "long" });

  const rootId = await findOrCreateFolderOAuth(
    drive,
    appConfig.googleDriveRootFolder,
    null,
  );
  const proposalsId = await findOrCreateFolderOAuth(drive, "Proposals", rootId);
  const yearId = await findOrCreateFolderOAuth(drive, year, proposalsId);
  const monthId = await findOrCreateFolderOAuth(drive, month, yearId);
  return findOrCreateFolderOAuth(drive, customerName, monthId);
}

async function findFolderReplit(
  connectors: ReplitConnectors,
  name: string,
  parentId: string | null,
): Promise<string | null> {
  const parentQuery = parentId ? ` and '${parentId}' in parents` : " and 'root' in parents";
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false${parentQuery}`,
  );
  const resp = await connectors.proxy("google-drive", `/drive/v3/files?q=${q}&fields=files(id)`, {
    method: "GET",
  });
  const data = (await resp.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id || null;
}

async function createFolderReplit(
  connectors: ReplitConnectors,
  name: string,
  parentId: string | null,
): Promise<string> {
  const metadata: {
    name: string;
    mimeType: string;
    parents?: string[];
  } = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  const resp = await connectors.proxy("google-drive", "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  const data = (await resp.json()) as { id?: string };
  if (!data.id) throw new Error(`Failed to create folder "${name}"`);
  return data.id;
}

async function findOrCreateFolderReplit(
  connectors: ReplitConnectors,
  name: string,
  parentId: string | null,
) {
  const existing = await findFolderReplit(connectors, name, parentId);
  if (existing) return existing;
  return createFolderReplit(connectors, name, parentId);
}

async function resolveFolderReplit(connectors: ReplitConnectors, customerName: string) {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = now.toLocaleString("en-US", { month: "long" });

  const rootId = await findOrCreateFolderReplit(
    connectors,
    appConfig.googleDriveRootFolder,
    null,
  );
  const proposalsId = await findOrCreateFolderReplit(connectors, "Proposals", rootId);
  const yearId = await findOrCreateFolderReplit(connectors, year, proposalsId);
  const monthId = await findOrCreateFolderReplit(connectors, month, yearId);
  return findOrCreateFolderReplit(connectors, customerName, monthId);
}

export async function uploadToDrive(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  customerName?: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const mode = getGoogleProviderMode();
  if (mode === "none") throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");

  if (mode === "oauth") {
    const drive = await getDriveClient();
    const folderId = await resolveFolderOAuth(drive, customerName || "Proposals");
    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: folderId ? [folderId] : undefined,
      },
      media: {
        mimeType,
        body: Readable.from([fileBuffer]),
      },
      fields: "id,webViewLink",
    });

    if (!response.data.id) throw new Error("Drive upload failed");

    return {
      fileId: response.data.id,
      webViewLink:
        response.data.webViewLink ||
        `https://drive.google.com/file/d/${response.data.id}/view`,
    };
  }

  const connectors = getConnectors();
  let folderId: string | null = null;
  try {
    folderId = await resolveFolderReplit(connectors, customerName || "Proposals");
  } catch (error) {
    console.warn("Could not resolve Drive folder via Replit connector:", error);
  }

  const boundary = `proposal_builder_${Date.now()}`;
  const metadata: { name: string; parents?: string[] } = { name: filename };
  if (folderId) metadata.parents = [folderId];

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from("Content-Type: application/json; charset=UTF-8\r\n\r\n"),
    Buffer.from(JSON.stringify(metadata)),
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
      body: body as unknown as BodyInit,
    },
  );

  const uploadData = (await uploadResp.json()) as { id?: string; webViewLink?: string };
  if (!uploadData.id) throw new Error("Drive upload failed");

  return {
    fileId: uploadData.id,
    webViewLink:
      uploadData.webViewLink ||
      `https://drive.google.com/file/d/${uploadData.id}/view`,
  };
}

export async function setFilePublic(fileId: string): Promise<void> {
  const mode = getGoogleProviderMode();
  if (mode === "none") throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");

  if (mode === "oauth") {
    const drive = await getDriveClient();
    await drive.permissions.create({
      fileId,
      requestBody: {
        type: "anyone",
        role: "reader",
      },
    });
    return;
  }

  const connectors = getConnectors();
  const resp = await connectors.proxy(
    "google-drive",
    `/drive/v3/files/${fileId}/permissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader" }),
    },
  );

  const data = (await resp.json()) as { error?: unknown };
  if (data.error) {
    console.error("Drive permission error:", data.error);
  }
}
