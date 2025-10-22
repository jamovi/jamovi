
#' @rdname Analysis
#' @export
Action <- R6::R6Class("Action",
    inherit=ResultsElement,
    private=list(
        .action=NA,
        .params=NA,
        .result=NA),
    active=list(
        action=function() private$.action,
        params=function() private$.params,
        result=function() private$.result
    ),
    public=list(
        initialize=function(
            options,
            name,
            action) {

            super$initialize(
                options=options,
                name=name,
                title='',
                visible=TRUE,
                clearWith=character(),
                refs=character())

            private$.action <- action
            private$.params <- NULL
            private$.result <- NULL
        },
        .setParams=function(params) {
            private$.params <- params
        },
        .setResult=function(result) {
            private$.result <- result
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
            element <- super$asProtoBuf(incAsText=incAsText, status=status, includeState=includeState)
            element$action$action <- private$.action
            if ( ! is.null(private$.result)) {
                optionsPB <- element$action$result
                optionsPB$names <- names(private$.result)
                optionsPB$hasNames <- TRUE
                for (value in private$.result) {
                    optionPB <- RProtoBuf::new(jamovi.coms.AnalysisOption)
                    optionPB$s <- value
                    optionsPB$add('options', optionPB)
                }
                element$action$result <- optionsPB
            }
            element
        }
    )
)
