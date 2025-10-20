
#' Constants to specify formatting of Table cells
#'
#' Cell.BEGIN_GROUP adds spacing above a cell
#'
#' Cell.END_GROUP add spacing below a cell
#'
#' Cell.BEGIN_END_GROUP add spacing above and below a cell
#'
#' Cell.NEGATIVE specifies that the cells contents is negative
#'
#' @examples
#' \dontrun{
#'
#' table$addFormat(rowNo=1, col=1, Cell.BEGIN_END_GROUP)
#' }
#'
#' @export
Cell.BEGIN_GROUP <- 1

#' @rdname Cell.BEGIN_GROUP
#' @export
Cell.END_GROUP   <- 2

#' @rdname Cell.BEGIN_GROUP
#' @export
Cell.BEGIN_END_GROUP <- 3

#' @rdname Cell.BEGIN_GROUP
#' @export
Cell.NEGATIVE <- 4

#' @rdname Cell.BEGIN_GROUP
#' @export
Cell.INDENTED <- 8

Cell <- R6::R6Class(
    "Cell",
    active=list(
        isEmpty=function() {
            self$isNotFilled()
        }),
    public=list(
        value=NA,
        footnotes=character(),
        sups=integer(),
        symbols=character(),
        format=0,
        sortKey=0,
        initialize=function(v=NA) {
            self$value <- v
        },
        setValue=function(v) {
            self$value <- v
            self$footnotes <- character()
            self$symbols <- character()
        },
        isNotFilled=function() {
            v <- self$value
            if (is.null(v))
                return(TRUE)
            if (is.nan(v))
                return(FALSE)
            if (is.na(v))
                return(TRUE)
            return(FALSE)
        },
        isFilled=function() {
            ! self$isNotFilled()
        },
        addFootnote=function(note) {
            self$footnotes <- c(self$footnotes, note)
        },
        addFormat=function(format) {
            self$format <- bitwOr(self$format, format)
        },
        addSymbol=function(symbol) {
            self$symbols <- c(self$symbols, symbol)
        },
        fromProtoBuf=function(cellPB) {

            if (cellPB$has('i')) {
                self$value <- cellPB$i
            } else if (cellPB$has('d')) {
                self$value <- cellPB$d
            } else if (cellPB$has('s')) {
                self$value <- cellPB$s
            } else if (cellPB$has('o')) {
                if (cellPB$o == jamovi.coms.ResultsCell.Other$MISSING)
                    self$value <- NA
                else
                    self$value <- NaN
            }

            self$footnotes <- cellPB$footnotes
            self$symbols <- cellPB$symbols
            self$sortKey <- cellPB$sortKey
        },
        asProtoBuf=function() {

            cell <- RProtoBuf_new(jamovi.coms.ResultsCell,
                        footnotes = self$footnotes,
                        symbols = self$symbols,
                        format = self$format,
                        sortKey = self$sortKey)

            v <- self$value

            if (length(v) != 1) {
                cell$o <- jamovi.coms.ResultsCell.Other$MISSING
            }
            else if (inherits(v, "numeric")) {
                cell$d <- v
            }
            else if (is.na(v)) {
                if (is.nan(v))
                    cell$d <- NaN
                else
                    cell$o <- jamovi.coms.ResultsCell.Other$MISSING
            }
            else if (inherits(v, "integer")) {
                cell$i <- v
            }
            else if (inherits(v, "character")) {
                cell$s <- v
            }
            else {
                cell$o <- jamovi.coms.ResultsCell.Other$NOT_A_NUMBER
            }

            cell
        }))
