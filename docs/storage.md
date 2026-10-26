# multiOS Cross-Platform Storage & Temporary Ingestion

Specification for intermediate staging, disk flushing, and clean-up of transferred assets.

## Staging Directory Layout

```
%LOCALAPPDATA%/multiOS/
  ├── staging/          # Temporary chunk accumulation
  ├── incoming/         # Completed and checksum-verified files
  └── telemetry/        # Rolling session event logs
```

## Storage Guarantees

- Unfinished files aborted midway through upload are automatically culled on session termination.
- Staging directory is audited on service start to clean any orphaned `.tmp` files from unexpected OS reboots.
