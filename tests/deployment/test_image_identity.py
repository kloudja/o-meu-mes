"""Portable deployment identity regression tests; no Docker or real storage."""

import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest


HELPER = Path(__file__).resolve().parents[2] / "deploy" / "image-identity.py"
SPEC = importlib.util.spec_from_file_location("image_identity", HELPER)
IDENTITY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IDENTITY)
TAG = "omeumes:" + "a" * 40
OTHER = "sha256:" + "0" * 64


def encoded(value):
    return json.dumps(value, separators=(",", ":")).encode()


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def descriptor(data):
    return {"digest": digest(data), "size": len(data)}


class ImageIdentityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="omeumes-test-image-identity-")
        self.addCleanup(self.directory.cleanup)
        self.archive = Path(self.directory.name) / "synthetic.tar.gz"
        config = encoded({"os": "linux", "architecture": "amd64", "rootfs": {"type": "layers", "diff_ids": []}})
        manifest = encoded({"schemaVersion": 2, "config": descriptor(config), "layers": []})
        self.config_id, self.manifest_id = digest(config), digest(manifest)
        self.config_name = "blobs/sha256/" + self.config_id[7:]
        self.manifest_name = "blobs/sha256/" + self.manifest_id[7:]
        self.entries = {
            self.config_name: config,
            self.manifest_name: manifest,
            "manifest.json": encoded([{"Config": self.config_name, "RepoTags": [TAG], "Layers": []}]),
            "index.json": encoded({"schemaVersion": 2, "manifests": [{
                **descriptor(manifest), "annotations": {"io.containerd.image.name": "docker.io/library/" + TAG}
            }]}),
        }

    def write(self, symlink=None):
        with tarfile.open(self.archive, "w:gz") as saved:
            for name, data in self.entries.items():
                entry = tarfile.TarInfo(name)
                if name == symlink:
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = "outside-fixture"
                    saved.addfile(entry)
                else:
                    entry.size = len(data)
                    saved.addfile(entry, io.BytesIO(data))

    def verify(self, expected=None, loaded=None, tag=TAG):
        return IDENTITY.verify(self.archive, tag, expected or self.config_id, loaded or self.manifest_id)

    def test_classic_and_containerd_ids_match_in_both_directions(self):
        self.write()
        for expected in (self.config_id, self.manifest_id):
            for loaded in (self.config_id, self.manifest_id):
                with self.subTest(expected=expected, loaded=loaded):
                    self.assertEqual(self.verify(expected, loaded), loaded)

    def test_oci_index_id_is_linked_to_the_same_configuration(self):
        manifest = self.entries[self.manifest_name]
        nested = encoded({"schemaVersion": 2, "manifests": [descriptor(manifest)]})
        index_id = digest(nested)
        self.entries["blobs/sha256/" + index_id[7:]] = nested
        self.entries["index.json"] = encoded({"manifests": [{
            **descriptor(nested), "annotations": {"org.opencontainers.image.ref.name": TAG.split(":")[1]}
        }]})
        self.write()
        self.assertEqual(self.verify(loaded=index_id), index_id)
        self.assertEqual(self.verify(expected=index_id, loaded=self.config_id), self.config_id)

    def test_unknown_ci_or_loaded_identity_is_rejected(self):
        self.write()
        for expected, loaded in ((OTHER, self.manifest_id), (self.config_id, OTHER)):
            with self.subTest(expected=expected, loaded=loaded), self.assertRaisesRegex(ValueError, "identity mismatch"):
                self.verify(expected, loaded)

    def test_unrelated_blob_in_the_verified_archive_is_not_an_image_identity(self):
        unrelated = encoded({"note": "unrelated synthetic metadata"})
        self.entries["blobs/sha256/" + digest(unrelated)[7:]] = unrelated
        self.write()
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            self.verify(loaded=digest(unrelated))

    def test_wrong_release_tag_is_rejected(self):
        self.write()
        with self.assertRaisesRegex(ValueError, "requested release"):
            self.verify(tag="omeumes:" + "b" * 40)

    def test_oci_root_must_be_for_the_requested_tag(self):
        self.entries["index.json"] = encoded({"manifests": [{**descriptor(self.entries[self.manifest_name])}]})
        self.write()
        with self.assertRaisesRegex(ValueError, "release tag"):
            self.verify()

    def test_config_and_manifest_metadata_are_hashed(self):
        for name in (self.config_name, self.manifest_name):
            with self.subTest(name=name):
                original = self.entries[name]
                self.entries[name] = original + b" "
                self.write()
                with self.assertRaisesRegex(ValueError, "digest mismatch"):
                    self.verify()
                self.entries[name] = original

    def test_oci_manifest_must_reference_the_selected_configuration(self):
        wrong = encoded({"config": {"digest": OTHER}, "layers": []})
        self.entries["blobs/sha256/" + digest(wrong)[7:]] = wrong
        self.entries["index.json"] = encoded({"manifests": [{
            **descriptor(wrong), "annotations": {"org.opencontainers.image.ref.name": TAG}
        }]})
        self.write()
        with self.assertRaisesRegex(ValueError, "does not reference"):
            self.verify()

    def test_another_platform_is_rejected(self):
        wrong = encoded({"os": "linux", "architecture": "arm64"})
        name = "blobs/sha256/" + digest(wrong)[7:]
        self.entries[name] = wrong
        self.entries["manifest.json"] = encoded([{"Config": name, "RepoTags": [TAG]}])
        self.write()
        with self.assertRaisesRegex(ValueError, "linux/amd64"):
            self.verify()

    def test_legacy_archive_only_proves_the_config_identity(self):
        del self.entries["index.json"]
        self.write()
        self.assertEqual(self.verify(loaded=self.config_id), self.config_id)
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            self.verify()

    def test_multiple_images_are_rejected(self):
        manifest = json.loads(self.entries["manifest.json"])
        self.entries["manifest.json"] = encoded(manifest + manifest)
        self.write()
        with self.assertRaisesRegex(ValueError, "exactly"):
            self.verify()

    def test_metadata_symlinks_and_large_metadata_are_rejected(self):
        self.write(symlink=self.config_name)
        with self.assertRaisesRegex(ValueError, "metadata entry"):
            self.verify()
        self.entries[self.config_name] = b"x" * (1024 * 1024 + 1)
        self.write()
        with self.assertRaisesRegex(ValueError, "metadata entry"):
            self.verify()

    def test_cli_returns_loaded_id_and_reports_failures(self):
        self.write()
        args = [sys.executable, str(HELPER), str(self.archive), TAG, self.config_id]
        success = subprocess.run([*args, self.manifest_id], capture_output=True, text=True, check=False)
        self.assertEqual(success.returncode, 0, success.stderr)
        self.assertEqual(success.stdout.strip(), self.manifest_id)
        failure = subprocess.run([*args, OTHER], capture_output=True, text=True, check=False)
        self.assertNotEqual(failure.returncode, 0)
        self.assertEqual(failure.stdout, "")
        self.assertIn("Image verification failed: Image identity mismatch", failure.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
