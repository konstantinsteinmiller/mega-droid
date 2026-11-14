## Default Permission

Default permissions for the LevelPlay plugin — exposes init plus rewarded and interstitial ad commands, the consent (privacy options) form, the LevelPlay Test Suite launcher, and the framework-provided event-listener commands needed for `addPluginListener` to subscribe to rewarded-state / interstitial-state.

#### This default permission set includes the following:

- `allow-init`
- `allow-show-rewarded`
- `allow-show-interstitial`
- `allow-show-privacy-options`
- `allow-launch-test-suite`
- `allow-registerListener`
- `allow-removeListener`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`levelplay:allow-init`

</td>
<td>

Enables the init command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`levelplay:deny-init`

</td>
<td>

Denies the init command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`levelplay:allow-launch-test-suite`

</td>
<td>

Enables the launch_test_suite command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`levelplay:deny-launch-test-suite`

</td>
<td>

Denies the launch_test_suite command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`levelplay:allow-show-interstitial`

</td>
<td>

Enables the show_interstitial command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`levelplay:deny-show-interstitial`

</td>
<td>

Denies the show_interstitial command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`levelplay:allow-show-privacy-options`

</td>
<td>

Enables the show_privacy_options command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`levelplay:deny-show-privacy-options`

</td>
<td>

Denies the show_privacy_options command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`levelplay:allow-show-rewarded`

</td>
<td>

Enables the show_rewarded command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`levelplay:deny-show-rewarded`

</td>
<td>

Denies the show_rewarded command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`levelplay:allow-registerListener`

</td>
<td>

Allows the webview to register event listeners for plugin-emitted events (rewarded-state, interstitial-state).

</td>
</tr>

<tr>
<td>

`levelplay:deny-registerListener`

</td>
<td>

Denies the webview from registering event listeners.

</td>
</tr>

<tr>
<td>

`levelplay:allow-removeListener`

</td>
<td>

Allows the webview to remove previously-registered event listeners.

</td>
</tr>

<tr>
<td>

`levelplay:deny-removeListener`

</td>
<td>

Denies the webview from removing event listeners.

</td>
</tr>
</table>
