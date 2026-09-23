
context('format')

test_that('numbers are formatted as in the results view', {

    column <- Column$new(
        options=Options$new(), name='x', title='x', superTitle=NULL,
        visible=TRUE, content=NULL, type='number', format='',
        combineBelow=FALSE, sortable=FALSE, refs=character())
    column$addCell(0.0318)
    column$addCell(37.2273)

    fmt <- determineFormat(column)
    expect_equal(fmt$dp, 5)
    expect_equal(formatValue(37.2273, fmt), '37.22730')
    expect_equal(formatValue(NA, fmt), '.')
    expect_equal(formatValue(NaN, fmt), 'NaN')
    expect_equal(formatValue(5L, fmt), '5')
})

test_that('the number format may be set with jmvcore.format', {

    table <- Table$new(title='Results')
    table$addColumn(name='x', title='x', type='number')
    table$addColumn(name='p', title='p', type='number', format='pvalue')
    table$addRow(rowKey=1, values=list(x=20.66333, p=0.0603934))

    # by default, a figure more than jamovi (but not for p-values)
    expect_match(table$asString(), '20.66    .060', fixed=TRUE)

    old <- options(jmvcore.format=list(digits=5, pDigits=4))
    on.exit(options(old))

    expect_match(table$asString(), '20.663    .0604', fixed=TRUE)

    options(jmvcore.format=list(style='dp', digits=1, pDigits=3))
    expect_match(table$asString(), '20.7    .060', fixed=TRUE)

    options(jmvcore.format=list(style='bad'))
    expect_error(table$asString(), "style and pStyle must be 'sf' or 'dp'")
})
