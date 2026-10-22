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

    public async Task<IReadOnlyList<ContactEntry>> LoadAsync()
    {
        if (!File.Exists(_path))
        {
            return [];
        }

        try
        {
            await using var stream = new FileStream(_path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 4096, useAsync: true);
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
        try
        {
            await AtomicFileStorage.SaveAtomicAsync(_path, contacts.OrderBy(contact => contact.Name).ToList(), JsonOptions);
        }
        catch (Exception error)
        {
            DebugLog.Write($"CONTACTS save failed error={error.Message}");
        }
    }

    public ContactEntry? FindByNumber(IEnumerable<ContactEntry> contacts, string number)
    {
        var normalized = Normalize(number);
        if (string.IsNullOrEmpty(normalized)) return null;

        var variants = BuildVariants(normalized);
        return contacts.FirstOrDefault(contact =>
        {
            var contactNorm = Normalize(contact.Number);
            return variants.Contains(contactNorm) || contactNorm.EndsWith(normalized, StringComparison.Ordinal) || normalized.EndsWith(contactNorm, StringComparison.Ordinal);
        });
    }

    private static string Normalize(string value)
    {
        return new string(value.Where(char.IsDigit).ToArray());
    }

    private static HashSet<string> BuildVariants(string normalized)
    {
        var variants = new HashSet<string> { normalized };
        if (string.IsNullOrEmpty(normalized)) return variants;

        // UK +44
        if (normalized.StartsWith("44", StringComparison.Ordinal) && normalized.Length > 2)
        {
            variants.Add("0" + normalized[2..]);
        }
        else if (normalized.StartsWith("0", StringComparison.Ordinal) && normalized.Length > 1)
        {
            variants.Add("44" + normalized[1..]);
        }

        // US/CA +1
        if (normalized.StartsWith("1", StringComparison.Ordinal) && normalized.Length == 11)
        {
            variants.Add(normalized[1..]);
        }
        else if (normalized.Length == 10)
        {
            variants.Add("1" + normalized);
        }

        return variants;
    }
}
