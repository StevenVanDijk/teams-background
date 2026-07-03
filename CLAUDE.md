# teams-background

Generates an animated Teams background (`teams_background.mp4`) from hexagon data.

## Setup

Before running the script, install the required system and Python dependencies:

```bash
apt --fix-broken install -y
apt-get install -y ffmpeg
pip install numpy opencv-python-headless
```

## Usage

```bash
python3 hexagons_video.py
```

Output: `teams_background.mp4` (1280×720, 30 fps, 12-second seamless loop).

## Installing as a Teams Background (Windows)

Custom video backgrounds are only supported by the Microsoft Teams desktop client, not the web or mobile apps. Copy `teams_background.mp4` into the Uploads folder for your Teams client, then select it during a meeting.

### New Teams client

1. Open File Explorer and navigate to:
   ```
   %LOCALAPPDATA%\Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams\Backgrounds\Uploads
   ```
2. Copy `teams_background.mp4` into this folder. Create the `Uploads` folder if it does not exist.
3. Restart Teams if it was running during the copy.
4. In a meeting, open **Video effects and backgrounds** (or select the ellipsis (`...`) menu, then **Video effects**) and choose the uploaded background from the list.

### Classic Teams client

1. Open File Explorer and navigate to:
   ```
   %APPDATA%\Microsoft\Teams\Backgrounds\Uploads
   ```
2. Copy `teams_background.mp4` into this folder. Create the `Uploads` folder if it does not exist.
3. Restart Teams if it was running during the copy.
4. In a meeting, open **Video effects and backgrounds** and choose the uploaded background from the list.

### Notes

- Video backgrounds may not appear on lower-powered devices; Teams can disable this feature based on hardware capability.
- Re-copying an updated `teams_background.mp4` with the same file name may require a Teams restart before the change appears in the picker.
