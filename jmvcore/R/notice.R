
#' Different notice levels
#' @export
NoticeType = list(
    ERROR = as.integer(0),
    STRONG_WARNING = as.integer(1),
    WARNING = as.integer(2),
    INFO = as.integer(3))

#' @rdname Analysis
#' @export
Notice <- R6::R6Class("Notice",
    inherit=ResultsElement,
    private=list(
        .content=NA,
        .type=NA),
    active=list(
        content=function() private$.content,
        status=function() private$.status
    ),
    public=list(
        initialize=function(
            options,
            name='',
            title='',
            visible=TRUE,
            clearWith='*',
            refs=character(),
            type=NoticeType$ERROR,
            content='') {

            super$initialize(
                options=options,
                name=name,
                title=title,
                visible=visible,
                clearWith=clearWith,
                refs=refs)

            private$.content <- content
            private$.type <- type
        },
        setContent=function(content) {
            private$.content <- content
            private$.stale <- FALSE
        },
        set=function(type, content) {
            private$.content <- content
            private$.type <- type
            private$.stale <- FALSE
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
        asProtoBuf=function(incAsText=FALSE, status=NULL, includeState=TRUE) {
            element <- super$asProtoBuf(incAsText=TRUE, status=status, includeState=includeState)
            element$notice$type <- private$.type
            element$notice$content <- private$.content
            element
        }
    )
)
