using System.Collections.Concurrent;
using System.IO;
using System.Text;

namespace MerlinSip.Services;

public static class DebugLog
{
    private static readonly object Sync = new();
    private static readonly ConcurrentQueue<string> Pending = new();
    private static int _pumping;
    private const long MaxLogSizeBytes = 10 * 1024 * 1024; // 10 MB max log size

    public static readonly string Path = System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MerlinSIP",
        "debug.log");

    public static void Write(string message)
    {
        Pending.Enqueue($"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss.fff zzz} {message}");
        if (Interlocked.CompareExchange(ref _pumping, 1, 0) == 0)
        {
            ThreadPool.QueueUserWorkItem(_ => Pump());
        }
    }

    public static List<string> GetRecentLines(int count)
    {
        try
        {
            lock (Sync)
            {
                FlushPending();
                if (!File.Exists(Path))
                {
                    return [];
                }

                // Fast tail read: avoid loading entire multi-megabyte log into memory
                using var fs = new FileStream(Path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                var estimatedBytes = Math.Min(fs.Length, (long)Math.Max(count, 50) * 350);
                fs.Seek(-estimatedBytes, SeekOrigin.End);

                using var reader = new StreamReader(fs, Encoding.UTF8);
                var content = reader.ReadToEnd();
                var lines = content.Split(["\r\n", "\n"], StringSplitOptions.RemoveEmptyEntries);

                return lines.Length <= count ? [.. lines] : [.. lines.Skip(lines.Length - count)];
            }
        }
        catch
        {
            return [];
        }
    }

    private static void Pump()
    {
        try
        {
            lock (Sync)
            {
                FlushPending();
            }
        }
        catch
        {
            // Logging should never break the phone.
        }
        finally
        {
            Interlocked.Exchange(ref _pumping, 0);
            if (!Pending.IsEmpty && Interlocked.CompareExchange(ref _pumping, 1, 0) == 0)
            {
                ThreadPool.QueueUserWorkItem(_ => Pump());
            }
        }
    }

    private static void FlushPending()
    {
        if (Pending.IsEmpty)
        {
            return;
        }

        var batch = new StringBuilder();
        while (Pending.TryDequeue(out var line))
        {
            batch.AppendLine(line);
        }

        if (batch.Length == 0)
        {
            return;
        }

        var dir = System.IO.Path.GetDirectoryName(Path)!;
        Directory.CreateDirectory(dir);

        // Check for log rotation
        try
        {
            var fi = new FileInfo(Path);
            if (fi.Exists && fi.Length >= MaxLogSizeBytes)
            {
                var backupPath = Path + ".1";
                File.Delete(backupPath);
                File.Move(Path, backupPath);
            }
        }
        catch
        {
            // Proceed even if rotation check fails
        }

        File.AppendAllText(Path, batch.ToString());
    }
}
