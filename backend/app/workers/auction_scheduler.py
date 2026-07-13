import asyncio
import logging
import signal

from app.core.logging_config import configure_logging
from app.services.auction_scheduler import scheduler_loop

logger = logging.getLogger(__name__)


async def run() -> None:
    configure_logging()
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signal_name in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signal_name, stop_event.set)
    logger.info("Auction scheduler worker started.")
    try:
        await scheduler_loop(stop_event)
    finally:
        logger.info("Auction scheduler worker stopped.")


if __name__ == "__main__":
    asyncio.run(run())
