# Qwen3-TTS 12Hz 1.7B CustomVoice — Standalone ES

Esta carpeta está deliberadamente limitada a **un único checkpoint TTS**:

`Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`

No incluye ni descarga `VoiceDesign`, `Base/VoiceClone`, modelos 0.6B, Kokoro, Fish Speech, F5, Chatterbox, VibeVoice, VoxCPM, IndexTTS ni Pinokio.

## Qué se aisló de Ultimate TTS Studio

El ZIP de Pinokio suministrado no contenía el código de Qwen; su `install.js` clona `SUP3RMASS1VE/Ultimate-TTS-Studio-SUP3R-Edition`. En ese proyecto, `qwen_tts_handler.py` hace para CustomVoice 1.7B esencialmente esto:

- Modelo: `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`
- Carga en CUDA con `bfloat16`.
- Speakers: `Aiden`, `Dylan`, `Eric`, `Ono_Anna`, `Ryan`, `Serena`, `Sohee`, `Uncle_Fu`, `Vivian`.
- Para generar: `generate_custom_voice(text, language, speaker, instruct, non_streaming_mode=True, max_new_tokens=2048)`.
- El speaker se normaliza internamente a minúsculas/underscore.
- El seed `-1` significa semilla aleatoria.

La aplicación de este ZIP conserva esa ruta y elimina los demás modos.

## Idioma

La interfaz está fijada a `Spanish`. Todos los speakers pueden seleccionarse para español, aunque cada uno fue entrenado con un idioma nativo distinto y el acento/calidad puede variar.

### Speakers

| Speaker | Perfil de voz | Idioma nativo |
|---|---|---|
| Ryan | Masculina dinámica, fuerte impulso rítmico | Inglés |
| Aiden | Masculina estadounidense luminosa, rango medio claro | Inglés |
| Vivian | Femenina joven, brillante, ligeramente incisiva | Chino |
| Serena | Femenina joven, cálida y suave | Chino |
| Uncle_Fu | Masculina madura, grave y melosa | Chino |
| Dylan | Masculina joven de Pekín, clara y natural | Chino / Pekín |
| Eric | Masculina vivaz de Chengdu, algo ronca | Chino / Sichuan |
| Ono_Anna | Femenina japonesa juguetona, ligera y ágil | Japonés |
| Sohee | Femenina coreana cálida y emocional | Coreano |

## Instalación en Windows / RTX 3070

1. Instala Python 3.10 x64.
2. Ejecuta `INSTALL_WINDOWS.bat`.
3. Recomendado para reducir memoria y acelerar: `INSTALL_FLASH_ATTN_OPTIONAL.bat`.
4. Ejecuta `DOWNLOAD_MODEL.bat`.
5. Ejecuta `START_WINDOWS.bat`.

La UI se abre únicamente en `http://127.0.0.1:7860`. No se expone a la red local ni crea enlaces públicos.

## Modelo y caché completamente separados de Pinokio

Todo queda dentro de esta carpeta:

- `models/Qwen3-TTS-12Hz-1.7B-CustomVoice/` — checkpoint.
- `cache/huggingface/` — caché del proyecto.
- `.venv/` — entorno Python independiente.
- `outputs/` — WAV y manifiestos JSON generados.

Por tanto puedes mover la carpeta fuera de Pinokio y ejecutarla de forma independiente.

## Texto largo / audiolibros

El handler original marca CustomVoice como **sin chunking nativo**. Esta versión añade un *wrapper externo*: divide el texto en frases/bloques y llama a CustomVoice secuencialmente. Por defecto usa **180 palabras por bloque**, siguiendo el rango que veníamos analizando para tu RTX 3070.

El WAV final se escribe progresivamente al disco, de modo que un libro grande no necesita mantener todo el audio en RAM. Además se crea un JSON junto al WAV con:

- duración por bloque;
- tiempo de generación;
- RTF;
- seed;
- palabras;
- VRAM pico;
- texto de cada bloque.

Para reproducir exactamente una prueba corta como la que hiciste antes, pon el bloque por encima del número de palabras del texto para que se haga una sola llamada.

## `max_new_tokens`

El valor por defecto es **2048**, igual que el handler de Ultimate TTS Studio. La UI permite modificarlo hasta 8192, pero no conviene aumentarlo sin necesidad.

## Instruct energético

La interfaz trae este instruct corto por defecto:

> Extremely energetic, enthusiastic and dynamic delivery. Fast but clear pace, strong emphasis on key words, lively natural intonation, expressive and powerful from beginning to end.

Puedes reemplazarlo en cada generación.

## RTX 3070 8 GB

El proyecto usa `bfloat16` como el handler original. FlashAttention es opcional pero recomendable en una GPU de 8 GB. Si el modelo funciona en tu instalación de Pinokio pero aquí aparece OOM, primero instala FlashAttention y asegúrate de no tener otro proceso ocupando VRAM.

## Qué NO contiene este ZIP

Los pesos del modelo no están dentro del ZIP porque son de varios GB y tampoco estaban en el ZIP de Pinokio que suministraste. `DOWNLOAD_MODEL.bat` descarga **sólo** el checkpoint 1.7B CustomVoice indicado arriba.

## Fuentes upstream

- Qwen3-TTS: https://github.com/QwenLM/Qwen3-TTS
- Checkpoint: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice
- Integración analizada: https://github.com/SUP3RMASS1VE/Ultimate-TTS-Studio-SUP3R-Edition

Qwen3-TTS / checkpoint: Apache-2.0. Ultimate TTS Studio indica licencia MIT para su proyecto. Este paquete standalone no redistribuye los pesos.
