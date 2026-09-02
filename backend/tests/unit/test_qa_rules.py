from pathlib import Path

from spaa.domain.qa_rules import AudioQARules


def test_qa_fails_on_nonexistent_file():
    p = Path("non_existent_audio.wav")
    res = AudioQARules.evaluate_chunk_audio(p, word_count=100, duration_seconds=30.0)
    assert not res.passed
    assert "no existe" in (res.reason or "")


def test_qa_fails_on_tiny_file(tmp_path: Path):
    dummy_file = tmp_path / "tiny.wav"
    dummy_file.write_bytes(b"RIFF....")  # 8 bytes
    res = AudioQARules.evaluate_chunk_audio(dummy_file, word_count=100, duration_seconds=30.0)
    assert not res.passed
    assert "pequeño" in (res.reason or "")


def test_qa_fails_on_silence(tmp_path: Path):
    valid_size_file = tmp_path / "silent.wav"
    valid_size_file.write_bytes(b"0" * 4096)
    res = AudioQARules.evaluate_chunk_audio(valid_size_file, word_count=100, duration_seconds=30.0, is_silent=True)
    assert not res.passed
    assert "silencio" in (res.reason or "")


def test_qa_passes_on_valid_proportions(tmp_path: Path):
    valid_file = tmp_path / "good.wav"
    valid_file.write_bytes(b"0" * 8192)
    # 150 words in 60 seconds = 150 wpm (normal speech)
    res = AudioQARules.evaluate_chunk_audio(valid_file, word_count=150, duration_seconds=60.0, is_silent=False)
    assert res.passed
    assert res.words_per_minute == 150.0
