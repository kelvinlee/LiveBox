"""Preserve certificate data shipped beside an environment's ssl module."""
from pathlib import Path
from PyInstaller.utils.hooks import get_module_file_attribute

ssl_directory = Path(get_module_file_attribute('ssl')).parent
certificate = ssl_directory / 'codex-rejected-cas.pem'
datas = [(str(certificate), '.')] if certificate.is_file() else []
