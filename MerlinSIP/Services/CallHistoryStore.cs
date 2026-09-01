using System.IO;
using System.Text.Json;
using MerlinSip.Models;

namespace MerlinSip.Services;

public sealed class CallHistoryStore
{
    private readonly string _path = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MerlinSIP",
        "call-history.json");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private readonly SemaphoreSlim _saveLock = new(1, 1);

    public async Task<IReadOnlyList<CallHistoryEntry>> LoadAsync()
    {
        if (!File.Exists(_path))
        {
            return [];
        }

        try
        {
            await using var stream = File.OpenRead(_path);
            return await JsonSerializer.DeserializeAsync<List<CallHistoryEntry>>(stream) ?? [];
        }
        catch (Exception error)
        {
            DebugLog.Write($"CALL HISTORY load failed error={error.Message}");
            return [];
        }
    }

    public async Task SaveAsync(IEnumerable<CallHistoryEntry> calls)
    {
        ArgumentNullException.ThrowIfNull(calls);

        await _saveLock.WaitAsync();
        try
        {
            // StartedAt is stored in an ISO-like sortable format by the model.
            // Sort here rather than relying on callers to maintain collection order.
            var snapshot = calls
                .OrderByDescending(call => call.StartedAt, StringComparer.Ordinal)
                .Take(500)
                .ToList();

            await AtomicJsonFile.WriteAsync(_path, snapshot, JsonOptions);
        }
        catch (Exception error)
        {
            DebugLog.Write($"CALL HISTORY save failed error={error.Message}");
        }
        finally
        {
            _saveLock.Release();
        }
    }
}
