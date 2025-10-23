
# This file is a generated template, your changes will not be overwritten

openSesameClass <- if (requireNamespace('jmvcore', quietly=TRUE)) R6::R6Class(
    "openSesameClass",
    inherit = openSesameBase,
    private = list(
        .run = function() {

            if (self$options$open) {

                option <- self$options$option('open')

                for (i in 1:3) {
                    action <- option$perform()

                    print(action$params)

                    # write the file to the fullPath
                    write.csv(ToothGrowth, file=action$params$fullPath, row.names=FALSE)
                    ToothGrowth <- rev(ToothGrowth)

                    # construct a result object using params$path
                    result <- list(
                        path = action$params$path,
                        title = 'the fish was delish',
                        ext = 'csv'
                    )

                    # set the result
                    action$setResult(result)
                }
            }

        })
)
