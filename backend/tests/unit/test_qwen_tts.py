from pathlib import Path

from spaa.adapters.qwen_tts_engine import QwenTTSEngine
from spaa.adapters.tts_providers import QwenTTSProvider
from spaa.domain.models import DEFAULT_QWEN_INSTRUCT


def test_qwen_tts_engine_initialization(tmp_path: Path):
    engine = QwenTTSEngine(base_dir=tmp_path)
    assert engine.default_speaker == "Ryan"
    assert engine.chunk_words == 90
    assert engine.gap_seconds == 0.20
    assert engine.default_instruct == DEFAULT_QWEN_INSTRUCT
    assert "energética" in engine.default_instruct


def test_qwen_tts_speaker_validation(tmp_path: Path):
    # Valid speaker
    engine_valid = QwenTTSEngine(base_dir=tmp_path, default_speaker="Serena")
    assert engine_valid.default_speaker == "Serena"

    # Invalid speaker falls back to Ryan
    engine_invalid = QwenTTSEngine(base_dir=tmp_path, default_speaker="NonExistentSpeaker")
    assert engine_invalid.default_speaker == "Ryan"


def test_qwen_tts_model_availability(tmp_path: Path):
    engine = QwenTTSEngine(base_dir=tmp_path)
    # Model config does not exist yet
    assert not engine.is_model_available()

    # Create mock config.json
    model_dir = tmp_path / "qwen3tts" / "models" / "Qwen3-TTS-12Hz-1.7B-CustomVoice"
    model_dir.mkdir(parents=True, exist_ok=True)
    config_file = model_dir / "config.json"
    config_file.write_text("{}", encoding="utf-8")

    assert engine.is_model_available()


def test_qwen_tts_empty_text_error(tmp_path: Path):
    engine = QwenTTSEngine(base_dir=tmp_path)
    out_wav = tmp_path / "test.wav"
    res = engine.synthesize(text="   ", output_wav=out_wav)
    assert not res["success"]
    assert "vacío" in res["error"]


def test_qwen_tts_missing_model_error(tmp_path: Path):
    engine = QwenTTSEngine(base_dir=tmp_path)
    out_wav = tmp_path / "test.wav"
    res = engine.synthesize(text="Texto de prueba", output_wav=out_wav)
    assert not res["success"]
    assert "no disponible" in res["error"]


def test_qwen_provider_interface():
    provider = QwenTTSProvider()
    assert provider.get_provider_name() == "qwen"


def test_get_gpu_temperature(monkeypatch):
    from spaa.services.local_qwen_worker import get_gpu_temperature

    # Test when nvidia-smi returns a valid reading
    class MockSuccess:
        returncode = 0
        stdout = "63\n"

    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: MockSuccess())
    assert get_gpu_temperature() == 63

    # Test when nvidia-smi fails
    class MockFail:
        returncode = 1
        stdout = ""

    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: MockFail())
    assert get_gpu_temperature() is None


def test_local_qwen_worker_thermal_params():
    from spaa.services.local_qwen_worker import LocalQwenWorker

    worker = LocalQwenWorker(
        max_temp_celsius=72,
        cooldown_temp_celsius=55,
        check_thermal=True,
    )
    assert worker.max_temp_celsius == 72
    assert worker.cooldown_temp_celsius == 55
    assert worker.check_thermal is True


def test_setup_worker_logging(tmp_path: Path):
    import logging

    from spaa.logging_config import setup_worker_logging

    log_file = setup_worker_logging("test_worker", log_dir=tmp_path)
    assert log_file.exists()
    assert log_file.name == "test_worker.log"

    test_logger = logging.getLogger("spaa.test")
    test_logger.info("Mensaje de prueba de logging")
    content = log_file.read_text(encoding="utf-8")
    assert "Mensaje de prueba de logging" in content


def test_qwen_tts_dynamic_timeout_and_error_handling(tmp_path: Path, monkeypatch):
    engine = QwenTTSEngine(base_dir=tmp_path)

    # Mock model availability
    monkeypatch.setattr(engine, "is_model_available", lambda: True)

    captured_timeout = None

    class MockPopen:
        returncode = 1

        def __init__(self, *args, **kwargs):
            self.stdout = ["[PROGRESS] Generando...\n", '{"success": false, "error": "CUDA out of memory"}\n']
            self.stderr = [
                "NOTE: Redirects are currently not supported in Windows or MacOs.\n",
                "Setting `pad_token_id` to `eos_token_id`\n",
            ]

        def wait(self, timeout=None):
            nonlocal captured_timeout
            if captured_timeout is None and timeout is not None:
                captured_timeout = timeout
            return self.returncode

    monkeypatch.setattr("subprocess.Popen", MockPopen)

    out_wav = tmp_path / "out.wav"
    long_text = " ".join(["palabra"] * 500)
    res = engine.synthesize(text=long_text, output_wav=out_wav)

    # Verify dynamic timeout: 500 words * 4 + 240 = 2240s (rem_timeout is ~2240s)
    assert captured_timeout is not None
    assert captured_timeout >= 2230
    # Verify JSON error was prioritized over stderr warnings
    assert not res["success"]
    assert res["error"] == "Fallo en CLI Qwen3-TTS: CUDA out of memory"
