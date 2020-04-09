
import sys
import os.path
import re
import base64
from zipfile import ZipFile
from zipfile import ZipInfo
from io import TextIOWrapper
from time import localtime


def latexify(content, out):

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
        body = re.compile(' style="text-align:.*?"'         ).sub('',               body)
        body = re.compile(' style="font-weight:.*?"'        ).sub('',               body)
        body = re.compile(' style="font-style:.*?"'         ).sub('',               body)
        body = re.compile(' style="width:.*?"',             ).sub('',               body)
        body = re.compile(' alt=".+?"',                     ).sub('',               body)

        # remove empty table lines
        body = re.compile('<tr><\/tr>[\s]*?'                ).sub('',                 body)
        body = re.compile('<h[1-5]><\/h[1-5]>[\s]*?'        ).sub('',                 body)
        body = re.compile('<span>\[[1-9]\]<\/span>[\s]*?'   ).sub('',                 body)
        body = re.compile('<a href="" target="_blank"><\/a>').sub('',                 body)
        body = re.compile('<\/h[1-5]>[\s]*?<h[1-5]>'        ).sub(': ',               body)
        body = re.compile('[\s]*?<p>&nbsp;<\/p>'            ).sub('\n',               body)
        body = re.compile('><\/img>'                        ).sub('>',                body)
        # remove or change characters that either have special functions in LaTeX or are not-printable
        body = re.compile('_'                               ).sub('\\_',              body)
        body = re.compile('%'                               ).sub('\\%',              body)
        # replace subscripts (e.g., tukey for post-hoc p-values)
        body = re.compile('<sub>(\S+)<\/sub>'               ).sub(r'$_{\1}$',         body)
        body = re.compile('&nbsp;'                          ).sub('',                 body)
        body = re.compile('\xA0'                            ).sub(' ',                body)
        body = re.compile('\xB1'                            ).sub('$\\\\pm$',         body)
        body = re.compile('\xB2'                            ).sub('$^2$',             body)
        body = re.compile('\u0394'                          ).sub('$\\\\Delta$',      body)
        body = re.compile('\u03B1'                          ).sub('$\\\\alpha$',      body)
        body = re.compile('\u03B5'                          ).sub('$\\\\epsilon$',    body)
        body = re.compile('\u03B7'                          ).sub('$\\\\eta$',        body)
        body = re.compile('\u03BC'                          ).sub('$\\\\mu$',         body)
        body = re.compile('\u03C7'                          ).sub('$\\\\chi$',        body)
        body = re.compile('\u03C9'                          ).sub('$\\\\omega$',      body)
        body = re.compile('\u1D43'                          ).sub('a',                body)
        body = re.compile('\u2009'                          ).sub('',                 body)
        body = re.compile(' \u2013 '                        ).sub('~\\\\textemdash~', body)
        body = re.compile('\u2013'                          ).sub('-',                body)
        body = re.compile('\u2014'                          ).sub('\\\\textemdash',   body)
        body = re.compile('\u207A'                          ).sub('+',                body)
        body = re.compile('\u207B'                          ).sub('-',                body)
        body = re.compile('\u2081\u2080'                    ).sub('$_{10}$',          body)
        body = re.compile('\u2090'                          ).sub('$_{a}$',           body)
        body = re.compile('\u2260'                          ).sub('$\\\\neq$',        body)
        body = re.compile('\u2212'                          ).sub('-',                body)
        body = re.compile('\u273B'                          ).sub('~$\\\\times$~',    body)
        # remove double line feeds or double "begin/end-LaTeX"-markers
        body = re.compile('\n\n'                            ).sub('\n',               body)
        body = re.compile('  '                              ).sub(' ',                body)
        body = re.compile('\$\$'                            ).sub('',                 body)
        # reformat partial eta squared
        body = re.compile('\\\\eta\^2\$p'                   ).sub('\\\\eta^2_{p}$',   body)

        # handle tables: create LaTeX code
        tdta = [];
        if re.search('<table>', body) != None:
            tdta = re.compile('<table>[\s\S]*?<\/table>').findall(body)
            for i in range(len(tdta)):
                # assign tdta[i] to a variable for processing, remove LF (to not disturb the automatic below)
                tcrr = tdta[i].replace('\n', '').strip()
                # determine the number of columns in the table by analyzing the colspan from the first header line
                tcol = int(int(re.compile('<thead>[\s]*?<tr>[\s]*?<th colspan="(.+?)">').findall(tcrr)[0]) / 2)
                tmxl = [0] * tcol
                talg = ['l'] + ['r'] * (tcol - 1)
                # (a) separate table into header, body and footer; (b) cut table body into lines (insert \n)
                # and (c) remove remove <tr> and </tr> markers from the very begin and end of the table body
                thdr = re.compile('^[\s]*?<tr>').sub('', re.compile('<\/tr>$').sub('', re.compile('<\/tr>[\s]*?<tr>').sub('\n', re.compile('<thead>([\s\S]*)?<\/thead>').findall(tcrr)[0]))).split('\n')
                tbdy = re.compile('^[\s]*?<tr>').sub('', re.compile('<\/tr>$').sub('', re.compile('<\/tr>[\s]*?<tr>').sub('\n', re.compile('<tbody>([\s\S]*)?<\/tbody>').findall(tcrr)[0]))).split('\n')
                tftr = re.compile('^[\s]*?<tr>').sub('', re.compile('<\/tr>$').sub('', re.compile('<\/tr>[\s]*?<tr>').sub('\n', re.compile('<tfoot>([\s\S]*)?<\/tfoot>').findall(tcrr)[0]))).split('\n')
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
                    thsp = re.compile('<th colspan[\s\S]*?<\/th>').findall(thdr[1])
                    tcln = ''
                    tcmi = 0
                    for j in range(len(thsp)):
                        tmpl = int(int(re.compile('<th colspan="(\d+?)"').findall(thsp[j])[0]) / 2)
                        tmpc = re.compile('<th colspan[\S\s]*?>(.+?)<\/th>').findall(thsp[j])
                        thsp[j] = ('\\multicolumn{' + str(tmpl) + '}{c}{' + ('~' if len(tmpc) == 0 else tmpc[0]) + '}')
                        tcln = tcln + ('' if len(tmpc) == 0 else ('\\cline{' + str(tcmi + 1) + '-' + str(tcmi + tmpl) + '}\n'))
                        tcmi = tcmi + tmpl
                    thsp = (' & '.join(thsp) + ' \\\\\n')
                # process the column headers: replace colspan="2" with single cells and split cells using <th> and </th>
                thcl = re.compile('<th>([\s\S]*?)<\/th>').findall(re.compile('<th colspan="2">').sub('<th></th><th>', thnm))
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
                    tbcl = re.compile('<td>([\s\S]*?)<\/td>').findall(re.compile('<td colspan="2">').sub('<td></td><td>', tbdy[j]))
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
                    tfln = re.compile('<td colspan[\S\s]*?>(.+?)<\/td>').findall(tftr[j])
                    if (len(tfln) > 0):
                        # general, specific, and significance notes
                        if (tfln[0].find('<span>Note.</span>') > -1):
                            tftr[j] = ('\\textit{Note.}~' + re.compile('p < ').sub('\\\\textit{p}~<~', re.compile('([\*]+) ').sub('\\\\tabfnt{\\1}~', tfln[0].replace('<span>Note.</span> ', ''))) + '. \\\\\n')
                        elif (len(re.compile('^[a-z]+?').findall(tfln[0])) > 0):
                            tftr[j] = (re.compile('^([a-z]+) ').sub('\\\\tabfnt{\\1}~', tfln[0]) + '. \\\\\n')
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
                trpl = ('\n\\begin{table}[htbp]\n\\caption{' + re.compile('<span[\s\S]*?>(.+?)<\/span>').findall(thdr[0])[0] + '}\n\\label{tab:Table_' + str(i + 1) + '}\n'
                        '\\begin{adjustbox}{max size={\\columnwidth}{\\textheight}}\n\\centering\n' +
                        '\\begin{tabular}{' + ''.join(talg) + '}\n' + '\\hline\n' + thdr[1] + '\\hline\n' + tbdy + '\n\\hline\n\\end{tabular}\n\\end{adjustbox}\n' +
                        '\\begin{tablenotes}[para,flushleft] {\n\\small\n' + ''.join(tftr) + '}\n\\end{tablenotes}\n\\end{table}')
                body = body.replace(tdta[i], trpl);

        # handle figures: convert from embedded base64 to files, and create LaTeX code
        idta = []
        if re.search('<img src', body) != None:
            idta = re.compile('<img src=".*?>').findall(body)
            for i in range(len(idta)):
                iraw = re.compile('img src="data:\w+\/\w+;base64,(\S+)"').findall(idta[i])
                if len(iraw) == 1:
                    i_fn = r_fn.replace('.html', '_' + str(i + 1) + '.png')
                    zi = ZipInfo(f_fn.replace(r_fn, i_fn), now)
                    with z.open(zi, 'w') as f:
                        f.write(base64.b64decode(iraw[0]))
                        f.close()
                elif len(iraw) == 0:
                    i_fp = re.compile('img src="(.+?)" data-address=".*?"').findall(idta[i])[0]
                    i_fn = re.compile('img src=".*?" data-address="(.+?)"').findall(idta[i])[0].replace('==', '')
                    # check for file existence and throw error if not
                    #if os.path.isfile(f_fn.replace(r_fn, i_fn)) == False:
                    #    raise ValueError('Graphics file included in HTML doesn\'t exist: {}'.format(i_fn))
                else:
                    raise ValueError('Unexpected amount of figure data (' + str(len(iraw)) + ' instead of 1 [for base64-embedded pictures] or 0 [for picture links]):\n' + '\n'.join(iraw))

                i_fn = 'Figure_{}|{}'.format(i + 1, i_fn)
                irpl = ('\n\\begin{figure}[htbp]\n\\caption{PLACEHOLDER}\n\\label{fig:Figure_' + str(i + 1) + '}\n' +
                        '% (the following arrangement follows APA7; if you want to use APA6, the caption- and label-lines have to be moved to after the includegraphics-line)\n' +
                        '\\centering\n\\includegraphics[max size={\\columnwidth}{\\textheight}]{'  + i_fn + '}\n\\end{figure}')
                body = body.replace(idta[i], irpl);

        # handle references
        rdta = [];
        rtxt = 'The description of the statistical procedures that were used to analyse your data goes here.\n\n';
        if re.search('<h1>References', body) != None:
            rdta = re.compile('<h1>References[\s\S]*').findall(body)[0]
            body = body.replace(rdta, '')
            # remove heading
            rdta = re.compile('<h1>References<\/h1>').sub('', rdta)
            rref = re.compile('<p>[\s\S]*?<\/p>').findall(rdta)
            rbib = ''
            rkey = [None] * len(rref)
            for i in range(len(rref)):
                rcrr = re.compile('<span>(.+?)<\/span>').findall(rref[i])[0]
                r_yr = re.compile('[\s\S]*\(([1-2][0-9][0-9][0-9])\)[\s\S]*').findall(rcrr)[0]
                raut = re.compile('([\s\S]*)[1-2][0-9][0-9][0-9]').findall(rcrr)[0].replace(' (', '').replace('&amp; ', '').replace('& ', '')
                if re.search(', ', raut) != None:
                    raus = re.compile(', ').split(raut)
                    for j in range(len(raus)):
                        if j % 2 == 0:
                            raus[j] = (raus[j + 1].strip() + ' ' + raus[j].strip())
                            raus[j + 1] = None
                    raut = ' and '.join([k for k in raus if k])
                else:
                    raut = '{' + raut + '}'
                # URL-References
                if re.search('Retrieved from ', rcrr) != None:
                    rtit = re.compile('[\s\S]*[1-2][0-9][0-9][0-9](.+?). Retrieved').findall(rcrr)[0].replace('). ', '').replace('<em>', '')
                    rtit = re.compile('<\/em>. ').split(rtit)
                    rkey[i] = re.compile('[:, ]').split(rtit[0])[0]
                    rurl = re.compile('Retrieved from <a[\s\S]*>(\S*)<\/a>').findall(rcrr)[0]
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
                    f.write(rbib)
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
        ldta = re.compile('<h[1-5]>[\s\S]*?<\/h[1-5]>').finditer(body)
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
                lcpt = re.compile('<h[1-5]>([\s\S]*?)<\/h[1-5]>').findall(body[i.start():i.end()])[0]
                lpos = re.compile('\\\\caption{PLACEHOLDER}').finditer(body[i.end():len(body)])
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

        body = re.compile('\\\\end{table}[\s]*' ).sub('\\\\end{table}\n\n\n',  body);
        body = re.compile('\\\\end{figure}[\s]*').sub('\\\\end{figure}\n\n\n', body);
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
