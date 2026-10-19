from pathlib import Path
p=Path('frontend/src-tauri/src/workbench/ipc_windows.rs');s=p.read_text()
s=s.replace('    thread::JoinHandle,','    thread::JoinHandle,\n    time::{Duration, Instant},').replace('const IO_TIMEOUT_MS: u32 = 10_000;','// The pipe default is not an activity timer; every actual phase freezes below.\nconst IO_TIMEOUT_MS: u32 = 120_000;\nconst IO_PHASE: Duration = Duration::from_secs(120);')
a=s.index('fn finish_io(');b=s.index('fn read_chunk(',a)
s=s[:a]+'''fn phase_remaining(deadline: Instant, stop: &AtomicBool) -> io::Result<Duration> {
    if stop.load(Ordering::Acquire) {
        return Err(io::Error::new(io::ErrorKind::Interrupted, "owned pipe stopped"));
    }
    deadline.checked_duration_since(Instant::now())
        .filter(|remaining| !remaining.is_zero())
        .ok_or_else(|| io::Error::new(io::ErrorKind::TimedOut, "pipe phase deadline exhausted"))
}
fn completed_count(pipe: HANDLE, overlapped: &mut OVERLAPPED) -> io::Result<u32> {
    let mut count = 0;
    if unsafe { GetOverlappedResult(pipe, overlapped, &mut count, 0) } == 0 {
        Err(io::Error::last_os_error())
    } else { Ok(count) }
}
fn finish_io(pipe: HANDLE, overlapped: &mut OVERLAPPED, deadline: Instant, stop: &AtomicBool) -> io::Result<u32> {
    loop {
        let remaining = phase_remaining(deadline, stop);
        let failure = match remaining {
            Err(error) => Some(error),
            Ok(remaining) => {
                match unsafe { WaitForSingleObject(overlapped.hEvent, remaining.as_millis().clamp(1, 100) as u32) } {
                    WAIT_OBJECT_0 => return completed_count(pipe, overlapped),
                    WAIT_TIMEOUT => None,
                    _ => Some(io::Error::last_os_error()),
                }
            }
        };
        if let Some(error) = failure {
            // Cancellation is requested promptly, but an unconfirmed kernel
            // drain is never success. Keep the stack OVERLAPPED and buffer alive
            // until the original OS operation has really completed.
            unsafe {
                CancelIoEx(pipe, overlapped);
                WaitForSingleObject(overlapped.hEvent, u32::MAX);
            }
            return Err(error);
        }
    }
}
'''+s[b:]
s=s.replace('fn read_chunk(pipe: HANDLE, buffer: &mut [u8]) -> io::Result<usize> {','fn read_chunk(pipe: HANDLE, buffer: &mut [u8], deadline: Instant, stop: &AtomicBool) -> io::Result<usize> {\n    phase_remaining(deadline, stop)?;')
s=s.replace('finish_io(pipe, &mut overlapped, IO_TIMEOUT_MS)', 'finish_io(pipe, &mut overlapped, deadline, stop)')
s=s.replace('fn write_all(pipe: HANDLE, mut bytes: &[u8]) -> io::Result<()> {\n    while !bytes.is_empty() {','fn write_all(pipe: HANDLE, mut bytes: &[u8], deadline: Instant, stop: &AtomicBool) -> io::Result<()> {\n    while !bytes.is_empty() {\n        phase_remaining(deadline, stop)?;')
s=s.replace('WAIT_OBJECT_0 => return finish_io(pipe, &mut overlapped, 0).map(|_| true),','WAIT_OBJECT_0 => return completed_count(pipe, &mut overlapped).map(|_| true),')
s=s.replace('    commands: &CommandMode,\n) -> io::Result<()> {','    commands: &CommandMode,\n    read_deadline: Instant,\n    stop: &AtomicBool,\n) -> io::Result<Instant> {')
s=s.replace('write_all(pipe, b"{\\"ok\\":false,\\"code\\":\\"UNAUTHORIZED_PEER\\"}\\n")?;\n        return Ok(());','let write_deadline = Instant::now() + IO_PHASE;\n        write_all(pipe, b"{\\"ok\\":false,\\"code\\":\\"UNAUTHORIZED_PEER\\"}\\n", write_deadline, stop)?;\n        return Ok(write_deadline);')
s=s.replace('let count = read_chunk(pipe, &mut chunk)?;','let count = read_chunk(pipe, &mut chunk, read_deadline, stop)?;')
s=s.replace('    let reply = if body.len()', '    phase_remaining(read_deadline, stop)?;\n    let reply = if body.len()')
s=s.replace('    let mut bytes = serde_json::to_vec(&reply)?;\n    bytes.push(b\'\\n\');\n    write_all(pipe, &bytes)','    let write_deadline = Instant::now() + IO_PHASE;\n    let mut bytes = serde_json::to_vec(&reply)?;\n    bytes.push(b\'\\n\');\n    write_all(pipe, &bytes, write_deadline, stop)?;\n    Ok(write_deadline)')
s=s.replace('if serve(raw, expected_pid, &base, &commands).is_ok() {','let read_deadline = Instant::now() + IO_PHASE;\n                            if let Ok(reply_deadline) = serve(raw, expected_pid, &base, &commands, read_deadline, &stop_thread) {')
s=s.replace('let _ = read_chunk(raw, &mut trailing);','let _ = read_chunk(raw, &mut trailing, reply_deadline, &stop_thread);')
s=s.replace('// sidecar request has a 10 s I/O deadline before the thread exits.','// framing/reply waiting checks stop every 100 ms; original OS I/O\n        // must really drain before freeing its OVERLAPPED or buffer.')
p.write_text(s)
