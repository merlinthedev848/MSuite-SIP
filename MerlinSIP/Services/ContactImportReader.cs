using System.IO;
using System.Text;
using System.Xml.Linq;
using MerlinSip.Models;

namespace MerlinSip.Services;

public sealed class ContactImportSheet
{
    public IReadOnlyList<string> Columns { get; init; } = [];
    public IReadOnlyList<string[]> Rows { get; init; } = [];
    public bool Truncated { get; init; }
    public int NameColumn { get; init; } = -1;
    public int NumberColumn { get; init; } = -1;
    public int CompanyColumn { get; init; } = -1;
    public int NotesColumn { get; init; } = -1;
    public int FavoriteColumn { get; init; } = -1;
}

public sealed class ContactColumnMap
{
    public int Name { get; init; } = -1;
    public int Number { get; init; } = -1;
    public int Company { get; init; } = -1;
    public int Notes { get; init; } = -1;
    public int Favorite { get; init; } = -1;
}

public static class ContactImportReader
{
    public const int MaxRows = 10000;

    private static readonly string[] NameAliases = ["name", "fullname", "displayname", "contactname", "cn", "commonname"];
    private static readonly string[] NumberAliases = ["number", "phonenumber", "phone", "telephone", "tel", "telephonenumber", "mobile", "mobilenumber", "cell", "cellphone", "extension", "ext", "did", "businessphone", "workphone", "homephone"];
    private static readonly string[] CompanyAliases = ["company", "organization", "organisation", "org", "department", "dept", "business"];
    private static readonly string[] NotesAliases = ["notes", "note", "comment", "comments", "description", "memo", "info"];
    private static readonly string[] FavoriteAliases = ["favorite", "favourite", "isfavorite", "isfavourite", "speeddial", "starred"];

    public static ContactImportSheet Read(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            throw new FileNotFoundException("Choose a contact file that exists.", filePath);
        }

        var info = new FileInfo(filePath);
        if (info.Length > 20 * 1024 * 1024)
        {
            throw new InvalidDataException("That file is larger than 20 MB.");
        }

        var extension = Path.GetExtension(filePath);
        return extension.Equals(".xml", StringComparison.OrdinalIgnoreCase)
            ? ReadXml(filePath)
            : ReadCsv(filePath);
    }

    public static IReadOnlyList<ContactEntry> Map(ContactImportSheet sheet, ContactColumnMap map)
    {
        var contacts = new List<ContactEntry>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in sheet.Rows)
        {
            var number = Cell(row, map.Number);
            if (string.IsNullOrWhiteSpace(number) || !seen.Add(number))
            {
                continue;
            }

            var name = Cell(row, map.Name);
            contacts.Add(new ContactEntry
            {
                Name = string.IsNullOrWhiteSpace(name) ? number : name,
                Number = number,
                Company = Cell(row, map.Company),
                Notes = Cell(row, map.Notes),
                IsFavorite = IsFavorite(Cell(row, map.Favorite))
            });
        }

        return contacts;
    }

    private static ContactImportSheet ReadCsv(string filePath)
    {
        var lines = File.ReadAllLines(filePath);
        var firstContent = lines.FirstOrDefault(line => !string.IsNullOrWhiteSpace(line)) ?? "";
        var delimiter = DetectDelimiter(firstContent);
        var parsed = new List<List<string>>();
        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            parsed.Add(ParseDelimitedLine(line, delimiter));
            if (parsed.Count > MaxRows + 1)
            {
                break;
            }
        }

        if (parsed.Count == 0)
        {
            return new ContactImportSheet();
        }

        var header = parsed[0];
        var hasHeader = LooksLikeHeader(header);
        var columns = hasHeader
            ? header.Select((cell, index) => string.IsNullOrWhiteSpace(cell) ? $"Column {index + 1}" : cell.Trim()).ToList()
            : Enumerable.Range(1, header.Count).Select(index => $"Column {index}").ToList();
        var data = hasHeader ? parsed.Skip(1) : parsed;
        var width = columns.Count;
        var truncated = false;
        var rows = new List<string[]>();
        foreach (var source in data)
        {
            if (rows.Count >= MaxRows)
            {
                truncated = true;
                break;
            }

            var row = new string[width];
            for (var index = 0; index < width; index++)
            {
                row[index] = index < source.Count ? source[index].Trim() : "";
            }

            rows.Add(row);
        }

        return Finish(columns, rows, truncated);
    }

    private static ContactImportSheet ReadXml(string filePath)
    {
        var document = XDocument.Load(filePath);
        var records = document
            .Descendants()
            .Where(IsRecord)
            .GroupBy(element => element.Name.LocalName)
            .OrderByDescending(group => group.Count())
            .FirstOrDefault()
            ?.ToList() ?? [];

        var columnOrder = new List<string>();
        var maps = new List<Dictionary<string, string>>();
        var truncated = false;
        foreach (var record in records)
        {
            if (maps.Count >= MaxRows)
            {
                truncated = true;
                break;
            }

            var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            void Add(string name, string value)
            {
                if (string.IsNullOrWhiteSpace(name))
                {
                    return;
                }

                counts.TryGetValue(name, out var seen);
                seen++;
                counts[name] = seen;
                var key = seen == 1 ? name : $"{name} {seen}";
                if (!columnOrder.Contains(key, StringComparer.OrdinalIgnoreCase))
                {
                    columnOrder.Add(key);
                }

                map[key] = value.Trim();
            }

            foreach (var attribute in record.Attributes())
            {
                Add(attribute.Name.LocalName, attribute.Value);
            }

            foreach (var child in record.Elements())
            {
                if (!child.HasElements)
                {
                    Add(child.Name.LocalName, child.Value);
                    continue;
                }

                foreach (var grandchild in child.Elements().Where(element => !element.HasElements))
                {
                    Add($"{child.Name.LocalName} {grandchild.Name.LocalName}", grandchild.Value);
                }
            }

            maps.Add(map);
        }

        var rows = maps.Select(map => columnOrder.Select(column => map.TryGetValue(column, out var value) ? value : "").ToArray()).ToList();
        return Finish(columnOrder, rows, truncated);
    }

    private static ContactImportSheet Finish(List<string> columns, List<string[]> rows, bool truncated)
    {
        var firstName = FindColumn(columns, "firstname", "givenname");
        var lastName = FindColumn(columns, "lastname", "surname", "familyname");
        if (firstName >= 0 && lastName >= 0)
        {
            columns.Add("First name + Last name");
            for (var index = 0; index < rows.Count; index++)
            {
                var row = rows[index];
                var combined = $"{Cell(row, firstName)} {Cell(row, lastName)}".Trim();
                rows[index] = row.Append(combined).ToArray();
            }
        }

        return new ContactImportSheet
        {
            Columns = columns,
            Rows = rows,
            Truncated = truncated,
            NameColumn = FindColumn(columns, NameAliases.Append("firstnamelastname").ToArray()),
            NumberColumn = FindColumn(columns, NumberAliases),
            CompanyColumn = FindColumn(columns, CompanyAliases),
            NotesColumn = FindColumn(columns, NotesAliases),
            FavoriteColumn = FindColumn(columns, FavoriteAliases)
        };
    }

    private static bool IsRecord(XElement element)
    {
        return element.Attributes().Any(attribute => !attribute.IsNamespaceDeclaration) ||
            element.Elements().Any(child => !child.HasElements);
    }

    private static bool LooksLikeHeader(IReadOnlyList<string> cells)
    {
        var known = NameAliases
            .Concat(NumberAliases)
            .Concat(CompanyAliases)
            .Concat(NotesAliases)
            .Concat(FavoriteAliases)
            .Concat(["firstname", "givenname", "lastname", "surname", "familyname"])
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return cells.Any(cell => known.Contains(NormalizeHeader(cell)));
    }

    private static int FindColumn(IReadOnlyList<string> columns, params string[] aliases)
    {
        var wanted = aliases.Select(NormalizeHeader).ToHashSet(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < columns.Count; index++)
        {
            if (wanted.Contains(NormalizeHeader(columns[index])))
            {
                return index;
            }
        }

        return -1;
    }

    private static string NormalizeHeader(string value)
    {
        var builder = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToLowerInvariant(character));
            }
        }

        return builder.ToString();
    }

    private static char DetectDelimiter(string line)
    {
        var commas = 0;
        var semicolons = 0;
        var tabs = 0;
        var quoted = false;
        foreach (var character in line)
        {
            if (character == '"')
            {
                quoted = !quoted;
                continue;
            }

            if (quoted)
            {
                continue;
            }

            switch (character)
            {
                case ',': commas++; break;
                case ';': semicolons++; break;
                case '\t': tabs++; break;
            }
        }

        if (semicolons > commas && semicolons >= tabs)
        {
            return ';';
        }

        if (tabs > commas && tabs > semicolons)
        {
            return '\t';
        }

        return ',';
    }

    private static List<string> ParseDelimitedLine(string line, char delimiter)
    {
        var result = new List<string>();
        var current = new StringBuilder();
        var quoted = false;
        for (var index = 0; index < line.Length; index++)
        {
            var character = line[index];
            if (character == '"')
            {
                if (quoted && index + 1 < line.Length && line[index + 1] == '"')
                {
                    current.Append('"');
                    index++;
                }
                else
                {
                    quoted = !quoted;
                }
            }
            else if (character == delimiter && !quoted)
            {
                result.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(character);
            }
        }

        result.Add(current.ToString());
        return result;
    }

    private static string Cell(string[] row, int index)
    {
        return index >= 0 && index < row.Length ? row[index].Trim() : "";
    }

    private static bool IsFavorite(string value)
    {
        return value.Equals("true", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("yes", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("y", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("1", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("favorite", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("favourite", StringComparison.OrdinalIgnoreCase);
    }
}
