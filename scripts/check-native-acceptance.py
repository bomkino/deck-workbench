#!/usr/bin/env python3
# The one acceptance rule for a packaged app's receipt (native-acceptance.json,
# written by --native-self-test). scripts/verify-native-package.sh applies it
# after every build and scripts/publish-native-release.sh before a release, so
# a build is accepted on exactly the same terms in both places.
#
#   python3 scripts/check-native-acceptance.py <receipt> <commit> [<version>]
#
# Every true/false field in the receipt must be true, none of the checks named
# below may be missing (so dropping a check from the self-test can't pass
# silently), and the handoff counts must match the journey.
import json
import sys

REQUIRED = [
    'copyComplete', 'previewScope', 'shortlistIndependent', 'reopen', 'savedCopyRecovery',
    'uiIndependentPDF', 'imageVisibleInPDF', 'nativeKeyEvents', 'productionCopy',
    'starterGridAndType', 'sharedPSDExport', 'slideManagement', 'copyEditorTarget',
    'editedCopyHandoff', 'layoutFrameCopy', 'layoutResetUndo', 'textLayoutReused',
    'gradientScreenExportParity', 'visibleLayoutTargets', 'layoutPicker', 'perImageEdits',
    'notesUndo', 'validationDoesNotFence', 'reviewNavigation', 'cropZoomUndo',
    'notesTargetIdentity', 'catalogRevisionReuse', 'boundedImport', 'lifecycleSerialization',
    'copyOnlyIndependent', 'literalCopy', 'safeFilenames', 'thumbnailCache', 'crashRecovery',
    'mediaCatalog', 'renderingGeometry',
]


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def main():
    if len(sys.argv) not in (3, 4):
        raise SystemExit('Pass the receipt, the commit and optionally the version')
    with open(sys.argv[1], encoding='utf-8') as handle:
        receipt = json.load(handle)
    problems = []
    if receipt.get('format') != 'pitchdog.native-acceptance/1':
        problems.append('unknown receipt format %r' % receipt.get('format'))
    if receipt.get('commit') != sys.argv[2]:
        problems.append('receipt is for commit %r, not %s' % (receipt.get('commit'), sys.argv[2]))
    if len(sys.argv) == 4 and receipt.get('version') != sys.argv[3]:
        problems.append('receipt is for version %r, not %s' % (receipt.get('version'), sys.argv[3]))
    missing = [name for name in REQUIRED if not isinstance(receipt.get(name), bool)]
    if missing:
        problems.append('missing checks: ' + ', '.join(missing))
    failed = sorted(name for name, value in receipt.items() if isinstance(value, bool) and value is not True)
    if failed:
        problems.append('failed checks: ' + ', '.join(failed))
    if receipt.get('prototypePages') != 20 or receipt.get('rapidDecisions') != 40 \
            or not number(receipt.get('originalCopies')) or receipt['originalCopies'] < 60:
        problems.append('incomplete handoff acceptance (prototypePages %r, rapidDecisions %r, originalCopies %r)'
                        % (receipt.get('prototypePages'), receipt.get('rapidDecisions'), receipt.get('originalCopies')))
    if problems:
        print('Failed packaged acceptance: ' + '; '.join(problems), file=sys.stderr)
        raise SystemExit(1)
    checks = sum(1 for value in receipt.values() if isinstance(value, bool))
    print('Packaged acceptance: all %d checks true for %s' % (checks, sys.argv[2]))


main()
