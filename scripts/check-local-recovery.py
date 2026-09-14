#!/usr/bin/env python3
"""Back up a named local Blog DB/media pair and verify a network-isolated restore.

Never starts Blog, migrates the source, copies keys, or calls a provider. Outputs
contain private content: keep them outside Git with owner-only permissions.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db-container', required=True)
    parser.add_argument('--media-container', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    args.output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    container = 'blog-recovery-' + uuid.uuid4().hex[:12]
    report = {'source_database': args.db_container, 'source_media': args.media_container,
              'started_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'credentials_decryption': 'not_verified; requires separately controlled key material',
              'production_source_confirmed': False, 'ok': False}
    dump = args.output / 'blog.dump'
    media = args.output / 'media.tar'
    def media_archive(target):
        with target.open('wb') as stream:
            run(['docker', 'exec', args.media_container, 'tar', '-C', '/app/data/media', '-cf', '-', '.'], stdout=stream)
    try:
        # Refuse a moving media set; the SQL dump itself uses one MVCC snapshot.
        media_archive(media)
        with dump.open('wb') as stream:
            run(['docker', 'exec', args.db_container, 'pg_dump', '-U', 'postgres', '-d', 'blog', '-Fc', '--no-owner', '--no-acl'], stdout=stream)
        second = args.output / 'media-after.tar'
        media_archive(second)
        digest = lambda p: hashlib.file_digest(p.open('rb'), 'sha256').hexdigest()
        if digest(media) != digest(second):
            raise RuntimeError('media changed during dump; retry during a quiescent window')
        second.unlink()
        run(['docker','run','-d','--name',container,'--network','none','--tmpfs','/var/lib/postgresql/data',
             '-e','POSTGRES_HOST_AUTH_METHOD=trust','pgvector/pgvector:pg15'], stdout=subprocess.DEVNULL)
        for _ in range(60):
            if subprocess.run(['docker','exec',container,'pg_isready','-U','postgres'], stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('isolated database not ready')
        for _ in range(30):
            if subprocess.run(['docker','exec',container,'createdb','-U','postgres','blog'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('isolated database initialization failed')
        with dump.open('rb') as stream:
            run(['docker','exec','-i',container,'pg_restore','-U','postgres','-d','blog','--exit-on-error','--no-owner','--no-acl'],stdin=stream)
        # Re-dump restored logical data to compare content without printing it.
        hashes = {}
        for table in ('posts','post_versions','media_assets'):
            query = f"COPY (SELECT row_to_json(t)::text FROM {table} t ORDER BY id) TO STDOUT"
            raw = run(['docker','exec',container,'psql','-U','postgres','-d','blog','-Atc',query],capture_output=True).stdout
            hashes[table] = {'rows':len(raw.splitlines()),'sha256':hashlib.sha256(raw).hexdigest()}
        run(['docker','exec',container,'mkdir','/tmp/recovered-media'])
        with media.open('rb') as stream:
            run(['docker','exec','-i',container,'tar','-C','/tmp/recovered-media','-xf','-'],stdin=stream)
        with (args.output/'media-restored.tar').open('wb') as stream:
            run(['docker','exec',container,'tar','-C','/tmp/recovered-media','-cf','-','.'],stdout=stream)
        # File contents/names, independent of tar implementation metadata.
        import tarfile
        def members(path):
            with tarfile.open(path) as archive:
                return {item.name:hashlib.sha256(archive.extractfile(item).read()).hexdigest() for item in archive if item.isfile()}
        if members(media) != members(args.output/'media-restored.tar'):
            raise RuntimeError('restored media mismatch')
        report.update(ok=True, restored_tables=hashes, media_files=len(members(media)),
                      dump_sha256=digest(dump), media_sha256=digest(media))
    finally:
        subprocess.run(['docker','rm','-f',container],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        report['elapsed_seconds'] = round(time.monotonic()-started,2)
        (args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

if __name__ == '__main__':
    main()
