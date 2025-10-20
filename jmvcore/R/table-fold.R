
fold <- function(input) {

    rowPlan <- list()
    foldedNames <- character()
    nFolds <- 1
    colNo <- 1

    for (column in input$columns) {
        if (column$visible) {
            columnName <- column$name
            foldedName <- columnName

            match <- regexec('^(.*)\\[.*\\]$', columnName)[[1]]
            if (length(match) > 1) {
                foldedName <- substring(columnName, match[2], attr(match, 'match.length')[2])
            }

            if (foldedName %in% names(rowPlan)) {
                rowPlan[[foldedName]] <- c(rowPlan[[foldedName]], colNo)
                nFolds <- max(nFolds, length(rowPlan[[foldedName]]))
            } else {
                foldedNames <- c(foldedNames, foldedName)
                rowPlan[[foldedName]] <- colNo
            }
        }

        colNo <- colNo + 1
    }

    if (nFolds == 1)
        return(input)

    output <- Table$new(
        options=input$options,
        name=input$name,
        title=input$title)

    for (note in input$notes)
        output$setNote(note$key, note$note, note$init)

    blankRow <- list()

    for (foldedName in names(rowPlan)) {
        folds <- rowPlan[[foldedName]]
        inColumn <- input$getColumn(folds[1])
        output$addColumn(
            name=foldedName,
            title=inColumn$title,
            type=inColumn$type,
            format=inColumn$format,
            combineBelow=inColumn$combineBelow)
        blankRow[[foldedName]] <- ''
    }

    rowNo <- 1

    for (i in seq_len(input$rowCount)) {
        if (i > 1) {
            output$addRow(rowKey=rowNo, values=blankRow)
            rowNo <- rowNo + 1
        }
        for (fold in seq_len(nFolds)) {
            output$addRow(rowKey=rowNo, values=blankRow)
            rowNo <- rowNo + 1
        }
    }

    for (rowNo in seq_len(input$rowCount)) {
        for (colNo in seq_along(rowPlan)) {
            foldedName <- foldedNames[colNo]
            foldedIndices <- rowPlan[[foldedName]]
            for (fold in seq_along(foldedIndices)) {
                index <- foldedIndices[fold];
                value <- input$getColumn(index)$.cellForPrint(rowNo)
                outRow <- ((rowNo - 1) * nFolds) + fold + (rowNo - 1)
                output$setCell(rowNo=outRow, colNo, value)
            }
        }
    }

    output
}

