from pathlib import Path
import sys
import unittest

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from media import MediaGateway


class MediaTests(unittest.TestCase):
    def setUp(self):
        self.gateway = MediaGateway()
        self.gateway.client.close()
        self.requests = []

        def respond(request):
            self.requests.append(request)
            if request.url.path.endswith('.m3u8'):
                return httpx.Response(200, headers={'content-type': 'application/vnd.apple.mpegurl'},
                                      text='#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n../segments/one.ts?token=abc\n')
            return httpx.Response(206, headers={'content-range': 'bytes 0-2/3', 'accept-ranges': 'bytes'}, content=b'abc')

        self.gateway.client = httpx.Client(transport=httpx.MockTransport(respond))
        self.local = httpx.Client(trust_env=False)

    def tearDown(self):
        self.local.close()
        self.gateway.close()

    def test_hls_keys_maps_and_segments_use_token_gateway(self):
        url = self.gateway.register('https://cdn.test/live/index.m3u8')
        response = self.local.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], '*')
        self.assertNotIn('cdn.test', response.text)
        self.assertEqual(response.text.count(f'/{self.gateway.token}/'), 3)
        segment = response.text.splitlines()[-1]
        data = self.local.get(segment, headers={'Range': 'bytes=0-2'})
        self.assertEqual(data.content, b'abc')
        self.assertEqual(data.status_code, 206)
        self.assertEqual(data.headers['content-range'], 'bytes 0-2/3')
        self.assertEqual(self.requests[-1].headers['range'], 'bytes=0-2')
        self.assertEqual(str(self.requests[-1].url), 'https://cdn.test/segments/one.ts?token=abc')
        self.assertEqual(self.requests[-1].headers['referer'], 'https://www.tiktok.com/')

    def test_gateway_rejects_unknown_tokens_and_arbitrary_destinations(self):
        url = self.gateway.register('https://cdn.test/live.flv')
        self.assertEqual(self.local.get(url.replace(self.gateway.token, 'wrong')).status_code, 404)
        with self.assertRaises(ValueError):
            self.gateway.register('file:///C:/Windows/win.ini')


if __name__ == '__main__':
    unittest.main()
