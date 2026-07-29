
#' @rdname Analysis
#' @export
Svg <- R6::R6Class("Svg",
    inherit=Html,
    private=list(
        .path=''),
    active=list(
        path=function() private$.path
    ),
    public=list(
        setContent=function(content) {
            super$setContent(content)
            # the harvested svg no longer corresponds to our content
            private$.path <- ''
        },
        knit=function(value) {
            super$knit(value)
            private$.path <- ''
        },
        asString=function() {
            # as for images, there's no sensible text representation
            ''
        },
        saveAs=function(file, format) {
            # the svg is rendered by the client, so only the client can save it
            reject('svg elements cannot be saved by the engine')
        },
        fromProtoBuf=function(element, oChanges, vChanges) {

            if ( ! private$.stale)
                return()

            # Html$fromProtoBuf() performs the staleness handling, and reads the
            # content out of element$html -- which is empty for us. we read the
            # content we actually want out of element$svg below.

            super$fromProtoBuf(element, oChanges, vChanges)

            private$.content <- element$svg$content
            private$.scripts <- element$svg$scripts
            private$.stylesheets <- element$svg$stylesheets

            # the path of the harvested svg is assigned by the client, not by
            # us. we retain it so that it survives runs which leave this
            # element unchanged
            private$.path <- element$svg$path
        },
        asProtoBuf=function(incAsText=FALSE, status=NULL, includeState=TRUE) {

            element <- super$asProtoBuf(incAsText=incAsText, status=status, includeState=includeState)

            # assigning to svg clears the html which Html$asProtoBuf() assigned,
            # the two being members of the same oneof
            element$svg$content <- private$.content
            element$svg$scripts <- private$.scripts
            element$svg$stylesheets <- private$.stylesheets
            element$svg$path <- private$.path
            element
        }
    )
)
