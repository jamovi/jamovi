


def get_writers():
    return [ ( 'qmd', write ) ]


def write(data, path, _):

    with open(path, 'w', encoding='utf-8') as file:

        file.write('''
---
title: "Untitled"
format: html
editor: visual
---

## Quarto

''')

        for analysis in data.analyses:
            if analysis.has_results is False:
                continue
            results = analysis.results.results.group.elements
            if len(results) > 0:
                file.write(f'''```{{r}}
{ results[0].preformatted }
```

''')
