"""Shared helpers for the TTS runners (run_voxcpm.py, run_qwen.py, run_chatterbox.py).

Contract: python run_X.py <jobs.json> <results.json>
  jobs.json    {"jobs":[{id, mode: design|clone, lang: en|de, text, description?, style?, tone?,
                         ref_wav?, ref_text?, seed?, out}]}
  results.json {"results":[{id, ok, error?, warning?, seconds_audio, seconds_wall, sample_rate}],
                "engine", "model", "vram_peak_gb", "load_seconds"}
"""
import json
import os
import random
import sys
import time
import traceback

import numpy as np

TONES = ["neutral", "calm", "warm", "cheeky", "excited", "urgent", "shout", "whisper",
         "menacing", "sad", "deadpan", "pained", "laugh"]

LANG_NAMES = {"en": "English", "de": "German", "es": "Spanish", "zh": "Chinese", "fr": "French"}


def read_jobs(argv):
    if len(argv) < 3:
        print(f"usage: python {os.path.basename(argv[0])} <jobs.json> <results.json>", file=sys.stderr)
        sys.exit(2)
    with open(argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("jobs", []), argv[2]


def seed_all(seed):
    if seed is None:
        return
    seed = int(seed)
    random.seed(seed)
    np.random.seed(seed % (2 ** 32))
    try:
        import torch
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except ImportError:
        pass


def style_or_tone(job):
    """Free-text delivery direction: explicit style wins, else a non-neutral tone word."""
    style = (job.get("style") or "").strip()
    if style:
        return style
    tone = (job.get("tone") or "").strip()
    return tone if tone and tone != "neutral" else ""


def to_mono_f32(wav):
    if hasattr(wav, "detach"):
        wav = wav.detach().float().cpu().numpy()
    wav = np.asarray(wav, dtype=np.float32)
    wav = np.squeeze(wav)
    if wav.ndim == 2:  # (channels, samples) or (samples, channels)
        wav = wav.mean(axis=0) if wav.shape[0] < wav.shape[1] else wav.mean(axis=1)
    return wav


def write_wav(path, wav, sr):
    import soundfile as sf
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    wav = np.clip(to_mono_f32(wav), -1.0, 1.0)
    sf.write(path, wav, int(sr), subtype="PCM_16")
    return len(wav) / float(sr)


def vram_peak_gb():
    try:
        import torch
        if torch.cuda.is_available():
            return round(torch.cuda.max_memory_reserved() / 1024 ** 3, 2)
    except ImportError:
        pass
    return None


def run_jobs(jobs, results_path, engine, model_name, load_seconds, synth):
    """synth(job) -> (wav, sr) or (wav, sr, warning). Raise to fail a job; NotImplementedError -> unsupported."""
    results = []
    for job in jobs:
        jid = job.get("id")
        t0 = time.perf_counter()
        rec = {"id": jid, "ok": False, "seconds_audio": 0.0, "seconds_wall": 0.0, "sample_rate": None}
        try:
            seed_all(job.get("seed"))
            out = synth(job)
            wav, sr = out[0], out[1]
            warning = out[2] if len(out) > 2 else None
            secs = write_wav(job["out"], wav, sr)
            rec.update(ok=True, seconds_audio=round(secs, 3), sample_rate=int(sr))
            if warning:
                rec["warning"] = warning
        except NotImplementedError as e:
            rec["error"] = f"unsupported: {e}"
        except Exception as e:  # keep going with the next job
            rec["error"] = f"{type(e).__name__}: {e}"
            traceback.print_exc()
        rec["seconds_wall"] = round(time.perf_counter() - t0, 3)
        print(json.dumps(rec, ensure_ascii=False), flush=True)
        results.append(rec)
    payload = {"results": results, "engine": engine, "model": model_name,
               "vram_peak_gb": vram_peak_gb(), "load_seconds": round(load_seconds, 2)}
    os.makedirs(os.path.dirname(os.path.abspath(results_path)), exist_ok=True)
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return payload
