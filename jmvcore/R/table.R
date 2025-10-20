
Note <- R6::R6Class('Note',
    public=list(
        key=NA,
        note=NA,
        init=NA,
        initialize=function(key, note, init) {
            self$key  <- key
            self$note <- note
            self$init <- init
        }
    )
)

#' @rdname Analysis
#' @export
Table <- R6::R6Class('Table',
    inherit=ResultsElement,
    private=list(
        .columns=NA,
        .rowCount=0,
        .rowKeys=character(),
        .rowNames=character(),
        .rowsExpr='0',
        .margin=1,
        .padding=2,
        .marstr=' ',
        .padstr='  ',
        .swapRowsColumns=FALSE,
        .rowSelect='',
        .sortSelect='',
        .footnotes=NA,
        .footnotesUpdated=FALSE,
        .notes=NA,
        deep_clone=function(name, value) {
            if (name == '.columns') {
                columns <- list()
                for (name in names(value))
                    columns[[name]] <- value[[name]]$clone(deep=TRUE)
                return(columns)
            }
            value
        },
        .updateFootnotes=function() {
            if (private$.footnotesUpdated)
                return()

            private$.footnotes <- character()

            for (rowNo in seq_len(private$.rowCount)) {
                for (column in private$.columns) {
                    if ( ! column$visible)
                        next()
                    cell <- column$getCell(rowNo)
                    indices <- integer()
                    for (note in cell$footnotes) {
                        index <- indexOf(note, private$.footnotes)
                        if (is.na(index)) {
                            private$.footnotes <- c(private$.footnotes, note)
                            index <- length(private$.footnotes)
                        }
                        indices <- c(indices, index[1]-1)
                    }
                    cell$sups <- indices
                }
            }

            private$.footnotesUpdated <- TRUE
        }),
    active=list(
        names=function() private$.rowNames,
        rowKeys=function() private$.rowKeys,
        width=function() {

            if ( ! private$.swapRowsColumns) {

                w <- 0
                for (column in private$.columns) {
                    if (column$visible)
                        w <- w + private$.padding + column$width + private$.padding
                }

            } else {

                w <- private$.padding + self$.widthWidestHeader() + private$.padding
                for (i in seq_len(private$.rowCount))
                    w <- w + private$.padding + self$.widthWidestCellInRow(i)$width + private$.padding
            }

            max(w, nchar(self$title))
        },
        rowSelected=function() {
            if (private$.rowSelect != '') {
                rowNo <- try(private$.options$eval(private$.rowSelect, silent=TRUE)+1)
                if (inherits(rowNo, 'try-error'))
                    rowNo <- 0
            } else {
                rowNo <- 0
            }
            rowNo
        },
        sortSelected=function() {
            if (private$.sortSelect != '') {
                sort <- try(private$.options$eval(private$.sortSelect, silent=TRUE))
                if (inherits(sort, 'try-error'))
                    sort <- NULL
            } else {
                sort <- NULL
            }
            sort
        },
        footnotes=function() {
            private$.updateFootnotes()
            private$.footnotes
        },
        columns=function() private$.columns,
        rowCount=function() private$.rowCount,
        notes=function() private$.notes,
        asDF=function() as.data.frame.Table(self)),
    public=list(
        initialize=function(
            options,
            name=NULL,
            title='no title',
            visible=TRUE,
            clearWith='*',
            refs=character(),
            columns=list(),
            rows=0,
            notes=list(),
            swapRowsColumns=FALSE,
            rowSelect='',
            sortSelect='') {

            if (missing(options))
                options <- Options$new()

            super$initialize(
                options=options,
                name=name,
                title=title,
                visible=visible,
                clearWith=clearWith,
                refs=refs)

            private$.rowSelect <- rowSelect
            private$.sortSelect <- sortSelect

            private$.notes <- list()
            for (name in names(notes)) {
                note <- notes[[name]]
                self$setNote(name, note, init=TRUE)
            }

            private$.swapRowsColumns <- swapRowsColumns

            private$.rowCount <- 0
            private$.rowsExpr <- paste(rows)
            private$.rowKeys <- list()

            private$.columns <- list()

            private$.margin <- 1
            private$.marstr <- spaces(private$.margin)
            private$.padding <- 2
            private$.padstr <- spaces(private$.padding)

            for (column in columns)
                do.call(self$addColumn, column)
        },
        isFilled=function(col, rowNo, rowKey, excHidden=TRUE) {

            cols <- integer()

            if (missing(col)) {
                cols <- seq_along(private$.columns)
            } else if (is.character(col)) {
                for (i in seq_along(private$.columns)) {
                    column <- private$.columns[[i]]
                    if (col == column$name) {
                        cols <- i
                        break()
                    }
                }
                if (length(cols) == 0)
                    reject("No such column: '{}'", col, code=NULL)
            } else if (is.numeric(col)) {
                cols <- col
            } else {
                stop('isFilled(): bad col argument')
            }

            rows <- integer()

            if ( ! missing(rowNo)) {
                rows <- rowNo
            } else if ( ! missing(rowKey)) {
                for (rowNo in seq_along(private$.rowKeys)) {
                    if (base::identical(rowKey, private$.rowKeys[[rowNo]])) {
                        rows <- rowNo
                        break()
                    }
                }
                if (length(rows) == 0)
                    reject("No such row: '{}'", toJSON(rowKey), code=NULL)
            } else {
                rows <- seq_along(private$.rowKeys)
            }

            for (col in cols) {
                column <- private$.columns[[col]]
                if (excHidden && column$visible == FALSE)
                    next()
                for (row in rows) {
                    if (self$getCell(rowNo=row, col=col)$isNotFilled())
                        return(FALSE)
                }
            }

            TRUE
        },
        getRefs=function(recurse=FALSE) {
            refs <- character()
            for (column in private$.columns) {
                if (column$visible)
                    refs <- c(refs, column$getRefs())
            }
            refs <- c(super$getRefs(), refs)
            refs <- unique(refs)
            refs
        },
        .update=function() {

            if (private$.updated)
                return()

            super$.update()

            error <- NULL

            newKeys <- try(private$.options$eval(private$.rowsExpr, .key=private$.key, .name=private$.name, .index=private$.index), silent=TRUE)

            if (base::inherits(newKeys, 'try-error')) {
                error <- newKeys
                newKeys <- character()
            } else if (is.list(newKeys)) {
                # all good
            } else if (is.character(newKeys)) {
                newKeys <- as.list(newKeys)
            } else if (is.numeric(newKeys) && newKeys[1] > 0) {
                newKeys <- as.list(paste(1:newKeys))
            } else {
                newKeys <- list()
            }

            if (base::identical(newKeys, private$.rowKeys))
                return()

            oldKeys <- private$.rowKeys
            oldRows <- self$getRows()

            self$deleteRows()

            for (i in seq_along(newKeys)) {

                newKey <- newKeys[[i]]
                index <- indexOf(newKey, oldKeys)

                if ( ! is.na(index)) {

                    newRow <- oldRows[[ index[1] ]]
                    self$addRow(newKey, newRow)

                } else {

                    self$addRow(newKey, list())
                }
            }

            private$.rowKeys <- newKeys
            private$.rowNames <- sapply(newKeys, toJSON, USE.NAMES=FALSE)

            if ( ! is.null(error))
                rethrow(error)
        },
        deleteRows=function() {
            private$.rowKeys <- list()
            for (column in private$.columns)
                column$clear()
            private$.rowCount <- 0
        },
        addColumn=function(
            name,
            index=NA,
            title=name,
            superTitle=NULL,
            visible=TRUE,
            content=NULL,
            type='number',
            format='',
            combineBelow=FALSE,
            sortable=FALSE,
            value=NA,
            refs=character()) {

            if ( ! isString(name))
                reject('Table$addColumn(): name must be a string')
            if ( ! isString(title))
                reject('Table$addColumn(): title must be a string')
            if ( ! (is.numeric(index) || is.na(index)))
                reject('Table$addColumn(): index must be a number')
            if ( ! is.null(content) && ! isString(content))
                reject('Table$addColumn(): content must be a string (or NULL)')
            if ( ! isString(type))
                reject('Table$addColumn(): type must be a string')
            if ( ! isString(format))
                reject('Table$addColumn(): format must be a string')
            if ( ! is.logical(combineBelow))
                reject('Table$addColumn(): combineBelow must be TRUE or FALSE')
            if ( ! is.logical(sortable))
                reject('Table$addColumn(): sortable must be TRUE or FALSE')

            column <- Column$new(
                options=private$.options,
                name=name,
                title=title,
                superTitle=superTitle,
                visible=visible,
                content=content,
                type=type,
                format=format,
                combineBelow=combineBelow,
                sortable=sortable,
                refs=refs)

            for (i in seq_len(private$.rowCount)) {
                rowKey <- private$.rowKeys[[i]]
                column$addCell(.key=rowKey, .index=i, value=value)
            }

            if (is.na(index)) {

                private$.columns[[name]] <- column

            } else {

                newColumns <- list()
                oldNames <- names(private$.columns)

                for (i in seq_along(private$.columns)) {
                    nm <- oldNames[[i]]
                    if (i == index)
                        newColumns[[name]] <- column
                    newColumns[[nm]] <- private$.columns[[nm]]
                }

                private$.columns <- newColumns
            }

            column
        },
        addRow=function(rowKey, values=list()) {

            for (value in values) {
                if ( ! isValue(value))
                    reject('Table$addRow(): value is not atomic', code='error')
            }

            private$.rowKeys[length(private$.rowKeys)+1] <- list(rowKey)  # allow NULL
            private$.rowCount <- private$.rowCount + 1
            private$.rowNames <- sapply(private$.rowKeys, toJSON, USE.NAMES=FALSE)

            valueNames <- names(values)

            for (column in private$.columns) {
                if (column$name %in% valueNames)
                    column$addCell(values[[column$name]], .key=rowKey, .index=private$.rowCount)
                else
                    column$addCell(.key=rowKey, .index=private$.rowCount)
            }
        },
        addFormat=function(col, format, rowNo=NA, rowKey=NULL) {
            self$getCell(col=col, rowNo=rowNo, rowKey=rowKey)$addFormat(format)
        },
        setRow=function(values, rowNo=NA, rowKey=NULL) {

            if (is.na(rowNo)) {

                found <- FALSE

                for (rowNo in seq_along(private$.rowKeys)) {
                    if (base::identical(rowKey, private$.rowKeys[[rowNo]])) {
                        found <- TRUE
                        break()
                    }
                }

                if ( ! found)
                    reject("Table$setRow(): rowKey '{key}' not found", key=rowKey)

            } else if (rowNo > private$.rowCount) {
                reject('Table$setRow(): rowNo {rowNo} > No. rows ({rowCount})', rowNo=rowNo, rowCount=private$.rowCount)
            }

            valueNames <- names(values)

            for (column in private$.columns) {
                if (column$name %in% valueNames) {
                    value <- values[[column$name]]
                    if ( ! isValue(value))
                        reject("Table$setRow(): value '{}' is not atomic", code='error', column$name)
                    self$setCell(rowNo=rowNo, col=column$name, value)
                }
            }
        },
        getColumn=function(col) {
            column <- private$.columns[[col]]
            if (is.null(column))
                reject("Table$getColumn(): col '{col}' not found", col=col)

            column
        },
        setCell=function(col, value, rowNo=NA, rowKey=NULL) {
            if (is.na(rowNo)) {
                rowNo <- indexOf(rowKey, private$.rowKeys)
                if(is.na(rowNo))
                    reject("Table$setCell(): rowKey '{key}' not found", key=rowKey)

            } else if (rowNo > private$.rowCount) {
                reject('Table$setCell(): rowNo exceeds rowCount ({rowNo} > {rowCount})', rowNo=rowNo, rowCount=private$.rowCount)
            }

            column <- private$.columns[[col]]

            if (is.null(column))
                reject("Table$setCell(): col '{col}' not found", col=col)

            column$setCell(rowNo, value)
        },
        getCell=function(col, rowNo=NA, rowKey=NULL) {
            if (is.na(rowNo)) {
                rowNo <- indexOf(rowKey, private$.rowKeys)
                if(is.na(rowNo))
                    reject("Table$getCell(): rowKey '{key}' not found", key=rowKey)

            } else if (rowNo > private$.rowCount) {
                reject('Table$getCell(): rowNo exceeds rowCount ({rowNo} > {rowCount})', rowNo=rowNo, rowCount=private$.rowCount)
            }

            column <- private$.columns[[col]]

            if (is.null(column))
                reject("Table$getCell(): col '{col}' not found", col=col)

            column$getCell(rowNo)
        },
        getRows=function() {

            rows <- list()

            for (i in seq_len(private$.rowCount))
                rows[[i]] <- self$getRow(i)

            rows
        },
        getRow=function(rowNo=NA, rowKey=NULL) {
            if (is.na(rowNo)) {
                rowNo <- indexOf(rowKey, private$.rowKeys)
                if(is.na(rowNo))
                    reject("Table$getRow(): rowKey '{key}' not found", key=rowKey)

            } else if (rowNo > private$.rowCount) {
                reject('Table$getRow(): rowNo exceeds rowCount ({rowNo} > {rowCount})', rowNo=rowNo, rowCount=private$.rowCount)
            }

            values <- list()
            for (column in private$.columns)
                values[[column$name]] <- column$getCell(rowNo)
            values
        },
        addFootnote=function(col, note, rowNo=NA, rowKey=NULL) {
            private$.footnotesUpdated <- FALSE
            self$getCell(col=col, rowNo=rowNo, rowKey=rowKey)$addFootnote(note)
        },
        addSymbol=function(col, symbol, rowNo=NA, rowKey=NULL) {
            self$getCell(col=col, rowNo=rowNo, rowKey=rowKey)$addSymbol(symbol)
        },
        setNote=function(key, note, init=TRUE) {

            if (is.null(note)) {
                private$.notes[[key]] <- NULL
            } else if (is.character(note)) {
                note <- self$options$translate(note)
                private$.notes[[key]] <- Note$new(key, note[1], init)
            } else {
                stop('Table$setNote(): note must be a character vector', call.=FALSE)
            }
        },
        setSortKeys=function(col, keys) {
            column <- private$.columns[[col]]
            if (is.null(column))
                reject("Table$setSortKeys(): col '{col}' not found", col=col)
            column$setSortKeys(keys)
        },
        .widthWidestCellInRow=function(row) {

            maxWidthWOSup <- 0
            maxSupInRow <- 0  # widest superscripts

            for (column in private$.columns) {
                if (column$visible) {
                    cell <- column$getCell(row)
                    measurements <- measureElements(list(cell))
                    widthWOSup <- measurements$width - measurements$supwidth
                    maxWidthWOSup <- max(maxWidthWOSup, widthWOSup)
                    maxSupInRow <- max(maxSupInRow, measurements$supwidth)
                }
            }

            list(width=maxWidthWOSup + maxSupInRow, supwidth=maxSupInRow)
        },
        .widthWidestHeader=function() {
            width <- 0

            for (column in private$.columns) {
                if (column$visible)
                    width <- max(width, nchar(column$title))
            }

            width
        },
        asString=function(.folded=FALSE) {

            if ( ! .folded)
                return(fold(self)$asString(.folded=TRUE))

            private$.updateFootnotes()

            pieces <- character()

            pieces <- c(pieces, self$.titleForPrint())
            pieces <- c(pieces, self$.headerForPrint())
            i <- 1

            if ( ! private$.swapRowsColumns) {

                for (i in seq_len(private$.rowCount))
                    pieces <- c(pieces, self$.rowForPrint(i))

            } else {

                for (i in seq_along(private$.columns)) {
                    if (i == 1)
                        next()  # the first is already printed in the header
                    if (private$.columns[[i]]$visible)
                        pieces <- c(pieces, self$.rowForPrint(i))
                }
            }

            pieces <- c(pieces, self$.footerForPrint())
            pieces <- c(pieces, '\n')

            v <- paste0(pieces, collapse='')
            v
        },
        .titleForPrint=function() {

            pieces <- character()

            w <- nchar(self$title)
            wid <- self$width
            padright <- repstr(' ', wid - w)

            pieces <- c(pieces, '\n')
            pieces <- c(pieces, private$.marstr, self$title, padright, private$.marstr, '\n')
            pieces <- c(pieces, private$.marstr, repstr('\u2500', wid), private$.marstr, '\n')

            paste0(pieces, collapse='')
        },
        .headerForPrint=function() {

            pieces <- character()

            wid <- self$width
            pieces <- c(pieces, private$.marstr)

            if ( ! private$.swapRowsColumns) {

                for (column in private$.columns) {
                    if (column$visible)
                        pieces <- c(pieces, private$.padstr, column$.titleForPrint(), private$.padstr)
                }

            } else {

                column <- private$.columns[[1]]

                pieces <- c(pieces, private$.padstr, spaces(self$.widthWidestHeader()), private$.padstr)

                for (i in seq_len(private$.rowCount)) {
                    text <- paste(column$getCell(i)$value)
                    rowWidth <- self$.widthWidestCellInRow(i)$width
                    w <- nchar(text)
                    pad <- spaces(max(0, rowWidth - w))

                    pieces <- c(pieces, private$.padstr, text, pad, private$.padstr)
                }
            }

            pieces <- c(pieces, private$.marstr, '\n')

            pieces <- c(pieces, private$.marstr, repstr('\u2500', wid), private$.marstr, '\n')

            paste0(pieces, collapse='')
        },
        .footerForPrint=function() {

            pieces <- character()

            wid <- self$width

            pieces <- c(private$.marstr, repstr('\u2500', wid), private$.marstr, '\n')

            for (note in private$.notes) {

                text <- paste0('Note. ', note$note)

                lines <- strwrap(text,
                    width=(wid-private$.padding),
                    indent=private$.margin + private$.padding,
                    exdent=private$.margin + private$.padding)

                paragraph <- paste(lines, collapse='\n')
                pieces <- c(pieces, paragraph, '\n')
            }

            private$.updateFootnotes()

            for (i in seq_along(private$.footnotes)) {

                note <- paste0(.SUPCHARS[i], ' ', private$.footnotes[i])

                lines <- strwrap(note,
                    width=(wid-private$.padding),
                    indent=private$.margin + private$.padding,
                    exdent=private$.margin + private$.padding)

                paragraph <- paste(lines, collapse='\n')
                pieces <- c(pieces, paragraph, '\n')
            }

            paste0(pieces, collapse='')
        },
        .rowForPrint=function(i) {

            pieces <- character()

            pieces <- c(pieces, private$.marstr)

            if ( ! private$.swapRowsColumns) {

                for (column in private$.columns) {
                    if (column$visible) {
                        width <- column$width
                        pieces <- c(pieces, private$.padstr, column$.cellForPrint(i, width=width), private$.padstr)
                    }
                }

            } else {

                column <- private$.columns[[i]]

                width <- self$.widthWidestHeader()

                pieces <- c(pieces, private$.padstr, column$.titleForPrint(width), private$.padstr)

                for (j in seq_along(column$cells)) {
                    widest <- self$.widthWidestCellInRow(j)
                    width <- widest$width
                    supwidth <- widest$supwidth

                    cell <- column$cells[[j]]
                    measurements <- measureElements(list(cell))
                    measurements$width <- max(measurements$width, width)
                    measurements$supwidth  <- supwidth

                    pieces <- c(pieces, private$.padstr, column$.cellForPrint(j, measurements), private$.padstr)
                }

            }

            pieces <- c(pieces, private$.marstr, '\n')

            paste0(pieces, collapse='')
        },
        fromProtoBuf=function(element, oChanges, vChanges) {

            someChanges <- length(oChanges) > 0 || length(vChanges) > 0
            if (someChanges && base::identical('*', private$.clearWith))
                return()

            if (base::any(oChanges %in% private$.clearWith))
                return()

            for (clearName in private$.clearWith) {
                if (base::any(vChanges %in% private$.options$option(clearName)$vars))
                    return()
            }

            bound <- self$getBoundVars(private$.rowsExpr)
            changes <- vChanges[vChanges %in% bound]

            super$fromProtoBuf(element, oChanges, vChanges)

            tablePB <- element$table
            columnsPB <- tablePB$columns

            # we populate the protobuf cells into a list, because it leads to a
            # significant performance improvement

            cells <- list()

            columnPBIndicesByName <- list()

            for (i in seq_along(columnsPB)) {
                columnPB <- columnsPB[[i]]
                columnPBname <- columnPB$name
                columnPBIndicesByName[[columnPBname]] <- i
                cellsPB <- columnPB$cells
                colCells <- list()
                for (j in seq_along(cellsPB))
                    colCells[[j]] <- cellsPB[[j]]
                cells[[i]] <- colCells
            }

            for (i in seq_along(private$.rowNames)) {
                rowName <- private$.rowNames[[i]]
                rowKey <- private$.rowKeys[[i]]

                keyElems <- unlist(rowKey, use.names=FALSE)
                if (any(keyElems %in% changes))
                    next()

                tablePBrowNames <- tablePB$rowNames
                fromRowIndex <- indexOf(rowName, tablePBrowNames)

                if ( ! is.na(fromRowIndex)) {

                    for (j in seq_along(private$.columns)) {

                        toCol <- private$.columns[[j]]
                        toCell <- toCol$getCell(i)
                        colName <- toCol$name
                        fromColIndex <- columnPBIndicesByName[[colName]]

                        if ( ! is.null(fromColIndex)) {
                            fromCell <- cells[[fromColIndex]][[fromRowIndex]]
                            toCell$fromProtoBuf(fromCell)
                        }
                    }
                }
            }

            for (note in tablePB$notes) {
                if ( ! note$init)
                    self$setNote(note$key, note$note, note$init)
            }
        },
        asProtoBuf=function(incAsText=FALSE, status=NULL, includeState=TRUE) {

            table <- RProtoBuf_new(jamovi.coms.ResultsTable)

            for (column in private$.columns)
                table$add('columns', column$asProtoBuf())

            table$rowNames <- private$.rowNames
            table$swapRowsColumns <- private$.swapRowsColumns
            table$rowSelect <- substring(private$.rowSelect, 2, nchar(private$.rowSelect)-1)
            table$rowSelected <- self$rowSelected - 1

            for (note in private$.notes) {
                notePB <- RProtoBuf_new(
                    jamovi.coms.ResultsTableNote,
                    key=note$key,
                    note=note$note,
                    init=note$init)
                table$add('notes', notePB)
            }

            if ( ! identical(private$.sortSelect, '')) {
                sortSelect <- substring(private$.sortSelect, 2, nchar(private$.sortSelect)-1)
                table$sortSelect <- sortSelect
                sort <- self$sortSelected
                if ( ! identical(sort$sortBy, '')) {
                    sortPB <- RProtoBuf_new(
                        jamovi.coms.Sort,
                        sortBy=sort$sortBy,
                        sortDesc=sort$sortDesc)
                    table$sortSelected <- sortPB
                }
            }

            element <- super$asProtoBuf(incAsText=incAsText, status=status, includeState=includeState)
            element$table <- table
            element
        }
    )
)

#' @export
as.data.frame.Table <- function(x, row.names, optional, ...) {

    df <- data.frame()
    names <- character()

    for (column in x$columns) {
        if ( ! column$visible)
            next()
        names <- c(names, column$name)
        values <- unlist(as.list(column), use.names=FALSE)
        if (is.null(values))
            values <- character()
        if (ncol(df) == 0) {
            df <- data.frame(values)
        } else {
            df <- cbind(df, values)
        }
    }

    colnames(df) <- names
    rownames(df) <- x$names

    df
}

#' @export
#' @importFrom utils .DollarNames
.DollarNames.Table <- function(x, pattern = '') {
    names <- ls(x, all.names=F, pattern = pattern)
    retain <- c('asDF', 'asString')
    names <- intersect(names, retain)
    names
}
