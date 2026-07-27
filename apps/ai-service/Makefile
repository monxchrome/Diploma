.PHONY: build dev format lint test typecheck

build:
	python -m compileall app

dev:
	uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

format:
	uv run ruff format .

lint:
	uv run ruff check .

test:
	uv run pytest

typecheck:
	uv run pyright
