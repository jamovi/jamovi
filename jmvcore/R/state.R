
#' @rdname Analysis
#' @export
State <- R6::R6Class("State",
    inherit=ResultsElement,
    public=list(
        initialize=function(
            options,
            name,
            title,
            visible,
            clearWith) {
        super$initialize(
            options,
            name,
            '',
            FALSE,
            clearWith)
    })
)
