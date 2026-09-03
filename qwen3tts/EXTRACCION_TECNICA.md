# Extracción técnica: sólo CustomVoice 1.7B

## Origen

El archivo subido `Ultimate-TTS-Studio-main.zip` es un launcher Pinokio. Su `install.js` ejecuta:

```text
git clone https://github.com/SUP3RMASS1VE/Ultimate-TTS-Studio-SUP3R-Edition app
```

Por tanto, el código efectivo de Qwen no estaba físicamente dentro del ZIP subido.

## Ruta concreta encontrada en el proyecto real

`qwen_tts_handler.py`

La parte relevante define:

```python
QWEN_SPEAKERS = [
    "Aiden", "Dylan", "Eric", "Ono_anna", "Ryan",
    "Serena", "Sohee", "Uncle_fu", "Vivian"
]
```

El repo del checkpoint se construye como:

```python
f"Qwen/Qwen3-TTS-12Hz-{model_size}-{model_type}"
```

Para el caso aislado:

```text
Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice
```

Carga relevante:

```python
Qwen3TTSModel.from_pretrained(
    local_path,
    device_map="cuda",
    torch_dtype=torch.bfloat16,
)
```

Generación relevante:

```python
wavs, sr = tts.generate_custom_voice(
    text=text.strip(),
    language="Spanish",
    speaker=speaker.lower().replace(" ", "_"),
    instruct=instruct.strip() if instruct else None,
    non_streaming_mode=True,
    max_new_tokens=2048,
)
```

## Eliminado deliberadamente

- Diccionario y gestión de VoiceDesign.
- Base 0.6B / 1.7B y VoiceClone.
- CustomVoice 0.6B.
- Whisper/transcripción.
- MP3 y efectos del Studio.
- Integraciones con otros motores.
- Gestión Pinokio.
- UI gigantesca de `launch.py`.

## Añadido para uso standalone

- Caché Hugging Face local al proyecto.
- Descarga explícita de un solo checkpoint.
- UI Gradio local en 127.0.0.1.
- Load/unload manual de VRAM.
- Medición de tiempo, RTF y VRAM.
- Chunking externo secuencial para textos grandes.
- Escritura progresiva del WAV para no acumular un audiolibro completo en RAM.
