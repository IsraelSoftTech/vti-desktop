"""Create a zip whose members are relative to STAGING (ui/, mobile-back/, …)."""
import os
import sys
import zipfile

def main():
    if len(sys.argv) != 3:
        print("usage: zip-payload.py STAGING ZIP_PATH", file=sys.stderr)
        sys.exit(2)
    staging = os.path.abspath(sys.argv[1])
    zip_path = os.path.abspath(sys.argv[2])
    parent = os.path.dirname(zip_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    if os.path.exists(zip_path):
        os.remove(zip_path)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for dirpath, dirnames, filenames in os.walk(staging):
            dirnames.sort()
            filenames.sort()
            for name in filenames:
                full = os.path.join(dirpath, name)
                rel = os.path.relpath(full, staging).replace("\\", "/")
                zf.write(full, rel)


if __name__ == "__main__":
    main()
