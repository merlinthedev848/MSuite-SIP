using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
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

    public async Task<IReadOnlyList<CallHistoryEntry>> LoadAsync()
    {
        if (!File.Exists(_path))
        {
            return [];
        }

        try
        {
            await using var stream = new FileStream(_path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 4096, useAsync: true);
            var loaded = await JsonSerializer.DeserializeAsync<List<CallHistoryEntry>>(stream) ?? [];
            return loaded.Where(call => !CallHistoryEntry.IsStockFiller(call)).ToList();
        }
        catch (Exception error)
        {
            DebugLog.Write($"CALL HISTORY load failed error={error.Message}");
            return [];
        }
    }

    public async Task SaveAsync(IEnumerable<CallHistoryEntry> calls)
    {
        try
        {
            await AtomicFileStorage.SaveAtomicAsync(_path, calls.Where(call => !CallHistoryEntry.IsStockFiller(call)).Take(500).ToList(), JsonOptions);
        }
        catch (Exception error)
        {
            DebugLog.Write($"CALL HISTORY save failed error={error.Message}");
        }
    }
}
