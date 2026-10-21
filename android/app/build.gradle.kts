plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.nazzil"
    compileSdk = 36
    defaultConfig {
        applicationId = "app.nazzil"
        minSdk = 26
        targetSdk = 36
        versionCode = 10
        versionName = "4.5.0"
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
    }
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64")
            isUniversalApk = true
        }
    }
    // Release signing comes from the environment (CI secrets). Without it the build falls back to the debug key,
    // which installs fine from GitHub but is NOT accepted by Google Play.
    val ks = System.getenv("NAZZIL_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
    signingConfigs {
        if (ks != null) create("release") {
            storeFile = ks
            storePassword = System.getenv("NAZZIL_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("NAZZIL_KEY_ALIAS")
            keyPassword = System.getenv("NAZZIL_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (ks != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { jniLibs { useLegacyPackaging = true } }
    // Shared web UI lives in /web at the repo root.
    sourceSets["main"].assets.srcDirs("src/main/assets", "../../web")
}

dependencies {
    // 0.18.x: native libs aligned to 16 KB pages (required by Google Play) and bundled QuickJS for YouTube.
    implementation("io.github.junkfood02.youtubedl-android:library:0.18.1")
    implementation("io.github.junkfood02.youtubedl-android:ffmpeg:0.18.1")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    // enableEdgeToEdge() (activity 1.8+) and WindowInsets helpers for Android 15+ edge-to-edge.
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.13.1")
}
