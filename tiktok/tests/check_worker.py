"""Exercise real imports, SDK setup, UTF-8 protocol and clean EOF shutdown, without TikTok access."""
import json
from pathlib import Path
import subprocess
import sys

worker = sys.argv[1:]
if not worker:
    worker = [sys.executable, str(Path(__file__).resolve().parents[1] / 'worker.py')]
result = subprocess.run(worker, input=json.dumps({'account': '@livebox_test'}) + '\n{"action":"stop"}\n',
                        capture_output=True, encoding='utf-8', timeout=30)
messages = [json.loads(line) for line in result.stdout.splitlines()]
assert result.returncode == 0, (result.returncode, messages, result.stderr[-1000:])
assert any(m.get('state') == 'stopped' for m in messages), messages
assert not any(m.get('state') == 'error' for m in messages), messages
print('Worker imports, protocol and graceful shutdown passed')
