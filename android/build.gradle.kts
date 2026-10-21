plugins {
    // AGP 8.9+ is needed for compileSdk/targetSdk 36 (Google Play requires API 36 for new apps from Aug 2026).
    id("com.android.application") version "8.9.1" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
