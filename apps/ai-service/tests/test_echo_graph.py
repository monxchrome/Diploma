from app.graphs.echo_graph import run_echo_graph


def test_echo_graph_returns_response() -> None:
    response = run_echo_graph(message="ping", request_id="req-1")

    assert response.message == "ping"
    assert response.request_id == "req-1"
    assert response.status == "ok"
