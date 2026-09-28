#!/bin/sh
# Fast iteration on CT 127: fast-forward the dev clone as `foundry`, no restart.
# Enough for module/, templates/, css/ and lang/ changes (reload the browser);
# system.json or pack changes need scripts/deploy-system.sh 127 base-knavery.
set -eu
ssh -o BatchMode=yes root@greaves "pct exec 127 -- su - foundry -c 'git -C ~/knavery-dev/Data/systems/base-knavery pull -q --ff-only && git -C ~/knavery-dev/Data/systems/base-knavery log --oneline -1'"
