
expandWeights <- function(data) {

    weights <- attr(data, 'jmv-weights', exact=TRUE)
    if (is.null(weights))
        return(data)

    if ( ! is.integer(weights))
        weights <- as.integer(round(weights))

    zeroes <- integer()

    for (rowNo in seq_len(nrow(data))) {
        weight <- weights[rowNo]
        if (is.na(weight) || weight < 1) {
            # we'll remove these
            zeroes <- c(zeroes, rowNo)
        } else if (weight > 1) {
            data <- rbind(data, data[rep(rowNo, weight-1),,drop=FALSE])
        }
    }

    if (length(zeroes) > 0)
        data <- data[-zeroes,,drop=FALSE]

    data
}

weightsStatus <- list(
    NOT_APPLICABLE = 0,
    UNSUPPORTED = 1,
    ROUNDED = 2,
    OK = 3)
