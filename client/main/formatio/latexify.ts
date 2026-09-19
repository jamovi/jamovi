
import { hasAttr } from './hydrate';
import { IElement } from './hydrate';
import { IImage } from './hydrate';
import { ITable } from './hydrate';
import { IRow } from './hydrate';
import { IPreformatted } from './hydrate';
import { IText } from './hydrate';
import { ITextChunk } from './hydrate';
import { html2Chunks } from './hydrate';
import { IReference } from '../references';

export interface ILatexifyOptions {
    showSyntax?: boolean;
    level?: number;
}

export function latexify(hydrated: IElement, options?: ILatexifyOptions): string {
    // handle falling back to defaults, if the option parameter is not given
    options = options || {};
    options.showSyntax = options.showSyntax ?? false;
    options.level = options.level ?? -1;

    if (hydrated === null) {
        return null;
    }
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

    if (!references || references.length === 0) {
        return null;
    }

    for (const currRef of references) {
        ref2Tex.push('@' + currRef['type'].replace('software', 'misc') + '{' + currRef['name']);
        // handle authors
        const splAuthor = currRef['authors']['complete'].split(/,|&/).map(s => s.trim()).filter(s => s !== '');
        if (splAuthor.length === 1) {
            ref2Tex.push('  author = \"{' + splAuthor[0] + '}\"');
        }
        else if (splAuthor.length % 2 === 0) {
            let currAuth = [];
            for (let i = 0; i < splAuthor.length; i += 2) {
                currAuth.push(splAuthor[i] + ', ' + splAuthor[i + 1]);
            }
            ref2Tex.push('  author = \"' + currAuth.join(' and ') + '\"');
        }
        else {
            ref2Tex.push('  author = \"[NEEDS MANUAL FORMATTING] ' + splAuthor.join(', ') + '\"');
        }
        for (const currKey of Object.keys(currRef).filter(k => !['name', 'type', 'authors'].includes(k))) {
            if (String(currRef[currKey]) !== '') {
                let currVal = currRef[currKey].toString().replace('&', '\\&');
                if (currKey === 'title') {
                    // prevents misformatting of packages, etc. due to APA7's title capitalization
                    currVal = currVal.replace(currRef.name, '{' + currRef.name + '}');
                }
                ref2Tex.push(('  ' + (currRef.type === 'article' && currKey === 'publisher' ? 'journal' : currKey) +
                              ' = \"' + currVal + '\"'));

            }
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
    else if (item.type === 'image') {
        output.push(...generateFigure(item));
    }
    else if (item.type === 'table') {
        output.push(...generateTable(item));
    }
    else if (item.type === 'preformatted') {
        output.push(...generatePreformatted(item, level, shwSyn));
    }
    else if (item.type === 'text') {
        output.push(...generateText(item, level));
    }

    return output;
}

// generate headings at different levels
function generateHeading(title: string, level: number): Array<string> {
    let output = [];
    const ruler = '% ' + '-'.repeat(80);

    if (level >= 0 && title) {
        output.push(ruler);
        if (level === 0) {
            // NB: chapter is not available in apa7
            output.push('\\chapter{' + title + '}');
        }
        else if (level === 1) {
            output.push('\\section{' + title + '}');
        }
        else if (level === 2) {
            output.push('\\subsection{' + title + '}');
        }
        else if (level === 3) {
            output.push('\\subsubsection{' + title + '}');
        }
        else if (level === 4) {
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

    const figTitle = figure.title ? formatHTML(figure.title) : 'PLACEHOLDER ' + randomString(8);
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
    const tblTitle = formatHTML(table.title);
    let rleBody = true;

    output.push('\\begin{table}[!htbp]');
    output.push(('\\caption{' + tblTitle + (table.refs ? (', created using the ' + concatRefs(table.refs)) : '') + '}'));
    output.push('\\label{tbl:Table_' + tblTitle.replaceAll(' ', '_').replace(/\$.*?\$/g, '').replace('__', '_') + '}');
    output.push('\\begin{adjustbox}{max size={\\columnwidth}{\\textheight}}');
    output.push('\\centering');
    output.push('\\begin{tabular}{' + colAlign.join('') + '}');
    output.push('\\toprule');
    for (let row of table.rows) {
        if (row.type === 'superTitle') {
            output.push(...formatSuperTitle(row));
        }
        else if (['title', 'body'].includes(row.type)) {
            if (row.type === 'body' && rleBody) {
                output.push('\\midrule');
                rleBody = false;
            }
            output.push(formatTableRow(row, colLength, colAlign));
        }
        else if (row.type === 'footnote') {
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
        if (preformatted.refs) {
            output.push('Created using the ' + concatRefs(preformatted.refs));
        }
        output.push('\\begin{verbatim}');
        output.push(replace4LaTeX(preformatted.content).split('\n'));
        output.push('\\end{verbatim}\n');
    }

    return output;
}

// generate formatted text (annotations, notices, html/text elements)
function generateText(text: IText, level: number): Array<string> {
    // icons and colours for message boxes for notices
    // cf. https://github.com/jamovi/jamovi/tree/main/client/resultsview/notice.ts#L64-L79
    // box - 1: 'warning-1', 2: 'warning-2', 3: 'info', 4: 'error'
    const iconType  = ['\\faExclamationTriangle', '\\faExclamationTriangle', '\\faInfoCircle', '\\faBolt'];
    const iconColor = ['gray',                  'orange',                'blue',           'red'];
    let output = [];
    let list = '';    // the open list environment (itemize / enumerate)
    let align = '';   // the open alignment environment (center / flushright)
    let indent = 0;

    const closeList = () => {
        if (list !== '') {
            output.push('\\end{' + list + '}');
            list = '';
        }
    };
    const closeAlign = () => {
        if (align !== '') {
            output.push('\\end{' + align + '}');
            align = '';
        }
    };

    // add a sentence regarding used references (if present)
    if (text.refs) {
        output.push('Created using the ' + concatRefs(text.refs) + '.\n');
    }

    // a notice: a box, with its title as the first line
    if (text.box) {
        output.push('\\awesomebox{4pt}{' + iconType[text.box - 1] + '}{' + iconColor[text.box - 1] + '}{');
        if (text.title) {
            output.push('\\textbf{' + replace4LaTeX(text.title) + '} \\\\');
        }
    }

    for (const paragraph of text.paragraphs) {
        const attrs = paragraph.attributes || {};
        const content = paragraph.chunks.map(formatAttr).join('');

        if (attrs.header) {
            closeList();
            closeAlign();
            output.push(...generateHeading(content, level + attrs.header - 1));
            continue;
        }

        if (attrs.codeBlock) {
            closeList();
            closeAlign();
            output.push('\\begin{verbatim}');
            output.push(...paragraph.chunks.map(c => c.content).join('').split('\n'));
            output.push('\\end{verbatim}');
            continue;
        }

        // alignment (justified is LaTeX's default, so needs no environment)
        const pAlign = attrs.align === 'center' ? 'center' : attrs.align === 'right' ? 'flushright' : '';
        if (pAlign !== align) {
            closeList();
            closeAlign();
            if (pAlign !== '') {
                align = pAlign;
                output.push('\\begin{' + align + '}');
            }
        }

        // lists
        const pList = attrs.list === 'ordered' ? 'enumerate' : attrs.list === 'bullet' ? 'itemize' : '';
        if (pList !== list) {
            closeList();
            if (pList !== '') {
                list = pList;
                output.push('\\begin{' + list + '}');
            }
        }

        // indentation (list items are indented by the list itself)
        const pIndent = (pList === '' && attrs.indent) ? attrs.indent : 0;
        if (pIndent !== indent) {
            indent = pIndent;
            output.push('\\setlength\\leftskip{' + indent + 'cm}');
        }

        if (pList !== '') {
            output.push('\\item{' + content + '}');
        }
        else if (text.box) {
            output.push(content + ' \\\\');
        }
        else {
            // a paragraph, separated from the next by a blank line
            output.push(content);
            output.push('');
        }
    }

    closeList();
    closeAlign();
    if (indent !== 0) {
        output.push('\\setlength\\leftskip{0cm}');
    }
    if (text.box) {
        // the last line of the box needn't end with a line break
        const last = output.length - 1;
        if (output[last].endsWith(' \\\\')) {
            output[last] = output[last].slice(0, -3);
        }
        output.push('}');
    }
    output.push('');

    return output;
}

// generate random string
function randomString(length: number): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';

    for (let i = 0; i < length; ++i) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return result;
}

// determine maximum (table) cell length
function tableCellWidth(table: ITable): Array<number> {
    let colLength = new Array(table.nCols).fill(0);

    for (let row of table.rows) {
        if (['title', 'body'].includes(row.type)) {
            for (let i = 0; i < row.cells.length; ++i) {
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
        if (row.type === 'body') {
            for (let i = 0; i < row.cells.length; ++i) {
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

    for (let i = 0; i < table.rows.length; ++i) {
        const row = table.rows[i];
        for (let j = 0; j < row.cells.length; ++j) {
            const cell = row.cells[j];
            if (cell === null) {
                continue;
            }
            // a cell covered by the one above it is left blank ([EMPTY] is
            // replaced by replace4LaTeX)
            if (cell.rowSpan === 0) {
                cell.content = '[EMPTY]';
                cell.sups = [];
            }
            // format the cell's chunks (which also replaces non-printable characters)
            if (cell.rowSpan === 0) {
                cell.content = replace4LaTeX(cell.content);
            }
            else {
                cell.content = cell.chunks.map(formatAttr).join('');
            }
            // handle superscripts for footnotes (= specific notes)
            if (row.type != 'footnote' && cell.sups && cell.sups.length > 0) {
                cell.content = rmDblDollar(cell.content + '$^{' + replace4LaTeX(cell.sups.join(',')) + '}$');
            }
        }
    }

    return table;
}

// replace LaTeX special characters, non-printable characters, and HTML attributes in strings
function replace4LaTeX(content: string): string {
    const stringRepl = {
                        // LaTeX special characters
                        '$' : '\\$', '%' : '\\%', '&' : '\\&', '#' : '\\#',
                        '{' : '\\{', '}' : '\\}', '_' : '\\_',
                        '^' : '\\textasciicircum', '~': '\\textasciitilde',
                        // jamovi output that with non-printable characters that need conversion
                        'η²': '$\\eta^{2}$', 'η²p': '$\\eta^{2}_{p}$',    // effect sizes
                        'ω²': '$\\omega^{2}$', 'χ²': '$\\chi^{2}$',       // effect size and statistic
                        '₁₀': '$_{10}$', '₀₁': '$_{01}$', 'ₐ': '$_{a}$',  // subscripts (hypotheses, etc.)
                        '<sup>μ</sup>': '$\\mu$', 'μ': '$\\mu$',          // superscripts (footnotes, etc.)
                        '⁻': '-', '⁺': '+', '€': '\\texteuro',            // superscripts (cont.), EUR-symbol
                        '≠': '$\\neq$', '✻': '$\\times$', ' ': '~',       // comparison, times (in effects)
                        // HTML attributes
                        '<sup>':    '$^{',          '</sup>':    '}$',    // superscript
                        '<sub>':    '$_{',          '</sub>':    '}$',    // subscript
                        '<strong>': '\\textbf{',    '</strong>': '}',     // bold
                        '<em>':     '\\textit{',    '</em>':     '}',     // italic
                        '<u>':      '\\underline{', '</u>':      '}',     // underline
                        '<s>':      '\\st{',        '</s>':      '}',     // strike-through
                        // empty cells ([EMPTY] as placeholder to prevent replacing ~ as special char.)
                        '[EMPTY]': '~',
                       };

    for (const [target, replace] of Object.entries(stringRepl)) {
        content = content.replaceAll(target, replace);
    }

    return rmDblDollar(content);
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

    for (let i = 0; i < row.cells.length; ++i) {
        if (row.cells[i]) {
            if (row.cells[i].colSpan === 0) {
                // covered by the multicolumn before it
                continue;
            }
            if (row.cells[i].content) {
                if (empty > 0) {
                    cells.push('\\multicolumn{' + empty + '}{c}{~}');
                    empty = 0;
                }
                if (row.cells[i].colSpan) {
                    cells.push('\\multicolumn{' + row.cells[i].colSpan + '}{c}{' + row.cells[i].content + '}');
                    mrule.push('\\cmidrule{' + (i + 1) + '-' + (i + row.cells[i].colSpan) + '}');
                }
                else {
                    cells.push(row.cells[i].content);
                }
            }
        }
        else {
            ++empty
        }
    }

    return [cells.join(' & ') + ' \\\\', ...mrule];
}

// format “usual” table rows (title, body)
function formatTableRow(row: IRow, colLength: Array<number>, colAlign: Array<string>): string {
    let cells = [];
    let crrCll = '';
    let addSpc = 0;

    for (let i = 0; i < row.cells.length; ++i) {
        if (row.cells[i] && row.cells[i].content.length > 0) {
            crrCll = row.cells[i].content;
        }
        else {
            crrCll = '~';
        }
        addSpc = colLength[i] - crrCll.length;
        if (colAlign[i] === 'l') {
            cells.push(crrCll + ' '.repeat(addSpc));
        }
        else if (colAlign[i] === 'r') {
            cells.push(' '.repeat(addSpc) + crrCll);
        }
        else if (colAlign[i] === 'r') {
            cells.push(' '.repeat(Math.ceil(addSpc / 2)) + crrCll +
                       ' '.repeat(Math.floor(addSpc / 2)));
        }
    }

    return cells.join(' & ') + ' \\\\';
}

// format a footnote row
function formatNote(row: IRow): Array<string> {
    let output = [];

    for (let i = 0; i < row.cells.length; ++i) {
        if (row.cells[i].content.length > 0 && row.cells[i].sups.length > 0) {
            if (row.cells[i].sups[0] === 'note') {
                // General and significance notes
                output.push('\\textit{Note.}~' + row.cells[i].content.trim() + ' \\\\');
            }
            else {
                // Specific notes
                output.push(rmDblDollar('$^{' + row.cells[i].sups.join(',') + '}$~' + row.cells[i].content.trim() + ' \\\\'));
            }
        }
    }

    return output;
}

// a string with inline html (a title), formatted
function formatHTML(html: string): string {
    return html2Chunks(html).map(formatAttr).join('');
}

function formatAttr(chunk: ITextChunk): string {
    let output = chunk.content;
    if (!hasAttr(chunk, 'formula')) {
      output = replace4LaTeX(output);
    }

    if (hasAttr(chunk, 'bold')) {
        output = '\\textbf{' + output + '}';
    }
    if (hasAttr(chunk, 'italic')) {
        output = '\\textit{' + output + '}';
    }
    if (hasAttr(chunk, 'underline')) {
        output = '\\underline{' + output + '}';
    }
    if (hasAttr(chunk, 'strike')) {
        output = '\\st{' + output + '}';
    }
    if (hasAttr(chunk, 'code')) {
        output = '\\texttt{' + output + '}';
    }
    if (hasAttr(chunk, 'link')) {
        output = '\\href{' + chunk.attributes.link + '}{' + output + '}';
    }
    if (hasAttr(chunk, 'formula')) {
        output = '${' + formatFrml(output) + '}$';
    }
    if (hasAttr(chunk, 'script') && chunk.attributes.script === 'super') {
        output = '$^{' + output + '}$';
    }
    if (hasAttr(chunk, 'script') && chunk.attributes.script === 'sub') {
        output = '$_{' + output + '}$';
    }
    if (hasAttr(chunk, 'color')) {
        output = '\\textcolor[rgb]{' + formatRGB(chunk.attributes.color) + '}{' + output + '}';
    }
    if (hasAttr(chunk, 'background')) {
        output = '\\colorbox[rgb]{' + formatRGB(chunk.attributes.background) + '}{' + output + '}';
    }

    return rmDblDollar(output);
}

function formatFrml(katex: string): string {
    let output = katex;

    return output;
}

function concatRefs(refNames: Array<string>): string {
    if (!refNames || refNames.length === 0) {
        return '';
    }
    else if (refNames.length === 1) {
        return ('module, package or reference ' + refNames[0] + ' \\parencite{' + refNames[0] + '}');
    }
    else {
        return ('modules, packages or references ' + refNames.slice(0, -1).join(', ') + ' and ' + refNames.slice(-1)[0] +
                ' \\parencite{' + refNames.join(', ') + '}');
    }
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

function rmDblDollar(content: string): string {
    return content.replace(/(?<=\$)(.*?)\$(?=(.*?)\$)/g, '$1');
}