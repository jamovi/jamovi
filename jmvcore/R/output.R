
#' @rdname Analysis
#' @export
Output <- R6::R6Class('Output',
    inherit=ResultsElement,
    active=list(
        enabled=function() {
            value <- private$.options$get(private$.name)
            if (is.logical(value))
                return(value)
            if (is.character(value))
                return(length(value) > 0)
            if (is.list(value))
                return(isTRUE(value$value))
            # shouldn't get here
            FALSE
        }
    ),
    public=list(
        initialize=function(
            options,
            name='',
            title='',
            clearWith='*',
            refs=character(),
            varTitle='Output',
            varDescription='',
            measureType='continuous',
            items='1',
            initInRun=FALSE) {

            super$initialize(
                options=options,
                name=name,
                title=title,
                visible=TRUE,
                clearWith=clearWith,
                refs=refs)

            if (initInRun)
                items <- 0

            items <- paste0(items)
            private$.itemsExpr <- items
            private$.initInRun <- initInRun

            if (items != '1' && varTitle == 'Output')
                varTitle = 'Output - $key'
            if (items != '1' && varDescription == '')
                varDescription = 'Output for $key'

            keys <- try(private$.options$eval(items), silent=TRUE)
            if (is.numeric(keys)) {
                keys <- seq_len(keys)
            } else if (isError(keys)) {
                keys <- list()
            }

            nItems <- length(keys)
            titles <- vapply(keys, function(key) private$.options$eval(varTitle, .key=key), '')
            descriptions <- vapply(keys, function(key) private$.options$eval(varDescription, .key=key), '')
            measureTypes <- rep(measureType, nItems)

            self$set(keys, titles, descriptions, measureTypes)
        },
        set=function(keys, titles, descriptions, measureTypes) {

            nItems <- length(keys)
            private$.keys <- keys
            private$.rowNums <- NULL
            private$.values <- rep(list(NULL), nItems)

            private$.names <- vapply(keys, toJSON, '', USE.NAMES=FALSE)
            private$.titles <- titles
            private$.descriptions <- descriptions
            private$.measureTypes <- measureTypes
            private$.stales <- rep(TRUE, nItems)
        },
        setValues=function(values, key, index) {
            if (missing(key)) {
                if (missing(index)) {
                    if (is.data.frame(values)) {
                        self$setRowNums(rownames(values))
                        nCols <- max(ncol(values), length(private$.keys))
                        for (i in seq_len(nCols))
                            self$setValues(index=i, values[[i]])
                        return()
                    } else {
                        index <- 1
                    }
                }
                private$.values[[index]] <- values
                private$.stales[index] <- FALSE
            } else {
                index <- indexOf(key, private$.keys)
                if ( ! is.na(index)) {
                    private$.values[[index]] <- values
                    private$.stales[index] <- FALSE
                }
            }
        },
        setDescription=function(description, key, index) {
            if (missing(key)) {
                if (missing(index))
                    index <- 1
            } else {
                index <- indexOf(key, private$.keys)
                if ( ! is.na(index))
                    return()
            }
            private$.descriptions[index] <- description
        },
        setTitle=function(title, key, index) {
            if (missing(key)) {
                if (missing(index))
                    index <- 1
            } else {
                index <- indexOf(key, private$.keys)
                if ( ! is.na(index))
                    return()
            }
            private$.titles[index] <- title
        },
        setRowNums=function(rowNums) {
            private$.rowNums <- as.integer(rowNums)
        },
        isFilled=function(key) {

            if (missing(key)) {
                return( ! any(private$.stales))
            } else {
                index <- indexOf(key, private$.keys)
                if ( ! is.na(index))
                    return( ! private$.stales[index])
                else
                    return(TRUE)  # shouldn't get here
            }
        },
        isNotFilled=function(key) {
            if (private$.initInRun && length(private$.keys) == 0)
                return(TRUE)
            `if`(missing(key), ! self$isFilled(), ! self$isFilled(key))
        },
        asString=function() {
            ''
        },
        fromProtoBuf=function(element, oChanges, vChanges) {

            outputsPB <- element$outputs

            if (private$.initInRun) {

                names <- character()
                titles <- character()
                descriptions <- character()
                measureTypes <- character()

                for (outputPB in outputsPB$outputs) {
                    names <- c(names, outputPB$name)
                    titles <- c(titles, outputPB$title)
                    descriptions <- c(descriptions, outputPB$description)
                    measureTypes <- c(measureTypes, outputPB$measureType)
                }

                keys <- lapply(names, fromJSON)
                measureTypes <- vapply(measureTypes, function(x) {
                    if (x == jamovi.coms.MeasureType$CONTINUOUS)
                        return('continuous')
                    else if (x == jamovi.coms.MeasureType$ORDINAL)
                        return('ordinal')
                    else
                        return('nominal')
                }, '', USE.NAMES=FALSE)

                self$set(keys, titles, descriptions, measureTypes)
            }

            # synced are the columns already received by the client
            synced <- self$options$option(private$.name)$synced

            for (outputPB in outputsPB$outputs) {
                name <- outputPB$name
                if (name %in% synced) {
                    index <- indexOf(name, private$.names)
                    if ( ! is.na(index))
                        private$.stales[index] <- outputPB$stale
                }
            }

            clear <- FALSE

            someChanges <- length(oChanges) > 0 || length(vChanges) > 0
            if (someChanges && base::identical('*', private$.clearWith)) {
                clear <- TRUE
            } else if (base::any(oChanges %in% private$.clearWith)) {
                clear <- TRUE
            } else {
                for (clearName in private$.clearWith) {
                    if (base::any(vChanges %in% private$.options$option(clearName)$vars)) {
                        clear <- TRUE
                        break()
                    }
                }
            }

            if (clear) {
                private$.stales <- rep(TRUE, length(private$.keys))
                return()
            }

            super$fromProtoBuf(element, oChanges, vChanges)

            bound <- self$getBoundVars(private$.itemsExpr)
            changes <- vChanges[vChanges %in% bound]

            for (vChanged in changes) {
                index <- indexOf(name, private$.names)
                if ( ! is.na(index))
                    private$.stales[index] <- TRUE
            }
        },
        asProtoBuf=function(incAsText=FALSE, status=NULL, includeState=TRUE) {

            includeData = incAsText

            element <- super$asProtoBuf(incAsText=incAsText, status=status, includeState=includeState)

            outputsPB <- RProtoBuf_new(jamovi.coms.ResultsOutputs)

            if (self$enabled) {

                if (includeData) {
                    if ( ! is.null(private$.rowNums))
                        outputsPB$rowNums <- (private$.rowNums - 1)  # index from zero
                }

                for (i in seq_along(private$.keys)) {

                    stale <- private$.stales[i]

                    outputPB <- RProtoBuf_new(jamovi.coms.ResultsOutput)

                    outputPB$name <- private$.names[i]
                    outputPB$title <- private$.titles[i]
                    outputPB$description <- private$.descriptions[i]
                    outputPB$stale <- stale

                    mt <- private$.measureTypes[i]
                    if (mt == 'continuous')
                        outputPB$measureType <- jamovi.coms.MeasureType$CONTINUOUS
                    else if (mt == 'ordinal')
                        outputPB$measureType <- jamovi.coms.MeasureType$ORDINAL
                    else
                        outputPB$measureType <- jamovi.coms.MeasureType$NOMINAL

                    column <- private$.values[[i]]

                    if (includeData && ( ! is.null(column) || stale)) {

                        outputPB$incData <- TRUE

                        if (is.character(column))
                            column <- as.factor(column)

                        if (is.null(column)) {
                            # do nothing
                        } else if (is.integer(column)) {
                            column <- ifelse(is.na(column), -2147483648, column)
                            outputPB$i <- column
                        } else if (is.numeric(column)) {
                            outputPB$d <- column
                        } else if (is.logical(column)) {
                            column <- ifelse(is.na(column), -2147483648, ifelse(column, 1, 0))
                            outputPB$i <- column
                            levelPB <- RProtoBuf_new(jamovi.coms.VariableLevel)
                            levelPB$label <- 'true'
                            levelPB$value <- 1
                            outputPB$add('levels', levelPB)
                            levelPB <- RProtoBuf_new(jamovi.coms.VariableLevel)
                            levelPB$label <- 'false'
                            levelPB$value <- 0
                            outputPB$add('levels', levelPB)
                        } else {
                            if ( ! is.factor(column))
                                column <- as.factor(column)
                            numbers <- as.numeric(column)
                            outputPB$i <- ifelse(is.na(numbers), -2147483648, numbers)
                            lvls <- levels(column)
                            for (i in seq_along(lvls)) {
                                levelPB <- RProtoBuf_new(jamovi.coms.VariableLevel)
                                levelPB$label <- lvls[i]
                                levelPB$value <- i
                                outputPB$add('levels', levelPB)
                            }
                        }
                    }

                    outputsPB$add('outputs', outputPB)
                }
            }

            element$outputs <- outputsPB
            element
        }
    ),
    private=list(
        .itemsExpr=NA,
        .keys=NA,
        .rowNums=NA,
        .names=NA,
        .titles=NA,
        .descriptions=NA,
        .measureTypes=NA,
        .initInRun=FALSE,
        .stales=NA,
        .values=NA
    )
)
