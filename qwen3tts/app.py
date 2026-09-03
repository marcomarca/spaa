from __future__ import annotations

import gradio as gr

from qwen_custom_voice import (
    DEFAULT_ENERGY_INSTRUCT,
    DEFAULT_MAX_NEW_TOKENS,
    MODEL_ID,
    SPEAKERS,
    QwenCustomVoiceEngine,
)

engine = QwenCustomVoiceEngine()


def speaker_info(name: str) -> str:
    data = SPEAKERS[name]
    return f"**{name}** — {data['description']}  \nIdioma nativo: {data['native']}"


def load_model():
    try:
        return engine.load()
    except Exception as exc:
        return f"ERROR: {type(exc).__name__}: {exc}"


def unload_model():
    try:
        return engine.unload()
    except Exception as exc:
        return f"ERROR: {type(exc).__name__}: {exc}"


def generate_audio(text, speaker, instruct, seed, max_new_tokens, chunk_words, gap_seconds, progress=gr.Progress()):
    try:
        def cb(done, total, desc):
            if total:
                progress(done / total, desc=desc)

        stats = engine.generate(
            text=text,
            speaker=speaker,
            instruct=instruct,
            seed=int(seed),
            max_new_tokens=int(max_new_tokens),
            chunk_words=int(chunk_words),
            gap_seconds=float(gap_seconds),
            progress_callback=cb,
        )
        return stats.output_path, stats.as_text(), engine.status()
    except Exception as exc:
        return None, f"ERROR: {type(exc).__name__}: {exc}", engine.status()


with gr.Blocks(title="Qwen3-TTS 1.7B CustomVoice — Español") as demo:
    gr.Markdown(
        f"""
# Qwen3-TTS 1.7B CustomVoice — Español

Aplicación local restringida a **un único modelo**: `{MODEL_ID}`.  
No contiene VoiceDesign, Base/VoiceClone ni ningún otro motor TTS. El idioma de síntesis está fijado a **Spanish**.
"""
    )

    with gr.Row():
        load_btn = gr.Button("Cargar modelo en GPU", variant="primary")
        unload_btn = gr.Button("Descargar de VRAM")
    model_status = gr.Textbox(label="Estado del modelo", value=engine.status(), lines=6, interactive=False)

    with gr.Row():
        with gr.Column(scale=2):
            text = gr.Textbox(
                label="Texto en español",
                placeholder="Escribe o pega aquí el texto a sintetizar...",
                lines=14,
            )
            instruct = gr.Textbox(
                label="Instruct / estilo",
                value=DEFAULT_ENERGY_INSTRUCT,
                lines=4,
                info="Se envía directamente al parámetro instruct de generate_custom_voice().",
            )
        with gr.Column(scale=1):
            speaker = gr.Dropdown(
                choices=list(SPEAKERS.keys()),
                value="Ryan",
                label="Speaker",
            )
            info = gr.Markdown(speaker_info("Ryan"))
            seed = gr.Number(value=-1, precision=0, label="Seed (-1 = aleatoria)")
            max_new_tokens = gr.Slider(
                minimum=256,
                maximum=8192,
                value=DEFAULT_MAX_NEW_TOKENS,
                step=256,
                label="max_new_tokens",
                info="Ultimate TTS Studio usa 2048 por defecto.",
            )
            chunk_words = gr.Slider(
                minimum=20,
                maximum=400,
                value=180,
                step=10,
                label="Palabras máximas por bloque",
                info="El corte largo es externo: cada bloque se genera secuencialmente con CustomVoice.",
            )
            gap_seconds = gr.Slider(
                minimum=0,
                maximum=1.0,
                value=0.20,
                step=0.05,
                label="Silencio entre bloques (s)",
            )

    generate_btn = gr.Button("GENERAR AUDIO", variant="primary")
    output_audio = gr.Audio(label="Audio generado", type="filepath")
    generation_stats = gr.Textbox(label="Estadísticas", lines=5, interactive=False)

    speaker.change(speaker_info, inputs=speaker, outputs=info)
    load_btn.click(load_model, outputs=model_status)
    unload_btn.click(unload_model, outputs=model_status)
    generate_btn.click(
        generate_audio,
        inputs=[text, speaker, instruct, seed, max_new_tokens, chunk_words, gap_seconds],
        outputs=[output_audio, generation_stats, model_status],
    )

if __name__ == "__main__":
    # Localhost only: no share link and no LAN exposure.
    demo.queue(default_concurrency_limit=1).launch(
        server_name="127.0.0.1",
        server_port=7860,
        share=False,
        inbrowser=True,
    )
