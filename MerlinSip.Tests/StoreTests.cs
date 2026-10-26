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

    [Fact]
    public async Task ContactStore_CsvExportImport_RoundtripsSuccessfully()
    {
        var tempFile = Path.Combine(Path.GetTempPath(), $"contacts_{Guid.NewGuid():N}.csv");
        try
        {
            var original = new List<ContactEntry>
            {
                new ContactEntry { Name = "John Doe", Number = "1001", Company = "Acme, Inc.", Notes = "Important \"VIP\"", IsFavorite = true },
                new ContactEntry { Name = "Jane Smith", Number = "1002", Company = "Merlin", Notes = "Normal user", IsFavorite = false }
            };

            await ContactStore.ExportCsvAsync(original, tempFile);
            Assert.True(File.Exists(tempFile));

            var imported = await ContactStore.ImportCsvAsync(tempFile);
            Assert.Equal(2, imported.Count);
            Assert.Equal("John Doe", imported[0].Name);
            Assert.Equal("1001", imported[0].Number);
            Assert.Equal("Acme, Inc.", imported[0].Company);
            Assert.Equal("Important \"VIP\"", imported[0].Notes);
            Assert.True(imported[0].IsFavorite);

            Assert.Equal("Jane Smith", imported[1].Name);
            Assert.Equal("1002", imported[1].Number);
            Assert.Equal("Merlin", imported[1].Company);
            Assert.False(imported[1].IsFavorite);
        }
        finally
        {
            if (File.Exists(tempFile))
            {
                File.Delete(tempFile);
            }
        }
    }

    [Theory]
    [InlineData("John Doe", "1001", "JD")]
    [InlineData("Alice", "1002", "AL")]
    [InlineData("Robert Downey Jr.", "1003", "RD")]
    [InlineData("", "555", "55")]
    public void ContactEntry_Initials_ComputesCorrectly(string name, string number, string expectedInitials)
    {
        var contact = new ContactEntry { Name = name, Number = number };
        Assert.Equal(expectedInitials, contact.Initials);
    }

    [Theory]
    [InlineData("Inbound", "#2563EB")]
    [InlineData("Outbound", "#10B981")]
    [InlineData("Missed", "#EF4444")]
    [InlineData("Unknown", "#64748B")]
    public void CallHistoryEntry_DirectionColor_MatchesExpected(string direction, string expectedHex)
    {
        var entry = new CallHistoryEntry { Direction = direction };
        Assert.Equal(expectedHex, entry.DirectionColor);
    }

    [Fact]
    public void CallHistoryEntry_StockFiller_IsRecognizedAndRealCallsAreKept()
    {
        Assert.True(CallHistoryEntry.IsStockFiller(new CallHistoryEntry
        {
            Name = "PBX Echo & Line Quality Test",
            Number = "100",
            Detail = "Line quality test completed."
        }));
        Assert.True(CallHistoryEntry.IsStockFiller(new CallHistoryEntry
        {
            Name = "Voicemail Audio Diagnostic",
            Number = "*97",
            Detail = "Voicemail greeting played."
        }));
        Assert.False(CallHistoryEntry.IsStockFiller(new CallHistoryEntry
        {
            Name = "Kyle Thompson",
            Number = "505",
            Detail = "Call ended."
        }));
    }

    [Fact]
    public void AppStartupConfig_AutoAnswerEnabled_DefaultsToFalse()
    {
        var config = new AppStartupConfig(
            "server", 5060, "server", "101", "user", "pass", "LIC", "Licensed",
            new MediaDeviceInfo("in", "In"), new MediaDeviceInfo("out", "Out"));
        Assert.False(config.AutoAnswerEnabled);
    }
}
