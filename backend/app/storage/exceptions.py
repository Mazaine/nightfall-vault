class StorageError(RuntimeError):
    """Base error for media storage operations."""


class InvalidStorageKey(StorageError):
    """Raised when a storage key could escape the configured media root."""


class StorageUnavailable(StorageError):
    """Raised when the configured media storage is not usable."""
