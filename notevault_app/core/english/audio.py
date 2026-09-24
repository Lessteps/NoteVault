"""WAV container for raw PCM captured from the microphone."""

import struct


def wav_bytes(pcm: bytes, sample_rate: int, channels: int, bits: int, is_float: bool = False) -> bytes:
    block_align = channels * bits // 8
    fmt_tag = 3 if is_float else 1
    header = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, fmt_tag, channels, sample_rate,
                                    sample_rate * block_align, block_align, bits)
    header += b"data" + struct.pack("<I", len(pcm))
    return header + pcm


def duration_ms(pcm_len: int, sample_rate: int, channels: int, bits: int) -> int:
    per_second = sample_rate * channels * bits // 8
    return int(pcm_len * 1000 / per_second) if per_second else 0
