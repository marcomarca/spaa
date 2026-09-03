from pathlib import Path
import os

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / "cache" / "huggingface"
MODEL_DIR = ROOT / "models" / "Qwen3-TTS-12Hz-1.7B-CustomVoice"
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"

os.environ.setdefault("HF_HOME", str(CACHE_DIR))
os.environ.setdefault("HF_HUB_CACHE", str(CACHE_DIR / "hub"))

from huggingface_hub import snapshot_download

MODEL_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

print(f"Descargando SOLO: {MODEL_ID}")
print(f"Destino: {MODEL_DIR}")

snapshot_download(
    repo_id=MODEL_ID,
    local_dir=str(MODEL_DIR),
    cache_dir=str(CACHE_DIR / "hub"),
)

print("\nDescarga terminada.")
print("No se descargó VoiceDesign, Base, 0.6B ni ningún otro modelo TTS.")
