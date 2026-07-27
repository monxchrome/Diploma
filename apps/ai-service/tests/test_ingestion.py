from app.services.ingestion import chunk_text, deterministic_embedding, normalize_text


def test_chunking_is_deterministic_and_hashes_are_stable() -> None:
    text = "alpha beta gamma " * 600

    first = chunk_text(text)
    second = chunk_text(text)

    assert first
    assert [chunk.content_hash for chunk in first] == [chunk.content_hash for chunk in second]
    assert all(chunk.content for chunk in first)


def test_normalization_and_embedding_are_bounded() -> None:
    assert normalize_text("hello\r\n\r\n\r\nworld") == "hello\n\nworld"
    assert len(deterministic_embedding("hello world")) == 64
