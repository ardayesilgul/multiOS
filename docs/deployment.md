# multiOS Deployment & Windows Package Verification

Checklist and instructions for packaging multiOS native binaries for Windows distributions.

## Build Requirements

- **Node.js:** v22.x LTS or higher
- **Build Tools:** Visual Studio 2022 C++ Build Tools (MSVC v143 or newer)
- **Windows SDK:** 10.0.19041.0 or higher for Win32 API bindings

## Distribution Verification

Before publishing any native zip or installer package:
1. Run `npm run test` to verify API integrity and token validation logic.
2. Run `node tests/native.js` to ensure the native Win32 window loop, hit testing, and tray integration pass cleanly.
3. Validate digital signatures / hash integrity of the final distribution artifact:
   ```powershell
   Get-FileHash -Algorithm SHA256 .\dist\multiOS-Setup.exe
   ```
