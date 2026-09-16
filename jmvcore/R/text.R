
#' @rdname Analysis
#' @export
Text <- R6::R6Class("Text",
    inherit=ResultsElement,
    private=list(
        .content=''),
    active=list(
        content=function(value) {
            if (base::missing(value))
                return(private$.content)
            self$setContent(value)
            base::invisible(self)
        }
    ),
    public=list(
        initialize=function(
            options,
            name='',
            title='',
            visible=TRUE,
            clearWith='*',
            refs=character(),
            content='') {

            super$initialize(
                options=options,
                name=name,
                title=title,
                visible=visible,
                clearWith=clearWith,
                refs=refs)

            private$.content <- self$options$translate(content)
        },
        setContent=function(value) {
            if ( ! is.character(value))
                value <- capture.output(value)
            value <- paste0(value, collapse='\n')
            private$.content <- value
            private$.stale <- FALSE
            base::invisible(self)
        },
        isFilled=function() {
            if (private$.stale)
                return(FALSE)
            if (identical(private$.content, ''))
                return(FALSE)
            return(TRUE)
        },
        asString=function() {
            content <- htmlToText(private$.content)
            paras <- strsplit(content, '\n')
            paras <- sapply(paras, strwrap, indent=1, exdent=1)
            content <- paste0(paras, collapse="\n")
            content <- paste0("\n", content, "\n")
            content
        },
        fromProtoBuf=function(element, oChanges, vChanges) {

            private$.stale <- element$stale

            someChanges <- length(oChanges) > 0 || length(vChanges) > 0
            if (someChanges && base::identical('*', private$.clearWith)) {
                private$.stale <- TRUE
            } else if (base::any(oChanges %in% private$.clearWith)) {
                private$.stale <- TRUE
            } else {
                for (clearName in private$.clearWith) {
                    if (base::any(vChanges %in% private$.options$option(clearName)$vars)) {
                        private$.stale <- TRUE
                        break()
                    }
                }
            }

            super$fromProtoBuf(element, oChanges, vChanges)

            private$.content <- element$text
        },
        asProtoBuf=function(incAsText=FALSE, status=NULL, includeState=TRUE) {
            element <- super$asProtoBuf(incAsText=TRUE, status=status, includeState=includeState)
            element$text <- private$.content
            element
        }
    )
)
