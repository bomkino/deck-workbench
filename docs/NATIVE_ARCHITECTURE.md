# Active native architecture

NativeWorkbenchUI / NativeCanvas / NativeShortcuts are the working Mac surfaces. NativeWorkbenchController owns transient view state and queues intentions with captured slide/asset identity. NativeDocumentSession serialises the kernel and durable store. DeckKernelHost runs the bundled TypeScript-derived JavaScript in JavaScriptCore without a browser. PitchDeckDocumentStore owns checkpoints, journals, reader compatibility and recovery. MediaCatalogSession and NativeMediaIO own authorised source access and derived previews. NativeSlideRenderer resolves copy/images/gradients; NativeHandoffExporter uses that content for the designer package.

Build entry: scripts/build-native-macos.sh. It compiles Native*.swift plus the shared kernel host, catalog, store and failure types. The old WebKit application entry point and workspace are removed. scripts/build-macos.sh delegates to the native build. No npm production dependency is required.

Remaining proof is tracked in KNOWN_LIMITATIONS.md. Priorities after hands-on feedback: correct missing/wrong content first; then stable keyboard/focus, source/recovery failures, and measured responsiveness. Keep scope to prototype direction and handoff. Do not add production typography, universal file conversion, cloud collaboration, new runtimes or unrelated abstractions.
