# Personal POS Scanner FE

React Native/Expo implementation converted from the Stitch HTML UI/UX screens.

## Run

```bash
pnpm install
pnpm start -- --host lan
```

This first pass is UI-first and Expo Go friendly. The scanner surface is a realistic mock so you can tune layout quickly without rebuilding iOS every time.

For browser preview while editing UI:

```bash
pnpm web -- --host localhost --port 8081
```

## Camera Path

For production barcode scanning, replace the mock camera surface in `src/App.js` with `react-native-vision-camera` inside an Expo development build. UI-only changes can still use Fast Refresh; native camera/package changes require rebuilding the iOS dev build.
