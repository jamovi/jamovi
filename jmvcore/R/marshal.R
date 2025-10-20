
#' Marshal the data from an environment into a data frame
#' @param env the environment to marshal from
#' @param ... the variables to marshal
#' @return a data frame
#' @export
marshalData <- function(env, ...) {
    data <- list()
    for (value in list(...)) {
        for (var in value)
            data[[var]] <- env[[var]]
    }
    if (length(unique(vapply(data, length, 0))) > 1)
        reject('Not all columns are the same length')

    as.data.frame(data)
}

#' Marshal a formula into options
#' @param formula the formula
#' @param data a data frame to marshal the data from
#' @param from 'rhs' or 'lhs', which side of the formula should be marshalled
#' @param type 'vars' or 'terms', the type of the option be marshalled to
#' @param permitted the types of data the option permits
#' @param subset a subset of the formula to marshal
#' @param required whether this marshall is required or not
#' @importFrom stats as.formula terms.formula
#' @export
marshalFormula <- function(formula, data, from='rhs', type='vars', permitted=c('numeric', 'factor'), subset=':', required=FALSE) {
    if ( ! inherits(formula, 'formula'))
        stop('formula must be of class formula', call.=FALSE)

    terms <- terms.formula(x=formula, data=data, keep.order=TRUE)

    if (from == 'lhs') {
        if (length(terms) < 3) {
            if (required)
                stop('formula left is missing', call.=FALSE)
            else
                return(NULL)
        }
        newRHS <- as.character(terms)[[2]]
        newLHS <- as.character(terms)[[3]] # so these will be exluded from ~.
        newFmla <- as.formula(paste0(newLHS, '~', newRHS))
        terms <- terms.formula(x=newFmla, data=data, keep.order=TRUE)
    }

    vars <- attr(terms, 'term.labels')
    vars <- decomposeTerms(vars)

    if (identical(type, 'vars')) {
        vars <- unique(unlist(vars))
        if ( ! 'factor' %in% permitted) {
            vars <- Filter(function(name) {
                ! is.factor(data[[name]])
            }, vars)
        }
        if ( ! 'numeric' %in% permitted) {
            vars <- Filter(function(name) {
                ! is.numeric(data[[name]])
            }, vars)
        }
    } else if (identical(type, 'terms')) {

        if ( ! 'factor' %in% permitted) {
            for (i in seq_along(vars)) {
                term <- vars[[i]]
                for (var in term) {
                    if (is.factor(data[[var]])) {
                        vars[i] <- list(NULL)
                        break()
                    }
                }
            }
            vars <- vars[ ! sapply(vars, is.null)]
        }
        if ( ! 'numeric' %in% permitted) {
            for (i in seq_along(vars)) {
                term <- vars[[i]]
                for (var in term) {
                    if (is.numeric(data[[var]])) {
                        vars[i] <- list(NULL)
                        break()
                    }
                }
            }
            vars <- vars[ ! sapply(vars, is.null)]
        }

        # stats::terms() mangles the order of components
        # i.e. `supp + dose:supp` becomes `supp + supp:dose`
        # this returns them to their original order`

        originalTerms <- decomposeFormula(formula)
        matchable <- sapply(originalTerms, sort)

        for (i in seq_along(vars)) {
            term <- vars[[i]]
            term <- sort(term)
            matches <- sapply(matchable, function(x) identical(term, x))
            index <- which(matches)
            if (length(index) > 0)
                vars[[i]] <- originalTerms[[index]]
        }

    } else {
        stop('bad type argument', call.=FALSE)
    }

    if (identical(subset, ':')) {
        return(vars)
    } else if (startsWith(subset, ':')) {
        n <- as.integer(substring(subset, 2))
        if (n > length(vars))
            n <- length(vars)
        return(vars[seq_len(n)])
    } else if (endsWith(subset, ':')) {
        n <- as.integer(substring(subset, 1, nchar(subset)-1))
        if (n <= length(vars))
            return(vars[n:length(vars)])
    } else if (identical(grep('^[0-9]+$', subset), as.integer(1))) {
        n <- as.integer(subset)
        if (n <= length(vars))
            return(vars[[n]])
        else
            return(NULL)
    }

    if (type == 'terms')
        return(list())
    else
        return(character())
}
