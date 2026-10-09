# Third-Party Licenses

싹싹김치 비디오 압축기는 아래 오픈소스를 사용합니다.

| 구성 요소 | 라이선스 | 비고 |
|---|---|---|
| [FFmpeg](https://ffmpeg.org) (ffmpeg.exe, ffprobe.exe) | LGPL-2.1-or-later | BtbN `win64-lgpl` 빌드 (`resources/bin/LICENSE.txt` 동봉) |
| [Electron](https://www.electronjs.org) | MIT | © OpenJS Foundation |

## FFmpeg LGPL 준수 사항

- 본 앱에 번들된 ffmpeg/ffprobe는 **LGPL 빌드**입니다 (GPL 아님).
- ffmpeg 소스 코드: https://github.com/FFmpeg/FFmpeg
- 빌드 스크립트·구성: https://github.com/BtbN/FFmpeg-Builds
- LGPL 요건 상 사용자가 ffmpeg 바이너리를 자체 빌드로 교체할 수 있어야 하며,
  본 앱의 `resources/bin/ffmpeg.exe`를 같은 이름의 다른 빌드로 교체하면 됩니다.
- 인코더는 libx264(GPL) 대신 하드웨어 인코더(NVENC/QSV/AMF/MediaFoundation)와
  libopenh264(BSD-2-Clause)를 사용합니다.

## OpenH264

libopenh264 는 Cisco 가 제공하는 H.264 코덱 구현체로, 바이너리에 대한
특허 로열티는 Cisco 가 부담합니다 (BSD-2-Clause).
