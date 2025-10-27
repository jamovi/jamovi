
# This file is a generated template, your changes will not be overwritten

openSesameClass <- if (requireNamespace('jmvcore', quietly=TRUE)) R6::R6Class(
    "openSesameClass",
    inherit = openSesameBase,
    private = list(
        .run = function() {

            if (self$options$open) {

                option <- self$options$option('open')
                option$perform(function(action) {
                    print(action$params)

                    # write the file to the fullPath
                    write.csv(ToothGrowth, file=action$params$fullPath, row.names=FALSE)
                    ToothGrowth <- rev(ToothGrowth)

                    # return a result object using params$path
                    list(
                        path = action$params$path,
                        title = 'the fish was delish',
                        ext = 'csv'
                    )
                })
            }

            if (self$options$open2) {
                option <- self$options$option('open2')
                option$perform(function(action) {
                    # return a data frame with a title
                    list(
                        data = ToothGrowth,
                        title = 'the fish was delish'
                    )
                })
            }

            if (self$options$error) {
                option <- self$options$option('error')
                option$perform(function(action) {
                    bruce()  # function which doesn't exist
                })
            }

        })
)
