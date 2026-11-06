import asyncio
from pathlib import Path
import queue
import sys
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import worker
from TikTokLive import TikTokLiveClient
from TikTokLive.events import CommentEvent, ConnectEvent, GiftEvent, LikeEvent
from TikTokLive.proto import CommonMessageData, ExtendedUser, Gift


class Commands:
    def __init__(self):
        self.queue = queue.Queue()

    def __iter__(self):
        while True:
            yield self.queue.get(timeout=10)


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_event_bridge_deduplicates_and_shutdown_handles_cancelled_socket(self):
        client = TikTokLiveClient(unique_id='test_account')
        commands = Commands()
        messages = []
        client.web.fetch_room_info = AsyncMock(return_value={
            'id_str': '123', 'owner': {'nickname': '主播'},
            'stream_url': {'flv_pull_url': {'HD': 'https://cdn.test/live.flv'}},
        })
        client.disconnect = AsyncMock(side_effect=asyncio.CancelledError())

        async def events():
            # Check SDK configuration with a real relative request before emitting events.
            request = client.web.signer.sdk_client.get_async_httpx_client().build_request('GET', '/webcast/fetch')
            self.assertEqual(request.url.scheme, 'https')
            self.assertEqual(request.url.host, 'api.eulerstream.com')
            self.assertEqual(request.headers['X-Api-Key'], 'test-key')
            user = ExtendedUser(id=9007199254740993, nickname='观众')
            client.emit(ConnectEvent.get_type(), ConnectEvent(unique_id='test_account', room_id=123))
            chat = CommentEvent(common=CommonMessageData(msg_id=1), user=user, content='你好')
            client.emit(CommentEvent.get_type(), chat)
            client.emit(CommentEvent.get_type(), chat)
            gift = Gift(id=2, name='Rose', type=1, diamond_count=1)
            client.emit(GiftEvent.get_type(), GiftEvent(common=CommonMessageData(msg_id=2), user=user, gift=gift, repeat_count=3, repeat_end=0))
            final = GiftEvent(common=CommonMessageData(msg_id=3), user=user, gift=gift, repeat_count=3, repeat_end=1)
            client.emit(GiftEvent.get_type(), final)
            client.emit(GiftEvent.get_type(), final)
            client.emit(LikeEvent.get_type(), LikeEvent(common=CommonMessageData(msg_id=4), user=user, count=2, total=100))
            await asyncio.sleep(0.02)
            commands.queue.put('{"action":"stop"}\n')
            await asyncio.Future()

        async def start(**_):
            return asyncio.create_task(events())

        client.start = start
        with patch('TikTokLive.TikTokLiveClient', return_value=client), patch.object(worker.sys, 'stdin', commands), patch.object(worker, 'emit', side_effect=lambda kind, **data: messages.append({'type': kind, **data})):
            await asyncio.wait_for(worker.run({'account': '@test_account', 'apiKey': 'test-key'}), timeout=8)
        self.assertTrue(any(m['type'] == 'room' and m['room']['streams'][0]['url'].startswith('http://127.0.0.1:') for m in messages))
        events_received = [m['event'] for m in messages if m['type'] == 'event']
        self.assertEqual([e['type'] for e in events_received], ['chat', 'gift', 'like'])
        self.assertEqual(events_received[1]['repeatCount'], 3)
        self.assertEqual(messages[-1]['state'], 'stopped')
        client.disconnect.assert_awaited_once()


if __name__ == '__main__':
    unittest.main()
