// Ported from notevault_app/core/english/audio.py
// WAV container for raw PCM captured from the microphone.

export function wavBytes(
  pcm: Uint8Array,
  sampleRate: number,
  channels: number,
  bits: number,
  isFloat = false,
): Uint8Array {
  const blockAlign = (channels * bits) / 8;
  const fmtTag = isFloat ? 3 : 1;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(fmtTag, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, Buffer.from(pcm)]);
}

export function durationMs(pcmLen: number, sampleRate: number, channels: number, bits: number): number {
  const perSecond = Math.floor((sampleRate * channels * bits) / 8);
  return perSecond ? Math.trunc((pcmLen * 1000) / perSecond) : 0;
}

export const wav_bytes = wavBytes;
export const duration_ms = durationMs;
