# ADR 0026: Safe web fetching

The FastAPI service fetches only HTTP(S) pages through a server-controlled fetcher. It rejects credentials, non-public IP ranges, unsafe redirect targets, unexpected content types, compressed payloads, and oversized responses. DNS is resolved for every target immediately before use to reduce DNS-rebinding exposure. Search result text is untrusted data, never tool instructions.
