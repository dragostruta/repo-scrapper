# Deployment runbook

The service is deployed as two containers behind a load balancer.

## Order of operations

1. Apply database migrations first. They are written to be backward
   compatible, so the currently running version keeps working against the new
   schema.
2. Roll out the new image one instance at a time, waiting for the health check
   to pass before moving to the next.
3. Only once every instance is on the new version, remove columns that the old
   version still read.

## Rolling back

Roll the image back first, then the migration, and never the other way round -
a rolled-back image against a rolled-forward schema is the combination that
takes the service down.

## Health checks

The load balancer polls `/health`. A instance that fails three consecutive
checks is pulled from rotation but left running, so its logs can be read.
