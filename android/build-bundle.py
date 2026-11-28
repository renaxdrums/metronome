"""Build and validate an unsigned Play bundle from the verified API 36 APK."""

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path, PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile


def run(*args):
    return subprocess.run([str(arg) for arg in args], check=True, text=True,
                          stdout=subprocess.PIPE).stdout


def module_path(name):
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or "\\" in name:
        raise ValueError(f"Unsafe APK entry: {name}")
    if name == "AndroidManifest.xml":
        return "manifest/" + name
    if name == "resources.pb" or name.startswith(("res/", "assets/")):
        return name
    if name == "classes.dex":
        return "dex/" + name
    if name.startswith("META-INF/"):
        return None
    raise ValueError(f"Unexpected APK entry: {name}")


def build(apk, aapt2, java, bundletool, output):
    if output.exists():
        raise FileExistsError(output)
    badging = run(aapt2, "dump", "badging", apk)
    if "targetSdkVersion:'36'" not in badging.splitlines():
        raise ValueError("The input APK must target API 36.")

    with tempfile.TemporaryDirectory(prefix="renax-bundle-") as directory:
        work = Path(directory)
        proto, module, bundle = (work / name for name in ("proto.apk", "base.zip", "app.aab"))
        run(aapt2, "convert", "--output-format", "proto", "-o", proto, apk)
        expected = {"manifest/AndroidManifest.xml", "resources.pb", "dex/classes.dex"}
        seen = set()
        with ZipFile(proto) as source, ZipFile(module, "w", ZIP_DEFLATED) as target:
            for item in source.infolist():
                if item.is_dir():
                    continue
                name = module_path(item.filename)
                if name is None:
                    continue
                if name in seen:
                    raise ValueError(f"Duplicate APK entry: {name}")
                seen.add(name)
                with source.open(item) as incoming, target.open(name, "w") as outgoing:
                    shutil.copyfileobj(incoming, outgoing)
        if not expected.issubset(seen) or "assets/site/index.html" not in seen:
            raise ValueError("The APK is missing the manifest, code or site resources.")

        run(java, "-jar", bundletool, "build-bundle", f"--modules={module}", f"--output={bundle}")
        run(java, "-jar", bundletool, "validate", f"--bundle={bundle}")
        with ZipFile(apk) as original, ZipFile(bundle) as result:
            assets = {name for name in original.namelist() if name.startswith("assets/") and not name.endswith("/")}
            bundled = {name.removeprefix("base/") for name in result.namelist() if name.startswith("base/assets/") and not name.endswith("/")}
            if assets != bundled:
                raise ValueError("The bundle asset inventory differs from the input APK.")
            for name in assets:
                if original.read(name) != result.read("base/" + name):
                    raise ValueError(f"The bundle changed an APK asset: {name}")
            if original.read("classes.dex") != result.read("base/dex/classes.dex"):
                raise ValueError("The bundle changed the compiled code.")
        with bundle.open("rb") as source, output.open("xb") as destination:
            shutil.copyfileobj(source, destination)
    print(f"Unsigned bundle validated: {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("apk", "aapt2", "java", "bundletool", "output"):
        parser.add_argument("--" + option, type=Path, required=True)
    build(**vars(parser.parse_args()))
