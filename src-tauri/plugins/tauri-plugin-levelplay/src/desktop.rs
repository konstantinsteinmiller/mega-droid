use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Levelplay<R>> {
    Ok(Levelplay(app.clone()))
}

/// Desktop stub. LevelPlay has no desktop SDK, so every call is inert
/// and the responses carry `shown: false`. The ad provider abstraction
/// on the JS side already gates UI on `isReady`, which stays false for
/// desktop builds.
pub struct Levelplay<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Levelplay<R> {
    pub fn init_sdk(&self, _payload: InitRequest) -> crate::Result<InitResponse> {
        Ok(InitResponse { initialized: false })
    }

    pub fn show_rewarded(&self) -> crate::Result<ShowAdResponse> {
        Ok(ShowAdResponse::default())
    }

    pub fn show_interstitial(&self) -> crate::Result<ShowAdResponse> {
        Ok(ShowAdResponse::default())
    }

    pub fn show_privacy_options(&self) -> crate::Result<PrivacyOptionsResponse> {
        Ok(PrivacyOptionsResponse {
            shown: false,
            error: Some("desktop: no consent form".into()),
        })
    }

    pub fn launch_test_suite(&self) -> crate::Result<LaunchTestSuiteResponse> {
        Ok(LaunchTestSuiteResponse {
            launched: false,
            error: Some("desktop: LevelPlay Test Suite is mobile-only".into()),
        })
    }
}
