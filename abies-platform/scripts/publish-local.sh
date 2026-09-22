#!/usr/bin/env bash
# Publish a reviewed snapshot to the local GitOps repository, never to GitHub.
set -Eeuo pipefail
abies_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
abies_repo=$(git -C "$abies_root" rev-parse --show-toplevel)
abies_source="$abies_root/.runtime/source"
abies_bare="$abies_root/.runtime/git/abies.git"
mkdir -p "$abies_source" "$(dirname "$abies_bare")"
if [[ ! -d "$abies_source/.git" ]]; then git -C "$abies_source" init -b main; fi
if [[ ! -d "$abies_bare" ]]; then git init --bare -b main "$abies_bare"; fi
# Copy only non-ignored project files; never copy node_modules, runtime state or secrets.
python3 - "$abies_repo" "$abies_root" "$abies_source" <<'PYCODE'
import pathlib,subprocess,sys,shutil
repo,root,dest=map(pathlib.Path,sys.argv[1:])
paths=subprocess.check_output(['git','-C',str(repo),'ls-files','--cached','--others','--exclude-standard','-z','--',str(root)]).split(b'\0')
allowed=set()
for raw in paths:
 if not raw: continue
 path=repo/raw.decode(); rel=path.relative_to(repo)
 if not path.is_file(): continue
 if path.is_symlink(): raise SystemExit('Symlinks must be reviewed before publishing: '+str(path))
 allowed.add(rel)
 target=dest/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
for path in (dest/root.relative_to(repo)).rglob('*'):
 if path.is_file() and path.relative_to(dest) not in allowed:path.unlink()
PYCODE
git -C "$abies_source" add --all
if ! git -C "$abies_source" diff --cached --quiet; then
  git -C "$abies_source" -c user.name='Abies local deployment' -c user.email='deployment@abies.local' commit -m 'Deploy local Abies platform snapshot'
fi
git -C "$abies_source" push "$abies_bare" main
printf 'Published local GitOps revision: '
git -C "$abies_source" rev-parse --short=12 HEAD
