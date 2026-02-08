
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
        .plot=NA,
        .widthM=400,
        .widthB=0,
        .heightM=300,
        .heightB=0),
    active=list(
        width=function() private$.width,
        height=function() private$.height,
        filePath=function() private$.filePath,
        requiresData=function() private$.requiresData,
        plot=function() {
            if (is.null(private$.plot))
                private$.plot <- self$analysis$.createPlotObject(funName=private$.renderFun, image=self)
            return(private$.plot)
        },
        size=function() {

            widthScaleOptionName <- paste('results', self$path, 'widthScale', sep='/')
            heightScaleOptionName <- paste('results', self$path, 'heightScale', sep='/')
            widthScaleOption <- self$options$option(widthScaleOptionName)
            heightScaleOption <- self$options$option(heightScaleOptionName)
            if ( ! is.null(widthScaleOption)) {
                widthScale <- widthScaleOption$value
            } else {
                widthScale <- 1
            }
            if ( ! is.null(heightScaleOption)) {
                heightScale <- heightScaleOption$value
            } else {
                heightScale <- 1
            }

            if (private$.widthM == 0
                && private$.widthB == 0
                && private$.heightM == 0
                && private$.heightB == 0)
            {
                width <- private$.width * widthScale
                height <- private$.height * heightScale
            } else {
                width <- private$.widthM * widthScale + private$.widthB
                height <- private$.heightM * heightScale + private$.heightB
            }

            width <- as.integer(round(width))
            height <- as.integer(round(height))

            if (width < 32)
                width <- 32
            if (height < 32)
                height <- 32

            list(width=width, height=height)
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
            refs=character(),
            ...) {

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

            private$.widthM <- width
            private$.widthB <- 0
            private$.heightM <- height
            private$.widthB <- 0
        },
        setSize=function(width, height) {
            private$.width <- width
            private$.height <- height
            private$.widthM <- width
            private$.heightM <- height
        },
        setSize2=function(widthM, heightM, widthB=0, heightB=0) {
            private$.width <- widthM
            private$.height <- heightM
            private$.widthM <- widthM
            private$.heightM <- heightM
            private$.widthB <- widthB
            private$.heightB <- heightB
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

            decSymbol <- self$options$decSymbol
            currentDecSymbol <- getOption('OutDec', '.')
            if (decSymbol != '.' && currentDecSymbol != decSymbol) {
                options(OutDec=decSymbol)
                on.exit(options(OutDec=currentDecSymbol), add=TRUE)
            }

            size <- self$size

            if (endsWith(tolower(path), '.pptx')) {
                requireNamespace('export', quietly=TRUE, mustWork=TRUE)
                export::graph2ppt(
                    file=path,
                    width=size$width/72,
                    height=size$height/72,
                    fun=self$print,
                    margins=c(0, 0, 0, 0))
                return()
            }

            if (endsWith(tolower(path), '.pdf')) {
                cairo_pdf(
                    file=path,
                    width=size$width/72,
                    height=size$height/72)
            } else if (endsWith(tolower(path), '.svg')) {
                svg(
                    file=path,
                    width=size$width/72,
                    height=size$height/72)
            } else if (endsWith(tolower(path), '.eps')) {
                cairo_ps(
                    file=path,
                    width=size$width/72,
                    height=size$height/72)
            } else if (endsWith(tolower(path), '.png')) {

                multip <- 144 / 72
                grType <- 'cairo'
                if (Sys.info()['sysname'] == 'Windows')
                    grType <- 'windows'
                else if (Sys.info()['sysname'] == 'Darwin')
                    grType <- 'quartz'

                width <- size$width * multip
                height <- size$height * multip

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

            size = self$size

            image <- RProtoBuf_new(jamovi.coms.ResultsImage,
                width=size$width,
                height=size$height,
                path=path,
                widthM=private$.widthM,
                widthB=private$.widthB,
                heightM=private$.heightM,
                heightB=private$.heightB)

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

            size <- self$size
            sizeChanged <- (size$width != image$width || size$height != image$height)

            private$.width <- size$width
            private$.height <- size$height

            if (sizeChanged || image$path == '' || 'theme' %in% oChanges || 'palette' %in% oChanges) {
                private$.filePath <- NULL
            } else {
                private$.filePath <- image$path
            }
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
