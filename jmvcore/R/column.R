
#' @rdname Analysis
#' @export
Column <- R6::R6Class("Column",
    private=list(
        .name="",
        .title="",
        .type="",
        .format="",
        .contentExpr=NA,
        .visibleExpr=NA,
        .superTitle=NA,
        .combineBelow=FALSE,
        .sortable=FALSE,
        .refs=NA,
        .hasSortKeys=FALSE,
        .cells=list(),
        .width = 0,
        .measures=list(),
        .measured=FALSE,
        .measuredWith=NULL,  # the number format measured with
        .measureIfNeeded=function() {
            current <- list(numberFormat(), decimalSymbol(private$.options))
            if ( ! private$.measured || ! identical(current, private$.measuredWith))
                self$.measure()
        },
        # a cell's value, as it's printed: as in jamovi (see formatValue()),
        # but with a missing value left blank
        .valueForPrint=function(cell, fmt) {
            value <- cell$value
            if (length(value) == 1 && is.na(value) && ! is.nan(value))
                return('')
            formatValue(value, fmt)
        },
        # what follows a cell's value: its symbols (e.g. '*'), and then its
        # footnotes, as in jamovi. a symbol may carry markup of its own
        # (e.g. <sup>), and only its text is printed
        .supsForPrint=function(cell) {
            symbols <- gsub('<[^>]*>', '', cell$symbols)
            footnotes <- .SUPCHARS[cell$sups + 1]
            sups <- paste(c(symbols, footnotes), collapse='')
            if (sups == '')
                return('')
            paste0(' ', sups)
        },
        .supWidth=function(cell) {
            nchar(private$.supsForPrint(cell))
        },
        .options=NULL,
        deep_clone=function(name, value) {
            value
        }),
    active=list(
        name=function() private$.name,
        title=function() {
            t <- private$.title
            t <- gsub('</sub>$', '', t)
            t <- gsub('</sub>', '-', t, fixed=TRUE)
            t <- gsub('<sub>', '-', t, fixed=TRUE)
            t
        },
        titleHtml=function() private$.title,
        type=function() private$.type,
        format=function() paste0(private$.format, collapse=','),
        combineBelow=function() private$.combineBelow,
        sortable=function() private$.sortable,
        cells=function() private$.cells,
        superTitle=function() private$.superTitle,
        hasSuperTitle=function() ( ! is.null(private$.superTitle)),
        width=function() {
            private$.measureIfNeeded()
            private$.width
        },
        visible=function(value) {
            if (missing(value)) {
                if (is.null(private$.visibleExpr) || identical(private$.visibleExpr, 'TRUE'))
                    return(TRUE)
                else if (identical(private$.visibleExpr, 'FALSE'))
                    return(FALSE)

                v <- private$.options$eval(private$.visibleExpr)
                if (is.logical(v))
                    return(v)
                else
                    return( ! is.null(v))
            }
            private$.visibleExpr <- paste(value)
            invisible(self)
        }
    ),
    public=list(
        initialize=function(
            options,
            name,
            title,
            superTitle,
            visible,
            content,
            type,
            format,
            combineBelow,
            sortable,
            refs) {

            private$.options <- options

            private$.name <- name
            private$.title <- options$translate(title)
            private$.superTitle <- options$translate(superTitle)
            if (identical(visible, TRUE))
                private$.visibleExpr <- NULL
            else
                private$.visibleExpr <- paste(visible)
            private$.contentExpr <- content
            private$.type <- type
            private$.format <- strsplit(format, ',', fixed=TRUE)[[1]]
            private$.combineBelow <- combineBelow
            private$.sortable <- sortable
            private$.refs <- as.character(refs)

            private$.measured <- FALSE
            private$.cells <- list()

        },
        setTitle=function(title) {
            title <- paste(title, collapse='')
            private$.title <- title
        },
        setSuperTitle=function(title) {
            title <- paste(title, collapse='')
            private$.superTitle <- title
        },
        setVisible=function(visible) {
            private$.visibleExpr <- paste(visible)
        },
        addCell=function(value, ...) {

            if (base::missing(value)) {
                if (is.character(private$.contentExpr))
                    value <- private$.options$eval(private$.contentExpr, ...)
                else
                    value <- NULL
            }

            if (inherits(value, "Cell"))
                cell <- value
            else
                cell <- Cell$new(value)

            private$.cells[[length(private$.cells)+1]] <- cell
            private$.measured <- FALSE
        },
        setCell=function(row, value) {
            if (row > length(private$.cells))
                stop(format("Row '{}' does not exist in the table", row), call.=FALSE)
            cell <- private$.cells[[row]]
            if (is.null(cell))
                stop("no such cell")
            cell$setValue(value)
            private$.measured <- FALSE
        },
        getCell=function(row) {
            if (row > length(private$.cells))
                stop(format("Row '{}' does not exist in the table", row), call.=FALSE)

            cell <- private$.cells[[row]]
            if (is.null(cell))
                stop("no such cell")
            cell
        },
        clear=function() {
            private$.cells <- list()
            private$.measured <- FALSE
        },
        setSortKeys=function(keys) {
            if (length(keys) != length(private$.cells))
                stop('length(keys) is not equal to rowCount')

            private$.hasSortKeys <- TRUE
            for (i in seq_along(private$.cells))
                private$.cells[[i]]$sortKey <- keys[[i]]
        },
        setRefs=function(refs) {
            private$.refs <- as.character(refs)
        },
        getRefs=function() {
            private$.refs
        },
        .measure=function() {
            fmt <- determineFormat(self, decimalSymbol(private$.options))
            values <- vapply(private$.cells, private$.valueForPrint, '', fmt=fmt)
            supwidth <- max(c(0, vapply(private$.cells, private$.supWidth, 0)))
            width <- max(c(0, nchar(values))) + supwidth

            private$.measures <- list(fmt=fmt, width=width, supwidth=supwidth)
            private$.width <- max(width, nchar(self$title))
            private$.measuredWith <- list(numberFormat(), decimalSymbol(private$.options))
            private$.measured <- TRUE
        },
        .titleForPrint=function(width=NULL) {
            t <- self$title
            if (is.null(width))
                width <- self$width
            w <- nchar(t)
            pad <- spaces(max(0, width - w))

            paste0(t, pad)
        },
        # the i'th cell's value, formatted, but without its padding or sups
        .formattedValue=function(i) {
            private$.measureIfNeeded()
            private$.valueForPrint(private$.cells[[i]], private$.measures$fmt)
        },
        # the width of the i'th cell, and of its superscripts
        .cellWidths=function(i) {
            private$.measureIfNeeded()
            cell <- private$.cells[[i]]
            supwidth <- private$.supWidth(cell)
            width <- nchar(private$.valueForPrint(cell, private$.measures$fmt)) + supwidth
            list(width=width, supwidth=supwidth)
        },
        # the i'th cell, padded to width, with its superscripts (the
        # footnotes) in the last supwidth of it
        .cellForPrint=function(i, width=NULL, supwidth=NULL) {
            private$.measureIfNeeded()

            if (is.null(width))
                width <- private$.measures$width
            if (is.null(supwidth))
                supwidth <- private$.measures$supwidth

            fmt <- private$.measures$fmt
            cell <- private$.cells[[i]]
            value <- private$.valueForPrint(cell, fmt)

            sups <- private$.supsForPrint(cell)
            supsPadded <- paste0(sups, spaces(max(0, supwidth - nchar(sups))))

            pad <- spaces(max(0, width - supwidth - nchar(value)))
            # text is to the left, and numbers to the right
            if (is.character(cell$value) && ! private$.type %in% c('number', 'integer'))
                str <- paste0(value, pad, supsPadded)
            else
                str <- paste0(pad, value, supsPadded)

            if (private$.combineBelow && i > 1) {
                above <- private$.cells[[i - 1]]
                if (identical(value, private$.valueForPrint(above, fmt)) && identical(sups, private$.supsForPrint(above)))
                    str <- spaces(nchar(str))
            }

            str
        },
        asProtoBuf=function() {

            vexpr <- private$.visibleExpr

            if (is.null(vexpr))
                v <- jamovi.coms.Visible$DEFAULT_YES
            else if (identical(vexpr, 'TRUE'))
                v <- jamovi.coms.Visible$YES
            else if (identical(vexpr, 'FALSE'))
                v <- jamovi.coms.Visible$NO
            else if (self$visible)
                v <- jamovi.coms.Visible$DEFAULT_YES
            else
                v <- jamovi.coms.Visible$DEFAULT_NO

            superTitle <- ''
            if (self$hasSuperTitle)
                superTitle <- self$superTitle

            column <- RProtoBuf_new(jamovi.coms.ResultsColumn,
                name=private$.name,
                title=private$.title,
                type=private$.type,
                superTitle=superTitle,
                format=paste0(private$.format, collapse=','),
                combineBelow=private$.combineBelow,
                sortable=private$.sortable,
                hasSortKeys=private$.hasSortKeys,
                visible=v)

            for (cell in private$.cells)
                column$add("cells", cell$asProtoBuf())

            column
        },
        fromProtoBuf=function(columnPB) {

            cellsPB <- columnPB$cells

            for (i in seq_along(cellsPB)) {
                cellPB <- cellsPB[i]
                cell <- getCell(i)
                cell$fromProtoBuf(cellPB)
            }
        }
    )
)

#' @export
as.list.Column <- function(x, ...) {
    lapply(x$cells, function(x) {
        v <- x$value
        if (is.null(v))
            return(NA)
        if (identical(v, ''))
            return(NA)
        v
    })
}
