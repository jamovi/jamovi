
# jamovi

jamovi is a free and open statistics package, which is easy to use, and designed to be familiar to users of SPSS. It provides a spreadsheet editor, and a range of statistical analyses. jamovi can provide R syntax for each analysis that is run, and additional analyses for jamovi can be developed using the R language.

Come visit us at [jamovi.org](https://www.jamovi.org).

## running

the easiest way to build and work on jamovi, is to build it as a docker container. clone this repo (and submodules), and then build it with:

```
git clone https://github.com/jamovi/jamovi.git
cd jamovi
git submodule update --init --recursive
docker-compose build
```

once built, it can be run with:

```
docker-compose up
```

this launches an embedded web-server, and jamovi can be accessed with a web-browser at the url http://127.0.0.1:41337


# Development

## Pre-requisites

- [Python](https://www.python.org/) (3.8 or higher)
- [pip](https://pypi.org/project/pip/)
- [Poetry](https://python-poetry.org/)
- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

## Setup

### Virtual Environment

Create a virtual environment using the following command:

```bash
poetry install
```

If poetry can't locate a Python executable with the correct version, ensure
that you have the correct version installed and run these commands to force
poetry to use it:

```bash
poetry env use PATH_TO_PYTHON_EXECUTABLE
poetry install
```

## Usage

## Activate the virtual environment

```bash
poetry shell
```

## Developer section

### Usage - Poetry

```bash
poetry shell  # to activate the virtual environment
poetry run COMMAND  # run a command in the venv without first activating it
poetry add DEPENDENCY  # add a production dependency
poetry add --group=dev DEVDEPENDENCY  # add a dev dependency
poetry add --group=GROUPNAME DEPENDENCY  # add a dependency to another group

poetry lock  # update the lock file
poetry install  # install dependencies from the lock file
poetry install --sync  # also remove untracked dependencies from venv
poetry update  # lock & install
poetry update --sync  # lock & install --sync
```

For more information about Poetry, see the [Poetry docs][poetry-docs].

### Usage - Poe

We use `poe` to run tasks that simplify running things like tests, QA-tools, and
docker. This is similar to how one might use `make` to simplify running commands
with arguments or combinations of commands.

You can run `poe` in two ways:

```bash
# By first activating the virtual environment
poetry shell
poe TASKNAME [OPTIONAL_ADDITIONAL_ARGS]

# By using `poetry run` without activing the environment
poetry run poe TASKNAME [OPTIONAL_ADDITIONAL_ARGS]
```

For example, to run all tools that reformat code, you can run:
```bash
poetry shell
poe reformat

# or
poetry run poe reformat
```

For a list of all the available tasks, run `poe --help` or look at the task
definitions in [`pypoetry.toml`](pyproject.toml).

For more information about Poe the Poet, look at the [Poe docs][poe-docs].


## Testing

Tests can be run with:

```bash
poe tests
```


# VSCode 

If you're using VSCode it's recommended to install the following extensions to make python development easier:

- ms-python.black-formatter
- ms-python.debugpy
- ms-python.isort
- ms-python.pylint
- ms-python.python
- ms-python.vscode-pylance

### Configure virtual environment for VSCode

You can [configure the interpreter path for the workspace](https://code.visualstudio.com/docs/python/environments#_select-and-activate-an-environment) so that you don't have to manually activate the terminal every time you open a terminal.

You can find the path to the python interpreter associated with the virtual environment easily by:
```bash
# Activate the environment
poetry shell
# Find the python path for this environment
where python
```