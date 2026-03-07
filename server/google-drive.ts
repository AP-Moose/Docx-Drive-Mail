// Google Drive integration - populated after OAuth connection
// This file will be updated with the actual connector snippet after authorization

export async function uploadToDrive(
  _buffer: Buffer,
  _filename: string,
  _mimeType: string
): Promise<{ fileId: string; webViewLink: string }> {
  throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
}

export async function setFilePublic(_fileId: string): Promise<void> {
  throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
}

export function isDriveConnected(): boolean {
  return false;
}
