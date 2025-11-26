
import os.path
import re
import logging
from zipfile import ZipFile, ZipInfo
from io import TextIOWrapper
from time import localtime
from urllib.parse import unquote

log = logging.getLogger(__name__)

async def latexify(content_refs, out, resolve_image):

    now = localtime()[0:6]

    [content, refs] = map(str.strip, content_refs.split('[--BIBTEX_FROM_HERE--]'))

    with ZipFile(out, 'w') as z:
        # replace image placeholders and write images
        i_lst = re.findall('\\\\includegraphics\\[.*\\]{\\${.*}}', content)
        for i, i_org in enumerate(i_lst):
            try:
                yield (i / len(i_lst))  # progress
                i_adr = re.findall('\\\\includegraphics\\[.*\\]{\\${address:(.*)}}', i_org)[0]
                i_tmp = await resolve_image(unquote(i_adr).replace('\\"', '"'))
                _, ext = os.path.splitext(i_tmp)
                i_fn = f'figure_{i + 1}{ext}'
                z.write(i_tmp, i_fn)
                i_rpl = i_org.replace('${address:' + i_adr + '}', i_fn)
            except Exception as e:
                log.exception(e)
                i_rpl = ('% the figure file could not be exported, the LaTeX command below including that figure was therefore commented out\n'
                    + '%' + i_org)
            content = content.replace(i_org, i_rpl)

        with z.open(ZipInfo('article.tex', now), 'w') as f:
            with TextIOWrapper(f, encoding='utf-8') as ft:
                ft.write(content)
        
        if len(refs) > 0:
            with z.open(ZipInfo('article.bib', now), 'w') as f:
                with TextIOWrapper(f, encoding='utf-8') as ft:
                    ft.write(refs)
