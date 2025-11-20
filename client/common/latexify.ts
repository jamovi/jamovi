import { IElement } from './hydrate';
import { IImage } from './hydrate';
import { ITable } from './hydrate';
import { IRow } from './hydrate';
import { IPreformatted } from './hydrate';
import { INotice } from './hydrate';
import { IText } from './hydrate';
import { ITextChunk } from './hydrate';
import { IReference } from '../main/references';

export interface ILatexifyOptions {
    showSyntax?: boolean;
    level?: number;
}

export function latexify(hydrated: IElement, options?: ILatexifyOptions): string {
    // handle falling back to defaults, if the option parameter is not given
    options = options || {};
    options.showSyntax = options.showSyntax ?? false;
    options.level = options.level ?? -1;

    if (hydrated === null)
        return null;
    return populateElements(hydrated, options.level, options.showSyntax).join('\n');
}

export function createDoc(contents: Array<string>, refNames?: Array<string>): string {
    refNames = refNames || [];
    // used to comment out BibTeX-related lines when no references are present
    let refPrefix = (refNames.length === 0 ? '%' : '');
    let header = [];
    let footer = [];

    // generate LaTeX document header
    header.push('\\documentclass[a4paper,man,hidelinks,floatsintext,x11names]{apa7}');
    header.push('% This LaTeX output is designed to use APA7 style and to run on local ' +
                'TexLive-installation (use pdflatex) as well as on web interfaces (e.g., '+
                'overleaf.com).');
    header.push('% If you prefer postponing your figures and table until after the ' +
                'reference list, instead of having them within the body of the text, ' +
                'please remove the ",floatsintext" from the documentclass options. Further ' +
                'information on these styles can be at: https://www.ctan.org/pkg/apa7.\n');
    header.push('\\usepackage[british]{babel}');
    header.push('\\usepackage{xcolor}');
    header.push('\\usepackage[utf8]{inputenc}');
    header.push('\\usepackage{amsmath}');
    header.push('\\usepackage{graphicx}');
    header.push('\\usepackage[export]{adjustbox}');
    header.push('\\usepackage{awesomebox}');
    header.push('\\usepackage{csquotes}');
    header.push('\\usepackage{soul}');
    header.push(refPrefix + '\\usepackage[style=apa,sortcites=true,sorting=nyt,backend=biber]{biblatex}');
    header.push(refPrefix + '\\DeclareLanguageMapping{british}{british-apa}');
    header.push(refPrefix + '\\addbibresource{article.bib}\n');
    header.push('\\title{APA-Style Manuscript with jamovi Results}');
    header.push('\\shorttitle{jamovi Results}');
    header.push('\\leftheader{Last name}');
    header.push('\\authorsnames{Full Name}');
    header.push('\\authorsaffiliations{{Your Affilitation}}');
    header.push('% example below from the CTAN apa7 documentation, 4.2.2:');
    header.push('% authors 1 and 3 share affiliation 1, author 2 has affiliations 2 and 3');
    header.push('%\\authorsnames[1,{2,3},1]{Author 1, Author 2, Author 2}');
    header.push('%\\authorsaffiliations{{Affiliation 1}, {Affiliation 2}, {Affiliation 3}}');
    header.push('\\authornote{\\addORCIDlink{Full Name}{0000-0000-0000-0000}\\\\');
    header.push('More detailed information about how to contact you.\\\\');
    header.push('Can continue over several lines.\\\\');
    header.push('}\n');
    header.push('\\abstract{Your abstract here.}');
    header.push('\\keywords{keyword 1, keyword 2}\n');
    header.push('\\begin{document}\n');
    header.push('%\\maketitle\n');
    header.push('% Your introduction starts here.\n');
    header.push('%\\section{Methods}');
    header.push('% Feel free to adjust the subsections below.\n');
    header.push('%\\subsection{Participants}');
    header.push('% Your participants description goes here.\n');
    header.push('%\\subsection{Materials}');
    header.push('% Your description of the experimental materials goes here.\n');
    header.push('%\\subsection{Procedure}');
    header.push('% Your description of the experimental procedures goes here.\n');
    header.push('%\\subsection{Statistical Analyses}');
    header.push(describeRefs(refNames) + '\n');
    header.push('\\section{Results}\n');

    // generate LaTeX document footer
    footer.push('% Report your results here and make reference to tables (see ' +
                'Table~\\ref{tbl:Table_...}) or figures (see Figure~\\ref{fig:Figure_...}).\n');
    footer.push('%\\section{Discussion}');
    footer.push('% Your discussion starts here.\n');
    footer.push(refPrefix + '\\printbibliography\n');
    footer.push('%\\appendix');
    footer.push('%\\section{Additional tables and figures}');
    footer.push('% Your text introducing supplementary tables and figures.');
    footer.push('% If required copy tables and figures from the main results here.\n');
    footer.push('\\end{document}\n');

    return [header.join('\n'), ...contents, footer.join('\n')].join('\n' + '% ' + '='.repeat(78) + '\n\n');
}

export function createBibTex(references?: Array<IReference>): string {
    const bibTex = [];
    let ref2Tex = [];

    if (!references || references.length === 0)
        return null;

    for (const currRef of references) {
        ref2Tex.push('@' + currRef['type'].replace('software', 'misc') + '{' + currRef['name']);
        // handle authors
        const splAuthor = currRef['authors']['complete'].split(/,|&/).map(s => s.trim()).filter(s => s !== '');
        if (splAuthor.length === 1) {
            ref2Tex.push('  author = \"' + splAuthor[0] + '\"');
        }
        else if (splAuthor.length % 2 == 0) {
            let currAuth = [];
            for (let i = 0; i < splAuthor.length; i += 2)
                currAuth.push(splAuthor[i] + ', ' + splAuthor[i + 1]);
            ref2Tex.push('  author = \"' + currAuth.join(' and ') + '\"');
        }
        else {
            ref2Tex.push('  author = \"[NEEDS MANUAL FORMATTING] ' + splAuthor.join(', ') + '\"');
        }
        for (const currKey of Object.keys(currRef).filter(k => !['name', 'type', 'authors'].includes(k))) {
            if (String(currRef[currKey]) !== '')
                ref2Tex.push(('  ' + (currRef.type === 'article' && currKey === 'publisher' ? 'journal' : currKey) +
                              ' = \"' + String(currRef[currKey]) + '\"'));
        }
        bibTex.push(ref2Tex.join(',\n') + '\n}');
        ref2Tex = [];
    }

    return bibTex.join('\n\n');
}

// main loop: iterates through the input elements and calls itself when a group element
// has children
function populateElements(item: IElement, level: number, shwSyn: boolean): Array<string> {
    let output = [];

    if (item.type === 'group') {
        if (item.title) {
            output.push(...generateHeading(item.title, level));
        }
        for (let child of item.items) {
            output.push(...populateElements(child, level > -1 ? level + 1 : level, shwSyn));
        }
    }
    else if (item.type === 'text') {
        output.push(...generateText(item, level));
    }
    else if (item.type === 'image') {
        output.push(...generateFigure(item));
    }
    else if (item.type === 'table') {
        output.push(...generateTable(item));
    }
    else if (item.type === 'preformatted') {
        output.push(...generatePreformatted(item, level, shwSyn));
    }
    else if (item.type === 'notice') {
        output.push(...generateNotice(item));
    }

    return output;
}

// generate headings at different levels
function generateHeading(title: string, level: number): Array<string> {
    let output = [];
    const ruler = '% ' + '-'.repeat(80);

    if (level >= 0 && title) {
        output.push(ruler);
        if (level == 0) {
            // NB: chapter is not available in apa7
            output.push('\\chapter{' + title + '}');
        }
        else if (level == 1) {
            output.push('\\section{' + title + '}');
        }
        else if (level == 2) {
            output.push('\\subsection{' + title + '}');
        }
        else if (level == 3) {
            output.push('\\subsubsection{' + title + '}');
        }
        else if (level == 4) {
            output.push('\\paragraph{' + title + '}');
        }
        else {
            output.push('\\subparagraph{' + title  + '}');
        }
        output.push(ruler);
    }

    return output;
}

// generate figures
function generateFigure(figure: IImage): Array<string> {
    let output = [];

    const figTitle = figure.title ? replace4LaTeX(figure.title) : 'PLACEHOLDER ' + randomString(8);
    output.push('\\begin{figure}[htbp]');
    output.push('\\caption{' + figTitle + (figure.refs ? (', created using the ' + concatRefs(figure.refs)) : '') + '}');
    output.push('\\label{fig:Figure_' + figTitle.replace(' ', '_').replace(/\$.*?\$/g, '').replace('__', '_') + '}');
    output.push('\\centering');
    output.push('\\includegraphics[width=\\columnwidth]{${address:' + figure.address + '}}');
    // TO CONSIDER: use height / width for scaling
    output.push('\\end{figure}\n');

    return output;
}

// generate tables
function generateTable(table: ITable): Array<string> {
    // replace non-printable characters, handle footnotes
    table = cleanTable(table);

    // define variables
    let output = [];
    let notes = [];
    const colLength = tableCellWidth(table);
    const colAlign = tableCellAlign(table);
    const tblTitle = replace4LaTeX(table.title);
    let rleBody = true;

    output.push('\\begin{table}[!htbp]');
    output.push(('\\caption{' + tblTitle + (table.refs ? (', created using the ' + concatRefs(table.refs)) : '') + '}'));
    output.push('\\label{tbl:Table_' + tblTitle.replaceAll(' ', '_').replace(/\$.*?\$/g, '').replace('__', '_') + '}');
    output.push('\\begin{adjustbox}{max size={\\columnwidth}{\\textheight}}');
    output.push('\\centering');
    output.push('\\begin{tabular}{' + colAlign.join('') + '}');
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
            output.push('% == ' + row.type + ' ==');
        }
    }
    output.push('\\bottomrule');
    output.push('\\end{tabular}');
    output.push('\\end{adjustbox}');
    if (notes.length > 0) {
        output.push('\\begin{tablenotes}[para,flushleft]');
        output.push('\\footnotesize');
        output.push(...notes);
        output.push('\\end{tablenotes}');
    }
    output.push('\\end{table}\n');

    return output;
}

// generate preformatted text
function generatePreformatted(preformatted: IPreformatted, level: number, shwSyn: boolean): Array<string> {
    let output = [];

    // if preformatted is either not syntax or syntax is to be shown (shwSyn),
    // add a heading, \begin{verbatim}, the latex array, and \ end{verbatim}
    if (!preformatted.syntax || shwSyn) {
        output.push(generateHeading(preformatted.title, level + 1));
        if (preformatted.refs)
            output.push('Created using the ' + concatRefs(preformatted.refs));
        output.push('\\begin{verbatim}');
        output.push(preformatted.content.split('\n'));
        output.push('\\end{verbatim}\n');
    }

    return output;
}

// generate notices
function generateNotice(notice: INotice): Array<string> {
    let output = [];
    // cf. https://github.com/jamovi/jamovi/tree/main/client/resultsview/notice.ts#L64-L79
    // msgType - 1: 'warning-1', 2: 'warning-2', 3: 'info', 4: 'error'

    return output;
}

// generate formatted text (annotations)
function generateText(text: IText, level: number): Array<string> {
    let output = ['\\begin{flushleft}\n\\noindent\n'];
    let calgn = 'left';
    let clist = '';
    let citem = '';
    let cindt = 0;

//  if (text.refs)
//      output.push('Created using the ' + concatRefs(preformatted.refs));
    for (let chunk of text.chunks) {
        // deal with headers ()
        if (hasAttr(chunk, 'header')) {
            output.push(...generateHeading(chunk.content, level + 1));
        }
        // format lists: [1] end previous list
        if (clist !== (hasAttr(chunk, 'list') ? chunk.attributes.list : '')) {
            if (clist !== '')
                output.push('\\end{'   + (clist === 'ordered' ? 'enumerate' : 'itemize') + '}\n');
        }
        // format paragraphs: [1] end previous alignment
        if (calgn !== (hasAttr(chunk, 'align') ? chunk.attributes.align : 'left')) {
            output.push(calgn === 'justify' ? '\n\n' : ('\\end{' + (calgn === 'center' ? '' : 'flush') + calgn + '}\n\n'));
        }
        // format paragraphs: [2] begin new alignment
        // needs to come after list formatting is finished, as list formatting is embedded
        // in formatting alignment)
        if (calgn !== (hasAttr(chunk, 'align') ? chunk.attributes.align : 'left')) {
            calgn = (hasAttr(chunk, 'align') ? chunk.attributes.align : 'left');
            output.push(calgn === 'justify' ? '' : '\\begin{' + (calgn == 'center' ? '' : 'flush') + calgn + '}\n');
            output.push('\\noindent\n');
        }
        // format lists: [2] begin new list
        if (clist !== (hasAttr(chunk, 'list') ? chunk.attributes.list : '')) {
            clist = (hasAttr(chunk, 'list') ? chunk.attributes.list : '');
            if (clist !== '')
                output.push('\\begin{' + (clist === 'ordered' ? 'enumerate' : 'itemize') + '}');
                citem = '\\item{';
        }
        // format indentation
        if (cindt !== (hasAttr(chunk, 'indent') ? parseInt(chunk.attributes.indent) : 0)) {
            cindt = (hasAttr(chunk, 'indent') ? parseInt(chunk.attributes.indent) : 0);
            output.push('\\setlength\\leftskip{' + cindt + 'cm}\n');
        }
        if (hasAttr(chunk, 'list')) {
            // list items may consist of several chunks which need to be concatenated
            // until a CR is encountered at which point it is pushed and a new item is
            // started
            if (chunk.content.endsWith('\n')) {
                output.push(citem + formatAttr(chunk).trim() + '}')
                citem = '\\item{';
            }
            else {
                citem += formatAttr(chunk);
            }
        } else {
            // format other attributes (if the chunk doesn't contain attributes,
            // then the content remains unchanged)
            output.push(formatAttr(chunk));
        }
    }
    output.push('\n\\end{flushleft}\n');

    return output.join('').split('\n');
}

// generate random string
function randomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++)
    result += characters.charAt(Math.floor(Math.random() * characters.length));

  return result;
}

// check whether text chunk has a certain attribute
function hasAttr(chunk: ITextChunk, attr: string): boolean {
    return ('attributes' in chunk && attr in chunk.attributes);
}

// determine maximum (table) cell length
function tableCellWidth(table: ITable): Array<number> {
    let colLength = new Array(table.nCols).fill(0);

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
    let colAlign = new Array(table.nCols).fill('r');
    let colCheck = new Array(table.nCols).fill(false);

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
            if (cell === null) {
                continue;
            }
            // handle superscripts for footnotes (= specific notes)
            if (row.type != 'footnote' && cell.sups && cell.sups.length > 0) {
                cell.content = cell.content + '$^{' + replace4LaTeX(cell.sups.join(',')) + '}$';
            }
            // replace non-printable characters
            if (cell.content.length > 0) {
                cell.content = replace4LaTeX(cell.content);
            }
        }
    }

    return table;
}

// replace non-printable characters and HTML attributes in strings
function replace4LaTeX(content: string): string {
    const stringRepl = {'η²': '$\\eta^{2}$', 'η²p': '$\\eta^{2}_{p}$', 'ω²': '$\\omega^{2}$',
                        'χ²': '$\\chi^{2}$',
                        '₁₀': '$_{10}$', '₀₁': '$_{01}$', 'ₐ': '$_{a}$', '≠': '$\\neq$',
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
                   (parseInt(content.slice(5, 7), 16) / 255).toFixed(2)].join(', ');
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
                    cells.push('\\multicolumn{' + empty + '}{c}{~}');
                    empty = 0;
                }
                if (row.cells[i].colSpan) {
                    cells.push('\\multicolumn{' + row.cells[i].colSpan + '}{c}{' + row.cells[i].content + '}');
                    mrule.push('\\cmidrule{' + (i + 1) + '-' + (i + row.cells[i].colSpan) + '}');
                    i += (row.cells[i].colSpan - 1);
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
                output.push('\\textit{Note.}~' + row.cells[i].content.trim() + ' \\\\');
            }
            else {
                // Specific notes
                output.push('$^{' + row.cells[i].sups.join(',') + '}$~' + row.cells[i].content.trim() + ' \\\\'.replace(/(?<=\$)(.*?)\$(?=(.*?)\$)/g, '$1'));
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
    if (hasAttr(chunk, 'list'))
        output = output.trim()

    return output.replace(/(?<=\$)(.*?)\$(?=(.*?)\$)/g, '$1');
}

function formatFrml(katex: string): string {
    let output = katex;

    return output;
}

function concatRefs(refNames: Array<string>): string {
    if (!refNames || refNames.length === 0)
        return '';
    else if (refNames.length === 1)
        return ('module / package ' + refNames[0] + ' \\parencite{' + refNames[0] + '}');
    else
        return ('modules / packages ' + refNames.slice(0, -1).join(', ') + ' and ' + refNames.slice(-1)[0] +
                ' \\parencite{' + refNames.join(', ') + '}');
}

function describeRefs(refNames: Array<string>): string {
    let refText = '';
    const refPlrl = refNames.length > 1 ? 's ' : ' ';

    if (refNames.length > 0) {
        refNames = refNames.filter(n => n !== 'R' && n !== 'jamovi');
        refText = '% Statistical analyses were performed using jamovi \\parencite{jamovi}, ' +
                  'and the R statistical language \\parencite{R}, as well as the ' +
                  concatRefs(refNames) + '. Further describe your statistical analyses...'
    } else {
        refText = '% Describe your statistical analyses...'
    }

    return refText;
}
