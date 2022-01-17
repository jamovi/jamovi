
from subprocess import run
from json import load
from sys import stdout
from sys import argv
from os.path import basename

list_url = argv[1]
lib_dir = argv[2]

# run(['/usr/bin/curl', '-o', 'list.json', list_url])

deps = load(open(list_url))

for dep in deps:
    if dep['type'] != 'archive':
        continue
    url = dep['url']
    dest = dep['dest']
    file = basename(url)
    stdout.write('Downloading {}\n'.format(file))
    stdout.flush()
    run(['/usr/bin/curl', '-s', '-o', dest, url])
    extra_args = '--no-data --no-help --no-demo --no-html'
    if dest.endswith('_viridisLite.Rpkg'):
        extra_args = '--no-help --no-demo --no-html'
    completed = run('/usr/local/bin/R CMD INSTALL "--library={}" {} {}'.format(lib_dir, extra_args, dest), shell=True)
    if completed.returncode != 0:
        exit(completed.returncode)
    run('rm -rf *.Rpkg', shell=True)
