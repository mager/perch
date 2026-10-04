"""Build/check the public agent ZIP using only explicitly reviewed source files.

Maintainer tooling requires Python 3. The downloaded agent only needs Node.js 22.
Use uncompressed entries with fixed metadata for reproducible bytes across hosts.
"""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DESTINATION = ROOT / "public/downloads/perch-mac-agent.zip"
FILES = {
    "README.md": "docs/mac-agent-download.md",
    "LICENSE": "LICENSE",
    ".env.agent.example": ".env.agent.example",
    "agent/agent.mjs": "agent/agent.mjs",
    "agent/tailscale.mjs": "agent/tailscale.mjs",
    "src/tailscale.mjs": "src/tailscale.mjs",
    "scripts/install-agent.mjs": "scripts/install-agent.mjs",
}


def build():
    contents = {name: (ROOT / source).read_bytes() for name, source in FILES.items()}
    manifest = {
        "name": "perch-mac-agent",
        "version": json.loads((ROOT / "package.json").read_text())["version"],
        "runtime": "Node.js 22",
        "source": "https://github.com/mager/perch",
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in contents.items()},
    }
    contents["manifest.json"] = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in sorted(contents.items()):
            info = zipfile.ZipInfo("perch-mac-agent/" + name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    return output.getvalue()


def main():
    if sys.argv[1:] not in ([], ["--check"]):
        raise SystemExit("Usage: python3 scripts/package-agent.py [--check]")
    data = build()
    checksum = (hashlib.sha256(data).hexdigest() + "  " + DESTINATION.name + "\n").encode()
    checksum_path = DESTINATION.with_suffix(".zip.sha256")
    if "--check" in sys.argv:
        if not DESTINATION.exists() or DESTINATION.read_bytes() != data or not checksum_path.exists() or checksum_path.read_bytes() != checksum:
            raise SystemExit("Agent download is stale or missing. Run npm run package:agent.")
        with tempfile.TemporaryDirectory(prefix="perch-package-") as directory:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if archive.testzip() is not None:
                    raise SystemExit("Agent archive integrity check failed.")
                archive.extractall(directory)
            # Import from the extracted package to catch missing runtime modules.
            # This does not collect data, transmit a heartbeat, or install a service.
            subprocess.run(["node", "--input-type=module", "-e", "await import('./agent/agent.mjs')"], cwd=Path(directory) / "perch-mac-agent", check=True)
        print("Agent ZIP matches its source allowlist; extracted runtime imports successfully.")
    else:
        DESTINATION.parent.mkdir(parents=True, exist_ok=True)
        DESTINATION.write_bytes(data)
        checksum_path.write_bytes(checksum)
        print(f"Built {DESTINATION.relative_to(ROOT)} ({len(data):,} bytes).")


if __name__ == "__main__":
    main()
