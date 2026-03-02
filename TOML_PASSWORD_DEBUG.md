# Quick Fix Needed!

## Problem
Password escaping issue in TOML config generation.

Current password in your config seems to have special characters (`\@`) that break TOML parsing.

## Quick Test

Can you temporarily set a simple password on the camera (without special chars)?

Example: `testpass123`

Then reconfigure adapter:
```bash
iobroker stop reolink.0
iobroker set reolink.0 --cameraPassword 'testpass123'
iobroker start reolink.0
```

This will help us verify if the TOML escaping works for normal passwords.

## Alternative

Tell me the EXACT camera password (via private channel if sensitive), so I can test the escaping logic locally before deploying.
