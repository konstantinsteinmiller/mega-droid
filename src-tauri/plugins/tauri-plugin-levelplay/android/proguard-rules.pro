# LevelPlay / ironSource SDK keep rules.
-keepclassmembers class com.ironsource.** { *; }
-keep class com.ironsource.** { *; }
-keep class com.google.android.gms.ads.identifier.** { *; }
-dontwarn com.ironsource.**
-dontwarn com.google.ads.**

# The plugin class is instantiated by name from the Tauri plugin manager.
-keep class com.plugin.levelplay.** { *; }
