# DW-T00 — Package-entry containment review

Status: source-ready; exact macOS packaged journey required before integrated claim.

## P0 finding

Required `.pitchdeck` entries were opened by absolute path. `Data(contentsOf:)` and
`FileHandle(forWritingTo:)` followed symbolic links, so a crafted package could
redirect a required read or journal append outside the selected package. Durable
replacement also lacked an explicit regular-file check.

## Applied fix

All required entry I/O now begins by opening the selected package directory with
`O_DIRECTORY | O_NOFOLLOW`. Each fixed relative component is traversed using
`openat` with `O_NOFOLLOW`; `.` / `..`, empty and NUL-bearing components reject.
Required files are accepted only after `fstat` proves `S_IFREG`.

- Reads use a no-follow descriptor relative to the opened package root.
- Journal append uses `O_APPEND | O_NOFOLLOW`, verifies the opened descriptor is a
  regular file, writes, synchronizes and fsyncs that same descriptor.
- Durable replacements reject an existing symlink or non-regular destination,
  create an exclusive no-follow temporary file inside the verified parent, fsync
  it, `renameat` within the same directory descriptor and fsync the parent.
- `attachments` and `recovery` must be real contained directories. The package
  root itself must be a real directory rather than a symbolic link.

This descriptor-relative design keeps operations attached to the directory inode
that was actually authorized; it does not rely on a vulnerable string-prefix or
`resolvingSymlinksInPath` preflight.

## Causal verification

Portable source checks require the no-follow root/read/append/create calls,
regular-file check and descriptor-relative rename. The packaged macOS negative
journey creates three independent fixtures:

1. linked required read → `MissingAttachment`;
2. linked journal after open → `CheckpointWriteFailure`;
3. linked manifest replacement after open → `CheckpointWriteFailure`.

Each target is an outside-package sentinel whose bytes must remain unchanged.
Unsupported-schema and corrupt-journal negative fixtures continue to run.

## Remaining gate and risk

Run the exact packaged journey on macOS and retain its receipt before calling this
integrated. The change is confined to package I/O; Deck semantics, journal order,
bridge authority and renderer filesystem access are unchanged. The main regression
risk is OS/API behavior of the Darwin descriptor flags, which the macOS compile and
packaged negative journey directly cover.
