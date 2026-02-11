

from pathlib import Path

import pytest

from jamovi.server.instancemodel import InstanceModel
from jamovi.server.formatio import read


@pytest.mark.asyncio
async def test_read_sav(instance_model: InstanceModel):
    """test read_sav()"""

    here_dir = Path(__file__).parent
    data_path = str(here_dir / "data" / "multi.sav")

    read(instance_model, data_path, lambda x: None, {})
