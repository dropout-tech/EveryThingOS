import { MAX_PHOTO_BYTES, MAX_RECEIPT_BYTES } from "./approvals";

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
    } catch {
      /* some browsers cannot decode every format this way; fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("這張照片讀不出來，請改用相機拍或選 JPG 照片。");
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

function encode(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Phone photos are 3–12 MB; a receipt reads fine at 1600 px. Re-encoding as JPEG
 * also drops the photo's location and other EXIF data.
 */
export async function shrinkPhoto(file: File, longest = 1600): Promise<Blob> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) throw new Error("收據要是照片。");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("照片太大了（超過 30 MB），請重拍一張。");
  const image = await decode(file);
  try {
    for (const [size, quality] of [
      [longest, 0.82],
      [Math.round(longest * 0.75), 0.7],
      [Math.round(longest * 0.5), 0.6],
    ] as const) {
      const scale = Math.min(1, size / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
      const blob = await encode(canvas, quality);
      if (blob && blob.size <= MAX_RECEIPT_BYTES) return blob;
    }
  } finally {
    image.done();
  }
  throw new Error("照片縮不下來，請重拍一張。");
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
