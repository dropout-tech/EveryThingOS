import { wavBase64 } from "./wav-clip";

const MAX_MS = 8_000;

/** Hold to record one short clip. Returns 16 kHz WAV as base64, or null when this browser has no microphone. */
export async function startClip(): Promise<{ stop: () => Promise<string> } | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return null;
  }
  const ctx = new AudioContext();
  const rate = ctx.sampleRate;
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const chunks: Float32Array[] = [];
  const started = performance.now();
  processor.onaudioprocess = (event) => {
    if (performance.now() - started > MAX_MS) return;
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(gain);
  gain.connect(ctx.destination);
  return {
    stop: async () => {
      processor.onaudioprocess = null;
      processor.disconnect();
      source.disconnect();
      gain.disconnect();
      for (const track of stream.getTracks()) track.stop();
      const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const merged = new Float32Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      await ctx.close();
      return wavBase64(merged, rate);
    },
  };
}
