import time
from collections import OrderedDict


class LruTtlCache:
    """A bounded cache that evicts by least-recent use and by age.

    Entries expire after ttl_seconds regardless of use, and when the cache is
    full the least recently read entry is discarded to make room. Reading an
    entry marks it as most recently used.
    """

    def __init__(self, max_entries: int = 128, ttl_seconds: float = 60.0) -> None:
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self._entries: OrderedDict[str, tuple[float, object]] = OrderedDict()

    def get(self, key: str):
        entry = self._entries.get(key)
        if entry is None:
            return None
        stored_at, value = entry
        if time.monotonic() - stored_at > self.ttl_seconds:
            del self._entries[key]
            return None
        self._entries.move_to_end(key)
        return value

    def put(self, key: str, value: object) -> None:
        self._entries[key] = (time.monotonic(), value)
        self._entries.move_to_end(key)
        while len(self._entries) > self.max_entries:
            self._entries.popitem(last=False)
