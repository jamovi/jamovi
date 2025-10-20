
data('ToothGrowth')

options <- Options$new()
results <- Group$new(options)

analysis <- Analysis$new(
    package='bruce',
    name='bruce',
    version='0.0.0',
    options=options,
    results=results,
    data=ToothGrowth)

number <- OptionNumber$new(
    name='number',
    value=7)

var <- OptionVariable$new(
    name='var')
var$value <- 'supp'

group <- OptionVariable$new(
    name='group')

flux <- OptionBool$new(
    name='flux')

flox <- OptionBool$new(
    name='flox')

flyx <- OptionBool$new(
    name='flyx')
flyx$value <- TRUE

nmx <- OptionNMXList$new(
    name='nmx',
    options=c(
        'fred',
        'jim',
        'bob'))
nmx$value <- c('jim', 'bob')

options$.addOption(number)
options$.addOption(var)
options$.addOption(group)
options$.addOption(flux)
options$.addOption(flox)
options$.addOption(flyx)
options$.addOption(nmx)

test_that('basic bindings work', {
    expect_equal(options$eval('(number)'), 7)
    expect_equal(options$eval('(var)'), 'supp')
    expect_equal(options$eval('(levels(var))'), c('OJ', 'VC'))
    expect_equal(options$eval('($key)', .key='dose'), 'dose')
    expect_equal(options$eval('(levels($key))', .key='supp'), c('OJ', 'VC'))
    expect_equal(options$eval('(flux)'), FALSE)
    expect_equal(options$eval('(flyx)'), TRUE)
    expect_equal(options$eval('(flux && flyx)'), FALSE)
    expect_equal(options$eval('(group)'), NULL)
    expect_equal(options$eval('(levels(group))'), character())
    expect_equal(options$eval('(nmx:fred)'), FALSE)
    expect_equal(options$eval('(nmx:jim)'), TRUE)
    expect_equal(options$eval('(nmx:bob)'), TRUE)
    expect_equal(options$eval('(nmx:bob && nmx:jim)'), TRUE)
    expect_equal(options$eval('(nmx:bob && nmx:fred)'), FALSE)
    expect_equal(options$eval('(nmx:bob || nmx:fred)'), TRUE)
    expect_equal(options$eval('(nmx:bob && (nmx:jim || nmx:fred))'), TRUE)
    expect_equal(options$eval('(nmx:bob && flyx)'), TRUE)
})

