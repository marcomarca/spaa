from spaa.domain.markdown_cleaner import MarkdownCleaner


def test_clean_for_tts_removes_markdown_syntax():
    md = """# NeRF: Neural Radiance Fields

**NeRF** representa escenas complejas mediante una red neuronal.
Consulta el [paper original](https://arxiv.org/abs/2003.08934) y la imagen ![diagrama](https://example.com/img.png).

```python
def render():
    pass
```

* Punto 1
* Punto 2

1. Primer paso
2. Segundo paso
"""
    cleaned = MarkdownCleaner.clean_for_tts(md)

    assert "NeRF: Neural Radiance Fields." in cleaned
    assert "NeRF representa escenas complejas mediante una red neuronal." in cleaned
    assert "paper original" in cleaned
    assert "https://arxiv.org" not in cleaned
    assert "![diagrama]" not in cleaned
    assert "```" not in cleaned
    assert "Punto 1" in cleaned
    assert "Primer paso" in cleaned


def test_word_count():
    text = "Uno dos tres cuatro cinco"
    assert MarkdownCleaner.count_words(text) == 5
    assert MarkdownCleaner.count_words("") == 0
    assert MarkdownCleaner.count_words("   \n\t ") == 0
