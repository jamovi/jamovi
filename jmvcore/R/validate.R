
#' Secure formula validation using allowlist approach
#' Prevents code injection while allowing legitimate statistical formulas
#'
#' @param formula_str Character string containing the R formula
#' @return Validated formula object safe for statistical functions
#' @throws Error if formula contains security violations
#' @export
#'
#' @examples
#' # Safe usage:
#' validate_safe_formula("y ~ x + z")
#' validate_safe_formula("y ~ I(x^2) + log(z)")
#'
#' # Blocks dangerous code:
#' validate_safe_formula("y ~ I(system('whoami'))")  # Throws error
validate_safe_formula <- function(formula_str) {

  # Parse formula and check basic syntax
  formula_obj <- tryCatch(as.formula(formula_str), error = function(e) {
    stop("Invalid formula syntax: ", e$message, call. = FALSE)
  })

  formula_text <- deparse(formula_obj, width.cutoff = 500)

  # Allowlist of safe functions
  allowed_functions <- c(
    # Mathematical functions
    "log", "exp", "sqrt", "abs", "sin", "cos", "tan",
    "asin", "acos", "atan", "floor", "ceiling", "round", "trunc",
    # Statistical functions
    "mean", "sd", "var", "median", "min", "max", "sum", "length",
    # Transformation functions
    "scale", "poly", "ns", "bs", "I"
  )

  # Extract function calls
  function_calls <- regmatches(formula_text,
                               gregexpr("[a-zA-Z_][a-zA-Z0-9_.]*(?=\\s*\\()",
                                       formula_text, perl = TRUE))[[1]]

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

  # Final security scan for dangerous patterns
  dangerous_patterns <- c(
    "system", "eval", "parse", "source", "load", "save",
    "file\\.", "write", "read", "get\\s*\\(", "assign",
    "library", "require", "do\\.call", "url", "download",
    "cat", "print", "sink", ":::"
  )

  # Fix vector length bug by checking each pattern individually
  for (pattern in dangerous_patterns) {
    matches <- grepl(pattern, formula_text, ignore.case = TRUE)
    if (any(matches)) {
      stop("Security violation: Detected unsafe pattern in formula",
           call. = FALSE)
    }
  }

  return(formula_obj)
}

#' Internal function to validate I() expression content
#' Only allows mathematical operations and variable references
.validate_i_expression <- function(i_content) {

  # Check for function calls - only allow basic math
  if (grepl("[a-zA-Z_][a-zA-Z0-9_]*\\s*\\(", i_content)) {
    func_names <- regmatches(i_content,
                            gregexpr("[a-zA-Z_][a-zA-Z0-9_]*(?=\\s*\\()",
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

  # Block suspicious characters including backticks
  if (grepl("[\\$@:;\"'{}`]", i_content)) {
    stop("Security violation: Unsafe characters in I() expression",
         call. = FALSE)
  }
}
