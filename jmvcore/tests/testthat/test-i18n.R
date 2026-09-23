
context('i18n')

test_that('translations with a context are found', {

    messages <- list(list('Moyenne'), list('Moy.'))
    names(messages) <- c('Mean', 'stat\u0004Mean')
    langDef <- list(locale_data=list(messages=messages))
    translator <- Translator$new(langDef)

    expect_equal(translator$translate('Mean'), 'Moyenne')
    expect_equal(translator$translate('Mean [stat]'), 'Moy.')
    expect_equal(translator$translate('Mean [other]'), 'Moyenne')
    expect_equal(translator$translate('Median [stat]'), 'Median')
})

test_that("a '[' which isn't a context is left alone", {

    translator <- Translator$new(list())

    text <- 'Some text, and a [link](https://www.jamovi.org).'
    expect_equal(translator$translate(text), text)

    text <- 'a [b] c'
    expect_equal(translator$translate(text), text)

    # a context is lower case letters only, as in the client
    text <- 'See [Table 1]'
    expect_equal(translator$translate(text), text)
})
