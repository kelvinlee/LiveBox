import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import account_from_input, normalize_event, stream_sources
from TikTokLive.events import CommentEvent, GiftEvent, LikeEvent
from TikTokLive.proto import CommonMessageData, ExtendedUser, Gift, ImageModel


class ProtocolTests(unittest.TestCase):
    def test_account_urls_do_not_accept_foreign_hosts_or_short_links(self):
        self.assertEqual(account_from_input('https://www.tiktok.com/@some.name/live?lang=en'), 'some.name')
        self.assertEqual(account_from_input('@some_name'), 'some_name')
        for invalid in ('https://tiktok.com.evil.test/@name/live', 'https://vm.tiktok.com/abc', '', 'bad/name'):
            with self.assertRaises(ValueError):
                account_from_input(invalid)

    def test_actual_protobuf_comment_and_large_ids_remain_strings(self):
        event = CommentEvent(common=CommonMessageData(msg_id=9007199254740993),
                             user=ExtendedUser(id=9007199254740995, nickname='<script>x</script>', unique_id='viewer'),
                             content='你好 <b>主播</b>')
        payload = normalize_event('chat', event)
        self.assertEqual(payload['id'], '9007199254740993')
        self.assertEqual(payload['user']['id'], '9007199254740995')
        self.assertEqual(payload['content'], '你好 <b>主播</b>')
        json.dumps(payload)

    def test_gift_streak_is_emitted_only_on_completion(self):
        gift = Gift(id=5655, name='Rose', type=1, diamond_count=1, image=ImageModel(url_list=['https://example.com/rose.png']))
        event = GiftEvent(user=ExtendedUser(id=123), gift=gift, repeat_count=5, repeat_end=0)
        self.assertIsNone(normalize_event('gift', event))
        event.repeat_end = 1
        payload = normalize_event('gift', event)
        self.assertEqual(payload['repeatCount'], 5)
        self.assertEqual(payload['gift']['diamondCount'], 1)
        self.assertEqual(payload['gift']['icon']['urlListList'], ['https://example.com/rose.png'])

    def test_non_streak_gift_and_like_delta(self):
        event = GiftEvent(user=ExtendedUser(id=1), gift=Gift(id=1, type=2), repeat_count=0)
        self.assertEqual(normalize_event('gift', event)['repeatCount'], 1)
        like = normalize_event('like', LikeEvent(user=ExtendedUser(id=1), count=3, total=100))
        self.assertEqual((like['like'], like['total']), (3, 100))

    def test_video_extracts_both_formats_and_deduplicates(self):
        room = {'stream_url': {'live_core_sdk_data': {'pull_data': {'stream_data': json.dumps({
            'data': {'hd': {'main': {'hls': 'https://cdn.test/live.m3u8', 'flv': 'https://cdn.test/live.flv'}}}
        })}}, 'hls_pull_url': 'https://cdn.test/live.m3u8'}}
        self.assertEqual([s['format'] for s in stream_sources(room)], ['hls', 'flv'])

    def test_video_malformed_core_uses_fallback(self):
        self.assertEqual(stream_sources({'stream_url': {'live_core_sdk_data': {'pull_data': {'stream_data': '{'}},
                                                       'hls_pull_url': 'https://cdn.test/live.m3u8'}})[0]['format'], 'hls')
        self.assertEqual(stream_sources({}), [])

    def test_video_does_not_offer_audio_only_as_video(self):
        sources = stream_sources({'stream_url': {'flv_pull_url': {
            'AO': 'https://cdn.test/audio.flv', 'HD': 'https://cdn.test/video.flv'}}})
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]['label'], 'HD · FLV')


if __name__ == '__main__':
    unittest.main()
