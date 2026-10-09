const { spawn } = require('node:child_process');

// ---------- helpers ----------

function targetBitrateKbps({ targetBytes, durationSec, audioKbps = 96 }) {
  if (!durationSec || durationSec <= 0) {
    throw new Error('비트레이트 계산을 위한 영상 길이가 없습니다');
  }
  const totalKbps = (targetBytes * 8) / durationSec / 1000;
  return Math.max(200, Math.floor(totalKbps - audioKbps));
}

function scaleFilter(maxWidth) {
  return `scale='min(${maxWidth},iw)':'-2':flags=lanczos`;
}

const COMMON_OUT = (output) => ['-movflags', '+faststart', '-y', output];

// ---------- encoder detection ----------
// LGPL ffmpeg 빌드에는 libx264(GPL)가 없다. 사용 가능한 첫 인코더를 고른다.

const ENCODER_PRIORITY = [
  'h264_nvenc',      // NVIDIA
  'h264_qsv',        // Intel Quick Sync
  'h264_amf',        // AMD
  'h264_mf',         // Windows MediaFoundation (항상 있음)
  'libopenh264',     // Cisco SW (LGPL 빌드 기본 탑재)
  'libx264',         // GPL 빌드일 때만 존재
];

let _encoderCache = null;

// 컴파일된 목록만으로는 부족 — GPU/드라이버가 없으면 nvenc 등은 실행 시 죽는다.
// 실제로 0.1초짜리 null 인코드를 돌려보고 되는 것만 남긴다.
function tryEncoder(ffmpegBin, enc) {
  return new Promise((resolve) => {
    const args = ['-hide_banner', '-f', 'lavfi', '-i', 'testsrc=duration=0.1:size=128x128:rate=1',
      '-c:v', enc, '-f', 'null', '-'];
    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    const done = (ok) => { try { proc.kill(); } catch {} resolve(ok); };
    const timer = setTimeout(() => done(false), 8000);
    proc.on('error', () => { clearTimeout(timer); done(false); });
    proc.on('close', (code) => { clearTimeout(timer); done(code === 0); });
  });
}

async function detectEncoders(ffmpegBin) {
  if (_encoderCache) return _encoderCache;
  const list = await new Promise((resolve) => {
    const proc = spawn(ffmpegBin, ['-hide_banner', '-encoders'], { windowsHide: true });
    let out = '';
    proc.stdout.on('data', (c) => (out += c.toString()));
    proc.stderr.on('data', () => {});
    const finish = () => resolve(ENCODER_PRIORITY.filter((e) => new RegExp(`\\b${e}\\b`).test(out)));
    proc.on('error', finish);
    proc.on('close', finish);
  });
  const working = [];
  for (const enc of list.length ? list : ['libopenh264']) {
    if (await tryEncoder(ffmpegBin, enc)) working.push(enc);
    if (working.length >= 2) break; // 최상위 2개면 충분
  }
  if (!working.length) working.push('libopenh264'); // 최후 폴백
  _encoderCache = working;
  return working;
}

// 품질 모드 인자 (CRF 계열 프리셋용) — 인코더별 문법이 다르다.
function encQualityArgs(enc, crf) {
  switch (enc) {
    case 'libx264':      return ['-preset', 'medium', '-crf', String(crf)];
    case 'h264_nvenc':   return ['-preset', 'p5', '-rc', 'vbr', '-cq', String(crf)];
    case 'h264_qsv':     return ['-global_quality', String(crf)];
    case 'h264_amf':     return ['-quality', 'balanced', '-rc', 'qvbr', '-qvbr_quality_level', String(crf)];
    case 'h264_mf':      return ['-quality', '70']; // MF는 비트레이트 중심 — 보정값
    default:             return ['-q:v', String(crf)]; // libopenh264 등 — 지원 안 하면 무시됨
  }
}

// 비트레이트 모드 인자 — 모든 인코더가 -b:v 를 받는다.
function encRateArgs(enc, kbps) {
  const base = ['-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`];
  if (enc === 'libopenh264') return [...base, '-profile:v', 'high'];
  return base;
}

// ---------- presets ----------

const PRESET_MAP = {
  'kakao-300mb': {
    label: '카카오톡 300MB',
    description: 'PC 첨부 한도에 정확히 맞춤',
    ext: '.mp4',
    needs: { duration: true },
    buildArgs: ({ input, output, duration, enc }) => {
      const videoKbps = targetBitrateKbps({ targetBytes: 300 * 1024 * 1024 * 0.97, durationSec: duration, audioKbps: 128 });
      return [
        '-i', input,
        '-c:v', enc, ...encRateArgs(enc, videoKbps),
        '-vf', scaleFilter(1920),
        '-c:a', 'aac', '-b:a', '128k',
        ...COMMON_OUT(output),
      ];
    },
  },

  'discord-25mb': {
    label: '디스코드 25MB',
    description: 'Nitro Basic 한도에 정확히 맞춤',
    ext: '.mp4',
    needs: { duration: true },
    buildArgs: ({ input, output, duration, enc }) => {
      const videoKbps = targetBitrateKbps({ targetBytes: 25 * 1024 * 1024 * 0.97, durationSec: duration });
      return [
        '-i', input,
        '-c:v', enc, ...encRateArgs(enc, videoKbps),
        '-vf', scaleFilter(1920),
        '-c:a', 'aac', '-b:a', '96k',
        ...COMMON_OUT(output),
      ];
    },
  },

  'discord-10mb': {
    label: '디스코드 10MB (무료)',
    description: '정확한 10MB 목표',
    ext: '.mp4',
    needs: { duration: true },
    buildArgs: ({ input, output, duration, enc }) => {
      const videoKbps = targetBitrateKbps({ targetBytes: 10 * 1024 * 1024 * 0.97, durationSec: duration });
      return [
        '-i', input,
        '-c:v', enc, ...encRateArgs(enc, videoKbps),
        '-vf', scaleFilter(1280),
        '-c:a', 'aac', '-b:a', '96k',
        ...COMMON_OUT(output),
      ];
    },
  },

  'youtube-1080p': {
    label: '유튜브 1080p',
    description: '1080p 다운스케일, 품질 우선',
    ext: '.mp4',
    needs: {},
    buildArgs: ({ input, output, enc }) => [
      '-i', input,
      '-c:v', enc, ...encQualityArgs(enc, 23),
      '-vf', scaleFilter(1920),
      '-c:a', 'aac', '-b:a', '192k',
      ...COMMON_OUT(output),
    ],
  },

  'web-720p': {
    label: '웹 미리보기 720p',
    description: '720p 다운스케일, 작은 사이즈',
    ext: '.mp4',
    needs: {},
    buildArgs: ({ input, output, enc }) => [
      '-i', input,
      '-c:v', enc, ...encQualityArgs(enc, 28),
      '-vf', scaleFilter(1280),
      '-c:a', 'aac', '-b:a', '128k',
      ...COMMON_OUT(output),
    ],
  },

  'bitrate-half': {
    label: '비트레이트 절반',
    description: '해상도/FPS 유지, 용량만 절반',
    ext: '.mp4',
    needs: { inputBitrate: true },
    buildArgs: ({ input, output, inputBitrate, enc }) => {
      if (!inputBitrate || inputBitrate <= 0) {
        throw new Error('원본 영상의 비트레이트 정보가 없습니다 (ffprobe 결과 누락)');
      }
      const targetKbps = Math.max(200, Math.floor(inputBitrate / 1000 * 0.5 - 96));
      return [
        '-i', input,
        '-c:v', enc, ...encRateArgs(enc, targetKbps),
        '-c:a', 'aac', '-b:a', '96k',
        ...COMMON_OUT(output),
      ];
    },
  },

  'audio-mp3': {
    label: '오디오만 추출 (MP3)',
    description: '비디오 제거, MP3 192k',
    ext: '.mp3',
    needs: {},
    buildArgs: ({ input, output }) => [
      '-i', input,
      '-vn', '-c:a', 'libmp3lame', '-b:a', '192k',
      '-y', output,
    ],
  },
};

function listPresets() {
  return Object.entries(PRESET_MAP).map(([key, p]) => ({
    key,
    label: p.label,
    description: p.description,
    ext: p.ext,
    needsDuration: !!p.needs.duration,
    needsInputBitrate: !!p.needs.inputBitrate,
  }));
}

// ---------- job ----------

class TranscodeJob {
  constructor({ ffmpegBin, input, output, presetKey, duration, inputBitrate, encoder, encoders, onProgress }) {
    const preset = PRESET_MAP[presetKey];
    if (!preset) throw new Error(`Unknown preset: ${presetKey}`);

    this.ffmpegBin = ffmpegBin;
    this.preset = preset;
    this.presetKey = presetKey;
    this.input = input;
    this.output = output;
    this._duration = duration;
    this._inputBitrate = inputBitrate;
    // encoders: 시도할 인코더 후보 배열 (실패 시 다음으로 재시도). encoder 단독 인자도 허용.
    this.encoders = Array.isArray(encoders) && encoders.length ? encoders : [encoder || 'libopenh264'];
    this.duration = duration;
    this.onProgress = onProgress;
    this.proc = null;
    this.cancelled = false;
    this.stderrTail = [];
    this.usedEncoder = null;
  }

  _runOnce(enc) {
    const args = ['-hide_banner', '-protocol_whitelist', 'file,pipe',
      ...this.preset.buildArgs({ input: this.input, output: this.output, duration: this.duration, inputBitrate: this._inputBitrate, enc })];
    this.stderrTail = [];
    return new Promise((resolve, reject) => {
      const started = Date.now();
      this.proc = spawn(this.ffmpegBin, args, { windowsHide: true });

      this.proc.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue;
          this.stderrTail.push(line);
          if (this.stderrTail.length > 30) this.stderrTail.shift();
        }
        const tm = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (tm) {
          const seconds = +tm[1] * 3600 + +tm[2] * 60 + parseFloat(tm[3]);
          const ratio = this.duration > 0 ? Math.min(1, seconds / this.duration) : 0;
          this.onProgress?.({ seconds, ratio });
        }
      });

      this.proc.on('error', (e) => {
        this.proc = null;
        reject(Object.assign(e, { earlyDeath: true }));
      });

      this.proc.on('close', (code) => {
        const wasCancelled = this.cancelled;
        this.proc = null;
        if (wasCancelled) {
          reject(new Error('사용자에 의해 취소됨'));
        } else if (code === 0) {
          this.usedEncoder = enc;
          resolve();
        } else {
          // 시작 3초 내 사망 = 인코더 미동작 가능성 → 다음 후보로 넘어갈 수 있게 표시
          const tail = this.stderrTail.slice(-8).join('\n');
          const err = new Error(`ffmpeg exited ${code}\n${tail}`);
          err.earlyDeath = Date.now() - started < 3000;
          reject(err);
        }
      });
    });
  }

  async run() {
    let lastErr = null;
    for (const enc of this.encoders) {
      if (this.cancelled) break;
      try {
        await this._runOnce(enc);
        return;
      } catch (e) {
        lastErr = e;
        if (this.cancelled || !e.earlyDeath) break;
      }
    }
    throw lastErr || new Error('사용자에 의해 취소됨');
  }

  cancel() {
    this.cancelled = true;
    if (this.proc) {
      try { this.proc.kill('SIGTERM'); } catch { /* already dead */ }
      setTimeout(() => {
        if (this.proc) {
          try { this.proc.kill('SIGKILL'); } catch { /* already dead */ }
        }
      }, 2000);
    }
  }
}

module.exports = { TranscodeJob, listPresets, detectEncoders };
