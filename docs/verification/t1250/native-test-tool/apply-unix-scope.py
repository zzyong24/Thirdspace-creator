from pathlib import Path
base=Path('frontend/src-tauri/src/workbench')
helper='''// Positive framing and reply phases each freeze their deadline once. Polling
// only wakes owned cancellation; partial bytes never extend either phase.
const IO_PHASE: Duration = Duration::from_secs(120);

fn io_remaining(deadline: Instant, stop: &AtomicBool) -> io::Result<Duration> {
    if stop.load(Ordering::Acquire) {
        return Err(io::Error::new(io::ErrorKind::Interrupted, "owned IPC stopped"));
    }
    deadline.checked_duration_since(Instant::now())
        .filter(|remaining| !remaining.is_zero())
        .ok_or_else(|| io::Error::new(io::ErrorKind::TimedOut, "IPC phase deadline exhausted"))
}

fn wait_ready(stream: &UnixStream, events: i16, deadline: Instant, stop: &AtomicBool) -> io::Result<()> {
    loop {
        let remaining = io_remaining(deadline, stop)?;
        let milliseconds = remaining.as_millis().clamp(1, 100) as i32;
        let mut descriptor = libc::pollfd { fd: stream.as_raw_fd(), events, revents: 0 };
        let result = unsafe { libc::poll(&mut descriptor, 1, milliseconds) };
        if result > 0 {
            io_remaining(deadline, stop)?;
            if descriptor.revents & libc::POLLNVAL != 0 {
                return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid owned socket"));
            }
            return Ok(());
        }
        if result < 0 {
            let error = io::Error::last_os_error();
            if error.kind() != io::ErrorKind::Interrupted { return Err(error); }
        }
    }
}

fn read_frame(stream: &mut UnixStream, maximum: usize, deadline: Instant, stop: &AtomicBool) -> io::Result<Vec<u8>> {
    let mut body = Vec::new();
    let mut chunk = [0u8; 8192];
    while body.len() <= maximum {
        wait_ready(stream, libc::POLLIN, deadline, stop)?;
        let length = chunk.len().min(maximum + 1 - body.len());
        match stream.read(&mut chunk[..length]) {
            Ok(0) => break,
            Ok(count) => {
                let end = chunk[..count].iter().position(|byte| *byte == b'\\n').map(|index| index + 1);
                body.extend_from_slice(&chunk[..end.unwrap_or(count)]);
                if end.is_some() { break; }
            }
            Err(error) if matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) => {}
            Err(error) => return Err(error),
        }
    }
    io_remaining(deadline, stop)?;
    Ok(body)
}

fn write_frame(stream: &mut UnixStream, mut bytes: &[u8], deadline: Instant, stop: &AtomicBool) -> io::Result<()> {
    while !bytes.is_empty() {
        wait_ready(stream, libc::POLLOUT, deadline, stop)?;
        match stream.write(bytes) {
            Ok(0) => return Err(io::Error::new(io::ErrorKind::WriteZero, "empty owned socket write")),
            Ok(count) => bytes = &bytes[count..],
            Err(error) if matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) => {}
            Err(error) => return Err(error),
        }
    }
    io_remaining(deadline, stop)?;
    Ok(())
}

'''
for name in ['ipc.rs','browser_ipc.rs']:
 p=base/name;s=p.read_text();s=s.replace('use std::io::{self, BufRead, BufReader, Read, Write};','use std::io::{self, Read, Write};\n#[cfg(test)]\nuse std::io::{BufRead, BufReader};').replace('use std::time::Duration;','use std::time::{Duration, Instant};')
 pos=s.index('fn serve_one(');s=s[:pos]+helper+s[pos:]
 if name=='ipc.rs':
  s=s.replace('    commands: &CommandHost,\n) -> io::Result<()> {','    commands: &CommandHost,\n    read_deadline: Instant,\n    stop: &AtomicBool,\n) -> io::Result<()> {')
  a=s.index('    // macOS may inherit');b=s.index('    let reply =',a)
  s=s[:a]+'''    stream.set_nonblocking(true)?;
    if !peer_is_sidecar(&stream, expected_pid)? {
        return write_frame(&mut stream, b"{\\"ok\\":false,\\"code\\":\\"UNAUTHORIZED_PEER\\"}\\n", Instant::now() + IO_PHASE, stop);
    }
    let body = read_frame(&mut stream, MAX_REQUEST as usize, read_deadline, stop)?;
'''+s[b:]
  s=s.replace('    serde_json::to_writer(&mut stream, &reply)?;\n    stream.write_all(b"\\n")?;\n    Ok(())','    let write_deadline = Instant::now() + IO_PHASE;\n    let mut encoded = serde_json::to_vec(&reply)?;\n    encoded.push(b\'\\n\');\n    write_frame(&mut stream, &encoded, write_deadline, stop)')
  s=s.replace('let _ = serve_one(stream, expected_pid, &base, &thread_commands);','let read_deadline = Instant::now() + IO_PHASE;\n                        let _ = serve_one(stream, expected_pid, &base, &thread_commands, read_deadline, &stop_thread);')
 else:
  s=s.replace('    runtime: &tokio::runtime::Runtime,\n) -> io::Result<()> {','    runtime: &tokio::runtime::Runtime,\n    read_deadline: Instant,\n    stop: &AtomicBool,\n) -> io::Result<()> {')
  a=s.index('    // Accepted sockets');b=s.index('    let reply: Value =',a)
  s=s[:a]+'''    stream.set_nonblocking(true)?;
    if !peer_is_sidecar(&stream, expected_pid)? {
        return write_frame(&mut stream, b"{\\"ok\\":false,\\"code\\":\\"UNAUTHORIZED_PEER\\"}\\n", Instant::now() + IO_PHASE, stop);
    }
    let body = read_frame(&mut stream, MAX_REQUEST_BYTES as usize, read_deadline, stop)?;
'''+s[b:]
  s=s.replace('    let encoded = bounded_response(&reply)?;\n    stream.write_all(&encoded)?;\n    stream.write_all(b"\\n")?;\n    Ok(())','    let write_deadline = Instant::now() + IO_PHASE;\n    let mut encoded = bounded_response(&reply)?;\n    encoded.push(b\'\\n\');\n    write_frame(&mut stream, &encoded, write_deadline, stop)')
  s=s.replace('Ok((mut stream, _)) => {','Ok((mut stream, _)) => {\n                            let read_deadline = Instant::now() + IO_PHASE;')
  s=s.replace('let _ =\n                                    stream.write_all(b"{\\"ok\\":false,\\"code\\":\\"BROWSER_BUSY\\"}\\n");','let _ = stream.set_nonblocking(true).and_then(|_| write_frame(&mut stream, b"{\\"ok\\":false,\\"code\\":\\"BROWSER_BUSY\\"}\\n", read_deadline, &stop));')
  s=s.replace('let active = active.clone();\n                            workers', 'let active = active.clone();\n                            let worker_stop = stop.clone();\n                            workers')
  s=s.replace('let _ = serve_one(stream, expected_pid, &host, &runtime);','let _ = serve_one(stream, expected_pid, &host, &runtime, read_deadline, &worker_stop);')
 p.write_text(s)
