# 싹싹김치 비디오 압축기

동영상을 **카카오톡·디스코드 첨부 한도에 딱 맞게** 줄여주는 무료 데스크톱 앱.
파일이 컴퓨터 밖으로 나가지 않습니다 — ffmpeg으로 로컬에서 변환합니다.

## 프리셋

| 프리셋 | 용도 |
|---|---|
| 카카오톡 300MB | PC 첨부 한도에 정확히 |
| 디스코드 25MB | Nitro Basic 한도 |
| 디스코드 10MB | 무료 계정 한도 |
| 유튜브 1080p | 품질 우선 업로드용 |
| 웹 미리보기 720p | 작은 공유용 |
| 비트레이트 절반 | 해상도 유지, 용량만 |
| 오디오만 추출 | MP3 192k |

- 여러 파일을 한꺼번에 넣으면 **순서대로 배치 변환**
- 진행률 표시 · 개별 취소 · 완료 후 폴더에서 열기
- 출력 파일은 원본 옆에 `*_압축.mp4` 로 저장 (원본 덮어쓰기 없음)

## 인코더

LGPL 빌드라 libx264(GPL)는 없고, 아래 순서로 자동 선택합니다:

`h264_nvenc`(NVIDIA) → `h264_qsv`(Intel) → `h264_amf`(AMD) → `h264_mf`(Windows 내장) → `libopenh264`(SW)

즉 **하드웨어 가속이 있으면 자동으로 쓰고**, 없으면 소프트웨어 인코더로 돌아갑니다.

## 개발 / 빌드

```powershell
npm install
npm start        # 개발 실행
npm run build    # release/SsakSsak-Compressor-Setup.exe 생성
```

`resources/bin/` 에 ffmpeg.exe + ffprobe.exe (LGPL 빌드)가 필요합니다.
BtbN `ffmpeg-master-latest-win64-lgpl.zip`에서 bin 폴더를 복사하세요.

## 라이선스

- 소스 코드: MIT — [LICENSE](LICENSE)
- 번들 서드파티: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)
