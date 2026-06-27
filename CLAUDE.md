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
