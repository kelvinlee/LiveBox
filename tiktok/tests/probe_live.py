"""Read-only live verification. Prints counts/status only, never raw chat or signed URLs."""
import argparse
from collections import Counter
import json
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time

import httpx

parser = argparse.ArgumentParser()
parser.add_argument('account')
parser.add_argument('--worker')
parser.add_argument('--duration', type=int, default=45)
parser.add_argument('--proxy', default='')
args = parser.parse_args()
command = [args.worker] if args.worker else [sys.executable, str(Path(__file__).resolve().parents[1] / 'worker.py')]
process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           text=True, encoding='utf-8', creationflags=0x08000000 if sys.platform == 'win32' else 0)
process.stdin.write(json.dumps({'account': args.account, 'proxy': args.proxy, 'apiKey': ''}) + '\n')
process.stdin.flush()
pending = queue.Queue()


def read():
    for line in process.stdout:
        pending.put(json.loads(line))


threading.Thread(target=read, daemon=True).start()
counts = Counter()
connected = False
video_ok = False
room_found = False
deadline = time.monotonic() + args.duration
try:
    while time.monotonic() < deadline:
        try:
            message = pending.get(timeout=1)
        except queue.Empty:
            if process.poll() is not None:
                break
            continue
        kind = message.get('type')
        if kind == 'status':
            print(json.dumps({k: message[k] for k in ('type', 'state', 'code', 'message') if k in message}, ensure_ascii=True), flush=True)
            connected |= message.get('state') == 'connected'
        elif kind == 'video_error':
            print(json.dumps(message, ensure_ascii=True), flush=True)
        elif kind == 'room':
            room_found = True
            sources = message['room']['streams']
            sources.sort(key=lambda source: source['format'] != 'flv')
            print(json.dumps({'roomFound': True, 'streamCount': len(sources), 'formats': sorted({s['format'] for s in sources})}), flush=True)
            if sources and not video_ok:
                try:
                    with httpx.Client(trust_env=False, timeout=15) as http:
                        url = sources[0]['url']
                        print(json.dumps({'videoFormat': sources[0]['format'], 'videoLabel': sources[0]['label']}), flush=True)
                        for _ in range(4):
                            with http.stream('GET', url) as response:
                                response.raise_for_status()
                                if 'mpegurl' in response.headers.get('content-type', ''):
                                    playlist = response.read().decode()
                                    url = next(line for line in playlist.splitlines() if line and not line.startswith('#'))
                                    continue
                                video_ok = bool(next(response.iter_bytes(), b''))
                                break
                    print(json.dumps({'videoBytesReceived': video_ok}), flush=True)
                except Exception as error:
                    print(json.dumps({'videoProbeError': type(error).__name__}), flush=True)
        elif kind == 'event':
            counts[message['event']['type']] += 1
finally:
    if process.poll() is None:
        process.stdin.write('{"action":"stop"}\n')
        process.stdin.close()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
    print(json.dumps({'connected': connected, 'roomFound': room_found, 'videoBytesReceived': video_ok,
                      'eventCounts': counts, 'exitCode': process.returncode}), flush=True)
