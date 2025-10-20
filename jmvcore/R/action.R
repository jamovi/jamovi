
#' @rdname Analysis
#' @export
Action <- R6::R6Class("Action",
    inherit=ResultsElement,
    private=list(
        .operation=NA,
        .perform=NA,
        .actionOptions=NA),
    active=list(),
    public=list(
        initialize=function(
            options,
            name='',
            title='',
            visible=TRUE,
            clearWith='*',
            refs=character(),
            operation) {

            super$initialize(
                options=options,
                name=name,
                title=title,
                visible=visible,
                clearWith=clearWith,
                refs=refs)

            private$.operation <- operation
            private$.actionOptions <- NULL
            private$.perform <- FALSE
        },
        perform=function(options=NULL) {
            private$.actionOptions <- options
            private$.perform <- TRUE
        },
        isFilled=function() {
            TRUE
        },
        asString=function() {
            ''
        },
        .update=function() {

        },
        asProtoBuf=function(incAsText=FALSE, status=NULL, includeState=TRUE) {
            if (private$.perform) {
                element <- super$asProtoBuf(incAsText=incAsText, status=status, includeState=includeState)
                element$action$operation <- private$.operation
                if ( ! is.null(private$.actionOptions)) {
                    optionsPB <- element$action$options
                    optionsPB$names <- names(private$.actionOptions)
                    optionsPB$hasNames <- TRUE
                    for (value in private$.actionOptions) {
                        optionPB <- RProtoBuf::new(jamovi.coms.AnalysisOption)
                        optionPB$s <- value
                        optionsPB$add('options', optionPB)
                    }
                    element$action$options <- optionsPB
                }
                return(element)
            } else {
                return(NULL)
            }
        }
    )
)
