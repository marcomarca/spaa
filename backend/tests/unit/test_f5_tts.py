from pathlib import Path

from spaa.adapters.f5_tts_engine import F5TTSEngine


def test_f5_tts_engine_initialization(tmp_path: Path):
    engine = F5TTSEngine(base_dir=tmp_path)
    assert engine.default_voice == "marco"
    assert engine.speed == 1.0


def test_f5_tts_voice_fallback(tmp_path: Path):
    voices_dir = tmp_path / "data" / "voices" / "marco"
    voices_dir.mkdir(parents=True, exist_ok=True)
    ref_wav = voices_dir / "reference.wav"
    ref_wav.write_bytes(b"RIFF" + b"0" * 1000)

    engine = F5TTSEngine(base_dir=tmp_path)
    found_wav, text = engine.get_voice_assets("non_existent_voice")
    assert found_wav == ref_wav
    assert "definir el éxito" in text
