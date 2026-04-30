#!/usr/bin/env bash
# Install Meta's SAM2 from source at a known-good commit.
# Run inside the Dockerfile after the pip install layer.
set -euo pipefail

SAM2_REF="${SAM2_REF:-c17e74f}"
WORKDIR="${WORKDIR:-/tmp/sam2}"

git clone https://github.com/facebookresearch/sam2.git "${WORKDIR}"
cd "${WORKDIR}"
git checkout "${SAM2_REF}"
pip install --no-build-isolation -e .
