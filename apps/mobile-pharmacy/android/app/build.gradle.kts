import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Phase 11 (docs/mobile/IMPLEMENTATION-PLAN.md §11): release signing, loaded
// from android/key.properties when it exists. That file is deliberately not
// committed — see docs/mobile/SECURITY-DESIGN.md §10 and this project's
// .gitignore — and does not exist in this repo/environment. When it's
// absent, the release buildType below falls back to the debug signing
// config, so `flutter build apk --release` still succeeds everywhere this
// repo is checked out without ever requiring a real key. Once a real
// keystore exists, drop a key.properties file next to this build.gradle.kts
// (i.e. in android/, alongside settings.gradle.kts) with:
//   storePassword=...
//   keyPassword=...
//   keyAlias=...
//   storeFile=../relative/or/absolute/path/to/the.jks
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
val hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "in.abies.abies_pharmacy"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // Required for the per-flavor resValue("string", "app_name", ...) calls
    // below — this AGP version defaults resValues generation to off.
    buildFeatures {
        resValues = true
    }

    defaultConfig {
        // Base application ID — dev/uat flavors below append their own
        // applicationIdSuffix so all three can be installed side by side on
        // one device (docs/mobile/MOBILE-ARCHITECTURE.md §8); prod keeps this
        // base id unsuffixed since it's the one real store listing.
        applicationId = "in.abies.abies_pharmacy"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (hasReleaseKeystore) {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
            // No `else` branch: with no key.properties, this signingConfig is
            // left unconfigured and simply isn't used — see buildTypes.release
            // below, which picks the debug config instead in that case.
        }
    }

    // Three flavors matching lib/main_dev.dart / main_uat.dart / main_prod.dart
    // and the ABIES_ENV dart-define convention (lib/core/env/app_env.dart).
    // Build with e.g.:
    //   flutter build apk --debug --flavor dev --dart-define=ABIES_ENV=dev -t lib/main_dev.dart
    // The --flavor value must match a productFlavor name here exactly; the
    // dart-define and -t target are independent flags Flutter also needs —
    // none of the three implies the others (`flutter help build apk`).
    flavorDimensions += "environment"
    productFlavors {
        create("dev") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            // Per-flavor app label, the real Flutter/Android way: a Gradle
            // resValue generates a flavor-scoped res/values strings.xml at
            // build time (no hand-maintained src/dev/res/values/strings.xml
            // needed). AndroidManifest.xml's android:label references
            // @string/app_name, which resolves to this per flavor.
            resValue("string", "app_name", "Abies Pharmacy Dev")
        }
        create("uat") {
            dimension = "environment"
            applicationIdSuffix = ".uat"
            resValue("string", "app_name", "Abies Pharmacy UAT")
        }
        create("prod") {
            dimension = "environment"
            resValue("string", "app_name", "Abies Pharmacy")
        }
    }

    buildTypes {
        release {
            // Real release signing when android/key.properties exists (never
            // the case in this repo/environment — see above); otherwise the
            // debug signing config, so `flutter build apk --release` still
            // succeeds here. A release build produced this way is
            // debug-signed, not a store-distributable artifact — see
            // docs/mobile/PRODUCTION-READINESS.md and PLAY-STORE-RELEASE.md.
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
