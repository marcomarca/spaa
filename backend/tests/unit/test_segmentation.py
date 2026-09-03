from spaa.domain.segmentation import MarkdownSegmenter


def test_parse_document_chapters_and_sections():
    md = """# Capítulo 1: Introducción a la Visión por Computador

Texto de introducción al capítulo.

## Concepto A: Filtrado de imágenes

Las convoluciones permiten filtrar ruido y detectar bordes.

## Concepto B: Transformada de Hough

Permite detectar líneas y círculos paramétricos.

# Capítulo 2: Deep Learning

Redes neuronales convolucionales modernas.
"""
    segmenter = MarkdownSegmenter(target_words=850, hard_max_words=950)
    chapters = segmenter.parse_document(md)

    assert len(chapters) == 2
    assert chapters[0].sequence == 1
    assert "Capítulo 1" in chapters[0].title
    assert len(chapters[0].sections) >= 2

    assert chapters[1].sequence == 2
    assert "Capítulo 2" in chapters[1].title


def test_segment_chapter_strictly_respects_hard_max():
    # Generate a long text with 1500 words across multiple paragraphs
    paragraph = (
        "Esta es una oración representativa de prueba para validar la segmentación determinista del sistema de audiolibros. "
        * 10
    )
    md = "\n\n".join([f"### Sección {i}\n\n{paragraph}" for i in range(15)])

    segmenter = MarkdownSegmenter(target_words=850, hard_max_words=950)
    chapters = segmenter.parse_document(md)
    assert len(chapters) >= 1

    chunks = segmenter.segment_chapter(chapters[0])
    assert len(chunks) > 1

    for chunk in chunks:
        assert chunk.word_count <= 950, f"Chunk excede límite: {chunk.word_count} palabras"
        assert len(chunk.spoken_text) > 0


def test_segment_chapter_micro_chunks():
    paragraph = (
        "Esta es una oración representativa de prueba para validar la segmentación determinista del sistema de audiolibros. "
        * 15
    )
    md = f"### Sección 1\n\n{paragraph}\n\n{paragraph}"

    segmenter = MarkdownSegmenter(target_words=100, hard_max_words=110)
    chapters = segmenter.parse_document(md)
    chunks = segmenter.segment_chapter(chapters[0])

    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk.word_count <= 110, f"Micro-chunk excede límite: {chunk.word_count} palabras"
        assert len(chunk.spoken_text) > 0
