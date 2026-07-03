# Installing as a Teams Background (Windows)

The Uploads folder used for custom backgrounds only accepts static images, not videos. To use `teams_background.mp4` as an animated background, it must replace one of the default animated background files that ship with Teams. This is an unsupported workaround and may stop working after a Teams update.

## New Teams client

1. Open File Explorer and navigate to the default animated backgrounds folder:
   ```
   %LOCALAPPDATA%\Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams\Backgrounds
   ```
2. Find an existing animated background file, for example `feelingDreamy2Animated_v=0.1.mp4`.
3. Rename its extension from `.mp4` to `.old` to keep a backup (for example `feelingDreamy2Animated_v=0.1.old`).
4. Copy `teams_background.mp4` into this folder.
5. Rename the copied file to exactly match the original file name, including the `.mp4` extension (for example `feelingDreamy2Animated_v=0.1.mp4`).
6. Restart Teams if it was running during the copy.
7. In a meeting, open **Video effects and backgrounds** and select the animated background that corresponds to the replaced file. The thumbnail preview will still show the original image, but the live preview and meeting video will use `teams_background.mp4`.

## Classic Teams client

1. Open File Explorer and navigate to the default animated backgrounds folder:
   ```
   %APPDATA%\Microsoft\Teams\Backgrounds
   ```
2. Follow the same replace steps as above (rename the original animated `.mp4` to `.old`, copy in `teams_background.mp4`, then rename it to match the original file name).
3. Restart Teams if it was running during the copy.
4. In a meeting, open **Video effects and backgrounds** and select the animated background that corresponds to the replaced file.

## Notes

- This technique relies on Teams shipping built-in animated backgrounds with file names beginning with `feelingDreamy`; if none are present, this workaround is unavailable.
- Video backgrounds may not appear on lower-powered devices; Teams can disable this feature based on hardware capability.
- A Teams update may restore the original default animated background files, requiring you to repeat these steps.
