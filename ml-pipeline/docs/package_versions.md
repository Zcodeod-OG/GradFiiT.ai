# Package Version Policy

This project now uses pinned package versions in [requirements.txt](../requirements.txt) to keep runs reproducible across environments.

## Requirement sets
- [requirements.txt](../requirements.txt): full baseline
- [requirements-dev.txt](../requirements/requirements-dev.txt): local development
- [requirements-docker.txt](../requirements/requirements-docker.txt): container runtime
- [requirements-gpu.txt](../requirements/requirements-gpu.txt): GPU-specific additions
- [requirements-minimal.txt](../requirements/requirements-minimal.txt): lightweight smoke tests

## Update policy
1. Update package pins in one pull request per release cycle.
2. Run smoke tests (`test_installation.py`) after every dependency bump.
3. Regenerate model manifest (`download_models.py`) when model dependencies change.
4. Run benchmark and release-gate scripts before promoting to production.

