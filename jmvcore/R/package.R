
#' @section Number formatting:
#' Numbers in results tables are formatted as jamovi formats them: each
#' column is given enough decimal places for its smallest value to have the
#' required number of significant figures, p-values are given to a fixed
#' number of decimal places (and smaller ones are shown as `< .001`), and
#' integers are shown as they are.
#'
#' This is set with the `jmvcore.format` option, a list of:
#'
#' - `style`: `'sf'` (significant figures) or `'dp'` (decimal places), for
#'   values. Default `'sf'`
#' - `digits`: how many, for values. Default 4
#' - `pStyle`: `'sf'` or `'dp'`, for p-values. Default `'dp'`
#' - `pDigits`: how many, for p-values. Default 3
#'
#' Any of these may be given, and the rest take their defaults. Setting the
#' option replaces any earlier setting, rather than adding to it. The
#' defaults are jamovi's, but with a significant figure more for values
#' (`digits=3` gives jamovi's own formatting).
#'
#' The decimal symbol is taken from R's `OutDec` option.
#'
#' @section Quarto and R Markdown:
#' When a document is knitted to html, results are rendered as html, as
#' jamovi exports them: tables, headings, notes and plots. Other output
#' formats get the same text as the console.
#'
#' A chunk may set its own number format, over `jmvcore.format`, with the
#' `jmv-format` chunk option:
#'
#' ```
#' #| jmv-format: {digits: 5}
#' jmv::ttestIS(ToothGrowth, vars='len', group='supp')
#' ```
#'
#' @examples
#' \dontrun{
#' # 5 significant figures, and p-values to 4 decimal places
#' options(jmvcore.format=list(digits=5, pDigits=4))
#'
#' # jamovi's own formatting
#' options(jmvcore.format=list(digits=3))
#'
#' # back to the defaults
#' options(jmvcore.format=NULL)
#' }
#'
#' @md
#' @import R6
"_PACKAGE"
