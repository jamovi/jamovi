# Addons

An addon is an analysis that extends **another module's analysis** instead of
appearing in the menus. When its module is installed, it runs as part of that
analysis (its *parent*): it can have options of its own, shown at the end of
the parent's options, and it adds to or changes the parent's results.

The examples in this guide are from an addon, `anovaExtra` in a module
`extras`, that adds extra comparisons of the model terms to jamovi's ANOVA
(`jmv::anova`).

This guide covers writing an addon, and what an addon may and may not do. The
last section, [How it works](#how-it-works), is for people working on jamovi
itself.

- [Declaring an addon](#declaring-an-addon)
- [Options](#options)
- [The options panel](#the-options-panel)
- [R](#r)
- [Results](#results)
- [From R](#from-r)
- [When an addon runs](#when-an-addon-runs)
- [Errors](#errors)
- [Boundaries](#boundaries)
- [A complete example](#a-complete-example)
- [How it works](#how-it-works)


## Declaring an addon

An addon is an ordinary analysis of a module, with `addonFor` naming its
parent as `<module>::<analysis>`, in both `0000.yaml` and its `.a.yaml`:

```yaml
# jamovi/0000.yaml
analyses:
  - title: Extra Comparisons
    name: anovaExtra
    ns: extras
    menuGroup: extras
    menuTitle: Extra Comparisons
    addonFor: 'jmv::anova'
```

```yaml
# jamovi/anovaextra.a.yaml
name: anovaExtra
title: Extra Comparisons
jas: '1.2'
addonFor: 'jmv::anova'
export: true
options: [ ... ]
```

- An addon extends exactly one analysis. To extend several, write one addon
  for each.
- An addon never appears in the menus. It's active wherever its module is
  installed: the parent gets it whenever its own module and the addon's are
  both installed.
- `export: true` makes the addon callable from R, after its parent (see
  [From R](#from-r)). With `export: false` it works only in jamovi.
- A module can have addons and ordinary analyses side by side.
- Addons of addons aren't supported.


## Options

An addon declares its options in its `.a.yaml` like any analysis, and gets
them in R as `self$options`, by the names it gave them. No `data` option is
needed: an addon works on its parent's data.

Its options are saved with the parent analysis, so they're kept in `.omv`
files, duplicated with the analysis, and undone and redone with it.

### Variables

An addon may only use variables its **parent** has selected; it can't ask for
other columns of the data set. An addon's `Variable`, `Variables` and `Terms`
options must therefore be filled from its parent's options (see
[The options panel](#the-options-panel)). This is enforced:

- in the options panel, a `VariableSupplier` in an addon must be
  `populate: manual`, so its events decide what it offers;
- when the analysis runs, any variable in an addon's options that the parent
  doesn't use is left out of what the addon receives. (The value itself is
  kept, so it comes back if the parent takes the variable up again.)

Renaming a column, or a level, updates an addon's options just as it does the
parent's.


## The options panel

An addon's `.u.yaml` is shown in a collapse box of its own at the end of its
parent's options, titled with the addon's title, followed by its module's
icon and name. An addon with no controls (one which only adds results)
has no box. With more than one addon, they're in order of module name.

Its controls and events are the addon's own: `ui.<name>` is the addon's
control or option, by the name the addon gave it, and its translations are its
own module's.

### The parent's options

Each of the parent's options is available to the addon's events, **read
only**, as `ui.parent_<option>`:

```js
// jamovi/js/anovaextra.js
module.exports = {

    // offer the parent's model terms
    extraSupplier_updated: function(ui) {
        this.offerTerms(ui);
    },

    // and again whenever they change
    parent_modelTerms_changed: function(ui) {
        this.offerTerms(ui);
    },

    // a term taken out of the model is taken out of this addon's terms too
    extraSupplier_changed: function(ui) {
        let values = utils.itemsToValues(ui.extraSupplier.value());
        utils.checkValue(ui.extraTerms, true, values, FormatDef.term);
    },

    offerTerms: function(ui) {
        let terms = utils.clone(ui.parent_modelTerms.value(), []);
        ui.extraSupplier.setValue(utils.valuesToItems(terms, FormatDef.term));
    }
};
```

- `ui.parent_<option>.value()` reads the value.
- `parent_<option>_changed` handles a change to it.
- Bindings in the `.u.yaml` can use them too, e.g. `enable: (parent_factors)`.
- There's no `setValue()`: an addon can't change its parent's options.

Don't name an addon's own option or control `parent_...`.


## R

An addon is an R6 class like any analysis (`<name>Class`, inheriting the
`<name>Base` the compiler generates), with `.init()` and `.run()`.

| | |
|---|---|
| `self$options` | the addon's own options |
| `self$parent$options` | the parent's options (read only, by convention) |
| `self$parent$results` | the parent's results |
| `self$data` | the parent's data (its variables only), the same data frame the parent gets |
| `self$parent` | the parent analysis |

```r
anovaExtraClass <- R6::R6Class(
  "anovaExtraClass",
  inherit = anovaExtraBase,
  private = list(
    .init = function() {
      # place this addon's results among the ANOVA's
      self$parent$results$add(self$results$extraTables)
      self$parent$results$add(self$results$extraSummary)
    },
    .run = function() {
      dep   <- self$parent$options$dep
      terms <- self$options$extraTerms
      ...
    })
)
```

An addon's `.init()` runs after its parent's, and its `.run()` after its
parent's, so the parent's results are there to read in `.run()`. (The
parent's `.run()` may not have run *this* time, though; see
[When an addon runs](#when-an-addon-runs).)


## Results

An addon's results appear among its parent's. There are two ways to do this.

**Results of its own** (recommended). Declare them in the addon's `.r.yaml`
as usual, and in `.init()` add them to the parent's results:

```r
self$parent$results$add(self$results$extraTables)
```

They then behave as the addon's results: visibility, `items` and `clearWith`
follow the addon's options, and they're saved, restored and cleared as part of
the parent's results. An image's `renderFun` is one of the addon's private
functions, as for any analysis.

**Changing the parent's results.** An addon can also insert elements into the
parent's results, or hide some of the parent's (say, to replace one of the
parent's tables with a fuller one of its own). This depends on the parent's results
staying as they are (see [Boundaries](#boundaries)), so prefer results of
its own where possible. Create any elements with the addon's options
(`options=self$options`) so they're treated as the addon's.

### clearWith

In an addon's results, `clearWith` names the addon's own options as they are,
and the parent's as `parent:<option>`:

```yaml
clearWith: [parent:dep, parent:factors, parent:modelTerms, extraTerms, alpha]
```

An addon's result clears when the data of any variable of these options
changes too, the parent's included.

`clearWith: '*'` (the default for some elements, such as images) on an
addon's result clears with any change to the addon's options, its parent's,
or the data. The parent's results never clear with its addons' options, and
an addon's never clear with another addon's.

### References

References on an addon's results are looked up in the addon's own module
(its `00refs.yaml`), then the parent's. Put them on the elements they belong
to, so they're cited only when those are shown:

```yaml
- name: extraTables
  type: Array
  items: (extraTerms)
  refs: [smith2020]
```


## From R

The compiler gives an exported addon an R function whose first argument is
the results of the analysis it adds to. It returns those results with its own
added, so it follows the parent in a pipe:

```r
jmv::ANOVA(formula = Yield ~ Variety + Block, data = data) |>
    extras::anovaExtra(extraTerms = ~ Variety, alpha = 0.01)
```

- The addon runs with the parent's data, options and results, as in jamovi.
- Its results are reached through the parent's (`results$extraTables`).
- Called after anything other than its parent's results, it stops with an
  error.
- Several addons can follow one another.
- Add the function to your `NAMESPACE` (`export(anovaExtra)`), as for any
  analysis.
- jamovi's syntax mode writes it this way: the parent's call, then a
  `|> ns::name(...)` for each exported addon with options away from their
  defaults.


## When an addon runs

Every change to the parent's options, the addon's, or the data, runs the
analysis. First the results are restored from the previous run, except those
cleared by the change (their `clearWith`). Then each part, the parent and each
of its addons, runs only if it has to:

- An analysis or addon with `completeWhenFilled: true` in its `.a.yaml` runs
  only when its results aren't all filled.
- One without it runs whenever the analysis runs.

So, for jmv's ANOVA (complete when filled) with an addon that's complete when
filled too:

| Change | The ANOVA runs | The addon runs |
|---|---|---|
| an option of the addon's | only if it clears something of the ANOVA's | yes, if it clears something of the addon's |
| an option of the ANOVA's | yes, if it clears something of the ANOVA's | only if it clears something of the addon's |
| nothing (results all filled) | no | no |

**Being complete when filled.** It's worth making an addon complete when
filled, but only once its results can be restored: a table must get its rows
in `.init()` (from the options, or the data set's header), not in `.run()`. A
table with no rows counts as filled, so an addon whose tables get their rows
in `.run()` mustn't declare it.

**Don't depend on the parent having run.** When only an addon's options have
changed, the parent's `.run()` may not be called. Read what you need from its
options and its results, which are restored. Anything the parent only
computes in its `.run()` (private fields, caches) may not be there.


## Errors

An error in an addon, in its options checks, `.init()` or `.run()`, is the
addon's alone: the parent's results are unaffected, the error is shown on the
addon's results (or in a result of its own, if it has none placed among the
parent's), and the addon is skipped for the rest of that run.

So an addon can simply `jmvcore::reject()` or `stop()`, as any analysis does.


## Boundaries

What an addon may rely on and do:

- **Its parent's options**: read them, from R and from its events. Never
  change them.
- **Its parent's results**: read them, and add its own. These are the
  parent's implementation, though, not a promise: a new version of the parent
  can rename or rework them. Depend on as little as you can, read them
  defensively, and test against new versions of the parent's module.
- **Its parent's variables only.** No columns of its own (see
  [Variables](#variables)).

What isn't supported:

- **Translations at run time in events.** Labels, titles and the like in an
  addon's `.u.yaml` are translated with its own module's translations, but a
  call to `_()` in its events, while the panel is in use, uses the parent's.
- **Changing the parent's behaviour**, other than through its results.

### Compatibility

Addon options need a version of jamovi that supports them; set `minApp` to
match. In an older jamovi, an addon runs with its default options and its
options panel isn't shown; values saved in a file are kept, though, and come
back in a jamovi that supports them.

If the addon's module isn't installed where a file is opened, the parent
analysis runs without it, and the addon's saved options are kept in the file.


## A complete example

The files of `anovaExtra`, the addon in the examples above, in the module
`extras`:

| File | |
|---|---|
| `jamovi/0000.yaml` | lists `anovaExtra`, with `addonFor: 'jmv::anova'` |
| `jamovi/anovaextra.a.yaml` | its options: the terms to compare, α, and display options |
| `jamovi/anovaextra.u.yaml` | a term picker, and the display options |
| `jamovi/js/anovaextra.js` | fills the term picker from `parent_modelTerms` |
| `jamovi/anovaextra.r.yaml` | a table for each term, and a summary table, with `parent:` clearWiths |
| `R/anovaextra.b.R` | places its results, reads the ANOVA's options and results, and does the comparisons |

Where an addon relies on its parent's results, say so, and fall back
gracefully. For instance, an addon reading the F-tests from jmv's ANOVA
depends on its `main` table, its rows being keyed by model term, and its `p`
column; if they can't be found, it should compute its own, rather than fail.


## How it works

For jamovi developers: see [addons-implementation.md](addons-implementation.md).
