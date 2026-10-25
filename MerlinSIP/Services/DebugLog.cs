using System.Collections.Concurrent;
using System.IO;
using System.Text;

namespace MerlinSip.Services;

public static class DebugLog
{
    private static readonly object Sync = new();
    private static readonly ConcurrentQueue<string> Pending = new();
    private static int _pumping;
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
                var lines = File.ReadAllLines(Path);
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

        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
        File.AppendAllText(Path, batch.ToString());
    }
}
