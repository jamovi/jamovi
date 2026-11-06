
context('addons')

# an analysis (jmv::anova) and its addon (jdmrt::dmrt). the addon's options
# are carried in the analysis' options, named addons/jdmrt/dmrt/<option>

anovaOptions <- function() {
    options <- Options$new(package='jmv', name='anova')
    options$.addOption(OptionVariables$new('factors', value=list('fert')))
    options$.addOption(OptionNumber$new('alpha', value=0.05))
    options
}

dmrtOptions <- function(parent=anovaOptions()) {
    options <- Options$new(package='jdmrt', name='dmrt')
    options$.addOption(OptionNumber$new('alpha', value=0.05))
    options$.setParentOptions(parent)
    options
}

numberPB <- function(value) {
    # (not new(..., d=value), d partially matches new()'s descriptor)
    initProtoBuf()
    pb <- RProtoBuf_new(jamovi.coms.AnalysisOption)
    pb$d <- value
    pb
}

optionsPB <- function(...) {
    initProtoBuf()
    values <- list(...)
    pb <- RProtoBuf_new(jamovi.coms.AnalysisOptions)
    pb$hasNames <- TRUE
    for (name in names(values)) {
        pb$add('names', name)
        pb$add('options', numberPB(values[[name]]))
    }
    pb
}

# a preformatted, restored from a saved state with the changes given
restored <- function(options, clearWith, oChanges=character(), vChanges=character()) {
    initProtoBuf()
    pre <- Preformatted$new(options, 'pre', clearWith=clearWith)
    pb <- RProtoBuf_new(jamovi.coms.ResultsElement, name='pre', preformatted='saved', stale=FALSE)
    pre$fromProtoBuf(pb, oChanges, vChanges)
    pre
}

test_that('an addon maps its option names to the names they are carried as', {

    parent <- anovaOptions()
    addon <- Options$new(package='jdmrt', name='dmrt')
    addon$.addOption(OptionNumber$new('alpha', value=0.05))

    # not (yet) an addon
    expect_equal(addon$.rootNames(c('alpha', 'parent:factors')), c('alpha', 'parent:factors'))

    addon$.setParentOptions(parent)
    expect_equal(
        addon$.rootNames(c('alpha', 'parent:factors')),
        c('addons/jdmrt/dmrt/alpha', 'factors'))
    expect_equal(addon$.rootNames('*'), '*')
    expect_equal(addon$.rootNames(character()), character())

    expect_identical(addon$.rootOption('addons/jdmrt/dmrt/alpha'), addon$option('alpha'))
    expect_identical(addon$.rootOption('factors'), parent$option('factors'))
})

test_that("an addon's options round trip through the names they are carried as", {

    addon <- dmrtOptions()
    addon$fromProtoBuf(optionsPB(alpha=0.05))

    root <- addon$.rootProtoBuf()
    expect_equal(root$names, 'addons/jdmrt/dmrt/alpha')

    # what's carried for anyone else is left out
    root$add('names', 'addons/other/addon/alpha')
    root$add('options', numberPB(0.5))

    back <- addon$.fromRootProtoBuf(root)
    expect_equal(back$names, 'alpha')
    expect_equal(addon$compProtoBuf(back), character())

    alpha <- addon$option('alpha')
    alpha$value <- 0.01
    expect_equal(addon$compProtoBuf(back), 'alpha')
})

test_that("an addon's results clear with its own options", {

    addon <- dmrtOptions()

    pre <- restored(addon, list('alpha'), oChanges='addons/jdmrt/dmrt/alpha')
    expect_false(pre$isFilled())

    # the parent's option of the same name is another option
    pre <- restored(addon, list('alpha'), oChanges='alpha')
    expect_true(pre$isFilled())
})

test_that("an addon's results clear with its parent's options", {

    addon <- dmrtOptions()

    pre <- restored(addon, list('parent:factors'), oChanges='factors')
    expect_false(pre$isFilled())

    pre <- restored(addon, list('parent:factors'), oChanges='addons/jdmrt/dmrt/alpha')
    expect_true(pre$isFilled())

    # and with changes to the data of the parent's variables
    pre <- restored(addon, list('parent:factors'), vChanges='fert')
    expect_false(pre$isFilled())

    pre <- restored(addon, list('parent:factors'), vChanges='yield')
    expect_true(pre$isFilled())
})

test_that("an analysis' results clear as before", {

    options <- anovaOptions()

    expect_false(restored(options, list('alpha'), oChanges='alpha')$isFilled())
    expect_true(restored(options, list('alpha'), oChanges='addons/jdmrt/dmrt/alpha')$isFilled())
    expect_false(restored(options, list('factors'), vChanges='fert')$isFilled())
    expect_false(restored(options, '*', oChanges='alpha')$isFilled())
    expect_false(restored(options, '*', vChanges='fert')$isFilled())
    expect_true(restored(options, '*')$isFilled())
})

test_that("'*' clears with the changes an element's results might depend on", {

    parent <- anovaOptions()
    addon <- dmrtOptions(parent)

    # an analysis' results don't depend on its addons' options
    expect_true(restored(parent, '*', oChanges='addons/jdmrt/dmrt/alpha')$isFilled())

    # an addon's depend on its own, and its parent's
    expect_false(restored(addon, '*', oChanges='addons/jdmrt/dmrt/alpha')$isFilled())
    expect_false(restored(addon, '*', oChanges='alpha')$isFilled())

    # but not another addon's
    expect_true(restored(addon, '*', oChanges='addons/other/addon/alpha')$isFilled())
})

# an analysis with an addon, each with an alpha, as the engine creates them
# for each run. own and duncan are results of the analysis and of the addon,
# each clearing with its alpha
withAddon <- function(statePath, alpha, addonAlpha) {

    options <- Options$new(package='jmvcore', name='anova', requiresData=FALSE)
    options$.addOption(OptionNumber$new('alpha', value=0.05))
    options$fromProtoBuf(optionsPB(alpha=alpha))
    results <- Group$new(options=options, name='', title='')
    analysis <- Analysis$new(package='jmvcore', name='anova', version=c(1,0,0),
        options=options, results=results, data=data.frame(x=1), analysisId=1L)
    analysis$.setStatePathSource(function() statePath)

    addonOptions <- Options$new(package='jmvcore', name='dmrt', requiresData=FALSE)
    addonOptions$.addOption(OptionNumber$new('alpha', value=0.05))
    addonOptions$fromProtoBuf(optionsPB(alpha=addonAlpha))
    addon <- Analysis$new(package='jmvcore', name='dmrt', version=c(1,0,0),
        options=addonOptions, results=Group$new(options=addonOptions, name='', title=''),
        analysisId=1L)
    analysis$addAddon(addon)

    own <- Preformatted$new(options, 'own', clearWith=list('alpha'))
    own$setContent('anova')
    results$add(own)
    duncan <- Preformatted$new(addonOptions, 'duncan', clearWith=list('alpha'))
    duncan$setContent('letters')
    results$add(duncan)

    list(analysis=analysis, own=own, duncan=duncan)
}

test_that("the state tells .load() what's changed for each addon", {

    statePath <- tempfile()
    on.exit(unlink(statePath))

    withAddon(statePath, alpha=0.05, addonAlpha=0.05)$analysis$.save()
    expect_gt(file.size(statePath), 0)

    # nothing changed
    run <- withAddon(statePath, alpha=0.05, addonAlpha=0.05)
    run$analysis$.load()
    expect_true(run$own$isFilled())
    expect_true(run$duncan$isFilled())

    # the addon's alpha changed
    run <- withAddon(statePath, alpha=0.05, addonAlpha=0.01)
    run$analysis$.load()
    expect_true(run$own$isFilled())
    expect_false(run$duncan$isFilled())

    # the analysis' alpha changed
    run <- withAddon(statePath, alpha=0.01, addonAlpha=0.05)
    run$analysis$.load()
    expect_false(run$own$isFilled())
    expect_true(run$duncan$isFilled())
})

# an analysis (jmv::anova) and an addon (jDMRT::anovaDuncan) of the class
# given, with a result of its own (duncan) when withResult
anovaWithAddon <- function(addonClass=Analysis, withResult=TRUE) {

    options <- Options$new(package='jmv', name='anova', requiresData=FALSE)
    results <- Group$new(options=options, name='', title='ANOVA')
    own <- Preformatted$new(options, 'own')
    own$setContent('anova')
    results$add(own)
    analysis <- Analysis$new(package='jmv', name='anova', version=c(1,0,0),
        options=options, results=results, data=data.frame(x=1), analysisId=1L)

    addonOptions <- Options$new(package='jDMRT', name='anovaDuncan', requiresData=FALSE)
    addonResults <- Group$new(options=addonOptions, name='', title='Duncan')
    if (withResult)
        addonResults$add(Preformatted$new(addonOptions, 'duncan'))
    addon <- addonClass$new(package='jDMRT', name='anovaDuncan', version=c(1,0,0),
        options=addonOptions, results=addonResults, analysisId=1L)
    analysis$addAddon(addon)

    list(analysis=analysis, addon=addon, results=results)
}

# an addon which places its results among its parent's (as addons do), and
# fails in failIn ('init' or 'run')
FailingAddon <- R6::R6Class('FailingAddon',
    inherit=Analysis,
    public=list(
        failIn='run',
        ran=FALSE),
    private=list(
        .init=function() {
            for (item in self$results$items)
                self$parent$results$add(item)
            if (self$failIn == 'init')
                stop('the addon failed')
        },
        .run=function() {
            self$ran <- TRUE
            if (self$failIn == 'run')
                stop('the addon failed')
        }))

test_that("an addon's references come from its own package", {

    local_mocked_bindings(.package='jmvcore', packageRefs=function(package) {
        R <- list(type='software', author='R Core Team', year='2025', title='R')
        if (package == 'jmv')
            list(R=R)
        else if (package == 'jDMRT')
            list(duncan1955=list(type='article', author='Duncan, D. B.', year='1955', title='Multiple range and multiple F tests'),
                 R=list(type='software', author='not this one', year='2025', title='R'))
        else
            list()
    })

    run <- anovaWithAddon()
    run$results$items$own$setRefs('R')
    duncan <- run$addon$results$items$duncan
    duncan$setContent('letters')
    duncan$setRefs('duncan1955')
    run$results$add(duncan)

    refs <- run$analysis$asProtoBuf()$references
    names <- vapply(refs, function(ref) ref$name, '')
    authors <- vapply(refs, function(ref) ref$authors$complete, '')
    expect_setequal(names, c('R', 'duncan1955'))
    # the analysis' own package's reference takes precedence
    expect_equal(authors[names == 'R'], 'R Core Team')
})

test_that("an addon's error is shown in its results, not its parent's", {

    for (failIn in c('init', 'run')) {
        run <- anovaWithAddon(FailingAddon)
        run$addon$failIn <- failIn
        run$analysis$run()

        expect_true(run$analysis$complete)
        expect_true(run$addon$errored)
        expect_equal(run$results$items$duncan$status, 'error')
        expect_equal(run$results$items$own$status, 'none')
        # an addon which fails isn't carried on with
        expect_equal(run$addon$ran, failIn == 'run')
    }
})

test_that("an addon's error is shown when it has no results of its own placed", {

    run <- anovaWithAddon(FailingAddon, withResult=FALSE)
    run$analysis$run()

    expect_true(run$analysis$complete)
    notice <- run$results$items[['.addon-jDMRT-anovaDuncan']]
    expect_false(is.null(notice))
    expect_equal(notice$status, 'error')
})

# counts its runs
CountingAnalysis <- R6::R6Class('CountingAnalysis',
    inherit=Analysis,
    public=list(
        runs=0),
    private=list(
        .run=function() {
            self$runs <- self$runs + 1
        }))

# jmv::anova (complete when filled) with an addon, each with an alpha and a
# result clearing with it, for each run as the engine creates them. the
# addon is complete when filled, or not (like jDMRT, whose table, duncan,
# gets its rows when it runs)
completeWhenFilled <- function(statePath, alpha, addonAlpha, addonCompleteWhenFilled) {

    options <- Options$new(package='jmvcore', name='anova', requiresData=FALSE)
    options$.addOption(OptionNumber$new('alpha', value=0.05))
    options$fromProtoBuf(optionsPB(alpha=alpha))
    results <- Group$new(options=options, name='', title='')
    analysis <- CountingAnalysis$new(package='jmvcore', name='anova', version=c(1,0,0),
        options=options, results=results, data=data.frame(x=1), analysisId=1L,
        completeWhenFilled=TRUE)
    analysis$.setStatePathSource(function() statePath)
    own <- Preformatted$new(options, 'own', clearWith=list('alpha'))
    own$setContent('anova')
    results$add(own)

    addonOptions <- Options$new(package='jmvcore', name='dmrt', requiresData=FALSE)
    addonOptions$.addOption(OptionNumber$new('alpha', value=0.05))
    addonOptions$fromProtoBuf(optionsPB(alpha=addonAlpha))
    addon <- CountingAnalysis$new(package='jmvcore', name='dmrt', version=c(1,0,0),
        options=addonOptions, results=Group$new(options=addonOptions, name='', title=''),
        analysisId=1L, completeWhenFilled=addonCompleteWhenFilled)
    analysis$addAddon(addon)

    if (addonCompleteWhenFilled) {
        duncan <- Preformatted$new(addonOptions, 'duncan', clearWith=list('alpha'))
        duncan$setContent('letters')
    } else {
        duncan <- Table$new(addonOptions, 'duncan', title='Duncan', rows=0, clearWith=list('alpha'),
            columns=list(list(name='letter', title='Group', type='text')))
        duncan$addRow(rowKey=1, values=list(letter='a'))
    }
    results$add(duncan)

    list(analysis=analysis, addon=addon)
}

# a run, after a run with the 0.05s, with the alphas given
rerun <- function(alpha, addonAlpha, addonCompleteWhenFilled) {
    statePath <- tempfile()
    completeWhenFilled(statePath, 0.05, 0.05, addonCompleteWhenFilled)$analysis$.save()
    on.exit(unlink(statePath))
    run <- completeWhenFilled(statePath, alpha, addonAlpha, addonCompleteWhenFilled)
    run$analysis$.load()
    if ( ! run$analysis$complete)
        run$analysis$run()
    run
}

test_that("an addon which isn't complete when filled runs when its results are cleared", {
    # its (cleared) table has no rows, so is 'filled', yet must run
    run <- rerun(alpha=0.05, addonAlpha=0.01, addonCompleteWhenFilled=FALSE)
    expect_equal(run$addon$runs, 1)
    # but its parent needn't
    expect_equal(run$analysis$runs, 0)
})

test_that("an addon which isn't complete when filled always runs when its parent does", {
    run <- rerun(alpha=0.01, addonAlpha=0.05, addonCompleteWhenFilled=FALSE)
    expect_equal(run$analysis$runs, 1)
    expect_equal(run$addon$runs, 1)
})

test_that("an analysis and its addons run only when they have to", {

    # the addon's alpha changed
    run <- rerun(alpha=0.05, addonAlpha=0.01, addonCompleteWhenFilled=TRUE)
    expect_equal(run$analysis$runs, 0)
    expect_equal(run$addon$runs, 1)

    # the analysis' alpha changed
    run <- rerun(alpha=0.01, addonAlpha=0.05, addonCompleteWhenFilled=TRUE)
    expect_equal(run$analysis$runs, 1)
    expect_equal(run$addon$runs, 0)

    # nothing changed
    run <- rerun(alpha=0.05, addonAlpha=0.05, addonCompleteWhenFilled=TRUE)
    expect_true(run$analysis$complete)
    expect_equal(run$analysis$runs, 0)
    expect_equal(run$addon$runs, 0)
})

# an addon which places an image among its parent's results
PlottingAddon <- R6::R6Class('PlottingAddon',
    inherit=Analysis,
    private=list(
        .init=function() {
            self$parent$results$add(self$results$items$plot)
        },
        .run=function() {
            self$results$items$plot$setState(c(1, 3, 2))
        },
        .plot=function(image, ...) {
            graphics::plot(image$state)
            TRUE
        }))

test_that("an addon's images are written among its parent's resources", {

    # (the theme is ggplot2's, which isn't needed here)
    local_mocked_bindings(getGlobalTheme=function(...) list(theme=NULL, ggtheme=NULL))

    a <- anovaWithAddon(PlottingAddon, withResult=FALSE)
    a$addon$results$add(Image$new(a$addon$options, name='plot', renderFun='.plot'))

    dir <- tempfile()
    dir.create(dir)
    on.exit(unlink(dir, recursive=TRUE))
    # the engine gives this to the analysis, after its addons are added
    a$analysis$.setResourcesPathSource(function(name, suffix) {
        list(rootPath=dir, relPath=paste0(name, '.', suffix))
    })

    a$analysis$init()
    a$analysis$run()
    a$analysis$.createImages()

    path <- a$results$items$plot$filePath
    expect_false(is.null(path))
    expect_true(file.exists(file.path(dir, path)))
})

test_that("an addon's images are sized by their scale in their parent's options", {

    a <- anovaWithAddon(PlottingAddon, withResult=FALSE)
    a$addon$results$add(Image$new(a$addon$options, name='plot', width=400, height=300, renderFun='.plot'))
    a$analysis$init()

    # resizing an image in the results sets results/<path>/widthScale, among
    # the analysis' options (the addon's options don't have it)
    image <- a$results$items$plot
    expect_equal(image$path, 'plot')
    a$analysis$options$.addOption(OptionNumber$new('results/plot/widthScale', value=2))

    expect_equal(image$size$width, 800)
    expect_equal(image$size$height, 300)
})

# an addon which places a result among its parent's, from its options
SummaryAddon <- R6::R6Class('SummaryAddon',
    inherit=Analysis,
    public=list(
        ran=FALSE),
    private=list(
        .init=function() {
            self$parent$results$add(self$results$items$summary)
        },
        .run=function() {
            self$ran <- TRUE
            # the parent's options and data are available, as in jamovi
            self$results$items$summary$setContent(paste(
                'alpha', self$options$get('alpha'),
                'factors', self$parent$options$get('factors'),
                'rows', nrow(self$data)))
        }))

summaryAddon <- function(alpha=0.05, failIn=NULL) {
    options <- Options$new(package='jDMRT', name='anovaDuncan', requiresData=FALSE)
    options$.addOption(OptionNumber$new('alpha', value=alpha, default=0.05))
    results <- Group$new(options=options, name='', title='Duncan')
    results$add(Preformatted$new(options, 'summary'))
    SummaryAddon$new(package='jDMRT', name='anovaDuncan', version=c(1,0,0),
        options=options, results=results)
}

# jmv::anova, run from R
ranAnova <- function() {
    options <- Options$new(package='jmv', name='anova', requiresData=FALSE)
    options$.addOption(OptionVariables$new('factors', value=list('fert')))
    results <- Group$new(options=options, name='', title='ANOVA')
    results$add(Preformatted$new(options, 'own'))
    analysis <- Analysis$new(package='jmv', name='anova', version=c(1,0,0),
        options=options, results=results, data=data.frame(fert=1:3))
    analysis$run()
    analysis$results
}

test_that("an addon runs from R after its parent, adding to its results", {

    results <- ranAnova()
    addon <- summaryAddon(alpha=0.01)
    returned <- runAddon(results, addon, 'jmv::anova')

    expect_identical(returned, results)
    expect_true(addon$ran)
    # an added result can be reached as the parent's own are
    expect_equal(results$summary$content, 'alpha 0.01 factors fert rows 3')
})

test_that("an addon run from R must follow the analysis it adds to", {

    results <- ranAnova()
    expect_error(
        runAddon(results, summaryAddon(), 'jmv::ancova'),
        'jDMRT::anovaDuncan adds to the results of jmv::ancova')
    expect_error(
        runAddon(data.frame(), summaryAddon(), 'jmv::anova'),
        'adds to the results of jmv::anova')
})

test_that("an addon's options set away from their defaults are chained in the syntax", {

    local_mocked_bindings(addonExported=function(package, name) TRUE)

    a <- anovaWithAddon(withResult=FALSE)
    expect_equal(a$analysis$.__enclos_env__$private$.addonsAsSource(), '')

    addon <- summaryAddon(alpha=0.01)
    a$analysis$addAddon(addon)
    expect_equal(
        a$analysis$.__enclos_env__$private$.addonsAsSource(),
        ' |>\n    jDMRT::anovaDuncan(\n        alpha = 0.01)')

    # an addon which isn't exported has no function to call
    local_mocked_bindings(addonExported=function(package, name) FALSE)
    expect_equal(a$analysis$.__enclos_env__$private$.addonsAsSource(), '')
})
