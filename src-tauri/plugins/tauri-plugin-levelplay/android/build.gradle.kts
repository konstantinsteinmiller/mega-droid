plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.plugin.levelplay"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("proguard-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    // Tauri Android runtime — supplies app.tauri.plugin.{Plugin, Invoke,
    // JSObject} and the app.tauri.annotation.{TauriPlugin, Command,
    // InvokeArg} annotations the plugin's @TauriPlugin class is built
    // against. The subproject itself is registered automatically by the
    // Tauri CLI in tauri.settings.gradle.
    implementation(project(":tauri-android"))

    // ── LevelPlay mediation SDK ───────────────────────────────────────
    // Unity rebranded ironSource and moved all artifacts to Maven Central
    // under the `com.unity3d.ads-mediation` groupId. The old
    // `com.ironsource.sdk:mediationsdk` coordinate on android-sdk.is.com
    // was sunset on 2025-06-30 and no longer resolves.
    //
    // At least 9.4.3: 9.4.0–9.4.2 call PackageManager.getInstalledApplications,
    // which Google Play blocks at upload. 9.4.0+ also brings
    // LevelPlayPrivacySettings (setCOPPA / setCCPA / setGDPRConsents).
    // Changelog: docs.unity.com/en-us/grow/levelplay/sdk/android/changelog
    implementation("com.unity3d.ads-mediation:mediation-sdk:9.6.0")

    // Required transitive Google Play Services dependencies.
    implementation("com.google.android.gms:play-services-appset:16.0.0")
    implementation("com.google.android.gms:play-services-ads-identifier:18.1.0")
    implementation("com.google.android.gms:play-services-basement:18.1.0")

    // ── Google UMP (consent) ──────────────────────────────────────────
    // Google's certified consent platform. It shows the GDPR message
    // configured under AdMob → Privacy & messaging to EEA/UK/CH players
    // before any ad loads, and LevelPlay (7.7.0+) reads the consent it
    // stores for every network automatically. 3.2.0 is the version
    // play-services-ads 24.9.0 itself is built against.
    implementation("com.google.android.ump:user-messaging-platform:3.2.0")

    // ── AdMob bidder ──────────────────────────────────────────────────
    // Pinned to Google Mobile Ads 24.9.0 (adapter 5.5.0 = 5.4.0's 24.9.0
    // support + a creative-ID fix). Google Mobile Ads 25.x is compiled with
    // Kotlin 2.3 metadata, which this project's Kotlin 2.1 compiler cannot
    // read (gen/android/build.gradle.kts); 25.x needs adapter 5.6.0+.
    // github.com/ironsource-mobile/levelplay-android-adapters (CHANGELOG)
    implementation("com.unity3d.ads-mediation:admob-adapter:5.5.0")
    implementation("com.google.android.gms:play-services-ads:24.9.0")

    // ── Unity Ads bidder ──────────────────────────────────────────────
    // Adapter 5.8.0 fixed missing interstitial / rewarded close callbacks,
    // which would leave the game waiting on an ad that already closed.
    // 5.12.0+ requires Unity Ads 4.20.0 or later.
    implementation("com.unity3d.ads-mediation:unityads-adapter:5.13.0")
    implementation("com.unity3d.ads:unity-ads:4.20.1")

    implementation("androidx.appcompat:appcompat:1.7.1")
}
