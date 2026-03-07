// Gmail integration - populated after OAuth connection
// This file will be updated with the actual connector snippet after authorization

export async function createGmailDraft(
  _to: string,
  _subject: string,
  _body: string,
  _attachmentBuffer: Buffer,
  _attachmentFilename: string
): Promise<{ draftId: string }> {
  throw new Error("GMAIL_NOT_CONNECTED");
}

export function isGmailConnected(): boolean {
  return false;
}
