const { spawn } = require('node:child_process');

function runFfprobe(ffprobeBin, filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      // Restrict to local file/pipe protocols so a crafted path can't be
      // interpreted as a network/concat/subfile protocol URL.
      '-protocol_whitelist', 'file,pipe',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '--',
      filePath,
    ];
    const proc = spawn(ffprobeBin, args, { windowsHide: true });
    let out = '';
    let err = '';
    let settled = false;
    const settle = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(val);
    };
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      settle(reject, new Error('ffprobe timed out'));
    }, 15000);
    proc.stdout.on('data', (c) => (out += c.toString('utf8')));
    proc.stderr.on('data', (c) => (err += c.toString('utf8')));
    proc.on('error', (e) => settle(reject, e));
    proc.on('close', (code) => {
      if (code !== 0) {
        settle(reject, new Error(err.trim() || `ffprobe exited with code ${code}`));
        return;
      }
      try {
        settle(resolve, JSON.parse(out));
      } catch (e) {
        settle(reject, new Error(`Failed to parse ffprobe JSON: ${e.message}`));
      }
    });
  });
}

module.exports = { runFfprobe };
