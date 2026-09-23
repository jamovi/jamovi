
# converts results elements into html, for html documents (quarto,
# rmarkdown, etc.). the html is that of the client's htmlify.ts, with the
# table structure of its hydrate.ts, so results look the same in a document
# as they do copied or exported from jamovi. as there, everything is styled
# inline; the only stylesheet is scoped to the results (see STYLESHEET)

# a chunk may set its own number format, over jmvcore.format (see
# numberFormat()): as '#| jmv-format: {digits: 4}', say
#' @exportS3Method knitr::knit_print
knit_print.ResultsElement <- function(x, options=list(), ...) {
    format <- options[['jmv-format']]
    if (is.null(format))
        format <- options[['jmv.format']]
    if ( ! is.null(format)) {
        format <- utils::modifyList(as.list(getOption('jmvcore.format', list())), as.list(format))
        old <- base::options(jmvcore.format=format)
        on.exit(base::options(old))
    }
    if ( ! knitr::is_html_output())
        return(knitr::normal_print(x))
    knitr::raw_html(htmlify(x))
}

#' @exportS3Method knitr::knit_print
knit_print.Analysis <- function(x, ...) {
    knit_print.ResultsElement(x$results, ...)
}

htmlify <- function(element, level=1) {
    body <- htmlElement(element, level)
    paste0(
        '<div class="jmv-results">\n',
        '<style>', STYLESHEET, '</style>\n',
        body,
        '</div>\n')
}

HTML_RULE <- '1px solid #333333'
HTML_HEAVY_RULE <- '2px solid #333333'  # beneath the body (cf. resultsview/main.css)
HTML_MONO <- 'Consolas, Menlo, monospace'

# notices, by NoticeType: error, strong warning, warning, info
# (cf. resultsview/notice.ts)
BOX_COLORS <- c('#dd0000', '#a6a6a6', '#f5a623', '#3e6da9')
BOX_FILLS  <- c('#fbe9e9', '#f2f2f2', '#fdf3e4', '#e8eef8')

# the look of the results view, as htmlify.ts's STYLESHEET, but scoped to
# the results, so the rest of the document is left as it is
STYLESHEET <- '
.jmv-results {
    font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
    color: #333333;
    font-size: 12px;
}
.jmv-results h1, .jmv-results h2, .jmv-results h3,
.jmv-results h4, .jmv-results h5, .jmv-results h6 {
    font-family: inherit; font-weight: bold; border: none; padding: 0;
    margin-top: 16px; margin-bottom: 12px; font-size: 110%; color: inherit;
}
.jmv-results h1 { font-size: 160%; color: #3E6DA9; margin-top: 24px; }
.jmv-results h2 { font-size: 130%; color: #3E6DA9; margin-top: 24px; }
.jmv-results table { width: auto; margin: 0; }
.jmv-results th { font-weight: normal; }
.jmv-results img { max-width: 100%; height: auto; }
.jmv-results a { color: #3E6DA9; }
'

htmlElement <- function(element, level) {
    if ( ! element$visible)
        return('')
    if (inherits(element, 'Group') || inherits(element, 'Array'))
        htmlGroup(element, level)
    else if (inherits(element, 'Table'))
        htmlTable(element)
    else if (inherits(element, 'Image'))
        htmlImage(element)
    else if (inherits(element, 'Preformatted'))
        htmlPreformatted(element, level)
    else if (inherits(element, 'Html'))  # also Svg
        htmlVerbatim(element)
    else if (inherits(element, 'Text'))
        htmlText(element)
    else if (inherits(element, 'Notice'))
        htmlNotice(element)
    else
        ''
}

htmlGroup <- function(group, level) {
    childLevel <- if (identical(group$title, '')) level else level + 1
    children <- vapply(group$items, htmlElement, '', level=childLevel)
    if (all(children == ''))
        return('')
    paste0(htmlHeading(group$title, level), paste0(children, collapse=''))
}

htmlHeading <- function(title, level) {
    if (identical(title, ''))
        return('')
    level <- min(max(level, 1), 6)
    paste0('<h', level, '>', title, '</h', level, '>\n')
}

# a figure's title, above it, as in the results view
htmlCaption <- function(title) {
    paste0('<p style="font-weight: bold;">', title, '</p>\n')
}

htmlImage <- function(image) {
    path <- tempfile(fileext='.png')
    on.exit(unlink(path))
    drawn <- image$saveAs(path)
    if ( ! isTRUE(drawn))
        return('')
    size <- image$size
    src <- base64enc::dataURI(file=path, mime='image/png')
    alt <- ''
    if ( ! identical(image$title, ''))
        alt <- paste0(' alt="', htmlEscape(htmlToText(image$title), attribute=TRUE), '"')
    paste0(
        htmlCaption(image$title),
        '<img src="', src, '" width="', size$width, '" height="', size$height, '"', alt, '>\n',
        '<p></p>\n')
}

htmlPreformatted <- function(preformatted, level) {
    paste0(
        htmlHeading(preformatted$title, level),
        '<pre style="font-family: ', HTML_MONO, ';">',
        htmlEscape(preformatted$content),
        '</pre>\n')
}

# an Html result's content, dropped in verbatim (cf. htmlify.ts's
# generateVerbatimHtml())
htmlVerbatim <- function(html) {
    paste0('<div>', html$content, '</div>\n')
}

# a Text result's content is markdown (cf. hydrate.ts's hydrateTextElement()),
# which needs commonmark
htmlText <- function(text) {
    if ( ! hasCommonmark())
        stop("These results contain text, which needs the 'commonmark' package: install.packages('commonmark')", call.=FALSE)
    commonmark::markdown_html(text$content, extensions=TRUE)
}

hasCommonmark <- function() {
    requireNamespace('commonmark', quietly=TRUE)
}

htmlNotice <- function(notice) {
    type <- notice$type + 1
    content <- expandNotice(notice$content, notice$options)
    paragraphs <- strsplit(gsub('\r\n', '\n', content, fixed=TRUE), '\n{2,}')[[1]]
    paragraphs <- trimws(paragraphs)
    paragraphs <- paragraphs[paragraphs != '']
    title <- ''
    if ( ! identical(notice$title, ''))
        title <- paste0('<p style="font-weight: bold;">', notice$title, '</p>')
    paste0(
        '<div style="border-left: 4px solid ', BOX_COLORS[type], '; ',
        'background-color: ', BOX_FILLS[type], '; padding: 8px 12px;">',
        title,
        paste0('<p>', paragraphs, '</p>', collapse=''),
        '</div>\n')
}

# a notice's content may carry values to substitute into it (see ..()), and
# these are set in bold (cf. resultsview/notice.ts, and i18n.ts's __())
expandNotice <- function(compound, options) {
    parts <- strsplit(compound, '\u0004', fixed=TRUE)[[1]]
    content <- options$translate(parts[1])
    if (length(parts) < 2 || parts[2] == '')
        return(content)
    values <- jsonlite::fromJSON(parts[2], simplifyVector=FALSE)
    if (is.character(values))
        return(sub('{}', paste0('<strong>', values, '</strong>'), content, fixed=TRUE))
    names <- names(values)
    if (is.null(names))
        names <- as.character(seq_along(values) - 1)
    for (i in seq_along(values)) {
        content <- sub(
            paste0('{', names[i], '}'),
            paste0('<strong>', values[[i]], '</strong>'),
            content, fixed=TRUE)
    }
    content
}


# tables

footnoteMark <- function(index) {
    if (length(index) == 0)
        return(character())
    paste0('<sup>', letters[index], '</sup>')
}

# a cell as hydrate.ts's ICell: content is html, sups the footnote marks
# and symbols to follow it. a cell spanning several columns/rows carries
# the count, and the cells it covers carry 0
tableCell <- function(content, align, format=0, sups=character()) {
    list(content=content, align=align, format=format, colSpan=1, rowSpan=1, sups=sups)
}

htmlTable <- function(table) {

    columns <- Filter(function(column) column$visible, table$columns)
    names <- vapply(columns, function(column) column$name, '')

    # the name each column folds into, and the sub-row within the fold
    matches <- regmatches(names, regexec('^(.*)\\[(.*)\\]$', names))
    foldNames <- vapply(seq_along(names), function(i) {
        if (length(matches[[i]]) == 3) matches[[i]][2] else names[i]
    }, '')
    subRowNames <- unique(unlist(lapply(matches, function(m) if (length(m) == 3) m[3])))
    nFolds <- max(length(subRowNames), 1)
    foldedNames <- unique(foldNames)
    firsts <- match(foldedNames, foldNames)  # the columns providing the titles
    nCols <- length(foldedNames)

    rows <- list()

    # super titles: the first column under a super title spans the run of
    # columns sharing it
    superTitles <- lapply(columns[firsts], function(column) {
        if (column$hasSuperTitle && ! identical(column$superTitle, ''))
            column$superTitle
        else
            NULL
    })
    if (any( ! vapply(superTitles, is.null, TRUE)))
        rows[[length(rows) + 1]] <- list(type='superTitle', cells=superTitleCells(superTitles))

    titles <- lapply(columns[firsts], function(column) tableCell(column$titleHtml, 'c'))
    rows[[length(rows) + 1]] <- list(type='title', cells=titles)

    # the body, column by column, with the footnotes numbered as they're met
    footnotes <- character()
    cellsByColumn <- list()
    for (i in seq_along(columns)) {
        column <- columns[[i]]
        align <- if (column$type == 'text') 'l' else 'r'
        fmt <- determineFormat(column, decimalSymbol(table$options))
        cells <- list()
        for (j in seq_along(column$cells)) {
            cell <- column$cells[[j]]
            footnotes <- c(footnotes, setdiff(unique(cell$footnotes), footnotes))
            indices <- match(cell$footnotes, footnotes)
            content <- formatValue(cell$value, fmt)
            if ( ! is.character(cell$value))
                content <- htmlEscape(content)
            if (identical(content, '')) {
                cells[j] <- list(NULL)
            } else {
                sups <- c(cell$symbols, footnoteMark(indices))
                cells[[j]] <- tableCell(content, align, cell$format, sups)
            }
        }
        cellsByColumn[[i]] <- cells
    }

    nRows <- table$rowCount * nFolds
    body <- rep(list(rep(list(NULL), nCols)), nRows)
    for (i in seq_along(columns)) {
        colNo <- match(foldNames[i], foldedNames)
        subRow <- 1
        if (length(matches[[i]]) == 3)
            subRow <- match(matches[[i]][3], subRowNames)
        for (j in seq_len(table$rowCount)) {
            cell <- cellsByColumn[[i]][[j]]
            if ( ! is.null(cell))
                body[[(j - 1) * nFolds + subRow]][[colNo]] <- cell
        }
    }

    # the first row of each fold begins a group, and the last row ends it
    if (nFolds > 1) {
        body <- addGroupFormat(body, seq(1, nRows, by=nFolds), Cell.BEGIN_GROUP)
        body <- addGroupFormat(body, seq(nFolds, nRows, by=nFolds), Cell.END_GROUP)
    }
    body <- spreadGroupFormats(body)
    for (colNo in which(vapply(columns[firsts], function(column) column$combineBelow, TRUE)))
        body <- combineBelow(body, colNo)

    for (cells in body)
        rows[[length(rows) + 1]] <- list(type='body', cells=cells)

    for (note in table$notes)
        rows[[length(rows) + 1]] <- list(type='footnote', note=note$note, mark='note')
    for (i in seq_along(footnotes))
        rows[[length(rows) + 1]] <- list(type='footnote', note=footnotes[i], mark=footnoteMark(i))

    renderTable(table$title, rows, max(nCols, 1))
}

superTitleCells <- function(superTitles) {
    cells <- list()
    owner <- 0
    for (i in seq_along(superTitles)) {
        title <- superTitles[[i]]
        if ( ! is.null(title) && owner > 0 && identical(title, cells[[owner]]$content)) {
            cells[[owner]]$colSpan <- cells[[owner]]$colSpan + 1
            cells[[i]] <- tableCell(title, 'c')
            cells[[i]]$colSpan <- 0
        } else if ( ! is.null(title)) {
            cells[[i]] <- tableCell(title, 'c')
            owner <- i
        } else {
            cells[i] <- list(NULL)
            owner <- 0
        }
    }
    cells
}

addGroupFormat <- function(body, rowNos, format) {
    for (rowNo in rowNos) {
        for (colNo in seq_along(body[[rowNo]])) {
            cell <- body[[rowNo]][[colNo]]
            if ( ! is.null(cell))
                body[[rowNo]][[colNo]]$format <- bitwOr(cell$format, format)
        }
    }
    body
}

# spreads each row's BEGIN_GROUP/END_GROUP bits across every cell in that
# row (cf. hydrate.ts's ensureFormat())
spreadGroupFormats <- function(body) {
    for (rowNo in seq_along(body)) {
        cells <- Filter(Negate(is.null), body[[rowNo]])
        group <- Reduce(bitwOr, lapply(cells, function(cell) bitwAnd(cell$format, 3)), 0)
        if (group == 0)
            next()
        for (colNo in seq_along(body[[rowNo]])) {
            cell <- body[[rowNo]][[colNo]]
            if ( ! is.null(cell))
                body[[rowNo]][[colNo]]$format <- bitwOr(cell$format, group)
        }
    }
    body
}

# a run of equal cells in a combineBelow column becomes a single cell,
# spanning the run (cf. hydrate.ts's fold())
combineBelow <- function(body, colNo) {
    rowSpan <- 1
    for (rowNo in rev(seq_along(body))) {
        cell <- body[[rowNo]][[colNo]]
        above <- if (rowNo > 1) body[[rowNo - 1]][[colNo]] else NULL
        if (is.null(cell))
            next()
        if (is.null(above) || ! identical(cell$content, above$content)) {
            body[[rowNo]][[colNo]]$rowSpan <- rowSpan
            rowSpan <- 1
        } else {
            body[[rowNo]][[colNo]]$rowSpan <- 0
            rowSpan <- rowSpan + 1
        }
    }
    body
}

renderTable <- function(title, rows, nCols) {

    # APA: a rule above, below the column titles, and below the body; no
    # vertical rules. the title sits above the first rule, as on screen
    tableStyle <- 'border-collapse: collapse;'
    head <- character()
    if ( ! identical(title, '')) {
        th <- renderCell('th', title, list(align='l', colSpan=nCols, bottomRule=TRUE, flush=TRUE))
        head <- paste0('<tr>', th, '</tr>')
    } else {
        tableStyle <- paste0(tableStyle, ' border-top: ', HTML_RULE, ';')
    }

    types <- vapply(rows, function(row) row$type, '')
    lastBody <- max(c(0, which(types == 'body')))
    body <- character()

    for (i in seq_along(rows)) {
        row <- rows[[i]]
        if (row$type == 'superTitle') {
            head <- c(head, renderRow(row$cells, 'th', function(cell)
                list(align='c', colSpan=cell$colSpan, bottomRule=TRUE, vAlign='bottom')))
        } else if (row$type == 'title') {
            head <- c(head, renderRow(row$cells, 'th', function(cell)
                list(align='c', bottomRule=TRUE, vAlign='bottom')))
        } else if (row$type == 'body') {
            body <- c(body, renderRow(row$cells, 'td', function(cell) {
                if (is.null(cell))
                    return(list(bottomRule=(i == lastBody), heavy=TRUE))
                props <- list(
                    heavy=TRUE,
                    align=cell$align,
                    colSpan=cell$colSpan,
                    rowSpan=cell$rowSpan,
                    bottomRule=(i + cell$rowSpan - 1 >= lastBody),
                    indent=bitwAnd(cell$format, Cell.INDENTED) != 0,
                    before=bitwAnd(cell$format, Cell.BEGIN_GROUP) != 0,
                    after=bitwAnd(cell$format, Cell.END_GROUP) != 0)
                if (cell$rowSpan > 1)
                    props$vAlign <- 'top'
                props
            }))
        } else if (row$type == 'footnote') {
            if (identical(row$mark, 'note'))
                mark <- '<em>Note.</em> '
            else
                mark <- paste0(row$mark, ' ')
            td <- renderCell('td', paste0(mark, row$note), list(align='l', colSpan=nCols, small=TRUE))
            body <- c(body, paste0('<tr>', td, '</tr>'))
        }
    }

    paste0(
        # quarto would otherwise make the table over in its own style
        '<table data-quarto-disable-processing="true" style="', tableStyle, '">',
        '<thead>', paste0(head, collapse=''), '</thead>',
        '<tbody>', paste0(body, collapse=''), '</tbody>',
        '</table>\n',
        '<p></p>\n')
}

renderRow <- function(cells, tag, propsOf) {
    tds <- character()
    for (cell in cells) {
        if ( ! is.null(cell) && (cell$colSpan == 0 || cell$rowSpan == 0))
            next()  # covered by the cell above/before
        tds <- c(tds, renderCell(tag, cellHtml(cell), propsOf(cell)))
    }
    paste0('<tr>', paste0(tds, collapse=''), '</tr>')
}

# a cell's content, with its footnote marks and symbols. they're positioned
# out of flow, so they don't throw off the alignment of the values in a
# right-aligned column (cf. htmlify.ts's cellNodes())
cellHtml <- function(cell) {
    if (is.null(cell))
        return('')
    if (length(cell$sups) == 0)
        return(cell$content)
    paste0(
        cell$content,
        '<span style="position: absolute; padding-inline-start: 2px;">',
        paste0(cell$sups, collapse=''),
        '</span>')
}

renderCell <- function(tag, content, props) {

    padding <- if (isTRUE(props$small)) c(2, 8, 2, 8) else c(4, 8, 4, 8)
    if (isTRUE(props$flush))
        padding[4] <- 0
    if (isTRUE(props$before))
        padding[1] <- padding[1] + 4
    if (isTRUE(props$after))
        padding[3] <- padding[3] + 4
    if (isTRUE(props$indent))
        padding[4] <- padding[4] + 16
    # room on the right for a trailing sup (see cellHtml())
    if (identical(props$align, 'r'))
        padding[2] <- padding[2] + 12

    style <- paste0('padding: ', paste0(padding, 'px', collapse=' '), '; position: relative;')
    if ( ! is.null(props$align))
        style <- paste0(style, ' text-align: ', c(l='left', c='center', r='right')[[props$align]], ';')
    if ( ! is.null(props$vAlign))
        style <- paste0(style, ' vertical-align: ', props$vAlign, ';')
    if (isTRUE(props$bottomRule)) {
        rule <- if (isTRUE(props$heavy)) HTML_HEAVY_RULE else HTML_RULE
        style <- paste0(style, ' border-bottom: ', rule, ';')
    }
    if (isTRUE(props$small))
        style <- paste0(style, ' font-size: smaller;')

    attrs <- ''
    if ( ! is.null(props$colSpan) && props$colSpan > 1)
        attrs <- paste0(attrs, ' colspan="', props$colSpan, '"')
    if ( ! is.null(props$rowSpan) && props$rowSpan > 1)
        attrs <- paste0(attrs, ' rowspan="', props$rowSpan, '"')

    paste0('<', tag, attrs, ' style="', style, '">', content, '</', tag, '>')
}
