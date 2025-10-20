
context('table')

test_that('Table works', {

    table <- Table$new()
    table$addColumn(
        name='1',
        title='Column 1',
        type='text')
    table$addColumn(
        name='2',
        title='Column 2',
        type='text')
    table$addColumn(
        name='3',
        title='Column 3',
        type='text')

    table$addRow(rowKey=1)
    table$addRow(rowKey=2)
    table$addRow(rowKey=3)

    table$setRow(rowKey=1, values=list(`1`='x', `2`='y', `3`='z'))
    table$setRow(rowKey=2, values=list(`1`='a', `2`='b'))
    table$setRow(rowKey=3, values=list(`1`='c'))

    expect_equal(table$isFilled(), FALSE)

    # check as.data.frame
    as.data.frame(table)

    # columns
    expect_equal(table$isFilled(col=1), TRUE)
    expect_equal(table$isFilled(col=2), FALSE)
    expect_equal(table$isFilled(col=3), FALSE)
    expect_equal(table$isFilled(col='1'), TRUE)
    expect_equal(table$isFilled(col='2'), FALSE)
    expect_equal(table$isFilled(col='3'), FALSE)

    # rows
    expect_equal(table$isFilled(rowNo=1), TRUE)
    expect_equal(table$isFilled(rowNo=2), FALSE)
    expect_equal(table$isFilled(rowNo=3), FALSE)
    expect_equal(table$isFilled(rowKey=1), TRUE)
    expect_equal(table$isFilled(rowKey=2), FALSE)
    expect_equal(table$isFilled(rowKey=3), FALSE)

    # cells
    expect_equal(table$isFilled(rowNo=1, col=1), TRUE)
    expect_equal(table$isFilled(rowNo=2, col=1), TRUE)
    expect_equal(table$isFilled(rowNo=3, col=1), TRUE)
    expect_equal(table$isFilled(rowNo=1, col=2), TRUE)
    expect_equal(table$isFilled(rowNo=2, col=2), TRUE)
    expect_equal(table$isFilled(rowNo=3, col=2), FALSE)
    expect_equal(table$isFilled(rowNo=1, col=3), TRUE)
    expect_equal(table$isFilled(rowNo=2, col=3), FALSE)
    expect_equal(table$isFilled(rowNo=3, col=3), FALSE)

    expect_equal(table$isFilled(rowKey=1, col=1), TRUE)
    expect_equal(table$isFilled(rowKey=2, col=1), TRUE)
    expect_equal(table$isFilled(rowKey=3, col=1), TRUE)
    expect_equal(table$isFilled(rowKey=1, col=2), TRUE)
    expect_equal(table$isFilled(rowKey=2, col=2), TRUE)
    expect_equal(table$isFilled(rowKey=3, col=2), FALSE)
    expect_equal(table$isFilled(rowKey=1, col=3), TRUE)
    expect_equal(table$isFilled(rowKey=2, col=3), FALSE)
    expect_equal(table$isFilled(rowKey=3, col=3), FALSE)


    test_that('Table rejects bad things', {

        expect_error(table$setRow(rowKey=1, values=list(`1`=list(5))), "Table$setRow(): value '1' is not atomic", fixed=TRUE)
        expect_error(table$setRow(rowKey=1, values=list(`2`=list())),  "Table$setRow(): value '2' is not atomic", fixed=TRUE)
        expect_error(table$setTitle(list('moose')), "setTitle(): title must be a string", fixed=TRUE)
    })

})

test_that('Table folding works', {

    options <- Options$new()

    vars <- jmvcore::OptionVariables$new('vars', 'len')
    group <- jmvcore::OptionVariable$new('group', 'dose')
    students <- jmvcore::OptionBool$new('students', TRUE)
    bf <- jmvcore::OptionBool$new('bf', FALSE)
    meanDiff <- jmvcore::OptionBool$new('meanDiff', FALSE)
    ci <- jmvcore::OptionBool$new('ci', FALSE)
    es <- jmvcore::OptionBool$new('effectSize', FALSE)
    mann <- jmvcore::OptionBool$new('mann', FALSE)
    welc <- jmvcore::OptionBool$new('welchs', TRUE)

    options$.addOption(vars)
    options$.addOption(group)
    options$.addOption(students)
    options$.addOption(bf)
    options$.addOption(meanDiff)
    options$.addOption(ci)
    options$.addOption(es)
    options$.addOption(mann)
    options$.addOption(welc)

    table <- jmvcore::Table$new(
        options=options,
        name="ttest",
        title="Independent Samples T-Test",
        rows="(vars)",
        clearWith=list(
            "group"),
        columns=list(
            list(`name`="var[stud]", `title`="", `content`="($key)", `type`="text", `combineBelow`=TRUE, `visible`="(students)"),
            list(`name`="name[stud]", `title`="", `type`="text", `content`="Student's t", `visible`="(students)"),
            list(`name`="stat[stud]", `title`="statistic", `type`="number", `visible`="(students)"),
            list(`name`="err[stud]", `title`="error %", `type`="number", `visible`="(students && bf)", `content`=""),
            list(`name`="df[stud]", `title`="df", `type`="number", `visible`="(students)"),
            list(`name`="p[stud]", `title`="p", `type`="number", `format`="zto,pvalue", `visible`="(students)"),
            list(`name`="md[stud]", `title`="Mean difference", `type`="number", `visible`="(meanDiff && students)"),
            list(`name`="sed[stud]", `title`="SE difference", `type`="number", `visible`="(meanDiff && students)"),
            list(`name`="es[stud]", `title`="Cohen's d", `type`="number", `visible`="(effectSize && students)"),
            list(`name`="cil[stud]", `title`="Lower", `type`="number", `visible`="(ci && students)"),
            list(`name`="ciu[stud]", `title`="Upper", `type`="number", `visible`="(ci && students)"),
            list(`name`="var[bf]", `title`="", `content`="($key)", `type`="text", `combineBelow`=TRUE, `visible`="(bf)"),
            list(`name`="name[bf]", `title`="", `type`="text", `content`="Bayes factor\u2081\u2080", `visible`="(bf)"),
            list(`name`="stat[bf]", `title`="statistic", `type`="number", `visible`="(bf)"),
            list(`name`="err[bf]", `title`="\u00B1%", `type`="number", `visible`="(bf)"),
            list(`name`="df[bf]", `title`="df", `type`="number", `visible`="(bf)", `content`=""),
            list(`name`="p[bf]", `title`="p", `type`="number", `format`="zto,pvalue", `visible`="(bf)", `content`=""),
            list(`name`="md[bf]", `title`="Mean difference", `type`="number", `visible`="(meanDiff && bf)", `content`=""),
            list(`name`="sed[bf]", `title`="SE difference", `type`="number", `visible`="(meanDiff && bf)", `content`=""),
            list(`name`="es[bf]", `title`="Cohen's d", `type`="number", `visible`="(effectSize && bf)", `content`=""),
            list(`name`="cil[bf]", `title`="Lower", `type`="number", `visible`="(ci && bf)", `content`=""),
            list(`name`="ciu[bf]", `title`="Upper", `type`="number", `visible`="(ci && bf)", `content`=""),
            list(`name`="var[welc]", `title`="", `content`="($key)", `type`="text", `combineBelow`=TRUE, `visible`="(welchs)"),
            list(`name`="name[welc]", `title`="", `type`="text", `content`="Welch's t", `visible`="(welchs)"),
            list(`name`="stat[welc]", `title`="statistic", `visible`="(welchs)"),
            list(`name`="err[welc]", `title`="\u00B1%", `type`="number", `visible`="(welchs && bf)", `content`=""),
            list(`name`="df[welc]", `title`="df", `type`="number", `visible`="(welchs)"),
            list(`name`="p[welc]", `title`="p", `type`="number", `format`="zto,pvalue", `visible`="(welchs)"),
            list(`name`="md[welc]", `title`="Mean difference", `type`="number", `visible`="(meanDiff && welchs)"),
            list(`name`="sed[welc]", `title`="SE difference", `type`="number", `visible`="(meanDiff && welchs)"),
            list(`name`="es[welc]", `title`="Cohen's d", `type`="number", `visible`="(effectSize && welchs)"),
            list(`name`="cil[welc]", `title`="Lower", `type`="number", `visible`="(ci && welchs)"),
            list(`name`="ciu[welc]", `title`="Upper", `type`="number", `visible`="(ci && welchs)"),
            list(`name`="var[mann]", `title`="", `content`="($key)", `type`="text", `combineBelow`=TRUE, `visible`="(mann)"),
            list(`name`="name[mann]", `title`="", `type`="text", `content`="Mann-Whitney U", `visible`="(mann)"),
            list(`name`="stat[mann]", `title`="statistic", `content`=".", `visible`="(mann)"),
            list(`name`="err[mann]", `title`="\u00B1%", `type`="number", `visible`="(mann && bf)", `content`=""),
            list(`name`="p[mann]", `title`="p", `type`="number", `format`="zto,pvalue", `visible`="(mann)"),
            list(`name`="md[mann]", `title`="Mean difference", `type`="number", `visible`="(meanDiff && mann)"),
            list(`name`="sed[mann]", `title`="SE difference", `type`="number", `visible`="(meanDiff && mann)"),
            list(`name`="es[mann]", `title`="Cohen's d", `type`="number", `visible`="(effectSize && mann)"),
            list(`name`="cil[mann]", `title`="Lower", `type`="number", `visible`="(ci && mann)"),
            list(`name`="ciu[mann]", `title`="Upper", `type`="number", `visible`="(ci && mann)")))

    table$.update()

    fold(table)
})
