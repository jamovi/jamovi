
testthat::context('utils')

testthat::test_that('extractRegexMatches() works', {
    content <- 'fred:jim && bob:will'
    matches <- gregexpr('[A-Za-z][A-Za-z0-9]*:[A-Za-z][A-Za-z0-9]*', content)
    testthat::expect_equal(extractRegexMatches(content, matches), c('fred:jim', 'bob:will'))
})

testthat::test_that('replaceRegexMatches() works', {
    content <- '(fred:jim && bob:will) || fred:glen'
    matches <- gregexpr('[A-Za-z][A-Za-z0-9]*:[A-Za-z][A-Za-z0-9]*', content)
    replaced <- replaceRegexMatches(content, matches, c('pow', 'wow', 'woo'))
    testthat::expect_equal(replaced, '(pow && wow) || woo')
})

testthat::test_that('htmlToText() works', {
    html <- '<h1>bruce</h1>'
    text <- htmlToText(html)
    testthat::expect_equal(text, 'bruce')

    html <- '<h1>bruce</h1>fred'
    text <- htmlToText(html)
    testthat::expect_equal(text, 'bruce\n\nfred')

    html <- '<p>p1</p><p>p2</p>'
    text <- htmlToText(html)
    testthat::expect_equal(text, 'p1\n\np2')

    html <- '&alpha; = 3'
    text <- htmlToText(html)
    testthat::expect_equal(text, '\u03B1 = 3')
})

testthat::test_that('select() passes attributes', {
    # GIVEN a data frame
    df <- data.frame(x=1, y=2)
    # AND an attribute added to this data frame
    attributeName <- 'jmv-weights'
    attributeValue <- 3
    attr(df, attributeName) <- attributeValue

    # WHEN a certain column is selected
    dfNew <- jmvcore::select(df, c("y"))

    # THEN the attribute is present in the subset
    newAttributes <- attributes(dfNew)
    testthat::expect_true(attributeName %in% names(newAttributes))
    # AND the value remains the same
    testthat::expect_equal(newAttributes[[attributeName]], attributeValue)
})
