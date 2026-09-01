using System.IO;
using System.Text.Json;
using MerlinSip.Models;

namespace MerlinSip.Services;

public sealed class ContactStore
{
    private readonly string _path = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MerlinSIP",
        "contacts.json");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private readonly SemaphoreSlim _saveLock = new(1, 1);

    public async Task<IReadOnlyList<ContactEntry>> LoadAsync()
    {
        if (!File.Exists(_path))
        {
            return [];
        }

        try
        {
            await using var stream = File.OpenRead(_path);
            return await JsonSerializer.DeserializeAsync<List<ContactEntry>>(stream) ?? [];
        }
        catch (Exception error)
        {
            DebugLog.Write($"CONTACTS load failed error={error.Message}");
            return [];
        }
    }

    public async Task SaveAsync(IEnumerable<ContactEntry> contacts)
    {
        ArgumentNullException.ThrowIfNull(contacts);

        await _saveLock.WaitAsync();
        try
        {
            var snapshot = contacts.OrderBy(contact => contact.Name, StringComparer.OrdinalIgnoreCase).ToList();
            await AtomicJsonFile.WriteAsync(_path, snapshot, JsonOptions);
        }
        catch (Exception error)
        {
            DebugLog.Write($"CONTACTS save failed error={error.Message}");
        }
        finally
        {
            _saveLock.Release();
        }
    }

    public ContactEntry? FindByNumber(IEnumerable<ContactEntry> contacts, string number)
    {
        ArgumentNullException.ThrowIfNull(contacts);
        ArgumentNullException.ThrowIfNull(number);

        var normalized = Normalize(number);
        var variants = BuildVariants(normalized);
        return contacts.FirstOrDefault(contact => variants.Contains(Normalize(contact.Number)));
    }

    private static string Normalize(string value)
    {
        return new string(value.Where(char.IsDigit).ToArray());
    }

    private static HashSet<string> BuildVariants(string normalized)
    {
        var variants = new HashSet<string> { normalized };
        if (normalized.StartsWith("44", StringComparison.Ordinal) && normalized.Length > 2)
        {
            variants.Add("0" + normalized[2..]);
        }
        else if (normalized.StartsWith("0", StringComparison.Ordinal) && normalized.Length > 1)
        {
            variants.Add("44" + normalized[1..]);
        }

        return variants;
    }
}
