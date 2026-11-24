#!/usr/bin/env python3
"""Verify classic/config and containerd/manifest IDs against a checked Docker save.

The caller must verify the archive SHA-256 before loading it or calling this file.
No archive entries are extracted to disk. Only identities of the selected image
are accepted; an unrelated blob or tag is never a substitute for that image.
"""

import hashlib
import json
import re
import sys
import tarfile


DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
TAG = re.compile(r"omeumes:[0-9a-f]{40}")


def verify(archive, tag, expected, loaded):
    if not TAG.fullmatch(tag) or not all(DIGEST.fullmatch(v) for v in (expected, loaded)):
        raise ValueError("Invalid release tag or image ID")

    with tarfile.open(archive, "r:*") as saved:
        def document(name, digest=None):
            member = saved.getmember(name)
            if not member.isfile() or member.size > 1024 * 1024:
                raise ValueError("Invalid image metadata entry: " + name)
            with saved.extractfile(member) as stream:
                data = stream.read()
            actual = "sha256:" + hashlib.sha256(data).hexdigest()
            if digest is not None and digest != actual:
                raise ValueError("Image metadata digest mismatch: " + name)
            return json.loads(data), actual

        manifest, _ = document("manifest.json")
        if len(manifest) != 1 or tag not in manifest[0].get("RepoTags", []):
            raise ValueError("Archive must contain exactly the requested release image")
        config_name = manifest[0]["Config"]
        if not re.fullmatch(r"(?:blobs/sha256/[0-9a-f]{64}|[0-9a-f]{64}\.json)", config_name):
            raise ValueError("Invalid image configuration path")
        config_digest = "sha256:" + config_name.rsplit("/", 1)[-1].removesuffix(".json")
        config, config_id = document(config_name, config_digest)
        if config.get("os") != "linux" or config.get("architecture") != "amd64":
            raise ValueError("Release must be linux/amd64")
        identities = {config_id}

        def chain(descriptor, depth=0):
            digest = descriptor["digest"]
            if depth > 8 or not DIGEST.fullmatch(digest):
                raise ValueError("Invalid OCI image descriptor")
            value, _ = document("blobs/sha256/" + digest[7:], digest)
            if "config" in value:
                if value["config"]["digest"] == config_id:
                    return {config_id, digest}
                return set()
            matches = [branch for child in value.get("manifests", []) if (branch := chain(child, depth + 1))]
            if len(matches) > 1:
                raise ValueError("Ambiguous OCI image configuration")
            return matches[0] | {digest} if matches else set()

        try:
            saved.getmember("index.json")
        except KeyError:
            pass  # A legacy save can only prove the configuration identity.
        else:
            index, _ = document("index.json")
            roots = []
            for descriptor in index.get("manifests", []):
                annotations = descriptor.get("annotations", {})
                if (
                    annotations.get("io.containerd.image.name") in (tag, "docker.io/library/" + tag)
                    or annotations.get("org.opencontainers.image.ref.name") in (tag, tag.split(":")[1])
                ):
                    roots.append(descriptor)
            if len(roots) != 1:
                raise ValueError("OCI index does not uniquely identify the release tag")
            linked = chain(roots[0])
            if not linked:
                raise ValueError("OCI manifest does not reference the release configuration")
            identities |= linked

        if expected not in identities or loaded not in identities:
            raise ValueError(
                "Image identity mismatch: CI=" + expected + ", loaded=" + loaded
                + "; verified identities=" + ", ".join(sorted(identities))
            )
    return loaded


if __name__ == "__main__":
    try:
        if len(sys.argv) != 5:
            raise ValueError("Use image-identity.py ARCHIVE TAG CI_IMAGE_ID LOADED_IMAGE_ID")
        print(verify(*sys.argv[1:]))
    except (ValueError, KeyError, TypeError, OSError, tarfile.TarError) as error:
        print("Image verification failed: " + str(error), file=sys.stderr)
        sys.exit(1)
