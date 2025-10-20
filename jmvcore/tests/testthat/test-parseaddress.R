
context('parse address')

test_that('parseAddress() works', {
    expect_equal(parseAddress('fred'), 'fred')
    expect_equal(parseAddress('fred/jim'), c('fred', 'jim'))
    expect_equal(parseAddress('fred/jim/bob'), c('fred', 'jim', 'bob'))
    expect_equal(parseAddress('fred/"moose"/bob'), c('fred', '"moose"', 'bob'))
    expect_equal(parseAddress('fred/["len", "bob"]/bob'), c('fred', '["len", "bob"]', 'bob'))
})


