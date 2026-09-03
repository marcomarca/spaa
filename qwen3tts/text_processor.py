from __future__ import annotations

import re


def sanitize_tts_text(text: str) -> str:
    """
    Sanitizes text for robust neural TTS tokenization:
    - Replaces typographical quotes and guillemets («, », “, ”, ‘, ’) with standard single quotes.
    - Normalizes isolated uppercase acronyms of 3+ letters to Titlecase (e.g. INJOY -> Injoy).
    - Normalizes em-dashes (—, –) with spacing.
    - Cleans excessive whitespace.
    """
    if not text:
        return ""

    # 1. Normalizar comillas tipográficas («, », “, ”, ‘, ’) por comillas simples estándar
    t = text.replace("«", "'").replace("»", "'")
    t = t.replace("“", "'").replace("”", "'")
    t = t.replace("‘", "'").replace("’", "'")

    # 2. Normalizar guiones largos con espaciado consistente
    t = t.replace("—", " — ").replace("–", " — ")

    # 3. Capitalizar siglas en mayúsculas de 3+ letras (INJOY -> Injoy)
    # para evitar deletreo forzado o colapso en speakers no nativos
    t = re.sub(r"\b[A-Z]{3,}\b", lambda m: m.group(0).capitalize(), t)

    # 4. Normalizar espacios en blanco repetidos
    t = re.sub(r"\s+", " ", t).strip()
    return t


def split_text_by_words(text: str, max_words: int = 45) -> list[str]:
    """
    Algoritmo determinista de división en micro-pasadas para TTS neuronal autorregresivo:
    1. Normaliza y sanitiza el texto (comillas, siglas en mayúsculas, guiones).
    2. Divide primero por oraciones mayores (. ! ? …).
    3. Si una oración tiene <= max_words (45 palabras), se preserva intacta con sus pausas y
       comas internas para una prosodia natural.
    4. Si una oración excede max_words, se subdivide por pausas intermedias (:, ;, ,, —) en orden de fuerza.
       La puntuación se conserva al final del fragmento precedente.
    5. Salvaguarda: si una cláusula sin puntuación interna sigue excediendo max_words, se divide
       directamente por palabras en bloques de max_words.
    6. Garantiza estrictamente que ningún bloque final exceda max_words.
    """
    cleaned = sanitize_tts_text(text)
    if not cleaned:
        return []

    # 1. Separar primero por oraciones mayores (. ! ? …)
    major_sentences = re.split(r"(?<=[.!?…])\s+", cleaned)
    chunks: list[str] = []

    for sentence in major_sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        words = sentence.split()
        if len(words) <= max_words:
            chunks.append(sentence)
            continue

        # 2. Si excede max_words, subdividir por pausas intermedias (:, ;, ,, —)
        sub_clauses = re.split(r"(?<=[;:—,])\s+", sentence)
        current: list[str] = []
        current_count = 0

        for clause in sub_clauses:
            clause = clause.strip()
            if not clause:
                continue
            c_words = clause.split()

            # Salvaguarda si una sola cláusula no tiene pausas y aún excede max_words
            if len(c_words) > max_words:
                if current:
                    chunks.append(" ".join(current).strip())
                    current = []
                    current_count = 0
                for i in range(0, len(c_words), max_words):
                    chunks.append(" ".join(c_words[i:i + max_words]))
                continue

            if current_count + len(c_words) <= max_words:
                current.append(clause)
                current_count += len(c_words)
            else:
                if current:
                    chunks.append(" ".join(current).strip())
                current = [clause]
                current_count = len(c_words)

        if current:
            chunks.append(" ".join(current).strip())

    return chunks
