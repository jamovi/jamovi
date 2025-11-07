import { IElement, IGroup, IImage, ITable, IRow, IHTML, IPreformatted, IText, ITextChunk } from './hydrate';

export interface ILatexifyOptions {
    addHeaderFooter?: boolean;
    showSyntax?: boolean;
    level?: number;
}

function generateTable(table: ITable): Array<string> {
    // replace non-printable characters, handle footnotes
    table = cleanTable(table);

    // define variables
    let output = [];
    let notes = [];
    let colLength = tableCellWidth(table);
    let colAlign = tableCellAlign(table);
    let rleBody = true;

    output.push('\\begin{table}[!htbp]');
    output.push(`\\caption{${ replace4LaTeX(table.title) }}`);
    output.push(`\\label{tbl:Table_${ replace4LaTeX(table.title).replaceAll(' ', '_').replace(/\$.*?\$/g, '').replace('__', '_') }}`);
    output.push('\\begin{adjustbox}{max size={\\columnwidth}{\\textheight}}');
    output.push('\\centering');
    output.push(`\\begin{tabular}{${ colAlign.join('') }}`);
    output.push('\\toprule');
    for (let row of table.rows) {
        if (row.type == 'superTitle') {
            output.push(...formatSuperTitle(row));
        }
        else if (['title', 'body'].includes(row.type)) {
            if (row.type == 'body' && rleBody) {
                output.push('\\midrule');
                rleBody = false;
            }
            output.push(formatTableRow(row, colLength, colAlign));
        }
        else if (row.type == 'footnote') {
            notes.push(formatNote(row));
        }
        else {
            output.push(`% == ${ row.type } ==`);
        }
    }
    output.push('\\bottomrule');
    output.push('\\end{tabular}');
    output.push('\\end{adjustbox}');
    if (notes.length > 0) {
        output.push('\\begin{tablenotes}[para,flushleft] {');
        output.push('\\footnotesize');
        output.push(...notes);
        output.push('}');
        output.push('\\end{tablenotes}');
    }
    output.push('\\end{table}\n');

    return output;
}

// generate figures
function generateFigure(figure: IImage): Array<string> {
    let output = [];

    let title = 'PLACEHOLDER ' + randomString(8);
    if (figure.title)
        title = replace4LaTeX(figure.title);
    output.push('\\begin{figure}[htbp]');
    output.push(`\\caption{${ title }}`);
    output.push(`\\label{fig:Figure_${ title.replace(' ', '_').replace(/\$.*?\$/g, '').replace('__', '_') }}`);
    output.push('\\centering');
    output.push(`\\includegraphics[width=\columnwidth]{${ figure.path }}`);
    // TO CONSIDER: use height / width for scaling
    output.push('% image goes here');
    output.push('\\end{figure}\n');

    return output;
}

// convert HTML to LaTeX
function generateHTML(html: IHTML, level: number): Array<string> {
    let output = [];
    let htmlContent = replace4LaTeX(html.content).replace(/<style>.*?<\/style>/, '').trim();

    if (htmlContent) {
        // format preformatted and lists
        htmlContent = htmlContent.replace(/<pre>/g, '\\begin{verbatim}\n').replace(/<\/pre>/g, '\\end{verbatim}\n\n');
        htmlContent = htmlContent.replace(/<ol>/g, '\\begin{enumerate}\n').replace(/<\/ol>/g, '\\end{enumerate}\n\n');
        htmlContent = htmlContent.replace(/<ul>/g, '\\begin{itemize}\n').replace(/<\/ul>/g, '\\end{itemize}\n\n');
        htmlContent = htmlContent.replace(/<li.*?>/g, '\\item ').replace(/<\/li>/g, '\n');

        // handle headings
        for (let hOrg of htmlContent.match(/(<h[1-5]>.*?<\/h[1-5]>)/g)) {
            let hRpl = generateHeading(hOrg.match(/<h[1-5]>(.*?)<\/h[1-5]>/)[1], level + 1).join('\n');
            htmlContent = htmlContent.replace(hOrg, hRpl);
        }

        // handle paragraphs
        for (let pOrg of htmlContent.match(/(<p.*?>.*?<\/p>)/g)) {
            pOrg = pOrg.trim();
            let pRpl = pOrg;
            let pWrp = [];
            // decode text alignment: left as default (NB: LaTeX uses justify as default)
            if (pOrg.includes('ql-align-right')) {
                pWrp = ['\\begin{flushright}\n\\noindent\n', '\\end{flushright}\n'];
                pRpl = pRpl.replace('ql-align-right', '');
            }
            else if (pOrg.includes('ql-align-center')) {
                pWrp = ['\\begin{center}\n\\noindent\n', '\\end{center}\n'];
                pRpl = pRpl.replace('ql-align-center',  '');
            }
            else if (pOrg.includes('ql-align-justify')) {
                pWrp = ['\\noindent\n', '\n'];
                pRpl = pRpl.replace('ql-align-justify', '');
            }
            else {
                pWrp = ['\\begin{flushleft}\n\\noindent\n', '\\end{flushleft}\n' ]
            }
            // decode text indentation
            if (pOrg.includes('ql-indent-')) {
                pWrp = [`\\setlength{\\leftskip}{${ pRpl.match(/ql-indent-([0-9]+)/)[1] }cm}\n`,
                        '\\setlength{\\leftskip}{0cm}\n'];
                pRpl = pRpl.replace(/ql-indent-[0-9]+[;"]/g, '"');
            }
            pRpl = pRpl.replace(' class=""', '').replace(/<br\/>/g, '\\\\\n')
            if (pRpl.startsWith('<p>') && pRpl.endsWith('</p>') && pRpl.match('<p>').length == 1 && pRpl.match('</p>').length == 1) {
                pRpl = pRpl.replace('<p>', pWrp[0]).replace('</p>', '\n' + pWrp[1] + '\n');
                htmlContent = htmlContent.replace(pOrg, pRpl);
            }
            else {
                htmlContent = htmlContent.replace(pOrg, '');
            }
        }

        // handle spans
        for (let sOrg of htmlContent.match(/(<span.*?>.*?<\/span>)/g)) {
            // replace(r'<p>', '').replace(r'</p>', '')
            sOrg = sOrg.trim();
            let sRpl = sOrg;
            let sWrp = ['', ''];
            // formulas
            if (sRpl.includes('<span class="ql-formula">')) {
                sRpl = '$' + sRpl.match(/<span class="ql-formula">(.*?)<\/span>/)[1] + '$';
                sRpl = sRpl.replace(/ class="ql-formula"/, '');
            }
            // colours: replace hex with X11-names
            if (sOrg.includes('color:#')) {
                if (sOrg.includes('background-color:')) {
                    sWrp = [sWrp[0] + '\\colorbox[rgb]{' + formatRGB(sRpl.match(/background-color:(\S*?)[;"]/)[1]) + '}{', sWrp[1] + '}'];
                    sRpl = sRpl.replace(/background-color:\S*?[;"]/, '"');
                }
                if (sOrg.includes('="color:')) {
                    sWrp = [sWrp[0] + '\\textcolor[]{' + formatRGB(sRpl.match(/color:(\S*?)[;"]/)[1]) + '}{', sWrp[1] + '}'];
                    sRpl = sRpl.replace(/="color:\S*?[;"]/, '=""');
                }
            }
            sRpl = (sWrp[0] + sRpl.replace(/<span.*?>([\S\s]*?)<\/span>/, '$1') + sWrp[1]);
            sRpl = sRpl.replace(/<br\/>/g, '\\\\\n');
            htmlContent = htmlContent.replace(sOrg, sRpl);
        }
        output = htmlContent.replace(/<\/p><p>/g, '\\\\\n').split('\n');
    }

    return output;
}

// convert Preformatted to LaTeX
function generatePreformatted(preformatted: IPreformatted, level: number, shwSyn: boolean): Array<string> {
    let output = [];

    // if preformatted is either not syntax or syntax is to be shown (shwSyn),
    // add a heading, \begin{verbatim}, the latex array, and \ end{verbatim}
    if (!preformatted.syntax || shwSyn) {
        output.push(generateHeading(preformatted.title, level + 1));
        output.push('\\begin{verbatim}');
        output.push(preformatted.content.split('\n'));
        output.push('\\end{verbatim}\n');
    }

    return output;
}

// convert Text (annotations) to LaTeX
function generateText(text: IText, level: number): Array<string> {
    let output = ['\\begin{flushleft}\n\\noindent\n'];
    let calgn = 'left';
    let clist = '';
    let cindt = 0;

    // remove those chunks that are empty and do not have an attribute
    const chunks = text.chunks.filter(c => c.content.length > 0 || 'attributes' in c);
    for (let chunk of chunks) {
        // deal with headers ()
        if (hasAttr(chunk, 'header')) {
            output.push(...generateHeading(chunk.content, level + 1));
        }
        // when the alignment is changed (an attribute that applies to a whole paragraph), and if the first
        // character is an '\n' it has to be pushed to the previous line before changing the alignment (\end{...})
        if (hasAttr(chunk, 'align') && chunk.content.charAt(0) === '\n') {
            chunk.content = chunk.content.slice(1);
            output.push('\n');
        }
        // format lists ([1] end previous list)
        if (clist !== (hasAttr(chunk, 'list') ? chunk.attributes.list : '')) {
            if (clist !== '')
                output.push('\\end{'   + (clist === 'ordered' ? 'enumerate' : 'itemize') + '}\n\n');
        }
        // format paragraphs ([1] end previous alignment), 
        if (calgn !== (hasAttr(chunk, 'align') ? chunk.attributes.align : 'left')) {
            output.push(calgn === 'justify' ? '\n\n' : ('\\end{' + (calgn === 'center' ? '' : 'flush') + calgn + '}\n\n'));
        }
        // format paragraphs ([2] begin new alignment - needs to come after list formatting is finished, list
        // formatting is embedded in formatting alignment); in addition, ensure that the content (formatting
        // applies to a paragraph) ends with '\n'
        if (calgn !== (hasAttr(chunk, 'align') ? chunk.attributes.align : 'left')) {
            chunk.content += chunk.content.slice(-1) === '\n' ? '' : '\n';
            calgn = (hasAttr(chunk, 'align') ? chunk.attributes.align : 'left');
            output.push(calgn !== 'justify' ? '\\begin{' + (calgn == 'center' ? '' : 'flush') + calgn + '}\n' : '');
            output.push('\\noindent\n');
        }
        // format lists ([2] begin new list)
        if (clist !== (hasAttr(chunk, 'list') ? chunk.attributes.list : '')) {
            clist = (hasAttr(chunk, 'list') ? chunk.attributes.list : '');
            if (clist !== '')
                output.push('\\begin{' + (clist === 'ordered' ? 'enumerate' : 'itemize') + '}\n');
        }
        // format indentation
        if (cindt !== (hasAttr(chunk, 'indent') ? parseInt(chunk.attributes.indent) : 0)) {
            cindt = (hasAttr(chunk, 'indent') ? parseInt(chunk.attributes.indent) : 0);
            output.push(`\\setlength\\leftskip{${ cindt }cm}\n`);
        }
        // format other attributes (if the chunk doesn't contain attributes, the content remains unchanged)
        output.push(formatAttr(chunk));
    }
    output.push('\n\\end{flushleft}\n');

    return output.join('').split('\n');
}

function generateHeading(title: string, level: number): Array<string> {
    let output = [];

    if (level >= 0 && title) {
        output.push('% ' + '-'.repeat(80));
        if (level == 0) {
            // NB: chapter is not available in apa7
            output.push(`\\chapter{${ title }}`);
        }
        else if (level == 1) {
            output.push(`\\section{${ title }}`);
        }
        else if (level == 2) {
            output.push(`\\subsection{${ title }}`);
        }
        else if (level == 3) {
            output.push(`\\subsubsection{${ title }}`);
        }
        else if (level == 4) {
            output.push(`\\paragraph{${ title }}`);
        }
        else {
            output.push(`\\subparagraph{${ title }}`);
        }
        output.push('% ' + '-'.repeat(80) + '\n');
    }

    return output;
}

// generate the document header
function generateDocBeg(): Array<string> {
    let output = [];

    output.push('\\documentclass[a4paper,man,hidelinks,floatsintext,x11names]{apa7}');
    output.push('% This LaTeX output is designed to use APA7 style and to run on local ' + 
                'TexLive-installation (use pdflatex) as well as on web interfaces (e.g., '+
                'overleaf.com).');
    output.push('% If you prefer postponing your figures and table until after the ' +
                'reference list, instead of having them within the body of the text, ' +
                'please remove the ",floatsintext" from the documentclass options. Further ' +
                'information on these styles can be at: https://www.ctan.org/pkg/apa7.\n');
    output.push('\\usepackage[british]{babel}');
    output.push('\\usepackage{xcolor}');
    output.push('\\usepackage[utf8]{inputenc}');
    output.push('\\usepackage{amsmath}');
    output.push('\\usepackage{graphicx}');
    output.push('\\usepackage[export]{adjustbox}');
    output.push('\\usepackage{csquotes}');
    output.push('\\usepackage{soul}');
    output.push('\\usepackage[style=apa,sortcites=true,sorting=nyt,backend=biber]{biblatex}');
    output.push('\\DeclareLanguageMapping{british}{british-apa}');
    output.push('\\addbibresource{article.bib}\n');
    output.push('\\title{APA-Style Manuscript with jamovi Results}');
    output.push('\\shorttitle{jamovi Results}');
    output.push('\\leftheader{Last name}');
    output.push('\\authorsnames{Full Name}');
    output.push('\\authorsaffiliations{{Your Affilitation}}');
    output.push('% from the CTAN apa7 documentation, 4.2.2');
    output.push('%\\authorsnames[1,{2,3},1]{Author 1, Author 2, Author 2}');
    output.push('%\\authorsaffiliations{{Affillition for [1]}, {Affillition for [2]}, {Affillition for [3]}}');
    output.push('\\authornote{\\addORCIDlink{Full Name}{0000-0000-0000-0000}\\\\');
    output.push('More detailed information about how to contact you.\\\\');
    output.push('Can continue over several lines.\\\\');
    output.push('}\n');
    output.push('\\abstract{Your abstract here.}');
    output.push('\\keywords{keyword 1, keyword 2}\n');
    output.push('\\begin{document}\n');
    output.push('% \\maketitle\n');
    output.push('% Your introduction starts here.\n');
    output.push('% \\section{Methods}');
    output.push('% Feel free to adjust the subsections below.\n');
    output.push('% \\subsection{Participants}');
    output.push('% Your participants description goes here.\n');
    output.push('% \\subsection{Materials}');
    output.push('% Your description of the experimental materials goes here.\n');
    output.push('% \\subsection{Procedure}');
    output.push('% Your description of the experimental procedures goes here.\n');
    output.push('% \\subsection{Statistical Analyses}');
    // TO-DO: add references, once implemented
    output.push('% Statistical analyses were performed using jamovi \\parencite{jamovi}, ' +
                'and the R statistical language \\parencite{R}, as well as the modules / ' +
                'packages car and emmeans \\parencite{car, emmeans}.\n');
    output.push('\\section{Results}');

    return output;
}

// generate the document footer
function generateDocEnd(): Array<string> {
    let output = [];

    output.push('% Report your results here and make reference to tables (see ' +
                'Table~\\ref{tbl:Table_...}) or figures (see Figure~\\ref{fig:Figure_...}).');
    output.push('%\\section{Discussion}');
    output.push('% Your discussion starts here.\n');
    output.push('*\\printbibliography\n');
    output.push('%\\appendix');
    output.push('%\\section{Additional tables and figures}');
    output.push('% Your text introducing supplementary tables and figures.');
    output.push('% If required copy tables and figures from the main results here.');
    output.push('\\end{document}');

    return output;
}

// generate random string
function randomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++)
    result += characters.charAt(Math.floor(Math.random() * characters.length))

  return result;
}

// check whether 
function hasAttr(chunk: ITextChunk, attr: string): boolean {
    return ('attributes' in chunk && attr in chunk.attributes);
}

// determine maximum (table) cell length
function tableCellWidth(table: ITable): Array<number> {
    let colLength = new Array(table.rows[0].cells.length).fill(0);

    for (let row of table.rows) {
        if (['title', 'body'].includes(row.type)) {
            for (let i = 0; i < row.cells.length; i++) {
                if (row.cells[i] && row.cells[i].content) {
                    colLength[i] = Math.max(row.cells[i].content.length, colLength[i]);
                }
            }
        }
    }

    return colLength;
}

// determine the column alignment
function tableCellAlign(table: ITable): Array<string> {
    let colAlign = new Array(table.rows[0].cells.length).fill('r');
    let colCheck = new Array(table.rows[0].cells.length).fill(false);

    for (let row of table.rows) {
        if (row.type == 'body') {
            for (let i = 0; i < row.cells.length; i++) {
                if (row.cells[i] && row.cells[i].align) {
                    colAlign[i] = row.cells[i].align
                    colCheck[i] = true
                }
            }
        }
        if (colCheck.every(Boolean)) {
            break
        }
    }

    return colAlign;
}

// replace non-printable characters in tables, handle footnotes, etc.
function cleanTable(table: ITable): ITable {

    for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        for (let j = 0; j < row.cells.length; j++) {
            const cell = row.cells[j];
            // handle footnotes (= specific notes)
            if (row.type != 'footnote' && cell && cell.sups) {
                cell.content = cell.content + `$^{${ replace4LaTeX(cell.sups.join(',')) }}$`
            }
            // replace non-printable characters
            if (cell && cell.content.length > 0) {
                cell.content = replace4LaTeX(cell.content);
            }
        }
    }

    return table;
}

// replace non-printable characters and HTML attributes in strings
function replace4LaTeX(content: string): string {
    const stringRepl = {'η²': '$\\eta^{2}$', 'η²p': '$\\eta^{2}_{p}$', 'ω²': '$\\omega^{2}$',
                        '<sup>μ</sup>': '$\\mu$', 'μ': '$\\mu$', '✻': '$\\times$', ' ': '~',
                        '%': '\\%', '\\\\%': '\\%', '⁻': '-', '⁺': '+',
                        // HTML attributes
                        '<sup>':    '$^{',          '</sup>':    '}$', // superscript
                        '<sub>':    '$_{',          '</sub>':    '}$', // subscript
                        '<strong>': '\\textbf{',    '</strong>': '}',  // bold
                        '<em>':     '\\textit{',    '</em>':     '}',  // italic
                        '<u>':      '\\underline{', '</u>':      '}',  // underline
                        '<s>':      '\\st{',        '</s>':      '}',  // strike-through
                       };

    for (const [target, replace] of Object.entries(stringRepl)) {
        content = content.replaceAll(target, replace);
    }

    return content.replace(/(?<=\$)(.*?)\$(?=(.*?)\$)/g, '$1');
}

// format color hex codes to be compatible with LaTeX
function formatRGB(content: string): string {
    if (content === content.match(/^#[0-f]{6}$/)[0]) {
        content = [(parseInt(content.slice(1, 3), 16) / 255).toFixed(2),
                   (parseInt(content.slice(3, 5), 16) / 255).toFixed(2),
                   (parseInt(content.slice(5, 7), 16) / 255).toFixed(2)].join(', ')
    }

    return content;
}

// format a superTitle row
function formatSuperTitle(row: IRow): Array<string> {
    let cells = [];
    let mrule = [];
    let empty = 0;

    for (let i = 0; i < row.cells.length; i++) {
        if (row.cells[i]) {
            if (row.cells[i].content) {
                if (empty > 0) {
                    cells.push(`\\multicolumn{${ empty }}{c}{~}`);
                    empty = 0;
                }
                if (row.cells[i].span) {
                    cells.push(`\\multicolumn{${ row.cells[i].span }}{c}{${ row.cells[i].content }}`);
                    mrule.push(`\\cmidrule{${ i + 1 }-${ i + row.cells[i].span }}`);
                    i += (row.cells[i].span - 1);
                }
                else {
                    cells.push(row.cells[i].content);
                }
            }
        }
        else {
            empty++
        }
    }

    return [cells.join(' & ') + ' \\\\', ...mrule];
}

// format “usual” table rows (title, body)
function formatTableRow(row: IRow, colLength: Array<number>, colAlign: Array<string>): string {
    let cells = [];
    let crrCll = '';
    let addSpc = 0;

    for (let i = 0; i < row.cells.length; i++) {
        if (row.cells[i] && row.cells[i].content.length > 0) {
            crrCll = row.cells[i].content;
        }
        else {
            crrCll = '~';
        }
        addSpc = colLength[i] - crrCll.length;
        if (colAlign[i] == 'l') {
            cells.push(crrCll + ' '.repeat(addSpc));
        }
        else if (colAlign[i] == 'r') {
            cells.push(' '.repeat(addSpc) + crrCll);
        }
        else if (colAlign[i] == 'r') {
            cells.push(' '.repeat(Math.ceil(addSpc / 2)) + crrCll +
                       ' '.repeat(Math.floor(addSpc / 2)));
        }
    }

    return cells.join(' & ') + ' \\\\';
}

// format a footnote row
function formatNote(row: IRow): Array<string> {
    let output = [];

    for (let i = 0; i < row.cells.length; i++) {
        if (row.cells[i].content.length > 0 && row.cells[i].sups.length > 0) {
            if (row.cells[i].sups[0] == 'note') {
                // General and significance notes
                output.push(`\\textit{Note.}~${ row.cells[i].content } \\\\`)

            }
            else {
                // Specific notes
                output.push(`$^{${ row.cells[i].sups.join(',') }}$~${ row.cells[i].content } \\\\`.replace(/(?<=\$)(.*?)\$(?=(.*?)\$)/g, '$1'));
            }
        }
    }

    return output;
}

function formatAttr(chunk: ITextChunk): string {
    let output = chunk.content;

    if (hasAttr(chunk, 'bold'))
        output = '\\textbf{' + output + '}';
    if (hasAttr(chunk, 'italic'))
        output = '\\textit{' + output + '}';
    if (hasAttr(chunk, 'underline'))
        output = '\\underline{' + output + '}';
    if (hasAttr(chunk, 'strike'))
        output = '\\st{' + output + '}';
    if (hasAttr(chunk, 'code-block'))
        output = '\\verbatim{' + output + '}\n';
    if (hasAttr(chunk, 'list'))
        output = '\\item{' + output.trim() + '}\n';
    if (hasAttr(chunk, 'link'))
        output = '\\href{' + chunk.attributes.link + '}{' + output + '}';
    if (hasAttr(chunk, 'formula'))
        output = '${' + formatFrml(output) + '}$';
    if (hasAttr(chunk, 'script') && chunk.attributes.script === 'super')
        output = '$^{' + + output + '}$';
    if (hasAttr(chunk, 'script') && chunk.attributes.script === 'sub')
        output = '$_{' + + output + '}$';
    if (hasAttr(chunk, 'color'))
        output = '\\textcolor[rgb]{' + formatRGB(chunk.attributes.color) + '}{' + output + '}';
    if (hasAttr(chunk, 'background'))
        output = '\\colorbox[rgb]{' + formatRGB(chunk.attributes.background) + '}{' + output + '}';

    return output.replace(/(?<=\$)(.*?)\$(?=(.*?)\$)/g, '$1')
}

function formatFrml(katex: string): string {
    let output = katex;

    return output;
}

function populateElements(item: IElement, level: number, shwSyn: boolean): Array<string> {
    let output = [];

    if (item.type === 'group') {
        if (item.title) {
            output.push(...generateHeading(item.title, level));
        }
        for (let child of item.items) {
            if (level > -1) {
                level++
            }
            output.push(...populateElements(child, level, shwSyn));
        }
    }
    else if (item.type === 'image') {
        output.push(...generateFigure(item));
    }
    else if (item.type === 'table') {
        output.push(...generateTable(item));
    }
    else if (item.type === 'html') {
        output.push(...generateHTML(item, level));
    }
    else if (item.type === 'preformatted') {
        output.push(...generatePreformatted(item, level, shwSyn));
    }
    else if (item.type === 'text') {
        output.push(...generateText(item, level));
    }


    return output;
}

export function latexify(hydrated: IElement, options?: ILatexifyOptions): string {
    // handle falling back to defaults, if the option parameter is not given
    options = options || {};
    options.addHeaderFooter = options.addHeaderFooter ?? false;
    options.showSyntax = options.showSyntax ?? false;
    options.level = options.level ?? -1;
    let output = [ ];

    output.push(...(options.addHeaderFooter ? generateDocBeg() : []));
    output.push(...populateElements(hydrated, options.level, options.shwSyn));
    output.push(...(options.addHeaderFooter ? generateDocEnd() : []));

    return output.join('\n');
}
