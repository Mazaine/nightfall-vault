import os
from pathlib import Path
from tempfile import gettempdir
from app.core.config import settings
from app.storage import storage


def test_pytest_uses_its_own_temporary_media_tree():
    root = Path(settings.media_root).resolve()
    assert root == storage.root == Path(os.environ["MEDIA_ROOT"]).resolve()
    assert root.name.startswith("nightfall-pytest-media-")
    assert root.parent == Path(gettempdir()).resolve()
    assert root.is_dir()
