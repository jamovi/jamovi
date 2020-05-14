
import sys
import os.path
import re
import base64
from zipfile import ZipFile
from zipfile import ZipInfo
from io import TextIOWrapper
from time import localtime
from urllib.parse import unquote
import logging


log = logging.getLogger(__name__)


async def latexify(content, out, resolve_image):

    f_fn = 'article'
    r_fn = 'article'

    now = localtime()[0:6]

    with ZipFile(out, 'w') as z:

        start_i = re.search("<body>", content).end() + 1
        end_i   = re.search("</body>", content).start() - 1
        body = content[start_i:end_i]

        # remove references and table footer for now: if it contains useful information, it has to be handled
        # remove empty table lines or empty headings
        # remove style attributes (which make the HTML code pretty unreadable)
        body = re.sub(' style="text-align:.*?"'         , '',                 body)
        body = re.sub(' style="font-weight:.*?"'        , '',                 body)
        body = re.sub(' style="font-style:.*?"'         , '',                 body)
        body = re.sub(' style="width:.*?"'              , '',                 body)
        body = re.sub(' alt=".+?"'                      , '',                 body)

        # remove empty table lines
        body = re.sub('<tr><\/tr>[\s]*?'                , '',                 body)
        body = re.sub('<h[1-5]><\/h[1-5]>[\s]*?'        , '',                 body)
        body = re.sub('<span>\[[1-9]\]<\/span>[\s]*?'   , '',                 body)
        body = re.sub('<a href="" target="_blank"><\/a>', '',                 body)
        body = re.sub('<\/h[1-5]>[\s]*?<h[1-5]>'        , ': ',               body)
        body = re.sub('[\s]*?<p>&nbsp;<\/p>'            , '\n',               body)
        body = re.sub('><\/img>'                        , '>',                body)
        # remove or change characters that either have special functions in LaTeX or are not-printable
        body = re.sub('_'                               , '\\_',              body)
        body = re.sub('%'                               , '\\%',              body)
        # replace subscripts (e.g., tukey for post-hoc p-values)
        body = re.sub('<sub>(\S+)<\/sub>'               , r'$_{\1}$',         body)
        body = re.sub('&nbsp;'                          , '',                 body)
        body = re.sub('\xA0'                            , ' ',                body)
        body = re.sub('\xB1'                            , '$\\\\pm$',         body)
        body = re.sub('\xB2'                            , '$^2$',             body)
        body = re.sub('\u0394'                          , '$\\\\Delta$',      body)
        body = re.sub('\u03B1'                          , '$\\\\alpha$',      body)
        body = re.sub('\u03B5'                          , '$\\\\epsilon$',    body)
        body = re.sub('\u03B7'                          , '$\\\\eta$',        body)
        body = re.sub('\u03BC'                          , '$\\\\mu$',         body)
        body = re.sub('\u03C7'                          , '$\\\\chi$',        body)
        body = re.sub('\u03C9'                          , '$\\\\omega$',      body)
        body = re.sub('\u1D43'                          , 'a',                body)
        body = re.sub('\u2009'                          , '',                 body)
        body = re.sub(' \u2013 '                        , '~\\\\textemdash~', body)
        body = re.sub('\u2013'                          , '-',                body)
        body = re.sub('\u2014'                          , '\\\\textemdash',   body)
        body = re.sub('\u207A'                          , '+',                body)
        body = re.sub('\u207B'                          , '-',                body)
        body = re.sub('\u2081\u2080'                    , '$_{10}$',          body)
        body = re.sub('\u2090'                          , '$_{a}$',           body)
        body = re.sub('\u2260'                          , '$\\\\neq$',        body)
        body = re.sub('\u2212'                          , '-',                body)
        body = re.sub('\u273B'                          , '~$\\\\times$~',    body)
        # remove double line feeds or double "begin/end-LaTeX"-markers
        body = re.sub('\n\n'                            , '\n',               body)
        body = re.sub('  '                              , ' ',                body)
        body = re.sub('\$\$'                            , '',                 body)
        # reformat partial eta squared
        body = re.sub('\\\\eta\^2\$p'                   , '\\\\eta^2_{p}$',   body)

        # handle tables: create LaTeX code
        tdta = [];
        if re.search('<table>', body):
            tdta = re.findall('<table>[\s\S]*?<\/table>', body)
            for i in range(len(tdta)):
                # assign tdta[i] to a variable for processing, remove LF (to not disturb the automatic below)
                tcrr = tdta[i].replace('\n', '').strip()
                # determine the number of columns in the table by analyzing the colspan from the first header line
                tcol = int(int(re.findall('<thead>[\s]*?<tr>[\s]*?<th colspan="(.+?)">', tcrr)[0]) / 2)
                tmxl = [0] * tcol
                talg = ['l'] + ['r'] * (tcol - 1)
                # (a) separate table into header, body and footer; (b) cut table body into lines (insert \n)
                # and (c) remove remove <tr> and </tr> markers from the very begin and end of the table body
                thdr = re.sub('^[\s]*?<tr>', '', re.sub('<\/tr>$', '', re.sub('<\/tr>[\s]*?<tr>', '\n', re.findall('<thead>([\s\S]*)?<\/thead>', tcrr)[0]))).split('\n')
                tbdy = re.sub('^[\s]*?<tr>', '', re.sub('<\/tr>$', '', re.sub('<\/tr>[\s]*?<tr>', '\n', re.findall('<tbody>([\s\S]*)?<\/tbody>', tcrr)[0]))).split('\n')
                tftr = re.sub('^[\s]*?<tr>', '', re.sub('<\/tr>$', '', re.sub('<\/tr>[\s]*?<tr>', '\n', re.findall('<tfoot>([\s\S]*)?<\/tfoot>', tcrr)[0]))).split('\n')
                # ===================================================================================================================
                # process table header
                # ===================================================================================================================
                # throw error if number of header lines is smaller than 2 or larger than 3
                if len(thdr) < 2 | len(thdr) > 3:
                    raise ValueError('Can\'t process less than one or more than two header lines within a table: ' + '\n'.join(thdr))
                # table has no spanners: the first line is used as caption, the second line contains the column headers
                elif len(thdr) == 2:
                    thnm = thdr[1]
                    thsp = ''
                    tcln = ''
                # table has spanners: the first line is used as caption, the second line contains the spanner, the third the column headers
                elif len(thdr) == 3:
                    thnm = thdr[2]
                    thsp = re.findall('<th colspan[\s\S]*?<\/th>', thdr[1])
                    tcln = ''
                    tcmi = 0
                    for j in range(len(thsp)):
                        tmpl = int(int(re.findall('<th colspan="(\d+?)"', thsp[j])[0]) / 2)
                        tmpc = re.findall('<th colspan[\S\s]*?>(.+?)<\/th>', thsp[j])
                        thsp[j] = ('\\multicolumn{' + str(tmpl) + '}{c}{' + ('~' if len(tmpc) == 0 else tmpc[0]) + '}')
                        tcln = tcln + ('' if len(tmpc) == 0 else ('\\cline{' + str(tcmi + 1) + '-' + str(tcmi + tmpl) + '}\n'))
                        tcmi = tcmi + tmpl
                    thsp = (' & '.join(thsp) + ' \\\\\n')
                # process the column headers: replace colspan="2" with single cells and split cells using <th> and </th>
                thcl = re.findall('<th>([\s\S]*?)<\/th>', re.sub('<th colspan="2">', '<th></th><th>', thnm))
                if int(len(thcl) / 2) != tcol:
                    raise ValueError('Mismatch between number of columns in the table definition (' + str(tcol) + ') and the actual number of cells in the table header (' + str(len(thcl) / 2) + '): ' + thnm)
                for j in range(tcol):
                    thcl[j * 2 + 0] = None
                    thcl[j * 2 + 1] = ('~' if len(thcl[j * 2 + 1].strip()) == 0 else thcl[j * 2 + 1].strip())
                    # TO CHECK: sub- or superscripts that need to be converted into \tabfnm
                    tmxl[j] = max(tmxl[j], len(thcl[j * 2 + 1]))
                thnm = (' & '.join([j for j in thcl if j]))
                # ===================================================================================================================
                # process table body
                # ===================================================================================================================
                # first run: do required formatting (e.g., footnootes, etc.), determine maximum length of cell content and
                # whether the column should be left (contains only text) or right aligned (contains at least one number)
                for j in range(len(tbdy)):
                    # process the rows in the table body: replace colspan="2" with single cells and split cells using <td> and </td>
                    tbcl = re.findall('<td>([\s\S]*?)<\/td>', re.sub('<td colspan="2">', '<td></td><td>', tbdy[j]))
                    if int(len(tbcl) / 2) != tcol:
                        raise ValueError('Mismatch between number of columns in the table definition (' + str(tcol) + ') and the actual number of cells in the table row (' + str(len(tbcl) / 2) + '): ' + tbdy[j])
                    for k in range(tcol):
                        try:
                            float(tbcl[k * 2 + 0].replace('\\textemdash', '0').replace('&lt;', '0').replace('<', '0').replace('~', '').replace('\%', '').replace('NaN', '0').strip() + '0')
                        except:
                            talg[k] = 'l'
                        # replace &lt; and < with \\textless
                        tbcl[k * 2 + 0] =  tbcl[k * 2 + 0].replace('&lt;', ' \\textless~0').replace('<', ' \\textless~0').strip()
                        # combine current cell with the next (possibly containing footnote-markers)
                        tbcl[k * 2 + 0] = ('~' if len(tbcl[k * 2 + 0].strip()) == 0 else tbcl[k * 2 + 0])
                        tbcl[k * 2 + 0] = (tbcl[k * 2 + 0] + ('' if len(tbcl[k * 2 + 1].strip()) == 0 else ('\\tabfnm{' + tbcl[k * 2 + 1].replace('<sub>', '').replace('</sub>', '').replace('<sup>', '').replace('</sup>', '').strip() + '}')))
                        tbcl[k * 2 + 1] = None
                        # TO CHECK: sub- or superscripts that need to be converted into \tabfnm
                        tmxl[k] = max(tmxl[k], len(tbcl[k * 2 + 0]))
                    tbdy[j] = (' & '.join([k for k in tbcl if k]))
                # second run: format and align cell content (for header line with column names and the rows in the table body)
                tbdy = [thnm] + tbdy
                for j in range(len(tbdy)):
                    if (tbdy[j].find('\\hline') == -1 & tbdy[j].find('\\cline') == -1 & tbdy[j].find('\\multicolumn') == -1):
                        tbcl = tbdy[j].split('&')
                        for k in range(len(tbcl)):
                            # trim leading and trailing spaces
                            tbcl[k] = tbcl[k].strip()
                            # put ~ into the cell if empty
                            tbcl[k] = ('~' if len(tbcl[k]) == 0 else tbcl[k])
                            # add spaces after content (if the colum is left-aligned) or before (if the column is right-aligned)
                            if talg[k] == 'l':
                                tbcl[k] = (tbcl[k] + ' ' * (tmxl[k] - len(tbcl[k])))
                            else:
                                tbcl[k] = (' ' * (tmxl[k] - len(tbcl[k])) + tbcl[k])
                        tbdy[j] = ' & '.join(tbcl)
                #
                thdr[1] = (thsp + tcln + tbdy[0] + ' \\\\\n')
                tbdy = ' \\\\\n'.join(tbdy[1:len(tbdy)]) + ' \\\\'
                # ===================================================================================================================
                # process table footer
                # ===================================================================================================================
                for j in range(len(tftr)):
                    tfln = re.findall('<td colspan[\S\s]*?>(.+?)<\/td>', tftr[j])
                    if (len(tfln) > 0):
                        # general, specific, and significance notes
                        if (tfln[0].find('<span>Note.</span>') > -1):
                            tftr[j] = ('\\textit{Note.}~' + re.sub('p < ', '\\\\textit{p}~<~', re.sub('([\*]+) ', '\\\\tabfnt{\\1}~', tfln[0].replace('<span>Note.</span> ', ''))) + '. \\\\\n')
                        elif (len(re.findall('^[a-z]+?', tfln[0])) > 0):
                            tftr[j] = (re.sub('^([a-z]+) ', '\\\\tabfnt{\\1}~', tfln[0]) + '. \\\\\n')
                        elif (len(tfln[0].strip()) == 0):
                            tftr[j] = None
                        else:
                            raise ValueError('Table footer line can\'t be decoded: ' + tfln[0])
                    else:
                        tftr[j] = None
                # remove empty cells
                tftr = [k for k in tftr if k]
                # ===================================================================================================================
                # set table header, body and footer together again and replace the original table data with it
                # ===================================================================================================================
                trpl = ('\n\\begin{table}[!htbp]\n\\caption{' + re.findall('<span[\s\S]*?>(.+?)<\/span>', thdr[0])[0] + '}\n\\label{tab:Table_' + str(i + 1) + '}\n'
                        '\\begin{adjustbox}{max size={\\columnwidth}{\\textheight}}\n\\centering\n' +
                        '\\begin{tabular}{' + ''.join(talg) + '}\n' + '\\hline\n' + thdr[1] + '\\hline\n' + tbdy + '\n\\hline\n\\end{tabular}\n\\end{adjustbox}\n' +
                        '\\begin{tablenotes}[para,flushleft] {\n\\small\n' + ''.join(tftr) + '}\n\\end{tablenotes}\n\\end{table}')
                body = body.replace(tdta[i], trpl);

        # handle figures: convert from embedded base64 to files, and create LaTeX code
        idta = re.findall('<img src=".*?>', body)
        n_idta = len(idta)

        for i, url in enumerate(idta):
            i_fn = f'figure_{ i + 1 }.png'

            try:
                data_uri = re.findall('img src="data:\w+\/\w+;base64,(\S+)"', url)
                if data_uri:
                    zi = ZipInfo(i_fn, now)
                    with z.open(zi, 'w') as f:
                        f.write(base64.b64decode(data_uri.group(1)))
                else:
                    # extract data address, get place where the file is stored, and write it with
                    # the file name Figure + counter (using the original extension) into the ZIP file
                    i_adr = re.findall('<img src=".*?" data-address="(.+?)"', idta[i])[0]
                    i_adr = unquote(i_adr).replace('\\"', '"')
                    yield (i, n_idta)  # progress
                    i_tmp = await resolve_image(i_adr)
                    _, ext = os.path.splitext(i_tmp)
                    i_fn = f'figure_{ i + 1 }{ ext }'
                    z.write(i_tmp, i_fn)
                error_message = ''
                prefix = ''
            except Exception as e:
                log.exception(e)
                error_message = '% the figure file could not be exported, the LaTeX command below including that figure was therefore commented out\n%'
                prefix = '%'

            irpl = '''\
{prefix}\\begin{{figure}}[!htbp]
{prefix}\\caption{{PLACEHOLDER}}
{prefix}\\label{{fig:Figure_{fig_no}}}
% (the following arrangement follows APA7; if you want to use APA6, the caption- and label-lines have to be moved to after the includegraphics-line)
{error_message}\\centering
{prefix}\\includegraphics[maxsize={{\\columnwidth}}{{textheight}}]{{{i_fn}}}
{prefix}\\end{{figure}}\
'''.format(fig_no=i + 1, error_message=error_message, prefix=prefix, i_fn=i_fn)
            body = body.replace(idta[i], irpl);

        # handle references
        rdta = [];
        rtxt = 'The description of the statistical procedures that were used to analyse your data goes here.\n\n';
        if re.search('<h1>References', body) != None:
            rdta = re.findall('<h1>References[\s\S]*', body)[0]
            body = body.replace(rdta, '')
            # remove heading
            rdta = re.sub('<h1>References<\/h1>', '', rdta)
            rref = re.findall('<p>[\s\S]*?<\/p>', rdta)
            rbib = ''
            rkey = [None] * len(rref)
            for i in range(len(rref)):
                rcrr = re.findall('<span>(.+?)<\/span>', rref[i])[0]
                r_yr = re.findall('[\s\S]*\(([1-2][0-9][0-9][0-9])\)[\s\S]*', rcrr)[0]
                raut = re.findall('([\s\S]*)[1-2][0-9][0-9][0-9]', rcrr)[0].replace(' (', '').replace('&amp; ', '').replace('& ', '')
                if re.search(', ', raut) != None:
                    raus = re.split(', ', raut)
                    for j in range(len(raus)):
                        if j % 2 == 0:
                            raus[j] = (raus[j + 1].strip() + ' ' + raus[j].strip())
                            raus[j + 1] = None
                    raut = ' and '.join([k for k in raus if k])
                else:
                    raut = '{' + raut + '}'
                # URL-References
                if re.search('Retrieved from ', rcrr) != None:
                    rtit = re.findall('[\s\S]*[1-2][0-9][0-9][0-9](.+?). Retrieved', rcrr)[0].replace('). ', '').replace('<em>', '')
                    rtit = re.split('<\/em>. ', rtit)
                    rkey[i] = re.split('[:, ]', rtit[0])[0]
                    rurl = re.findall('Retrieved from <a[\s\S]*>(\S*)<\/a>', rcrr)[0]
                    rbib = (rbib + '@MISC{' + rkey[i] + ',\n  author       = {' + raut + '},\n  year         = {' + r_yr + '},\n  title        = {' + rtit[0] + '},\n  note         = {' +
                                              rtit[1].replace(') [', ', ').replace('] (', ', ').replace('[', '').replace(']', '').replace('(', '').replace(')', '') + '},\n  howpublished = {\\url{' + rurl + '}},\n}\n\n')
                # Articles and books: not yet finished
        #       else:
        #           rtit = rcrr.match(/[\s\S]*?[1-2][0-9][0-9][0-9](.+?). <em>/)[1].replace('). ', '')
        #           remp = rcrr.match(/<em>(.+?)<\/em>/)[1].split(/, /)
        #           rjnl = remp[0];
        #           if (remp[1].indexOf('(') == -1)
        #               rvol = remp[1]
        #               rnum = '';
        #           else:
        #               rvnn = remp[1].split(/(/);
        #               rvol = rvnn[0];
        #               rnum = rvnn[0].replace(')', '');
        #           rpag = rcrr.match(/[0-9]+-[0-9]+/)[0];
        #           rbib = (rbib + '@ARTICLE{' + ',\n  author       = {' + raut + '},\n  title        = {' + rtit + '},\n  journal      = {' + rjnl + '},\n  year         = {' + r_yr +
        #                                       '},\n  volume       = {' + rvol + '},\n  number       = {' + rnum + '},\n  pages        = {' + rpag + '},\n}\n\n')
            # end: for i in range(len(rref))
            # only write a bib-file and generate text for statstical analyses section if there are references in the original HTML
            if len(rref) > 0:
                zi = ZipInfo(f_fn.replace('.html', '.bib'), now)
                with z.open(zi, 'w') as f:
                    f.write(rbib.encode('utf-8'))
                    f.close()
                if ('jamovi' in rkey) & ('R' in rkey):
                    rkey.remove('jamovi')
                    rkey.remove('R')
                    rkey = [k for k in rkey if k]
                    rtxt = ('Statistical analyses were performed using jamovi \\parencite{jamovi}, and the R statistical language \\parencite{R}' +
                            ('.'  if len(rkey) < 1 else (', as well as the ' + ('module / package ' if len(rkey) == 1 else 'modules / packages ') +
                            ', '.join(rkey)[::-1].replace(', '[::-1], ' and '[::-1], 1)[::-1] + ' \\parencite{' + ', '.join(rkey) + '}.')) + '\n\n')

        # handle labels: currently, the figures captions are based upon the heading before whereas the captions for the tables are taken from the first line of the table header (that can be changed though)
        # NB: has to happen AFTER references are processed
        ldta = re.finditer('<h[1-5]>[\s\S]*?<\/h[1-5]>', body)
        lorg = []
        lrpl = []
        for i in ldta:
            # check whether the heading is followed by begin (indicating that a table or a figure follows)
            lbps = body[i.end():len(body)].strip().find('\\begin')
            if (lbps == -1):
                # nothing found, e.g. if the heading is "References"
                lorg.append(body[i.start():i.end()])
                lrpl.append('')
            elif (lbps < 20):
                lcpt = re.findall('<h[1-5]>([\s\S]*?)<\/h[1-5]>', body[i.start():i.end()])[0]
                lpos = re.finditer('\\\\caption{PLACEHOLDER}', body[i.end():len(body)])
                try:
                    lpos = next(lpos)
                    if (lpos.start() < 100):
                        lorg.append(body[i.start():i.end() + lpos.end()])
                        lrpl.append(body[i.end():i.end() + lpos.start()].strip() + '\n\\caption{' + lcpt + '}')
                    else:
                        lorg.append(body[i.start():i.end()])
                        lrpl.append('')
                except:
                    lorg.append(body[i.start():i.end()])
                    lrpl.append('')
            else:
                print('=============================================================================================')
                print('Error with caption - lbps = ' + str(lbps) + ':')
                print(body[i.end():len(body)].strip())
        if (len(lorg) == len(lrpl)):
            for i in range(len(lorg)):
                body = body.replace(lorg[i], lrpl[i])

        body = re.sub('\\\\end{table}[\s]*' , '\\\\end{table}\n\n\n',  body);
        body = re.sub('\\\\end{figure}[\s]*', '\\\\end{figure}\n\n\n', body);
        body = '\n\n' + body.strip() + '\n\n\n';

        head = ('\\documentclass[a4paper,man,hidelinks]{apa7}\n' +
                '% This LaTeX output is designed to use APA7 style and to run on local TexLive-installation (use pdflatex) as well as on web interfaces (e.g., overleaf.com).\n' +
                '% To use APA6 style change apa7 to apa6 in the first line (\\documentclass), comment or remove the \\addORCIDlink line, and change the order of \\caption and \\label lines for the figures.\n' +
                '% If you prefer having your figures within the body of the text instead of postponing them until after the reference list, please add ",floatsintext" after "hidelinks" in the documentclass options.\n' +
                '% Further information on these styles can be found here: https://www.ctan.org/pkg/apa7 and here: https://www.ctan.org/pkg/apa6\n\n' +
                '\\usepackage[british]{babel}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath}\n\\usepackage{graphicx}\n\\usepackage[export]{adjustbox}\n\\usepackage{csquotes}\n' +
                ('' if len(rdta) > 0 else '%') + '\\usepackage[style=apa,sortcites=true,sorting=nyt,backend=biber]{biblatex}\n' +
                ('' if len(rdta) > 0 else '%') + '\\DeclareLanguageMapping{british}{british-apa}\n' +
                ('' if len(rdta) > 0 else '%') + '\\addbibresource{' + r_fn.replace('.html', '.bib') + '}\n\n' +
                '\\title{Title of Your APA-Style Manuscript}\n\\shorttitle{Short Title}\n\\author{Full Name}\n\\leftheader{Last name}\n\\affiliation{Your Affilitation}\n' +
                '% addORCIDlink is only available from apa7\n\\authornote{\\addORCIDlink{Your Name}{0000-0000-0000-0000}\\\\\nMore detailed information about how to contact you.\\\\\nCan continue over several lines.\n}\n\n' +
                '\\abstract{Your abstract here.}\n\\keywords{keyword 1, keyword 2}\n\n' +
                '\\begin{document}\n\\maketitle\n\nYour introduction starts here.\n\n' +
                '\\section{Methods}\nFeel free to adjust the subsections below.\n\n' +
                '\\subsection{Participants}\nYour participants description goes here.\n\n\\subsection{Materials}\nYour description of the experimental materials goes here.\n\n' +
                '\\subsection{Procedure}\nYour description of the experimental procedures goes here.\n\n\\subsection{Statistical Analyses}\n' + rtxt + '\\section{Results}\n\n')
        tail = ('\nReport your results here and make references to tables' + (' (see Table~\\ref{tab:Table_1})' if len(tdta) > 0 else '') +
                ' or figures' + (' (see Figure~\\ref{fig:Figure_1})' if len(idta) > 0 else '') +
                '.\n\n\\section{Discussion}\nYour discussion starts here.\n\n' +
                ('' if len(rdta) > 0 else '%') + '\\printbibliography\n\n' +
                '%\\appendix\n\n%\\section{Additional tables and figures}\n\n%Your text introducing supplementary tables and figures.\n\n' +
                '%If required copy tables and figures from the main results here.\n\n\\end{document}\n\n')
        sprt = '% =========================================================================================================\n'

        zi = ZipInfo('article.tex', now)
        with z.open(zi, 'w') as f:
            with TextIOWrapper(f, encoding='utf-8') as ft:
                content = head + sprt + body + sprt + tail
                ft.write(content)
