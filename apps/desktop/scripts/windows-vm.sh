#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
VM_HOME="${MIMIK_VM_HOME:-$HOME/.local/share/mimik-vm}"
PORT="${MIMIK_VM_PORT:-8099}"
STAGE="$VM_HOME/serve"
ISO="$VM_HOME/windows-11/windows-11.iso"

for tool in quickget quickemu python3; do
  command -v "$tool" >/dev/null || { echo "missing $tool. install with: yay -S quickemu"; exit 1; }
done

mkdir -p "$STAGE"
cd "$VM_HOME"

if [ ! -f windows-11.conf ]; then
  quickget windows 11 || true
fi

if [ ! -s windows-11/virtio-win.iso ] || [ "$(stat -c %s windows-11/virtio-win.iso)" -lt 100000000 ]; then
  echo "==> fetching VirtIO drivers"
  rm -f windows-11/virtio-win.iso
  curl -fL --retry 3 --progress-bar -o windows-11/virtio-win.iso \
    https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/stable-virtio/virtio-win.iso
fi

if [ ! -f "$ISO" ]; then
  cat <<EOF

Microsoft blocks scripted ISO downloads by IP, so fetch it once by hand:

  1. https://www.microsoft.com/en-us/software-download/windows11
  2. "Download Windows 11 Disk Image (ISO) for x64 devices", multi-edition
  3. mv ~/Downloads/Win11_*.iso "$ISO"

Then run this again.

EOF
  exit 1
fi

echo "==> staging the working tree at $(git -C "$REPO" rev-parse --short HEAD)"
git -C "$REPO" ls-files -z --cached --others --exclude-standard |
  (cd "$REPO" && while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s\0' "$f"; done) |
  tar -czf "$STAGE/mimik-src.tar.gz" -C "$REPO" --null -T -
sed "s|__PORT__|$PORT|g" "$HERE/windows-vm-setup.ps1" > "$STAGE/setup.ps1"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$STAGE" >/dev/null 2>&1 &
trap 'kill %1 2>/dev/null || true' EXIT

cat <<EOF

In the guest, open PowerShell and run:

  iwr http://10.0.2.2:$PORT/setup.ps1 -OutFile \$env:TEMP\setup.ps1; powershell -ExecutionPolicy Bypass -File \$env:TEMP\setup.ps1

Change code here, re-run this script, re-run that line in Windows.
Set the guest resolution once in Windows: Display settings, Display resolution.

EOF

quickemu --vm windows-11.conf --display spice
