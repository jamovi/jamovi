
context('htmlify')

test_that('tables are converted to html', {

    table <- Table$new(title='Results')
    table$addColumn(name='var[r]', title='', type='text', combineBelow=TRUE)
    table$addColumn(name='var[p]', title='', type='text', combineBelow=TRUE)
    table$addColumn(name='stat[r]', title='Stat', type='number')
    table$addColumn(name='stat[p]', title='Stat', type='number', format='pvalue')

    table$addRow(rowKey=1, values=list(`var[r]`='x', `var[p]`='x', `stat[r]`=0.5, `stat[p]`=0.00001))
    table$addRow(rowKey=2, values=list(`var[r]`='y', `var[p]`='y', `stat[r]`=-0.25, `stat[p]`=0.25))
    table$addFootnote(rowNo=1, col='stat[r]', 'a footnote')
    table$setNote('note', 'a note')

    html <- htmlify(table)

    # folded: two sub-rows per row, the text column spanning them
    expect_equal(lengths(regmatches(html, gregexpr('rowspan="2"', html))), 2)
    expect_match(html, '0.5000', fixed=TRUE)
    expect_match(html, '&lt;\u2009.001', fixed=TRUE)
    expect_match(html, '<sup>a</sup></span>', fixed=TRUE)
    expect_match(html, '<em>Note.</em> a note', fixed=TRUE)
    expect_match(html, '<sup>a</sup> a footnote', fixed=TRUE)

    # the rule beneath the body is heavier than those above it
    expect_match(html, 'vertical-align: bottom; border-bottom: 1px solid #333333;', fixed=TRUE)
    expect_match(html, 'border-bottom: 2px solid #333333;', fixed=TRUE)
})

test_that('folds begin and end a group', {

    table <- Table$new(title='Results')
    table$addColumn(name='stat[r]', title='Stat', type='number')
    table$addColumn(name='stat[s]', title='Stat', type='number')
    table$addColumn(name='stat[p]', title='Stat', type='number')
    table$addRow(rowKey=1, values=list(`stat[r]`=0.5, `stat[s]`=0.1, `stat[p]`=0.25))

    html <- htmlify(table)

    # the first row has 4px more padding above, the last 4px more below
    expect_match(html, '<td style="padding: 8px 20px 4px 8px;', fixed=TRUE)
    expect_match(html, '<td style="padding: 4px 20px 4px 8px;', fixed=TRUE)
    expect_match(html, '<td style="padding: 4px 20px 8px 8px;', fixed=TRUE)
})

test_that('the html honours jmvcore.format', {

    table <- Table$new(title='Results')
    table$addColumn(name='x', title='x', type='number')
    table$addRow(rowKey=1, values=list(x=20.66333))

    expect_match(htmlify(table), '>20.66<', fixed=TRUE)

    old <- options(jmvcore.format=list(digits=5))
    on.exit(options(old))

    expect_match(htmlify(table), '>20.663<', fixed=TRUE)
})

test_that('text needs commonmark', {

    text <- Text$new(options=Options$new(), name='text')
    text$setContent('Some **bold** text')

    expect_equal(htmlText(text), '<p>Some <strong>bold</strong> text</p>\n')

    local_mocked_bindings(hasCommonmark=function() FALSE)
    expect_error(htmlText(text), "needs the 'commonmark' package")
})
