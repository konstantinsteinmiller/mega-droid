// swift-tools-version:5.9
import PackageDescription

// LevelPlay iOS dependencies as Swift Packages.
//
//   • IronSource + ISAdMobAdapter (LOCAL binary targets, plus manual
//     -F/-framework flags). Tauri invokes `swift build` from the CLI
//     through swift-rs. SPM's CLI build is buggy with xcframework
//     binary targets: even when the binary target resolves cleanly,
//     SPM does not propagate the framework search path to the Swift
//     compile invocation of consuming targets, so `import IronSource`
//     fails at compile time with "no such module". Xcode's GUI build
//     accidentally works around it. See
//     https://github.com/swiftlang/swift-package-manager/issues/5723
//     and the related Swift Forums threads.
//
//     Workaround in two layers:
//       1. `build.rs` pre-downloads both xcframework zips and unwraps
//          them to `ios/Frameworks/<Name>.xcframework` before SPM
//          resolves the package. The binary targets reference these
//          local paths, which avoids the URL-extraction nesting bug
//          and pins SPM's link-line work to a stable on-disk layout.
//       2. `swiftSettings.unsafeFlags` and `linkerSettings.unsafeFlags`
//          explicitly add `-F <slice>/ios-arm64` and `-framework <Name>`
//          so the Swift compiler finds the modulemap and the linker
//          finds the binary, regardless of what SPM's binary-target
//          plumbing decides to emit (or skip).
//
//     Binary-target NAMES match the xcframework basenames so the Swift
//     module names from the modulemaps (`IronSource`, `ISAdMobAdapter`)
//     line up with what consumers `import`.
//
//     iOS-arm64-only: device builds for TestFlight/App Store. If we
//     ever need simulator builds in CI, add a second `-F` per
//     framework pointing at the `ios-arm64_x86_64-simulator` slice.
//
//   • GoogleMobileAds — required at runtime by ISAdMobAdapter; was
//     previously transitive via the AdMob adapter SPM package, now
//     declared directly since we no longer pull that package.
//
//   • Unity-Ad-Quality-Swift-Package — telemetry/quality bundle that
//     LevelPlay's binary expects to be linked alongside it. Without
//     this, runtime init logs warnings about missing symbols.
//
// Unity Ads adapter is NOT yet published to SPM (only CocoaPods).
// Skipping it for v1 — IronSource own demand + AdMob is sufficient
// for initial validation.
//
// When bumping LevelPlay, update the URLs in `build.rs` to the new
// version and delete `ios/Frameworks/` so the next build re-downloads.
//
// NOTE: the LevelPlay 9.x linker note recommends adding `-ObjC` to
// the consuming app's OTHER_LDFLAGS. Tauri's iOS Xcode project does
// not expose this directly via tauri.conf.json. If runtime crashes
// surface around unrecognized selectors, patch the project via a CI
// step using `xcodeproj` (Ruby gem; already available in the iOS CI).
let package = Package(
    name: "tauri-plugin-levelplay",
    platforms: [
        .iOS(.v14),
    ],
    products: [
        .library(
            name: "tauri-plugin-levelplay",
            type: .static,
            targets: ["tauri-plugin-levelplay"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
        .package(
            url: "https://github.com/ironsource-mobile/Unity-Ad-Quality-Swift-Package",
            "9.4.0"..<"10.0.0"
        ),
        .package(
            url: "https://github.com/googleads/swift-package-manager-google-mobile-ads",
            exact: "13.2.0"
        ),
    ],
    targets: [
        .target(
            name: "tauri-plugin-levelplay",
            dependencies: [
                .byName(name: "Tauri"),
                .byName(name: "IronSource"),
                .byName(name: "ISAdMobAdapter"),
                .product(name: "AdQuality", package: "Unity-Ad-Quality-Swift-Package"),
                .product(name: "GoogleMobileAds", package: "swift-package-manager-google-mobile-ads"),
            ],
            path: "Sources/tauri-plugin-levelplay",
            swiftSettings: [
                // Force-add framework search paths pointing at the
                // device slice of each local xcframework. Required
                // because `swift build` (CLI) does not propagate
                // binary-target framework search paths to the Swift
                // compile invocation, even though the targets are
                // declared above. Without this, `import IronSource`
                // resolves to "no such module" at compile time.
                // Build.rs places the xcframeworks at these paths
                // before SPM resolves; the device-arm64 slice is
                // sufficient for TestFlight/App Store builds.
                .unsafeFlags([
                    "-F", "Frameworks/IronSource.xcframework/ios-arm64",
                    "-F", "Frameworks/ISAdMobAdapter.xcframework/ios-arm64",
                ]),
            ],
            linkerSettings: [
                // Mirror the -F flags on the linker side and explicitly
                // request the two frameworks so `-framework` resolution
                // succeeds even if SPM's binary-target plumbing skips
                // emitting them.
                .unsafeFlags([
                    "-F", "Frameworks/IronSource.xcframework/ios-arm64",
                    "-F", "Frameworks/ISAdMobAdapter.xcframework/ios-arm64",
                    "-framework", "IronSource",
                    "-framework", "ISAdMobAdapter",
                ]),
                // System frameworks the IronSource binary expects on
                // the linker line. Mirrors the linkedFramework
                // declarations in Unity-Mediation-iAds-Swift-Package's
                // LPSPM target.
                .linkedFramework("AdSupport"),
                .linkedFramework("AudioToolbox"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("CFNetwork"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("CoreMedia"),
                .linkedFramework("CoreTelephony"),
                .linkedFramework("CoreVideo"),
                .linkedFramework("Foundation"),
                .linkedFramework("MobileCoreServices"),
                .linkedFramework("QuartzCore"),
                .linkedFramework("Security"),
                .linkedFramework("StoreKit"),
                .linkedFramework("SystemConfiguration"),
                .linkedLibrary("z"),
            ]),
        .binaryTarget(
            name: "IronSource",
            path: "Frameworks/IronSource.xcframework"
        ),
        .binaryTarget(
            name: "ISAdMobAdapter",
            path: "Frameworks/ISAdMobAdapter.xcframework"
        ),
    ]
)
