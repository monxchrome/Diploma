import logging
import sys

import structlog

LOG_LEVELS = {
    "critical": logging.CRITICAL,
    "debug": logging.DEBUG,
    "error": logging.ERROR,
    "info": logging.INFO,
    "warning": logging.WARNING,
}


def configure_logging(log_level: str, service_name: str, environment: str) -> None:
    level = LOG_LEVELS.get(log_level, logging.INFO)
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    structlog.configure(
        cache_logger_on_first_use=True,
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
    )
    structlog.contextvars.bind_contextvars(environment=environment, service=service_name)


def get_logger() -> structlog.stdlib.BoundLogger:
    return structlog.get_logger()
