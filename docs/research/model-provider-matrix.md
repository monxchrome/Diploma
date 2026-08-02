# Model Provider Matrix

| Profile               | Provider  | Family    | Runtime      |
| --------------------- | --------- | --------- | ------------ |
| `openai-default`      | OpenAI    | OPENAI    | CLOUD        |
| `anthropic-default`   | Anthropic | ANTHROPIC | CLOUD        |
| `qwen-ollama-default` | Ollama    | QWEN      | LOCAL_OLLAMA |

Every run records the profile version and exact model ID. Cloud IDs must be pinned, not floating aliases. Local records additionally capture available digest, parameter size, quantization and hardware profile. Provider capability differences, including seed support, are disclosed.
