
#' @rdname Analysis
#' @export
Group <- R6::R6Class("Group",
    inherit=ResultsElement,
    private=list(
        .items=NA,
        deep_clone=function(name, value) {
            if (name == '.items') {
                items <- list()
                for (name in names(value))
                    items[[name]] <- value[[name]]$clone(deep=TRUE)
                return(items)
            }
            value
        }),
    active=list(
        items=function() private$.items,
        itemNames=function() names(private$.items),
        visible=function() {
            for (item in private$.items) {
                if (item$visible)
                    return(TRUE)
            }
            return(FALSE)
        },
        asDF=function() {
            children <- paste0('\n    ...$', self$itemNames, '$asDF', collapse='')
            warning("This results group cannot be converted to a data frame.\n",
                 "Perhaps you mean to access some of it's children:",
                 children,
                 call.=FALSE)
            invisible(NULL)
        }
    ),
    public=list(
        initialize=function(
            options,
            name=NULL,
            title='no title',
            visible=TRUE,
            clearWith=NULL,
            refs=character()) {

            super$initialize(
                options=options,
                name=name,
                title=title,
                visible=visible,
                clearWith=clearWith,
                refs=refs)

            private$.items <- list()
        },
        get=function(name) {
            private$.items[[name]]
        },
        clear=function() {
            private$.items <- list()
        },
        .render=function(...) {
            rendered <- FALSE
            if (self$visible) {
                for (item in private$.items) {
                    if (item$visible)
                        rendered <- item$.render(...) || rendered
                }
            }
            rendered
        },
        .createImages=function(...) {
            rendered <- FALSE
            if (self$visible) {
                for (item in private$.items) {
                    if (item$visible)
                        rendered <- item$.createImages(...) || rendered
                }
            }
            rendered
        },
        add=function(item) {
            item$.setParent(self)
            private$.items[[item$name]] <- item
        },
        insert=function(index, item) {
            item$.setParent(self)
            if (index == 1) {
                before <- list()
            } else {
                before <- private$.items[1:(index-1)]
            }
            after <- private$.items[index:length(private$.items)]
            between <- list(item)
            names(between) <- item$name
            private$.items <- c(before, between, after)
        },
        remove=function(name) {
            index <- which(name == names(private$.items))
            if (length(index) == 0)
                return()
            if (index == 1) {
                before <- list()
            } else {
                before <- private$.items[1:(index-1)]
            }
            after <- private$.items[index:length(private$.items)]
            private$.items <- c(before, after)
        },
        isFilled=function() {
            for (item in private$.items) {
                if (item$visible && item$isNotFilled())
                    return(FALSE)
            }
            TRUE
        },
        getRefs=function(recurse=FALSE) {
            refs <- character()
            if (length(private$.items) == 0)
                return(refs)
            if (recurse) {
                for (child in private$.items) {
                    if (child$visible)
                        refs <- c(refs, child$getRefs(recurse))
                }
            }
            refs <- c(refs, super$getRefs(recurse))
            refs <- unique(refs)
            return(refs)
        },
        .update=function() {
            if (private$.updated)
                return()

            super$.update()

            for (item in private$.items)
                item$.update()
        },
        .lookup=function(path) {
            if (length(path) == 0 || identical(path, ""))
                return(self)

            first <- path[ 1]
            path  <- path[-1]

            element <- self$get(first)
            if (length(path) == 0)
                return(element)
            else
                return(element$.lookup(path))
        },
        .setKey=function(key, index) {
            super$.setKey(key, index)
            for (item in private$.items)
                item$.setKey(key, index)
        },
        asString=function() {

            noneVisible <- TRUE

            pieces <- c('\n ', base::toupper(self$title), '\n')

            for (item in private$.items) {
                if (item$visible && ! is(item, 'Image')) {
                    pieces <- c(pieces, item$asString())
                    noneVisible <- FALSE
                }
            }

            if (noneVisible)
                return('')

            v <- paste0(pieces, collapse="")
            v
        },
        fromProtoBuf=function(pb, oChanges, vChanges) {
            someChanges <- length(oChanges) > 0 || length(vChanges) > 0
            if (someChanges && base::identical('*', private$.clearWith))
                return()

            super$fromProtoBuf(pb, oChanges, vChanges)

            for (itemPB in pb$group$elements) {
                itemName <- itemPB$name
                target <- private$.items[[itemName]]

                if ( ! is.null(target))
                    target$fromProtoBuf(itemPB, oChanges, vChanges)
            }
        },
        asProtoBuf=function(incAsText=FALSE, status=NULL, prepend=NULL, append=NULL, includeState=TRUE) {
            group <- RProtoBuf::new(jamovi.coms.ResultsGroup)

            for (prep in prepend)
                group$add("elements", prep)

            for (item in private$.items) {
                itemPB <- item$asProtoBuf(incAsText=incAsText, status=status, includeState=includeState)
                if ( ! is.null(itemPB))
                    group$add("elements", itemPB)
            }

            result <- super$asProtoBuf(incAsText=incAsText, status=status, includeState=includeState)
            result$group <- group

            result
        },
        .setParent=function(parent) {
            private$.parent <- parent
            for (item in private$.items)
                item$.setParent(self)
        })
)

#' @export
length.Group <- function(x) {
    length(x$items)
}

#' @export
names.Group <- function(x) {
    x$itemNames
}

#' @export
`[[.Group` <- function(group, i) {
    group$get(i)
}

#' @export
as.data.frame.Group <- function(x, ..., stringsAsFactors = FALSE) {

    call <- as.character(sys.call(-1)[2])
    children <- paste0('\n    as.data.frame(', call, '$', x$itemNames, ')', collapse='')

    stop('This results group cannot be converted to a data frame.\n',
         'Perhaps you mean to access some of its children:',
         children,
         call.=FALSE)
}

#' @export
#' @importFrom utils .DollarNames
.DollarNames.Group <- function(x, pattern = "") {
    names <- ls(x, all.names=F, pattern = pattern)
    retain <- c(x$itemNames, 'asDF', 'asString')
    names <- intersect(names, retain)
    for (name in x$itemNames) {
        item <- x$get(name)
        if ( ! item$visible)
            names <- setdiff(names, name)
    }
    names
}
