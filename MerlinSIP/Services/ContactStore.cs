using System.IO;
using System.Text;
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

    public static async Task ExportCsvAsync(IEnumerable<ContactEntry> contacts, string filePath)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Name,Number,Company,Notes,IsFavorite");
        foreach (var c in contacts)
        {
            sb.AppendLine($"\"{EscapeCsv(c.Name)}\",\"{EscapeCsv(c.Number)}\",\"{EscapeCsv(c.Company)}\",\"{EscapeCsv(c.Notes)}\",{(c.IsFavorite ? "true" : "false")}");
        }
        await File.WriteAllTextAsync(filePath, sb.ToString(), Encoding.UTF8);
    }

    public static async Task<IReadOnlyList<ContactEntry>> ImportCsvAsync(string filePath)
    {
        if (!File.Exists(filePath)) return [];
        var lines = await File.ReadAllLinesAsync(filePath);
        var list = new List<ContactEntry>();
        bool first = true;
        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line)) continue;
            var parts = ParseCsvLine(line);
            if (first && parts.Count > 0 && parts[0].Equals("Name", StringComparison.OrdinalIgnoreCase))
            {
                first = false;
                continue;
            }
            first = false;
            if (parts.Count >= 2)
            {
                var name = parts[0].Trim();
                var number = parts[1].Trim();
                var company = parts.Count > 2 ? parts[2].Trim() : "";
                var notes = parts.Count > 3 ? parts[3].Trim() : "";
                var fav = parts.Count > 4 && bool.TryParse(parts[4].Trim(), out var f) && f;
                if (!string.IsNullOrEmpty(number))
                {
                    list.Add(new ContactEntry
                    {
                        Name = string.IsNullOrEmpty(name) ? number : name,
                        Number = number,
                        Company = company,
                        Notes = notes,
                        IsFavorite = fav
                    });
                }
            }
        }
        return list;
    }

    private static string EscapeCsv(string field) => field.Replace("\"", "\"\"");

    private static List<string> ParseCsvLine(string line)
    {
        var result = new List<string>();
        var current = new StringBuilder();
        bool inQuotes = false;
        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    current.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == ',' && !inQuotes)
            {
                result.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }
        result.Add(current.ToString());
        return result;
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
