
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

test_that('symbols and footnotes follow the value', {

    table <- Table$new(title='Results')
    table$addColumn(name='r', title='r', type='number')
    table$addRow(rowKey=1, values=list(r=-0.852))
    table$addRow(rowKey=2, values=list(r=0.25))
    table$addRow(rowKey=3, values=list(r=0.5))
    table$addSymbol(rowNo=1, col='r', '***')
    table$addSymbol(rowNo=2, col='r', '<sup>m</sup>')
    table$addFootnote(rowNo=2, col='r', 'a footnote')

    lines <- strsplit(table$asString(), '\n')[[1]]

    # the symbols first, then the footnotes, and the values stay aligned
    expect_true('   -0.8520 ***   ' %in% lines)
    expect_true('    0.2500 m\u1d43    ' %in% lines)
    expect_true('    0.5000       ' %in% lines)
})

test_that('symbols stay aligned in a folded table', {

    table <- Table$new(title='Results')
    table$addColumn(name='x[r]', title='x', type='number')
    table$addColumn(name='x[p]', title='x', type='number', format='pvalue')
    table$addRow(rowKey=1, values=list(`x[r]`=-0.852, `x[p]`=0.0001))
    table$addSymbol(rowNo=1, col='x[r]', '***')

    lines <- strsplit(table$asString(), '\n')[[1]]

    # each value formatted as its own column has it, lined up on the right,
    # with room after them for the symbols
    expect_true('   -0.8520 ***   ' %in% lines)
    expect_true('    <\u2009.001       ' %in% lines)
})
