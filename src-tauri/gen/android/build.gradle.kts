buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.11.0")
        // Kotlin 2.1.x is required: the LevelPlay mediation SDK (9.4.0+)
        // ships stdlib metadata compiled with Kotlin 2.1.0, which a
        // pre-2.1.0 compiler cannot read — attempting it cascades into
        // "kotlin.Unit was compiled with an incompatible version" for
        // every Kotlin class on the classpath.
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}

