from spaa.domain.text_cleaner import sanitize_tts_text, split_text_by_words


def test_sanitize_tts_text_quotes_and_guillemets():
    text = "decir: «Me gusta trabajar en INJOY, y ayudar a tantas personas…»"
    cleaned = sanitize_tts_text(text)
    assert "«" not in cleaned
    assert "»" not in cleaned
    assert "'" in cleaned
    assert "Injoy" in cleaned
    assert "INJOY" not in cleaned


def test_sanitize_tts_text_smart_quotes():
    text = "Él dijo: “Esto es excelente”, pero luego vio que ‘todo’ seguía igual."
    cleaned = sanitize_tts_text(text)
    assert "“" not in cleaned
    assert "”" not in cleaned
    assert "‘" not in cleaned
    assert "’" not in cleaned
    assert "'" in cleaned


def test_sanitize_tts_text_dashes():
    text = "Liderazgo—una cualidad esencial–para triunfar."
    cleaned = sanitize_tts_text(text)
    assert " — " in cleaned


def test_split_text_by_words_preserves_short_sentences():
    # Sentences <= 45 words should stay intact, keeping their internal commas
    sentence = "Cuando una persona ha probado el éxito y se da cuenta que sus esfuerzos son importantes, es algo que jamás olvida y que nunca quiere dejar."
    assert len(sentence.split()) <= 45
    chunks = split_text_by_words(sentence, max_words=45)
    assert len(chunks) == 1
    assert chunks[0] == sentence


def test_split_text_by_words_subdivides_on_secondary_punctuation():
    # Sentence > 45 words with commas and colons
    sentence = (
        "En primer lugar, debemos considerar cuidadosamente que el desarrollo personal requiere una constancia diaria inquebrantable: "
        "sin un enfoque bien estructurado y disciplinado en nuestras prioridades más altas, las demandas urgentes consumirán todo nuestro tiempo disponible, "
        "evitando por completo que alcancemos los objetivos estratégicos que verdaderamente importan para nuestro crecimiento a largo plazo."
    )
    words = sentence.split()
    assert len(words) > 45
    chunks = split_text_by_words(sentence, max_words=45)
    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk.split()) <= 45, f"Chunk excede 45 palabras: {len(chunk.split())}"


def test_split_text_by_words_handles_run_on_sentence_without_punctuation():
    # Safeguard test: 60 words without any punctuation
    run_on = " ".join(["palabra"] * 60)
    chunks = split_text_by_words(run_on, max_words=45)
    assert len(chunks) == 2
    assert len(chunks[0].split()) == 45
    assert len(chunks[1].split()) == 15


def test_split_text_by_words_block_13_exact_text():
    b13_text = (
        "Ya no eran los de antes y querían seguir teniendo importancia.\n\n"
        "Un par de semanas antes del anuncio de la mudanza, oí a Patty Knoll, una de nuestras empleadas, "
        "decir: «Me gusta trabajar en INJOY, y ayudar a tantas personas a través de lo que hacemos. "
        "No puedo imaginarme trabajando en otro lugar». Cuando una persona ha probado el éxito y se da cuenta "
        "que sus esfuerzos son importantes, es algo que jamás olvida y que nunca quiere dejar. "
        "El hacer la diferencia en la vida de otros, cambia su perspectiva de la vida y sus prioridades."
    )
    chunks = split_text_by_words(b13_text, max_words=45)
    assert len(chunks) == 5
    for i, c in enumerate(chunks):
        count = len(c.split())
        assert count <= 45, f"Chunk {i + 1} excede 45 palabras ({count}): {c}"
        assert "«" not in c
        assert "»" not in c
        assert "INJOY" not in c

    full_recombined = " ".join(chunks)
    assert "Injoy" in full_recombined
    assert "Patty Knoll" in full_recombined
