import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    # The cache is file-based (shared by workers), so clear it to keep tests independent.
    cache.clear()
    yield
    cache.clear()
