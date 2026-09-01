using System;
using System.IO;
using System.Text.Json;

namespace MerlinSip.Services;

/// <summary>
/// Writes JSON files using a temporary file followed by an atomic replacement.
/// This prevents a process crash or power loss from leaving a partially-written file.
/// </summary>
internal static class AtomicJsonFile
{
    public static async Task WriteAsync<T>(string path, T value, JsonSerializerOptions options, CancellationToken cancellationToken = default)
    {
        var directory = Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException("The target file must have a directory.");

        Directory.CreateDirectory(directory);
        var temporaryPath = Path.Combine(
            directory,
            $".{Path.GetFileName(path)}.{Guid.NewGuid():N}.tmp");

        try
        {
            await using (var stream = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 16 * 1024,
                options: FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                await JsonSerializer.SerializeAsync(stream, value, options, cancellationToken);
                await stream.FlushAsync(cancellationToken);
                stream.Flush(flushToDisk: true);
            }

            File.Move(temporaryPath, path, overwrite: true);
        }
        finally
        {
            try
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }
            catch
            {
                // Cleanup failure must not hide the original save failure.
            }
        }
    }
}
