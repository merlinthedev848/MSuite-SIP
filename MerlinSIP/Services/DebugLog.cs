using System.IO;
using System.Text.RegularExpressions;

namespace MerlinSip.Services;

internal static class DebugLog
{
    private const long MaxLogBytes = 5 * 1024 * 1024;
    private const int MaxRotatedFiles = 3;
    private static readonly object Sync = new();

    private static readonly Regex SensitiveValueRegex = new(
        @"(?<key>password|passwd|sip_password|secret|token|access_token|refresh_token|license_key|authorization)(?<sep>\s*[:=]\s*)(?<value>[^\s,;&]+)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static readonly string Path = System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MerlinSIP",
        "debug.log");

    public static void Write(string message)
    {
        try
        {
            lock (Sync)
            {
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
                RotateIfNeeded(message.Length + Environment.NewLine.Length);
                var safeMessage = Redact(message);
                File.AppendAllText(
                    Path,
                    $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss.fff zzz} {safeMessage}{Environment.NewLine}");
            }
        }
        catch
        {
            // Logging should never break the phone.
        }
    }

    public static List<string> GetRecentLines(int count)
    {
        if (count <= 0)
        {
            return [];
        }

        try
        {
            lock (Sync)
            {
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

    private static string Redact(string message)
    {
        if (string.IsNullOrEmpty(message))
        {
            return message;
        }

        return SensitiveValueRegex.Replace(message, "${key}${sep}[REDACTED]");
    }

    private static void RotateIfNeeded(int incomingBytes)
    {
        try
        {
            if (!File.Exists(Path))
            {
                return;
            }

            var length = new FileInfo(Path).Length;
            if (length + incomingBytes <= MaxLogBytes)
            {
                return;
            }

            for (var index = MaxRotatedFiles; index >= 1; index--)
            {
                var source = index == 1 ? Path : $"{Path}.{index - 1}";
                var destination = $"{Path}.{index}";

                if (index == MaxRotatedFiles && File.Exists(destination))
                {
                    File.Delete(destination);
                }

                if (File.Exists(source))
                {
                    File.Move(source, destination, overwrite: true);
                }
            }
        }
        catch
        {
            // Rotation is best-effort; the current log remains usable.
        }
    }
}
