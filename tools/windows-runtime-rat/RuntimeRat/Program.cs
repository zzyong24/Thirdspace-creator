using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

internal static class Program
{
    private static readonly string[] PayloadNames =
    [
        "shell.zip", "core.zip", "browser.zip", "media.zip", "local-ai.zip"
    ];

    private static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0) throw new ArgumentException("missing command");
            var options = ParseOptions(args.Skip(1).ToArray());
            return args[0] switch
            {
                "package" => RunPackage(options),
                "state-suite" => RunStateSuite(Required(options, "root")),
                "state-child" => RunStateChild(Required(options, "root"), Required(options, "kill-after")),
                "path-suite" => RunPathSuite(Required(options, "root")),
                "serve" => RunServer(
                    Required(options, "root"),
                    int.Parse(Required(options, "port")),
                    Required(options, "log"),
                    options.GetValueOrDefault("interrupt-once")),
                _ => throw new ArgumentException($"unknown command: {args[0]}")
            };
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }

    private static Dictionary<string, string> ParseOptions(string[] args)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < args.Length; index++)
        {
            if (!args[index].StartsWith("--", StringComparison.Ordinal))
                throw new ArgumentException($"unexpected argument: {args[index]}");
            var key = args[index][2..];
            var value = index + 1 < args.Length && !args[index + 1].StartsWith("--", StringComparison.Ordinal)
                ? args[++index]
                : "true";
            result[key] = value;
        }
        return result;
    }

    private static string Required(IReadOnlyDictionary<string, string> options, string key) =>
        options.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value
            : throw new ArgumentException($"missing --{key}");

    private static int RunPackage(IReadOnlyDictionary<string, string> options)
    {
        // Burn executes the package from its verified package-cache directory and
        // materializes child Payloads beside it. Deriving this directory avoids the
        // Windows argv trailing-backslash trap in "...CacheFolder\".
        var payloadRoot = options.TryGetValue("payload-root", out var configuredRoot)
            ? Path.GetFullPath(configuredRoot)
            : AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        var resultPath = Path.GetFullPath(Required(options, "result"));
        var mode = options.GetValueOrDefault("mode", "unknown");
        var hashes = new SortedDictionary<string, object>(StringComparer.Ordinal);
        foreach (var name in PayloadNames)
        {
            var path = Path.Combine(payloadRoot, name);
            if (!File.Exists(path)) throw new FileNotFoundException($"Burn cache missing {name}", path);
            using var stream = File.OpenRead(path);
            hashes[name] = new
            {
                bytes = stream.Length,
                sha512 = Convert.ToHexString(SHA512.HashData(stream)).ToLowerInvariant()
            };
        }

        Directory.CreateDirectory(Path.GetDirectoryName(resultPath)!);
        WriteDurableJson(resultPath, new
        {
            passed = true,
            mode,
            payloadRoot,
            payloads = hashes,
            utc = DateTimeOffset.UtcNow
        });
        Console.WriteLine($"PACKAGE_OK mode={mode} payloadRoot={payloadRoot}");
        return 0;
    }

    private sealed record Journal(
        long Sequence,
        string AttemptId,
        string Step,
        string OldSetId,
        string NewSetId,
        string Checksum = "");

    private static string JournalChecksum(Journal journal)
    {
        var canonical = $"{journal.Sequence}\n{journal.AttemptId}\n{journal.Step}\n{journal.OldSetId}\n{journal.NewSetId}\n";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    private static void WriteJournal(string path, Journal journal)
    {
        var signed = journal with { Checksum = JournalChecksum(journal) };
        WriteDurableJson(path, signed);
    }

    private static Journal? ReadValidJournal(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            var journal = JsonSerializer.Deserialize<Journal>(File.ReadAllText(path));
            if (journal is null || !CryptographicOperations.FixedTimeEquals(
                    Encoding.ASCII.GetBytes(journal.Checksum),
                    Encoding.ASCII.GetBytes(JournalChecksum(journal))))
                return null;
            return journal;
        }
        catch
        {
            return null;
        }
    }

    private static int RunStateChild(string root, string killAfter)
    {
        Directory.CreateDirectory(root);
        var oldSet = "set-old";
        var newSet = "set-new";
        var attempt = Guid.NewGuid().ToString("N");
        var journalPath = Path.Combine(root, "transaction.json");
        var newRoot = Path.Combine(root, "sets", newSet);
        Directory.CreateDirectory(newRoot);
        File.WriteAllText(Path.Combine(newRoot, "runtime.ok"), "new");
        WriteJournal(journalPath, new Journal(1, attempt, "materialized", oldSet, newSet));
        CrashAt(killAfter, "materialized");

        File.WriteAllText(Path.Combine(newRoot, "smoke.ok"), "healthy");
        WriteJournal(journalPath, new Journal(2, attempt, "smoke-passed", oldSet, newSet));
        CrashAt(killAfter, "smoke-passed");

        WriteDurableText(Path.Combine(root, "current"), newSet);
        WriteJournal(journalPath, new Journal(3, attempt, "current-written", oldSet, newSet));
        CrashAt(killAfter, "current-written");

        WriteDurableJson(Path.Combine(root, "entry.json"), new { setId = newSet });
        WriteJournal(journalPath, new Journal(4, attempt, "entry-written", oldSet, newSet));
        CrashAt(killAfter, "entry-written");

        File.Delete(journalPath);
        return 0;
    }

    private static void CrashAt(string requested, string actual)
    {
        if (!string.Equals(requested, actual, StringComparison.Ordinal)) return;
        Environment.FailFast($"intentional RAT crash after {actual}");
    }

    private static int RunStateSuite(string root)
    {
        var points = new[] { "materialized", "smoke-passed", "current-written", "entry-written" };
        Directory.CreateDirectory(root);
        foreach (var point in points)
        {
            var caseRoot = Path.Combine(root, point);
            ResetState(caseRoot);
            var process = Process.Start(new ProcessStartInfo
            {
                FileName = Environment.ProcessPath!,
                ArgumentList =
                {
                    "state-child", "--root", caseRoot, "--kill-after", point
                },
                UseShellExecute = false,
                CreateNoWindow = true
            }) ?? throw new InvalidOperationException("failed to start crash child");
            process.WaitForExit();
            if (process.ExitCode == 0) throw new InvalidOperationException($"{point}: child did not crash");
            Recover(caseRoot);
            var current = File.ReadAllText(Path.Combine(caseRoot, "current")).Trim();
            var entry = JsonDocument.Parse(File.ReadAllText(Path.Combine(caseRoot, "entry.json")))
                .RootElement.GetProperty("setId").GetString();
            if (current is not ("set-old" or "set-new") || current != entry)
                throw new InvalidOperationException($"{point}: split brain current={current} entry={entry}");
            var healthy = Path.Combine(caseRoot, "sets", current, "smoke.ok");
            if (!File.Exists(healthy)) throw new InvalidOperationException($"{point}: selected set not healthy");
            Console.WriteLine($"STATE_RECOVERY_OK point={point} selected={current}");
        }

        var tornRoot = Path.Combine(root, "torn-journal");
        ResetState(tornRoot);
        var valid = new Journal(7, "torn", "current-written", "set-old", "set-new");
        Directory.CreateDirectory(Path.Combine(tornRoot, "sets", "set-new"));
        File.WriteAllText(Path.Combine(tornRoot, "sets", "set-new", "smoke.ok"), "healthy");
        WriteJournal(Path.Combine(tornRoot, "transaction.json"), valid);
        File.Copy(Path.Combine(tornRoot, "transaction.json"), Path.Combine(tornRoot, "transaction.json.bak"), true);
        File.WriteAllText(Path.Combine(tornRoot, "transaction.json"), "{\"Sequence\":999");
        Recover(tornRoot);
        if (File.ReadAllText(Path.Combine(tornRoot, "current")).Trim() != "set-new")
            throw new InvalidOperationException("backup journal was not recovered");
        Console.WriteLine("STATE_TORN_JOURNAL_OK");

        var corruptRoot = Path.Combine(root, "corrupt-journal");
        ResetState(corruptRoot);
        File.WriteAllText(Path.Combine(corruptRoot, "transaction.json"), "{}");
        File.WriteAllText(Path.Combine(corruptRoot, "transaction.json.bak"), "{\"Checksum\":\"bad\"}");
        try
        {
            Recover(corruptRoot);
            throw new InvalidOperationException("corrupt journal unexpectedly accepted");
        }
        catch (InvalidDataException)
        {
            if (File.ReadAllText(Path.Combine(corruptRoot, "current")).Trim() != "set-old")
                throw new InvalidOperationException("fail-closed recovery mutated current");
        }
        Console.WriteLine("STATE_CORRUPT_JOURNAL_FAIL_CLOSED_OK");
        return 0;
    }

    private static void ResetState(string root)
    {
        if (Directory.Exists(root)) Directory.Delete(root, true);
        Directory.CreateDirectory(Path.Combine(root, "sets", "set-old"));
        File.WriteAllText(Path.Combine(root, "sets", "set-old", "smoke.ok"), "healthy");
        WriteDurableText(Path.Combine(root, "current"), "set-old");
        WriteDurableJson(Path.Combine(root, "entry.json"), new { setId = "set-old" });
    }

    private static void Recover(string root)
    {
        var journalPath = Path.Combine(root, "transaction.json");
        var candidates = new[]
        {
            ReadValidJournal(journalPath),
            ReadValidJournal(journalPath + ".bak")
        }.Where(candidate => candidate is not null).Cast<Journal>().OrderByDescending(candidate => candidate.Sequence).ToArray();
        if (candidates.Length == 0)
            throw new InvalidDataException("no valid transaction journal");
        var journal = candidates[0];
        var mayCommit = journal.Step is "current-written" or "entry-written";
        var newHealthy = File.Exists(Path.Combine(root, "sets", journal.NewSetId, "smoke.ok"));
        var selected = mayCommit && newHealthy ? journal.NewSetId : journal.OldSetId;
        if (!File.Exists(Path.Combine(root, "sets", selected, "smoke.ok")))
            throw new InvalidDataException($"selected set is not healthy: {selected}");
        WriteDurableText(Path.Combine(root, "current"), selected);
        WriteDurableJson(Path.Combine(root, "entry.json"), new { setId = selected });
        File.Delete(journalPath);
        if (File.Exists(journalPath + ".bak")) File.Delete(journalPath + ".bak");
    }

    private static int RunPathSuite(string root)
    {
        if (Directory.Exists(root)) Directory.Delete(root, true);
        Directory.CreateDirectory(root);
        var outside = Path.Combine(Path.GetDirectoryName(root)!, Path.GetFileName(root) + "-outside");
        if (Directory.Exists(outside)) Directory.Delete(outside, true);
        Directory.CreateDirectory(outside);
        var sentinel = Path.Combine(outside, "sentinel.txt");
        File.WriteAllText(sentinel, "unchanged");

        var badNames = new[]
        {
            "../escape.txt", "/absolute.txt", @"C:\absolute.txt", "safe/../../escape.txt",
            "safe/file.txt:ads", "CON", "safe/aux.log", "safe/trailing. ", @"safe\backslash.txt"
        };
        foreach (var badName in badNames)
        {
            var zip = Path.Combine(root, $"bad-{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(badName)))[..8]}.zip");
            using (var archive = ZipFile.Open(zip, ZipArchiveMode.Create))
                archive.CreateEntry(badName);
            ExpectRejected(zip, Path.Combine(root, "extract-" + Path.GetFileNameWithoutExtension(zip)));
        }

        var collision = Path.Combine(root, "case-collision.zip");
        using (var archive = ZipFile.Open(collision, ZipArchiveMode.Create))
        {
            archive.CreateEntry("Dir/File.txt");
            archive.CreateEntry("dir/file.TXT");
        }
        ExpectRejected(collision, Path.Combine(root, "extract-collision"));

        var symlink = Path.Combine(root, "symlink.zip");
        using (var archive = ZipFile.Open(symlink, ZipArchiveMode.Create))
        {
            var entry = archive.CreateEntry("link");
            entry.ExternalAttributes = unchecked((int)0xA1FF0000);
        }
        ExpectRejected(symlink, Path.Combine(root, "extract-symlink"));

        var junctionPath = Path.Combine(root, "junction");
        RunCmd($"/c mklink /J \"{junctionPath}\" \"{outside}\"");
        ExpectThrows(() => EnsureNoReparseAncestors(root, Path.Combine(junctionPath, "escaped.txt")));
        if (File.Exists(Path.Combine(outside, "escaped.txt")))
            throw new InvalidOperationException("junction containment wrote outside staging");

        var hardlink = Path.Combine(root, "hardlink.txt");
        RunCmd($"/c mklink /H \"{hardlink}\" \"{sentinel}\"");
        ExpectThrows(() =>
        {
            using var stream = new FileStream(hardlink, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            stream.WriteByte(1);
        });
        if (File.ReadAllText(sentinel) != "unchanged")
            throw new InvalidOperationException("hardlink containment changed outside sentinel");

        var good = Path.Combine(root, "good.zip");
        using (var archive = ZipFile.Open(good, ZipArchiveMode.Create))
        {
            using var writer = new StreamWriter(archive.CreateEntry("layers/core/file.txt").Open());
            writer.Write("ok");
        }
        ExtractStrict(good, Path.Combine(root, "good-output"));
        if (File.ReadAllText(Path.Combine(root, "good-output", "layers", "core", "file.txt")) != "ok")
            throw new InvalidOperationException("valid archive did not extract");
        Console.WriteLine("PATH_CONTAINMENT_OK traversal absolute ADS reserved case symlink junction hardlink");
        return 0;
    }

    private static void ExpectRejected(string zip, string destination)
    {
        ExpectThrows(() => ExtractStrict(zip, destination));
        if (Directory.Exists(destination) && Directory.EnumerateFiles(destination, "*", SearchOption.AllDirectories).Any())
            throw new InvalidOperationException($"rejected archive wrote files: {zip}");
    }

    private static void ExpectThrows(Action action)
    {
        try
        {
            action();
            throw new InvalidOperationException("operation unexpectedly succeeded");
        }
        catch (Exception error) when (error is InvalidDataException or IOException or UnauthorizedAccessException)
        {
        }
    }

    private static void ExtractStrict(string zip, string destination)
    {
        Directory.CreateDirectory(destination);
        var root = Path.GetFullPath(destination).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using var archive = ZipFile.OpenRead(zip);
        foreach (var entry in archive.Entries)
        {
            var raw = entry.FullName;
            if (string.IsNullOrWhiteSpace(raw) || raw.Contains('\\') || Path.IsPathRooted(raw) || raw.Contains(':'))
                throw new InvalidDataException($"unsafe path: {raw}");
            var parts = raw.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0 || parts.Any(part => part is "." or ".." || part != part.TrimEnd(' ', '.')))
                throw new InvalidDataException($"unsafe segment: {raw}");
            foreach (var part in parts)
            {
                var stem = part.Split('.')[0];
                if (IsReservedDeviceName(stem)) throw new InvalidDataException($"reserved name: {raw}");
            }
            var unixType = ((uint)entry.ExternalAttributes >> 16) & 0xF000;
            if (unixType == 0xA000) throw new InvalidDataException($"symlink entry: {raw}");
            var normalized = string.Join('/', parts).Normalize(NormalizationForm.FormKC);
            if (!names.Add(normalized)) throw new InvalidDataException($"case collision: {raw}");
            var output = Path.GetFullPath(Path.Combine(destination, Path.Combine(parts)));
            if (!output.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"escaped root: {raw}");
        }

        foreach (var entry in archive.Entries)
        {
            var parts = entry.FullName.Split('/', StringSplitOptions.RemoveEmptyEntries);
            var output = Path.GetFullPath(Path.Combine(destination, Path.Combine(parts)));
            EnsureNoReparseAncestors(destination, output);
            if (entry.FullName.EndsWith('/'))
            {
                Directory.CreateDirectory(output);
                continue;
            }
            Directory.CreateDirectory(Path.GetDirectoryName(output)!);
            EnsureNoReparseAncestors(destination, output);
            using var source = entry.Open();
            using var target = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            source.CopyTo(target);
            target.Flush(true);
        }
    }

    private static bool IsReservedDeviceName(string stem)
    {
        var upper = stem.ToUpperInvariant();
        return upper is "CON" or "PRN" or "AUX" or "NUL"
            || (upper.Length == 4 && (upper.StartsWith("COM") || upper.StartsWith("LPT"))
                && upper[3] is >= '1' and <= '9');
    }

    private static void EnsureNoReparseAncestors(string root, string output)
    {
        var rootFull = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar);
        var relative = Path.GetRelativePath(rootFull, Path.GetFullPath(output));
        var current = rootFull;
        foreach (var part in relative.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries).SkipLast(1))
        {
            current = Path.Combine(current, part);
            if (File.Exists(current) || Directory.Exists(current))
            {
                var attributes = File.GetAttributes(current);
                if ((attributes & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidDataException($"reparse ancestor: {current}");
            }
        }
    }

    private static void RunCmd(string arguments)
    {
        var process = Process.Start(new ProcessStartInfo("cmd.exe", arguments)
        {
            UseShellExecute = false,
            CreateNoWindow = true
        }) ?? throw new InvalidOperationException("cmd.exe failed to start");
        process.WaitForExit();
        if (process.ExitCode != 0) throw new InvalidOperationException($"cmd.exe exit {process.ExitCode}: {arguments}");
    }

    private static int RunServer(string root, int port, string logPath, string? interruptOnce)
    {
        root = Path.GetFullPath(root);
        Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
        var interrupted = false;
        using var listener = new HttpListener();
        listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        listener.Start();
        Console.WriteLine($"SERVER_READY port={port}");
        while (true)
        {
            var context = listener.GetContext();
            var name = Uri.UnescapeDataString(context.Request.Url!.AbsolutePath.TrimStart('/'));
            var path = Path.GetFullPath(Path.Combine(root, name));
            if (!path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
            {
                context.Response.StatusCode = 404;
                context.Response.Close();
                continue;
            }
            var rangeHeader = context.Request.Headers["Range"] ?? "";
            File.AppendAllText(logPath, $"{DateTimeOffset.UtcNow:O}\t{name}\tRange={rangeHeader}\n");
            var start = 0L;
            if (rangeHeader.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase)
                && long.TryParse(rangeHeader[6..].TrimEnd('-'), out var parsed))
                start = parsed;
            using var input = File.OpenRead(path);
            input.Position = start;
            context.Response.StatusCode = start > 0 ? 206 : 200;
            context.Response.ContentLength64 = input.Length - start;
            context.Response.AddHeader("Accept-Ranges", "bytes");
            if (start > 0) context.Response.AddHeader("Content-Range", $"bytes {start}-{input.Length - 1}/{input.Length}");
            if (!interrupted && string.Equals(name, interruptOnce, StringComparison.OrdinalIgnoreCase) && start == 0)
            {
                interrupted = true;
                var remaining = input.Length / 2;
                var buffer = new byte[81920];
                while (remaining > 0)
                {
                    var read = input.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                    if (read == 0) break;
                    context.Response.OutputStream.Write(buffer, 0, read);
                    remaining -= read;
                }
                context.Response.Abort();
                File.AppendAllText(logPath, $"{DateTimeOffset.UtcNow:O}\t{name}\tINTERRUPTED\n");
                continue;
            }
            input.CopyTo(context.Response.OutputStream);
            context.Response.Close();
        }
    }

    private static void WriteDurableText(string path, string text) =>
        WriteDurableBytes(path, Encoding.UTF8.GetBytes(text + "\n"));

    private static void WriteDurableJson<T>(string path, T value) =>
        WriteDurableBytes(path, JsonSerializer.SerializeToUtf8Bytes(value, new JsonSerializerOptions
        {
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        }));

    private static void WriteDurableBytes(string path, byte[] bytes)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
        {
            stream.Write(bytes);
            stream.Flush(true);
        }
        if (File.Exists(path))
        {
            File.Replace(temp, path, path + ".bak", true);
        }
        else
        {
            File.Move(temp, path);
        }
    }
}
