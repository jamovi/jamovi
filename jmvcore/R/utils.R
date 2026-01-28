
.SUPCHARS <- c("\u1D43", "\u1D47", "\u1D48", "\u1D49", "\u1DA0", "\u1D4D", "\u02B0", "\u2071",
               "\u02B2", "\u1D4F", "\u02E1", "\u1D50", "\u207F", "\u1D52", "\u1D56", "\u02B3", "\u02E2",
               "\u1D57", "\u1D58", "\u1D5B", "\u02B7", "\u02E3", "\u02B8", "\u1DBB")

ignore <- function(...) {
    if (length(args) > 0)
        warning(paste(paste0("Ignoring argument '", names(list(...)),"'"), collapse='\n'))
}

dontTry <- function(expr, ...) {
    eval(expr)
}

#' @importFrom utils head
tryStack <- function(expr, silent=FALSE) {
    byref <- new.env()
    result <- try(withCallingHandlers(
        expr,
        error=function(e) {
            stack <- sys.calls()
            stack <- stack[-(1:8)]
            for (i in seq_along(stack)) {
                call <- stack[i]
                if (startsWith(call, 'withCallingHandlers(expr, error = function(e) {')) {
                    stack <- stack[-(1:i)]
                    break()
                }
            }
            stack <- utils::head(stack, -2)
            stack <- paste(stack, collapse='\n')
            stack <- paste0(as.character(e), '\n', stack)
            byref$stack <- stack
        })
    , silent=silent)
    if (isError(result)) {
        attr(result, 'stack') <- byref$stack
    }
    result
}

isValue <- function(value) {
    if (is.null(value))
        return(TRUE)
    if ( ! is.atomic(value))
        return(FALSE)
    if (length(value) == 1)
        return(TRUE)
    return(FALSE)
}

isString <- function(value) {
    (is.character(value) && length(value) == 1)
}

#' @rdname reject
#' @export
createError <- function(formats, code=NULL, ...) {

    message <- format(formats[1], ...)
    error <- simpleError(message)

    for (name in names(formats)) {

        if (name != "") {
            message <- format(formats[[name]], ...)
            error[[name]] <- message
        }
    }

    error$code <- code
    error
}

#' Determine if an object is an error
#'
#' @param object the object to test
#' @return TRUE if the object is an error
#' @export
isError <- function(object) {
    base::inherits(object, 'try-error') || base::inherits(object, 'error')
}

#' try an expression, and return NaN on failure
#'
#' if the expression fails, NaN is returned silently
#'
#' @param expr an expression to evaluate
#' @return the result, or NaN on failure
#' @export
tryNaN <- function(expr) {
    result <- try(expr, silent=TRUE)
    if (base::inherits(result, 'try-error'))
        return(NaN)
    result
}

#' Create and throw errors
#'
#' These functions are convenience functions for creating and throwing errors.
#' @param formats a format string which is passed to \code{\link{format}}
#' @param code an error code
#' @param ... additional arguments passed to \code{\link{format}}
#' @export
reject <- function(formats, code=NULL, ...) {
    stop(createError(formats, code, ...))
}

#' @rdname decomposeTerm
#' @export
composeTerm <- function(components) {

    # handle ~1, ~0
    if (length(components) == 1 &&
        is.numeric(components) &&
        (components == 1 || components == 0))
            return(as.character(components))

    components <- as.character(components)
    uniques <- unique(components)
    counts <- integer(length(uniques))
    names(counts) <- uniques
    for (component in components)
        counts[component] <- counts[component] + 1

    components <- sapply(uniques, function(component) {
        if (make.names(component) != component) {
            component <- gsub('\\', '\\\\', component, fixed=TRUE)
            component <- gsub('`', '\\`', component, fixed=TRUE)
            component <- paste0('`', component, '`')
        }
        component
    }, USE.NAMES=FALSE)

    for (i in seq_along(components)) {
        count <- counts[i]
        if (count != 1)
            components[[i]] <- paste0('I(', components[[i]], '^', count, ')')
    }

    term <- paste0(components, collapse=':')
    term
}

#' @rdname decomposeTerm
#' @export
composeTerms <- function(listOfComponents) {
    sapply(listOfComponents, composeTerm, USE.NAMES=FALSE)
}

#' Compose and decompose interaction terms to and from their components
#'
#' @param components a character vectors of components
#' @param listOfComponents a list of character vectors of components
#' @param term a string with components separated with colons
#' @param terms a character vector of components separated with colons
#'
#' @examples
#' composeTerm(c('a', 'b', 'c'))
#' # 'a:b:c'
#'
#' composeTerm(c('a', 'b', 'with space'))
#' # 'a:b:`with space`'
#'
#' decomposeTerm('a:b:c')
#' # c('a', 'b', 'c')
#'
#' decomposeTerm('a:b:`with space`')
#' # c('a', 'b', 'with space')
#'
#' @export
decomposeTerm <- function(term) {

    chars <- strsplit(term, '')[[1]]
    components <- character()
    componentChars <- character()
    inQuote <- FALSE
    inI <- FALSE
    isExp <- FALSE
    componentInProgress <- TRUE

    i <- 1
    n <- length(chars)

    while (i <= n) {
        char <- chars[i]
        if (char == '`') {
            inQuote <- ! inQuote
        }
        else if (inQuote == FALSE && char == 'I' && (i + 1 <= n) && chars[i + 1] == '(') {
            inI <- TRUE
            i <- i + 1
        }
        else if (inQuote == FALSE && inI == TRUE && (char == ')' || char == ':')) {
            if (char == ')')
                inI <- FALSE
            if (isExp) {
                prev <- component
                component <- paste0(componentChars, collapse='')
                exp <- as.numeric(component)
                if (exp > 1) {
                    component <- rep(prev, exp-1)
                    components <- c(components, component)
                }
                componentChars <- character()
                componentInProgress <- FALSE
                isExp <- FALSE
            }
        }
        else if (inQuote == FALSE && inI == TRUE && char == '^') {
            component <- paste0(componentChars, collapse='')
            components <- c(components, component)
            componentChars <- character()
            isExp <- TRUE
        }
        else if (char == '\\') {
            i <- i + 1
            char <- chars[i]
            componentChars <- c(componentChars, char)
        }
        else if (char == ':' && inQuote == FALSE) {
            if (componentInProgress) {
                if (isExp)
                    prev <- component
                component <- paste0(componentChars, collapse='')
                components <- c(components, component)
            }
            componentChars <- character()
            isExp <- FALSE
            componentInProgress <- TRUE
        }
        else {
            componentChars <- c(componentChars, char)
            componentInProgress <- TRUE
        }
        i <- i + 1
    }

    if (componentInProgress) {
        component <- paste0(componentChars, collapse='')
        components <- c(components, component)
    }

    components
}

#' @rdname decomposeTerm
#' @export
decomposeTerms <- function(terms) {
    decomposed <- list()
    for (i in seq_along(terms))
        decomposed[[i]] <- decomposeTerm(terms[[i]])
    decomposed
}

#' Decompose a formula
#' @param formula the formula to decompose
#' @return a list of lists of the formulas components
#' @export
decomposeFormula <- function(formula) {

    chars <- as.character(formula)
    term  <- chars[length(chars)]

    chars <- strsplit(term, '')[[1]]
    components <- character()
    componentChars <- character()
    inQuote <- FALSE

    i <- 1
    n <- length(chars)

    while (i <= n) {
        char <- chars[i]
        if (char == '`') {
            inQuote <- ! inQuote
            componentChars <- c(componentChars, '`')
        }
        else if (char == '\\') {
            i <- i + 1
            char <- chars[i]
            componentChars <- c(componentChars, '\\', char)
        }
        else if ((char == '*' || char == '+' || char == ' ') && inQuote == FALSE) {
            component <- paste0(componentChars, collapse='')
            if (nchar(component) > 0)  # skip empty strings
                components <- c(components, component)
            componentChars <- character()
        }
        else {
            componentChars <- c(componentChars, char)
        }
        i <- i + 1
    }

    component <- paste0(componentChars, collapse='')
    if (nchar(component) > 0)  # skip empty strings
        components <- c(components, component)

    decomposeTerms(components)
}

#' @importFrom rlang enquo
#' @export
rlang::enquo

#' Evaluates a quosure
#' This is intended for use by classes overriding Analysis
#' @param quo the quosure to evaluate
#' @return the value of the quosure
#' @export
resolveQuo <- function(quo) {
    if (rlang::is_null(quo))
        return(NULL)
    if (rlang::quo_is_call(quo)) {
        asc <- as.character(rlang::quo_get_expr(quo))
        if (asc[1] == 'c' || asc[1] == 'vars')
            return(asc[-1])
    }
    if (rlang::quo_is_symbol(quo)) {
        return(rlang::quo_name(quo))
    }
    return(rlang::eval_tidy(quo))
}

#' Converts a term into a string
#'
#' Converts a term (a vector of components) into a string for display purposes
#'
#' @param components a character vector of components
#' @param sep a separator to go between the components
#' @param raise whether duplicates should be raised to powers
#' @return the components joined together into a string for disply
#' @examples
#' stringifyTerm(c('a', 'b', 'c'))
#'
#' # "a:b:c"
#'
#' stringifyTerm(c('a', 'b', 'c'), sep=' * ')
#'
#' # "a * b * c"
#'
#' options('jmvTermSep', ' * ')
#' stringifyTerm(c('a', 'b', 'c'))
#'
#' # "a * b * c"
#'
#' #' stringifyTerm(c('`quoted`', 'b', 'c'))
#'
#' # "quoted * b * c"
#'
#' @export
stringifyTerm <- function(components, sep=getOption('jmvTermSep', ':'), raise=FALSE) {

    POWER_SUPS <- c('', '\u00B2', '\u00B3', '\u2074', '\u2075',
                    '\u2076', '\u2077', '\u2078', '\u2079')

    if (raise) {
        components <- unlist(components)
        uniques <- unique(components)
        counts <- integer(length(uniques))
        names(counts) <- uniques
        for (component in components)
            counts[component] <- counts[component] + 1
        components <- uniques
    }

    components <- sapply(components, function(x) {
        if (startsWith(x[1], '`') && endsWith(x[1], '`')) {
            x <- substring(x, 2, nchar(x)-1)
            x <- gsub('`', '\\`', x, fixed=TRUE)
        }
        x
    })

    if (raise) {
        components <- paste0(components, POWER_SUPS[counts])
    }

    term <- paste(components, collapse=sep)

    term
}

readTextFile <- function(...) {
    ch <- readChar(paste0(..., collapse=''), nchars=1e6)
    ch
}

unquote <- function(string) {
    n <- nchar(string)
    if (n < 2)
        return(string)

    if (substring(string, 1, 1) == '"' && substring(string, n, n) == '"')
        string <- substring(string, 2, n-1)

    string
}

columnType <- function(column) {

    if (inherits(column, "ordered")) {
        return("ordinal")
    } else if (inherits(column, "factor")) {
        return("nominal")
    } else {
        return("continuous")
    }
}

columnTypeRDescription <- function(column) {

    if (is.ordered(column)) {
        return("an ordered factor")
    } else if (is.factor(column)) {
        return("a factor")
    } else {
        return("numeric")
    }
}

cap1st <- function(s) {
    paste0(toupper(substring(s,1,1)), substring(s, 2))
}

#' Format a string with arguments
#'
#' Substitutes the arguments into the argument str. See the examples below.
#'
#' @param str the format string
#' @param ... the arguments to substitute into the string
#' @param context 'normal' or 'R'
#' @return the resultant string
#'
#' @examples
#'
#' jmvcore::format('the {} was delish', 'fish')
#'
#' # 'the fish was delish'
#'
#' jmvcore::format('the {} was more delish than the {}', 'fish', 'cow')
#'
#' # 'the fish was more delish than the cow'
#'
#' jmvcore::format('the {1} was more delish than the {0}', 'fish', 'cow')
#'
#' # 'the cow was more delish than the fish'
#'
#' jmvcore::format('the {what} and the {which}', which='fish', what='cow')
#'
#' # 'the cow and the fish'
#'
#' jmvcore::format('that is simply not {}', TRUE)
#'
#' # 'that is simply not true'
#'
#' jmvcore::format('that is simply not {}', TRUE, context='R')
#'
#' # 'that is simply not TRUE'
#'
#' @export
format <- function(str, ..., context="normal") {

    args <- list(...)

    for (name in names(args)) {
        value <- args[[name]]
        if (grepl("^\\..+", name)[1]) {
            name <- sub(".", "$", name, fixed=TRUE)
            str  <- gsub(name, value[1], str, fixed=TRUE)
        }
    }

    if (grepl("{}", str, fixed=TRUE)[1]) {

        for (token in args)
            str <- sub("{}", stringify(token, context), str, fixed=TRUE)

    } else {

        if (grepl("\\{[0-9]+\\}", str)[1]) {

            i <- 0
            for (token in args) {
                str <- gsub(paste0("{", i, "}"), stringify(token, context), str, fixed=TRUE)
                i <- i + 1
            }

        }
        if (grepl("\\{ *[A-Za-z][A-Za-z0-9]* *\\}", str)[1]) {

            match <- regexec('\\$?\\{ *([A-Za-z][A-Za-z0-9]*) *\\}', str)[[1]]
            while (match[1] != -1) {
                name   <- substring(str, match[2], match[2] + attr(match, 'match.length')[2] - 1)
                before <- substring(str, 1, match[1] - 1)
                after  <- substring(str, match[1] + attr(match, 'match.length')[1])
                if (name %in% names(args)) {
                    value <- args[[name]]
                    if (length(value) == 0) {
                        value <- '\u2026'
                    } else {
                        value <- stringify(args[[name]], context)
                    }
                } else {
                    value <- '\u2026'
                }
                str <- paste0(before, value, after)
                match <- regexec('\\{ *([A-Za-z][A-Za-z0-9]*?) *\\}', str)[[1]]
            }
        }
    }

    str
}

spaces <- function(n) {
    s <- ''
    if (n > 0)
        s <- paste(rep(' ', n), collapse='')
    s
}

dotPos <- function(x) {
    floor(log10(x))
}

nDigits <- function(x, negSign=TRUE) {

    # calcs no. digits before the decimal point

    n <- 1

    if (x > 1) {
        n <- base::floor(base::log10(x)) + 1
    } else if (x < -1) {
        n <- base::floor(base::log10(abs(x))) + 1
    }

    if (x < 0 && negSign)
        n <- n + 1

    n
}

measureElements <- function(elems, maxdp=Inf, type='number', p=FALSE, zto=FALSE, pc=FALSE) {

    sf  <- getOption('digits')
    scl <- 1e-3
    sch <- 1e+7

    # non-scientific
    dp <- 0
    maxns <- 0   # max
    minns <- 0

    # scientific
    maxexp <- 0  # max scientific exponent
    minexp <- 0  # min scientific exponent
    negman <- FALSE  # are any of the mantissas negative

    # string
    maxstr <- 0

    maxsupwidth <- 0  # max superscripts width

    if (zto) {
        dp <- sf
        maxdp <- sf
        scl <- 0
        sch <- Inf
    }

    if (pc) {
        dp <- sf - 2
        maxdp <- sf - 2
        scl <- 0
        sch <- Inf
        maxns <- 100
    }

    for (elem in elems) {

        sups <- integer()

        if (inherits(elem, "Cell")) {
            sups <- elem$sups
            elem <- elem$value
        }

        if (is.null(elem)) {

            maxstr <- max(maxstr, 1)  # width of '.'

        } else if (length(elem) == 0) {

            maxstr <- max(maxstr, nchar(utils::capture.output(elem)))

        } else if (is.nan(elem)) {

            maxstr <- max(maxstr, 3)  # width of 'NaN'

        } else if (is.na(elem)) {

            # do nothing

        } else if (is.infinite(elem)) {

            maxstr <- max(maxstr, 4)  # width of '-Inf'

        } else if (inherits(elem, "character")) {

            maxstr <- max(maxstr, nchar(elem))

        } else if ( ! is.numeric(elem)) {

            maxstr <- 2 + nchar(class(elem)[1])

        } else if (p && elem < (10^-sf) && elem >= 0.0) {

            maxstr <- max(maxstr, sf + 3)

        } else if (elem == 0) {

            if (is.integer(elem))
                dp <- max(dp, 0)
            else
                dp <- max(dp, sf-1)

        } else if (abs(elem) > scl && abs(elem) < sch) {

            # non-scientific values

            if (pc)
                elem <- elem * 100

            if (is.integer(elem))
                dp <- max(dp, 0)
            else
                dp <- max(dp, (sf - floor(log10(abs(elem))) - 1))

            maxns <- max(maxns, elem)
            minns <- min(minns, elem)

        } else {

            # scientific values

            if (pc)
                elem <- elem * 100

            exp <- floor(log10(abs(elem)))
            man <- elem / (10 ^ exp)

            maxexp <- max(maxexp, exp)
            minexp <- min(minexp, exp)
            if (man < 0)
                negman <- TRUE
        }

        if (length(sups) > 0)
            maxsupwidth <- max(maxsupwidth, 1 + length(sups))
    }

    maxnsw <- nDigits(maxns)
    minnsw <- nDigits(minns)

    nswidth <- max(maxnsw, minnsw)  # non-scientific width

    dp <- min(maxdp, dp)
    if (dp > 0)
        nswidth <- nswidth + 1 + dp # add a decimal point

    swidth <- 0  # scientific width
    expwidth <- 0

    if (maxexp > 0 || minexp < 0) {

        expwidth <- max(nDigits(maxexp), nDigits(minexp, negSign=FALSE)) + 2  # +2 for the e and the sign
        manwidth <- sf + 1  # sf + room for a decimal point
        if (negman)
            manwidth <- manwidth + 1  # add room for a minus sign

        swidth <- manwidth + expwidth
    }

    width <- max(swidth, nswidth, maxstr)
    width <- width + maxsupwidth

    list(sf=sf, dp=dp, width=width, expwidth=expwidth, supwidth=maxsupwidth)
}

formatElement <- function(elem, w=NULL, expw=NULL, supw=0, dp=2, sf=3, scl=1e-3, sch=1e7, type='number', p=FALSE, zto=FALSE, pc=FALSE) {

    sups <- integer()
    supspad <- ''

    if (inherits(elem, "Cell")) {
        sups <- elem$sups
        elem <- elem$value

        if (is.null(w) == FALSE)
            w <- w - supw
        thissupw <- length(sups)
        if (thissupw > 0)
            thissupw <- thissupw + 1  # add 1 for the space

        supspad <- repstr(' ', supw - thissupw)
    }

    if (is.null(elem)) {

        padstr <- spaces(max(w - 1, 0))
        str <- paste0(".", padstr)

    } else if (length(elem) == 0) {

        str <- utils::capture.output(elem)
        padstr <- spaces(max(w - nchar(str), 0))
        str <- paste0(str, padstr)

    } else if (is.nan(elem)) {

        padstr <- spaces(max(w - 3, 0))
        str <- paste0(padstr, "NaN")

    } else if (is.na(elem)) {

        if (is.null(w))
            str <- ''
        else
            str <- repstr(' ', w)

    } else if (is.infinite(elem)) {

        if (elem > 0) {
            padstr <- spaces(max(w - 3, 0))
            str <- paste0(padstr, "Inf")
        }
        else {
            padstr <- spaces(max(w - 4, 0))
            str <- paste0(padstr, "-Inf")
        }

    } else if (inherits(elem, "character")) {

        width <- nchar(elem)
        padstr <- spaces(max(w - width, 0))
        if (type == 'number' || type == 'integer')
            str <- paste0(padstr, elem)
        else
            str <- paste0(elem, padstr)

    } else if ( ! is.numeric(elem)) {

        str <- paste0("[", class(elem)[1], "]")

    } else if (p && elem < (10^-sf) && elem >= 0.0) {

        str <- paste0('< .', paste0(rep(0, sf-1), collapse=''), '1')

    } else if (elem == 0 || zto || (abs(elem) > scl && abs(elem) < sch)) {

        if (pc)
            elem <- 100 * elem

        # non-scientific values
        str <- sprintf(paste0("%", w, ".", dp, "f"), elem)

    } else {

        # scientific values

        exponent <- floor(log10(abs(elem)))

        sign <- ifelse(exponent >= 0, '+', '-')
        mantissa <- elem / (10^exponent)
        exponent <- abs(exponent)

        expstr <- base::format(exponent, scientific=FALSE)

        exppad <- ''
        if ( ! is.null(expw))
            exppad <- spaces(expw-nchar(expstr)-2)  # 1 for the +/-, 1 for the e
        expstr <- paste0('e', exppad, sign, expstr)

        if ( ! is.null(w))
            manstr <- base::formatC(x=mantissa, width=w-nchar(expstr), digits=sf-1, format="f")
        else
            manstr <- base::formatC(x=mantissa, digits=sf-1, format="f")

        str <- paste0(manstr, expstr)
    }

    if (length(sups) > 0)
        str <- paste0(str, ' ', paste(.SUPCHARS[sups+1], collapse=''))
    str <- paste0(str, supspad)

    str
}

repstr <- function(value, n, join='') {
    if (n > 0)
        return(paste(rep(value, n), collapse=join))
    else
        return('')
}

stringify <- function(value, context="normal") {

    if (context == "R") {

        if (is.null(value))
            return("NULL")
        else
            return(paste0(value))

    } else {

        if (is.null(value))
            return("null")
        else if (identical(value, TRUE))
            return("true")
        else if (identical(value, FALSE))
            return("false")
        else
            return(paste0(value))
    }
}

#' Construct a formula string
#' @param dep the name of the dependent variable
#' @param terms list of character vectors making up the terms
#' @return a string representation of the formula
#' @examples
#'
#' constructFormula(terms=list('a', 'b', c('a', 'b')))
#' # a+b+a:b
#'
#' constructFormula('f', list('a', 'b', c('a', 'b')))
#' # "f~a+b+a:b"
#'
#' constructFormula('with spaces', list('a', 'b', c('a', 'b')))
#' '`with spaces`~a+b+a:b'
#'
#' @export
constructFormula <- function(dep=NULL, terms) {
    rhItems <- list()
    for (term in terms) {
        term <- sapply(term, function(component) {
            if (make.names(component) != component)
                component <- paste0('`', gsub('`', '\\`', component, fixed=TRUE), '`')
            return(component)
        })
        rhItems[[length(rhItems)+1]] <- paste0(term, collapse=":")
    }
    rhs <- paste0(rhItems, collapse=' + ')
    if ( ! is.null(dep)) {
        if (make.names(dep) != dep)
            dep <- paste0('`', gsub('`', '\\`', dep, fixed=TRUE), '`')
        formulaStr <- paste(dep, '~', rhs)
    } else {
        formulaStr <- rhs
    }
    formulaStr
}

#' Compose a formula string
#' @param lht list of character vectors making up the left
#' @param rht list of character vectors making up the right
#' @return a string representation of the formula
#' @examples
#'
#' composeFormula(list('a', 'b', c('a', 'b')))
#' # ~a+b+a:b
#'
#' composeFormula('f', list('a', 'b', c('a', 'b')))
#' # "f~a+b+a:b"
#'
#' composeFormula('with spaces', list('a', 'b', c('a', 'b')))
#' '`with spaces`~a+b+a:b'
#'
#' @export
composeFormula <- function(lht, rht) {
    if (missing(rht)) {
        rht <- lht
        lht <- NULL
    }

    rhItems <- composeTerms(rht)
    rhs <- paste0(rhItems, collapse=' + ')

    if ( ! is.null(lht)) {
        lhItems <- composeTerms(lht)
        lhs <- paste0(lhItems, collapse=' + ')
        return(paste(lhs, '~', rhs))
    } else {
        return(paste('~', rhs))
    }
}

#' Test whether strings start or end with a particular string
#'
#' Same as \code{base::startsWith()} and \code{base::endsWith()} except
#' available for R < 3.3
#' @param x a string to test
#' @param prefix a string to test the presence of
#' @param suffix a string to test the presence of
#' @export
startsWith <- function(x, prefix) {
    return (substring(x, 1, nchar(prefix)) == prefix)
}

#' @rdname startsWith
#' @export
endsWith <- function(x, suffix) {
    return (substring(x, nchar(x) - nchar(suffix) + 1) == suffix)
}

isSame <- function(i1, i2) {
    if (is.list(i1) && is.list(i2)) {
        if (base::identical(i1, i2))
            return(TRUE)
        n1 <- sort(names(i1))
        n2 <- sort(names(i2))
        if ( ! base::identical(n1, n2))
            return(FALSE)

        for (n in n1) {
            if ( ! base::identical(i1[[n]], i2[[n]]))
                return(FALSE)
        }

        return(TRUE)

    } else if (base::identical(i1, i2)) {
        return(TRUE)
    }
    FALSE
}

indexOf <- function(item, array) {
    if (is.list(item)) {
        for (i in seq_along(array)) {
            comp <- array[[i]]
            if (isSame(item, comp))
                return(i)
        }
    } else {
        for (i in seq_along(array)) {
            if (base::identical(array[[i]], item))
                return(i)
        }
    }
    NA
}

#' Extracts the error message from an error object
#' @param error an error object
#' @export
extractErrorMessage <- function(error) {

    if (inherits(error, 'try-error'))
        error <- attr(error, 'condition')

    if (inherits(error, 'error')) {
        message <- error$message
        return(message)
    }

    return('Unknown error')
}

rethrow <- function(error) {

    message <- extractErrorMessage(error)
    stop(message, call.=FALSE)
}

#' Converts basic R object into their source representation
#' @param object the object to convert to source
#' @param indent the level of indentation to use
#' @return a string of the equivalent source code
#'
#' @examples
#'
#' sourcify(NULL)
#'
#' # 'NULL'
#'
#' sourcify(c(1,2,3))
#'
#' # 'c(1,2,3)'
#'
#' l <- list(a=7)
#' l[['b']] <- 3
#' l[['c']] <- list(d=3, e=4)
#' sourcify(l)
#'
#' # 'list(
#' #      a=7,
#' #      b=3,
#' #      c=list(
#' #          d=3,
#' #          e=4))'
#'
#' @export
sourcify <- function(object, indent='') {

    if (is.null(object)) {

        return('NULL')
    }
    if (is.logical(object)) {
        if (length(object) == 0)
            return('logical()')
        if (length(object) == 1)
            return(paste0(object))

        source <- 'c('
        sep <- ''

        for (item in object) {
            source <- paste0(source, sep, item)
            sep=', '
        }
        source <- paste0(source, ')')

        return(source)
    }
    if (is.numeric(object)) {

        if (length(object) == 0)
            return('numeric()')
        if (length(object) == 1)
            return(paste(object))

        source <- 'c('
        sep <- ''

        for (item in object) {
            source <- paste0(source, sep, item)
            sep=', '
        }
        source <- paste0(source, ')')

        if (nchar(source) > 40)
            source <- gsub(', ', paste0(',\n    ', indent), source, fixed=TRUE)

        return(source)

    } else if (is.character(object)) {

        if (length(object) == 0)
            return('character()')
        if (length(object) == 1)
            return(paste0('"', object, '"'))

        source <- 'c('
        sep <- ''

        for (item in object) {
            source <- paste0(source, sep, '"', item, '"')
            sep=', '
        }
        source <- paste0(source, ')')

        if (nchar(source) > 40) {
            source <- gsub('c("', paste0('c(\n    ', indent, '"'), source, fixed=TRUE)
            source <- gsub('", ', paste0('",\n    ', indent), source, fixed=TRUE)
        }

        return(source)

    } else if (is.list(object) || is.environment(object)) {

        if (length(object) == 0)
            return('list()')

        indent <- paste0(indent, '    ')
        source <- paste0('list(\n', indent)
        sep <- ''

        nams <- names(object)
        if (is.null(nams)) {

            for (item in object) {
                source <- paste0(source, sep, sourcify(item, indent))
                sep <- paste0(',\n', indent)
            }

        } else {

            for (name in nams) {
                source <- paste0(source, sep, name, '=', sourcify(object[[name]], indent))
                sep <- paste0(',\n', indent)
            }
        }

        source <- paste0(source, ')')
        return(source)
    }

    ''
}


#' Create a new data frame with only the selected columns
#'
#' Shorthand equivalent to \code{\link{subset}(df, select=columnNames)}, however
#' it additionally preserves attributes on the columns and the data frame
#' @param df the data frame
#' @param columnNames the names of the columns to make up the new data frame
#' @return the new data frame
#' @export
select <- function(df, columnNames) {
    out <- list()
    for (i in seq_along(columnNames)) {
        columnName <- unlist(columnNames[i])
        if ( ! is.null(df[[columnName]]))
            out[[columnName]] <- df[[columnName]]
    }
    data <- data.frame(out)
    colnames(data) <- names(out)
    row.names(data) <- row.names(df)

    # Copy attributes to new data frame
    attributeNamesOld <- names(attributes(df))
    attributeNamesNew <- names(attributes(data))
    for (attributeName in attributeNamesOld[! attributeNamesOld %in% attributeNamesNew])
        attr(data, attributeName) <- attr(df, attributeName)

    data
}

#' remove missing values from a data frame listwise
#'
#' removes all rows from the data frame which contain missing values (NA)
#'
#' this function is equivalent to \code{\link{na.omit}} from the stats package,
#' however it preserves attributes on columns in data frames
#' @param object the object to remove missing values from
#' @export
naOmit <- function(object) {

    if (is.data.frame(object)) {

        attrList <- list()
        for (name in names(object))
            attrList[[name]] <- base::attributes(object[[name]])

        nRowsBefore <- nrow(object)
        object <- stats::na.omit(object)
        nRowsAfter <- nrow(object)
        nRowsOmitted <- nRowsBefore - nRowsAfter

        for (name in names(attrList))
            base::attributes(object[[name]]) <- attrList[[name]]

        base::attr(object, 'nRowsOmitted') <- nRowsOmitted
    }
    else {
        attrs <- base::attributes(object)
        object <- stats::na.omit(object)
        base::attributes(object) <- attrs
    }

    object
}

#' Converts a vector of values to numeric
#'
#' Similar to \code{\link{as.numeric}}, however if the object has a values
#' attribute attached, these are used as the numeric values
#' @param object the vector to convert
#' @export
toNumeric <- function(object) {
    if (is.numeric(object))
        return(object)

    if ( ! is.null(base::attr(object, "values", TRUE))) {
        values <- base::attr(object, "values", TRUE)
        class(object) <- "factor"
        return(values[as.integer(object)])
    }

    object
}

#' Determines whether an object is or can be converted to numeric
#' @param object the object
#' @export
canBeNumeric <- function(object) {
    is.numeric(object) || ! is.null(attr(object, "values", TRUE))
}

#' Convert names to and from Base64 encoding
#'
#' Note: uses the . and _ characters rather than + and / allowing these to be
#' used as variable names
#' @param names the names to be converted base64
#' @export
toB64 <- function(names) {
    sapply(names, function(name) {
        if (is.na(name))
            return(NA)
        if (nchar(name) > 0)
            name <- base64enc::base64encode(charToRaw(name))
        if (endsWith(name, '=='))
            name <- substring(name, 1, nchar(name)-2)
        else if (endsWith(name, '='))
            name <- substring(name, 1, nchar(name)-1)
        name <- gsub('+', '.', name, fixed=TRUE)
        name <- gsub('/', '_', name, fixed=TRUE)
        name <- paste0('X', name)
    }, USE.NAMES=FALSE)
}

#' @rdname toB64
#' @export
fromB64 <- function(names) {
    sapply(names, function(name) {
        if (is.na(name))
            return(NA)
        name <- substring(name, 2)
        name <- gsub('.', '+', name, fixed=TRUE)
        name <- gsub('_', '/', name, fixed=TRUE)
        value <- rawToChar(base64enc::base64decode(name))
        value
    }, USE.NAMES=FALSE)
}

extractRegexMatches <- function(text, match) {
    match <- match[[1]]
    extracted <- character()
    starts   <- match
    lengths  <- attr(match, 'match.length')
    stops    <- starts + lengths - 1
    for (i in seq_along(match)) {
        piece <- substring(text, starts[i], stops[i])
        extracted <- c(extracted, piece)
    }
    extracted
}

replaceRegexMatches <- function(text, match, pieces) {
    match <- match[[1]]
    starts   <- match
    lengths  <- attr(match, 'match.length')
    stops    <- starts + lengths - 1
    for (i in rev(seq_along(match))) {
        start  <- starts[i]
        stop   <- stops[i]
        piece  <- pieces[i]
        before <- substring(text, 1, start - 1)
        after  <- substring(text, stop + 1)
        text <- paste0(before, piece, after)
    }
    text
}

regexSub <- function(pattern, text, fun) {
    match <- gregexpr(pattern, text)
    pieces <- extractRegexMatches(text, match)
    pieces <- sapply(pieces, fun, USE.NAMES=FALSE)
    replaceRegexMatches(text, match, pieces)
}

parseAddress <- function(address) {
    if (nchar(address) == 0)
        return (character())

    match <- regexpr('^(.*?)\\/', address, perl=TRUE)
    if (match != -1) {
        n <- attr(match, 'match.length')
        chunk   <- substring(address, 1, n - 1)
        address <- substring(address, n + 1)
        return (c(chunk, parseAddress(address)))
    }

    address
}

trimws <- function (x, which = c("both", "left", "right"))
{
    which <- match.arg(which)
    mysub <- function(re, x) sub(re, "", x, perl = TRUE)
    if (which == "left")
        return(mysub("^[ \t\r\n]+", x))
    if (which == "right")
        return(mysub("[ \t\r\n]+$", x))
    mysub("[ \t\r\n]+$", mysub("^[ \t\r\n]+", x))
}

htmlToText <- function(html) {

    text <- html

    text <- gsub("^\\s*<h[1-9]>", "", text)
    text <- gsub("^\\s*<p>", "", text)

    text <- gsub("<\\/?em>", "*", text)
    text <- gsub("<\\/p>\\s*<p>", "\n\n", text)
    text <- gsub("<\\/h[1-9]>\\s*<p>", "\n\n", text)

    text <- gsub("<\\/p>", "\n\n", text)
    text <- gsub("<\\/h[1-9]>", "\n\n", text)

    text <- gsub("<p>", "\n\n", text)
    text <- gsub("<h[1-9]>", "\n\n", text)
    text <- gsub("<br>", "\n", text)
    text <- gsub("<\\/?[a-zA-Z]+[1-9]*>", "", text)
    text <- gsub(" +", " ", text)

    text <- gsub("&alpha;", "\u03B1", text)
    text <- gsub("&gt;", ">", text)
    text <- gsub("&lt;", "<", text)
    text <- gsub("&ne;", "\u2260", text)

    text <- gsub("^\n+", "", text)
    text <- gsub("\n+$", "", text)

    text <- gsub("\n\n+", "\n\n", text)

    text
}

#' Determines the index where an item appears
#' @export
#' @param x the item to find
#' @param table the object to search
#' @return the index of where the item appears, or -1 if it isn't present
matchSet <- function(x, table) {
    x <- sort(x)
    for (i in seq_along(table)) {
        row <- sort(table[[i]])
        if (identical(row, x))
            return(i)
    }
    return(-1)
}

#' @importFrom jsonlite toJSON
toJSON <- function(x) {
    as.character(jsonlite::toJSON(x, auto_unbox=TRUE))
}

#' @importFrom jsonlite fromJSON
fromJSON <- function(x) {
    jsonlite::fromJSON(x)
}
