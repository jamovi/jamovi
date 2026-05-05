
#' Secure formula validation using allowlist approach
#' Prevents code injection while allowing legitimate statistical formulas
#'
#' @param fmla A formula object to validate.
#' @param additional_allowed_functions Optional character vector of extra
#'   function names to permit for this validation call.
#' @throws Error if formula contains security violations
#' @export
#'
#' @examples
#' # Safe usage:
#' validateSafeFormula(y ~ x + z)
#' validateSafeFormula(y ~ I(x^2) + log(z))
#'
#' # Blocks dangerous code:
#' validateSafeFormula(y ~ I(system('whoami')))  # Throws error
validateSafeFormula <- function(fmla, additional_allowed_functions = NULL) {

  formula_text <- paste(deparse(fmla, width.cutoff = 500), collapse = " ")

  # Allowlist of safe functions
  allowed_functions <- c(
    # Mathematical functions
    "log", "log2", "log10", "log1p",
    "exp", "expm1",
    "sqrt", "abs", "sign",
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
    "floor", "ceiling", "round", "trunc",
    # Statistical functions
    "mean", "sd", "var", "median", "min", "max", "sum", "length",
    "rank",
    # Transformation functions
    "scale", "poly", "ns", "bs", "I", "cbind", "rbind", "c",
    # Type coercions (common inline in formulas)
    "as.numeric", "as.integer", "as.factor", "as.character",
    # Categorical helpers
    "factor", "ordered", "cut",
    # Common formula helpers
    "offset", "relevel", "interaction", "pmin", "pmax",
    "ifelse",
    # Base aov() error strata
    "Error",
    # Survival analysis terms (survival, prodlim)
    "Surv", "strata", "cluster", "frailty", "tt", "pspline", "Hist", "Event",
    # GAM smooth terms (mgcv)
    "s", "te", "ti", "t2",
    # Splines (rms / Hmisc)
    "rcs", "lsp",
    # Mixed-effects structures (nlme)
    "pdSymm", "pdDiag",
    # IRT / LCA item terms
    "item"
  )

  if (!is.null(additional_allowed_functions)) {
    if (!is.character(additional_allowed_functions)) {
      stop("`additional_allowed_functions` must be a character vector.",
           call. = FALSE)
    }

    valid_names <- grepl("\\.?[a-zA-Z_][a-zA-Z0-9_.]*$",
                         additional_allowed_functions)
    if (any(!valid_names)) {
      stop("`additional_allowed_functions` contains invalid function names.",
           call. = FALSE)
    }

    allowed_functions <- unique(c(allowed_functions, additional_allowed_functions))
  }

  # Block backtick-quoted function calls such as `base:::system`('ls').
  # deparse() preserves backticks only for names containing characters outside
  # [a-zA-Z0-9_.] (e.g. colons, hyphens, spaces).  Standard identifiers like
  # `system` or `eval` are stripped to plain names, so those are caught by the
  # allowlist check below.  The only realistic attack vector this guards against
  # is namespace-spliced names like `base:::system` used as a single symbol.
  if (grepl("`[^`]+`\\s*\\(", formula_text, perl = TRUE)) {
    stop("Security violation: Backtick-quoted function calls are not permitted in formulas.",
         call. = FALSE)
  }

  # Strip backtick-quoted variable names (e.g. `Marker Level (ng/ml)`) before
  # scanning for function calls.  Their internal content can contain '(' which
  # would otherwise be mis-identified as a function call by the regex below.
  # Only variable-use backtick tokens remain at this point (calls were blocked
  # above).
  formula_text_stripped <- gsub("`[^`]+`", "", formula_text)

  # Extract function calls
  function_calls <- regmatches(formula_text_stripped,
                               gregexpr("\\.?[a-zA-Z_][a-zA-Z0-9_.]*(?=\\s*\\()",
                                       formula_text_stripped, perl = TRUE))[[1]]

  # Validate each function call
  for (func_call in function_calls) {
    if (!func_call %in% allowed_functions) {
      stop("Security violation: Unsafe function '", func_call,
           "'. Only mathematical and safe statistical functions allowed.",
           call. = FALSE)
    }
  }

  # Special validation for I() expressions
  i_expressions <- regmatches(formula_text,
                             gregexpr("I\\s*\\(([^)]+)\\)", formula_text))[[1]]

  for (i_expr in i_expressions) {
    i_content <- gsub("^I\\s*\\((.+)\\)$", "\\1", i_expr)
    .validate_i_expression(i_content)
  }

  invisible(NULL)
}

#' Internal function to validate I() expression content
#' Only allows mathematical operations and variable references
.validate_i_expression <- function(i_content) {

  # Check for function calls - only allow basic math
  if (grepl("[a-zA-Z_][a-zA-Z0-9_]*\\s*\\(", i_content)) {
    func_names <- regmatches(i_content,
                            gregexpr("\\.?[a-zA-Z_][a-zA-Z0-9_]*(?=\\s*\\()",
                                    i_content, perl = TRUE))[[1]]

    allowed_math_funcs <- c("log", "exp", "sqrt", "abs", "sin", "cos", "tan",
                           "floor", "ceiling", "round", "trunc")

    for (func in func_names) {
      if (!func %in% allowed_math_funcs) {
        stop("Security violation: Function '", func,
             "' not allowed in I() expression", call. = FALSE)
      }
    }
  }

  # Block characters that indicate dangerous constructs in deparsed output:
  # $ and @ (slot/list access), : (namespace access), ; (statement separator),
  # quotes (string literals), and {} (code blocks).
  if (grepl("[\\$@:;\"'{}]", i_content)) {
    stop("Security violation: Unsafe characters in I() expression",
         call. = FALSE)
  }
}

#' Convert and validate an object as a formula
#'
#' Accepts formula-like input, converts it with [stats::as.formula()],
#' validates it using [validateSafeFormula()], and returns the formula.
#'
#' @param object A formula-like object (typically a character string or formula).
#' @param env The environment to use when parsing character formulas.
#' @param additional_allowed_functions Optional character vector of extra
#'   function names to permit for this conversion and validation call.
#'
#' @note Available from jamovi 2.7.27.
#'
#' @return A validated formula object.
#' @export
asFormula <- function(object,
                      env = parent.frame(),
                      additional_allowed_functions = NULL) {

  # The engine in jamovi overrides stats::as.formula().
  # Retrieve the original (pre-override) function stored in options during
  # engine initialisation, falling back to stats::as.formula outside jamovi.
  stats_as_formula <- getOption(".__jmv.original_as.formula",
                                default = stats::as.formula)

  fmla <- stats_as_formula(object, env)
  validateSafeFormula(
    fmla,
    additional_allowed_functions = additional_allowed_functions)
  fmla
}
