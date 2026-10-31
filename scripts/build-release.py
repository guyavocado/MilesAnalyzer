"""Build the Netlify upload, including the private local Plex snapshot."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import subprocess
root=Path(__file__).resolve().parent.parent
output=root.parent/'miles-files'
output.mkdir(exist_ok=True)
subprocess.run(['git','bundle','create',str(output/'miles-source.bundle'),'--all'],cwd=root,check=True)
files=[root/'index.html',root/'styles.css',root/'netlify.toml',*root.glob('*.js'),*root.glob('netlify/functions/*.mjs'),*root.glob('reference-data/*')]
assert (root/'reference-data/Plex-Music-Library.csv').is_file(), 'The preload snapshot is required'
with ZipFile(output/'miles-deploy.zip','w',ZIP_DEFLATED) as archive:
    for path in sorted(files):
        if path.is_file(): archive.write(path,path.relative_to(root))
print('Built source bundle and deploy ZIP with',len(files),'files')
