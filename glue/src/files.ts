/** One R2 bucket for files that are not the books. The customer never sees it. */
export const FILES_BUCKET = "dropout-backups";

/** Meeting transcript object key. Site, platform and id are kept to a safe path segment. */
export function transcriptKey(site: string, platform: string, meetingId: string) {
  const part = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "x";
  return `meetings/${part(site)}/${part(platform)}-${part(meetingId)}.txt`;
}

/** Writes the original transcript. Returns the key, or null when this worker has no bucket yet. */
export async function putTranscript(bucket: R2Bucket | undefined, site: string, platform: string, meetingId: string, text: string) {
  if (!bucket) return null;
  const key = transcriptKey(site, platform, meetingId);
  await bucket.put(key, text, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
  return key;
}
