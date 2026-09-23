
# the formatting of numbers in tables, as in jamovi (cf. the client's
# common/formatting.ts), for the text and the html output alike

# the number format: values are given to 'digits' significant figures
# (style 'sf') or decimal places (style 'dp'), and p-values likewise to
# 'pDigits' (pStyle). the defaults are jamovi's, but for a figure more for
# values (not p-values) -- someone working in R is more likely to be after
# the numbers themselves -- unless set with
#
#     options(jmvcore.format=list(style='sf', digits=4, pStyle='dp', pDigits=3))
#
# any of which may be given, the rest keeping their defaults. (these aren't
# jamovi's own names for them -- t, n, pt, p -- as n is read as FALSE when
# given as a chunk option, it being 'no' to yaml)
numberFormat <- function() {
    format <- list(style='sf', digits=4, pStyle='dp', pDigits=3)
    format <- utils::modifyList(format, as.list(getOption('jmvcore.format', list())))

    if ( ! format$style %in% c('sf', 'dp') || ! format$pStyle %in% c('sf', 'dp'))
        reject("jmvcore.format: style and pStyle must be 'sf' or 'dp'")
    if ( ! isWholeNumber(format$digits) || ! isWholeNumber(format$pDigits))
        reject('jmvcore.format: digits and pDigits must be whole numbers')

    format
}

isWholeNumber <- function(x) {
    is.numeric(x) && length(x) == 1 && ! is.na(x) && x >= 1 && x == round(x)
}

# the analysis' decimal symbol, or R's own, when the analysis has the default
decimalSymbol <- function(options) {
    decSymbol <- options$decSymbol
    if (identical(decSymbol, '.'))
        decSymbol <- getOption('OutDec', '.')
    decSymbol
}

# how a column's values are to be formatted (cf. determFormat())
determineFormat <- function(column, decSymbol='.', format=numberFormat(), minNS=1e-3, maxNS=1e6) {

    formats <- strsplit(column$format, ',', fixed=TRUE)[[1]]
    values <- as.numeric(unlist(lapply(column$cells, function(cell) {
        v <- cell$value
        if (is.double(v) && length(v) == 1 && ! is.na(v)) v
    })))
    if ('log10' %in% formats)
        values <- 10 ^ values

    absValues <- abs(values)
    inRange <- absValues >= minNS & absValues <= maxNS
    nonZero <- absValues[inRange & absValues != 0 & is.finite(absValues)]
    minAbsNS <- if (length(nonZero) > 0) min(nonZero) else Inf
    exponents <- abs(trunc(log10(absValues[ ! inRange])))
    exponents <- exponents[exponents != 0 & is.finite(exponents)]
    maxAbsExpnt <- if (length(exponents) > 0) max(exponents) else -Inf

    t <- format$style
    n <- format$digits
    lz <- TRUE  # leading zero
    if ('pvalue' %in% formats) {
        t <- format$pStyle
        n <- format$pDigits
        lz <- FALSE
    }

    if (t == 'dp' && 'pvalue' %in% formats) {
        dp <- n
        sf <- n
        maxNS <- Inf
        minNS <- -Inf
    } else if ( ! 'pvalue' %in% formats && ('zto' %in% formats || 'pc' %in% formats)) {
        dp <- n
        sf <- n
        maxNS <- Inf
        minNS <- -Inf
    } else if (t == 'sf') {
        sf <- n
        if (column$type == 'integer')
            dp <- 0
        else if ( ! is.finite(minAbsNS))
            dp <- n - 1
        else
            dp <- max(n - 1 - floor(log10(minAbsNS)), 0)
    } else {
        maxNS <- Inf
        minNS <- -Inf
        dp <- if (column$type == 'integer') 0 else n
        sf <- n + 1
    }

    expw <- 0
    if (is.finite(maxAbsExpnt))
        expw <- trunc(log10(maxAbsExpnt)) + 1

    list(dp=dp, expw=expw, formats=formats, sf=sf, maxNS=maxNS, minNS=minNS, t=t, lz=lz, ds=decSymbol)
}

# a cell's value, as text (cf. format()). integers are shown as they are,
# whatever the column's format (cf. resultsview/table.ts)
formatValue <- function(value, fmt) {

    if (is.null(value) || length(value) != 1)
        return('.')
    if (is.character(value))
        return(value)
    if (is.nan(value))
        return('NaN')
    if (is.na(value))
        return('.')
    if ( ! is.numeric(value))
        return(paste0('[', class(value)[1], ']'))
    if (is.integer(value))
        return(as.character(value))

    if ('log10' %in% fmt$formats)
        value <- 10 ^ value
    if (is.infinite(value))
        return(if (value > 0) 'Inf' else '-Inf')

    fixed <- function(x, dp) {
        str <- formatC(x, format='f', digits=dp)
        sub('.', fmt$ds, str, fixed=TRUE)
    }

    if (fmt$t == 'dp' && 'pvalue' %in% fmt$formats && value < 10 ^ -fmt$dp)
        return(paste0('<\u2009', substring(fixed(10 ^ -fmt$dp, fmt$dp), 2)))
    if ('pc' %in% fmt$formats)
        return(paste0(fixed(100 * value, fmt$dp - 2), '\u2009%'))
    if (value == 0)
        return(fixed(value, fmt$dp))
    if (abs(value) >= fmt$minNS && abs(value) <= fmt$maxNS) {
        str <- fixed(value, fmt$dp)
        if ( ! fmt$lz && startsWith(str, paste0('0', fmt$ds)))
            str <- substring(str, 2)
        return(str)
    }

    exponent <- floor(log10(abs(value)))
    mantissa <- value / 10 ^ exponent
    sign <- if (abs(value) < 1) '-' else '+'
    paste0(fixed(mantissa, fmt$sf - 1), 'e', sign, abs(exponent))
}
