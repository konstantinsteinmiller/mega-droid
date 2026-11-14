use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::LevelplayExt;
use crate::Result;

#[command]
pub(crate) async fn init<R: Runtime>(
    app: AppHandle<R>,
    payload: InitRequest,
) -> Result<InitResponse> {
    app.levelplay().init_sdk(payload)
}

#[command]
pub(crate) async fn show_rewarded<R: Runtime>(app: AppHandle<R>) -> Result<ShowAdResponse> {
    app.levelplay().show_rewarded()
}

#[command]
pub(crate) async fn show_interstitial<R: Runtime>(app: AppHandle<R>) -> Result<ShowAdResponse> {
    app.levelplay().show_interstitial()
}

#[command]
pub(crate) async fn show_privacy_options<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PrivacyOptionsResponse> {
    app.levelplay().show_privacy_options()
}

#[command]
pub(crate) async fn launch_test_suite<R: Runtime>(
    app: AppHandle<R>,
) -> Result<LaunchTestSuiteResponse> {
    app.levelplay().launch_test_suite()
}
