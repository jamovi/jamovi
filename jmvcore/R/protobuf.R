
RProtoBuf_new <- if (requireNamespace('RProtoBuf', quietly=TRUE)) RProtoBuf::new
RProtoBuf_serialize <- if (requireNamespace('RProtoBuf', quietly=TRUE)) RProtoBuf::serialize
RProtoBuf_read <- if (requireNamespace('RProtoBuf', quietly=TRUE)) RProtoBuf::read

initProtoBuf <- function() {
    if ( ! exists('jamovi.coms.Status')) {
        resultsProtoPath <- system.file("jamovi.proto", package="jmvcore")
        if (resultsProtoPath == "")
            resultsProtoPath <- system.file("inst", "jamovi.proto", package="jmvcore")
        if (resultsProtoPath == "")
            stop("jmvcore jamovi.proto not found!", call.=FALSE)

        if (requireNamespace('RProtoBuf', quietly=TRUE))
            RProtoBuf::readProtoFiles(resultsProtoPath)
        else
            stop('Could not load RProtoBuf')
    }
}
