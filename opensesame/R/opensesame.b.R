
# This file is a generated template, your changes will not be overwritten

openSesameClass <- if (requireNamespace('jmvcore', quietly=TRUE)) R6::R6Class(
    "openSesameClass",
    inherit = openSesameBase,
    private = list(
        .run = function() {

            if (self$options$open) {

                open <- self$results$get('open')
                params <- open$params

                print(params)

                # write the file to the fullPath
                write.csv(datasets::ToothGrowth, file=params$fullPath, row.names=FALSE)

                # construct a result object using params$path
                result <- list(
                    path = params$path,
                    title = 'the fish was delish',
                    ext = 'csv'
                )

                # set the result
                open$setResult(result)
            }

        })
)
