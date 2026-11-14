use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.plugin.levelplay";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_levelplay);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<Levelplay<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "LevelPlayPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_levelplay)?;
    Ok(Levelplay(handle))
}

/// Handle to the native LevelPlay plugin. The `run_mobile_plugin` call
/// dispatches to `LevelPlayPlugin.kt` (Android) or `LevelPlayPlugin.swift`
/// (iOS) by method name. Method names here are camelCase to match the
/// `@Command`-annotated Kotlin functions and the `@objc` Swift selectors.
pub struct Levelplay<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Levelplay<R> {
    pub fn init_sdk(&self, payload: InitRequest) -> crate::Result<InitResponse> {
        // Native method name is `initialize` — `init` is a Swift keyword
        // (NSObject constructor) so the iOS side cannot expose `@objc init:`
        // without conflicting with the inherited `init` selector.
        // Kotlin matches the same name to keep the Rust dispatch table
        // platform-agnostic.
        self.0
            .run_mobile_plugin("initialize", payload)
            .map_err(Into::into)
    }

    pub fn show_rewarded(&self) -> crate::Result<ShowAdResponse> {
        self.0
            .run_mobile_plugin("showRewarded", ())
            .map_err(Into::into)
    }

    pub fn show_interstitial(&self) -> crate::Result<ShowAdResponse> {
        self.0
            .run_mobile_plugin("showInterstitial", ())
            .map_err(Into::into)
    }

    /// Re-opens Google UMP's consent form (the privacy options entry point).
    pub fn show_privacy_options(&self) -> crate::Result<PrivacyOptionsResponse> {
        self.0
            .run_mobile_plugin("showPrivacyOptions", ())
            .map_err(Into::into)
    }

    /// Opens LevelPlay's built-in Test Suite overlay over the running app.
    /// Native side requires the app to have been initialized with
    /// `is_test_suite=enable` metadata (the JS provider sets this when
    /// `enableTestSuite` is passed to `init`). The Test Suite serves test
    /// ads regardless of account-approval / store-publication state, so
    /// it's the right diagnostic for a pre-launch build.
    pub fn launch_test_suite(&self) -> crate::Result<LaunchTestSuiteResponse> {
        self.0
            .run_mobile_plugin("launchTestSuite", ())
            .map_err(Into::into)
    }
}
