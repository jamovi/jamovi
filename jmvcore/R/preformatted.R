
#' @rdname Analysis
#' @export
Preformatted <- R6::R6Class("Preformatted",
    inherit=ResultsElement,
    private=list(
        .content=''),
    active=list(
        content=function(value) {
            if (base::missing(value))
                return(private$.content)
            if ( ! is.character(value))
                value <- capture.output(value)
            value <- paste0(value, collapse='\n')
            private$.content <- value
            private$.stale <- FALSE
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
            refs=character()) {

            super$initialize(
                options=options,
                name=name,
                title=title,
                visible=visible,
                clearWith=clearWith,
                refs=refs)
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
            private$.content
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

            private$.content <- element$preformatted
        },
        asProtoBuf=function(incAsText=FALSE, status=NULL, includeState=TRUE) {
            element <- super$asProtoBuf(incAsText=TRUE, status=status, includeState=includeState)
            element$preformatted <- private$.content
            element
        }
    )
)
