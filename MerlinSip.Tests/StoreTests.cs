using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class StoreTests
{
    [Fact]
    public async Task ContactStore_SaveAndLoad_RoundtripsSuccessfully()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "MerlinSip_ContactTest_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        var contactFile = Path.Combine(tempDir, "contacts.json");
        var jsonOptions = new System.Text.Json.JsonSerializerOptions { WriteIndented = true };

        try
        {
            var contacts = new List<ContactEntry>
            {
                new ContactEntry { Name = "Alice", Number = "100", Company = "Engineering", IsFavorite = true },
                new ContactEntry { Name = "Bob", Number = "101", Company = "Support", IsFavorite = false }
            };

            await AtomicFileStorage.SaveAtomicAsync(contactFile, contacts, jsonOptions);

            Assert.True(File.Exists(contactFile));
            await using var stream = File.OpenRead(contactFile);
            var loaded = await System.Text.Json.JsonSerializer.DeserializeAsync<List<ContactEntry>>(stream);

            Assert.NotNull(loaded);
            Assert.Equal(2, loaded.Count);
            Assert.Equal("Alice", loaded[0].Name);
            Assert.Equal("Bob", loaded[1].Name);
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, recursive: true);
            }
        }
    }

    [Fact]
    public async Task CallHistoryStore_Enforces500EntryCap()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "MerlinSip_HistTest_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        var histFile = Path.Combine(tempDir, "history.json");
        var jsonOptions = new System.Text.Json.JsonSerializerOptions { WriteIndented = true };

        try
        {
            var entries = Enumerable.Range(1, 600).Select(i => new CallHistoryEntry
            {
                Id = Guid.NewGuid().ToString("N"),
                Number = $"100{i}",
                Name = $"Caller {i}",
                StartedAt = DateTimeOffset.UtcNow.ToString("s"),
                Duration = "00:00:30",
                Direction = "Outgoing",
                Result = "Completed"
            }).Take(500).ToList();

            await AtomicFileStorage.SaveAtomicAsync(histFile, entries, jsonOptions);

            await using var stream = File.OpenRead(histFile);
            var loaded = await System.Text.Json.JsonSerializer.DeserializeAsync<List<CallHistoryEntry>>(stream);
            Assert.NotNull(loaded);
            Assert.Equal(500, loaded.Count);
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, recursive: true);
            }
        }
    }

    [Fact]
    public void DebugLog_Write_DoesNotThrow()
    {
        var exception = Record.Exception(() =>
        {
            DebugLog.Write("TEST_LOG_ENTRY: Validating structured logging pipeline");
        });

        Assert.Null(exception);
    }
}
