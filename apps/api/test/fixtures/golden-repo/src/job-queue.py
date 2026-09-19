import time


class JobQueue:
    """An in-process queue of background jobs.

    A job that raises is retried with exponential backoff up to max_attempts,
    after which it moves to the dead-letter list for an operator to inspect.
    This retry logic is for background work only - network calls have their
    own retry policy in the HTTP client.
    """

    def __init__(self, max_attempts: int = 5, base_delay_seconds: float = 0.5) -> None:
        self.max_attempts = max_attempts
        self.base_delay_seconds = base_delay_seconds
        self.dead_letter: list[tuple[str, str]] = []

    def run(self, job_name: str, work) -> None:
        for attempt in range(1, self.max_attempts + 1):
            try:
                work()
                return
            except Exception as error:  # noqa: BLE001 - the queue records every failure
                if attempt == self.max_attempts:
                    self.dead_letter.append((job_name, str(error)))
                    return
                time.sleep(self.base_delay_seconds * (2 ** (attempt - 1)))
