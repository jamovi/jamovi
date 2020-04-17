
from .base import IntegrationHandler
from jamovi.server.utils import ssl_context

from urllib.parse import unquote
from aiohttp import ClientSession
from aiohttp import FormData
import re
import posixpath as path
from mimetypes import guess_type

import logging


log = logging.getLogger('jamovi')


class Handler(IntegrationHandler):

    def __init__(self):
        self.url = None
        self.image_url = None
        self.domain = None
        self.survey_id = None
        self.dataset_id = None
        self.user_id = None
        self.api_key = None
        self.filename = None
        self.title = None
        self.ok = False

    def get_title(self):
        return self.title

    def gen_message(self):
        return ('Datapad Updated', f"'{ self.title }' updated successfully")

    def is_for(self, path):
        return path == self.url

    async def read(self, response):
        self.survey_id = response.headers.get('surveyid')
        self.api_key = response.headers.get('apikey')
        self.dataset_id = response.headers.get('datasetid')
        self.user_id = response.headers.get('userid')

        if response.content_disposition and response.content_disposition.filename:
            self.filename = response.content_disposition.filename

        if self.survey_id and self.dataset_id and self.user_id and self.api_key:
            self.ok = True
            self.url = f'https://{ response.url.host }/a/api/v2/surveys/{ self.survey_id }/datapads/{ self.dataset_id }?apiKey={ self.api_key }'
            self.image_url = f'https://{ response.url.host }/a/api/v2/users/{ self.user_id }/images?apiKey={ self.api_key }'

            try:
                async with ClientSession(raise_for_status=True) as client:
                    async with client.get(self.url, ssl=ssl_context()) as request:
                        data = await request.json()
                        self.title = data['response']['title']
            except Exception:
                self.title = f'Datapad { self.dataset_id }'

    async def process(self, dataset):
        if self.ok:
            dataset.title = self.title
            dataset.save_format = 'abs-html'
            dataset.path = self.url

    async def save(self, dataset, content):

        content = content.decode(errors='replace')

        async with ClientSession(raise_for_status=True) as client:

            root_path = dataset.instance_path

            chunks = [ ]
            pos = 0
            matches = list(re.finditer(r'<img src="(.*?)"', content))
            n_matches = len(matches)

            for i in range(n_matches):
                m = matches[i]
                chunks.append(content[pos:m.start(1)])
                rel_path = unquote(m.group(1))
                abs_path = path.join(root_path, rel_path)
                content_type, encoding = guess_type(rel_path)

                yield (i, n_matches + 1)

                try:
                    with open(abs_path, 'rb') as image_file:

                        form_data = FormData()
                        form_data.add_field(
                            'file',
                            image_file,
                            content_type=content_type)

                        async with client.post(
                                self.image_url,
                                data=form_data,
                                ssl=ssl_context()) as response:
                            data = await response.json()
                            new_url = data['response']['imageURL']
                            # new_url = urlsplit(new_url).path
                            chunks.append(new_url)
                            pos = m.end(1)

                except Exception as e:
                    log.exception(e)

            if pos > 0:
                chunks.append(content[pos:])
                content = ''.join(chunks)

            payload = { 'analysisHtmlText': content }

            yield (n_matches, n_matches + 1)

            async with client.put(self.url, json=payload, ssl=ssl_context()):
                pass
