
import os.path
import re
import logging
from zipfile import ZipFile, ZipInfo
from io import TextIOWrapper
from time import localtime
from urllib.parse import unquote

from .apa7_cls import apa7_cls

log = logging.getLogger(__name__)

def head(rtxt):
    return ('\\documentclass[a4paper,man,hidelinks,floatsintext,x11names]{apa7}\n'
            + '% This LaTeX output is designed to use APA7 style and to run on local TexLive-installation (use pdflatex) as well as on\n'
            + '% web interfaces (e.g., overleaf.com).\n'
            + '% If you prefer postponing your figures and table until after the reference list, instead of having them within the body\n'
            + '% of the text, please remove the ",floatsintext" from the documentclass options. Further information on these styles can\n'
            + '% be found here: https://www.ctan.org/pkg/apa7\n\n'
            + '\\usepackage[british]{babel}\n'
            + '\\usepackage[utf8]{inputenc}\n'
            + '\\usepackage{amsmath}\n'
            + '\\usepackage{xolor}\n'
            + '\\usepackage{graphicx}\n'
            + '\\usepackage[export]{adjustbox}\n'
            + '\\usepackage{csquotes}\n'
            + '\\usepackage{soul}\n'
            + ('' if len(rtxt) > 0 else '%') + '\\usepackage[style=apa,sortcites=true,sorting=nyt,backend=biber]{biblatex}\n'
            + ('' if len(rtxt) > 0 else '%') + '\\DeclareLanguageMapping{british}{british-apa}\n'
            + ('' if len(rtxt) > 0 else '%') + '\\addbibresource{article.bib}\n\n'
            + '\\title{APA-Style Manuscript with jamovi Results}\n'
            + '\\shorttitle{jamovi Results}\n'
            + '\\author{Full Name}\n'
            + '\\leftheader{Last name}\n'
            + '\\affiliation{Your Affilitation}\n'
            + '\\authorsaffiliations{{Your Affilitation}}\n'
            + '% from the CTAN apa7 documentation, 4.2.2\n'
            + '%\\authorsnames[1,{2,3},1]{Author 1, Author 2, Author 2}\n'
            + '%\\authorsaffiliations{{Affillition for [1]}, {Affillition for [2]}, {Affillition for [3]}}\n'
            + '\\authornote{\n'
            + '\\addORCIDlink{Your Name}{0000-0000-0000-0000} \\\\\n'
            + 'More detailed information about how to contact you. \\\\\n'
            + 'Can continue over several lines.\n'
            + '}\n\n'
            + '\\abstract{Your abstract here.}\n'
            + '\\keywords{keyword 1, keyword 2}\n\n'
            + '\\begin{document}\n'
            + '%\\maketitle\n\n'
            + '% Your introduction starts here.\n\n'
            + '%\\section{Methods}\n'
            + '% Feel free to adjust the subsections below.\n\n'
            + '%\\subsection{Participants}\n'
            + '% Your participants description goes here.\n\n'
            + '%\\subsection{Materials}\n'
            + '% Your description of the experimental materials goes here.\n\n'
            + '%\\subsection{Procedure}\n'
            + '% Your description of the experimental procedures goes here.\n\n'
            + '%\\subsection{Statistical Analyses}\n'
            + '%' + rtxt + '\n\n'
            + '\\section{Results}\n')

def tail():
    return ('\n% Report your results here and make references to tables (see Table~\\ref{tbl:Table_...}) or figures (see\n'
            + 'Figure~\\ref{fig:Figure_...}).\n\n'
            + '%\\section{Discussion}\n'
            + '% Your discussion starts here.\n\n'
            + '%\\printbibliography\n\n'
            + '%\\appendix\n\n'
            + '%\\section{Additional tables and figures}\n\n'
            + '% Your text introducing supplementary tables and figures.\n\n'
            + '% If required copy tables and figures from the main results here.\n\n'
            + '\\end{document}\n')


async def latexify(content, out, resolve_image):

    now = localtime()[0:6]

    # replace image placeholders and write images
    i_lst = re.findall('\\\\includegraphics\\[.*\\]{\\${.*}}', content)
    for i, i_org in enumerate(i_lst):
        try:
            yield (i / len(i_lst))  # progress
            i_adr = re.findall('\\\\includegraphics\\[.*\\]{\\${address:(.*)}}', i_org)[0]
            print(i_adr)
            print(unquote(i_adr).replace('\\"', '"'))
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
        yield (1)  # progress

    # TO-DO: add references, once implemented
    rbib = None
    rtxt = ('Statistical analyses were performed using jamovi \\parencite{jamovi}, and the R statistical language \\parencite{R}, '
          + 'as well as the modules / packages car and emmeans \\parencite{car, emmeans}.\n')
    
    # separator between header, body and footer
    sprt = '\n% ' + '=' * 78 + '\n\n'

    with ZipFile(out, 'w') as z:

        with z.open(ZipInfo('article.tex', now), 'w') as f:
            with TextIOWrapper(f, encoding='utf-8') as ft:
                ft.write(head(rtxt) + sprt + content + sprt + tail())

        with z.open(ZipInfo('apa7.cls', now), 'w') as f:
            with TextIOWrapper(f, encoding='utf-8') as ft:
                ft.write(apa7_cls)
        
        if rbib:
            with z.open(ZipInfo('article.bib', now), 'w') as f:
                with TextIOWrapper(f, encoding='utf-8') as ft:
                    ft.write(rbib)
