#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "4" | sudo "$SCRIPT_DIR/install.sh"
