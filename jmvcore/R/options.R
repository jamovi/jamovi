
#' The jmv Options classes
#' @export
Options <- R6::R6Class(
    "Options",
    private=list(
        .analysis=NA,
        .package=NA,
        .name=NA,
        .options=NA,
        .pb=NA,
        .env=NA,
        .ppi=72,
        .theme='default',
        .palette='jmv',
        .decSymbol='.',
        .lang='',
        .requiresData=TRUE,
        .translator=NA),
    active=list(
        analysis=function(analysis) {
            if (missing(analysis))
                return(private$.analysis)
            private$.analysis <- analysis
        },
        requiresData=function() {
            private$.requiresData
        },
        varsRequired=function() {
            vars <- list()
            for (option in private$.options)
                vars <- c(vars, option$vars)
            vars <- unique(vars)
            vars
        },
        gtg=function() {
            for (option in private$.options)
                if ( ! option$gtg)
                    return(FALSE)
            TRUE
        },
        names=function() names(private$.options),
        ppi=function() private$.ppi,
        theme=function() private$.theme,
        palette=function() private$.palette,
        decSymbol=function() private$.decSymbol,
        options=function() private$.options),
    public=list(
        initialize=function(package='jmv', name='', requiresData=TRUE, ...) {

            private$.package <- package
            private$.name <- name
            private$.requiresData <- requiresData

            private$.analysis <- NULL
            private$.options <- list()
            private$.env <- new.env()
            private$.pb <- NULL
            private$.translator <- NULL

            args <- list(...)
            if ('.ppi' %in% names(args))
                private$.ppi <- args$ppi
            if ('theme' %in% names(args))
                private$.theme <- args$theme
            if ('palette' %in% names(args))
                private$.palette <- args$palette
            if ('decSymbol' %in% names(args))
                private$.decSymbol <- args$decSymbol

            private$.env[["levels"]] <- self$levels
        },
        .addOption=function(option) {
            option$.setParent(self)
            private$.options[[option$name]] <- option
            private$.env[[option$name]] <- option$value
        },
        .getData=function() {
            if (is.null(private$.analysis))
                return(NULL)
            private$.analysis$data
        },
        check=function(checkValues=FALSE, checkVars=FALSE, checkData=FALSE) {
            for (option in private$.options)
                option$check(checkValues, checkVars, checkData)
        },
        values=function() {
            private$.env
        },
        translate=function(text, n=1) {

            if (is.null(private$.translator)) {
                if (private$.lang == '') {
                    code <- Sys.getenv('LANGUAGE')
                    if (code == '') {
                        locale <- Sys.getlocale('LC_MESSAGES')
                        code <- strsplit(locale, '.', fixed=TRUE)[[1]][1]
                        if (is.null(code) || is.na(code))
                            code <- 'en'
                    }
                    private$.lang <- code
                }
                private$.translator <- createTranslator(private$.package, private$.lang)
            }

            private$.translator$translate(text, n)
        },
        eval=function(value, ...) {

            if (inherits(value, 'character')) {

                if (is.null(value))
                    return(NULL)
                if (value == 'TRUE')
                    return(TRUE)
                if (value == 'FALSE')
                    return(FALSE)
                if (value == '')
                    return('')

                vars <- list(...)
                for (name in names(vars))
                    private$.env[[name]] <- vars[[name]]

                match <- regexpr('^\\([\\$A-Za-z].*\\)$', value)

                if (match != -1) {  # data-binding

                    content <- substring(value, match + 1, attr(match, 'match.length') - 1)

                    match <- regexpr('^levels\\([\\$A-Za-z].*\\)$', content)

                    if (match != -1) {  # levels

                        optionName <- substring(content, 8, nchar(content)-1)

                        if (optionName == '$key') {
                            optionValue <- vars$.key
                        } else if (self[['has']](optionName)) {
                            optionValue <- self[['get']](optionName)
                        } else {
                            reject("Option '{}' does not exist, cannot be bound to", optionName, code=NULL)
                        }

                        if (is.null(optionValue))
                            return(character())

                        data <- self[['.getData']]()

                        if (optionValue %in% colnames(data)) {
                            return(levels(data[[optionValue]]))
                        } else {
                            reject("Variable '{}' does not exist in the data", optionValue, code=NULL)
                        }
                    }
                    else if (content == '$key') {

                        return(vars$.key)

                    } else if (self[['has']](content)) {

                        return(self[['get']](content))

                    } else if (grepl('[A-Za-z][A-Za-z0-9_]*:[A-Za-z][A-Za-z0-9_]*', content)) {

                        subed <- regexSub(
                            '[A-Za-z][A-Za-z0-9_]*:[A-Za-z][A-Za-z0-9_]*',
                            content,
                            function(x) {
                                split <- strsplit(x, ':')[[1]]
                                name  <- split[1]
                                value <- split[2]
                                return (self[['has']](name) && (value %in% self[['get']](name)))
                            })

                        return(self[['.eval']](subed))

                    } else {

                        value <- try({ self[['.eval']](content) })
                        if (inherits(value, 'try-error')) {
                            message <- jmvcore::format("Could not resolve '{}'", content)
                            stop(message, call.=FALSE)
                        }
                        return(value)
                    }

                } else if (grepl('^`.*`$', value)) {

                    value <- self$translate(value)
                    value <- substring(value, 2, nchar(value)-1)
                    formatStr <- function(...) format(str=value, ...)
                    value <- do.call(formatStr, as.list(private$.env))

                } else {

                    nch <- nchar(value)
                    if ( ! is.na(suppressWarnings(as.numeric(value)))) {
                        value <- as.numeric(value)
                    } else {
                        value <- self$translate(value)
                        value <- jmvcore::format(value, ...)
                    }
                }

                if (length(names(vars)) > 0)
                    rm(list=names(vars), envir=private$.env)
            }

            value
        },
        .eval=function(text) {

            transformed <- gsub('\\$', '.', text)
            value <- try(eval(parse(text=transformed), envir=private$.env), silent=TRUE)

            if (inherits(value, "try-error")) {
                reason <- extractErrorMessage(value)
                stop(format("Could not evaluate '{text}'\n    {reason}", text=text, reason=reason), call.=FALSE)
            }

            value
        },
        option=function(name) {
            private$.options[[name]]
        },
        get=function(name) {
            private$.options[[name]]$value
        },
        has=function(name) {
            name %in% names(private$.options)
        },
        .removeOption=function(name) {
            private$.options[[name]] <- NULL
            private$.env[[name]] <- NULL

            jamovi.coms.AnalysisOption.Other <- eval(parse(text='jamovi.coms.AnalysisOption.Other'))

            # we signal that a results option has been cleared by sending it as NONE
            for (i in seq_along(private$.pb$names)) {
                if (name == private$.pb$names[[i]]) {
                    private$.pb$options[[i]]$o <- jamovi.coms.AnalysisOption.Other$`NONE`
                    break()
                }
            }
        },
        levels=function(x) {
            str <- substitute(x)
            expr <- parse(text=paste0("if (is.null(", str, ")) NULL else base::levels(data[[", str, "]])"))
            v <- eval.parent(expr)
            v
        },
        read=function(raw) {
            initProtoBuf()
            self$fromProtoBuf(jamovi.coms.AnalysisOptions$read(raw))
        },
        asProtoBuf=function() {
            private$.pb
        },
        fromProtoBuf=function(pb) {

            private$.pb <- pb

            for (i in seq_along(pb$names)) {
                name <- pb$names[[i]]
                optionPB <- pb$options[[i]]
                value <- parseOptionPB(optionPB)

                if (name == 'data') {
                    next()
                } else if (name == '.ppi') {
                    private$.ppi <- value
                } else if (name == 'theme') {
                    private$.theme <- value
                } else if (name == 'palette') {
                    private$.palette <- value
                } else if (name == 'decSymbol') {
                    private$.decSymbol <- value
                } else if (name == '.lang') {
                    private$.lang <- value
                } else if (name %in% names(private$.options)) {
                    option <- private$.options[[name]]
                    option$value <- value
                    private$.env[[name]] <- option$value
                } else {
                    # intended for results options
                    option <- Option$new(name, value)
                    self$.addOption(option)
                }
            }
        },
        compProtoBuf=function(pb) {
            changes <- character()
            for (i in seq_along(pb$names)) {
                name <- pb$names[[i]]
                optionPB <- pb$options[[i]]

                if (name == 'theme') {
                    if ( ! identical(self$theme, parseOptionPB(optionPB)))
                         changes <- c(changes, 'theme')
                    next()
                }

                if (name == 'palette') {
                    if ( ! identical(self$palette, parseOptionPB(optionPB)))
                        changes <- c(changes, 'palette')
                    next()
                }

                if ( ! name %in% names(private$.options))
                    next()

                value <- parseOptionPB(optionPB)
                option <- private$.options[[name]]
                currentValue <- option$value

                if (inherits(option, 'OptionAction')) {
                    # if an OptionAction is TRUE, then we want that to trigger clearWiths
                    # if it's FALSE, we don't want to trigger clearWiths
                    # so we hack the old value to be a FALSE
                    oldValue <- FALSE
                } else {
                    clone <- option$clone(deep=TRUE)
                    clone$value <- value
                    oldValue <- clone$value
                }

                if ( ! identical(currentValue, oldValue))
                    changes <- c(changes, name)
            }
            changes
        },
        fromJSON=function(json) {
            private$.json <- json
            opts <- fromJSON(json)
            for (name in names(opts)) {
                value <- opts[[name]]
                private$.options[[name]]$value <- value
                private$.env[[name]] <- value
            }
        })
)


Option <- R6::R6Class(
    "Option",
    private=list(
        .name=NA,
        .title=NA,
        .parent=NA,
        .value=NA,
        .default=NA,
        .check=function(data, checkValues, checkVars, checkData) { },
        deep_clone=function(name, value) {
            value
        }),
    public=list(
        initialize=function(name, value=NULL, ...) {

            private$.parent <- NULL
            private$.name <- name
            private$.title <- name
            self$value <- value

            args <- list(...)
            for (name in names(args)) {
                pname <- paste0('.', name)
                if (any(pname %in% names(private)))
                    private[[pname]] <- args[[name]]
            }
        },
        check=function(checkValues=FALSE, checkVars=FALSE, checkData=FALSE) {
            if ( ! checkValues && ! checkVars && ! checkData)
                checkValues <- checkVars <- checkData <- TRUE
            if ( ! is.null(private$.parent))
                data <- private$.parent$.getData()
            else
                data <- NULL
            private$.check(data, checkValues, checkVars, checkData)
        },
        getBoundValue=function(args) {
            self$value
        },
        .setParent=function(parent) {
            private$.parent <- parent
        },
        .getData=function() {
            private$.parent$.getData()
        }),
    active=list(
        name=function() private$.name,
        default=function() private$.default,
        vars=function() NULL,
        gtg=function() TRUE,
        value=function(value) {
            if (missing(value))
                return(private$.value)
            private$.value <- value
        },
        valueAsSource=function() {
            sourcify(self$value, '    ')
        }))

#' @rdname Options
#' @export
OptionBool <- R6::R6Class(
    "OptionBool",
    inherit=Option,
    public=list(
        initialize=function(name, value=FALSE, ...) {
            super$initialize(name, value, ...)
        }
    ),
    private=list(
        .check=function(data, checkValues, checkVars, checkData) {
            if ( ! checkValues)
                return()
            if (length(private$.value) == 1 &&
                private$.value != FALSE &&
                private$.value != TRUE)
                    reject("Argument '{a}' must be either TRUE or FALSE",
                           code="a_must_be_true_or_false",
                           a=self$name)
        }
    ))


#' @rdname Options
#' @export
OptionAction <- R6::R6Class(
    'OptionAction',
    inherit=OptionBool,
    private=list(
        .action=NA,
        .params=NA
    ),
    public=list(
        initialize=function(name, value, action='open', ...) {
            super$initialize(name, value, ...)
            private$.action <- action
            private$.params <- NULL
        },
        .setParams=function(values) {
            private$.params <- values
        },
        perform=function(fun) {
            if ( ! self$value)
                stop('Action is not active')

            options <- private$.parent
            analysis <- options$analysis
            results <- analysis$results

            if (self$name %in% results$itemNames) {
                actionArray <- results$get(self$name)
            } else {
                actionArray <- Array$new(
                    options=options,
                    title='',
                    visible=FALSE,
                    template=Action$new(
                        options=options,
                        name=self$name,
                        action=self$action),
                    name=self$name)
                results$add(actionArray)
            }

            index <- length(actionArray) + 1
            action <- actionArray$addItem(index)
            sessionTemp <- analysis$.getSessionTemp()
            fullPath <- tempfile(tmpdir=sessionTemp)
            filename <- basename(fullPath)
            path <- paste0('{{SessionTemp}}/', filename)

            params <- list(
                path=path,
                fullPath=fullPath
            )

            action$.setParams(params)

            res <- try(eval(fun(action), envir=parent.frame()))
            if (inherits(res, 'try-error')) {
                err <- as.character(attr(res, 'condition'))
                action$.setResult(list(
                    status='error',
                    message=err
                ))
            } else if ( ! is.list(res)) {
                action$.setResult(list(
                    status='error',
                    message='module developer fail: action result is not a list'
                ))
            } else {
                action$.setResult(res)
            }
        }
    ),
    active=list(
        action=function() private$.action,
        params=function() private$.params
    ))


#' @rdname Options
#' @export
OptionList <- R6::R6Class(
    "OptionList",
    inherit=Option,
    public=list(
        initialize=function(name, value, options, ...) {

            if (length(options) == 0)
                reject("OptionList '{}': at least one option must be provided", name, code=NULL)

            if ('name' %in% names(options[[1]]))
                options <- sapply(options, function(x) x$name)
            else
                options <- unlist(options)


            if (missing(value) || is.null(value))
                value <- options[1]

            super$initialize(name, value, options=options, ...)
        }
    ),
    private=list(
        .options=NA,
        .default=NA,
        .check=function(data, checkValues, checkVars, checkData) {
            if ( ! checkValues)
                return()
            if ( ! (private$.value %in% private$.options)) {
                options <- paste("'", private$.options, "'", collapse=", ", sep="")
                reject("Argument '{a}' must be one of {options}", code="a_must_be_one_of", a=self$name, options=options)
            }
        }
    )
)

#' @rdname Options
#' @export
OptionNMXList <- R6::R6Class(
    "OptionNMXList",
    inherit=Option,
    public=list(
        initialize=function(name, value=character(), options, default=NULL, ...) {

            if (length(options) == 0)
                reject("OptionList '{}': at least one option must be provided", name, code=NULL)

            default <- unlist(default)

            if ('name' %in% names(options[[1]]))
                options <- sapply(options, function(x) x$name)
            options <- unlist(options)

            super$initialize(name, value=value, options=options, default=default, ...)
        }
    ),
    active=list(
        value=function(v) {
            if (missing(v))
                return(private$.value)
            private$.value <- unlist(v)
        }
    ),
    private=list(
        .options=character(),
        .default=character(),
        .check=function(data, checkValues, checkVars, checkData) {
            if ( ! checkValues)
                return()
            badValues <- private$.value[ ! (private$.value %in% private$.options)]
            if (length(badValues) > 0) {
                options <- paste0("'", private$.options, "'", collapse=', ')
                reject("Argument '{a}' may only contain {options}", code="a_must_be_one_of", a=self$name, options=options)
            }
        })
)

#' @rdname Options
#' @export
OptionVariables <- R6::R6Class(
    "OptionVariables",
    inherit=Option,
    active=list(
        vars=function() private$.value,
        value=function(value) {
            if (missing(value))
                return(private$.value)
            private$.value <- unlist(value)
        },
        valueAsSource=function() {
            value <- self$value
            if (length(value) == 1)
                return(value)
            middle <- paste0(self$value, collapse=', ')
            paste0('vars(', middle, ')')
        },
        gtg=function() {
            ! (private$.required && length(private$.value) == 0)
        }),
    private=list(
        .rejectInf=TRUE,
        .rejectMissing=FALSE,
        .rejectUnusedLevels=FALSE,
        .required=FALSE,
        .permitted=list(
            'numeric',
            'factor'),
        .check=function(data, checkValues, checkVars, checkData) {

            value <- private$.value

            if (checkValues) {

                if (length(value) == 0)
                    return()

                if (is.character(value) == FALSE && is.list(value) == FALSE)
                    reject("Argument '{a}' is not valid", code="a_is_not_a_string", a=self$name)
            }

            if (checkVars) {

                notInDataset <- value[ ! (value %in% names(data))]
                if (length(notInDataset) == 1) {

                    reject("Argument '{a}' contains '{b}' which is not present in the dataset", code="a_is_not_in_b", a=self$name, b=notInDataset)

                } else if (length(notInDataset) > 1) {

                    b <- paste(paste0("'", notInDataset, "'"), collapse=", ")
                    reject("Argument '{a}' contains {b} which are not present in the dataset", code="a_are_not_in_b", a=self$name, b=b)
                }
            }

            if (checkData) {

                if ( ! 'factor' %in% private$.permitted && ! 'id' %in% private$.permitted && ! 'nominaltext' %in% private$.permitted) {
                    for (columnName in value) {
                        column <- data[[columnName]]
                        if ( ! canBeNumeric(column))
                            reject("Argument '{a}' requires a numeric variable ('{b}' is not valid)", a=self$name, b=columnName)
                    }
                }

                # if ( ! 'numeric' %in% private$.permitted && ! 'continuous' %in% private$.permitted) {
                #     for (columnName in value) {
                #         column <- data[[columnName]]
                #         if ( ! is.numeric(column))
                #             reject("Argument '{a}' requires a factor or factor-like object ('{b}' is not valid)", a=self$name, b=columnName)
                #     }
                # }

                if ( ! 'id' %in% private$.permitted) {
                    for (columnName in value) {
                        column <- data[[columnName]]
                        if (identical(attr(column, 'jmv-id'), TRUE))
                            reject("Argument '{a}' does not permit ID variables ('{b}' is not valid)", a=self$name, b=columnName)
                    }
                }

                if (private$.rejectInf) {  # Infs rejected by default

                    for (columnName in value) {

                        column <- data[[columnName]]
                        if (any(is.infinite(column)))
                            reject("Argument '{a}' specifies column '{b}' which contains (and must not) infinite values", code="b_contains_infinite_values", a=self$name, b=columnName)
                    }
                }

                if (private$.rejectMissing) {  # missings not rejected by default

                    for (columnName in value) {

                        column <- data[[columnName]]
                        if (any(is.na(column)))
                            reject("Argument '{a}' specifies column '{b}' which contains (and must not) missing values (NAs)", code="b_contains_missing_values", a=self$name, b=columnName)
                    }
                }

                if (private$.rejectUnusedLevels) {

                    for (columnName in value) {
                        column <- data[[columnName]]
                        if (is.factor(column) && identical(attr(column, 'jmv-unused-levels'), TRUE))
                            reject(
                                "Column '{a}' contains (and must not) unused levels",
                                code="b_contains_unused_levels",
                                a=columnName)
                    }
                }
            }

        }))

#' @rdname Options
#' @export
OptionTerm <- R6::R6Class(
    "OptionVariables",
    inherit=OptionVariables
)

#' @rdname Options
#' @export
OptionVariable <- R6::R6Class(
    "OptionVariable",
    inherit=OptionString,
    private=list(
        .rejectUnusedLevels=FALSE,
        .rejectInf=FALSE,
        .rejectMissing=FALSE,
        .required=FALSE,
        .permitted=list(
            'numeric',
            'factor'),
        .check=function(data, checkValues, checkVars, checkData) {

            columnName <- private$.value

            if (is.null(columnName))
                return()

            if (checkValues) {
                if (length(columnName) > 1)
                    reject("Argument '{a}' requires a single variable name", code="too_many_variables_specified", a=self$name)
                if ( ! is.character(columnName))
                    reject("Argument '{a}' is not valid", code="a_is_not_a_string", a=self$name)
            }

            if (checkVars) {
                if ( ! columnName %in% names(data))
                    reject("Argument '{a}' contains '{b}' which is not present in the dataset", code="a_is_not_in_b", a=self$name, b=columnName)
            }

            if (checkData) {

                column <- data[[columnName]]

                if ( ! 'factor' %in% private$.permitted && ! 'nominaltext' %in% private$.permitted && ! canBeNumeric(column))
                    reject("Argument '{a}' requires a numeric variable ('{b}' is not valid)", a=self$name, b=columnName)

                # if ( ! 'numeric' %in% private$.permitted && ! 'continuous' %in% private$.permitted && is.numeric(column))
                #     reject("Argument '{a}' requires a factor or factor-like object ('{b}' is not valid)", a=self$name, b=columnName)

                if ( ! 'id' %in% private$.permitted && identical(attr(column, 'jmv-id'), TRUE))
                    reject("Argument '{a}' does not permit ID variables ('{b}' is not valid)", a=self$name, b=columnName)

                if (private$.rejectInf) {  # Infs rejected by default
                    if (any(is.infinite(column)))
                        reject("Argument '{a}' specifies column '{b}' which contains (and must not) infinite values", code="b_contains_infinite_values", a=self$name, b=columnName)
                }

                if (private$.rejectMissing) {  # missings not rejected by default
                    if (any(is.na(column)))
                        reject("Argument '{a}' specifies column '{b}' which contains (and must not) missing values (NAs)", code="b_contains_missing_values", a=self$name, b=columnName)
                }

                if (private$.rejectUnusedLevels) {
                    if (is.factor(column) && identical(attr(column, 'jmv-unused-levels'), TRUE))
                        reject(
                            "Column '{a}' contains (and must not) unused levels",
                            code="b_contains_unused_levels",
                            a=columnName)
                }
            }

        }),
    active=list(
        vars=function() private$.value,
        gtg=function() {
            ! (private$.required && is.null(private$.value))
        },
        valueAsSource=function() {
            self$value
        }))

#' @rdname Options
#' @export
OptionOutput <- R6::R6Class(
    "OptionOutput",
    inherit=Option,
    active=list(
        value=function(v) {
            if ( ! missing(v)) {
                private$.value <- v
                invisible(self)
            } else {
                isTRUE(private$.value$value)
            }
        },
        synced=function() {
            private$.value$synced
        },
        valueAsSource=function() {
            ''
        }
    ))

#' @rdname Options
#' @export
OptionTerms <- R6::R6Class(
    "OptionTerms",
    inherit=OptionArray,
    public=list(
        initialize=function(name, value, ...) {
            super$initialize(name, value, OptionVariables$new('term', NULL), ...)
        }
    ),
    active=list(
        valueAsSource=function() {
            if (length(private$.elements) < 1)
                return('')
            return (composeFormula(self$value))
        }
    )
)

#' @rdname Options
#' @export
OptionInteger <- R6::R6Class(
    "OptionInteger",
    inherit=Option,
    private=list(
        .min=-Inf,
        .max=Inf,
        .default=0,
        .check=function(data, checkValues, checkVars, checkData) {
            if ( ! checkValues)
                return()
            value <- self$value
            if (value > private$.max || value < private$.min)
                reject('{title} must be between {min} and {max} (is {value})', title=private$.title, min=private$.min, max=private$.max, value=value)
            else if ( ! value %% 1==0)
                reject('{title} must be an integer value (is {value})', title=private$.title, value=value)
        }
    ))

#' @rdname Options
#' @export
OptionNumber <- R6::R6Class(
    "OptionNumber",
    inherit=Option,
    private=list(
        .min=-Inf,
        .max=Inf,
        .default=0,
        .check=function(data, checkValues, checkVars, checkData) {
            if ( ! checkValues)
                return()
            value <- self$value
            if (value > private$.max || value < private$.min)
                reject('{title} must be between {min} and {max} (is {value})', title=private$.title, min=private$.min, max=private$.max, value=value)
        }
    ),
    public=list(
        initialize=function(name, value=0, ...) {
            super$initialize(name, value, ...)
        }
    ))

#' @rdname Options
#' @export
OptionString <- R6::R6Class(
    "OptionString",
    inherit=Option)

#' @rdname Options
#' @export
OptionLevel <- R6::R6Class(
    "OptionString",
    inherit=Option)

#' @rdname Options
#' @export
OptionGroup <- R6::R6Class(
    "OptionGroup",
    inherit=Option,
    public=list(
        initialize=function(name, value, elements, ...) {
            private$.elements <- list()
            for (element in elements) {
                element$.setParent(self)
                private$.elements[[element$name]] <- element
            }
            super$initialize(name, value, ...)
        }
    ),
    active=list(
        value=function(value) {
            if (missing(value)) {
                value <- list()
                for (o in private$.elements)
                    value[o$name] <- list(o$value)
                return(value)
            }
            for (name in names(value))
                private$.elements[[name]]$value <- value[[name]]
        }, vars=function() {
            vars <- list()
            for (element in private$.elements)
                vars <- c(vars, element$vars)
            unique(vars)
        }),
    private=list(
        .elements=NA,
        .check=function(data, checkValues, checkVars, checkData) {
            for (option in private$.elements)
                option$check(checkValues, checkVars, checkData)
        },
        deep_clone=function(name, value) {

            if (name == '.elements') {
                elements <- list()
                for (name in names(value)) {
                    element <- value[[name]]$clone(deep=TRUE)
                    element$.setParent(self)
                    elements[[name]] <- element
                }
                return(elements)
            }

            value
        }
    )
)

#' @rdname Options
#' @export
OptionPair <- R6::R6Class(
    "OptionPair",
    inherit=OptionGroup,
    public=list(
        initialize=function(name, value, permitted=NULL, suggested=NULL, ...) {
            super$initialize(name, value, elements=list(
                OptionVariable$new(
                    "i1",
                    NULL,
                    suggested=suggested,
                    permitted=permitted),
                OptionVariable$new(
                    "i2",
                    NULL,
                    suggested=suggested,
                    permitted=permitted)))
        }))

#' @rdname Options
#' @export
OptionSort <- R6::R6Class(
    "OptionSort",
    inherit=OptionGroup,
    public=list(
        initialize=function(name, value, ...) {
            super$initialize(
                name,
                value,
                elements=list(
                    OptionString$new(
                        'sortBy',
                        ''),
                    OptionBool$new(
                        'sortDesc',
                        FALSE)),
                ...)
        }
    )
)

#' @rdname Options
#' @export
OptionArray <- R6::R6Class(
    "OptionArray",
    inherit=Option,
    public=list(
        initialize=function(name, value, template, ...) {
            template$.setParent(self)
            private$.template <- template
            private$.elements <- list()
            super$initialize(name, value, ...)
        }),
    active=list(
        value=function(values) {
            if (missing(values)) {
                if (private$.isNull)
                    return(NULL)
                values <- list()
                for (o in private$.elements)
                    values[length(values)+1] <- list(o$value)
                if ('OptionString' %in% class(private$.template) ||
                    'OptionInt' %in% class(private$.template) ||
                    'OptionNumber' %in% class(private$.template))
                    values <- unlist(values)
                return(values)
            }
            private$.elements <- list()
            if (is.null(values)) {
                private$.isNull <- TRUE
            } else {
                private$.isNull <- FALSE
                for (value in values) {
                    clone <- private$.template$clone(deep=TRUE)
                    clone$value <- value
                    private$.elements[[length(private$.elements)+1]] <- clone
                }
            }
        },
        vars=function() {
            vars <- list()
            for (element in private$.elements)
                vars <- c(vars, element$vars)
            unique(vars)
        },
        valueAsSource=function() {
            if ('OptionVariables' %in% class(private$.template)) {
                if (length(private$.elements) < 1)
                    return('')
                value <- self$value
                if (length(value) == 1 && is.null(value[[1]]))
                    return('')
                value <- value[ ! sapply(value, is.null)]
                return (composeFormula(value))
            }

            # if ('OptionTerms' %in% class(private$.template)) {
            #     if (length(private$.elements) < 1)
            #         return('')
            #     value <- self$value
            #     if (length(value) == 1 && is.null(value[[1]]))
            #         return('')
            #     value <- value[ ! sapply(value, is.null)]
            #     value <- sapply(value, function(x) composeFormula(x))
            #     middle <- paste0(value, collapse=',\n    ')
            #     print(middle)
            #     return (paste0('list(\n    ', middle, ')'))
            # }

            super$valueAsSource
        }),
    private=list(
        .template=NA,
        .elements=NA,
        .isNull=TRUE,
        .check=function(data, checkValues, checkVars, checkData) { },
        deep_clone=function(name, value) {

            if (name == '.elements') {
                elements <- list()
                for (i in seq_along(value)) {
                    v <- value[[i]]
                    element <- v$clone(deep=TRUE)
                    element$.setParent(self)
                    elements[[i]] <- element
                }
                return(elements)
            }

            value
        }
    ))

#' @rdname Options
#' @export
OptionPairs <- R6::R6Class(
    "OptionPairs",
    inherit=OptionArray,
    public=list(
        initialize=function(name, value, permitted=NULL, suggested=NULL, ...) {
            super$initialize(name, value, template=OptionGroup$new(
                "pairs",
                NULL,
                elements=list(
                    OptionVariable$new(
                        "i1",
                        NULL,
                        suggested=suggested,
                        permitted=permitted),
                    OptionVariable$new(
                        "i2",
                        NULL,
                        suggested=suggested,
                        permitted=permitted))),
                ...)
        }))

parseOptionPB <- function(pb) {

    if (pb$has('i'))
        value <- pb$i
    else if (pb$has('d'))
        value <- pb$d
    else if (pb$has('s'))
        value <- pb$s
    else if (pb$has('o')) {

        # this isn't necessary, but without it the R linter complains :/
        jamovi.coms.AnalysisOption.Other <- eval(parse(text='jamovi.coms.AnalysisOption.Other'))

        if (pb$o == jamovi.coms.AnalysisOption.Other$`TRUE`)
            value <- TRUE
        else if (pb$o == jamovi.coms.AnalysisOption.Other$`FALSE`)
            value <- FALSE
        else
            value <- NULL
    }
    else if (pb$has('c')) {
        value <- list()
        for (i in seq_along(pb$c$options))
            value[i] <- list(parseOptionPB(pb$c$options[[i]])) # funny syntax can handle NULL
        if (pb$c$hasNames)
            names(value) <- pb$c$names
    }
    else
        value <- NULL

    value
}

#' @export
`$.Options` <- function(x, name) {
    if ( ! exists(name, envir = x)) {
        stop("options$", name, " does not exist", call.=FALSE)
    }
    x[[name]]
}
