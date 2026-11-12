
ResultsElement <- R6::R6Class("ResultsElement",
    private=c(
        .name="",
        .key=NA,
        .titleValue="",
        .titleExpr="",
        .index=NA,
        .visibleExpr=NA,
        .visibleValue=TRUE,
        .options=NA,
        .updated=FALSE,
        .status='none',
        .error=NA,
        .clearWith=NA,
        .state=NA,
        .stale=TRUE,
        .refs=NA,
        .parent=NA,
        deep_clone=function(name, value) {
            value
        },
        .clearsWith=function() {
            # clearWith, named as the options are carried, which is how the
            # changes are named in fromProtoBuf(). this matters for an addon,
            # see Options$.rootNames()
            if ( ! inherits(private$.options, 'Options'))
                return(private$.clearWith)
            private$.options$.rootNames(private$.clearWith)
        },
        .someChanges=function(oChanges, vChanges) {
            # whether there are changes this element might depend on (for a
            # clearWith of '*'), see Options$.relevantChanges()
            if (length(vChanges) > 0)
                return(TRUE)
            if (inherits(private$.options, 'Options'))
                oChanges <- private$.options$.relevantChanges(oChanges)
            length(oChanges) > 0
        },
        .clearWithOption=function(name) {
            # the option of a name from .clearsWith()
            if ( ! inherits(private$.options, 'Options'))
                return(NULL)
            private$.options$.rootOption(name)
        }),
    active=list(
        name=function() private$.name,
        key=function() private$.key,
        index=function() private$.index,
        options=function() private$.options,
        visible=function() private$.visibleValue,
        title=function() private$.titleValue,
        state=function() private$.state,
        path=function() {
            if (inherits(private$.parent, "ResultsElement")) {
                parentPath <- private$.parent$path
                if (parentPath == '')
                    return(self$name)
                else
                    return(paste(parentPath, self$name, sep="/"))
            }
            else {
                return(self$name)
            }
        },
        root=function() {
            parent <- self
            while (inherits(parent, "ResultsElement"))
                parent <- parent$parent
            parent
        },
        analysis=function() {
            parent <- private$.parent
            while (inherits(parent, "ResultsElement"))
                parent <- parent$parent
            parent
        },
        status=function() {
            private$.status
        },
        parent=function() {
            private$.parent
        },
        requiresData=function() FALSE),
    public=list(
        initialize=function(
            options,
            name,
            title,
            visible,
            clearWith,
            refs) {

            private$.options <- options
            private$.name <- name
            private$.titleExpr <- title
            private$.titleValue <- title

            if (identical(visible, TRUE))
                private$.visibleExpr <- NULL
            else
                private$.visibleExpr <- paste0(visible)

            private$.clearWith <- clearWith
            private$.refs <- as.character(refs)

            private$.updated <- FALSE
            private$.state <- NULL
        },
        isFilled=function() {
            if (private$.stale)
                return(FALSE)
            return(TRUE)
        },
        isNotFilled=function() {
            ! self$isFilled()
        },
        .setKey=function(key, index) {
            private$.key <- key
            private$.index <- index
        },
        .setName=function(name) {
            private$.name <- name
        },
        setStatus=function(status) {
            if ( ! is.character(status) || length(status) != 1)
                reject('setStatus(): status must be a string')
            private$.status <- status
        },
        setState=function(state) {
            private$.state <- state
        },
        setVisible=function(visible=TRUE) {
            private$.visibleExpr <- paste0(visible)
            private$.visibleValue <- visible
        },
        resetVisible=function() {
            private$.visibleExpr <- NULL
            private$.visibleValue <- TRUE
        },
        setTitle=function(title) {
            if ( ! is.character(title) || length(title) != 1)
                reject('setTitle(): title must be a string')
            private$.titleExpr <- title
            private$.titleValue <- title
        },
        getRefs=function(recurse=FALSE) {
            private$.refs
        },
        setRefs=function(refs) {
            private$.refs <- as.character(refs)
        },
        .update=function() {
            if (private$.updated)
                return()

            private$.updated <- TRUE

            if (is.null(private$.visibleExpr) || private$.visibleExpr == 'TRUE') {
                private$.visibleValue <- TRUE
            }
            else if (private$.visibleExpr == 'FALSE') {
                private$.visibleValue <- FALSE
            }
            else {
                vis <- private$.options$eval(private$.visibleExpr, .key=private$.key, .name=private$.name, .index=private$.index)
                if (is.logical(vis))
                    private$.visibleValue = vis
                else
                    private$.visibleValue = (length(vis) > 0)
            }

            private$.titleValue <- paste0(private$.options$eval(private$.titleExpr, .key=private$.key, .name=private$.name, .index=private$.index))
        },
        .createImages=function(...) {
            FALSE
        },
        .render=function(image, ...) {
            FALSE
        },
        .has=function(name) {
            paste0(".", name) %in% names(private)
        },
        get=function(name) {
            stop("This element does not support get()")
        },
        setError = function(message) {
            if ( ! is.character(message) || length(message) != 1)
                reject('setError(): message must be a string')
            private$.error <- message
            private$.status <- 'error'
        },
        saveAs=function(file, format) {
            if (format != 'text')
                reject(paste0('unrecognised format "', format, '"'))
            base::cat(self$asString(), file=file, sep="")
        },
        asString=function() {
            self$.update()
            ""
        },
        asProtoBuf=function(incAsText=FALSE, status=NULL, includeState=TRUE) {

            if (identical(private$.visibleExpr, 'TRUE'))
                v <- jamovi.coms.Visible$YES
            else if (identical(private$.visibleExpr, 'FALSE'))
                v <- jamovi.coms.Visible$NO
            else if (self$visible)
                v <- jamovi.coms.Visible$DEFAULT_YES
            else
                v <- jamovi.coms.Visible$DEFAULT_NO

            if (private$.status == 'error')
                s <- jamovi.coms.AnalysisStatus$ANALYSIS_ERROR
            # else if (self$isFilled())  # this takes a surprising amount of time
            #     s <- jamovi.coms.AnalysisStatus$ANALYSIS_COMPLETE
            else if (private$.status == 'running')
                s <- jamovi.coms.AnalysisStatus$ANALYSIS_RUNNING
            else if (private$.status == 'inited')
                s <- jamovi.coms.AnalysisStatus$ANALYSIS_INITED
            else if (private$.status == 'complete')
                s <- jamovi.coms.AnalysisStatus$ANALYSIS_COMPLETE
            else
                s <- jamovi.coms.AnalysisStatus$ANALYSIS_NONE

            if ( ! is.null(status)) {
                if (status == jamovi.coms.AnalysisStatus$ANALYSIS_ERROR)
                    s <- status
                else if (status == jamovi.coms.AnalysisStatus$ANALYSIS_COMPLETE)
                    s <- status
                else if (status == jamovi.coms.AnalysisStatus$ANALYSIS_RUNNING &&
                         s != jamovi.coms.AnalysisStatus$ANALYSIS_COMPLETE)
                    s <- status
                else if (status == jamovi.coms.AnalysisStatus$ANALYSIS_INITED &&
                         s == jamovi.coms.AnalysisStatus$ANALYSIS_NONE)
                    s <- status
            }

            state <- private$.state
            if (includeState && ! is.null(state)) {
                conn <- rawConnection(raw(), 'r+')
                base::saveRDS(state, file=conn)
                uncompressed <- rawConnectionValue(conn)
                state <- memCompress(uncompressed)
                close(conn)
                if (length(state) > 500000)
                    cat(paste0('WARNING: state object for ', self$path, ' is too large (', length(state), ').\nSee here for details: https://dev.jamovi.org/tuts0203-state.html#setstate()'))
            } else {
                state <- raw()
            }

            element <- RProtoBuf_new(jamovi.coms.ResultsElement,
                name=private$.name,
                title=self$title,
                stale=private$.stale,
                state=state,
                status=s,
                visible=v,
                refs=self$getRefs())

            if (private$.status == 'error') {
                error <- RProtoBuf_new(jamovi.coms.Error,
                                        message=private$.error)
                element$error <- error
                element$status <- jamovi.coms.AnalysisStatus$ANALYSIS_ERROR
            }

            element
        },
        fromProtoBuf=function(pb, oChanges, vChanges) {

            someChanges <- private$.someChanges(oChanges, vChanges)
            if (someChanges && base::identical('*', private$.clearWith))
                return()

            if (base::any(oChanges %in% private$.clearsWith()))
                return()

            for (name in private$.clearsWith()) {
                option <- private$.clearWithOption(name)
                if (is.null(option))
                    next()
                if (base::any(vChanges %in% option$vars))
                    return()
            }

            if ( ! base::identical(pb$state, raw())) {
                uncompressed <- memDecompress(pb$state, type='gzip')
                conn <- rawConnection(uncompressed, 'r')
                state <- base::readRDS(file=conn)
                private$.state <- state
                close(conn)
            } else {
                private$.state <- NULL
            }
        },
        getBoundVars=function(expr) {
            if ( ! startsWith(expr, '('))
                return(NULL)
            if ( ! endsWith(expr, ')'))
                return(NULL)

            optName <- substring(expr, 2, nchar(expr) - 1)

            if ( ! private$.options$has(optName))
                return(NULL)

            value <- private$.options$get(optName)
            value <- unlist(value, use.names=FALSE)
            value <- unique(value)

            value
        },
        print=function() {
            cat(self$asString())
            self$.render()
        },
        .setParent=function(parent) {
            private$.parent <- parent
        }))


#' @export
`$.ResultsElement` <- function(x, name) {
    if ( ! exists(name, envir = x)) {
        # an item added to a group (as an addon adds its results to its
        # parent's) has no field of its own
        if (inherits(x, 'Group')) {
            item <- x$items[[name]]
            if ( ! is.null(item))
                return(item)
        }
        stop("'", name, "' does not exist in this results element", call.=FALSE)
    }
    classes <- class(x)
    on.exit(class(x) <- classes)
    class(x) <- 'environment'
    property <- x[[name]]
    property
}
