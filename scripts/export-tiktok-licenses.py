"""Ship metadata and license texts for the worker's dependency distributions."""
import importlib.metadata
from pathlib import Path
import sys

destination = Path(sys.argv[1])
destination.mkdir(parents=True, exist_ok=True)
for distribution in importlib.metadata.distributions():
    name = distribution.metadata.get('Name', 'unknown')
    if name.lower() in ('pip', 'pyinstaller', 'pyinstaller-hooks-contrib'):
        continue
    package_dir = destination / name
    package_dir.mkdir(exist_ok=True)
    (package_dir / 'METADATA.txt').write_text(distribution.read_text('METADATA') or name, encoding='utf-8')
    for entry in distribution.files or []:
        if any(part.lower().startswith(('license', 'copying', 'notice')) for part in entry.parts):
            source = Path(distribution.locate_file(entry))
            if source.is_file():
                (package_dir / ('_'.join(entry.parts))).write_bytes(source.read_bytes())
python_license = Path(sys.base_prefix) / 'LICENSE.txt'
if python_license.exists():
    (destination / 'Python-LICENSE.txt').write_bytes(python_license.read_bytes())
