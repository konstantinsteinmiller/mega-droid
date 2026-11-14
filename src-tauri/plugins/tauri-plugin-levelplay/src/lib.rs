// Tauri plugin for Unity LevelPlay (ironSource) ads on Android & iOS.
//
// Design:
//   • Desktop builds get an inert stub (no LevelPlay SDK exists for
//     desktop). The JS-side `LevelPlayProvider.isReady` stays false.
//   • Mobile builds register a native plugin implementation:
//         Android → com.plugin.levelplay.LevelPlayPlugin (Kotlin)
//         iOS     → init_plugin_levelplay (Swift)
//     Both set the privacy flags (COPPA, the AdMob child tags) BEFORE
//     `LevelPlay.init(...)` so they propagate into every adapter that joins
//     the bidding / waterfall; Android also runs Google UMP's consent form
//     first where GDPR needs it. See `models::InitRequest`.
//
// Commands (JS invoke names use `snake_case`, native methods use
// `camelCase` to match Kotlin `@Command` + Swift `@objc` conventions):
//   • plugin:levelplay|init                → init the SDK
//   • plugin:levelplay|show_rewarded       → show a rewarded video
//   • plugin:levelplay|show_interstitial   → show an interstitial
//   • plugin:levelplay|show_privacy_options → re-open the consent form
//   • plugin:levelplay|launch_test_suite   → open LevelPlay's debug overlay

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod commands;
mod error;
mod models;

#[cfg(mobile)]
mod mobile;
#[cfg(desktop)]
mod desktop;

pub use error::{Error, Result};

#[cfg(mobile)]
use mobile::Levelplay;
#[cfg(desktop)]
use desktop::Levelplay;

pub trait LevelplayExt<R: Runtime> {
    fn levelplay(&self) -> &Levelplay<R>;
}

impl<R: Runtime, T: Manager<R>> crate::LevelplayExt<R> for T {
    fn levelplay(&self) -> &Levelplay<R> {
        self.state::<Levelplay<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("levelplay")
        .invoke_handler(tauri::generate_handler![
            commands::init,
            commands::show_rewarded,
            commands::show_interstitial,
            commands::show_privacy_options,
            commands::launch_test_suite,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let levelplay = mobile::init(app, api)?;
            #[cfg(desktop)]
            let levelplay = desktop::init(app, api)?;
            app.manage(levelplay);
            Ok(())
        })
        .build()
}
