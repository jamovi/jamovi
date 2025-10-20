
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
        type=function() private$.type,
        format=function() paste0(private$.format, collapse=','),
        combineBelow=function() private$.combineBelow,
        sortable=function() private$.sortable,
        cells=function() private$.cells,
        superTitle=function() private$.superTitle,
        hasSuperTitle=function() ( ! is.null(private$.superTitle)),
        width=function() {
            if ( ! private$.measured)
                self$.measure()
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
            titleWidth <- nchar(self$title)

            p <- ('pvalue' %in% private$.format)
            zto <- ('zto' %in% private$.format)
            pc <- ('pc' %in% private$.format)

            if (private$.type == "integer")
                private$.measures <- measureElements(private$.cells, maxdp=0, type=private$.type, p=p, zto=zto, pc=pc)
            else
                private$.measures <- measureElements(private$.cells, type=private$.type, p=p, zto=zto, pc=pc)

            private$.width <- max(private$.measures$width, titleWidth)
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
        .cellForPrint=function(i, measures=NULL, width=NA) {
            if ( ! private$.measured)
                self$.measure()

            if (is.null(measures))
                measures <- private$.measures

            if ( ! is.na(width))
                measures$width <- width

            p <- ('pvalue' %in% private$.format)
            zto <- ('zto' %in% private$.format)
            pc <- ('pc' %in% private$.format)

            v <- formatElement(private$.cells[[i]],
                w=measures$width,
                dp=measures$dp,
                sf=measures$sf,
                expw=measures$expwidth,
                supw=measures$supwidth,
                type=private$.type,
                p=p,
                zto=zto,
                pc=pc)

            if (private$.combineBelow && i > 1) {
                above <- formatElement(private$.cells[[i - 1]],
                   w=measures$width,
                   dp=measures$dp,
                   sf=measures$sf,
                   expw=measures$expwidth,
                   supw=measures$supwidth,
                   type=private$.type,
                   p=p,
                   zto=zto,
                   pc=pc)
                if (v == above)
                    v <- repstr(' ', nchar(v))
            }

            return(v)
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
