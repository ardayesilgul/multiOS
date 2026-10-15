<img align="left" src="assets/multios.png" alt="multiOS" width="56">

<h1 align="center">multiOS</h1>

<p align="center"><a href="README.md">Türkçe</a> · <strong>English</strong></p>

I built multiOS to share photos, files and clipboard content between my iPhone
and Windows PC. Both devices connect over the same local network, with no cloud
account needed. Closing the window keeps the app in the system tray, ready to
receive files.

## Screenshots

### Windows

<p align="center">
<a href="assets/screenshots/windows-light.png">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/windows-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/screenshots/windows-light.png">
    <img alt="Windows · Received files" src="assets/screenshots/windows-light.png" width="600">
  </picture>
</a>
</p>

### Phone

<table>
  <tr>
    <th width="50%">Files</th>
    <th width="50%">Clipboard</th>
  </tr>
  <tr>
    <td valign="top"><a href="assets/screenshots/phone-files-light.png">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/phone-files-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/screenshots/phone-files-light.png">
    <img alt="Phone · Send and download files" src="assets/screenshots/phone-files-light.png" width="100%">
  </picture>
</a></td>
    <td valign="top"><a href="assets/screenshots/phone-clipboard-light.png">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/phone-clipboard-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/screenshots/phone-clipboard-light.png">
    <img alt="Phone · Clipboard sharing" src="assets/screenshots/phone-clipboard-light.png" width="100%">
  </picture>
</a></td>
  </tr>
  <tr>
    <td>Send photos and download prepared files.</td>
    <td>Share text and images in both directions.</td>
  </tr>
</table>

## Requirements

- Windows 10 or 11, 64-bit, with .NET Framework 4.8.
- Node.js 22 or later and npm for development; the packaged app bundles Node.js.
- iPhone and PC on the same trusted local network. Allow the app through Windows
  Firewall on private networks. Guest Wi-Fi may block communication between devices.
- HEIC previews depend on installed Windows codecs; receiving originals does not.

## Run from source

Clone the repository, open PowerShell in its folder, and run:

```powershell
npm ci
npm run build:native
npm start
```

The build compiles the desktop app, clipboard helper and thumbnail helper using
Windows' .NET Framework compiler; Visual Studio is not required.
`npm run tray` starts the native app and service. `npm run start:silent` starts
only the service. Closing the window hides it while receiving continues. Use
**Exit** from the tray to stop both. Windows startup is opt-in in Settings.

## Connect an iPhone

1. Open the **iPhone** page in multiOS and scan its QR code.
2. Open the page in Safari to send files or download staged PC files.
3. For the iOS Share Sheet, expand **Paylaş menüsü kurulumu**. First copy the
   personal upload address, then add the linked **PC'ye Gönder** shortcut. Paste
   that address into its setup question and finish adding it. This is a one-time step.

You only need to pair once; the connection survives restarts and updates.
You can also save the phone page to your Home Screen.

Try `multios.local` first. If it doesn't resolve on your network, use the IP
address instead. If the PC's IP changes, update the address in the shortcut.

## Standalone build

```powershell
npm ci
npm run build:dist
```

The package is saved to `dist/multiOS.exe`. Building it requires internet access.
Opening the EXE installs the app under `%LOCALAPPDATA%/multiOS/app` and adds
Desktop and Start Menu shortcuts.

To update an existing installation, use `scripts/update-local.ps1`. It makes a
backup, installs the new package and preserves pairing. It won't update while
a transfer is running.

## Data and security

- Incoming files default to `Downloads/multiOS`. Settings can select any writable
  folder, including one on the Desktop. Existing files stay where they are.
- Pairing state, history, clipboard cache and outgoing staged copies live under
  `%APPDATA%/multiOS`. Treat this folder and personal pairing URLs as private.
- Clearing received history preserves originals. Clearing outgoing files deletes
  staged copies, not sources. Clearing the app clipboard preserves the Windows clipboard.
- Phone requests require the pairing key. Native desktop control is restricted to
  loopback with a local Host header. Foreign browser origins are rejected.
- Transfers use local HTTP, not encrypted HTTPS. Use a trusted private network;
  do not expose this service through port forwarding or as a public server.
- The clipboard helper observes Windows clipboard content while running. Its
  current content is available to paired devices. Exit from the tray to stop it.
  Phone clipboard images are limited to one image of at most 50 MB per request.

## Verification

```powershell
npm run build:native
npm test
npx playwright install chromium
npm run test:ui
```

API tests check transfers, pairing, receive folders and history. Phone UI tests
cover sending, downloading, clipboard controls and light/dark themes. Tests use
temporary data without touching your personal files or Windows clipboard.

To use installed Edge instead of downloading Chromium:

```powershell
$env:MULTIOS_BROWSER_CHANNEL = 'msedge'
npm run test:ui
```

<details>
<summary>Desktop UI test</summary>

`--capture <absolute-png-path> --verify` checks closing to the tray, receiving
with the window hidden, navigation, staging and clipboard display. It exits
through the tray when finished.

Use isolated `MULTIOS_PORT`, `MULTIOS_DATA_DIR`, `MULTIOS_DROP_DIR` and
`MULTIOS_STAGED_DIR`, with `MULTIOS_DISABLE_CLIPBOARD=1` and
`MULTIOS_DISABLE_MDNS=1`.

</details>

## Project layout

- `src/native/`: WPF app, helpers and package launcher.
- `src/`: HTTP service, pairing, storage and transfer state.
- `public/`: iPhone page and styles.
- `scripts/`: build and local installation tools.
- `tests/`: isolated API and phone UI checks.

## License

MIT; see [LICENSE](LICENSE). Apple navigation icon attribution is in
[assets/NOTICE.md](assets/NOTICE.md). Dependencies retain their licenses in the
packaged `node_modules`; the bundled Node.js license is in `runtime/LICENSE`.
