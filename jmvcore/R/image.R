
#' @rdname Analysis
#' @export
Image <- R6::R6Class("Image",
    inherit=ResultsElement,
    private=list(
        .filePath=NA,
        .width=400,
        .height=300,
        .renderInitFun=NA,
        .renderFun=NA,
        .requiresData=FALSE,
        .plot=NA),
    active=list(
        width=function() private$.width,
        height=function() private$.height,
        filePath=function() private$.filePath,
        requiresData=function() private$.requiresData,
        plot=function() {
            if (is.null(private$.plot))
                private$.plot <- self$analysis$.createPlotObject(funName=private$.renderFun, image=self)
            return(private$.plot)
        }),
    public=list(
        initialize=function(
            options,
            width=400,
            height=300,
            renderFun=NULL,
            renderInitFun=NULL,
            requiresData=FALSE,
            name=NULL,
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

            private$.width <- width
            private$.height <- height
            private$.renderFun <- renderFun
            private$.renderInitFun <- renderInitFun
            private$.requiresData <- requiresData

            private$.filePath <- NULL
            private$.plot <- NULL
        },
        setSize=function(width, height) {
            private$.width  <- width
            private$.height <- height
        },
        isFilled=function() {
            if (is.null(private$.filePath))
                return(FALSE)
            return(TRUE)
        },
        print=function() {
            self$.render()
        },
        saveAs=function(path, ...) {

            if (endsWith(tolower(path), '.pptx')) {
                requireNamespace('export', quietly=TRUE, mustWork=TRUE)
                export::graph2ppt(
                    file=path,
                    width=private$.width/72,
                    height=private$.height/72,
                    fun=self$print,
                    margins=c(0, 0, 0, 0))
                return()
            }

            if (endsWith(tolower(path), '.pdf')) {
                cairo_pdf(
                    file=path,
                    width=private$.width/72,
                    height=private$.height/72)
            } else if (endsWith(tolower(path), '.svg')) {
                svg(
                    file=path,
                    width=private$.width/72,
                    height=private$.height/72)
            } else if (endsWith(tolower(path), '.eps')) {
                cairo_ps(
                    file=path,
                    width=private$.width/72,
                    height=private$.height/72)
            } else if (endsWith(tolower(path), '.png')) {

                multip <- 144 / 72
                grType <- 'cairo'
                if (Sys.info()['sysname'] == 'Windows')
                    grType <- 'windows'
                else if (Sys.info()['sysname'] == 'Darwin')
                    grType <- 'quartz'

                width <- self$width * multip
                height <- self$height * multip

                if (width < 32)
                    width <- 32
                if (height < 32)
                    height <- 32

                if (requireNamespace('ragg', quietly=TRUE)) {
                    ragg::agg_png(
                        filename=path,
                        width=width,
                        height=height,
                        units='px',
                        background='transparent',
                        res=144)
                } else {
                    grDevices::png(type=grType,
                        filename=path,
                        width=width,
                        height=height,
                        bg='transparent',
                        res=144)
                }
            } else {
                reject('unrecognised format')
            }

            on.exit(grDevices::dev.off())

            self$analysis$.render(funName=private$.renderFun, image=self, ...)
        },
        .render=function(...) {
            self$analysis$.render(funName=private$.renderFun, image=self, ...)
        },
        .createImages=function(...) {
            self$analysis$.createImage(funName=private$.renderFun, image=self, ...)
        },
        .setPath=function(path) {
            private$.filePath <- path
        },
        asString=function() {
            return('')
        },
        asProtoBuf=function(incAsText=FALSE, status=NULL, includeState=TRUE) {

            path <- private$.filePath
            if (is.null(path))
                path=''

            image <- RProtoBuf_new(jamovi.coms.ResultsImage,
                width=private$.width,
                height=private$.height,
                path=path)

            result <- super$asProtoBuf(incAsText=incAsText, status=status, includeState=includeState)

            if (self$status == 'none' && self$isFilled()) {

                result$status <- jamovi.coms.AnalysisStatus$ANALYSIS_COMPLETE

            } else if (status == jamovi.coms.AnalysisStatus$ANALYSIS_COMPLETE &&
                ( ! is.null(self$state)) &&
                path == '') {
                    result$status <- jamovi.coms.AnalysisStatus$ANALYSIS_RENDERING
            }

            result$image <- image
            result
        },
        fromProtoBuf=function(element, oChanges, vChanges) {

            someChanges <- length(oChanges) > 0 || length(vChanges) > 0
            if (someChanges && base::identical('*', private$.clearWith))
                return()

            if (base::any(oChanges %in% private$.clearWith))
                return()

            for (clearName in private$.clearWith) {
                if (base::any(vChanges %in% private$.options$option(clearName)$vars))
                    return()
            }

            super$fromProtoBuf(element, oChanges, vChanges)

            image <- element$image

            private$.width <- image$width
            private$.height <- image$height
            if (image$path == '' || 'theme' %in% oChanges || 'palette' %in% oChanges)
                private$.filePath <- NULL
            else
                private$.filePath <- image$path
        },
        .setPlot=function(plot) {
            private$.plot <- plot
        })
)

#' @export
#' @importFrom utils .DollarNames
.DollarNames.Image <- function(x, pattern = "") {
    names <- ls(x, all.names=F, pattern = pattern)
    retain <- c('saveAs', 'plot', 'state')
    names <- intersect(names, retain)
    names
}
