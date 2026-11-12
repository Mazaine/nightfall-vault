"""Save pip-audit dependency IDs and versions without advisory bodies.

Requires pip-audit in the invoking (preferably disposable) environment.
Exit status follows pip-audit: 0 clean, 1 vulnerabilities, other errors unchanged.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--requirements", type=Path, default=Path(__file__).resolve().parents[1] / "requirements-prod.txt")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    with TemporaryDirectory(prefix="nightfall-dependency-audit-") as directory:
        raw_path = Path(directory) / "result.json"
        run = subprocess.run([sys.executable, "-m", "pip_audit", "--progress-spinner", "off",
                              "-r", str(args.requirements), "-f", "json", "-o", str(raw_path)], check=False)
        if not raw_path.exists():
            return run.returncode or 2
        data = json.loads(raw_path.read_text())
    result = {"dependency_count": len(data.get("dependencies", [])), "packages": [
        {"name": row["name"], "version": row["version"], "vulnerabilities": [
            {key: vuln.get(key) for key in ("id", "aliases", "fix_versions")}
            for vuln in row.get("vulns", [])]}
        for row in data.get("dependencies", []) if row.get("vulns")]}
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"dependency_count": result["dependency_count"], "packages": [
        {"name": row["name"], "version": row["version"], "vulnerability_count": len(row["vulnerabilities"])}
        for row in result["packages"]]}))
    return run.returncode


if __name__ == "__main__":
    raise SystemExit(main())
