
context('options')

test_that('OptionNumber works', {
    number <- OptionNumber$new(
        'number',
        value=1,
        min=0,
        max=2)

    expect_equal(number$value, 1)

    number$value <- 7

    number$value <- 0.5
    expect_silent(number$check())
    number$value <- 5
    expect_error(number$check(), 'number must be between 0 and 2 (is 5)', fixed=TRUE)
})

test_that('OptionBool works', {
    bool <- OptionBool$new(
        'bool')

    expect_equal(bool$value, FALSE)
})


test_that('OptionColor works', {
    color <- OptionColor$new('color')
    expect_equal(color$value, '#000000')

    color <- OptionColor$new('color', value='#3E6DA9')
    expect_equal(color$value, '#3e6da9')
    expect_silent(color$check())

    color$value <- 'steelblue'
    expect_equal(color$value, '#4682b4')

    color$value <- '#abc'
    expect_equal(color$value, '#aabbcc')

    color$value <- 'abcdef'
    expect_equal(color$value, '#abcdef')
})

test_that('OptionColor rejects bad values', {
    for (value in list('notacolour', '#12345', 'transparent', '#ff000080', '2', 7, NULL)) {
        color <- OptionColor$new('color')
        color$value <- value
        expect_error(
            color$check(),
            "Argument 'color' must be a colour, such as '#3e6da9' or 'steelblue'",
            fixed=TRUE)
    }
})

test_that('OptionList works', {

    lst <- OptionList$new(
        name='list',
        options=list('a', 'b', 'c', 'd'))
    expect_equal(lst$value, 'a')

    lst <- OptionList$new(
        name='list',
        options=list(
            list(name='a', title='alpha'),
            list(name='b', title='beta'),
            list(name='c', title='ceta'),
            list(name='d', title='delta')))
    expect_equal(lst$value, 'a')

    lst <- OptionList$new(
        name='list',
        options=list('a', 'b', 'c', 'd'),
        value='b')
    expect_equal(lst$value, 'b')
})

test_that('OptionList rejects bad value', {
    lst <- OptionList$new(
        name='list',
        options=list('a', 'b', 'c'))
    lst$value <- 'e'
    expect_error(
        lst$check(),
        "Argument 'list' must be one of 'a', 'b', 'c'",
        fixed=TRUE)
})

test_that('OptionNMXList works', {

    lst <- OptionNMXList$new(
        name='list',
        options=c('a', 'b', 'c', 'd'))
    expect_equal(lst$value, character())

    lst <- OptionNMXList$new(
        name='list',
        options=list('a', 'b', 'c', 'd'),
        value=list('a'))
    expect_equal(lst$value, 'a')

    lst <- OptionNMXList$new(
        name='list',
        options=c('a', 'b', 'c', 'd'))
    lst$value <- 'a'
    expect_equal(lst$value, 'a')
})

test_that('OptionNMXList rejects bad values', {

    lst <- OptionNMXList$new(
        name='list',
        options=c('a', 'b', 'c'))
    lst$value <- 'd'
    expect_error(
        lst$check(),
        "Argument 'list' may only contain 'a', 'b', 'c'",
        fixed=TRUE)
})
