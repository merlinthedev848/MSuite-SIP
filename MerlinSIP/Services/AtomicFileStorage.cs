using System;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace MerlinSip.Services;

/// <summary>
/// Thread-safe atomic file storage utility that prevents file corruption during crashes or power loss.
/// Includes retry backoff and automatic cleanup for high-concurrency Windows file system resilience.
/// </summary>
public static class AtomicFileStorage
{
    private static readonly SemaphoreSlim FileLock = new(1, 1);

    public static async Task SaveAtomicAsync<T>(string destinationPath, T data, JsonSerializerOptions options, CancellationToken ct = default)
    {
        await FileLock.WaitAsync(ct);
        string? tempPath = null;
        try
        {
            string? dir = Path.GetDirectoryName(destinationPath);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            tempPath = $"{destinationPath}.{Guid.NewGuid():N}.tmp";

            await using (var fs = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous))
            {
                await JsonSerializer.SerializeAsync(fs, data, options, ct);
                await fs.FlushAsync(ct);
                fs.Flush(flushToDisk: true);
            }

            await ReplaceFileWithRetryAsync(tempPath, destinationPath, ct);
            tempPath = null;
        }
        finally
        {
            if (tempPath != null && File.Exists(tempPath))
            {
                try { File.Delete(tempPath); } catch { }
            }
            FileLock.Release();
        }
    }

    public static async Task SaveAtomicTextAsync(string destinationPath, string content, CancellationToken ct = default)
    {
        await FileLock.WaitAsync(ct);
        string? tempPath = null;
        try
        {
            string? dir = Path.GetDirectoryName(destinationPath);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            tempPath = $"{destinationPath}.{Guid.NewGuid():N}.tmp";
            await File.WriteAllTextAsync(tempPath, content, ct);
            await ReplaceFileWithRetryAsync(tempPath, destinationPath, ct);
            tempPath = null;
        }
        finally
        {
            if (tempPath != null && File.Exists(tempPath))
            {
                try { File.Delete(tempPath); } catch { }
            }
            FileLock.Release();
        }
    }

    private static async Task ReplaceFileWithRetryAsync(string sourceTemp, string destinationPath, CancellationToken ct)
    {
        const int maxAttempts = 10;
        for (int attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                if (File.Exists(destinationPath))
                {
                    File.Replace(sourceTemp, destinationPath, destinationPath + ".bak", ignoreMetadataErrors: true);
                }
                else
                {
                    File.Move(sourceTemp, destinationPath);
                }
                return;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                if (attempt == maxAttempts)
                {
                    throw;
                }
                await Task.Delay(attempt * 20, ct);
            }
        }
    }
}
