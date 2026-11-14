import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val keystoreProperties = Properties().apply {
    val propFile = rootProject.file("key.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.hyperg8.megadroid"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        // AdMob App ID injected into the LevelPlay plugin's manifest via
        // the `${admobAppId}` placeholder. Sourced from .env.tauri's
        // `VITE_APP_ADMOB_ANDROID_APP_ID` (loaded into the build process
        // by `dotenv -e .env.tauri --` in the pnpm tauri:build-android-apk
        // script). Falls back to Google's documented AdMob test app ID
        // so a forgotten env var produces a working dev build instead
        // of a crash on startup.
        manifestPlaceholders["admobAppId"] = System.getenv("VITE_APP_ADMOB_ANDROID_APP_ID")
            ?: "ca-app-pub-3940256099942544~3347511713"
        applicationId = "com.hyperg8.megadroid"
        minSdk = 24
        targetSdk = 36
        // versionCode source of truth (in priority order):
        //   1. ANDROID_VERSION_CODE env var — set by CI to a monotonically
        //      increasing integer (e.g. ${{ github.run_number }} on GHA).
        //      Play Console rejects uploads whose code does not exceed the
        //      previous one, so CI is the only safe place to authoritatively
        //      bump it.
        //   2. tauri.properties (`tauri.android.versionCode`) — populated by
        //      `tauri android build` when present, used for local builds.
        //   3. literal "1" — first-ever build fallback.
        versionCode = (System.getenv("ANDROID_VERSION_CODE")
            ?: tauriProperties.getProperty("tauri.android.versionCode", "1")).toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            keystoreProperties["keyAlias"]?.let { keyAlias = it as String }
            keystoreProperties["password"]?.let {
                val password = it as String
                keyPassword = password
                storePassword = password
            }
            keystoreProperties["storeFile"]?.let { storeFile = file(it as String) }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }

    applicationVariants.all {
        outputs.all {
            (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
                "megadroid-${defaultConfig.versionName}.apk"
        }
    }
}

afterEvaluate {
    tasks.matching { it.name.startsWith("bundle") && it.name.endsWith("Release") }.configureEach {
        doLast {
            // Mirror the produced AAB to a package-named copy
            // (`com.hyperg8.megadroid.aab`) for upload tooling, while leaving
            // the original `app-universal-release.aab` in place. The
            // earlier version of this block did `renameTo`, which broke
            // AGP's `produceUniversalReleaseBundleIdeListingFile` task
            // (added in AGP 8.x): it runs AFTER our `doLast` and expects
            // the original filename to still exist. `copyTo` with
            // `overwrite = true` keeps both files around — Gradle is
            // happy, upload scripts that look for the package-named
            // file are happy.
            val bundleRoot = layout.buildDirectory.dir("outputs/bundle").get().asFile
            bundleRoot.listFiles()?.filter { it.isDirectory }?.forEach { variantDir ->
                variantDir.listFiles { _, name -> name.endsWith(".aab") }?.forEach { aab ->
                    val target = File(aab.parentFile, "${android.defaultConfig.applicationId}.aab")
                    if (aab.name != target.name) {
                        aab.copyTo(target, overwrite = true)
                    }
                }
            }
        }
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")