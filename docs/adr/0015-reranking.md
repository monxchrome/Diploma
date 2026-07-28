# 0015 Reranking

Keep reranking behind the retrieval service boundary. The baseline uses deterministic lexical reranking and per-document caps; a production cross-encoder can be introduced or degraded safely without changing public contracts.
