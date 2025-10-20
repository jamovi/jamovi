
.i18n <- new.env()

#' Designate string as translated
#' @param text the string to translate
#' @param n the number (if applicable) for pluralisation
#' @export
. <- function(text, n=1) {
    self <- eval.parent(str2lang('self'))
    self$options$translate(text, n)
}

#' Designate string as client-side translated
#' @param format a format string
#' @param values a string or named list of strings to substitute
#' @export
.. <- function(format, values=NULL) {
    paste0(format, '\u0004',
        `if`(is.null(values), NULL, jsonlite::toJSON(values, auto_unbox=TRUE)))
}

Translator <- R6Class('Translator',
    private=list(
        .table=NA,
        .usingFastMap=NA
    ),
    public=list(
        initialize=function(langDef) {
            if (requireNamespace('fastmap', quietly=TRUE)) {
                private$.table <- fastmap::fastmap()
                if (length(langDef) > 0) {
                    messages <- langDef$locale_data$messages
                    messages <- messages[names(messages) != ""]
                    private$.table$mset(.list=messages)
                }
                private$.usingFastMap <- TRUE
            } else {
                if (length(langDef) == 0) {
                    private$.table <- list()
                } else {
                    private$.table <- langDef$locale_data$messages
                }
                private$.usingFastMap <- FALSE
            }
        },
        get=function(text, n) {
            if (private$.usingFastMap) {
                return(private$.table$get(text))
            } else {
                return(private$.table[[text]])
            }
        },
        translate=function(text, n=1) {
            if (is.null(text) || text == '')
                return(text)
            result <- self$get(text, n)
            if ( ! is.null(result)) {
                result <- result[[1]]
                if (result != '')
                    text <- result
            } else {
                # if not found, there could be context
                match <- regexec('(.*) \\[(.*)\\]', text)[[1]]
                if (match[1] != -1) {
                    # separate the text from the context
                    context <- substring(text, match[3], match[3] + attr(match, 'match.length')[3] - 1)
                    text <- substring(text, match[2], match[2] + attr(match, 'match.length')[2] - 1)
                    key <- paste0(context, '\u0004', text)
                    # try context+text
                    result <- self$get(key, n)
                    if ( ! is.null(result)) {
                        result <- result[[1]]
                        if (result != '')
                            text <- result
                    } else {
                        # try text without the context
                        result <- self$get(text)
                        if ( ! is.null(result)) {
                            result <- result[[1]]
                            if (result != '')
                                text <- result
                        }
                    }
                }
            }
            text
        }
    )
)

createTranslator <- function(package, code='en') {

    if (package %in% names(.i18n)) {
        packageEnv <- .i18n[[package]]
    } else {
        .i18n[[package]] <- packageEnv <- new.env()
    }

    if (code == 'C')
        code <- 'en'

    code2 = substring(code, 1, 2)

    if (code %in% names(packageEnv)) {
        langDef <- packageEnv[[code]]
    } else if (code2 %in% names(packageEnv)) {
        langDef <- packageEnv[[code2]]
    } else {
        path <- system.file(sprintf('i18n/%s.json', code), package=package)
        path2 <- system.file(sprintf('i18n/%s.json', code2), package=package)
        if (path != '') {
            langDef <- packageEnv[[code]] <- jsonlite::read_json(path)
        } else if (path2 != '') {
            langDef <- packageEnv[[code2]] <- jsonlite::read_json(path2)
        } else {
            langDef <- packageEnv[[code2]] <- list()  # not available
        }
    }

    Translator$new(langDef)
}
