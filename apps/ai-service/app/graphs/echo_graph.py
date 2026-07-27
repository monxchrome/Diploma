from datetime import UTC, datetime
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.schemas.contracts import AiEchoResponse


class EchoState(TypedDict):
    message: str
    request_id: str
    timestamp: str


def echo_node(state: EchoState) -> EchoState:
    return {
        "message": state["message"],
        "request_id": state["request_id"],
        "timestamp": datetime.now(UTC).isoformat(),
    }


def build_echo_graph():
    graph = StateGraph(EchoState)
    graph.add_node("echo_node", echo_node)
    graph.add_edge(START, "echo_node")
    graph.add_edge("echo_node", END)
    return graph.compile()


echo_graph = build_echo_graph()


def run_echo_graph(message: str, request_id: str) -> AiEchoResponse:
    state = echo_graph.invoke(
        {
            "message": message,
            "request_id": request_id,
            "timestamp": datetime.now(UTC).isoformat(),
        }
    )

    return AiEchoResponse(
        message=state["message"],
        requestId=state["request_id"],
        timestamp=state["timestamp"],
    )
